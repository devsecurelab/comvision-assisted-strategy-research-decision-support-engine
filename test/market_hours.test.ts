import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import { filterFxOpenMarketCandles, isFxBarClosed, isFxMarketClosed } from '../src/engine/marketHours';
import { buildR8Report, runCausalBacktest } from '../src/engine/r8Backtest';
import { ScanService, type ScanDeps } from '../src/engine/scanScheduler';
import { SignalLedger } from '../src/engine/signalLedger';
import type { Candle } from '../src/engine/types';
import { htfCandlesFor, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

const closedOpen = '2026-10-16T20:45:00.000Z'; // 15m candle closes exactly at Friday 21:00 UTC.
const openSetup = idealPriceOnlySetup(1.085, '15m', 'BULLISH', SIGNAL_TS);
const htf = htfCandlesFor('BULLISH', new Date(Date.parse(SIGNAL_TS) + 900_000).toISOString());
const pipeline = (candles: Candle[]) => executeStrategyPipeline({
  decisionEngineVersion: 'V3', candles, currentCandleIndex: candles.length - 1, selectedTimeframe: '15m',
  htfCandles: htf, newsEvents: [], newsSourceOnline: true, dataProvenance: 'LIVE_INGESTED', provider: 'TWELVE_DATA',
  pair: 'EUR/USD', asset: 'EUR/USD', payoutPct: 90, nowMs: Date.parse(candles.at(-1)!.timestamp) + 900_000,
});

// Weekly boundary: close at Fri 21:00, reopen at Sun 21:00; weekends are UTC, independent of machine timezone.
assert.equal(isFxMarketClosed('2026-10-16T20:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-10-16T21:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-10-18T20:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-10-18T21:00:00.000Z'), false);
// Fixed annual UTC holidays and their exact boundaries.
assert.equal(isFxMarketClosed('2026-12-25T12:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2027-01-01T23:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2027-01-02T00:00:00.000Z'), true, 'the weekly closure continues after New Year when Jan 2 is Saturday');
assert.equal(isFxMarketClosed('2027-01-03T21:00:00.000Z'), false);
// Bars touching either edge are excluded; first complete bar after reopening is retained.
assert.equal(isFxBarClosed('2026-10-16T20:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-10-18T20:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-10-18T21:00:00.000Z', '15m'), false);
assert.equal(isFxBarClosed('2026-12-24T23:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-12-25T23:45:00.000Z', '15m'), true);

// Open-time decision remains identical to the pre-closure engine path; closed pseudo-bar fails closed.
const openTelemetry = pipeline(openSetup);
assert.equal(openTelemetry.decision_engine_v3?.binarySignal, 'CALL');
const shiftMs = Date.parse(closedOpen) - Date.parse(openSetup.at(-1)!.timestamp);
const closedSetup = openSetup.map((c) => ({ ...c, timestamp: new Date(Date.parse(c.timestamp) + shiftMs).toISOString() }));
const closedTelemetry = pipeline(closedSetup);
assert.equal(closedTelemetry.metadata.status_reason, 'MARKET_CLOSED');
assert.equal(closedTelemetry.system_execution.final_action, 'NO_ACTION');
assert.equal(closedTelemetry.decision_engine_v3, undefined, 'closed bar emits no strategy signal');

// R8 consumes only open-market candles and does not mutate the raw input array.
const rawR8: Candle[] = Array.from({ length: 600 }, (_, i) => {
  const timestamp = new Date(Date.parse('2026-10-16T12:00:00.000Z') + i * 15 * 60_000).toISOString();
  const open = 1.1 + i * 0.00001;
  return { timestamp, open, high: open + 0.0001, low: open - 0.0001, close: open + 0.00003, volume: null };
});
const rawSnapshot = rawR8.map((c) => ({ ...c }));
const filteredR8 = filterFxOpenMarketCandles(rawR8, '15m');
assert.deepEqual(rawR8, rawSnapshot, 'filter leaves raw provider candles untouched');
assert.ok(filteredR8.length < rawR8.length, 'weekend closure rows are excluded from the R8 analysis series');
const r8 = runCausalBacktest(rawR8, [], { pair: 'EUR/USD', timeframe: '15m', payoutPct: 87, newsEvents: [], newsSourceOnline: true, mode: 'PRICE_ONLY' });
assert.ok(r8.bars.length > 0);
assert.ok(r8.bars.every((bar) => !isFxMarketClosed(bar.signal_ts)), 'no closed-time pseudo-bar enters an R8 decision window');
const r8Report = buildR8Report(rawR8, [], { pair: 'EUR/USD', timeframe: '15m', payoutPct: 87, newsEvents: [], newsSourceOnline: true, mode: 'PRICE_ONLY' });
assert.equal(r8Report.rawCandles, rawR8.length);
assert.equal(r8Report.candles, filteredR8.length);
assert.equal(r8Report.closedMarketCandlesExcluded, rawR8.length - filteredR8.length);
assert.equal(r8Report.dataQuality.ok, true, 'scheduled closures are not misreported as missing-data gaps');

// Manual and automatic live scans are suppressed before fetchCandles/provider-credit consumption.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-market-hours-'));
let now = Date.parse('2026-10-16T21:00:00.000Z');
let fetches = 0;
const deps: ScanDeps = {
  fetchCandles: async () => { fetches++; throw new Error('must not fetch during FX closure'); },
  providers: () => ['TWELVE_DATA'],
  getPayout: () => ({ pct: 90, setAt: '2026-10-16T00:00:00.000Z' }),
  favorites: () => ['EUR/USD'],
  newsEvents: () => [], newsSourceOnline: () => true,
  autoBudgetRemaining: () => 100, now: () => now,
  ledger: new SignalLedger(path.join(tmp, 'ledger.jsonl')),
};
const scanner = new ScanService(deps);
const manualClosed = await scanner.scanPair('EUR/USD', '15m', 'MANUAL');
assert.equal(manualClosed.status, 'NO_TRADE');
assert.equal(manualClosed.reason, 'MARKET_CLOSED');
const autoClosed = await scanner.runAutoCycle('15m');
assert.equal(autoClosed.length, 1);
assert.equal(autoClosed[0].status, 'NO_TRADE');
assert.equal(autoClosed[0].reason, 'MARKET_CLOSED');
assert.equal(fetches, 0, 'no provider credits are spent while the market is closed');
// At the exact Sunday reopening, do not fetch a bar that overlapped the closure.
now = Date.parse('2026-10-18T21:00:00.000Z');
assert.equal((await scanner.scanPair('EUR/USD', '15m')).reason, 'MARKET_CLOSED');
assert.equal(fetches, 0);
console.log('=== C5 MARKET HOURS: UTC boundaries/holidays, no closed-time signal, unchanged open CALL, R8 filter, and no-credit scanner suppression passed ===');
