import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import { filterFxOpenMarketCandles, isFxBarClosed, isFxMarketClosed } from '../src/engine/marketHours';
import { buildR8Report, runCausalBacktest } from '../src/engine/r8Backtest';
import { latestClosedCandleOpenMs, ScanService, type ScanDeps } from '../src/engine/scanScheduler';
import { validateCandleSeries } from '../src/engine/dataIntegrity';
import { SignalLedger } from '../src/engine/signalLedger';
import type { Candle } from '../src/engine/types';
import { classifySessionAndKillZone } from '../src/engine/session';
import { htfCandlesFor, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

const closedOpen = '2026-10-16T20:45:00.000Z'; // 15m candle closes exactly at Friday 21:00 UTC.
const openSetup = idealPriceOnlySetup(1.085, '15m', 'BULLISH', SIGNAL_TS);
const htf = htfCandlesFor('BULLISH', new Date(Date.parse(SIGNAL_TS) + 900_000).toISOString());
const pipeline = (candles: Candle[]) => executeStrategyPipeline({
  decisionEngineVersion: 'V3', candles, currentCandleIndex: candles.length - 1, selectedTimeframe: '15m',
  htfCandles: htf, newsEvents: [], newsSourceOnline: true, dataProvenance: 'LIVE_INGESTED', provider: 'TWELVE_DATA',
  pair: 'EUR/USD', asset: 'EUR/USD', payoutPct: 90, nowMs: Date.parse(candles.at(-1)!.timestamp) + 900_000,
});

// New York 17:00 weekly boundaries resolve to 21:00 UTC in summer and 22:00 UTC in winter.
assert.equal(isFxMarketClosed('2026-10-16T20:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-10-16T21:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-10-18T20:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-10-18T21:00:00.000Z'), false);
assert.equal(isFxMarketClosed('2026-07-10T20:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-07-10T21:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-07-12T20:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-07-12T21:00:00.000Z'), false);
assert.equal(isFxMarketClosed('2026-01-09T21:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-01-09T22:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-01-11T21:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-01-11T22:00:00.000Z'), false);
// DST spring-forward and fall-back weekends move the UTC boundary while retaining 17:00 New York local time.
assert.equal(isFxMarketClosed('2026-03-06T21:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-03-06T22:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-03-08T20:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-03-08T21:00:00.000Z'), false);
assert.equal(isFxMarketClosed('2026-11-06T21:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-11-06T22:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-11-08T21:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-11-08T22:00:00.000Z'), false);
// Fixed annual UTC holidays and their exact boundaries.
assert.equal(isFxMarketClosed('2026-12-25T12:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2027-01-01T23:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2027-01-02T00:00:00.000Z'), true, 'the weekly closure continues after New Year when Jan 2 is Saturday');
assert.equal(isFxMarketClosed('2027-01-03T21:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2027-01-03T22:00:00.000Z'), false);
// Bars touching either edge are excluded; first complete bar after reopening is retained.
assert.equal(isFxBarClosed('2026-10-16T20:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-10-18T20:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-10-18T21:00:00.000Z', '15m'), false);
assert.equal(isFxBarClosed('2026-12-24T23:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-12-25T23:45:00.000Z', '15m'), true);
const boundaryBars: Candle[] = ['2026-10-16T20:45:00.000Z', '2026-10-16T21:00:00.000Z', '2026-10-18T20:45:00.000Z', '2026-10-18T21:00:00.000Z', '2026-12-24T23:45:00.000Z'].map((timestamp) => ({ timestamp, open: 1.1, high: 1.2, low: 1.0, close: 1.1, volume: null }));
assert.deepEqual(filterFxOpenMarketCandles(boundaryBars, '15m').map((candle) => candle.timestamp), ['2026-10-18T21:00:00.000Z']);
const acrossWinterClosure = validateCandleSeries([
  { timestamp: '2026-01-09T21:45:00.000Z', open: 1.1, high: 1.2, low: 1.0, close: 1.1, volume: null },
  { timestamp: '2026-01-11T22:00:00.000Z', open: 1.1, high: 1.2, low: 1.0, close: 1.1, volume: null },
], { timeframe: '15m' });
assert.equal(acrossWinterClosure.ok, true, 'gap validation uses the same DST-aware closure schedule');
const acrossExactClosureBoundary = validateCandleSeries([
  { timestamp: '2026-10-16T20:30:00.000Z', open: 1.1, high: 1.2, low: 1.0, close: 1.1, volume: null },
  { timestamp: '2026-10-18T21:00:00.000Z', open: 1.1, high: 1.2, low: 1.0, close: 1.1, volume: null },
], { timeframe: '15m' });
assert.equal(acrossExactClosureBoundary.ok, true, 'a closure-overlapping boundary bar is excluded and not reported as a data gap');

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

// Monday live scan filters weekend pseudo-bars from both LTF/HTF and matches R8's causal decision.
const mondaySignalOpen = '2026-10-19T07:30:00.000Z'; // London 08:30 local: inside kill zone.
const mondaySetup = idealPriceOnlySetup(1.085, '15m', 'BULLISH', mondaySignalOpen);
const warmHistory: Candle[] = [];
let warmCursor = Date.parse(mondaySetup[0].timestamp) - 15 * 60_000;
while (warmHistory.length < 80) {
  const timestamp = new Date(warmCursor).toISOString();
  if (!isFxBarClosed(timestamp, '15m')) warmHistory.push({ timestamp, open: 1.082, high: 1.0822, low: 1.0818, close: 1.08205, volume: null });
  warmCursor -= 15 * 60_000;
}
warmHistory.reverse();
const weekendPseudoBars: Candle[] = ['2026-10-16T21:00:00.000Z', '2026-10-17T12:00:00.000Z', '2026-10-18T20:45:00.000Z'].map((timestamp) => ({ timestamp, open: 1.09, high: 1.091, low: 1.089, close: 1.0905, volume: null }));
const liveRawLtf = [...warmHistory, ...weekendPseudoBars, ...mondaySetup].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
const mondayHtf = htfCandlesFor('BULLISH', new Date(Date.parse(mondaySignalOpen) + 15 * 60_000).toISOString());
const mondayNow = Date.parse(mondaySignalOpen) + 15 * 60_000 + 3_000;
let mondayFetches = 0;
const mondayDeps: ScanDeps = {
  fetchCandles: async (_pair, timeframe, provider) => {
    mondayFetches++;
    const candles = timeframe === '1h' ? mondayHtf : liveRawLtf;
    return { candles, provider, dataProvenance: 'LIVE_INGESTED', fetchedAt: new Date(mondayNow).toISOString(), lastTickAt: candles.at(-1)!.timestamp, latencyMs: 1, cacheHit: false };
  },
  providers: () => ['TWELVE_DATA'], getPayout: () => ({ pct: 90, setAt: '2026-10-01T00:00:00.000Z' }),
  favorites: () => ['EUR/USD'], newsEvents: () => [], newsSourceOnline: () => true, autoBudgetRemaining: () => 100,
  now: () => mondayNow, ledger: new SignalLedger(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-monday-')), 'ledger.jsonl')),
};
const liveMonday = await new ScanService(mondayDeps).scanPair('EUR/USD', '15m');
assert.equal(mondayFetches, 2, 'an eligible Monday scan still fetches its LTF and HTF series');
const mondayNext: Candle = { timestamp: new Date(Date.parse(mondaySignalOpen) + 15 * 60_000).toISOString(), open: mondaySetup.at(-1)!.close, high: mondaySetup.at(-1)!.close + 0.0005, low: mondaySetup.at(-1)!.close - 0.0001, close: mondaySetup.at(-1)!.close + 0.0004, volume: null };
const mondayR8 = runCausalBacktest([...liveRawLtf, mondayNext], mondayHtf, { pair: 'EUR/USD', timeframe: '15m', payoutPct: 90, newsEvents: [], newsSourceOnline: true, mode: 'PRICE_ONLY' });
const r8MondayBar = mondayR8.bars.find((bar) => bar.signal_ts === mondaySignalOpen);
assert.ok(r8MondayBar, 'R8 evaluates the matching Monday signal bar');
assert.deepEqual(liveMonday.telemetry?.decision_engine_v3?.gates.map((gate) => gate.status), r8MondayBar.gates);
assert.equal(liveMonday.reason, r8MondayBar.status_reason);
assert.equal(liveMonday.status, mondayR8.trades.find((trade) => trade.signal_ts === mondaySignalOpen)?.direction ?? 'NO_TRADE');

// Simulate 96 quarter-hour cycles: fetches occur only in the existing London/NY kill zones.
const simulationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-24h-'));
const simulationStart = Date.parse('2026-10-19T00:00:00.000Z');
let simulationNow = simulationStart;
let simulationFetches = 0;
let eligibleWindows = 0;
const simulation = new ScanService({
  fetchCandles: async (_pair, timeframe, provider) => {
    simulationFetches++;
    const timestamp = new Date(latestClosedCandleOpenMs(simulationNow, timeframe)).toISOString();
    const candle = { timestamp, open: 1.1, high: 1.1002, low: 1.0998, close: 1.1001, volume: null };
    return { candles: [candle], provider, dataProvenance: 'LIVE_INGESTED', fetchedAt: new Date(simulationNow).toISOString(), lastTickAt: timestamp, latencyMs: 1, cacheHit: false };
  },
  providers: () => ['TWELVE_DATA'], getPayout: () => ({ pct: 90, setAt: '2026-10-01T00:00:00.000Z' }),
  favorites: () => ['EUR/USD'], newsEvents: () => [], newsSourceOnline: () => true, autoBudgetRemaining: () => 1000,
  now: () => simulationNow, ledger: new SignalLedger(path.join(simulationDir, 'ledger.jsonl')),
});
for (let index = 0; index < 96; index++) {
  simulationNow = simulationStart + (index + 1) * 15 * 60_000 + 3_000;
  const expectedOpen = latestClosedCandleOpenMs(simulationNow, '15m');
  if (!isFxBarClosed(new Date(expectedOpen).toISOString(), '15m') && classifySessionAndKillZone(new Date(expectedOpen).toISOString()).kill_zone === 'INSIDE_KILL_ZONE') eligibleWindows++;
  await simulation.runAutoCycle('15m', async () => undefined);
}
assert.equal(simulationFetches, eligibleWindows * 2, 'each eligible window uses one LTF and one HTF request only');
assert.ok(simulationFetches < 96 * 2, '24-hour provider fetch count is lower than unrestricted two-fetch-per-window polling');
console.log(`=== KILL-ZONE SIMULATION: ${simulationFetches} fetches / 96 windows (${eligibleWindows} eligible) ===`);

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
