import assert from 'node:assert/strict';
import { buildLedgerReport, formatLedgerReport } from '../src/engine/edgeMonitor';
import { entryWindowBounds, isWithinEntryWindow } from '../src/engine/scanScheduler';
import type { SignalView } from '../src/engine/signalLedger';

const base = (id: string, timeframe: '5m' | '15m' | '30m', latencyMs: number): SignalView => {
  const candle = '2026-10-14T10:00:00.000Z'; const entry = '2026-10-14T10:05:00.000Z';
  return { signal_id: id, pair: 'EUR/USD', timeframe, direction: 'CALL', signal_candle_open_ts: candle, entry_ts: entry, expiry_ts: '2026-10-14T10:10:00.000Z', valid_until: '2026-10-14T10:10:45.000Z', payout_pct: 87, breakeven: .535, mfci_total: .9, mfci_band: '0.90-0.95', engine_mode: 'PRICE_ONLY', provider: 'TWELVE_DATA', setup_id: 'x', experiment_id: 'x', outcome: 'WIN', telegram_sent_at: new Date(Date.parse(entry) + latencyMs).toISOString() };
};
const report = buildLedgerReport([base('1', '5m', 100), base('2', '15m', 200), base('3', '30m', 300)], Date.parse('2026-10-14T00:00:00.000Z'), Date.parse('2026-10-15T00:00:00.000Z'));
assert.equal(report.telegramLatencyP50Ms, 200);
assert.equal(report.telegramLatencyP95Ms, 290);
assert.match(formatLedgerReport('TEST', report), /Telegram close→sent latency p50\/p95: 200\/290 ms/);
for (const [tf, seconds] of [['5m', 45], ['15m', 60], ['30m', 90] ] as const) {
  const entry = Date.parse('2026-10-14T10:05:00.000Z'); const bounds = entryWindowBounds(entry, tf);
  assert.equal(bounds.endMs - bounds.startMs, seconds * 1000);
  assert.equal(isWithinEntryWindow(bounds.endMs, entry, tf), true, `${tf} exact boundary is valid`);
  assert.equal(isWithinEntryWindow(bounds.endMs + 1, entry, tf), false, `${tf} after boundary is expired`);
}
console.log('[pr1_latency_boundary] PASS');
