import type { Candle, NewsEvent, Timeframe } from './types';
import { computeVolumeWeightedPoc, detectBprFromCandles, evaluateIfvg } from './marketStructureV3';
import { classifySessionAndKillZone, isCoreSession } from './session';
import { validateCandleSeries } from './dataIntegrity';

export type Direction = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type HtfBias = 'BULLISH' | 'BEARISH' | 'UNCLEAR';
export type V3GateStatus = 'PASS' | 'HOLD' | 'BLOCKED' | 'UNAVAILABLE';
export type V3SystemDecision = 'PASS' | 'HOLD' | 'BLOCKED';
export type V3FinalAction = 'MANUAL_ALERT' | 'SAFE_HOLD' | 'NO_ACTION';
export interface V3Stage { stageNumber: number; name: string; category: string; passed: boolean | null; score: number | null; available: boolean; unavailable_reason?: string; mathematicalFormula: string; calculatedValues: Record<string, string>; telemetry: string; }
export interface V3Gate { gateNumber: number; name: string; status: V3GateStatus; reason: string; metricDetails: string; }
export interface V3OperationalGuard { name: string; status: 'PASS' | 'BLOCKED'; reason: string }
export interface V3Decision {
  version: 'RDP_STRATEGY_V3.0';
  direction: Direction;
  htfBias: HtfBias;
  stages: V3Stage[];
  gates: V3Gate[];
  operationalGuards: V3OperationalGuard[];
  engineMode: 'FULL' | 'PRICE_ONLY';
  excludedStages: Array<{ stage: number; name: string; reason: string }>;
  mfci: { sStructure: number | null; sOrderFlow: number | null; sLiquidity: number | null; totalMfci: number | null; meetsThreshold: boolean };
  systemDecision: V3SystemDecision;
  finalAction: V3FinalAction;
  binarySignal: 'CALL' | 'PUT' | 'NO_TRADE';
  mfciBand: 'ABOVE_THRESHOLD' | 'BELOW_THRESHOLD' | 'UNAVAILABLE';
  status: 'PASS' | 'HOLD' | 'BLOCKED';
  statusReason: string;
  firstFailedGate?: number;
  signalCandleOpenTs: string | null;
  pocLabel: 'PROVIDER_VOLUME_POC' | 'UNAVAILABLE';
  entryPrice: number | null;
}

export interface V3Input {
  candles: Candle[];
  /** Bias of the latest CLOSED 1h candle structure. Direction is owned by the engine and derived only from this. */
  htfBias: HtfBias;
  newsEvents: NewsEvent[];
  newsSourceOnline: boolean;
  timeframe?: Timeframe;
  timestamp?: string;
  /** FULL mode requires real provider volume/delta AND explicit enablement (ENGINE_FULL_MODE_ENABLED=true). */
  fullModeEnabled?: boolean;
  /** Comparison-only switch; production/default behavior is the owner-approved B rule. */
  gate4Mode?: 'A' | 'B';
}

export const MFCI_THRESHOLD = 0.85;
export const MIN_ENGINE_CANDLES = 30;
const ANALYSIS_WINDOW = 120;
const FRACTAL_N = 2;
const EVENT_LOOKBACK = 20;
const SWEEP_LOOKBACK = 10;
const POOL_LOOKBACK = 20;
const BREAKER_DELTA_SAMPLE = 50;

type Swing = { index: number; type: 'SWING_HIGH' | 'SWING_LOW'; price: number; confirmedAt: number };

const fixed = (v: number | null | undefined, d = 5) => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : 'UNAVAILABLE';
const bool = (v: boolean) => (v ? 'true' : 'false');
export function classifyGate4Reason(direction: 'BULLISH' | 'BEARISH', rangeHigh: number | undefined, rangeLow: number | undefined, midpoints: number[]): 'PASS' | 'RANGE_UNAVAILABLE' | 'ZONE_UNAVAILABLE' | 'ZONE_ON_WRONG_SIDE' | 'MID_AT_EQ' {
  if (rangeHigh === undefined || rangeLow === undefined || rangeHigh <= rangeLow) return 'RANGE_UNAVAILABLE';
  if (midpoints.length === 0) return 'ZONE_UNAVAILABLE';
  const eq = (rangeHigh + rangeLow) / 2;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(eq)) * 32;
  if (midpoints.some((midpoint) => Math.abs(midpoint - eq) <= epsilon)) return 'MID_AT_EQ';
  if (midpoints.some((midpoint) => direction === 'BULLISH' ? midpoint > eq : midpoint < eq)) return 'ZONE_ON_WRONG_SIDE';
  return 'PASS';
}
const body = (c: Candle) => Math.abs(c.close - c.open);
const range = (c: Candle) => c.high - c.low;
const bullish = (c: Candle) => c.close > c.open;
const bearish = (c: Candle) => c.close < c.open;
const upperWick = (c: Candle) => c.high - Math.max(c.open, c.close);
const lowerWick = (c: Candle) => Math.min(c.open, c.close) - c.low;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stdev = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };

function atr(cs: Candle[], period: number): number | null {
  if (cs.length < period + 1) return null;
  let sum = 0;
  for (let i = cs.length - period; i < cs.length; i++) sum += Math.max(cs[i].high - cs[i].low, Math.abs(cs[i].high - cs[i - 1].close), Math.abs(cs[i].low - cs[i - 1].close));
  return sum / period;
}

/** Fixed 5-candle fractal (N=2). A swing at t is confirmed only at t+2, so it is never visible before t+2 closes. */
export function confirmedFractalSwings(cs: Candle[], lastVisibleIndex = cs.length - 1): Swing[] {
  const out: Swing[] = [];
  for (let t = FRACTAL_N; t + FRACTAL_N <= lastVisibleIndex; t++) {
    let high = true; let low = true;
    for (let i = t - FRACTAL_N; i <= t + FRACTAL_N; i++) {
      if (i === t) continue;
      if (cs[i].high >= cs[t].high) high = false;
      if (cs[i].low <= cs[t].low) low = false;
    }
    if (high) out.push({ index: t, type: 'SWING_HIGH', price: cs[t].high, confirmedAt: t + FRACTAL_N });
    if (low) out.push({ index: t, type: 'SWING_LOW', price: cs[t].low, confirmedAt: t + FRACTAL_N });
  }
  return out;
}

