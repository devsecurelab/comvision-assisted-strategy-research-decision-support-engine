import assert from 'node:assert/strict';
import { evaluateStrategyV3, deriveHtfBias, type V3Input } from '../src/engine/strategyV3Engine';
import type { Candle } from '../src/engine/types';
import { htfCandlesFor, idealFullSetup, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

// Unit tests for every PRICE_ONLY stage: one passing and one failing case each (P0).
const base = 1.085; const u = 0.0001;
const p = (v: number) => base + (v - 70) * u;
const ideal = () => idealPriceOnlySetup(base, '15m', 'BULLISH');
const run = (candles: Candle[], extra: Partial<V3Input> = {}) => evaluateStrategyV3({ candles, htfBias: 'BULLISH', newsEvents: [], newsSourceOnline: true, timeframe: '15m', ...extra });
const set = (candles: Candle[], idx: number, o: number, h: number, l: number, c: number) => { candles[idx] = { ...candles[idx], open: p(o), high: p(h), low: p(l), close: p(c) }; return candles; };
const stagePassed = (candles: Candle[], stage: number, extra: Partial<V3Input> = {}) => run(candles, extra).stages[stage - 1].passed;

const ok = run(ideal());
assert.equal(ok.version, 'RDP_STRATEGY_V3.0');
assert.equal(ok.stages.length, 19);
assert.equal(ok.gates.length, 9);
assert.equal(ok.engineMode, 'PRICE_ONLY');
assert.equal(ok.binarySignal, 'CALL');
for (const n of [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19]) assert.equal(ok.stages[n - 1].passed, true, `S${n} must pass on ideal fixture`);
assert.deepEqual(ok.gates.map((g) => g.name), ['Market Structure (S1 + S2 BOS + S3 CHoCH)', 'Imbalance (FVG / IFVG / BPR)', 'Order Block & Breaker', 'Premium / Discount (OTE confluence)', 'Wick Pushback', 'Liquidity Sweep', 'Momentum', 'Session & Kill Zone', 'BSL/SSL Target']);
assert.ok(ok.gates.every((g) => g.status !== 'UNAVAILABLE'), 'Gate 3 is restored in PRICE_ONLY');
assert.ok(Math.abs((ok.mfci.totalMfci as number) - (0.35 * (ok.mfci.sStructure as number) + 0.20 * (ok.mfci.sLiquidity as number)) / 0.55) < 1e-12);
assert.equal(ok.mfci.sOrderFlow, null);
assert.ok(ok.excludedStages.some((x) => x.reason === 'CHOCH_DELTA_UNAVAILABLE'));

// S1 fail: a perfectly monotonic series has no 5-candle fractal swing.
const mono: Candle[] = Array.from({ length: 40 }, (_, i) => ({ timestamp: new Date(Date.parse(SIGNAL_TS) - (39 - i) * 900_000).toISOString(), open: p(50 + i), high: p(51.5 + i), low: p(49.5 + i), close: p(51 + i), volume: null }));
assert.equal(stagePassed(mono, 1), false);
// S2 + S3 fail: signal closes below the lower high (64) -> no BOS, no CHoCH.
const noBos = set(ideal(), 39, 56.5, 63.8, 56, 63.5);
assert.equal(stagePassed(noBos, 2), false); assert.equal(stagePassed(noBos, 3), false);
// S3 fail alone (FULL): price CHoCH exists but the break candle has no volume spike -> S3 fails while S2 passes.
const fullNoSpike = idealFullSetup(base, '15m', 'BULLISH').map((c) => ({ ...c, volume: 100 }));
const fullRes = run(fullNoSpike, { fullModeEnabled: true });
assert.equal(fullRes.engineMode, 'FULL'); assert.equal(fullRes.stages[1].passed, true); assert.equal(fullRes.stages[2].passed, false);
assert.equal(run(idealFullSetup(base, '15m', 'BULLISH'), { fullModeEnabled: true }).stages[2].passed, true);
// FULL requires explicit enablement: provider volume alone never switches mode.
assert.equal(run(idealFullSetup(base, '15m', 'BULLISH'), { fullModeEnabled: false }).engineMode, 'PRICE_ONLY');
// S4 fail: remove every gap in the last 6 candles.
const noFvg = set(set(ideal(), 38, 51.5, 57, 47, 56.5), 39, 56.5, 66, 51, 65.5);
assert.equal(stagePassed(noFvg, 4), false);
// S7 fail: the expansion after the last opposite candle is not three progressive closes.
const noOb = set(ideal(), 38, 51.5, 57, 50, 51.2);
assert.equal(stagePassed(noOb, 7), false);
assert.equal(stagePassed(noOb, 4), true);
// S8 pass on ideal (sweep idx35 + failed bearish OB idx33 broken idx38); fail without the sweep.
assert.equal(ok.stages[7].calculatedValues.Liquidity_Sweep_Preceded, 'true');
const noSweep = set(set(ideal(), 35, 47, 48, 44.5, 46), 33, 46, 52, 45, 48.5);
assert.equal(stagePassed(noSweep, 9), false); assert.equal(stagePassed(noSweep, 8), false);
// S10/S11 pools exist on ideal; S10 fail when the equal highs are separated.
const noBsl = set(set(ideal(), 24, 92, 98.5, 90, 91), 21, 94, 100, 92, 96);
const r10 = run(noBsl);
assert.ok(r10.gates[8].status === 'BLOCKED' || r10.stages[9].calculatedValues.Untouched_Pools === '0' || r10.gates[8].metricDetails !== '100.02500');
// Gate 9 fail: BSL above has been taken (a later high trades through 100.05).
const taken = set(ideal(), 33, 46, 104, 45, 50);
assert.equal(run(taken).gates[8].status, 'BLOCKED');
// S12 fail: close in premium.
assert.equal(stagePassed(set(ideal(), 39, 56.5, 72.4, 56, 72), 12), false);
// S13 is confluence only: in/out of OTE never blocks Gate 4.
assert.equal(ok.gates[3].status, 'PASS');
// S14 fail: rejection wick > 50%.
assert.equal(stagePassed(set(ideal(), 39, 56.5, 76, 56, 65.5), 14), false);
// S15 fail: small body; flat windows fail closed (never a hard-coded z fallback).
assert.equal(stagePassed(set(ideal(), 39, 64, 66, 56, 65.5), 15), false);
const flat = ideal(); for (let i = 29; i < 39; i++) { const c = flat[i]; flat[i] = { ...c, close: c.open + (c.close >= c.open ? 1 : -1) * 2 * u }; flat[i].high = Math.max(flat[i].high, flat[i].close); flat[i].low = Math.min(flat[i].low, flat[i].close); }
const flatRes = run(flat);
assert.equal(flatRes.stages[14].calculatedValues.Flat_Window, 'true'); assert.equal(flatRes.stages[14].passed, false);
// S16/S17: Asia is context only; 11:00 London is core but outside both kill zones.
const asia = idealPriceOnlySetup(base, '15m', 'BULLISH', '2026-01-14T03:00:00.000Z');
assert.equal(stagePassed(asia, 16), false); assert.equal(stagePassed(asia, 17), false);
const midday = idealPriceOnlySetup(base, '15m', 'BULLISH', '2026-01-14T11:00:00.000Z');
assert.equal(stagePassed(midday, 16), true); assert.equal(stagePassed(midday, 17), false);
assert.equal(run(midday).gates[7].status, 'HOLD');
// S18: news offline or high-impact news within 30m blocks (operational guard).
const offline = run(ideal(), { newsSourceOnline: false });
assert.equal(offline.operationalGuards[0].status, 'BLOCKED'); assert.equal(offline.binarySignal, 'NO_TRADE');
const news = run(ideal(), { newsEvents: [{ id: 'n', title: 'NFP', currency: 'USD', impact: 'HIGH', timestamp: '2026-01-14T08:50:00.000Z' }] });
assert.equal(news.binarySignal, 'NO_TRADE'); assert.match(news.statusReason, /NEWS_WINDOW_BLOCKED/);

// P1: direction is owned by the engine via the HTF bias. Opposite or unclear bias never yields an alert.
assert.equal(run(ideal(), { htfBias: 'BEARISH' }).binarySignal, 'NO_TRADE');
const unclear = run(ideal(), { htfBias: 'UNCLEAR' });
assert.equal(unclear.binarySignal, 'NO_TRADE'); assert.match(unclear.statusReason, /HTF_BIAS_UNCLEAR/);
assert.equal(evaluateStrategyV3({ candles: idealPriceOnlySetup(base, '15m', 'BEARISH'), htfBias: 'BEARISH', newsEvents: [], newsSourceOnline: true, timeframe: '15m' }).binarySignal, 'PUT');
assert.equal(deriveHtfBias(htfCandlesFor('BULLISH', SIGNAL_TS), SIGNAL_TS), 'BULLISH');
assert.equal(deriveHtfBias(htfCandlesFor('BEARISH', SIGNAL_TS), SIGNAL_TS), 'BEARISH');
// HTF uses closed 1h candles only: a still-forming last 1h candle is ignored.
const htf = htfCandlesFor('BULLISH', SIGNAL_TS);
const forming = [...htf, { ...htf.at(-1)!, timestamp: new Date(Date.parse(htf.at(-1)!.timestamp) + 3_600_000).toISOString(), high: 0.5, low: 0.4, open: 0.45, close: 0.45 }];
assert.equal(deriveHtfBias(forming, SIGNAL_TS), 'BULLISH');

// P2: bad data fails closed.
const broken = ideal(); broken[30] = { ...broken[30], high: broken[30].low - u };
assert.match(run(broken).statusReason, /DATA_QUALITY_FAIL: OHLC_INCONSISTENT/);
const gap = ideal(); gap.splice(25, 1);
assert.match(run(gap).statusReason, /DATA_QUALITY_FAIL: CANDLE_GAP/);
assert.match(run(ideal().slice(-20)).statusReason, /DATA_QUALITY_FAIL: INSUFFICIENT_CANDLES/);
console.log('=== V3 ENGINE UNIT TESTS: every PRICE_ONLY stage pass/fail, HTF-owned direction, fail-closed data passed ===');
