// 9-Stage Deterministic Validation Pipeline Controller
// Strategy v1.0-FROZEN Master Specification (EXP-2026-001)
// Mode: Research / Decision-Support / Manual Alert Only
// Architectural Boundary: Strictly Non-Execution
import { createHash } from 'node:crypto';

import {
  Candle,
  MasterTelemetry,
  NewsEvent,
  Timeframe,
  DataQuality,
  DataProvenance,
} from './types';
import { ACTIVE_STRATEGY_VERSION, ACTIVE_EXPERIMENT_ID, CONFIG_HASH, CONFIG_HASH_EPOCH } from './manifest';
import { formatSignalTime } from '../utils/timeFormat';
import { evaluateStrategyV3 } from './strategyV3Engine';
import { classifySessionAndKillZone } from './session';
import { deriveHtfBias, MIN_ENGINE_CANDLES } from './strategyV3Engine';
import { timeframeMs, validateCandleSeries } from './dataIntegrity';
import { isFxMarketClosed } from './marketHours';

export interface PipelineInput {
  candles: Candle[]; // historical candle sequence, ordered oldest to newest
  currentCandleIndex: number; // index of currently forming / closed confirmation candle (C3)
  selectedTimeframe: Timeframe;
  higherTimeframeBias?: 'BULLISH' | 'BEARISH' | 'UNCLEAR';
  newsEvents: NewsEvent[];
  newsSourceOnline: boolean;
  dataProvenance?: DataProvenance;
  provider?: 'TWELVE_DATA';
  clockStatus?: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' | 'CLOCK_UNVERIFIED';
  pair?: string;
  asset?: string;
  payoutPct?: number;
  payoutSetAt?: string;
  /** Closed 1h candles; when supplied the engine derives HTF bias itself from the latest closed 1h structure. */
  htfCandles?: Candle[];
  /** Wall-clock used for the forming-candle check. Live callers pass Date.now(); R8 passes the causal replay clock. */
  nowMs?: number;
  gate4Mode?: 'A' | 'B';
}

export const MIN_PAYOUT_PCT = 85;

const deterministicSetupId = (pair: string, timeframe: Timeframe, signalTimestamp: string, engine: string) =>
  `V3-${createHash('sha256').update(`${pair}|${timeframe}|${signalTimestamp}|${engine}`).digest('hex').slice(0, 20)}`;