/** HTF bias from closed 1h candles only: HH+HL => BULLISH, LH+LL => BEARISH, otherwise UNCLEAR. */
export function deriveHtfBias(htfCandles: Candle[], asOfIso: string): HtfBias {
  const asOf = Date.parse(asOfIso);
  if (!Number.isFinite(asOf)) return 'UNCLEAR';
  const closed = htfCandles.filter((c) => Date.parse(c.timestamp) + 3_600_000 <= asOf);
  if (closed.length < 2 * FRACTAL_N + 3) return 'UNCLEAR';
  const swings = confirmedFractalSwings(closed);
  const highs = swings.filter((s) => s.type === 'SWING_HIGH');
  const lows = swings.filter((s) => s.type === 'SWING_LOW');
  if (highs.length < 2 || lows.length < 2) return 'UNCLEAR';
  const [h1, h2] = highs.slice(-2); const [l1, l2] = lows.slice(-2);
  if (h2.price > h1.price && l2.price > l1.price) return 'BULLISH';
  if (h2.price < h1.price && l2.price < l1.price) return 'BEARISH';
  return 'UNCLEAR';
}

function stage(stageNumber: number, name: string, category: string, passed: boolean, score: number, formula: string, calculatedValues: Record<string, string>, telemetry: string): V3Stage {
  return { stageNumber, name, category, passed, score: Math.max(0, Math.min(1, score)), available: true, mathematicalFormula: formula, calculatedValues, telemetry };
}
function unavailable(s: V3Stage, reason: string): V3Stage {
  return { ...s, passed: null, score: null, available: false, unavailable_reason: reason, telemetry: `UNAVAILABLE: ${reason}` };
}

function failClosed(input: V3Input, direction: Direction, reason: string): V3Decision {
  return {
    version: 'RDP_STRATEGY_V3.0', direction, htfBias: input.htfBias, stages: [], gates: [], operationalGuards: [],
    engineMode: 'PRICE_ONLY', excludedStages: [],
    mfci: { sStructure: null, sOrderFlow: null, sLiquidity: null, totalMfci: null, meetsThreshold: false },
    systemDecision: 'BLOCKED', finalAction: 'NO_ACTION', binarySignal: 'NO_TRADE', mfciBand: 'UNAVAILABLE',
    status: 'BLOCKED', statusReason: reason, signalCandleOpenTs: input.candles.at(-1)?.timestamp ?? null,
    pocLabel: 'UNAVAILABLE', entryPrice: null,
  };
}

export function isFullModeEnabled(explicit?: boolean): boolean {
  return explicit ?? (typeof process !== 'undefined' && process.env?.ENGINE_FULL_MODE_ENABLED === 'true');
}

