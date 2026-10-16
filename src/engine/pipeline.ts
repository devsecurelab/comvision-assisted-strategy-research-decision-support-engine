// 9-Stage Deterministic Validation Pipeline Controller
// Strategy v1.0-FROZEN Master Specification (EXP-2026-001)
// Mode: Research / Decision-Support / Manual Alert Only
// Architectural Boundary: Strictly Non-Execution
import { createHash } from 'node:crypto';

import {
  Candle,
  MasterTelemetry,
  NewsEvent,
  PressureObservation,
  SwingPoint,
  Timeframe,
  DataQuality,
  DataProvenance,
  OrderBlock,
  FVGZone,
  BosState,
  ChochState,
  IfvgState,
  BprState,
  BreakerState,
  BslSslState,
  LiquidityPool,
  OteState,
  MomentumStateInfo,
  SessionContext,
  MarketSession,
  KillZoneState,
  NextCandleObservation,
} from './types';
import { ACTIVE_STRATEGY_VERSION, ACTIVE_EXPERIMENT_ID, CONFIG_HASH } from './manifest';
import { formatSignalTime } from '../utils/timeFormat';
import { evaluateStrategyV3 } from './strategyV3Engine';
import { classifySessionAndKillZone } from './session';
import { deriveHtfBias, MIN_ENGINE_CANDLES } from './strategyV3Engine';
import { timeframeMs, validateCandleSeries } from './dataIntegrity';
import { isFxMarketClosed } from './marketHours';

export interface PipelineInput {
  /** V3 is authoritative; V2 is retained only for explicit historical fixtures. */
  decisionEngineVersion?: 'V2' | 'V3';
  candles: Candle[]; // historical candle sequence, ordered oldest to newest
  currentCandleIndex: number; // index of currently forming / closed confirmation candle (C3)
  selectedTimeframe: Timeframe;
  higherTimeframeBias?: 'BULLISH' | 'BEARISH' | 'UNCLEAR';
  newsEvents: NewsEvent[];
  newsSourceOnline: boolean;
  dataProvenance?: DataProvenance;
  provider?: 'TWELVE_DATA' | 'ALPHA_VANTAGE';
  pair?: string;
  asset?: string;
  liveTickPressure?: {
    classification: 'ALIGNED' | 'NEUTRAL' | 'OPPOSITE' | 'UNCERTAIN';
    magnitude: 'LOW' | 'MEDIUM' | 'HIGH';
    consistency: 'LOW' | 'MEDIUM' | 'HIGH';
    speedPxPerSec?: number;
  };
  customSettings?: {
    maxWickRatio?: number;
    fibEquilibriumLevel?: number;
  };
  payoutPct?: number;
  payoutSetAt?: string;
  /** Closed 1h candles; when supplied the engine derives HTF bias itself from the latest closed 1h structure. */
  htfCandles?: Candle[];
  /** Wall-clock used for the forming-candle check. Live callers pass Date.now(); R8 passes the causal replay clock. */
  nowMs?: number;
}

export const MIN_PAYOUT_PCT = 85;

const deterministicSetupId = (pair: string, timeframe: Timeframe, signalTimestamp: string, engine: string) =>
  `V3-${createHash('sha256').update(`${pair}|${timeframe}|${signalTimestamp}|${engine}`).digest('hex').slice(0, 20)}`;

/**
 * Stage 1: Market Structure (5-Candle Symmetric Fractal)
 * Evaluates Swing Highs and Swing Lows with symmetric window N=2 Left, N=2 Right.
 * Swing at index t confirmed ONLY at close of candle t+2. No lookahead.
 */
export function detectFractalSwings(candles: Candle[], upToConfirmedIndex: number): SwingPoint[] {
  const swings: SwingPoint[] = [];

  for (let t = 2; t <= upToConfirmedIndex - 2; t++) {
    const c = candles[t];
    const prev1 = candles[t - 1];
    const prev2 = candles[t - 2];
    const next1 = candles[t + 1];
    const next2 = candles[t + 2];

    const isSwingHigh =
      c.high > prev1.high &&
      c.high > prev2.high &&
      c.high > next1.high &&
      c.high > next2.high;

    const isSwingLow =
      c.low < prev1.low &&
      c.low < prev2.low &&
      c.low < next1.low &&
      c.low < next2.low;

    if (isSwingHigh) {
      swings.push({
        index: t,
        timestamp: c.timestamp,
        type: 'HIGH',
        price: c.high,
        confirmedAtTimestamp: next2.timestamp,
      });
    }

    if (isSwingLow) {
      swings.push({
        index: t,
        timestamp: c.timestamp,
        type: 'LOW',
        price: c.low,
        confirmedAtTimestamp: next2.timestamp,
      });
    }
  }

  return swings;
}

export function evaluateMarketStructure(swings: SwingPoint[]): {
  bias: 'BULLISH' | 'BEARISH' | 'UNCLEAR';
  recentSwingHigh?: SwingPoint;
  recentSwingLow?: SwingPoint;
  prevSwingHigh?: SwingPoint;
  prevSwingLow?: SwingPoint;
} {
  const highs = swings.filter((s) => s.type === 'HIGH');
  const lows = swings.filter((s) => s.type === 'LOW');

  if (highs.length < 2 || lows.length < 2) {
    return { bias: 'UNCLEAR' };
  }

  const sh_n = highs[highs.length - 1];
  const sh_prev = highs[highs.length - 2];
  const sl_n = lows[lows.length - 1];
  const sl_prev = lows[lows.length - 2];

  if (sh_n.price > sh_prev.price && sl_n.price > sl_prev.price) {
    return {
      bias: 'BULLISH',
      recentSwingHigh: sh_n,
      recentSwingLow: sl_n,
      prevSwingHigh: sh_prev,
      prevSwingLow: sl_prev,
    };
  }

  if (sh_n.price < sh_prev.price && sl_n.price < sl_prev.price) {
    return {
      bias: 'BEARISH',
      recentSwingHigh: sh_n,
      recentSwingLow: sl_n,
      prevSwingHigh: sh_prev,
      prevSwingLow: sl_prev,
    };
  }

  return {
    bias: 'UNCLEAR',
    recentSwingHigh: sh_n,
    recentSwingLow: sl_n,
    prevSwingHigh: sh_prev,
    prevSwingLow: sl_prev,
  };
}

/**
 * Stage 2: Break of Structure (BOS)
 * Bullish BOS: Close(current) > PreviousConfirmedSwingHigh (Candle body close strictly required).
 * Bearish BOS: Close(current) < PreviousConfirmedSwingLow (Candle body close strictly required).
 * Wick-only break (High > SwingHigh and Close <= SwingHigh) is NOT BOS.
 */
export function evaluateBOS(
  currentCandle: Candle,
  currentIdx: number,
  recentSwingHigh?: SwingPoint,
  recentSwingLow?: SwingPoint
): BosState {
  if (!recentSwingHigh && !recentSwingLow) {
    return {
      bos_detected: false,
      bos_direction: 'NONE',
      bos_body_close_confirmed: false,
      status: 'INCONCLUSIVE',
      reason: 'No confirmed structural swing points available for BOS evaluation',
    };
  }

  // Bullish BOS Check
  if (recentSwingHigh) {
    const bodyClosedAbove = currentCandle.close > recentSwingHigh.price;
    if (bodyClosedAbove) {
      return {
        bos_detected: true,
        bos_direction: 'BULLISH',
        bos_reference_level: recentSwingHigh.price,
        bos_confirmation_timestamp: currentCandle.timestamp,
        bos_confirmation_candle: currentIdx,
        bos_body_close_confirmed: true,
        status: 'PASS',
        reason: `Bullish BOS confirmed: Close (${currentCandle.close}) broke above confirmed Swing High (${recentSwingHigh.price})`,
      };
    }
  }

  // Bearish BOS Check
  if (recentSwingLow) {
    const bodyClosedBelow = currentCandle.close < recentSwingLow.price;
    if (bodyClosedBelow) {
      return {
        bos_detected: true,
        bos_direction: 'BEARISH',
        bos_reference_level: recentSwingLow.price,
        bos_confirmation_timestamp: currentCandle.timestamp,
        bos_confirmation_candle: currentIdx,
        bos_body_close_confirmed: true,
        status: 'PASS',
        reason: `Bearish BOS confirmed: Close (${currentCandle.close}) broke below confirmed Swing Low (${recentSwingLow.price})`,
      };
    }
  }

  return {
    bos_detected: false,
    bos_direction: 'NONE',
    bos_body_close_confirmed: false,
    status: 'PASS', // Not breaking structure is not a rejection if in continuation
    reason: 'Price within structural swing boundaries; no BOS breakout observed',
  };
}

/**
 * Stage 3: Change of Character (CHoCH)
 * Bullish CHoCH: When previous structural trend was bearish (LH, LL) and price closes above the relevant confirmed LH.
 * Bearish CHoCH: When previous structural trend was bullish (HH, HL) and price closes below the relevant confirmed HL.
 */
