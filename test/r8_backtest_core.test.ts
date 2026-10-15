import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { buildR8Report, candlesToCsv, csvToCandles, dateChunks, mergeCandles, runCausalBacktest, sha256 } from '../src/engine/r8Backtest';
import { htfCandlesFor, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

// R8 core mechanics on TEST fixtures only (never reported as results).
const setup = idealPriceOnlySetup(1.085, '15m', 'BULLISH');
const warm = Array.from({ length: 100 }, (_, i) => ({ ...setup[i % 20], timestamp: new Date(Date.parse(setup[0].timestamp) - (100 - i) * 900_000).toISOString() }));
const next = { timestamp: new Date(Date.parse(SIGNAL_TS) + 900_000).toISOString(), open: setup.at(-1)!.close, high: setup.at(-1)!.close + 0.0005, low: setup.at(-1)!.close - 0.0001, close: setup.at(-1)!.close + 0.0004, volume: null };
const candles = [...warm, ...setup, next];
const htf = htfCandlesFor('BULLISH', new Date(Date.parse(SIGNAL_TS) + 900_000).toISOString());
const opts = { pair: 'EUR/USD', timeframe: '15m' as const, payoutPct: 87, newsEvents: [], newsSourceOnline: true, mode: 'PRICE_ONLY' as const };
const { trades, bars } = runCausalBacktest(candles, htf, opts);
assert.ok(trades.some((t) => t.signal_ts === SIGNAL_TS && t.direction === 'CALL' && t.outcome === 'WIN'), 'the live pipeline produces the fixture CALL and grades it on the next candle');
// Causality: appending later candles never changes bars already evaluated.
const later = [...candles, { ...next, timestamp: new Date(Date.parse(next.timestamp) + 900_000).toISOString(), open: 2, high: 3, low: 1.5, close: 2.5 }];
const again = runCausalBacktest(later, htf, opts);
assert.deepEqual(again.bars.slice(0, bars.length), bars);
const report = buildR8Report(candles, htf, opts);
assert.equal(report.outOfSample.verdict, 'INCONCLUSIVE', 'verdict is never given with N < 200');
assert.ok('alwaysCall' in report.outOfSample.baselines && 'randomDirectionAtSignalTimes' in report.outOfSample.baselines);
assert.equal(report.outOfSample.funnel.marginal.length, 9);
assert.throws(() => buildR8Report(candles, htf, { ...opts, payoutPct: 80 }), /below 85/);
// CSV round trip + hash, pagination chunks.
const csv = candlesToCsv(setup);
assert.deepEqual(csvToCandles(csv), setup.map((c) => ({ ...c, volumeDelta: undefined, cvd: undefined, pocPrice: undefined })));
assert.equal(sha256(csv), sha256(candlesToCsv(csvToCandles(csv))));
const chunks = dateChunks('2025-01-01', '2025-03-31', '5m');
assert.ok(chunks.length > 1 && chunks.every((c) => (Date.parse(c.end) - Date.parse(c.start)) / 86_400_000 + 1 <= 15));
assert.equal(chunks[0].start, '2025-01-01'); assert.equal(chunks.at(-1)!.end, '2025-03-31');
assert.equal(mergeCandles([setup.slice(0, 25), setup.slice(20)]).length, setup.length);
// Without a key the runner refuses to fabricate anything.
const env = { ...process.env, TWELVE_DATA_API_KEY: '', R8_START_DATE: '2025-01-01', R8_END_DATE: '2025-01-31', R8_PAYOUT_PCT: '87', R8_ALLOW_NO_NEWS: '1', R8_OUTPUT_DIR: '/tmp/r8-should-not-exist' };
const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/r8-backtest.ts'], { env, encoding: 'utf8' });
assert.equal(result.status, 2); assert.match(result.stderr, /R8_NOT_RUN: TWELVE_DATA_API_KEY/);
assert.equal(fs.existsSync('/tmp/r8-should-not-exist'), false);
console.log('=== R8 CORE: live pipeline, causal walk-forward, OOS/IS, baselines, N>=200 verdict rule, CSV+SHA-256, pagination, R8_NOT_RUN passed ===');
