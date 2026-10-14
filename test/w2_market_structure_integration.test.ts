import assert from 'node:assert/strict';
import { computeVolumeWeightedPoc, detectBprFromCandles, detectFvgZones, evaluateIfvg } from '../src/engine/marketStructureV3';
import { classifySessionAndKillZone } from '../src/engine/session';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import type { Candle } from '../src/engine/types';

const candle = (timestamp: string, open: number, high: number, low: number, close: number, volume = 100, pocPrice?: number): Candle => ({ timestamp, open, high, low, close, volume, pocPrice });
const t = (i: number) => new Date(Date.UTC(2026, 0, 15, 13, i)).toISOString();

// Opposing FVGs overlap in [1.15, 1.20]; the final candle retests that BPR.
const bprCandles: Candle[] = [
  candle(t(0), 1.00, 1.00, .98, .99), candle(t(1), .99, 1.01, .98, 1.00), candle(t(2), 1.20, 1.22, 1.20, 1.21),
  candle(t(3), 1.21, 1.23, 1.21, 1.22), candle(t(4), 1.22, 1.23, 1.15, 1.16), candle(t(5), 1.16, 1.15, 1.13, 1.14),
  candle(t(6), 1.17, 1.20, 1.16, 1.18),
];
const zones = detectFvgZones(bprCandles);
assert.ok(zones.filter((z) => z.direction === 'BULLISH').length >= 1);
assert.ok(zones.filter((z) => z.direction === 'BEARISH').length >= 1);
const bpr = detectBprFromCandles(bprCandles);
assert.equal(bpr.bpr_status, 'BPR_CONFIRMED');
assert.equal(bpr.status, 'PASS');
assert.ok((bpr.bpr_overlap_size ?? 0) > 0);

// A bullish FVG is body-closed through, then retested from below: bearish IFVG.
const ifvgCandles: Candle[] = [
  candle(t(0), 1.00, 1.00, .98, .99), candle(t(1), .99, 1.01, .98, 1.00), candle(t(2), 1.20, 1.22, 1.20, 1.21),
  candle(t(3), 1.02, 1.04, .90, .95), candle(t(4), .96, 1.10, .92, 1.02), candle(t(5), 1.02, 1.05, .90, .94),
];
const ifvg = evaluateIfvg(ifvgCandles, 'BEARISH');
assert.equal(ifvg.ifvg_status, 'IFVG_CONFIRMED');
assert.equal(ifvg.status, 'PASS');

const poc = computeVolumeWeightedPoc([
  candle(t(0), 1, 1.1, .9, 1, 100, 1.02),
  candle(t(1), 1, 1.1, .9, 1, 300, 1.08),
]);
assert.equal(poc.available, true);
assert.ok(Math.abs((poc.price ?? 0) - 1.065) < 1e-12);
assert.equal(computeVolumeWeightedPoc([{ ...candle(t(0), 1, 1.1, .9, 1), volume: null }]).available, false);

// London and New York are resolved in local exchange time, including DST changes.
const londonWinter = classifySessionAndKillZone('2026-01-15T08:30:00.000Z');
const londonSummer = classifySessionAndKillZone('2026-07-15T07:30:00.000Z');
assert.equal(londonWinter.session, 'LONDON');
assert.equal(londonSummer.session, 'LONDON');
assert.equal(londonWinter.kill_zone, 'INSIDE_KILL_ZONE');
assert.equal(londonSummer.kill_zone, 'INSIDE_KILL_ZONE');
const nyWinter = classifySessionAndKillZone('2026-01-15T13:30:00.000Z');
const nySummer = classifySessionAndKillZone('2026-07-15T12:30:00.000Z');
assert.ok(['NEW_YORK', 'LONDON_NEW_YORK_OVERLAP'].includes(nyWinter.session));
assert.ok(['NEW_YORK', 'LONDON_NEW_YORK_OVERLAP'].includes(nySummer.session));

// Price-scale invariance: the same normalized geometry yields the same structural decisions.
function scaled(scale: number): Candle[] {
  return Array.from({ length: 30 }, (_, i) => {
    const base = 1 + i * .001;
    const o = base * scale; const h = (base + .0008) * scale; const l = (base - .0008) * scale; const c = (base + .0003) * scale;
    return candle(new Date(Date.UTC(2026, 0, 15, 13, i)).toISOString(), o, h, l, c, 100, c);
  });
}
const eur = evaluateStrategyV3({ candles: scaled(1), direction: 'BULLISH', newsEvents: [], newsSourceOnline: true, timestamp: t(29) });
const jpy = evaluateStrategyV3({ candles: scaled(100), direction: 'BULLISH', newsEvents: [], newsSourceOnline: true, timestamp: t(29) });
assert.equal(eur.engineMode, jpy.engineMode);
assert.equal(eur.gates.map((g) => g.status).join(','), jpy.gates.map((g) => g.status).join(','));
assert.equal(eur.stages[15].calculatedValues.Session, jpy.stages[15].calculatedValues.Session);

console.log('=== W2 MARKET STRUCTURE INTEGRATION: IFVG/BPR/POC/DST/scale invariance passed ===');