export function evaluateCHoCH(
  currentCandle: Candle,
  swings: SwingPoint[],
  prevStructuralBias: 'BULLISH' | 'BEARISH' | 'UNCLEAR'
): ChochState {
  const highs = swings.filter((s) => s.type === 'HIGH');
  const lows = swings.filter((s) => s.type === 'LOW');

  if (highs.length === 0 || lows.length === 0) {
    return {
      choch_status: 'NO_CHoCH',
      status: 'PASS',
      reason: 'Insufficient swing history for CHoCH evaluation',
    };
  }

  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  // Bullish CHoCH: was bearish, now body closes above the confirmed lower high
  if (prevStructuralBias === 'BEARISH' && currentCandle.close > lastHigh.price) {
    return {
      choch_status: 'BULLISH_CHoCH',
      choch_direction: 'BULLISH',
      choch_reference_level: lastHigh.price,
      choch_confirmation_timestamp: currentCandle.timestamp,
      status: 'PASS',
      reason: `Bullish CHoCH confirmed: Closed (${currentCandle.close}) above bearish structural Lower High (${lastHigh.price})`,
    };
  }

  // Bearish CHoCH: was bullish, now body closes below the confirmed higher low
  if (prevStructuralBias === 'BULLISH' && currentCandle.close < lastLow.price) {
    return {
      choch_status: 'BEARISH_CHoCH',
      choch_direction: 'BEARISH',
      choch_reference_level: lastLow.price,
      choch_confirmation_timestamp: currentCandle.timestamp,
      status: 'PASS',
      reason: `Bearish CHoCH confirmed: Closed (${currentCandle.close}) below bullish structural Higher Low (${lastLow.price})`,
    };
  }

  return {
    choch_status: 'NO_CHoCH',
    status: 'PASS',
    reason: 'Market structure character unchanged',
  };
}

/**
 * Stage 4: Fair Value Gap (FVG)
 * Bullish: Low(C3) > High(C1) => Zone: [High(C1), Low(C3)]
 * Bearish: High(C3) < Low(C1) => Zone: [High(C3), Low(C1)]
 */
export function detectFVG(
  c1: Candle,
  c2: Candle,
  c3: Candle
): { detected: boolean; fvg?: FVGZone; direction?: 'BULLISH' | 'BEARISH' } {
  // Bullish FVG: Low of C3 is strictly above High of C1
  if (c3.low > c1.high) {
    return {
      detected: true,
      direction: 'BULLISH',
      fvg: {
        top: c3.low,
        bottom: c1.high,
        creationTimestamp: c3.timestamp,
        mitigationState: 'UNMITIGATED',
        direction: 'BULLISH',
      },
    };
  }

  // Bearish FVG: High of C3 is strictly below Low of C1
  if (c3.high < c1.low) {
    return {
      detected: true,
      direction: 'BEARISH',
      fvg: {
        top: c1.low,
        bottom: c3.high,
        creationTimestamp: c3.timestamp,
        mitigationState: 'UNMITIGATED',
        direction: 'BEARISH',
      },
    };
  }

  return { detected: false };
}

/**
 * Stage 5: Inverse Fair Value Gap (IFVG)
 * State-based: An existing FVG becomes an IFVG when subsequent price closes decisively through its boundary.
 * Bullish FVG invalidated when Close < FVG_LOW. Symmetrically for Bearish FVG when Close > FVG_HIGH.
 */
export function evaluateIFVG(
  currentCandle: Candle,
  priorFVGs: FVGZone[]
): IfvgState {
  if (!priorFVGs || priorFVGs.length === 0) {
    return {
      ifvg_status: 'NONE',
      status: 'PASS',
      reason: 'No prior FVG zones available for IFVG inversion tracking',
    };
  }

  for (let i = priorFVGs.length - 1; i >= 0; i--) {
    const fvg = priorFVGs[i];
    // Bullish FVG broken downward by body close -> Bearish IFVG
    if (fvg.direction === 'BULLISH' && currentCandle.close < fvg.bottom) {
      return {
        ifvg_status: 'IFVG_CONFIRMED',
        ifvg_direction: 'BEARISH',
        invalidation_boundary: fvg.bottom,
        original_fvg_zone: [fvg.bottom, fvg.top],
        confirmation_timestamp: currentCandle.timestamp,
        status: 'PASS',
        reason: `Bearish IFVG confirmed: Price closed below Bullish FVG boundary (${fvg.bottom})`,
      };
    }

    // Bearish FVG broken upward by body close -> Bullish IFVG
    if (fvg.direction === 'BEARISH' && currentCandle.close > fvg.top) {
      return {
        ifvg_status: 'IFVG_CONFIRMED',
        ifvg_direction: 'BULLISH',
        invalidation_boundary: fvg.top,
        original_fvg_zone: [fvg.bottom, fvg.top],
        confirmation_timestamp: currentCandle.timestamp,
        status: 'PASS',
        reason: `Bullish IFVG confirmed: Price closed above Bearish FVG boundary (${fvg.top})`,
      };
    }
  }

  return {
    ifvg_status: 'STANDARD_FVG',
    status: 'PASS',
    reason: 'Standard active FVG; no boundary inversion detected',
  };
}

/**
 * Stage 6: Balanced Price Range (BPR)
 * Deterministic overlap between opposing imbalance zones:
 * Overlap zone: [max(BullishFVG.bottom, BearishFVG.bottom), min(BullishFVG.top, BearishFVG.top)]
 * If overlap_size > 0 => BPR confirmed.
 */
export function detectBPR(bullishFVGs: FVGZone[], bearishFVGs: FVGZone[]): BprState {
  if (bullishFVGs.length === 0 || bearishFVGs.length === 0) {
    return {
      bpr_status: 'NONE',
      status: 'PASS',
      reason: 'Insufficient opposing FVGs to form a Balanced Price Range',
    };
  }

  const latestBullish = bullishFVGs[bullishFVGs.length - 1];
  const latestBearish = bearishFVGs[bearishFVGs.length - 1];

  const zoneLow = Math.max(latestBullish.bottom, latestBearish.bottom);
  const zoneHigh = Math.min(latestBullish.top, latestBearish.top);

  if (zoneHigh > zoneLow) {
    const overlapSize = zoneHigh - zoneLow;
    return {
      bpr_status: 'BPR_CONFIRMED',
      bpr_direction: 'BALANCED',
      bpr_zone_high: zoneHigh,
      bpr_zone_low: zoneLow,
      bpr_overlap_size: overlapSize,
      bpr_source_fvg_1: [latestBullish.bottom, latestBullish.top],
      bpr_source_fvg_2: [latestBearish.bottom, latestBearish.top],
      status: 'PASS',
      reason: `Balanced Price Range confirmed: Overlap zone [${zoneLow.toFixed(5)}, ${zoneHigh.toFixed(5)}] (size: ${overlapSize.toFixed(5)})`,
    };
  }

  return {
    bpr_status: 'NONE',
    status: 'PASS',
    reason: 'No price overlap between opposing FVG zones',
  };
}

/**
 * Stage 7: Order Block (OB)
 * Bullish OB: Last down-close candle immediately preceding bullish displacement.
 * Bearish OB: Last up-close candle immediately preceding bearish displacement.
 */
export function detectOrderBlock(
  candles: Candle[],
  displacementStartIndex: number,
  direction: 'BULLISH' | 'BEARISH'
): OrderBlock | null {
  for (let i = displacementStartIndex - 1; i >= Math.max(0, displacementStartIndex - 6); i--) {
    const c = candles[i];
    if (direction === 'BULLISH' && c.close < c.open) {
      return {
        top: c.high,
        bottom: c.low,
        candleIndex: i,
        direction: 'BULLISH',
        timestamp: c.timestamp,
      };
    }
    if (direction === 'BEARISH' && c.close > c.open) {
      return {
        top: c.high,
        bottom: c.low,
        candleIndex: i,
        direction: 'BEARISH',
        timestamp: c.timestamp,
      };
    }
  }
  return null;
}

/**
 * Stage 8: Breaker Block
 * State transition of an existing OB that failed after liquidity/structure invalidation.
 * Bullish OB fails after bearish displacement below its bottom boundary.
 * Bearish OB fails after bullish displacement above its top boundary.
 */
