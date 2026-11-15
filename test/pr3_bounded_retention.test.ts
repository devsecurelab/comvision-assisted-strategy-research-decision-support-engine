import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr3-bounded-retention-'));
const previousDataDir = process.env.DATA_DIR;
const previousCandidateLimit = process.env.CANDIDATE_HISTORY_LIMIT;
const previousSignalLimit = process.env.SIGNAL_RETENTION_LIMIT;
process.env.CANDIDATE_HISTORY_LIMIT = '100';
process.env.SIGNAL_RETENTION_LIMIT = '500';
process.env.DATA_DIR = dataDir;

try {
  const { durableStorage } = await import('../src/server/storage');
  durableStorage.setDataDir(dataDir);
  const { ExperimentManager } = await import('../src/engine/experimentTracker');

  const storageOnlyCandidates = Array.from({ length: 600 }, (_, offset) => {
    const index = 599 - offset;
    return {
      metadata: {
        setup_id: `SETUP-${index}`,
        pair: 'EUR/USD',
        timestamp_utc: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      },
      market_context: { selected_timeframe: '15m' },
      system_execution: { system_decision: 'PASS', rejection_reason: '' },
    };
  });

  durableStorage.saveCandidates(storageOnlyCandidates as any);
  const candidateHistory = durableStorage.loadCandidateHistory();
  const passCandidates = durableStorage.loadCandidates();
  const persistedSignals = JSON.parse(fs.readFileSync(path.join(dataDir, 'signals.json'), 'utf8'));
  assert.equal(candidateHistory.length, 100, 'complete full-telemetry candidate history is bounded');
  assert.equal(candidateHistory[0].metadata.setup_id, 'SETUP-599');
  assert.equal(candidateHistory.at(-1)?.metadata.setup_id, 'SETUP-500');
  assert.equal(passCandidates.length, 500, 'existing candidate reads continue to expose the bounded PASS-only view');
  assert.equal(persistedSignals.length, 500, 'the PASS-only signals view has its independent limit');
  assert.equal(persistedSignals[0].metadata.setup_id, 'SETUP-599');
  assert.equal(persistedSignals.at(-1)?.metadata.setup_id, 'SETUP-100');

  durableStorage.clearAll();
  const tracker = new ExperimentManager();
  for (let index = 0; index < 101; index++) {
    tracker.recordCandidate({
      metadata: {
        setup_id: `CHAIN-${index}`,
        timestamp_utc: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        data_quality: 'HIGH',
      },
      market_context: { selected_timeframe: '15m' },
      system_execution: { system_decision: index % 2 === 0 ? 'PASS' : 'REJECT', final_action: index % 2 === 0 ? 'CALL' : 'NO_TRADE' },
    } as any);
  }

  assert.equal(tracker.getCandidates('ALL').length, 100);
  assert.deepEqual(tracker.verifyHashChain(), { valid: true, totalRecords: 100 });

  const restartedTracker = new ExperimentManager();
  assert.equal(restartedTracker.getCandidates('ALL').length, 100);
  assert.deepEqual(restartedTracker.verifyHashChain(), { valid: true, totalRecords: 100 }, 'retained chain remains verifiable after restart');

  console.log('[pr3_bounded_retention] PASS');
} finally {
  if (previousDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousDataDir;
  if (previousCandidateLimit === undefined) delete process.env.CANDIDATE_HISTORY_LIMIT; else process.env.CANDIDATE_HISTORY_LIMIT = previousCandidateLimit;
  if (previousSignalLimit === undefined) delete process.env.SIGNAL_RETENTION_LIMIT; else process.env.SIGNAL_RETENTION_LIMIT = previousSignalLimit;
  fs.rmSync(dataDir, { recursive: true, force: true });
}
