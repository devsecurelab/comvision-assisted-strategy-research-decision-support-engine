import assert from 'node:assert/strict';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import type { Candle } from '../src/engine/types';

const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 13, i)).toISOString(),
  open: 1.08 + i * 0.0001, high: 1.081 + i * 0.0001,
  low: 1.079 + i * 0.0001, close: 1.0805 + i * 0.0001, volume: null,
}));
const v3 = evaluateStrategyV3({ candles, direction: 'BULLISH', newsEvents: [], newsSourceOnline: true });
assert.equal(v3.version, 'RDP_STRATEGY_V3.0');
assert.equal(v3.stages.length, 19);
assert.equal(v3.gates.length, 9);
assert.equal(v3.mfci.sVisionAi, 0);
assert.ok(Math.abs(v3.mfci.totalMfci - (0.35 * v3.mfci.sStructure + 0.20 * v3.mfci.sLiquidity) / 0.55) < 1e-12);
const offline = evaluateStrategyV3({ candles, direction: 'BULLISH', newsEvents: [], newsSourceOnline: false });
assert.equal(offline.gates[8].status, 'BLOCKED');
const blocked = executeStrategyPipeline({ decisionEngineVersion: 'V3', candles, currentCandleIndex: candles.length - 1, selectedTimeframe: '15m', higherTimeframeBias: 'UNCLEAR', newsEvents: [], newsSourceOnline: true, dataProvenance: 'LIVE_INGESTED' });
assert.equal(blocked.system_execution.system_decision, 'INCONCLUSIVE');
assert.match(blocked.system_execution.rejection_reason ?? '', /1h higher-timeframe bias/);
console.log('=== V3 PILOT TESTS: 7 assertions passed ===');
