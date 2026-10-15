import assert from 'node:assert/strict';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import { idealPriceOnlySetup } from './fixtures/v3Reachability';

const candles = idealPriceOnlySetup(1.085, '5m', 'BULLISH');
const input = {
  decisionEngineVersion: 'V3' as const,
  candles,
  currentCandleIndex: candles.length - 1,
  selectedTimeframe: '5m' as const,
  higherTimeframeBias: 'BULLISH' as const,
  newsEvents: [],
  newsSourceOnline: true,
  dataProvenance: 'LIVE_INGESTED' as const,
  provider: 'TWELVE_DATA' as const,
  pair: 'EUR/USD',
};
const first = executeStrategyPipeline(input);
const second = executeStrategyPipeline(input);
assert.equal(first.metadata.setup_id, second.metadata.setup_id);
assert.match(first.metadata.setup_id, /^V3-[a-f0-9]{20}$/);
assert.ok(['CALL', 'PUT', 'NO_TRADE'].includes(first.decision_engine_v3?.binarySignal || 'NO_TRADE'));
assert.ok(first.decision_engine_v3?.mfciBand);
assert.equal(first.metadata.engine_mode, first.decision_engine_v3?.engineMode);
assert.deepEqual(first.metadata.excluded_stages, first.decision_engine_v3?.excludedStages);
assert.match(first.metadata.status_reason || '', /.+/);
assert.equal('stopLoss' in (first.decision_engine_v3 || {}), false);
assert.equal('takeProfit1' in (first.decision_engine_v3 || {}), false);
assert.equal('takeProfit2' in (first.decision_engine_v3 || {}), false);
console.log('=== W3 BINARY OUTPUT: deterministic ID, binary signal, telemetry and no SL/TP passed ===');