export function evaluateBreakerBlock(
  currentCandle: Candle,
  priorOBs: OrderBlock[]
): BreakerState {
  if (!priorOBs || priorOBs.length === 0) {
    return {
      breaker_status: 'NO_BREAKER',
      status: 'PASS',
      reason: 'No prior Order Blocks to evaluate for Breaker transition',
    };
  }

  for (let i = priorOBs.length - 1; i >= 0; i--) {
    const ob = priorOBs[i];
    // Bullish OB broken downward -> Bearish Breaker Block
    if (ob.direction === 'BULLISH' && currentCandle.close < ob.bottom) {
      return {
        breaker_status: 'BREAKER_CONFIRMED',
        breaker_direction: 'BEARISH',
        source_ob_id: `OB-${ob.candleIndex}`,
        breaker_zone: [ob.bottom, ob.top],
        invalidation_level: ob.bottom,
        confirmation_timestamp: currentCandle.timestamp,
        status: 'PASS',
        reason: `Bearish Breaker Block confirmed: Closed below Bullish OB bottom (${ob.bottom})`,
      };
    }

    // Bearish OB broken upward -> Bullish Breaker Block
    if (ob.direction === 'BEARISH' && currentCandle.close > ob.top) {
      return {
        breaker_status: 'BREAKER_CONFIRMED',
        breaker_direction: 'BULLISH',
        source_ob_id: `OB-${ob.candleIndex}`,
        breaker_zone: [ob.bottom, ob.top],
        invalidation_level: ob.top,
        confirmation_timestamp: currentCandle.timestamp,
        status: 'PASS',
        reason: `Bullish Breaker Block confirmed: Closed above Bearish OB top (${ob.top})`,
      };
    }
  }

  return {
    breaker_status: 'NO_BREAKER',
    status: 'PASS',
    reason: 'Order Blocks remain intact; no breaker transition',
  };
}

/**
 * Stage 9: Liquidity Sweep Evaluation
 * Bullish-side sweep: High > PriorSwingHigh && Close <= PriorSwingHigh
 * Bearish-side sweep: Low < PriorSwingLow && Close >= PriorSwingLow
 */
export function evaluateLiquiditySweep(
  currentCandle: Candle,
  recentSwingHigh?: SwingPoint,
  recentSwingLow?: SwingPoint,
  bias?: 'BULLISH' | 'BEARISH' | 'UNCLEAR'
): { status: 'VALID_BREAKOUT' | 'SWEEP_DETECTED' | 'NOT_TESTING'; testedLevel?: number; reason?: string } {
  if (bias === 'BULLISH' && recentSwingHigh) {
    if (currentCandle.high > recentSwingHigh.price) {
      if (currentCandle.close <= recentSwingHigh.price) {
        return {
          status: 'SWEEP_DETECTED',
          testedLevel: recentSwingHigh.price,
          reason: `Wick pierced prior Swing High (${recentSwingHigh.price}) but closed below. Liquidity sweep detected.`,
        };
      }
      return {
        status: 'VALID_BREAKOUT',
        testedLevel: recentSwingHigh.price,
        reason: `Candle closed above prior Swing High (${recentSwingHigh.price}). Valid structural expansion.`,
      };
    }
  }

  if (bias === 'BEARISH' && recentSwingLow) {
    if (currentCandle.low < recentSwingLow.price) {
      if (currentCandle.close >= recentSwingLow.price) {
        return {
          status: 'SWEEP_DETECTED',
          testedLevel: recentSwingLow.price,
          reason: `Wick pierced prior Swing Low (${recentSwingLow.price}) but closed above. Liquidity sweep detected.`,
        };
      }
      return {
        status: 'VALID_BREAKOUT',
        testedLevel: recentSwingLow.price,
        reason: `Candle closed below prior Swing Low (${recentSwingLow.price}). Valid structural expansion.`,
      };
    }
  }

  return {
    status: 'NOT_TESTING',
    reason: 'Price did not test immediate prior swing liquidity level.',
  };
}

/**
 * Stage 10 & 11: BSL / SSL Liquidity Pools & Target Mapping (Strategy v2.0-FROZEN)
 * 
 * Exact Deterministic Rules:
 * 1. Equality Tolerance: ΔP = abs(P1 - P2) / currentPrice <= 0.0008 (8 pips relative per EUR/USD 1.0000 base).
 * 2. Minimum Touches:
 *    - EQUAL_HIGHS / EQUAL_LOWS pool requires minimum 2 touches (touch_count >= 2).
 *    - SWING_HIGH / SWING_LOW requires 1 confirmed fractal swing point (touch_count >= 1).
 * 3. Merge Distance:
 *    - If two pool levels are within merge_distance (ΔP / level <= 0.0004), merge into single consolidated pool.
 *    - Level = max(P1, P2) for BSL, min(P1, P2) for SSL; touch_count = count1 + count2.
 * 4. Qualification Criteria:
 *    - BSL pool qualified if level > currentPrice and unmitigated.
 *    - SSL pool qualified if level < currentPrice and unmitigated.
 * 5. Invalidation Conditions:
 *    - BSL invalidated if any candle Close > BSL level (swept and closed above).
 *    - SSL invalidated if any candle Close < SSL level (swept and closed below).
 */
export function detectLiquidityPools(
  candles: Candle[],
  currentPrice: number,
  swings: SwingPoint[],
  bias?: 'BULLISH' | 'BEARISH' | 'UNCLEAR'
): BslSslState {
  const raw_bsl_pools: LiquidityPool[] = [];
  const raw_ssl_pools: LiquidityPool[] = [];

  const highs = swings.filter((s) => s.type === 'HIGH');
  const lows = swings.filter((s) => s.type === 'LOW');

  const EQUALITY_TOLERANCE = 0.0008;
  const MERGE_DISTANCE = 0.0004;

  // 1. Equal Highs Detection (touch_count >= 2)
  const pairedHighIndices = new Set<number>();
  for (let i = 0; i < highs.length - 1; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const h1 = highs[i];
      const h2 = highs[j];
      const diff = Math.abs(h1.price - h2.price) / currentPrice;
      if (diff <= EQUALITY_TOLERANCE) {
        pairedHighIndices.add(i);
        pairedHighIndices.add(j);
        const level = Math.max(h1.price, h2.price);
        raw_bsl_pools.push({
          liquidity_type: 'BSL',
          level,
          source: 'EQUAL_HIGHS',
          timestamp: h2.timestamp,
          distance_from_price: level - currentPrice,
          strength: 'HIGH',
          touch_count: 2,
          equality_tolerance_pips: diff * 10000,
          merge_distance_pips: MERGE_DISTANCE * 10000,
          is_qualified: level > currentPrice,
          is_invalidated: false,
        });
      }
    }
  }

  // 2. Standard Swing Highs as BSL (touch_count = 1)
  highs.forEach((h, idx) => {
    if (!pairedHighIndices.has(idx)) {
      raw_bsl_pools.push({
        liquidity_type: 'BSL',
        level: h.price,
        source: 'SWING_HIGH',
        timestamp: h.timestamp,
        distance_from_price: h.price - currentPrice,
        strength: 'STANDARD',
        touch_count: 1,
        equality_tolerance_pips: 0,
        merge_distance_pips: MERGE_DISTANCE * 10000,
        is_qualified: h.price > currentPrice,
        is_invalidated: false,
      });
    }
  });

  // 3. Equal Lows Detection (touch_count >= 2)
  const pairedLowIndices = new Set<number>();
  for (let i = 0; i < lows.length - 1; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const l1 = lows[i];
      const l2 = lows[j];
      const diff = Math.abs(l1.price - l2.price) / currentPrice;
      if (diff <= EQUALITY_TOLERANCE) {
        pairedLowIndices.add(i);
        pairedLowIndices.add(j);
        const level = Math.min(l1.price, l2.price);
        raw_ssl_pools.push({
          liquidity_type: 'SSL',
          level,
          source: 'EQUAL_LOWS',
          timestamp: l2.timestamp,
          distance_from_price: currentPrice - level,
          strength: 'HIGH',
          touch_count: 2,
          equality_tolerance_pips: diff * 10000,
          merge_distance_pips: MERGE_DISTANCE * 10000,
          is_qualified: level < currentPrice,
          is_invalidated: false,
        });
      }
    }
  }

  // 4. Standard Swing Lows as SSL (touch_count = 1)
  lows.forEach((l, idx) => {
    if (!pairedLowIndices.has(idx)) {
      raw_ssl_pools.push({
        liquidity_type: 'SSL',
        level: l.price,
        source: 'SWING_LOW',
        timestamp: l.timestamp,
        distance_from_price: currentPrice - l.price,
        strength: 'STANDARD',
        touch_count: 1,
        equality_tolerance_pips: 0,
        merge_distance_pips: MERGE_DISTANCE * 10000,
        is_qualified: l.price < currentPrice,
        is_invalidated: false,
      });
    }
  });

  // 5. Invalidation Check: candle close beyond level invalidates the pool
  const checkInvalidation = (pool: LiquidityPool): boolean => {
    if (pool.liquidity_type === 'BSL') {
      return candles.some((c) => c.close > pool.level);
    } else {
      return candles.some((c) => c.close < pool.level);
    }
  };

  raw_bsl_pools.forEach((p) => {
    p.is_invalidated = checkInvalidation(p);
  });
  raw_ssl_pools.forEach((p) => {
    p.is_invalidated = checkInvalidation(p);
  });

  // 6. Merge Distance Consolidation (pools within MERGE_DISTANCE of each other)
  const consolidatePools = (pools: LiquidityPool[], type: 'BSL' | 'SSL'): LiquidityPool[] => {
    const sorted = [...pools].sort((a, b) => (type === 'BSL' ? a.level - b.level : b.level - a.level));
    const merged: LiquidityPool[] = [];

    for (const pool of sorted) {
      if (merged.length === 0) {
        merged.push({ ...pool });
        continue;
      }
      const last = merged[merged.length - 1];
      const distance = Math.abs(pool.level - last.level) / currentPrice;

      if (distance <= MERGE_DISTANCE) {
        // Merge into consolidated pool
        last.level = type === 'BSL' ? Math.max(last.level, pool.level) : Math.min(last.level, pool.level);
        last.touch_count = (last.touch_count || 1) + (pool.touch_count || 1);
        last.strength = 'HIGH';
        last.source = 'EQUAL_HIGHS';
        last.distance_from_price = Math.abs(last.level - currentPrice);
        last.is_invalidated = last.is_invalidated || pool.is_invalidated;
      } else {
        merged.push({ ...pool });
      }
    }
    return merged;
  };

  const consolidated_bsl = consolidatePools(raw_bsl_pools, 'BSL');
  const consolidated_ssl = consolidatePools(raw_ssl_pools, 'SSL');

  // Filter only qualified and non-invalidated pools for active target mapping
  const active_bsl = consolidated_bsl
    .filter((p) => p.is_qualified && !p.is_invalidated)
    .sort((a, b) => Math.abs(a.distance_from_price) - Math.abs(b.distance_from_price));

  const active_ssl = consolidated_ssl
    .filter((p) => p.is_qualified && !p.is_invalidated)
    .sort((a, b) => Math.abs(a.distance_from_price) - Math.abs(b.distance_from_price));

  const nearest_bsl = active_bsl[0] || consolidated_bsl[0];
  const nearest_ssl = active_ssl[0] || consolidated_ssl[0];

  let selected_liquidity_target: 'BSL_TARGET' | 'SSL_TARGET' | 'BOTH' | 'NONE' | 'UNCERTAIN' = 'NONE';
  let target_distance: number | undefined;
  let target_source: string | undefined;

  if (bias === 'BULLISH' && nearest_bsl) {
    selected_liquidity_target = 'BSL_TARGET';
    target_distance = nearest_bsl.distance_from_price;
    target_source = `${nearest_bsl.source} @ ${nearest_bsl.level.toFixed(5)} (${nearest_bsl.touch_count || 1} touches)`;
  } else if (bias === 'BEARISH' && nearest_ssl) {
    selected_liquidity_target = 'SSL_TARGET';
    target_distance = nearest_ssl.distance_from_price;
    target_source = `${nearest_ssl.source} @ ${nearest_ssl.level.toFixed(5)} (${nearest_ssl.touch_count || 1} touches)`;
  } else if (nearest_bsl && nearest_ssl) {
    selected_liquidity_target = 'BOTH';
  }

  return {
    bsl_pools: active_bsl.slice(0, 5),
    ssl_pools: active_ssl.slice(0, 5),
    nearest_bsl,
    nearest_ssl,
    selected_liquidity_target,
    target_distance,
    target_source,
    equality_tolerance_percent: EQUALITY_TOLERANCE * 100,
    min_touches_pool: 2,
    merge_distance_percent: MERGE_DISTANCE * 100,
    status: 'PASS',
  };
}

