import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const previousDataDir = process.env.DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr1-limiter-'));
process.env.DATA_DIR = dataDir;
const { RateLimitScheduler } = await import('../src/engine/rateLimitScheduler');

try {
  let now = Date.parse('2026-10-25T00:00:00.000Z');
  const scheduler = new RateLimitScheduler({ perMinute: 4, perDay: 100, hardStopDaily: 100, autoDailyBudget: 100, now: () => now, storageKey: 'pr1-rolling' });
  const burst = [scheduler.consume('SIGNAL'), scheduler.consume('SCAN'), scheduler.consume('RESOLVE'), scheduler.consume('SCAN')];
  assert.equal(burst.filter((r) => r.allowed).length, 4, 'four credits may burst within one rolling window');
  assert.equal(scheduler.consume('SCAN').reason, 'MINUTE_LIMIT');
  now += 59_999;
  assert.equal(scheduler.consume('SIGNAL').reason, 'MINUTE_LIMIT', 'rolling window must not reset at wall-clock minute boundary');
  now += 2;
  assert.equal(scheduler.consume('SIGNAL').allowed, true, 'the oldest credit expires after 60 seconds');

  const priority = new RateLimitScheduler({ perMinute: 10, perDay: 100, hardStopDaily: 100, autoDailyBudget: 100, now: () => now, storageKey: 'pr1-priority' });
  const order: string[] = [];
  const slow = priority.consumeWhenAvailable('RESOLVE').then(() => order.push('RESOLVE'));
  const scan = priority.consumeWhenAvailable('SCAN').then(() => order.push('SCAN'));
  const signal = priority.consumeWhenAvailable('SIGNAL').then(() => order.push('SIGNAL'));
  await Promise.all([slow, scan, signal]);
  assert.deepEqual(order, ['SIGNAL', 'SCAN', 'RESOLVE']);
  console.log('[pr1_limiter] PASS');
} finally {
  if (previousDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previousDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
}
