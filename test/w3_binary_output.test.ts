import assert from 'node:assert/strict';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import { htfCandlesFor, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

const candles = idealPriceOnlySetup(1.085, '15m', 'BULLISH');
const signalClose = Date.parse(SIGNAL_TS) + 15 * 60_000;
const input = {
  decisionEngineVersion: 'V3' as const, candles, currentCandleIndex: candles.length - 1, selectedTimeframe: '15m' as const,
  htfCandles: htfCandlesFor('BULLISH', new Date(signalClose).toISOString()), newsEvents: [], newsSourceOnline: true,
  dataProvenance: 'LIVE_INGESTED' as const, provider: 'TWELVE_DATA' as const, pair: 'EUR/USD', payoutPct: 87, payoutSetAt: '2026-01-14T07:00:00.000Z', nowMs: signalClose + 3_000,
};
const first = executeStrategyPipeline(input);
const second = executeStrategyPipeline(input);
assert.equal(first.metadata.setup_id, second.metadata.setup_id);
assert.match(first.metadata.setup_id, /^V3-[a-f0-9]{20}$/);
assert.equal(first.decision_engine_v3?.binarySignal, 'CALL');
// Required telemetry on every evaluation.
const m = first.metadata;
for (const key of ['engine_mode', 'excluded_stages', 'mfci_total', 'mfci_structure', 'mfci_orderflow', 'mfci_liquidity', 'mfci_band', 'status', 'status_reason', 'payout_pct', 'signal_candle_open_ts', 'data_provenance', 'provider', 'poc_label', 'decision_engine'] as const) assert.ok(key in m, `metadata.${key} missing`);
assert.equal(m.decision_engine, 'decision_engine_v3');
assert.equal(m.signal_candle_open_ts, SIGNAL_TS);
assert.equal(m.provider, 'TWELVE_DATA');
assert.equal(m.payout_source, 'TELEGRAM_MANUAL');
assert.equal(m.mfci_orderflow, null);
assert.equal(m.htf_bias, 'BULLISH');
for (const banned of ['stopLoss', 'takeProfit1', 'takeProfit2', 'riskRewardRatio']) assert.equal(banned in (first.decision_engine_v3 || {}), false);

// NO_TRADE records carry the same telemetry keys, with null (never zero) for unavailable MFCI.
const unset = executeStrategyPipeline({ ...input, payoutPct: undefined });
assert.match(unset.metadata.status_reason || '', /^PAYOUT_UNSET/);
assert.equal(unset.metadata.mfci_total, null); assert.equal(unset.metadata.mfci_band, 'UNAVAILABLE'); assert.equal(unset.metadata.decision_engine, 'decision_engine_v3');
assert.match(executeStrategyPipeline({ ...input, payoutPct: 84.99 }).metadata.status_reason || '', /^PAYOUT_BELOW_MIN/);
assert.equal(executeStrategyPipeline({ ...input, payoutPct: 85 }).decision_engine_v3?.binarySignal, 'CALL');
const notLive = executeStrategyPipeline({ ...input, dataProvenance: undefined });
assert.equal(notLive.metadata.data_provenance, 'NOT_LIVE'); assert.match(notLive.metadata.status_reason || '', /^NOT_LIVE_DATA/);
const opposite = executeStrategyPipeline({ ...input, htfCandles: htfCandlesFor('BEARISH', new Date(signalClose).toISOString()) });
assert.equal(opposite.decision_engine_v3?.binarySignal ?? 'NO_TRADE', 'NO_TRADE');
console.log('=== W3 BINARY OUTPUT: CALL/PUT/NO_TRADE, full telemetry incl. NO_TRADE, payout boundary, NOT_LIVE, no SL/TP passed ===');
