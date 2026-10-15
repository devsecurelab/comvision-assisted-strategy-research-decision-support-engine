import assert from 'node:assert/strict';
import { computeVolumeWeightedPoc, detectBprFromCandles, detectFvgZones, evaluateIfvg } from '../src/engine/marketStructureV3';
import { classifySessionAndKillZone, isCoreSession } from '../src/engine/session';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import type { Candle } from '../src/engine/types';
import { idealPriceOnlySetup } from './fixtures/v3Reachability';

const candle = (timestamp: string, open: number, high: number, low: number, close: number, volume = 100, pocPrice?: number): Candle => ({ timestamp, open, high, low, close, volume, pocPrice });
const t = (i: number) => new Date(Date.UTC(2026, 0, 15, 13, i)).toISOString();

// S6 BPR pass: opposing FVGs overlap in [1.15, 1.20] and the final candle retests it. Fail: no opposing FVG.
const bprCandles: Candle[] = [
  candle(t(0), 1.00, 1.00, .98, .99), candle(t(1), .99, 1.01, .98, 1.00), candle(t(2), 1.20, 1.22, 1.20, 1.21),
  candle(t(3), 1.21, 1.23, 1.21, 1.22), candle(t(4), 1.22, 1.23, 1.15, 1.16), candle(t(5), 1.16, 1.15, 1.13, 1.14),
  candle(t(6), 1.17, 1.20, 1.16, 1.18),
];
assert.ok(detectFvgZones(bprCandles).some((z) => z.direction === 'BULLISH'));
assert.ok(detectFvgZones(bprCandles).some((z) => z.direction === 'BEARISH'));
const bpr = detectBprFromCandles(bprCandles);
assert.equal(bpr.bpr_status, 'BPR_CONFIRMED'); assert.equal(bpr.status, 'PASS'); assert.ok((bpr.bpr_overlap_size ?? 0) > 0);
assert.equal(detectBprFromCandles(bprCandles.slice(0, 4)).status, 'REJECT');

// S5 IFVG pass: a real bullish FVG is body-closed through, then retested from below (bearish IFVG). Fail: no inversion close.
const ifvgCandles: Candle[] = [
  candle(t(0), 1.00, 1.00, .98, .99), candle(t(1), .99, 1.01, .98, 1.00), candle(t(2), 1.20, 1.22, 1.20, 1.21),
  candle(t(3), 1.02, 1.04, .90, .95), candle(t(4), .96, 1.10, .92, 1.02), candle(t(5), 1.02, 1.05, .90, .94),
];
const ifvg = evaluateIfvg(ifvgCandles, 'BEARISH');
assert.equal(ifvg.ifvg_status, 'IFVG_CONFIRMED'); assert.equal(ifvg.status, 'PASS');
assert.ok(ifvg.original_fvg_zone && ifvg.original_fvg_zone[0] < ifvg.original_fvg_zone[1]);
assert.notEqual(evaluateIfvg(ifvgCandles.slice(0, 3), 'BEARISH').status, 'PASS');
assert.notEqual(evaluateIfvg(ifvgCandles, 'BULLISH').status, 'PASS');

const poc = computeVolumeWeightedPoc([candle(t(0), 1, 1.1, .9, 1, 100, 1.02), candle(t(1), 1, 1.1, .9, 1, 300, 1.08)]);
assert.equal(poc.available, true); assert.ok(Math.abs((poc.price ?? 0) - 1.065) < 1e-12);
assert.equal(computeVolumeWeightedPoc([{ ...candle(t(0), 1, 1.1, .9, 1), volume: null }]).available, false);

// N1 owner session rules with DST resolved through Europe/London and America/New_York.
const kz = (iso: string) => classifySessionAndKillZone(iso);
// Winter baseline: London KZ 07:00-10:00 GMT = 07:00-10:00 UTC; NY KZ 07:00-10:00 EST = 12:00-15:00 UTC.
assert.equal(kz('2026-01-14T07:00:00Z').kill_zone_name, 'LONDON');
assert.equal(kz('2026-01-14T06:59:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
assert.equal(kz('2026-01-14T10:00:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
assert.equal(kz('2026-01-14T12:00:00Z').kill_zone_name, 'NEW_YORK');
assert.equal(kz('2026-01-14T11:30:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
// 2026-03-08: US enters EDT (London still GMT) -> NY KZ starts 11:00 UTC.
assert.equal(kz('2026-03-06T11:30:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
assert.equal(kz('2026-03-09T11:30:00Z').kill_zone_name, 'NEW_YORK');
assert.equal(kz('2026-03-09T11:30:00Z').kill_zone_start_utc, '11:00');
// 2026-03-29: UK enters BST -> London KZ starts 06:00 UTC.
assert.equal(kz('2026-03-27T06:30:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
assert.equal(kz('2026-03-30T06:30:00Z').kill_zone_name, 'LONDON');
assert.equal(kz('2026-03-30T06:30:00Z').kill_zone_start_utc, '06:00');
// 2026-10-25: UK returns to GMT -> London KZ back to 07:00 UTC.
assert.equal(kz('2026-10-23T06:30:00Z').kill_zone_name, 'LONDON');
assert.equal(kz('2026-10-26T06:30:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
assert.equal(kz('2026-10-26T07:30:00Z').kill_zone_name, 'LONDON');
// 2026-11-01: US returns to EST -> NY KZ back to 12:00 UTC.
assert.equal(kz('2026-10-30T11:30:00Z').kill_zone_name, 'NEW_YORK');
assert.equal(kz('2026-11-02T11:30:00Z').kill_zone, 'OUTSIDE_KILL_ZONE');
assert.equal(kz('2026-11-02T12:30:00Z').kill_zone_name, 'NEW_YORK');
// Core session London 07:00 -> New York 16:00 local; Asia 00:00-06:00 UTC context only; no Tokyo kill zone.
assert.equal(isCoreSession(kz('2026-01-14T20:59:00Z').session), true);
assert.equal(kz('2026-01-14T21:00:00Z').session, 'OFF_PEAK');
assert.equal(isCoreSession(kz('2026-07-15T20:00:00Z').session), false); // 16:00 EDT
assert.equal(isCoreSession(kz('2026-07-15T06:00:00Z').session), true); // 07:00 BST
assert.equal(kz('2026-01-14T03:00:00Z').session, 'ASIA');
assert.equal(isCoreSession('ASIA'), false);
assert.equal(kz('2026-01-14T00:30:00Z').kill_zone, 'OUTSIDE_KILL_ZONE'); // 09:30 Tokyo is not a kill zone

// Scale invariance: same normalized geometry at 1.085 and 150 -> identical gates, stages and MFCI.
const eur = evaluateStrategyV3({ candles: idealPriceOnlySetup(1.085, '15m', 'BULLISH'), htfBias: 'BULLISH', newsEvents: [], newsSourceOnline: true, timeframe: '15m' });
const jpy = evaluateStrategyV3({ candles: idealPriceOnlySetup(150, '15m', 'BULLISH'), htfBias: 'BULLISH', newsEvents: [], newsSourceOnline: true, timeframe: '15m' });
assert.equal(eur.gates.map((g) => g.status).join(), jpy.gates.map((g) => g.status).join());
assert.equal(eur.stages.map((s) => s.passed).join(), jpy.stages.map((s) => s.passed).join());
assert.ok(Math.abs((eur.mfci.totalMfci as number) - (jpy.mfci.totalMfci as number)) < 1e-9);
console.log('=== W2 MARKET STRUCTURE INTEGRATION: IFVG/BPR/POC, owner DST sessions (4 transition dates) and scale invariance passed ===');