/**
 * Stage 12: Discount / Premium (Fib 50%)
 * Bullish setup: FVG_HIGH < Fib50 (must be in Discount). Touch/cross => REJECT.
 * Bearish setup: FVG_LOW > Fib50 (must be in Premium). Touch/cross => REJECT.
 */
export function evaluateDiscountPremium(
  fvgZone: FVGZone,
  swingHigh: number,
  swingLow: number,
  bias: 'BULLISH' | 'BEARISH',
  fibEqLevel: number = 0.50
): { status: 'PASS_DISCOUNT' | 'PASS_PREMIUM' | 'REJECT'; fib50Level: number; reason: string } {
  const localRange = Math.abs(swingHigh - swingLow);
  const fib50 = swingLow + fibEqLevel * localRange;

  if (bias === 'BULLISH') {
    if (fvgZone.top < fib50) {
      return {
        status: 'PASS_DISCOUNT',
        fib50Level: fib50,
        reason: `Bullish FVG top (${fvgZone.top}) is strictly below Fib ${fibEqLevel * 100}% (${fib50}). Valid Discount zone.`,
      };
    }
    return {
      status: 'REJECT',
      fib50Level: fib50,
      reason: `Bullish FVG top (${fvgZone.top}) touches or exceeds Fib ${fibEqLevel * 100}% (${fib50}). Invalid: Not in Discount Zone.`,
    };
  } else {
    if (fvgZone.bottom > fib50) {
      return {
        status: 'PASS_PREMIUM',
        fib50Level: fib50,
        reason: `Bearish FVG bottom (${fvgZone.bottom}) is strictly above Fib ${fibEqLevel * 100}% (${fib50}). Valid Premium zone.`,
      };
    }
    return {
      status: 'REJECT',
      fib50Level: fib50,
      reason: `Bearish FVG bottom (${fvgZone.bottom}) touches or dips below Fib ${fibEqLevel * 100}% (${fib50}). Invalid: Not in Premium Zone.`,
    };
  }
}

/**
 * Stage 13: Optimal Trade Entry (OTE 61.8% -> 78.6%)
 * Bullish structure: Retracement into [61.8%, 78.6%] of swing low to high.
 * Bearish structure: Retracement into [61.8%, 78.6%] of swing high to low.
 */
export function evaluateOTE(
  currentPrice: number,
  swingHigh: number,
  swingLow: number,
  bias: 'BULLISH' | 'BEARISH'
): OteState {
  const range = Math.abs(swingHigh - swingLow);
  let ote_618: number;
  let ote_786: number;

  if (bias === 'BULLISH') {
    // Retracement down from swing high
    ote_618 = swingHigh - 0.618 * range;
    ote_786 = swingHigh - 0.786 * range;
    const lowerBound = Math.min(ote_618, ote_786);
    const upperBound = Math.max(ote_618, ote_786);

    const inOte = currentPrice >= lowerBound && currentPrice <= upperBound;
    const crossedOte = currentPrice < lowerBound;
    const touchedOte = Math.abs(currentPrice - upperBound) / range < 0.05;

    const zone_status = inOte ? 'INSIDE_OTE' : crossedOte ? 'CROSSED_OTE' : touchedOte ? 'TOUCHED_OTE' : 'OUTSIDE_OTE';

    return {
      ote_618,
      ote_786,
      current_price_in_ote: inOte,
      zone_status,
      status: 'PASS',
      reason: `Bullish OTE zone [${lowerBound.toFixed(5)}, ${upperBound.toFixed(5)}]. State: ${zone_status}`,
    };
  } else {
    // Retracement up from swing low
    ote_618 = swingLow + 0.618 * range;
    ote_786 = swingLow + 0.786 * range;
    const lowerBound = Math.min(ote_618, ote_786);
    const upperBound = Math.max(ote_618, ote_786);

    const inOte = currentPrice >= lowerBound && currentPrice <= upperBound;
    const crossedOte = currentPrice > upperBound;
    const touchedOte = Math.abs(currentPrice - lowerBound) / range < 0.05;

    const zone_status = inOte ? 'INSIDE_OTE' : crossedOte ? 'CROSSED_OTE' : touchedOte ? 'TOUCHED_OTE' : 'OUTSIDE_OTE';

    return {
      ote_618,
      ote_786,
      current_price_in_ote: inOte,
      zone_status,
      status: 'PASS',
      reason: `Bearish OTE zone [${lowerBound.toFixed(5)}, ${upperBound.toFixed(5)}]. State: ${zone_status}`,
    };
  }
}

/**
 * Stage 14: Wick Validation
 * Upper/Lower wick pushback ratio: pushback_wick / total_range.
 * Ratio > 0.50 => REJECT ("Wick Fakeout"). Ratio <= 0.50 => PASS.
 */
