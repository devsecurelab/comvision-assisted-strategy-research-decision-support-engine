import assert from 'node:assert/strict';
import { getGate4Zone, getSignalCandleIndex } from '../src/components/ChartModal';

const candles = [
  { timestamp: '2026-10-27T10:00:00.000Z', open: 1, high: 1.2, low: 0.9, close: 1.1, volume: null },
  { timestamp: '2026-10-27T10:05:00.000Z', open: 1.1, high: 1.4, low: 1, close: 1.3, volume: null },
];

const telemetry = {
  metadata: { signal_candle_open_ts: '2026-10-27T10:05:00.000Z' },
  candle_snapshot: { candles, signal_candle_open_ts: null, source: 'SIGNAL_TELEMETRY' },
  decision_engine_v3: { signalCandleOpenTs: null },
  validation_metrics: { fvg: { zone: [1.05, 1.25] } },
} as any;

assert.deepEqual(getGate4Zone(telemetry), { low: 1.05, high: 1.25 });
assert.equal(getSignalCandleIndex(telemetry, candles), 1);
assert.equal((getSignalCandleIndex({ ...telemetry, metadata: {} } as any, candles)), -1);
console.log('[pr6_chart_modal] PASS');
