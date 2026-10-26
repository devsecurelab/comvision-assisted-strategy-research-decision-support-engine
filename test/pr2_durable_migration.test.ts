import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { durableStorage } from '../src/server/storage';
import { ExperimentManager } from '../src/engine/experimentTracker';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-pr2-state-'));
durableStorage.setDataDir(dataDir);
durableStorage.saveExperimentState({
  experimentId: 'EXP-2026-V3-REAL-001', strategyVersion: 'RDP_STRATEGY_V3.0', isLocked: true,
  scannerActive: true, alertsMuted: false, lastHash: '0'.repeat(64), targetValidSetups: 100,
  updatedAt: new Date().toISOString(), pendingMilestones: [100], notifiedMilestones: [200],
});
const restarted = new ExperimentManager();
assert.deepEqual(restarted.milestoneState(), { pending: [100], notified: [200] });
restarted.markMilestoneNotified(100);
restarted.markMilestoneNotified(100);
assert.deepEqual(restarted.milestoneState(), { pending: [], notified: [100, 200] });
assert.deepEqual(durableStorage.loadExperimentState()?.notifiedMilestones, [100, 200]);

const migrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-pr2-migration-'));
const candidatesPath = path.join(migrationDir, 'candidates.json');
const original = [
  { metadata: { setup_id: 'V2-000001', timestamp_utc: '2026-01-01T00:00:00.000Z', prev_hash: '0'.repeat(64), sha256_hash: 'a'.repeat(64) } },
  { metadata: { setup_id: 'V3-existing', timestamp_utc: '2026-01-01T00:01:00.000Z', prev_hash: 'a'.repeat(64), sha256_hash: 'b'.repeat(64) } },
];
fs.writeFileSync(candidatesPath, JSON.stringify(original));
const script = path.resolve('scripts/migrate-v2-ids.ts');
const dry = spawnSync(process.execPath, ['--import', 'tsx', script, '--data-dir', migrationDir], { encoding: 'utf8' });
assert.equal(dry.status, 0);
assert.deepEqual(JSON.parse(fs.readFileSync(candidatesPath, 'utf8')), original, 'dry-run must not mutate candidates');
const applied = spawnSync(process.execPath, ['--import', 'tsx', script, '--data-dir', migrationDir, '--apply'], { encoding: 'utf8' });
assert.equal(applied.status, 0, applied.stderr);
const migrated = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
assert.match(migrated[0].metadata.setup_id, /^V3-[a-f0-9]{20}$/);
assert.equal(migrated[0].metadata.legacy_setup_id, 'V2-000001');
const archive = fs.readdirSync(path.join(migrationDir, 'archive')).find((name) => name.endsWith('.json.gz'))!;
assert.ok(archive);
assert.equal(fs.statSync(path.join(migrationDir, 'archive', archive)).mode & 0o777, 0o444);
const verified = spawnSync(process.execPath, ['--import', 'tsx', path.resolve('scripts/verify-legacy-chain.ts'), '--file', path.join(migrationDir, 'archive', archive)], { encoding: 'utf8' });
assert.equal(verified.status, 0, verified.stderr || verified.stdout);
console.log('[pr2_durable_migration] PASS');
