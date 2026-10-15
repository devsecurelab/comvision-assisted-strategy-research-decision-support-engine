import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SignalLedger, signalIdFor, type SignalPayload } from '../src/engine/signalLedger';
import { buildLedgerReport, EDGE_WINDOW, evaluateEdge, formatLedgerReport } from '../src/engine/edgeMonitor';
import { latestClosedCandleOpenMs, MAX_AUTO_PAIRS, ScanLoop, ScanService, type ScanDeps, type ScanLoopState } from '../src/engine/scanScheduler';
import { MarketDataError, type MarketDataProvider, type MarketDataResult } from '../src/engine/dataProviders';
import type { Candle, Timeframe } from '../src/engine/types';
import { htfCandlesFor, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-r9-'));

// ---- Ledger: append-only hash chain and tamper detection ----
const ledgerPath = path.join(dir, 'ledger-a.jsonl');
const ledger = new SignalLedger(ledgerPath);
const sig = (i: number, payout = 87): SignalPayload => {
  const open = new Date(Date.parse('2026-01-14T08:00:00Z') + i * 900_000).toISOString();
  const entry = new Date(Date.parse(open) + 900_000).toISOString();
  return { signal_id: signalIdFor('EUR/USD', '15m', open), pair: 'EUR/USD', timeframe: '15m', direction: i % 2 ? 'PUT' : 'CALL', signal_candle_open_ts: open, entry_ts: entry, expiry_ts: new Date(Date.parse(entry) + 900_000).toISOString(), valid_until: new Date(Date.parse(entry) + 10_000).toISOString(), payout_pct: payout, breakeven: 1 / (1 + payout / 100), mfci_total: 0.9, mfci_band: 'ABOVE_THRESHOLD', engine_mode: 'PRICE_ONLY', provider: 'TWELVE_DATA', setup_id: `V3-${i}`, experiment_id: 'EXP-2026-V3-REAL-001' };
};
assert.equal(ledger.recordSignal(sig(0)), true);
assert.equal(ledger.recordSignal(sig(0)), false, 'same pair/timeframe/candle is recorded once');
ledger.recordResult({ signal_id: sig(0).signal_id, outcome: 'WIN', source: 'AUTO_PROVIDER', entry_price: 1.1, exit_price: 1.2 });
assert.equal(ledger.verify().ok, true);
assert.equal(ledger.get(sig(0).signal_id)?.outcome, 'WIN');
assert.throws(() => ledger.recordResult({ signal_id: 'SIG-NOPE', outcome: 'WIN', source: 'TELEGRAM_MANUAL' }), /UNKNOWN_SIGNAL/);
// Tamper 1: edit a historical payload.
const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
fs.writeFileSync(ledgerPath, [lines[0].replace('"WIN"', '"LOSS"').replace('"CALL"', '"PUT"'), lines[1]].join('\n') + '\n');
assert.equal(new SignalLedger(ledgerPath).verify().ok, false);
assert.throws(() => new SignalLedger(ledgerPath).recordSignal(sig(1)), /LEDGER_TAMPERED/);
// Tamper 2: delete a line.
fs.writeFileSync(ledgerPath, `${lines[1]}\n`);
assert.equal(new SignalLedger(ledgerPath).verify().reason, 'SEQUENCE_BROKEN');
// Tamper 3: reorder.
fs.writeFileSync(ledgerPath, `${lines[1]}\n${lines[0]}\n`);
assert.equal(new SignalLedger(ledgerPath).verify().ok, false);
fs.writeFileSync(ledgerPath, `${lines.join('\n')}\n`);
assert.equal(new SignalLedger(ledgerPath).verify().ok, true, 'restoring the original bytes restores the chain');
console.log('[ledger_tamper] PASS');

// ---- EDGE_LOST: last 50 decisive results, Wilson upper < breakeven; /resume needs a reason ----
const edgeLedger = new SignalLedger(path.join(dir, 'ledger-edge.jsonl'));
for (let i = 0; i < EDGE_WINDOW; i++) { edgeLedger.recordSignal(sig(i)); edgeLedger.recordResult({ signal_id: sig(i).signal_id, outcome: i < 15 ? 'WIN' : 'LOSS', source: 'AUTO_PROVIDER' }, new Date(Date.parse('2026-01-15T00:00:00Z') + i * 1000).toISOString()); }
const edge = evaluateEdge(edgeLedger.signals());
assert.equal(edge.state, 'EDGE_LOST'); assert.ok((edge.wilsonHigh as number) < (edge.breakeven as number));
assert.equal(evaluateEdge(edgeLedger.signals().slice(0, 49)).state, 'INSUFFICIENT_SAMPLE');
const okLedger = edgeLedger.signals().map((s, i) => ({ ...s, outcome: i < 32 ? 'WIN' as const : 'LOSS' as const }));
assert.equal(evaluateEdge(okLedger).state, 'EDGE_OK');
const report = buildLedgerReport(edgeLedger.signals(), 0, Date.parse('2030-01-01'));
assert.equal(report.signals, 50); assert.equal(report.wins, 15); assert.equal(report.position, 'BELOW_BREAKEVEN');
assert.match(formatLedgerReport('DAILY REPORT', report), /research alert only/);
console.log('[edge_lost_and_report] PASS');

// ---- Scan service with mocked provider (no network) ----
const tf: Timeframe = '15m';
const signalClose = Date.parse(SIGNAL_TS) + 900_000;
let now = signalClose + 3_000;
let fetches = 0; let autoRemaining = 1000; let failTwelve = false;
const payouts: Record<string, { pct: number; setAt: string }> = { EURUSD: { pct: 87, setAt: '2026-01-14T07:00:00Z' }, GBPUSD: { pct: 84.99, setAt: '2026-01-14T07:00:00Z' } };
const favs = ['EUR/USD', 'GBP/USD', 'AUD/CAD', 'AUD/CHF', 'EUR/GBP', 'AUD/JPY'];
for (const p of ['AUDCAD', 'AUDCHF', 'EURGBP', 'AUDJPY']) payouts[p] = { pct: 90, setAt: '2026-01-14T07:00:00Z' };
const scanLedger = new SignalLedger(path.join(dir, 'ledger-scan.jsonl'));
let state: ScanLoopState | undefined;
const resolved: string[] = [];
const deps: ScanDeps = {
  fetchCandles: async (pair: string, timeframe: Timeframe, provider: MarketDataProvider): Promise<MarketDataResult> => {
    fetches++;
    if (failTwelve && provider === 'TWELVE_DATA') throw new MarketDataError('PROVIDER_HTTP_ERROR', 'down', 'TWELVE_DATA');
    let candles: Candle[];
    if (timeframe === '1h') candles = htfCandlesFor('BULLISH', new Date(now).toISOString());
    else {
      candles = idealPriceOnlySetup(1.085, tf, 'BULLISH');
      // After expiry the provider also returns the entry candle (bullish -> CALL wins).
      if (now > signalClose + 900_000) candles = [...candles, { timestamp: new Date(signalClose).toISOString(), open: 1.0820, high: 1.0840, low: 1.0815, close: 1.0835, volume: null }];
    }
    return { candles, provider, dataProvenance: 'LIVE_INGESTED', fetchedAt: new Date(now).toISOString(), lastTickAt: candles.at(-1)!.timestamp, latencyMs: 1, cacheHit: false };
  },
  providers: () => ['TWELVE_DATA', 'ALPHA_VANTAGE'],
  getPayout: (pair) => payouts[pair.replace('/', '').toUpperCase()],
  favorites: () => favs,
  newsEvents: () => [], newsSourceOnline: () => true,
  autoBudgetRemaining: () => autoRemaining,
  now: () => now,
  ledger: scanLedger,
  onResolved: (s, outcome) => { resolved.push(`${s.signal_id}:${outcome}`); },
  loadState: () => state, saveState: (s) => { state = s; },
};
const service = new ScanService(deps);
const run = async () => {
  // Payout boundary: unset and <85 never fetch.
  const before = fetches;
  assert.equal((await service.scanPair('USDCAD', '15m')).reason, 'PAYOUT_UNSET');
  assert.match((await service.scanPair('gbp/usd', '15m')).reason, /^PAYOUT_BELOW_MIN/);
  assert.equal((await service.scanPair('NOTAPAIR', '15m')).reason, 'UNSUPPORTED_SYMBOL');
  assert.equal(fetches, before, 'no fetch without eligible payout');
  // Latest closed candle -> CALL, recorded once in the ledger.
  const first = await service.scanPair('eurusd', '15m');
  assert.equal(first.status, 'CALL'); assert.equal(first.signal_candle_open_ts, SIGNAL_TS); assert.ok(first.signal_id);
  assert.equal(latestClosedCandleOpenMs(now, '15m'), Date.parse(SIGNAL_TS));
  const used = fetches;
  // same_candle_determinism at service level: repeat returns the same result with no extra credit.
  const second = await service.scanPair('EUR/USD', '15m');
  assert.equal(second.cached, true); assert.equal(second.status, first.status); assert.equal(second.signal_id, first.signal_id); assert.equal(fetches, used);
  assert.equal(scanLedger.signals().length, 1);
  console.log('[scan_payout_and_same_candle] PASS');

  // Auto cycle: favourites in order, payout filter, per-timeframe cap and BUDGET_LIMIT reporting.
  now += 900_000; // next candle: provider now also returns the entry candle, which is evaluated as the new signal candle
  const cycle = await service.runAutoCycle('15m', async () => undefined);
  assert.equal(cycle.length, favs.length);
  assert.match(cycle[1].reason, /^PAYOUT_BELOW_MIN/);
  assert.equal(cycle.filter((r) => /^BUDGET_LIMIT/.test(r.reason)).length, favs.length - 1 - MAX_AUTO_PAIRS['15m']);
  assert.equal(cycle[0].status, 'NO_TRADE'); assert.equal(cycle[0].signal_candle_open_ts, new Date(signalClose).toISOString());
  autoRemaining = 1;
  const starved = await service.runAutoCycle('15m', async () => undefined);
  assert.ok(starved.filter((r) => r.pair !== 'GBP/USD').every((r) => /^BUDGET_LIMIT/.test(r.reason)));
  autoRemaining = 1000;
  console.log('[scheduler_budget_auto_cycle] PASS');

  // Auto-resolve after expiry from provider candles.
  now = signalClose + 900_000 + 10_000;
  const res = await service.resolvePending();
  assert.deepEqual(res, [{ signal_id: first.signal_id, outcome: 'WIN' }]);
  assert.equal(scanLedger.get(first.signal_id!)?.outcome, 'WIN'); assert.equal(resolved.length, 1);
  // /result manual entry is appended, history preserved.
  assert.match(service.recordManualResult(first.signal_id!, 'loss'), /previous WIN kept in ledger/);
  assert.equal(scanLedger.get(first.signal_id!)?.outcome, 'LOSS');
  assert.match(service.recordManualResult(first.signal_id!, 'maybe'), /INVALID_RESULT/);
  assert.match(service.recordManualResult('SIG-XYZ', 'win'), /UNKNOWN_SIGNAL/);
  assert.equal(scanLedger.verify().ok, true);
  console.log('[auto_resolve_and_result] PASS');

  // Provider failover keeps the reason and uses one provider for the window.
  failTwelve = true; now = signalClose + 3_000;
  const failover = new ScanService({ ...deps, ledger: new SignalLedger(path.join(dir, 'ledger-fo.jsonl')) });
  const fo = await failover.scanPair('AUDCAD', '15m');
  assert.equal(fo.provider, 'ALPHA_VANTAGE'); assert.match(fo.failover_reason || '', /TWELVE_DATA PROVIDER_HTTP_ERROR/);
  failTwelve = false;
  // Expired delivery: a signal found after valid_until is SIGNAL_EXPIRED, never ledgered.
  now = signalClose + 11_000;
  const late = new ScanService({ ...deps, ledger: new SignalLedger(path.join(dir, 'ledger-late.jsonl')) });
  const lateRes = await late.scanPair('EURUSD', '15m');
  assert.match(lateRes.reason, /^SIGNAL_EXPIRED/); assert.equal(late.ledger.signals().length, 0);
  console.log('[failover_and_expiry] PASS');

  // EDGE_LOST pauses scans (no fetch) and persists across restarts via the ledger; /resume requires a reason.
  const edgeService = new ScanService({ ...deps, ledger: new SignalLedger(path.join(dir, 'ledger-edge.jsonl')) });
  edgeService.edge.check();
  const restarted = new ScanService({ ...deps, ledger: new SignalLedger(path.join(dir, 'ledger-edge.jsonl')) });
  const f0 = fetches;
  assert.match((await restarted.scanPair('EURUSD', '15m')).reason, /^EDGE_LOST/); assert.equal(fetches, f0);
  assert.match(restarted.edge.resume('').message, /RESUME_REASON_REQUIRED/);
  assert.equal(restarted.edge.resume('Reviewed last 50 trades; resuming paper observation').ok, true);
  assert.equal(restarted.edge.current().paused, false);
  console.log('[edge_pause_resume] PASS');

  // Restart-safe loop: a completed candle is never re-run after restart.
  now = signalClose + 3_000; state = { enabled: true, timeframe: '15m' };
  const loop = new ScanLoop(service, deps, { timeframe: '15m', enabled: true });
  await loop.tick();
  assert.equal(state?.lastCycleCandleOpen, SIGNAL_TS);
  const f1 = fetches;
  const loop2 = new ScanLoop(service, deps, { timeframe: '15m', enabled: true });
  assert.deepEqual(await loop2.tick(), []); assert.equal(fetches, f1);
  console.log('[restart_safe_loop] PASS');
  console.log('=== R9 LEDGER/SCAN/RESOLVE/EDGE: tamper, payout, same candle, budget, resolve, /result, failover, expiry, EDGE_LOST, restart passed ===');
};
run().catch((error) => { console.error(error); process.exit(1); });
