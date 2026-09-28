import assert from 'node:assert/strict';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import type { Candle } from '../src/engine/types';

const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 13, i)).toISOString(),
  open: 1.08 + i * 0.0001,
  high: 1.081 + i * 0.0001,
  low: 1.079 + i * 0.0001,
  close: 1.0805 + i * 0.0001,
  volume: 100,
}));

const result = evaluateStrategyV3({
  candles,
  direction: 'BULLISH',
  newsEvents: [],
  newsSourceOnline: true,
  currentSpread: 1,
  meanSpread: 1,
  visionAiConfidence: 0.92,
  timestamp: candles.at(-1)?.timestamp,
});

assert.equal(result.version, 'RDP_STRATEGY_V3.0');
assert.equal(result.stages.length, 19);
assert.deepEqual(result.stages.map((s) => s.stageNumber), Array.from({ length: 19 }, (_, i) => i + 1));
assert.equal(result.gates.length, 9);
assert.deepEqual(result.gates.map((g) => g.gateNumber), Array.from({ length: 9 }, (_, i) => i + 1));
const expectedMfci = 0.35 * result.mfci.sStructure + 0.25 * result.mfci.sOrderFlow + 0.20 * result.mfci.sLiquidity + 0.20 * result.mfci.sVisionAi;
assert.ok(Math.abs(result.mfci.totalMfci - expectedMfci) < 1e-12);
assert.equal(result.finalAction, result.systemDecision === 'PASS' ? 'MANUAL_ALERT' : result.systemDecision === 'HOLD' ? 'SAFE_HOLD' : 'NO_ACTION');

const offline = evaluateStrategyV3({
  candles,
  direction: 'BULLISH',
  newsEvents: [],
  newsSourceOnline: false,
  visionAiConfidence: 0.92,
});
assert.equal(offline.stages[17].passed, false);
assert.equal(offline.stages[17].calculatedValues.Safety_Flag, 'INCONCLUSIVE');
assert.equal(offline.gates[8].status, 'BLOCKED');
assert.equal(offline.systemDecision, 'BLOCKED');
assert.equal(offline.finalAction, 'NO_ACTION');

const spreadBlocked = evaluateStrategyV3({
  candles,
  direction: 'BULLISH',
  newsEvents: [],
  newsSourceOnline: true,
  currentSpread: 3.01,
  meanSpread: 1,
});
assert.equal(spreadBlocked.stages[17].calculatedValues.Spread_Spike_Flag, 'true');
assert.equal(spreadBlocked.gates[8].status, 'BLOCKED');

const visibleTelemetry = executeStrategyPipeline({
  decisionEngineVersion: 'V3',
  candles,
  currentCandleIndex: candles.length - 1,
  selectedTimeframe: '5m',
  higherTimeframeBias: 'BULLISH',
  newsEvents: [],
  newsSourceOnline: false,
  cvConfidence: 0.92,
});
assert.equal(visibleTelemetry.decision_engine_v3?.version, 'RDP_STRATEGY_V3.0');
assert.equal(visibleTelemetry.system_execution.system_decision, 'REJECT');
assert.equal(visibleTelemetry.system_execution.final_action, 'NO_ALERT');
assert.match(visibleTelemetry.system_execution.halted_at_stage ?? '', /^V3 Gate /);

console.log('=== V3 ENGINE TESTS: 8 assertions passed ===');
