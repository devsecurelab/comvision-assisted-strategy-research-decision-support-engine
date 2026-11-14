import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr3-bounded-retention-'));
process.env.SIGNAL_RETENTION_LIMIT = '500';
process.env.DATA_DIR = dataDir;

const { DurableStorage } = await import('../src/server/storage');
const storage = new DurableStorage(dataDir);
const candidates = Array.from({ length: 600 }, (_, index) => ({
  metadata: {
    setup_id: `SETUP-${index}`,
    pair: 'EUR/USD',
    timestamp_utc: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  },
  market_context: { selected_timeframe: '15m' },
  system_execution: { system_decision: 'PASS', rejection_reason: '' },
}));

storage.saveCandidates(candidates as any);
const persisted = storage.loadCandidates();
assert.equal(persisted.length, 500);
assert.equal(persisted[0].metadata.setup_id, 'SETUP-599');
assert.equal(persisted.at(-1)?.metadata.setup_id, 'SETUP-100');
assert.equal(fs.statSync(path.join(dataDir, 'signals.json')).isFile(), true);
console.log('[pr3_bounded_retention] PASS');
