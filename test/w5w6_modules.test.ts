import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { durableStorage } from '../src/server/storage';
import { RateLimitScheduler } from '../src/engine/rateLimitScheduler';
import { confidenceByMfci, verdict, wilsonInterval } from '../src/engine/backtestStats';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-w5w6-')); durableStorage.setDataDir(dir);
const scheduler = new RateLimitScheduler({ perMinute: 2, perDay: 3, autoDailyBudget: 1 });
assert.equal(scheduler.consume('AUTO').allowed, true);
assert.equal(scheduler.consume('AUTO').reason, 'AUTO_BUDGET_LIMIT');
assert.equal(scheduler.consume('ON_DEMAND').allowed, true);
assert.equal(scheduler.consume('ON_DEMAND').reason, 'MINUTE_LIMIT');
const persisted = new RateLimitScheduler({ perMinute: 2, perDay: 3, autoDailyBudget: 1 });
assert.equal(persisted.snapshot().dayUsed, 2);
assert.deepEqual(wilsonInterval(60, 100)?.map((v) => Number(v.toFixed(3))), [0.502, 0.691]);
assert.equal(verdict(130, 200, 85), 'ABOVE');
assert.equal(verdict(1, 20, 85), 'INCONCLUSIVE');
const table = confidenceByMfci(Array.from({ length: 30 }, (_, i) => ({ mfci: 0.86, favorable: i < 20 })));
assert.equal(table['0.85-0.90'].n, 30); assert.equal(table['0.85-0.90'].winRate, 2 / 3);
console.log('=== W5/W6 MODULES: Wilson confidence, verdict, durable token bucket and budget limits passed ===');

// W6 budget: auto-scans stop at 70% of daily capacity; every request stops at the 80% hard stop.
durableStorage.setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-w6-hard-')));
const hard = new RateLimitScheduler({ perMinute: 100, perDay: 10 });
let hardAllowed = 0; for (let i = 0; i < 10; i++) if (hard.consume('ON_DEMAND').allowed) hardAllowed++;
assert.equal(hardAllowed, 8);
assert.equal(hard.consume('ON_DEMAND').reason, 'DAY_HARD_STOP');
assert.equal(hard.snapshot().remainingDay, 0);
durableStorage.setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-w6-auto-')));
const autoOnly = new RateLimitScheduler({ perMinute: 100, perDay: 10 });
let autoAllowed = 0; for (let i = 0; i < 10; i++) if (autoOnly.consume('AUTO').allowed) autoAllowed++;
assert.equal(autoAllowed, 7);
console.log('=== W6 BUDGET: 70% auto budget and 80% hard stop passed ===');
