import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { MarketFeedManager, type MarketDataResult } from '../src/engine/dataProviders';
import { buildR8Report, candlesToCsv, csvToCandles, dateChunks, funnel, htfWarmupStartDate, mergeCandles, R8_GATE_LABELS, runCausalBacktest, sha256 } from '../src/engine/r8Backtest';
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
const legacyBars = runCausalBacktest(candles, htf, { ...opts, gate4Mode: 'A' }).bars.filter((b) => b.evaluated && b.gates.length === 9 && b.gates.slice(0, 3).every((g) => g === 'PASS'));
assert.ok(legacyBars.length > 0);
assert.ok(legacyBars.every((b) => b.gate4_reason === 'LEGACY_A'), 'mode A must not expose B reason codes');
const approvedBars = runCausalBacktest(candles, htf, { ...opts, gate4Mode: 'B' }).bars.filter((b) => b.evaluated && b.gates.length === 9 && b.gates.slice(0, 3).every((g) => g === 'PASS'));
assert.ok(approvedBars.length > 0);
assert.ok(approvedBars.every((b) => b.gate4_reason !== 'LEGACY_A'), 'mode B must expose computed Gate 4 reason codes');
// Causality: appending later candles never changes bars already evaluated.
const later = [...candles, { ...next, timestamp: new Date(Date.parse(next.timestamp) + 900_000).toISOString(), open: 2, high: 3, low: 1.5, close: 2.5 }];
const again = runCausalBacktest(later, htf, opts);
assert.deepEqual(again.bars.slice(0, bars.length), bars);
const report = buildR8Report(candles, htf, opts);
assert.equal(report.outOfSample.verdict, 'INCONCLUSIVE', 'verdict is never given with N < 200');
assert.ok('alwaysCall' in report.outOfSample.baselines && 'randomDirectionAtSignalTimes' in report.outOfSample.baselines);
assert.equal(report.outOfSample.funnel.marginal.length, 9);
assert.deepEqual(report.outOfSample.funnel.gateLabels, R8_GATE_LABELS);
assert.deepEqual(R8_GATE_LABELS.slice(3, 6), ['G4 Premium / Discount', 'G5 Wick Pushback', 'G6 Liquidity Sweep']);
assert.throws(() => buildR8Report(candles, htf, { ...opts, payoutPct: 80 }), /below 85/);
// Insufficient closed 1h history must be a counted fail-closed HTF warm-up, not a crash.
const noHtf = runCausalBacktest(candles, [], opts);
assert.ok(noHtf.bars.length > 0);
assert.ok(noHtf.bars.every((bar) => bar.htfWarmup && bar.htfClosedCandles < 7 && /HTF_BIAS_UNCLEAR/.test(bar.status_reason)));
assert.equal(funnel(noHtf.bars).htfWarmupBars, noHtf.bars.length);
const noHtfReport = buildR8Report(candles, [], opts);
assert.equal(noHtfReport.htfWarmupBars.total, noHtf.bars.length);
assert.equal(noHtfReport.htfWarmupBars.inSample + noHtfReport.htfWarmupBars.outOfSample, noHtf.bars.length);
assert.equal(htfWarmupStartDate('2026-09-01'), '2026-08-25');
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

// Mocked historical fetch: date-only chunk ends previously stopped at 00:00,
// losing the final day of each chunk. Verify full-day queries, clipping, and continuity.
const fetchChunks = dateChunks('2026-09-01', '2026-09-30', '5m');
const requestedUrls: URL[] = [];
const mockHistoricalRequest = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input));
  requestedUrls.push(url);
  const start = Date.parse(`${url.searchParams.get('start_date')}T00:00:00.000Z`);
  const endParameter = url.searchParams.get('end_date')!;
  const end = endParameter.includes(' ')
    ? Date.parse(`${endParameter.replace(' ', 'T')}Z`)
    : Date.parse(`${endParameter}T00:00:00.000Z`);
  const chunkEndExclusive = Date.parse(`${endParameter.slice(0, 10)}T00:00:00.000Z`) + 86_400_000;
  const values: Array<Record<string, string>> = [];
  for (let time = start; time <= end; time += 5 * 60_000) {
    values.push({ datetime: new Date(time).toISOString(), open: '1.1000', high: '1.1010', low: '1.0990', close: '1.1005' });
  }
  // Simulate a provider returning the next boundary candle as well; the adapter must clip it.
  values.push({ datetime: new Date(chunkEndExclusive).toISOString(), open: '1.1000', high: '1.1010', low: '1.0990', close: '1.1005' });
  return new Response(JSON.stringify({ status: 'ok', values }), { status: 200, headers: { 'Content-Type': 'application/json', Date: new Date().toUTCString() } });
}) as typeof fetch;
const historicalManager = new MarketFeedManager('mock-only-key', mockHistoricalRequest);
const fetchedChunks: MarketDataResult[] = [];
for (const chunk of fetchChunks) {
  fetchedChunks.push(await historicalManager.fetchHistoricalCandles('EUR/USD', '5m', chunk.start, chunk.end));
}
assert.deepEqual(fetchChunks, [
  { start: '2026-09-01', end: '2026-09-15' },
  { start: '2026-09-16', end: '2026-09-30' },
]);
assert.equal(requestedUrls.length, 2);
assert.deepEqual(requestedUrls.map((url) => url.searchParams.get('end_date')), ['2026-09-15 23:59:59', '2026-09-30 23:59:59']);
assert.equal(fetchedChunks[0].candles.at(-1)?.timestamp, '2026-09-15T23:55:00.000Z');
assert.equal(fetchedChunks[1].candles.at(-1)?.timestamp, '2026-09-30T23:55:00.000Z');
assert.ok(fetchedChunks[0].candles.every((candle) => Date.parse(candle.timestamp) < Date.parse('2026-09-16T00:00:00.000Z')));
assert.ok(fetchedChunks[1].candles.every((candle) => Date.parse(candle.timestamp) < Date.parse('2026-10-01T00:00:00.000Z')));
const fullRangeCandles = mergeCandles(fetchedChunks.map((chunk) => chunk.candles));
assert.equal(fullRangeCandles.length, 30 * 24 * 12, 'all 30 days of 5m candles are returned');
assert.equal(fullRangeCandles[0].timestamp, '2026-09-01T00:00:00.000Z');
assert.equal(fullRangeCandles.at(-1)?.timestamp, '2026-09-30T23:55:00.000Z');
for (let index = 1; index < fullRangeCandles.length; index++) {
  assert.equal(Date.parse(fullRangeCandles[index].timestamp) - Date.parse(fullRangeCandles[index - 1].timestamp), 5 * 60_000, `no gap at mocked chunk boundary/index ${index}`);
}
console.log('=== R8 HISTORICAL FETCH: full inclusive end date, out-of-range clipping, and chunk-boundary continuity passed ===');
console.log('=== R8 CORE: live pipeline, causal walk-forward, OOS/IS, baselines, N>=200 verdict rule, CSV+SHA-256, pagination, R8_NOT_RUN passed ===');