export function executeStrategyPipeline(input: PipelineInput): MasterTelemetry {
  const {
    candles: inputCandles,
    currentCandleIndex,
    selectedTimeframe,
    higherTimeframeBias = 'UNCLEAR',
    newsEvents,
    newsSourceOnline,
    pair = 'EUR/USD',
    asset = 'EUR/USD',
  } = input;
  // Zero lookahead: the authoritative engine never sees candles after the decision candle.
  const candles = Array.isArray(inputCandles) ? inputCandles.slice(0, Math.max(0, currentCandleIndex + 1)) : inputCandles;
  const dataProvenance: DataProvenance = input.dataProvenance ?? 'NOT_LIVE';
  const failContext = { dataProvenance, provider: input.provider, payoutPct: input.payoutPct, signalCandleOpenTs: candles?.[currentCandleIndex]?.timestamp ?? null };
  const decisionCandle = candles?.[currentCandleIndex];
  if (decisionCandle && (isFxMarketClosed(decisionCandle.timestamp) || isFxMarketClosed(Date.parse(decisionCandle.timestamp) + timeframeMs(selectedTimeframe)))) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', 'MARKET_CLOSED', decisionCandle.timestamp, failContext);
  }
  if (dataProvenance !== 'LIVE_INGESTED') {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', `NOT_LIVE_DATA: ${dataProvenance} is not verified live provider data. NO_TRADE.`, new Date().toISOString(), failContext);
  }
  if (input.clockStatus !== undefined && input.clockStatus !== 'CLOCK_OK') {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', `CLOCK_UNVERIFIED: provider clock status is ${input.clockStatus}. NO_TRADE.`, new Date().toISOString(), failContext);
  }
  if (input.payoutPct === undefined || input.payoutPct === null || !Number.isFinite(input.payoutPct)) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', 'PAYOUT_UNSET: payout not set via Telegram. NO_TRADE.', new Date().toISOString(), failContext);
  }
  if (input.payoutPct < MIN_PAYOUT_PCT) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', `PAYOUT_BELOW_MIN: ${input.payoutPct}% < ${MIN_PAYOUT_PCT}%. NO_TRADE.`, new Date().toISOString(), failContext);
  }
  const series = candles ? candles.slice(0, currentCandleIndex + 1) : [];
  const qualityNowMs = input.nowMs ?? (decisionCandle ? Date.parse(decisionCandle.timestamp) + timeframeMs(selectedTimeframe) : Date.now());
  const quality = validateCandleSeries(series, { timeframe: selectedTimeframe, nowMs: qualityNowMs, minCandles: MIN_ENGINE_CANDLES });
  if (!quality.ok) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'INVALID', `DATA_QUALITY_FAIL: ${quality.issues.slice(0, 3).map((issue) => `${issue.code} ${issue.detail}`).join('; ')}`, new Date().toISOString(), { ...failContext, dataQualityIssues: quality.issues.map((issue) => issue.code) });
  }
  const signalCloseIso = candles?.[currentCandleIndex] ? new Date(Date.parse(candles[currentCandleIndex].timestamp) + timeframeMs(selectedTimeframe)).toISOString() : new Date(0).toISOString();
  const resolvedHtfBias = input.htfCandles ? deriveHtfBias(input.htfCandles, signalCloseIso) : higherTimeframeBias;
  if (resolvedHtfBias === 'UNCLEAR') {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'DEGRADED', 'HTF_BIAS_UNCLEAR: 1h higher-timeframe bias is unavailable or unclear. NO_TRADE.', new Date().toISOString(), failContext);
  }

  if (!candles || candles.length < 5 || currentCandleIndex < 4) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'INVALID', 'Insufficient candle history for V3 evaluation.', new Date().toISOString(), failContext);
  }
  const c3 = candles[currentCandleIndex];
  const resolvedProvenance: DataProvenance = dataProvenance;
  const v3Decision = evaluateStrategyV3({ candles: candles.slice(0, currentCandleIndex + 1), htfBias: resolvedHtfBias, newsEvents, newsSourceOnline, timeframe: selectedTimeframe, timestamp: c3.timestamp, nowMs: input.nowMs, gate4Mode: input.gate4Mode });
  if (v3Decision.mfci.totalMfci === null || v3Decision.mfci.sStructure === null || v3Decision.mfci.sLiquidity === null || v3Decision.entryPrice === null) {
    return createInconclusiveTelemetry(pair, asset, selectedTimeframe, 'INVALID', v3Decision.statusReason, new Date().toISOString(), failContext);
  }
  const v3Telemetry = {
    ...v3Decision,
    mfci: {
      ...v3Decision.mfci,
      sStructure: v3Decision.mfci.sStructure ?? Number.NaN,
      sLiquidity: v3Decision.mfci.sLiquidity ?? Number.NaN,
      totalMfci: v3Decision.mfci.totalMfci ?? Number.NaN,
    },
    entryPrice: v3Decision.entryPrice ?? Number.NaN,
  };
  const nowIso = new Date().toISOString();
  const setupId = deterministicSetupId(pair, selectedTimeframe, c3.timestamp, 'V3');
  const system_decision: 'PASS' | 'REJECT' | 'INCONCLUSIVE' = v3Decision.systemDecision === 'PASS' ? 'PASS' : v3Decision.systemDecision === 'BLOCKED' ? 'REJECT' : 'INCONCLUSIVE';
  const final_action = v3Decision.finalAction;
  const failedGate = v3Decision.gates.find((gate) => gate.status !== 'PASS');
  const blockedGuard = v3Decision.operationalGuards.find((guard) => guard.status === 'BLOCKED');
  const halted_at_stage = v3Decision.systemDecision === 'PASS' ? undefined : blockedGuard ? `Operational Guard: ${blockedGuard.name}` : `V3 Gate ${failedGate?.gateNumber ?? 9}`;
  const rejection_reason = v3Decision.systemDecision === 'PASS' ? undefined : blockedGuard?.reason ?? failedGate?.reason ?? v3Decision.statusReason;
  const dataQuality: DataQuality = Math.abs(c3.high - c3.low) <= 0.000001 ? 'DEGRADED' : 'COMPLETE';
  const sessionInfo = classifySessionAndKillZone(c3.timestamp);
  const hasDirectionalSignal = system_decision === 'PASS' && (v3Telemetry.binarySignal === 'CALL' || v3Telemetry.binarySignal === 'PUT');
  const effectiveBias = resolvedHtfBias;
  const newsEventDetected = blockedGuard?.name === 'News Guard';
  const newsWindowState = newsEventDetected ? 'ACTIVE' : 'CLEAR';
  const newsReason = blockedGuard?.reason ?? 'NOT_CHECKED (manual)';
  return {
    decision_engine_v3: v3Telemetry,
    ...(hasDirectionalSignal ? {
      candle_snapshot: {
        candles: candles.slice(Math.max(0, currentCandleIndex - 39), currentCandleIndex + 1),
        signal_candle_open_ts: c3.timestamp,
        source: 'SIGNAL_TELEMETRY' as const,
        setup_id: setupId,
      },
    } : {}),
    metadata: {
      project_name: 'ComVision Strategy Research Engine',
      strategy_version: ACTIVE_STRATEGY_VERSION,
      experiment_id: ACTIVE_EXPERIMENT_ID,
      setup_id: setupId,
      config_hash: CONFIG_HASH,
      config_hash_epoch: CONFIG_HASH_EPOCH,
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
      context_state: v3Decision.direction === higherTimeframeBias ? 'ALIGNED' : 'TRANSITION',
      regime_tag: v3Decision.direction === 'NEUTRAL' ? 'UNCLEAR' : 'TRENDING',
      session: sessionInfo.session,
      kill_zone: sessionInfo.kill_zone,
      session_start_utc: sessionInfo.session_start_utc,
      session_end_utc: sessionInfo.session_end_utc,
    },
    guardrails: {
      news_guard: {
        news_event_detected: newsEventDetected,
        news_window_state: newsWindowState,
        news_source: 'NOT_CHECKED (manual)',
        reason: 'NOT_CHECKED (manual)',
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
  context: { dataProvenance?: DataProvenance; provider?: 'TWELVE_DATA'; payoutPct?: number; signalCandleOpenTs?: string | null; dataQualityIssues?: string[] } = {}
): MasterTelemetry {
  return {
    metadata: {
      project_name: 'ComVision Strategy Research Engine',
      strategy_version: ACTIVE_STRATEGY_VERSION,
      experiment_id: ACTIVE_EXPERIMENT_ID,
      setup_id: deterministicSetupId(pair, timeframe, nowIso, 'V3_FAIL_CLOSED'),
      config_hash: CONFIG_HASH,
      config_hash_epoch: CONFIG_HASH_EPOCH,
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
    guardrails: { news_guard: { news_event_detected: false, news_window_state: 'NEWS_DATA_UNAVAILABLE', news_source: 'NOT_CHECKED (manual)', reason: 'NOT_CHECKED (manual)' } },
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
