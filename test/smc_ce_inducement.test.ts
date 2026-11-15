import assert from 'node:assert/strict';
import { detectFvgZones, evaluateInducement } from '../src/engine/marketStructureV3';
import type { Candle } from '../src/engine/types';

const candle = (index: number, open: number, high: number, low: number, close: number): Candle => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  open,
  high,
  low,
  close,
  volume: null,
});

const bullishFvg = detectFvgZones([
  candle(0, 100, 101, 99, 100),
  candle(1, 100, 101, 99.5, 100.5),
  candle(2, 100.5, 103, 102, 102.5),
]);
assert.equal(bullishFvg.length, 1);
assert.equal(bullishFvg[0].ceLevel, 101.5);

const bearishPoi = [
  candle(0, 100, 101, 99, 100),
  candle(1, 100, 101, 99, 100),
  candle(2, 100, 104, 99, 103),
  candle(3, 103, 103.5, 101, 102),
  candle(4, 102, 102.5, 100, 101),
  candle(5, 101, 104.5, 98, 99),
];
const swept = evaluateInducement(bearishPoi, 5, 'BEARISH');
assert.equal(swept.idmDetected, true);
assert.equal(swept.idmLevel, 104);
assert.equal(swept.idmSwept, true);

const unswept = evaluateInducement(bearishPoi.map((item, index) => index === 5 ? { ...item, high: 103.5 } : item), 5, 'BEARISH');
assert.equal(unswept.idmDetected, true);
assert.equal(unswept.idmSwept, false);
assert.match(unswept.reason, /not swept/i);

const invalid = evaluateInducement(bearishPoi, 99, 'BEARISH');
assert.equal(invalid.idmDetected, false);
assert.equal(invalid.idmLevel, null);

console.log('=== SMC CE/IDM additive helper contracts passed ===');
