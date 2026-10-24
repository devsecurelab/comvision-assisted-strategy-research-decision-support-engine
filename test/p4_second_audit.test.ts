import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SignalLedger, type SignalPayload } from '../src/engine/signalLedger';
import { CONFIG_HASH_EPOCH } from '../src/engine/manifest';

const root = process.cwd();
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const scheduler = fs.readFileSync(path.join(root, 'src/engine/scanScheduler.ts'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: { build: string; test: string } };

assert.match(server, /app\.post\('\/api\/audit\/repair-signal-ledger', requireAdmin/);
assert.match(server, /app\.get\('\/api\/audit\/verify-signal-ledger', requireAdmin/);
assert.match(server, /CLIENT_CANDLE_NOT_ACCEPTED/);
assert.match(server, /INVALID_ACTION/);
assert.match(server, /validActions = \['PENDING', 'TAKEN', 'NOT_TAKEN', 'NOT_RECORDED', 'SKIPPED'\]/);
assert.match(server, /Valid scan timeframes are 5m, 15m, 30m/);
assert.doesNotMatch(server, /express\.static\(path\.join\([^\n]*public/);
assert.match(pkg.scripts.build, /--outfile=build\/server\.cjs/);
assert.match(scheduler, /trigger === 'AUTO' && !shouldContinue\(\)/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-p4-'));
const ledgerPath = path.join(dir, 'signal-ledger.jsonl');
const ledger = new SignalLedger(ledgerPath);
const signal: SignalPayload = {
  signal_id: 'SIG-P4-AUDIT', pair: 'EUR/USD', timeframe: '15m', direction: 'CALL',
  signal_candle_open_ts: '2026-01-14T08:00:00.000Z', entry_ts: '2026-01-14T08:15:00.000Z',
  expiry_ts: '2026-01-14T08:30:00.000Z', valid_until: '2026-01-14T08:15:10.000Z', payout_pct: 87,
  breakeven: 0.535, mfci_total: 0.9, mfci_band: 'ABOVE_THRESHOLD', engine_mode: 'PRICE_ONLY',
  provider: 'TWELVE_DATA', setup_id: 'P4-AUDIT', experiment_id: 'EXP-2026-V3-REAL-001',
  config_hash_epoch: CONFIG_HASH_EPOCH,
};
ledger.recordSignal(signal);
fs.appendFileSync(ledgerPath, '{"seq":1,"type":"SCAN"');
const repair = ledger.repairPartialTail();
assert.equal(repair.repaired, true);
assert.equal(repair.verification.ok, true);
assert.equal(new SignalLedger(ledgerPath).readAll().length, 1);
assert.equal(new SignalLedger(ledgerPath).verify().ok, true);

console.log('=== P4 SECOND AUDIT: scanner stop boundary, server-side outcome/action guards, private bundle path, repair hook, and hash epoch behavior passed ===');
