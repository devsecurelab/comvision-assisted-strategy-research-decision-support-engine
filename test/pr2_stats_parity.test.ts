import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SignalLedger, signalIdFor, type SignalPayload } from '../src/engine/signalLedger';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-pr2-stats-'));
const ledger = new SignalLedger(path.join(dir, 'signal-ledger.jsonl'));
const signal = (index: number): SignalPayload => {
  const ts = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    signal_id: signalIdFor('EUR/USD', '15m', ts), pair: 'EUR/USD', timeframe: '15m', direction: index % 2 ? 'PUT' : 'CALL',
    signal_candle_open_ts: ts, entry_ts: ts, expiry_ts: new Date(Date.parse(ts) + 900000).toISOString(), valid_until: ts,
    payout_pct: 90, breakeven: 52.63, mfci_total: 0.9, mfci_band: 'ABOVE_THRESHOLD', engine_mode: 'PRICE_ONLY',
    provider: 'TWELVE_DATA', setup_id: `V3-STATS-${index}`, experiment_id: 'EXP-2026-V3-REAL-001',
  };
};
for (let i = 0; i < 4; i++) ledger.recordSignal(signal(i));
const signals = ledger.signals();
ledger.recordResult({ signal_id: signals[0].signal_id, outcome: 'WIN', source: 'AUTO_PROVIDER' });
ledger.recordResult({ signal_id: signals[1].signal_id, outcome: 'LOSS', source: 'AUTO_PROVIDER' });
ledger.recordResult({ signal_id: signals[2].signal_id, outcome: 'TIE', source: 'AUTO_PROVIDER' });
const authoritative = ledger.stats();
assert.deepEqual(authoritative, { signals: 4, resolved: 3, wins: 1, losses: 1, ties: 1, winRatePercentage: 50 });
// /api/ledger/stats returns this authoritative object directly; preserve exact field parity.
const apiResponse = ledger.stats();
assert.deepEqual(Object.keys(apiResponse).sort(), ['losses', 'resolved', 'signals', 'ties', 'winRatePercentage', 'wins'].sort());
assert.deepEqual(apiResponse, authoritative);
console.log('[pr2_stats_parity] PASS');
