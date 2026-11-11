import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE_FINGERPRINT } from '../src/engine/manifest';
import { SignalLedger } from '../src/engine/signalLedger';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-pr8-ledger-fingerprint-'));
const file = path.join(dir, 'signal-ledger.jsonl');
const ledger = new SignalLedger(file);

const signal = {
  signal_id: 'SIG-PR8-FINGERPRINT', pair: 'EUR/USD', timeframe: '15m' as const,
  direction: 'CALL' as const, signal_candle_open_ts: '2026-01-14T08:00:00.000Z',
  entry_ts: '2026-01-14T08:15:00.000Z', expiry_ts: '2026-01-14T08:30:00.000Z',
  valid_until: '2026-01-14T08:15:10.000Z', payout_pct: 87, breakeven: 0.535,
  mfci_total: 0.9, mfci_band: 'ABOVE_THRESHOLD', engine_mode: 'PRICE_ONLY' as const,
  provider: 'TWELVE_DATA', setup_id: 'V3-PR8-FINGERPRINT', experiment_id: 'EXP-2026-V3-REAL-001',
};

assert.equal(ledger.recordSignal(signal), true);
const entry = ledger.readAll()[0];
assert.equal((entry.payload as Record<string, unknown>).engine_fingerprint, ENGINE_FINGERPRINT);
assert.equal(ledger.verify().ok, true);

const tampered = JSON.parse(fs.readFileSync(file, 'utf8')) as { payload: Record<string, unknown>; hash: string };
tampered.payload.engine_fingerprint = 'f'.repeat(64);
fs.writeFileSync(file, `${JSON.stringify(tampered)}\n`);
const verification = new SignalLedger(file).verify();
assert.equal(verification.ok, false);
assert.equal(verification.reason, 'ENGINE_FINGERPRINT_MISMATCH');

console.log('=== PR-8 LEDGER FINGERPRINT RED/GREEN: new events commit engine identity and stale fingerprints fail verification ===');