export function evaluateWickPushback(
  candle: Candle,
  bias: 'BULLISH' | 'BEARISH',
  maxWickRatio: number = 0.50
): { status: 'PASS' | 'REJECT'; wickRatio: number; upperRatio: number; lowerRatio: number; reason: string } {
  const totalRange = candle.high - candle.low;
  if (totalRange <= 0.000001) {
    return {
      status: 'PASS',
      wickRatio: 0,
      upperRatio: 0,
      lowerRatio: 0,
      reason: 'Zero range flat candle. Wick ratio 0.',
    };
  }

  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  const upperRatio = upperWick / totalRange;
  const lowerRatio = lowerWick / totalRange;

  // For bullish expansion, upper wick is opposing pushback
  // For bearish expansion, lower wick is opposing pushback
  const pushbackRatio = bias === 'BULLISH' ? upperRatio : lowerRatio;

  if (pushbackRatio > maxWickRatio) {
    return {
      status: 'REJECT',
      wickRatio: pushbackRatio,
      upperRatio,
      lowerRatio,
      reason: `Wick pushback ratio (${pushbackRatio.toFixed(3)}) exceeds frozen maximum threshold (${maxWickRatio.toFixed(2)}). Rejected: Wick Fakeout.`,
    };
  }

  return {
    status: 'PASS',
    wickRatio: pushbackRatio,
    upperRatio,
    lowerRatio,
    reason: `Wick pushback ratio (${pushbackRatio.toFixed(3)}) within allowable boundary (<= ${maxWickRatio.toFixed(2)}).`,
  };
}

/**
 * Stage 15: Candle Momentum & Imbalance (Strategy v2.0-FROZEN)
 * 
 * Exact Numerical Formulas & Deterministic Rules:
 * 1. Candle Formulas:
 *    - body = abs(Close - Open)
 *    - range = High - Low (if range <= 1e-6 => range = 1e-6, body_ratio = 0)
 *    - body_ratio = body / range
 *    - direction: Close >= Open ? 'BULLISH' : 'BEARISH'
 * 2. Rolling Baseline Calculation:
 *    - Lookback window: N = 10 prior completed candles [max(0, currentIdx - 10), currentIdx - 1]
 *    - baseline = (sum of body_ratio over window) / count (default 0.50 if count == 0)
 *    - relative_body_strength = baseline > 0 ? (body_ratio / baseline) : 1.0
 * 3. Directional / Neutral Thresholds & Equality Boundaries:
 *    - BULLISH_MOMENTUM: direction == 'BULLISH' && body_ratio >= 0.60 && relative_body_strength >= 1.10
 *    - BEARISH_MOMENTUM: direction == 'BEARISH' && body_ratio >= 0.60 && relative_body_strength >= 1.10
 *    - WEAK_MOMENTUM: body_ratio < 0.30
 *    - MOMENTUM_SHIFT: relative_body_strength > 1.30 && body_ratio >= 0.30 && body_ratio < 0.60
 *    - NEUTRAL_MOMENTUM: 0.30 <= body_ratio < 0.60 && relative_body_strength <= 1.30 (or when criteria above not met)
 */
export function evaluateMomentum(candles: Candle[], currentIdx: number): MomentumStateInfo {
  const c = candles[currentIdx];
  const range = c.high - c.low;
  const safeRange = range > 1e-6 ? range : 1e-6;
  const body = Math.abs(c.close - c.open);
  const body_ratio = range > 1e-6 ? body / safeRange : 0;
  const direction: 'BULLISH' | 'BEARISH' = c.close >= c.open ? 'BULLISH' : 'BEARISH';

  // 10-period rolling baseline
  let totalBodyRatio = 0;
  let count = 0;
  const lookbackStart = Math.max(0, currentIdx - 10);
  for (let i = lookbackStart; i < currentIdx; i++) {
    const r = candles[i].high - candles[i].low;
    if (r > 1e-6) {
      totalBodyRatio += Math.abs(candles[i].close - candles[i].open) / r;
      count++;
    }
  }
  const avgBaseline = count > 0 ? totalBodyRatio / count : 0.50;
  const relative_body_strength = avgBaseline > 0 ? body_ratio / avgBaseline : 1.0;

  let momentum_state: MomentumStateInfo['momentum_state'] = 'NEUTRAL_MOMENTUM';

  // Exact threshold comparisons with strict frozen equality boundaries
  if (body_ratio >= 0.60 && relative_body_strength >= 1.10) {
    momentum_state = direction === 'BULLISH' ? 'BULLISH_MOMENTUM' : 'BEARISH_MOMENTUM';
  } else if (body_ratio < 0.30) {
    momentum_state = 'WEAK_MOMENTUM';
  } else if (relative_body_strength > 1.30 && body_ratio >= 0.30 && body_ratio < 0.60) {
    momentum_state = 'MOMENTUM_SHIFT';
  } else {
    momentum_state = 'NEUTRAL_MOMENTUM';
  }

  return {
    body,
    range,
    body_ratio,
    direction,
    relative_body_strength,
    momentum_state,
    status: 'PASS',
    reason: `Momentum: ${momentum_state} (Body Ratio: ${(body_ratio * 100).toFixed(1)}%, Relative Strength: ${relative_body_strength.toFixed(2)}x, Baseline: ${(avgBaseline * 100).toFixed(1)}%)`,
  };
}

/** Stage 16 & 17 have exactly one implementation: the DST-aware owner rules in ./session. */
export { classifySessionAndKillZone };

export function isInsideCandle(current: Candle, previous: Candle): boolean {
  return current.high <= previous.high && current.low >= previous.low;
}

/**
 * Stage 4: Volume / Tick Activity Proxy
 * Accepts ascending tick volume sequence (C1 < C2 < C3) or volume exceeding 10-period rolling average.
 */
export function evaluateTickProxy(
  candles: Candle[],
  currentCandleIndex: number
): {
  status: 'PASS' | 'REJECT';
  tick_sequence: 'ASCENDING' | 'NOT_ASCENDING';
  tick_baseline: 'ABOVE_AVERAGE' | 'BELOW_AVERAGE';
  reason: string;
} {
  const c3 = candles[currentCandleIndex];
  const c2 = candles[currentCandleIndex - 1];
  const c1 = candles[currentCandleIndex - 2];
  // 10-period rolling volume average prior to displacement C2
  let sum = 0;
  let count = 0;
  const start = Math.max(0, currentCandleIndex - 12);
  const end = Math.max(0, currentCandleIndex - 2);
  for (let i = start; i < end; i++) {
    const volume = candles[i].volume;
    if (typeof volume !== 'number' || !Number.isFinite(volume)) continue;
    sum += volume;
    count++;
  }
  const avgVolume = count > 0 ? sum / count : Number.NaN;

  const isAscending = c1.volume !== null && c2.volume !== null && c3.volume !== null && c1.volume < c2.volume && c2.volume < c3.volume;
  const isAboveAverage = Number.isFinite(avgVolume) && c2.volume !== null && c3.volume !== null && (c2.volume > avgVolume || c3.volume > avgVolume);

  const tick_sequence: 'ASCENDING' | 'NOT_ASCENDING' = isAscending ? 'ASCENDING' : 'NOT_ASCENDING';
  const tick_baseline: 'ABOVE_AVERAGE' | 'BELOW_AVERAGE' = isAboveAverage ? 'ABOVE_AVERAGE' : 'BELOW_AVERAGE';

  if (isAscending || isAboveAverage) {
    return {
      status: 'PASS',
      tick_sequence,
      tick_baseline,
      reason: `Tick activity proxy accepted: sequence=${tick_sequence}, baseline=${tick_baseline} (avg=${avgVolume.toFixed(0)})`,
    };
  }

  return {
    status: 'REJECT',
    tick_sequence,
    tick_baseline,
    reason: `Low tick activity proxy: volume neither ascending nor above 10-period average (${avgVolume.toFixed(0)}). REJECT.`,
  };
}

/**
 * MASTER EVALUATION PIPELINE: Strategy v2.0-FROZEN
 * Executes the 19 stages deterministically.
 * Returns single unified MasterTelemetry record.
 */