export function evaluateStrategyV3(input: V3Input): V3Decision {
  const d: Direction = input.htfBias === 'BULLISH' || input.htfBias === 'BEARISH' ? input.htfBias : 'NEUTRAL';
  if (d === 'NEUTRAL') return failClosed(input, d, 'HTF_BIAS_UNCLEAR: latest closed 1h structure gives no direction. NO_TRADE.');
  const quality = validateCandleSeries(input.candles, { timeframe: input.timeframe, minCandles: MIN_ENGINE_CANDLES });
  if (!quality.ok) return failClosed(input, d, `DATA_QUALITY_FAIL: ${quality.issues.slice(0, 3).map((i) => i.code).join(', ')}`);

  const cs = input.candles.slice(-ANALYSIS_WINDOW);
  const n = cs.length; const last = n - 1; const cur = cs[last];
  const isBull = d === 'BULLISH';
  const a14 = atr(cs, 14);
  if (a14 === null || a14 <= 0) return failClosed(input, d, 'DATA_QUALITY_FAIL: ATR14 is zero or unavailable (flat or insufficient window).');

  const fullCapable = cs.every((c) => typeof c.volume === 'number' && Number.isFinite(c.volume)) && cs.every((c) => c.volumeDelta !== undefined || c.cvd !== undefined);
  const engineMode: 'FULL' | 'PRICE_ONLY' = fullCapable && isFullModeEnabled(input.fullModeEnabled) ? 'FULL' : 'PRICE_ONLY';
  const full = engineMode === 'FULL';
  const excludedStages: Array<{ stage: number; name: string; reason: string }> = [];
  if (!full) {
    excludedStages.push(
      { stage: 3, name: 'CHoCH volume/delta confirmation (FULL-only sub-check)', reason: 'CHOCH_DELTA_UNAVAILABLE' },
      { stage: 7, name: 'Order Block POC confirmation (FULL-only sub-check)', reason: 'OB_POC_UNAVAILABLE' },
      { stage: 8, name: 'Breaker delta z-score confirmation (FULL-only sub-check)', reason: 'BREAKER_DELTA_UNAVAILABLE' },
      { stage: 9, name: 'Sweep CVD divergence (FULL-only sub-check)', reason: 'CVD_UNAVAILABLE' },
    );
  }

  // Swings confirmed no later than the candle before the signal candle (zero lookahead).
  const swings = confirmedFractalSwings(cs, last - 1);
  const swingHighs = swings.filter((s) => s.type === 'SWING_HIGH');
  const swingLows = swings.filter((s) => s.type === 'SWING_LOW');
  const latestSwingBefore = (type: Swing['type'], k: number) => {
    const list = type === 'SWING_HIGH' ? swingHighs : swingLows;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].confirmedAt < k) return list[i];
    return undefined;
  };

  // S1 — Market structure (fixed 5-candle fractal, confirmed at t+2)
  const lastHigh = swingHighs.at(-1); const lastLow = swingLows.at(-1);
  const s1Pass = !!lastHigh && !!lastLow;
  const s1 = stage(1, 'Market Structure (Fixed 5-Candle Fractal, N=2)', 'STRUCTURE', s1Pass, s1Pass ? .95 : .4, 'Swing_t: High/Low strictly beyond t-2..t+2; confirmed at t+2', { Fractal_N: '2', Confirmed_Swing_Highs: String(swingHighs.length), Confirmed_Swing_Lows: String(swingLows.length), Latest_Swing_High: lastHigh ? `${fixed(lastHigh.price)} (confirmed bar ${lastHigh.confirmedAt})` : 'NONE', Latest_Swing_Low: lastLow ? `${fixed(lastLow.price)} (confirmed bar ${lastLow.confirmedAt})` : 'NONE', Zero_Lookahead: 'confirmedAt <= signal-1' }, s1Pass ? 'Confirmed swing structure mapped.' : 'No confirmed swing high/low pair.');

  // S2 — BOS: body close beyond the latest confirmed swing
  const bosLevel = isBull ? lastHigh : lastLow;
  const displacement = body(cur) / a14;
  const s2Pass = !!bosLevel && (isBull ? cur.close > bosLevel.price : cur.close < bosLevel.price);
  const s2 = stage(2, 'BOS (Body Close Beyond Confirmed Swing)', 'STRUCTURE', s2Pass, s2Pass ? (displacement >= 1.5 ? 1 : displacement >= 1.2 ? .95 : .85) : .2, isBull ? 'Close_t > latest confirmed Swing High' : 'Close_t < latest confirmed Swing Low', { Swing_Level: fixed(bosLevel?.price), Close: fixed(cur.close), Body_Closed_Beyond: bool(s2Pass), Displacement_ATR: fixed(displacement, 2) }, s2Pass ? 'Body-close break of structure confirmed.' : 'No body-close break of the latest confirmed swing.');

  // S3 — CHoCH: body-close break of the first opposite swing after an opposite-trend sequence
  const volumes = cs.map((c) => (typeof c.volume === 'number' ? c.volume : NaN));
  const deltaOf = (k: number) => cs[k].volumeDelta ?? (k > 0 && cs[k].cvd !== undefined && cs[k - 1].cvd !== undefined ? (cs[k].cvd as number) - (cs[k - 1].cvd as number) : undefined);
  let choch: { swing: Swing; breakIndex: number } | undefined;
  const opposite = isBull ? swingHighs : swingLows;
  for (let j = opposite.length - 1; j >= 1 && !choch; j--) {
    const sw = opposite[j]; const prev = opposite[j - 1];
    const counterTrend = isBull ? sw.price < prev.price : sw.price > prev.price;
    if (!counterTrend) continue;
    for (let k = sw.confirmedAt + 1; k <= last; k++) {
      if (isBull ? cs[k].close > sw.price : cs[k].close < sw.price) { if (k >= last - EVENT_LOOKBACK + 1) choch = { swing: sw, breakIndex: k }; break; }
    }
  }
  let chochFlow = true; let chochVol = 'NOT_APPLIED_PRICE_ONLY'; let chochDelta = 'NOT_APPLIED_PRICE_ONLY';
  if (full && choch) {
    const k = choch.breakIndex; const hist = volumes.slice(Math.max(0, k - 10), k);
    const volSpike = hist.length > 0 && volumes[k] > 1.5 * mean(hist);
    const delta = deltaOf(k);
    const aligned = delta !== undefined && (isBull ? delta > 0 : delta < 0);
    chochFlow = volSpike && aligned; chochVol = bool(volSpike); chochDelta = bool(aligned);
  }
  const s3Pass = !!choch && chochFlow;
  const s3 = stage(3, 'CHoCH (Price Structure; Volume/Delta FULL-only)', 'STRUCTURE', s3Pass, s3Pass ? .95 : choch ? .5 : .15, isBull ? 'Lower-high sequence then Close_k > that swing high' : 'Higher-low sequence then Close_k < that swing low', { Counter_Swing: fixed(choch?.swing.price), Break_Bar_Offset: choch ? String(last - choch.breakIndex) : 'NONE', Volume_Spike: chochVol, Delta_Aligned: chochDelta }, s3Pass ? 'Change of character confirmed by body close.' : 'No price CHoCH in the lookback.');

  // S4 — FVG with CE tracking (ATR-normalized minimum gap)
  const minGap = .2 * a14;
  const fvgAt = (k: number) => {
    const a = cs[k - 2]; const c = cs[k];
    if (isBull && c.low > a.high) { const gap = c.low - a.high; const ce = a.high + gap / 2; const status = cur.close <= a.high ? 'COMPLETELY_FILLED' : cur.close < ce ? 'CE_BREACHED' : cur.close < c.low ? 'PARTIAL_FILL' : 'UNMITIGATED'; return { gap, ce, status, valid: gap >= minGap, bottom: a.high, top: c.low }; }
    if (!isBull && c.high < a.low) { const gap = a.low - c.high; const ce = c.high + gap / 2; const status = cur.close >= a.low ? 'COMPLETELY_FILLED' : cur.close > ce ? 'CE_BREACHED' : cur.close > c.high ? 'PARTIAL_FILL' : 'UNMITIGATED'; return { gap, ce, status, valid: gap >= minGap, bottom: c.high, top: a.low }; }
    return undefined;
  };
  let fvg: ReturnType<typeof fvgAt>;
  for (let k = last; k >= Math.max(2, last - 5) && !fvg?.valid; k--) { const f = fvgAt(k); if (f && (f.status === 'UNMITIGATED' || f.status === 'PARTIAL_FILL')) fvg = f; }
  const s4Pass = !!fvg && fvg.valid && (fvg.status === 'UNMITIGATED' || fvg.status === 'PARTIAL_FILL');
  const s4 = stage(4, 'FVG Mechanics (Fair Value Gap & CE Tracking)', 'IMBALANCE', s4Pass, s4Pass ? (fvg!.status === 'PARTIAL_FILL' ? .95 : .85) : .1, 'Gap >= 0.2*ATR14; CE = gap midpoint', { Gap_Size: fixed(fvg?.gap), Min_Required_Gap: fixed(minGap), CE_Level: fixed(fvg?.ce), Status: fvg?.status ?? 'NONE' }, s4Pass ? 'Active directional imbalance.' : 'No active directional FVG in the last 6 candles.');

  // S5 — IFVG from a real prior FVG: body-close inversion then retest
  const ifvg = evaluateIfvg(cs.slice(-40), isBull ? 'BULLISH' : 'BEARISH');
  const s5Pass = ifvg.status === 'PASS';
  const s5 = stage(5, 'IFVG (Prior FVG Body-Close Inversion + Retest)', 'IMBALANCE', s5Pass, s5Pass ? .95 : ifvg.ifvg_status === 'IFVG_CANDIDATE' ? .5 : .2, 'Prior FVG -> opposite body close -> retest -> close beyond zone', { IFVG_Status: ifvg.ifvg_status, Original_FVG_Zone: ifvg.original_fvg_zone ? `[${fixed(ifvg.original_fvg_zone[0])}, ${fixed(ifvg.original_fvg_zone[1])}]` : 'NONE', Invalidation_Boundary: fixed(ifvg.invalidation_boundary) }, ifvg.reason ?? 'No IFVG state.');

  // S6 — BPR
  const bpr = detectBprFromCandles(cs.slice(-30));
  const s6Pass = bpr.status === 'PASS';
  const s6 = stage(6, 'BPR (Balanced Price Range)', 'IMBALANCE', s6Pass, s6Pass ? .9 : bpr.bpr_status === 'BPR_CANDIDATE' ? .5 : .2, 'Overlap of independently detected opposing FVGs, retested by signal candle', { BPR_Status: bpr.bpr_status, BPR_Lower_Bound: fixed(bpr.bpr_zone_low), BPR_Upper_Bound: fixed(bpr.bpr_zone_high), Overlap_Size: fixed(bpr.bpr_overlap_size) }, bpr.reason ?? 'No BPR state.');

  // Order-block detector shared by S7 (same direction) and S8 (failed opposite OB)
  const findOrderBlocks = (dir: 'BULLISH' | 'BEARISH') => {
    const out: Array<{ index: number; fvg: boolean }> = [];
    for (let i = Math.max(0, last - 40); i + 3 <= last; i++) {
      const ob = cs[i]; const e1 = cs[i + 1]; const e2 = cs[i + 2]; const e3 = cs[i + 3];
      const oppositeCandle = dir === 'BULLISH' ? bearish(ob) : bullish(ob);
      const expansion = dir === 'BULLISH'
        ? bullish(e1) && e2.close > e1.close && e3.close > e2.close && e3.close > ob.high
        : bearish(e1) && e2.close < e1.close && e3.close < e2.close && e3.close < ob.low;
      if (!oppositeCandle || !expansion) continue;
      const fvgConfluence = [i, i + 1].some((k) => dir === 'BULLISH' ? cs[k + 2].low > cs[k].high : cs[k + 2].high < cs[k].low);
      out.push({ index: i, fvg: fvgConfluence });
    }
    return out;
  };

  // S7 — Order Block: last opposite candle before a 3-candle expansion with FVG confluence; POC FULL-only
  const obs = findOrderBlocks(isBull ? 'BULLISH' : 'BEARISH').filter((o) => o.fvg && cs.slice(o.index + 4).every((c) => isBull ? c.close >= cs[o.index].low : c.close <= cs[o.index].high));
  const ob = obs.at(-1);
  let obPocPass = true; let obPocText = 'NOT_APPLIED_PRICE_ONLY'; let pocLabel: V3Decision['pocLabel'] = 'UNAVAILABLE';
  if (full && ob) {
    const poc = computeVolumeWeightedPoc([cs[ob.index]]);
    if (poc.available && poc.price !== undefined && range(cs[ob.index]) > 0) {
      const rel = (poc.price - cs[ob.index].low) / range(cs[ob.index]);
      obPocPass = isBull ? rel <= .35 : rel >= .65; obPocText = `${(rel * 100).toFixed(1)}%`; pocLabel = 'PROVIDER_VOLUME_POC';
    } else { obPocPass = false; obPocText = 'POC_UNAVAILABLE'; }
  }
  const s7Pass = !!ob && obPocPass;
  const s7 = stage(7, 'Order Block (Last Opposite Candle + 3-Candle Expansion + FVG)', 'IMBALANCE', s7Pass, s7Pass ? .95 : ob ? .5 : .3, 'OB = last opposite candle before 3-candle expansion beyond its extreme, with FVG confluence, not invalidated by close', { OB_High: fixed(ob ? cs[ob.index].high : null), OB_Low: fixed(ob ? cs[ob.index].low : null), OB_Bar_Offset: ob ? String(last - ob.index) : 'NONE', FVG_Confluence: bool(!!ob), POC_Relative_Position: obPocText }, s7Pass ? 'Valid order block with FVG confluence.' : 'No valid order block with FVG confluence.');

  // S9 sweep detector (shared with S8): pierce the latest confirmed swing and close back inside
  const sweepAt = (k: number) => {
    const sw = latestSwingBefore(isBull ? 'SWING_LOW' : 'SWING_HIGH', k);
    if (!sw) return undefined;
    const pierced = isBull ? cs[k].low < sw.price && cs[k].close > sw.price : cs[k].high > sw.price && cs[k].close < sw.price;
    return pierced ? sw : undefined;
  };

  // S8 — Breaker: real sweep then body-close break of a failed opposite OB
  const failedObs = findOrderBlocks(isBull ? 'BEARISH' : 'BULLISH');
  let breaker: { obIndex: number; breakIndex: number; sweepIndex: number } | undefined;
  for (let f = failedObs.length - 1; f >= 0 && !breaker; f--) {
    const i = failedObs[f].index; const level = isBull ? cs[i].high : cs[i].low;
    for (let k = i + 4; k <= last; k++) {
      if (isBull ? cs[k].close > level : cs[k].close < level) {
        if (k >= last - EVENT_LOOKBACK + 1) {
          for (let j = k; j > i; j--) if (sweepAt(j)) { breaker = { obIndex: i, breakIndex: k, sweepIndex: j }; break; }
        }
        break;
      }
    }
  }
  let s8Flow = true; let s8DeltaText = 'NOT_APPLIED_PRICE_ONLY'; let s8Unavailable: string | undefined;
  if (full && breaker) {
    const deltas = cs.slice(0, breaker.breakIndex).map((_, k) => deltaOf(k)).filter((v): v is number => v !== undefined).slice(-BREAKER_DELTA_SAMPLE);
    const dk = deltaOf(breaker.breakIndex);
    if (deltas.length < BREAKER_DELTA_SAMPLE || dk === undefined) s8Unavailable = 'BREAKER_DELTA_SAMPLE_LT_50';
    else { const sd = stdev(deltas); const z = sd > 0 ? (Math.abs(dk) - mean(deltas.map(Math.abs))) / sd : NaN; s8Flow = Number.isFinite(z) && z >= 2; s8DeltaText = fixed(z, 2); }
  }
  const s8Pass = !!breaker && s8Flow;
  const s8Raw = stage(8, 'Breaker Block (Sweep + Failed OB Body-Close Break)', 'IMBALANCE', s8Pass, s8Pass ? .92 : breaker ? .55 : .3, 'Real sweep (S9 rule) before body close through a failed opposite OB; FULL adds |delta| z >= 2.0 over 50', { Failed_OB_Level: fixed(breaker ? (isBull ? cs[breaker.obIndex].high : cs[breaker.obIndex].low) : null), Break_Bar_Offset: breaker ? String(last - breaker.breakIndex) : 'NONE', Liquidity_Sweep_Preceded: bool(!!breaker), Sweep_Bar_Offset: breaker ? String(last - breaker.sweepIndex) : 'NONE', Delta_Z: s8DeltaText }, s8Pass ? 'Breaker block confirmed.' : 'No breaker transition.');
  const s8 = s8Unavailable ? unavailable(s8Raw, s8Unavailable) : s8Raw;

  // S9 — Liquidity sweep in the recent window; FULL adds CVD divergence
  let sweep: { k: number; swing: Swing } | undefined;
  for (let k = last; k >= Math.max(0, last - SWEEP_LOOKBACK + 1) && !sweep; k--) { const sw = sweepAt(k); if (sw) sweep = { k, swing: sw }; }
  let s9Flow = true; let s9Cvd = 'CVD_UNAVAILABLE';
  if (full && sweep) {
    const now = cs[sweep.k].cvd; const then = cs[sweep.swing.index].cvd;
    s9Flow = now !== undefined && then !== undefined && (isBull ? now > then : now < then); s9Cvd = bool(s9Flow);
  }
  const s9Pass = !!sweep && s9Flow;
  const s9 = stage(9, 'Liquidity Sweep (Confirmed Swing Pierce + Close Back)', 'LIQUIDITY', s9Pass, s9Pass ? .98 : sweep ? .45 : .2, isBull ? 'Low_k < latest confirmed Swing Low AND Close_k > Swing Low' : 'High_k > latest confirmed Swing High AND Close_k < Swing High', { Price_Swept: bool(!!sweep), Swept_Level: fixed(sweep?.swing.price), Sweep_Bar_Offset: sweep ? String(last - sweep.k) : 'NONE', CVD_Divergence: full ? s9Cvd : 'CVD_UNAVAILABLE', CVD_Status: full ? 'AVAILABLE' : 'CVD_UNAVAILABLE' }, s9Pass ? 'Liquidity sweep validated.' : 'No liquidity sweep of a confirmed swing.');

  // S10/S11 — BSL/SSL pools (ATR-normalized), with untouched tracking for Gate 9
  const poolStart = Math.max(0, n - POOL_LOOKBACK);
  const pools = (side: 'BSL' | 'SSL') => {
    const tolerance = .10 * a14; const mergeDistance = .05 * a14;
    const merged: Array<{ price: number; touches: number; extreme: number; lastTouch: number }> = [];
    for (let i = poolStart; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const vi = side === 'BSL' ? cs[i].high : cs[i].low; const vj = side === 'BSL' ? cs[j].high : cs[j].low;
      if (Math.abs(vi - vj) > tolerance) continue;
      const price = (vi + vj) / 2; const extreme = side === 'BSL' ? Math.max(vi, vj) : Math.min(vi, vj);
      const m = merged.find((x) => Math.abs(x.price - price) <= mergeDistance);
      if (!m) merged.push({ price, touches: 2, extreme, lastTouch: j });
      else { m.price = (m.price * m.touches + price) / (m.touches + 1); m.touches++; m.extreme = side === 'BSL' ? Math.max(m.extreme, extreme) : Math.min(m.extreme, extreme); m.lastTouch = Math.max(m.lastTouch, j); }
    }
    const untouched = merged.filter((p) => cs.slice(p.lastTouch + 1).every((c) => side === 'BSL' ? c.high <= p.extreme : c.low >= p.extreme));
    return { merged, untouched, tolerance, mergeDistance, primary: [...merged].sort((a, b) => b.touches - a.touches)[0] };
  };
  const bsl = pools('BSL'); const ssl = pools('SSL');
  const s10 = stage(10, 'BSL Pool (ATR-Normalized Tolerance)', 'LIQUIDITY', !!bsl.primary, bsl.primary ? Math.min(.8 + bsl.primary.touches * .05, 1) : .35, 'Tolerance = 0.10*ATR14; Merge = 0.05*ATR14', { Dynamic_Tolerance: fixed(bsl.tolerance), Clusters: String(bsl.merged.length), Untouched_Pools: String(bsl.untouched.length), Primary_BSL: fixed(bsl.primary?.price), Touches: String(bsl.primary?.touches ?? 0) }, bsl.primary ? 'BSL pool mapped.' : 'No BSL pool.');
  const s11 = stage(11, 'SSL Pool (ATR-Normalized Tolerance)', 'LIQUIDITY', !!ssl.primary, ssl.primary ? Math.min(.8 + ssl.primary.touches * .05, 1) : .35, 'Tolerance = 0.10*ATR14; Merge = 0.05*ATR14', { Dynamic_Tolerance: fixed(ssl.tolerance), Clusters: String(ssl.merged.length), Untouched_Pools: String(ssl.untouched.length), Primary_SSL: fixed(ssl.primary?.price), Touches: String(ssl.primary?.touches ?? 0) }, ssl.primary ? 'SSL pool mapped.' : 'No SSL pool.');
  const target = (isBull ? bsl.untouched.filter((p) => p.price > cur.close).sort((a, b) => a.price - b.price) : ssl.untouched.filter((p) => p.price < cur.close).sort((a, b) => b.price - a.price))[0];

  // S12/S13 — Gate 4 uses the latest confirmed pre-signal swing range.
  // The signal candle is excluded from swing confirmation and from the range.
  // Gate 4 B: every available directional reference-zone midpoint must be in
  // the favourable half; no range or no valid zone fails closed.
  const rangeHigh = latestSwingBefore('SWING_HIGH', last)?.price;
  const rangeLow = latestSwingBefore('SWING_LOW', last)?.price;
  const hasConfirmedRange = rangeHigh !== undefined && rangeLow !== undefined && rangeHigh > rangeLow;
  const rangeEquilibrium = hasConfirmedRange ? (rangeHigh! + rangeLow!) / 2 : undefined;
  type ReferenceZone = { name: string; direction: 'BULLISH' | 'BEARISH'; bottom: number; top: number; midpoint: number };
  const referenceZones: ReferenceZone[] = [];
  // OB: retain every valid candidate in the 40-candle lookback. Breaker: use
  // only the latest detected transition because older failed transitions are
  // superseded by the most recent confirmed breaker.
  for (const candidate of obs) { const c = cs[candidate.index]; referenceZones.push({ name: `OB@${candidate.index}`, direction: isBull ? 'BULLISH' : 'BEARISH', bottom: c.low, top: c.high, midpoint: (c.low + c.high) / 2 }); }
  if (breaker) {
    const breakerOb = failedObs.find((x) => x.index === breaker!.obIndex);
    if (breakerOb) {
      const bc = cs[breakerOb.index];
      referenceZones.push({ name: `Breaker@${breakerOb.index}`, direction: isBull ? 'BULLISH' : 'BEARISH', bottom: bc.low, top: bc.high, midpoint: (bc.low + bc.high) / 2 });
    }
  }
  if (referenceZones.length === 0) {
    if (fvg && fvg.valid && (fvg.status === 'UNMITIGATED' || fvg.status === 'PARTIAL_FILL')) {
      const fvgBottom = fvg.bottom;
      const fvgTop = fvg.top;
      referenceZones.push({ name: 'FVG', direction: isBull ? 'BULLISH' : 'BEARISH', bottom: Math.min(fvgBottom, fvgTop), top: Math.max(fvgBottom, fvgTop), midpoint: (fvgBottom + fvgTop) / 2 });
    } else if (s5Pass && ifvg.original_fvg_zone && ifvg.ifvg_direction === (isBull ? 'BULLISH' : 'BEARISH')) {
      const [bottom, top] = ifvg.original_fvg_zone;
      referenceZones.push({ name: 'IFVG', direction: isBull ? 'BULLISH' : 'BEARISH', bottom, top, midpoint: (bottom + top) / 2 });
    } else if (s6Pass && bpr.bpr_zone_low !== undefined && bpr.bpr_zone_high !== undefined) {
      const bottom = bpr.bpr_zone_low; const top = bpr.bpr_zone_high;
      referenceZones.push({ name: 'BPR', direction: isBull ? 'BULLISH' : 'BEARISH', bottom, top, midpoint: (bottom + top) / 2 });
    }
  }
  const gate4ReasonCode = classifyGate4Reason(isBull ? 'BULLISH' : 'BEARISH', rangeHigh, rangeLow, referenceZones.map((z) => z.midpoint));
  const favourableMidpoints = gate4ReasonCode === 'PASS';
  const legacyWindow20 = cs.slice(-20);
  const legacyHigh = Math.max(...legacyWindow20.map((c) => c.high)); const legacyLow = Math.min(...legacyWindow20.map((c) => c.low));
  const legacyEquilibrium = legacyLow + (legacyHigh - legacyLow) / 2;
  const s12Pass = input.gate4Mode === 'A' ? (isBull ? cur.close <= legacyEquilibrium : cur.close >= legacyEquilibrium) : favourableMidpoints;
  const s12 = stage(12, 'Premium / Discount (Zone vs Confirmed-Range EQ)', 'EQUILIBRIUM', s12Pass, s12Pass ? .95 : .2, 'R = [latest confirmed pre-signal swing low, latest confirmed pre-signal swing high]; EQ=(R_low+R_high)/2; every reference-zone midpoint must be favourable', {
    Range_High: fixed(rangeHigh), Range_Low: fixed(rangeLow), Equilibrium: fixed(rangeEquilibrium), Gate4_Mode: input.gate4Mode ?? 'B', Reference_Zones: referenceZones.map((z) => `${z.name}[${z.direction}]`).join(',') || 'NONE',
    Reference_Midpoints: referenceZones.map((z) => `${z.name}[${z.direction}]=${fixed(z.midpoint)}`).join(',') || 'NONE', Gate4_Reason_Code: gate4ReasonCode, Midpoints_Favourable: bool(favourableMidpoints), Signal_Candle_Excluded: 'true'
  }, gate4ReasonCode === 'RANGE_UNAVAILABLE' ? 'RANGE_UNAVAILABLE: no confirmed pre-signal swing range.' : gate4ReasonCode === 'ZONE_UNAVAILABLE' ? 'ZONE_UNAVAILABLE: no valid directional OB/Breaker/FVG/IFVG/BPR zone.' : gate4ReasonCode === 'MID_AT_EQ' ? 'MID_AT_EQ: a reference-zone midpoint equals equilibrium.' : gate4ReasonCode === 'ZONE_ON_WRONG_SIDE' ? 'ZONE_ON_WRONG_SIDE: a reference-zone midpoint is unfavourable.' : 'Every reference-zone midpoint is in the favourable half.');
  // OTE remains the pre-existing 20-candle confluence calculation; it never blocks Gate 4.
  const oteWindow = cs.slice(-20);
  const anchorHigh = Math.max(...oteWindow.map((c) => c.high)); const anchorLow = Math.min(...oteWindow.map((c) => c.low));
  const span = anchorHigh - anchorLow;
  const fib = (r: number) => isBull ? anchorHigh - span * r : anchorLow + span * r;
  const inOte = isBull ? cur.close <= fib(.618) && cur.close >= fib(.786) : cur.close >= fib(.618) && cur.close <= fib(.786);
  const sweet = inOte && Math.abs(cur.close - fib(.705)) <= span * .05;
  const s13 = stage(13, 'OTE (61.8-78.6%, 70.5% Sweet Spot) — confluence', 'EQUILIBRIUM', inOte, sweet ? 1 : inOte ? .85 : .3, 'OTE = [61.8%, 78.6%]', { 'Fib_61.8': fixed(fib(.618)), 'Fib_70.5': fixed(fib(.705)), 'Fib_78.6': fixed(fib(.786)), In_OTE: bool(inOte), Sweet_Spot: bool(sweet) }, inOte ? 'Entry within OTE.' : 'Outside OTE (confluence only).');

  // S14 — wick pushback
  const wick = isBull ? upperWick(cur) : lowerWick(cur);
  const wr = range(cur) > 0 ? wick / range(cur) : null;
  const s14Pass = wr !== null && wr <= .5;
  const s14 = stage(14, 'Wick Pushback (Rejection Wick <= 50%)', 'MECHANICS', s14Pass, wr === null ? 0 : wr <= .2 ? 1 : wr <= .35 ? .85 : wr <= .5 ? .7 : .15, 'Wick_Ratio = opposing wick / range <= 0.50', { Total_Range: fixed(range(cur)), Rejection_Wick: fixed(wick), Wick_Ratio: fixed(wr, 3), Threshold: '0.500' }, wr === null ? 'Zero-range candle: fail-closed.' : s14Pass ? 'Clean expansion.' : 'Wick fakeout.');

  // S15 — momentum: body above 10-period mean body; flat windows fail closed
  const hist = cs.slice(-11, -1).map(body); const meanBody = mean(hist); const sdBody = stdev(hist);
  const flat = sdBody < .05 * a14;
  const z = flat ? null : (body(cur) - meanBody) / sdBody;
  const s15Pass = !flat && body(cur) > meanBody;
  const s15 = stage(15, 'Momentum (Body > 10-Period Mean Body)', 'MECHANICS', s15Pass, !s15Pass ? .25 : z !== null && z >= 2.5 ? 1 : z !== null && z >= 1.5 ? .9 : .75, 'Body_t > Mean(Body_10); FLAT if StdDev(Body_10) < 0.05*ATR14', { Current_Body: fixed(body(cur)), Mean_Body_10: fixed(meanBody), StdDev_Body_10: fixed(sdBody), Z_Score: fixed(z, 2), Flat_Window: bool(flat) }, flat ? 'FLAT_WINDOW: momentum unavailable, fail-closed.' : s15Pass ? 'Impulse above baseline.' : 'Sub-baseline momentum.');

  // S16/S17 — sessions and kill zones (owner N1 rules)
  const sessionTs = input.timestamp ?? cur.timestamp;
  const si = classifySessionAndKillZone(sessionTs);
  const s16Pass = isCoreSession(si.session);
  const s17Pass = si.kill_zone === 'INSIDE_KILL_ZONE';
  const s16 = stage(16, 'Session (London 07:00 -> New York 16:00 local; Asia context only)', 'SESSION_RISK', s16Pass, s16Pass ? .9 : .3, 'IANA Europe/London & America/New_York; DST-aware', { Session: si.session, Session_Start_UTC: si.session_start_utc, Session_End_UTC: si.session_end_utc, Timestamp_UTC: si.timestamp_utc, Timestamp_BDT: si.timestamp_bdt }, s16Pass ? `Core ${si.session} session.` : 'Outside core session.');
  const s17 = stage(17, 'Kill Zone (London/New York 07:00-10:00 local)', 'SESSION_RISK', s17Pass, s17Pass ? .95 : .3, 'London 07-10 Europe/London; New York 07-10 America/New_York', { Kill_Zone: si.kill_zone, Kill_Zone_Name: si.kill_zone_name ?? 'NONE', Kill_Zone_Start_UTC: si.kill_zone_start_utc ?? 'NONE', Kill_Zone_End_UTC: si.kill_zone_end_utc ?? 'NONE' }, s17Pass ? `${si.kill_zone_name} kill zone active.` : 'Outside kill zones.');

  // S18 — news guard (operational guard, not a strategy gate)
  const at = Date.parse(sessionTs);
  let newsBlocked = false; let nearest = 'None'; let nearestDiff = Number.POSITIVE_INFINITY;
  for (const event of input.newsEvents) {
    if (event.impact !== 'HIGH') continue;
    const diff = Math.abs(at - Date.parse(event.timestamp));
    if (diff < nearestDiff) { nearestDiff = diff; nearest = event.title; }
    if (diff <= 30 * 60_000) newsBlocked = true;
  }
  const s18Pass = input.newsSourceOnline && !newsBlocked;
  const newsReason = !input.newsSourceOnline ? 'NEWS_SOURCE_OFFLINE: fail-safe NO_TRADE.' : newsBlocked ? `NEWS_WINDOW_BLOCKED: ${nearest} within +/-30m.` : 'NEWS: NOT CHECKED (manual)';
  const s18 = stage(18, 'News Guard (Operational Guard)', 'SESSION_RISK', s18Pass, s18Pass ? 1 : 0, 'Manual review required; calendar events are not automatically verified.', { Manual_News_Review: 'NOT_CHECKED (manual)', News_Window_Blocked: bool(newsBlocked), Nearest_High_Impact: Number.isFinite(nearestDiff) ? nearest : 'UNAVAILABLE', Minutes_To_Event: Number.isFinite(nearestDiff) ? String(Math.floor(nearestDiff / 60000)) : 'UNAVAILABLE', Spread_Guard: 'NOT_APPLICABLE_BINARY' }, newsReason);

  // S19 — MFCI (weights frozen; M1-M4 act on gates only)
  const meanAvailable = (items: V3Stage[]) => { const xs = items.filter((s) => s.available && s.score !== null).map((s) => s.score as number); return xs.length ? mean(xs) : null; };
  const sStructure = meanAvailable([s1, s2]);
  const sOrderFlow = full ? meanAvailable([s3, s7, s9]) : null;
  const sLiquidity = full ? meanAvailable([s9, s10, s11, s8]) : meanAvailable([s9, s10, s11]);
  const totalMfci = sStructure === null || sLiquidity === null ? null : sOrderFlow === null ? (.35 * sStructure + .20 * sLiquidity) / .55 : (.35 * sStructure + .25 * sOrderFlow + .20 * sLiquidity) / .80;
  const meets = totalMfci !== null && totalMfci >= MFCI_THRESHOLD;
  const s19 = stage(19, 'Multi-Factor Confluence Index (MFCI)', 'CONFLUENCE', meets, totalMfci ?? 0, full ? 'MFCI = (0.35*S + 0.25*OF + 0.20*L) / 0.80' : 'MFCI = (0.35*S + 0.20*L) / 0.55', { S_Structure: fixed(sStructure, 3), S_OrderFlow: fixed(sOrderFlow, 3), S_Liquidity: fixed(sLiquidity, 3), Total_MFCI: fixed(totalMfci, 3), Threshold: MFCI_THRESHOLD.toFixed(3) }, meets ? 'MFCI met the frozen threshold.' : 'MFCI below frozen threshold.');

  const stages = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19];
  const g = (gateNumber: number, name: string, status: V3GateStatus, reason: string, metricDetails: string): V3Gate => ({ gateNumber, name, status, reason, metricDetails });
  const gates: V3Gate[] = [
    g(1, 'Market Structure (S1 + S2 BOS + S3 CHoCH)', s1.passed && s2.passed && s3.passed ? 'PASS' : s1.passed && (s2.passed || s3.passed) ? 'HOLD' : 'BLOCKED', 'GATE1_STRUCTURE: confirmed swings, body-close BOS and price CHoCH required', `${s1.passed}/${s2.passed}/${s3.passed}`),
    g(2, 'Imbalance (FVG / IFVG / BPR)', s4.passed || s5.passed || s6.passed ? 'PASS' : 'BLOCKED', 'GATE2_IMBALANCE: active FVG, confirmed IFVG or BPR required', `${s4.passed}/${s5.passed}/${s6.passed}`),
    g(3, 'Order Block & Breaker', s7.passed || s8.passed ? 'PASS' : 'BLOCKED', 'GATE3_OB_BREAKER: price-based order block or breaker required', `${s7.passed}/${s8.passed}`),
    g(4, 'Premium / Discount (Zone vs Confirmed-Range EQ)', s12.passed ? 'PASS' : 'BLOCKED', 'GATE4_PD: confirmed pre-signal swing range and every reference-zone midpoint must be favourable', `${s12.passed}/${s13.passed}`),
    g(5, 'Wick Pushback', s14.passed ? 'PASS' : 'BLOCKED', 'GATE5_WICK: rejection wick ratio must be <= 0.50', String(s14.passed)),
    g(6, 'Liquidity Sweep', s9.passed ? 'PASS' : 'BLOCKED', 'GATE6_SWEEP: sweep of a confirmed swing required', String(s9.passed)),
    g(7, 'Momentum', s15.passed ? 'PASS' : 'HOLD', 'GATE7_MOMENTUM: body must exceed 10-period mean body (flat window fails closed)', String(s15.passed)),
    g(8, 'Session & Kill Zone', s16.passed && s17.passed ? 'PASS' : s16.passed ? 'HOLD' : 'BLOCKED', 'GATE8_SESSION: core session and London/New York kill zone required', `${s16.passed}/${s17.passed}`),
    g(9, 'BSL/SSL Target', target ? 'PASS' : 'BLOCKED', `GATE9_TARGET: untouched ${isBull ? 'BSL above' : 'SSL below'} entry required`, target ? fixed(target.price) : 'NONE'),
  ];
  const operationalGuards: V3OperationalGuard[] = [{ name: 'News Guard', status: s18Pass ? 'PASS' : 'BLOCKED', reason: newsReason }];

  const guardBlocked = operationalGuards.some((x) => x.status === 'BLOCKED');
  const applicable = gates.filter((x) => x.status !== 'UNAVAILABLE');
  const failed = applicable.find((x) => x.status !== 'PASS');
  const allGates = applicable.length === gates.length && !failed;
  const allPassed = allGates && meets && !guardBlocked;
  const systemDecision: V3SystemDecision = allPassed ? 'PASS' : guardBlocked || applicable.some((x) => x.status === 'BLOCKED') ? 'BLOCKED' : 'HOLD';
  const finalAction: V3FinalAction = systemDecision === 'PASS' ? 'MANUAL_ALERT' : systemDecision === 'HOLD' ? 'SAFE_HOLD' : 'NO_ACTION';
  const statusReason = allPassed
    ? 'All owner gates passed; NEWS: NOT CHECKED (manual); MFCI met the frozen 0.85 threshold.'
    : guardBlocked ? newsReason
    : failed ? failed.reason
    : 'MFCI_BELOW_THRESHOLD: confluence below frozen 0.85.';
  return {
    version: 'RDP_STRATEGY_V3.0', direction: d, htfBias: input.htfBias, stages, gates, operationalGuards, engineMode, excludedStages,
    mfci: { sStructure, sOrderFlow, sLiquidity, totalMfci, meetsThreshold: meets },
    systemDecision, finalAction,
    binarySignal: allPassed ? (isBull ? 'CALL' : 'PUT') : 'NO_TRADE',
    mfciBand: totalMfci === null ? 'UNAVAILABLE' : meets ? 'ABOVE_THRESHOLD' : 'BELOW_THRESHOLD',
    status: systemDecision, statusReason, firstFailedGate: failed?.gateNumber,
    signalCandleOpenTs: cur.timestamp, pocLabel, entryPrice: cur.close,
  };
}
