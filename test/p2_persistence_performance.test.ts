import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableStorage } from '../src/server/storage';
import { SignalLedger, type SignalPayload } from '../src/engine/signalLedger';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-p2-'));
const storage = new DurableStorage(dir);
storage.saveAppSettings({ scannerActive: true, marker: 'first' });
assert.deepEqual(storage.loadAppSettings(), { scannerActive: true, marker: 'first' });
const settingsPath = path.join(dir, 'app_settings.json');
fs.writeFileSync(settingsPath, JSON.stringify({ scannerActive: false, marker: 'external-change' }));
assert.equal(storage.loadAppSettings().marker, 'external-change', 'storage cache must notice an external file update');
assert.equal(fs.readdirSync(dir).some((name) => name.includes('.tmp.')), false, 'atomic writes must not leave temporary files');

const ledgerPath = path.join(dir, 'signal-ledger.jsonl');
const ledger = new SignalLedger(ledgerPath);
const signal = (i: number): SignalPayload => ({
  signal_id: `SIG-P2-${i}`,
  pair: 'EUR/USD', timeframe: '15m', direction: 'CALL',
  signal_candle_open_ts: new Date(1_700_000_000_000 + i * 900_000).toISOString(),
  entry_ts: new Date(1_700_000_060_000 + i * 900_000).toISOString(),
  expiry_ts: new Date(1_700_000_960_000 + i * 900_000).toISOString(),
  valid_until: new Date(1_700_000_070_000 + i * 900_000).toISOString(),
  payout_pct: 87, breakeven: 0.85, mfci_total: 0.9, mfci_band: 'HIGH', engine_mode: 'PRICE_ONLY', provider: 'TEST',
  setup_id: `P2-${i}`, experiment_id: 'P2', config_hash: 'a'.repeat(64), config_hash_epoch: 'V3_CANONICAL_2026-10-18',
});
const originalReadFileSync = fs.readFileSync;
let reads = 0;
(fs as typeof fs & { readFileSync: typeof fs.readFileSync }).readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => { reads++; return originalReadFileSync(...args); }) as typeof fs.readFileSync;
try {
  for (let i = 0; i < 40; i++) assert.equal(ledger.recordSignal(signal(i)), true);
  assert.equal(reads, 0, 'append path should use the verified in-memory tail rather than rereading the full ledger');
  assert.equal(ledger.verify().ok, true);
  assert.equal(reads, 1, 'explicit verification should read the ledger once');
} finally {
  (fs as typeof fs & { readFileSync: typeof fs.readFileSync }).readFileSync = originalReadFileSync;
}

console.log('=== P2 PERSISTENCE/PERFORMANCE: atomic JSON writes, cache invalidation, and cached ledger append path passed ===');