export function executeStrategyPipeline(input: PipelineInput): MasterTelemetry {
  const {
    decisionEngineVersion = process.env.LEGACY_V2_FIXTURES === '1' ? 'V2' : 'V3',
    candles: inputCandles,
    currentCandleIndex,
    selectedTimeframe,
    higherTimeframeBias = 'UNCLEAR',
    newsEvents,
    newsSourceOnline,
    pair = 'EUR/USD',
    asset = 'EUR/USD',
    customSettings,
  } = input;
  // Zero lookahead: the V3 path never sees candles after the decision candle.
  const candles = decisionEngineVersion === 'V3' && Array.isArray(inputCandles) ? inputCandles.slice(0, Math.max(0, currentCandleIndex + 1)) : inputCandles;
  const dataProvenance: DataProvenance = input.dataProvenance ?? 'NOT_LIVE';
  const failContext = { dataProvenance, provider: input.provider, payoutPct: input.payoutPct, signalCandleOpenTs: candles?.[currentCandleIndex]?.timestamp ?? null };
  const decisionCandle = candles?.[currentCandleIndex];
  if (decisionCandle && (isFxMarketClosed(decisionCandle.timestamp) || isFxMarketClosed(Date.parse(decisionCandle.timestamp) + timeframeMs(selectedTimeframe)))) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', 'MARKET_CLOSED', decisionCandle.timestamp, failContext);
  }
  if (dataProvenance !== 'LIVE_INGESTED') {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', `NOT_LIVE_DATA: ${dataProvenance} is not verified live provider data. NO_TRADE.`, new Date().toISOString(), failContext);
  }
  if (decisionEngineVersion === 'V3') {
    if (input.payoutPct === undefined || input.payoutPct === null || !Number.isFinite(input.payoutPct)) {
      return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', 'PAYOUT_UNSET: payout not set via Telegram. NO_TRADE.', new Date().toISOString(), failContext);
    }
    if (input.payoutPct < MIN_PAYOUT_PCT) {
      return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', `PAYOUT_BELOW_MIN: ${input.payoutPct}% < ${MIN_PAYOUT_PCT}%. NO_TRADE.`, new Date().toISOString(), failContext);
    }
    const series = candles ? candles.slice(0, currentCandleIndex + 1) : [];
    const quality = validateCandleSeries(series, { timeframe: selectedTimeframe, nowMs: input.nowMs, minCandles: MIN_ENGINE_CANDLES });
    if (!quality.ok) {
      return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'INVALID', `DATA_QUALITY_FAIL: ${quality.issues.slice(0, 3).map((issue) => `${issue.code} ${issue.detail}`).join('; ')}`, new Date().toISOString(), { ...failContext, dataQualityIssues: quality.issues.map((issue) => issue.code) });
    }
  }
  const signalCloseIso = candles?.[currentCandleIndex] ? new Date(Date.parse(candles[currentCandleIndex].timestamp) + timeframeMs(selectedTimeframe)).toISOString() : new Date(0).toISOString();
  const resolvedHtfBias = decisionEngineVersion === 'V3' && input.htfCandles ? deriveHtfBias(input.htfCandles, signalCloseIso) : higherTimeframeBias;
  if (decisionEngineVersion === 'V3' && resolvedHtfBias === 'UNCLEAR') {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', 'HTF_BIAS_UNCLEAR: 1h higher-timeframe bias is unavailable or unclear. NO_TRADE.', new Date().toISOString(), failContext);
  }

  const maxWickRatio = customSettings?.maxWickRatio ?? 0.50;
  const fibEquilibriumLevel = customSettings?.fibEquilibriumLevel ?? 0.50;

  // Fail-Safe: Data Quality Check
  if (!candles || candles.length < 5 || currentCandleIndex < 4) {
    const nowIso = new Date().toISOString();
    return createInconclusiveTelemetry(
      pair,
      asset,
      selectedTimeframe,
      'INVALID',
      'Insufficient candle history for 5-candle symmetric fractal and 3-candle expansion analysis',
      nowIso
    );
  }

  const c3 = candles[currentCandleIndex];
  const c2 = candles[currentCandleIndex - 1];
  const c1 = candles[currentCandleIndex - 2];

  const resolvedProvenance: DataProvenance = dataProvenance;
  const v3Decision = evaluateStrategyV3({ candles: candles.slice(0, currentCandleIndex + 1), htfBias: resolvedHtfBias, newsEvents, newsSourceOnline, timeframe: selectedTimeframe, timestamp: c3.timestamp });
  if (decisionEngineVersion === 'V3' && (v3Decision.mfci.totalMfci === null || v3Decision.mfci.sStructure === null || v3Decision.mfci.sLiquidity === null || v3Decision.entryPrice === null)) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'INVALID', v3Decision.statusReason, new Date().toISOString(), failContext);
  }
  const v3Telemetry = { ...v3Decision, mfci: { ...v3Decision.mfci, sStructure: v3Decision.mfci.sStructure ?? Number.NaN, sLiquidity: v3Decision.mfci.sLiquidity ?? Number.NaN, totalMfci: v3Decision.mfci.totalMfci ?? Number.NaN }, entryPrice: v3Decision.entryPrice ?? Number.NaN };

  const isZeroRange = Math.abs(c3.high - c3.low) <= 0.000001;
  const dataQuality: DataQuality = isZeroRange ? 'DEGRADED' : 'COMPLETE';

  // Stage 16 & 17: Session & Kill Zone Context
  const sessionInfo = classifySessionAndKillZone(c3.timestamp);

  // Stage 1: Market Structure Swings (Left N=2, Right N=2)
  const swings = detectFractalSwings(candles, currentCandleIndex);
  const structure = evaluateMarketStructure(swings);
  const effectiveBias = structure.bias !== 'UNCLEAR' ? structure.bias : higherTimeframeBias;

  // Stage 2: BOS (Break of Structure - Body Close)
  const bosState = evaluateBOS(
    c3,
    currentCandleIndex,
    structure.recentSwingHigh,
    structure.recentSwingLow
  );

  // Stage 3: CHoCH (Change of Character)
  const chochState = evaluateCHoCH(c3, swings, structure.bias);

  // Stage 4: FVG (3-Candle Imbalance)
  const fvgResult = detectFVG(c1, c2, c3);
  let fvgStatus: 'PASS' | 'REJECT' | 'EXPIRED' | 'INVALID' | 'INCONCLUSIVE' = 'REJECT';
  let fvgZone: FVGZone | undefined = fvgResult.fvg;
  let fvgReason = 'No active Fair Value Gap detected across candles [C1, C2, C3]';

  if (fvgResult.detected && fvgResult.fvg) {
    const fvg = fvgResult.fvg;
    fvgStatus = 'PASS';
    fvgReason = `Confirmed ${fvgResult.direction} FVG zone: [${fvg.bottom.toFixed(5)}, ${fvg.top.toFixed(5)}]`;

    if (fvgResult.direction === 'BEARISH') {
      if (c3.close >= fvg.top) {
        fvg.mitigationState = 'COMPLETELY_FILLED';
        fvgStatus = 'EXPIRED';
        fvgReason = `Bearish FVG completely filled by retest close (${c3.close.toFixed(5)}) at or above top (${fvg.top.toFixed(5)})`;
      } else if (c3.close > fvg.bottom) {
        fvg.mitigationState = 'PARTIAL_FILL';
        fvgReason = `Bearish FVG partially filled by retest close (${c3.close.toFixed(5)}) inside [${fvg.bottom.toFixed(5)}, ${fvg.top.toFixed(5)}]`;
      } else {
        fvg.mitigationState = 'UNMITIGATED';
      }
    } else {
      if (c3.close <= fvg.bottom) {
        fvg.mitigationState = 'COMPLETELY_FILLED';
        fvgStatus = 'EXPIRED';
        fvgReason = `Bullish FVG completely filled by retest close (${c3.close.toFixed(5)}) at or below bottom (${fvg.bottom.toFixed(5)})`;
      } else if (c3.close < fvg.top) {
        fvg.mitigationState = 'PARTIAL_FILL';
        fvgReason = `Bullish FVG partially filled by retest close (${c3.close.toFixed(5)}) inside [${fvg.bottom.toFixed(5)}, ${fvg.top.toFixed(5)}]`;
      } else {
        fvg.mitigationState = 'UNMITIGATED';
      }
    }
  }

  // Stage 5: IFVG (Inverse Fair Value Gap)
  const priorFVGs: FVGZone[] = fvgZone ? [fvgZone] : [];
  const ifvgState = evaluateIFVG(c3, priorFVGs);

  // Stage 6: BPR (Balanced Price Range)
  const bullishFVGs: FVGZone[] = fvgResult.direction === 'BULLISH' && fvgResult.fvg ? [fvgResult.fvg] : [];
  const bearishFVGs: FVGZone[] = fvgResult.direction === 'BEARISH' && fvgResult.fvg ? [fvgResult.fvg] : [];
  const bprState = detectBPR(bullishFVGs, bearishFVGs);

  // Stage 7: Order Block (OB)
  const detectedOB = detectOrderBlock(
    candles,
    currentCandleIndex - 1,
    effectiveBias === 'BEARISH' ? 'BEARISH' : 'BULLISH'
  );
  let obConfluenceStatus: 'PASS' | 'FAIL' = 'FAIL';
  let obZone: [number, number] | undefined;
  let obReason = 'No opposing Order Block detected prior to displacement candle';

  if (detectedOB) {
    obZone = [detectedOB.bottom, detectedOB.top];
    if (effectiveBias === 'BEARISH') {
      const fvgTop = fvgZone ? fvgZone.top : c1.low;
      const confluence = (c1.low >= detectedOB.bottom || fvgTop >= detectedOB.bottom) && c3.high < detectedOB.top;
      if (confluence) {
        obConfluenceStatus = 'PASS';
        obReason = `Bearish Order Block confluence confirmed: (Low(C1) >= Low(Cob) || fvgTop >= Low(Cob)) && High(C3) < High(Cob)`;
      } else {
        obConfluenceStatus = 'FAIL';
        obReason = `Bearish Order Block confluence failed: High(C3) (${c3.high.toFixed(5)}) breached OB ceiling (${detectedOB.top.toFixed(5)}) or floor condition not met`;
      }
    } else {
      const fvgBottom = fvgZone ? fvgZone.bottom : c1.high;
      const confluence = (c1.high <= detectedOB.top || fvgBottom <= detectedOB.top) && c3.low > detectedOB.bottom;
      if (confluence) {
        obConfluenceStatus = 'PASS';
        obReason = `Bullish Order Block confluence confirmed: (High(C1) <= High(Cob) || fvgBottom <= High(Cob)) && Low(C3) > Low(Cob)`;
      } else {
        obConfluenceStatus = 'FAIL';
        obReason = `Bullish Order Block confluence failed: Low(C3) (${c3.low.toFixed(5)}) breached OB floor (${detectedOB.bottom.toFixed(5)}) or ceiling condition not met`;
      }
    }
  }

  // Stage 8: Breaker Block Transition
  const breakerState = evaluateBreakerBlock(c3, detectedOB ? [detectedOB] : []);

  // Stage 9: Liquidity Sweep Evaluation
  const sweepCheck = evaluateLiquiditySweep(
    c3,
    structure.recentSwingHigh,
    structure.recentSwingLow,
    effectiveBias
  );

  // Stage 10 & 11: BSL / SSL Pool Mapping & Target Context
  const bslSslState = detectLiquidityPools(candles, c3.close, swings, effectiveBias);

  // Stage 12: Discount / Premium (Fib 50%)
  const swingH = structure.recentSwingHigh?.price ?? Math.max(c1.high, c2.high, c3.high);
  const swingL = structure.recentSwingLow?.price ?? Math.min(c1.low, c2.low, c3.low);

  let fibStatus: 'PASS_DISCOUNT' | 'PASS_PREMIUM' | 'REJECT' = 'REJECT';
  let fib50Val = swingL + fibEquilibriumLevel * Math.abs(swingH - swingL);
  let fibReason = 'Unable to verify Fib 50% discount/premium status';

  if (fvgZone) {
    const fibCheck = evaluateDiscountPremium(
      fvgZone,
      swingH,
      swingL,
      effectiveBias === 'BEARISH' ? 'BEARISH' : 'BULLISH',
      fibEquilibriumLevel
    );
    fibStatus = fibCheck.status;
    fib50Val = fibCheck.fib50Level;
    fibReason = fibCheck.reason;
  }

  // Stage 13: Optimal Trade Entry (OTE 61.8% -> 78.6%)
  const oteState = evaluateOTE(c3.close, swingH, swingL, effectiveBias === 'BEARISH' ? 'BEARISH' : 'BULLISH');

  // Stage 14: Wick Validation
  const wickCheck = evaluateWickPushback(
    c3,
    effectiveBias === 'BEARISH' ? 'BEARISH' : 'BULLISH',
    maxWickRatio
  );

  // Stage 15: Momentum & Imbalance
  const momentumState = evaluateMomentum(candles, currentCandleIndex);

  // Stage 3 Expansion (3-Candle Pattern)
  let pattern3CandleStatus: 'PASS' | 'REJECT' = 'REJECT';
  let pattern3CandleReason = '';
  if (effectiveBias === 'BEARISH') {
    if (c3.close < c1.low) {
      pattern3CandleStatus = 'PASS';
      pattern3CandleReason = `Close(C3) (${c3.close.toFixed(5)}) broke below Low(C1) (${c1.low.toFixed(5)}). Valid expansion.`;
    } else {
      pattern3CandleStatus = 'REJECT';
      pattern3CandleReason = `Close(C3) (${c3.close.toFixed(5)}) failed to break below Low(C1) (${c1.low.toFixed(5)}). Breakout rejected.`;
    }
  } else {
    if (c3.close > c1.high) {
      pattern3CandleStatus = 'PASS';
      pattern3CandleReason = `Close(C3) (${c3.close.toFixed(5)}) broke above High(C1) (${c1.high.toFixed(5)}). Valid expansion.`;
    } else {
      pattern3CandleStatus = 'REJECT';
      pattern3CandleReason = `Close(C3) (${c3.close.toFixed(5)}) failed to break above High(C1) (${c1.high.toFixed(5)}). Breakout rejected.`;
    }
  }

  // Stage 4: Volume / Tick Activity Proxy
  const tickProxy = evaluateTickProxy(candles, currentCandleIndex);

  // Inside Candle Check
  const insideCandle = isInsideCandle(c3, c2);

  // Stage 18: News Guard Fail-Safe
  let newsWindowState: 'CLEAR' | 'ACTIVE' | 'NEWS_DATA_UNAVAILABLE' = 'CLEAR';
  let newsEventDetected = false;
  let newsStatus: 'PASS' | 'REJECT' | 'INCONCLUSIVE' = 'PASS';
  let newsReason = 'No high-impact red-folder events in +/-30m window';

  if (!newsSourceOnline) {
    newsWindowState = 'NEWS_DATA_UNAVAILABLE';
    newsStatus = 'INCONCLUSIVE';
    newsReason = 'News data source offline. Fail-safe triggered: Never assume no news = clear.';
  } else {
    const c3Time = new Date(c3.timestamp).getTime();
    const windowMs = 30 * 60 * 1000;
    const impactEvent = newsEvents.find((evt) => {
      if (evt.impact !== 'HIGH') return false;
      const evtTime = new Date(evt.timestamp).getTime();
      return Math.abs(evtTime - c3Time) <= windowMs;
    });

    if (impactEvent) {
      newsEventDetected = true;
      newsWindowState = 'ACTIVE';
      newsStatus = 'REJECT';
      newsReason = `High-impact news event active: "${impactEvent.title}" at ${impactEvent.timestamp}`;
    }
  }

  // DETERMINISTIC 9-STAGE DECISION ENGINE
  let system_decision: 'PASS' | 'REJECT' | 'INCONCLUSIVE' = 'PASS';
  let final_action: 'MANUAL_ALERT' | 'SAFE_HOLD' | 'NO_ACTION' = 'MANUAL_ALERT';
  let halted_at_stage: string | undefined;
  let rejection_reason: string | undefined;

  // Zero-range flat candle fail-safe
  if (isZeroRange) {
    system_decision = 'INCONCLUSIVE';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 1: Market Structure / Data Quality';
    rejection_reason = 'Zero range flat candle detected on confirmation candle C3. Fail-safe triggered: DEGRADED.';
  }
  // Stage 1: Market Structure
  else if (structure.bias === 'UNCLEAR' && higherTimeframeBias === 'UNCLEAR') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 1: Market Structure';
    rejection_reason = 'Unclear market structure: Swings missing or conflicting';
  }
  // Stage 2: Fair Value Gap (FVG)
  else if (fvgStatus !== 'PASS') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 2: Fair Value Gap';
    rejection_reason = fvgReason;
  }
  else if (obConfluenceStatus === 'FAIL') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 2: Fair Value Gap';
    rejection_reason = obReason;
  }
  // Stage 3: 3-Candle Pattern Expansion
  else if (pattern3CandleStatus === 'REJECT') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 3: 3-Candle Pattern';
    rejection_reason = pattern3CandleReason;
  }
  // Stage 4: Volume / Tick Activity Proxy Check
  else if (tickProxy.status === 'REJECT') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 4: Volume / Tick Activity Proxy';
    rejection_reason = tickProxy.reason;
  }
  // Stage 5: Wick Validation & Liquidity Sweep
  else if (wickCheck.status === 'REJECT') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 5: Wick Validation';
    rejection_reason = wickCheck.reason;
  }
  else if (sweepCheck.status === 'SWEEP_DETECTED') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 5: Wick Validation';
    rejection_reason = sweepCheck.reason;
  }
  // Stage 6: Fibonacci 50% Equilibrium Zone Check
  else if (fibStatus === 'REJECT') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 6: Fibonacci 50% Equilibrium Zone';
    rejection_reason = fibReason;
  }
  // Stage 7: News Guard Fail-Safe Check
  else if (newsStatus === 'INCONCLUSIVE') {
    system_decision = 'INCONCLUSIVE';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 7: News Guard Fail-Safe';
    rejection_reason = newsReason;
  }
  else if (newsStatus === 'REJECT') {
    system_decision = 'REJECT';
    final_action = 'NO_ACTION';
    halted_at_stage = 'Stage 7: News Guard Fail-Safe';
    rejection_reason = newsReason;
  }
  if (decisionEngineVersion === 'V3') {
    system_decision = v3Decision.systemDecision === 'PASS'
      ? 'PASS'
      : v3Decision.systemDecision === 'BLOCKED'
      ? 'REJECT'
      : 'INCONCLUSIVE';
    final_action = v3Decision.finalAction;
    if (v3Decision.systemDecision !== 'PASS') {
      const failedGate = v3Decision.gates.find((gate) => gate.status !== 'PASS');
      halted_at_stage = `V3 Gate ${failedGate?.gateNumber ?? 9}`;
      rejection_reason = failedGate?.reason ?? 'V3 confluence or safety gate did not pass';
    }
  }

  const nowIso = new Date().toISOString();

  return {
    decision_engine_v3: decisionEngineVersion === 'V3' ? v3Telemetry : undefined,
    metadata: {
      project_name: 'ComVision Strategy Research Engine',
      strategy_version: ACTIVE_STRATEGY_VERSION,
      experiment_id: ACTIVE_EXPERIMENT_ID,
      setup_id: deterministicSetupId(pair, selectedTimeframe, c3.timestamp, decisionEngineVersion),
      config_hash: CONFIG_HASH,
      timestamp_utc: nowIso,
      signal_timestamp_utc: c3.timestamp,
      pair,
      asset,
      data_quality: dataQuality,
      data_provenance: resolvedProvenance,
      decision_engine: 'decision_engine_v3',
      provider: input.provider ?? 'UNAVAILABLE',
      poc_label: v3Decision.pocLabel,
      signal_candle_open_ts: v3Decision.signalCandleOpenTs,
      htf_bias: resolvedHtfBias,
      engine_mode: v3Decision.engineMode,
      excluded_stages: v3Decision.excludedStages,
      mfci_total: v3Decision.mfci.totalMfci,
      mfci_structure: v3Decision.mfci.sStructure,
      mfci_orderflow: v3Decision.mfci.sOrderFlow,
      mfci_liquidity: v3Decision.mfci.sLiquidity,
      mfci_band: v3Decision.mfciBand,
      status: v3Decision.status,
      status_reason: v3Decision.statusReason,
      first_failed_gate: v3Decision.firstFailedGate,
      payout_pct: input.payoutPct,
      payout_set_at: input.payoutSetAt,
      payout_source: input.payoutPct !== undefined ? 'TELEGRAM_MANUAL' : undefined,
    },
    market_context: {
      selected_timeframe: selectedTimeframe,
      supporting_timeframe_analysis: {
        htf_analyzed: '1h',
        htf_bias: higherTimeframeBias,
      },
      local_bias: effectiveBias,
      context_state: structure.bias === higherTimeframeBias ? 'ALIGNED' : 'TRANSITION',
      regime_tag: structure.bias !== 'UNCLEAR' ? 'TRENDING' : 'RANGING',
      session: sessionInfo.session,
      kill_zone: sessionInfo.kill_zone,
      session_start_utc: sessionInfo.session_start_utc,
      session_end_utc: sessionInfo.session_end_utc,
    },
    validation_metrics: {
      structure: {
        status: structure.bias !== 'UNCLEAR' ? 'PASS' : 'INCONCLUSIVE',
        swing_confirmed_at_timestamp: structure.recentSwingHigh?.confirmedAtTimestamp,
        reason: `Local Bias: ${effectiveBias}`,
      },
      bos: bosState,
      choch: chochState,
      fvg: {
        fvg_status: fvgStatus,
        fvg_mitigation_state: fvgZone?.mitigationState ?? 'UNMITIGATED',
        zone: fvgZone ? [fvgZone.bottom, fvgZone.top] : undefined,
        reason: fvgReason,
      },
      ifvg: ifvgState,
      bpr: bprState,
      order_block: {
        ob_detected: !!detectedOB,
        ob_confluence_status: obConfluenceStatus,
        ob_zone: obZone,
        reason: obReason,
      },
      breaker_block: breakerState,
      pattern_3_candle: {
        status: pattern3CandleStatus,
        reason: pattern3CandleReason,
      },
      inside_candle: {
        inside_candle_detected: insideCandle,
      },
      fib_zone: {
        status: fibStatus,
        fib_50_level: fib50Val,
        reason: fibReason,
      },
      ote: oteState,
      tick_proxy: tickProxy,
      momentum: momentumState,
      wick_check: {
        status: wickCheck.status,
        wick_ratio: wickCheck.wickRatio,
        reason: wickCheck.reason,
      },
      liquidity_sweep: {
        status: sweepCheck.status,
        tested_swing_level: sweepCheck.testedLevel,
        reason: sweepCheck.reason,
      },
      bsl_ssl: bslSslState,
    },
    pressure_observation: {
      classification: input.liveTickPressure?.classification ?? 'ALIGNED',
      magnitude: input.liveTickPressure?.magnitude ?? 'HIGH',
      consistency: input.liveTickPressure?.consistency ?? 'HIGH',
      speedPxPerSec: input.liveTickPressure?.speedPxPerSec ?? 14.5,
    },
    guardrails: {
      news_guard: {
        news_event_detected: newsEventDetected,
        news_window_state: newsWindowState,
        news_source: newsSourceOnline ? 'Trading Economics Live Calendar' : 'NEWS_DATA_UNAVAILABLE',
        reason: newsReason,
      },
    },
    system_execution: {
      system_decision,
      final_action,
      user_recorded_action: 'NOT_RECORDED',
      halted_at_stage,
      rejection_reason,
    },
    next_candle_observation: {
      status: 'PENDING',
    },
    provider_provenance: {
      provider_state: resolvedProvenance,
      data_provenance: resolvedProvenance,
      timestamp_ingested: nowIso,
    },
  };
}

