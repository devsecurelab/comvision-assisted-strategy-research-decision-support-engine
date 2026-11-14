import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScanService } from '../src/engine/scanScheduler';
import { SignalLedger } from '../src/engine/signalLedger';
import { TwelveDataAdapter } from '../src/engine/providers/twelveDataAdapter';
import { NotificationService } from '../src/server/notificationService';
import { durableStorage } from '../src/server/storage';
import { htfCandlesFor, idealPriceOnlySetup } from './fixtures/v3Reachability';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr1-integration-gaps-'));
const previousDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = dataDir;
durableStorage.setDataDir(dataDir);

try {
  // Provider-level batching must use one request and preserve partial symbol success.
  let requests = 0;
  const rows = idealPriceOnlySetup(1.085, '15m', 'BULLISH').map((candle) => ({
    datetime: candle.timestamp, open: String(candle.open), high: String(candle.high), low: String(candle.low), close: String(candle.close),
  }));
  const adapter = new TwelveDataAdapter(async (input) => {
    requests++;
    assert.equal(new URL(String(input)).searchParams.get('symbol'), 'EUR/USD,GBP/USD,USD/JPY,EUR/GBP');
    return new Response(JSON.stringify({
      'EUR/USD': { values: rows }, 'GBP/USD': { values: rows }, 'USD/JPY': { status: 'error', message: 'unavailable' }, 'EUR/GBP': { values: rows },
    }), { status: 200, headers: { date: new Date().toUTCString(), 'api-credits-used': '1' } });
  }, 'test-key');
  const batched = await adapter.fetchCandlesBatch(['EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/GBP'], '15m', new AbortController().signal);
  assert.equal(requests, 1);
  assert.deepEqual(Object.keys(batched), ['EUR/USD', 'GBP/USD', 'EUR/GBP']);

  // Auto-cycle must call the ScanService batch dependency once for eligible pairs.
  const signalLedger = new SignalLedger(path.join(dataDir, 'scan-ledger.jsonl'));
  const now = Date.parse('2026-01-14T08:46:01.000Z');
  const batchCalls: string[][] = [];
  let singleCalls = 0;
  const primary = { candles: idealPriceOnlySetup(1.085, '15m', 'BULLISH'), provider: 'TWELVE_DATA' as const, dataProvenance: 'LIVE_INGESTED' as const, fetchedAt: new Date(now).toISOString(), lastTickAt: '2026-01-14T08:30:00.000Z', latencyMs: 2, cacheHit: false };
  const service = new ScanService({
    fetchCandles: async (_pair, timeframe) => { singleCalls++; return timeframe === '1h' ? { ...primary, candles: htfCandlesFor('BULLISH', new Date(now).toISOString()) } : primary; },
    fetchCandlesBatch: async (pairs) => { batchCalls.push(pairs); return Object.fromEntries(pairs.map((pair) => [pair, primary])); },
    providers: () => ['TWELVE_DATA'],
    getPayout: () => ({ pct: 90, setAt: new Date(now).toISOString() }),
    favorites: () => ['EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/GBP'],
    newsEvents: () => [], newsSourceOnline: () => true, autoBudgetRemaining: () => 100,
    now: () => now, ledger: signalLedger, onScan: () => undefined,
  });
  await service.runAutoCycle('15m', async () => undefined);
  assert.equal(batchCalls.length, 1, 'one batch request is used for the eligible pair set');
  assert.deepEqual(batchCalls[0], ['EUR/USD', 'GBP/USD', 'USD/JPY', 'EUR/GBP']);
  assert.ok(singleCalls >= 1, 'HTF fetches remain separate and auditable');

  // Alert text must contain concrete UTC, BDT, broker time and pair-specific pip tolerance.
  const notifications = new NotificationService({ now: () => now, fetchImpl: async () => new Response('{}') });
  const telemetry: any = {
    metadata: { setup_id: 'SETUP-PR1', pair: 'USD/JPY', payout_pct: 90, htf_bias: 'BULLISH', provider: 'TWELVE_DATA', signal_timestamp_utc: '2026-01-14T08:30:00.000Z', experiment_id: 'EXP-PR1' },
    market_context: { selected_timeframe: '15m' },
    decision_engine_v3: { binarySignal: 'CALL', gates: [], mfci: { totalMfci: 0.9 }, mfciBand: 'HIGH', engineMode: 'PRICE_ONLY', statusReason: 'PASS' },
    system_execution: { rejection_reason: 'PASS' },
  };
  const alert = notifications.formatSignalAlert(telemetry, { signalId: 'SIG-PR1', validUntil: '2026-01-14T08:46:01.000Z', signalPrice: 150.1, priceTolerance: 0.012 });
  assert.match(alert, /08:46:01 UTC \/ 14:46:01 BDT/);
  assert.match(alert, /Broker \(UTC\+00:00/);
  assert.match(alert, /CALL: do not enter if broker price is above 150\.1 by more than 1\.2 pips/);
  const brokerTimeResult = await (notifications as any).handleOwnerCommand('/brokertime 14:46:01');
  assert.equal(brokerTimeResult, 'Broker time 14:46:01 (UTC+06:00) saved.');
  assert.equal(durableStorage.loadAppSettings().brokerUtcOffsetMinutes, 360);

  console.log('[pr1_integration_gaps] PASS — batch cycle, partial symbol response, concrete alert times and JPY pip formatting');
} finally {
  if (previousDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
}