function createInconclusiveTelemetry(
  pair: string,
  asset: string,
  timeframe: Timeframe,
  dataQuality: DataQuality,
  reason: string,
  nowIso: string,
  context: { dataProvenance?: DataProvenance; provider?: 'TWELVE_DATA' | 'ALPHA_VANTAGE'; payoutPct?: number; signalCandleOpenTs?: string | null; dataQualityIssues?: string[] } = {}
): MasterTelemetry {
  return {
    metadata: {
      project_name: 'ComVision Strategy Research Engine',
      strategy_version: ACTIVE_STRATEGY_VERSION,
      experiment_id: ACTIVE_EXPERIMENT_ID,
      setup_id: deterministicSetupId(pair, timeframe, nowIso, 'V3_FAIL_CLOSED'),
      config_hash: CONFIG_HASH,
      timestamp_utc: nowIso,
      pair,
      asset,
      data_quality: dataQuality,
      data_provenance: context.dataProvenance ?? 'NOT_LIVE',
      decision_engine: 'decision_engine_v3',
      provider: context.provider ?? 'UNAVAILABLE',
      poc_label: 'UNAVAILABLE',
      signal_candle_open_ts: context.signalCandleOpenTs ?? null,
      data_quality_issues: context.dataQualityIssues,
      engine_mode: 'PRICE_ONLY',
      excluded_stages: [],
      mfci_total: null,
      mfci_structure: null,
      mfci_orderflow: null,
      mfci_liquidity: null,
      mfci_band: 'UNAVAILABLE',
      status: reason.startsWith('DATA_QUALITY_FAIL') ? 'DATA_QUALITY_FAIL' : 'BLOCKED',
      status_reason: reason,
      payout_pct: context.payoutPct,
    },
    market_context: {
      selected_timeframe: timeframe,
      supporting_timeframe_analysis: { htf_analyzed: '1h', htf_bias: 'UNCLEAR' },
      local_bias: 'UNCLEAR',
      context_state: 'UNCLEAR',
      regime_tag: 'UNCLEAR',
      session: 'UNKNOWN',
      kill_zone: 'UNKNOWN',
    },
    validation_metrics: {
      structure: { status: 'INCONCLUSIVE', reason },
      fvg: { fvg_status: 'INCONCLUSIVE', fvg_mitigation_state: 'UNMITIGATED', reason },
      order_block: { ob_detected: false, ob_confluence_status: 'FAIL', reason },
      pattern_3_candle: { status: 'REJECT', reason },
      inside_candle: { inside_candle_detected: false },
      fib_zone: { status: 'REJECT', reason },
      tick_proxy: { status: 'REJECT', tick_sequence: 'NOT_ASCENDING', tick_baseline: 'BELOW_AVERAGE', reason },
      wick_check: { status: 'REJECT', wick_ratio: 1.0, reason },
      liquidity_sweep: { status: 'NOT_TESTING', reason },
    },
    pressure_observation: { classification: 'UNCERTAIN', magnitude: 'LOW', consistency: 'LOW' },
    guardrails: { news_guard: { news_event_detected: false, news_window_state: 'NEWS_DATA_UNAVAILABLE', news_source: 'OFFLINE', reason } },
    system_execution: {
      system_decision: 'INCONCLUSIVE',
      final_action: 'NO_ACTION',
      user_recorded_action: 'NOT_RECORDED',
      halted_at_stage: 'Market Data Circuit Breaker',
      rejection_reason: reason,
    },
    next_candle_observation: {
      status: 'NEXT_CANDLE_INCONCLUSIVE',
    },
  };
}
