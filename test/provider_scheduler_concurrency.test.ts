import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main(): Promise<void> {
  const previousDataDir = process.env.DATA_DIR;
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-concurrency-test-'));
  process.env.DATA_DIR = testDir;

  // Import after redirecting persistence so this test never touches app runtime settings.
  const { durableStorage } = await import('../src/server/storage');
  const { RateLimitScheduler } = await import('../src/engine/rateLimitScheduler');
  const { createProviderSchedulers } = await import('../src/engine/dataProviders');
  const key = (name: string) => `test_concurrency_${name}_${Date.now()}_${Math.random()}`;

  try {
    async function testConcurrentQueueSequentialInterval() {
      const minInterval = 25;
      const scheduler = new RateLimitScheduler({ perMinute: 20, perDay: 100, hardStopDaily: 100, autoDailyBudget: 100, minimumIntervalMs: minInterval, storageKey: key('sequential') });
      const startTime = Date.now();
      const results = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
        const result = await scheduler.consumeWhenAvailable('ON_DEMAND');
        return { index, result, finishedAt: Date.now() };
      }));
      assert.equal(results.length, 4);
      const ordered = [...results].sort((a, b) => a.index - b.index);
      ordered.forEach(({ result }, index) => {
        assert.equal(result.allowed, true, `request ${index + 1} should be allowed`);
        assert.equal(result.reason, 'OK');
        assert.equal(result.minuteUsed, index + 1);
      });
      assert.equal(scheduler.snapshot().minuteUsed, 4);
      assert.equal(scheduler.snapshot().dayUsed, 4);
      const finishTimes = ordered.map((item) => item.finishedAt);
      for (let index = 1; index < finishTimes.length; index++) {
        assert.ok(finishTimes[index] - finishTimes[index - 1] >= minInterval - 5, 'queued requests must respect minimum spacing');
      }
      assert.ok(finishTimes.at(-1)! - startTime >= 3 * (minInterval - 5));
    }

    async function testConcurrentMinuteCapEnforcement() {
      const scheduler = new RateLimitScheduler({ perMinute: 3, perDay: 100, minimumIntervalMs: 15, storageKey: key('minute-cap') });
      const results = await Promise.all(Array.from({ length: 4 }, () => scheduler.consumeWhenAvailable('ON_DEMAND')));
      assert.equal(results.filter((result) => result.allowed).length, 3);
      assert.equal(results.filter((result) => result.reason === 'MINUTE_LIMIT').length, 1);
      assert.equal(scheduler.snapshot().minuteUsed, 3);
      assert.equal(scheduler.snapshot().dayUsed, 3);
    }

    async function testConcurrentHourlyLimitEnforcement() {
      const storageKey = key('hour-cap');
      const now = Date.now();
      const settings = durableStorage.loadAppSettings();
      settings[storageKey] = {
        dayUtc: new Date(now).toISOString().slice(0, 10),
        minuteStartedAt: now,
        minuteUsed: 0,
        dayUsed: 0,
        autoUsed: 0,
        hourStartedAt: Math.floor(now / 3_600_000) * 3_600_000,
        hourUsed: 0,
      };
      durableStorage.saveAppSettings(settings);
      const scheduler = new RateLimitScheduler({ perMinute: 10, perHour: 2, perDay: 100, minimumIntervalMs: 15, storageKey });
      const results = await Promise.all(Array.from({ length: 4 }, () => scheduler.consumeWhenAvailable('ON_DEMAND')));
      assert.equal(results.filter((result) => result.allowed).length, 2);
      assert.equal(results.filter((result) => result.reason === 'HOUR_LIMIT').length, 2);
    }

    async function testConcurrentDailyHardStopEnforcement() {
      const scheduler = new RateLimitScheduler({ perMinute: 10, perDay: 10, autoDailyBudget: 7, hardStopDaily: 3, minimumIntervalMs: 15, storageKey: key('hard-stop') });
      const results = await Promise.all(Array.from({ length: 4 }, () => scheduler.consumeWhenAvailable('ON_DEMAND')));
      assert.equal(results.filter((result) => result.allowed).length, 3);
      assert.equal(results.filter((result) => result.reason === 'DAY_HARD_STOP').length, 1);
      assert.equal(scheduler.snapshot().dayUsed, 3);
    }

    async function testConcurrentAutoBudgetIsolation() {
      const scheduler = new RateLimitScheduler({ perMinute: 10, perDay: 10, autoDailyBudget: 2, hardStopDaily: 8, minimumIntervalMs: 15, storageKey: key('auto-budget') });
      const results = await Promise.all(Array.from({ length: 3 }, () => scheduler.consumeWhenAvailable('AUTO')));
      assert.equal(results.filter((result) => result.allowed).length, 2);
      assert.equal(results.filter((result) => result.reason === 'AUTO_BUDGET_LIMIT').length, 1);
      const onDemand = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(onDemand.allowed, true);
      assert.equal(onDemand.reason, 'OK');
    }

    async function testInterleavedAutoAndOnDemandQueue() {
      const scheduler = new RateLimitScheduler({ perMinute: 10, perDay: 10, autoDailyBudget: 1, hardStopDaily: 8, minimumIntervalMs: 15, storageKey: key('interleaved') });
      const pattern: Array<'AUTO' | 'ON_DEMAND'> = ['AUTO', 'ON_DEMAND', 'AUTO', 'ON_DEMAND'];
      const results = await Promise.all(pattern.map(async (kind) => ({ kind, result: await scheduler.consumeWhenAvailable(kind) })));
      assert.equal(results[0].result.reason, 'OK');
      assert.equal(results[1].result.reason, 'OK');
      assert.equal(results[2].result.reason, 'AUTO_BUDGET_LIMIT');
      assert.equal(results[3].result.reason, 'OK');
    }

    async function testQueueResilienceAfterTaskError() {
      const scheduler = new RateLimitScheduler({ perMinute: 10, perDay: 10, minimumIntervalMs: 15, storageKey: key('queue-error') });
      const internalQueue = (scheduler as any).reservationQueue as Promise<void>;
      (scheduler as any).reservationQueue = internalQueue.then(() => {
        throw new Error('simulated reservation queue failure');
      });
      await assert.rejects(scheduler.consumeWhenAvailable('ON_DEMAND'), /simulated reservation queue failure/);
      const recovered = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(recovered.allowed, true);
      assert.equal(recovered.reason, 'OK');
    }

    async function testMinuteRolloverWindowReset() {
      const storageKey = key('minute-rollover');
      const scheduler = new RateLimitScheduler({ perMinute: 2, perDay: 100, minimumIntervalMs: 10, storageKey });
      const first = await scheduler.consumeWhenAvailable('ON_DEMAND');
      const second = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(first.allowed, true);
      assert.equal(second.allowed, true);
      const capped = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(capped.reason, 'MINUTE_LIMIT');
      const settings = durableStorage.loadAppSettings();
      settings[storageKey].minuteStartedAt -= 61_000;
      durableStorage.saveAppSettings(settings);
      const rolled = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(rolled.allowed, true);
      assert.equal(rolled.minuteUsed, 1);
      assert.equal(rolled.dayUsed, 3);
    }

    async function testProviderSchedulersIntegrity() {
      const schedulers = createProviderSchedulers();
      const expected = ['TWELVE_DATA', 'OANDA', 'TIINGO', 'FINNHUB', 'ALPHA_VANTAGE'] as const;
      for (const provider of expected) {
        const scheduler = schedulers.get(provider);
        assert.ok(scheduler, `${provider} scheduler must exist`);
        const snapshot = scheduler.snapshot();
        assert.ok(snapshot.perMinute > 0);
        assert.ok(snapshot.perDay > 0);
        assert.ok(snapshot.hardStopDaily > 0 && snapshot.hardStopDaily <= snapshot.perDay);
        assert.ok(snapshot.autoDailyBudget > 0 && snapshot.autoDailyBudget <= snapshot.hardStopDaily);
      }
      assert.equal(schedulers.get('TWELVE_DATA')?.snapshot().minimumIntervalMs, 8_000);
      assert.equal(schedulers.get('OANDA')?.snapshot().minimumIntervalMs, 1_000);
      assert.equal(schedulers.get('TIINGO')?.snapshot().perHour, 50);
    }

    async function testFreshDayHourlyInitialization() {
      const scheduler = new RateLimitScheduler({ perMinute: 10, perHour: 2, perDay: 50, autoDailyBudget: 50, hardStopDaily: 50, storageKey: key('fresh-day') });
      const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
      assert.equal((await scheduler.consumeWhenAvailable('ON_DEMAND')).allowed, true);
      assert.equal(scheduler.snapshot().hourStartedAt, hourStart);
      assert.equal(scheduler.snapshot().hourUsed, 1);
      assert.equal((await scheduler.consumeWhenAvailable('ON_DEMAND')).allowed, true);
      assert.equal(scheduler.snapshot().hourUsed, 2);
      assert.equal((await scheduler.consumeWhenAvailable('ON_DEMAND')).reason, 'HOUR_LIMIT');
    }

    async function testLegacyHourlyStateMigration() {
      const storageKey = key('legacy-hour');
      const now = Date.now();
      const hourStart = Math.floor(now / 3_600_000) * 3_600_000;
      const settings = durableStorage.loadAppSettings();
      settings[storageKey] = {
        dayUtc: new Date(now).toISOString().slice(0, 10),
        minuteStartedAt: now,
        minuteUsed: 0,
        dayUsed: 2,
        autoUsed: 0,
        hourUsed: 2,
        // Deliberately omit hourStartedAt to simulate a same-day state from the old version.
      };
      durableStorage.saveAppSettings(settings);
      const scheduler = new RateLimitScheduler({ perMinute: 10, perHour: 3, perDay: 50, autoDailyBudget: 50, hardStopDaily: 50, storageKey });

      const finalWithinHour = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(finalWithinHour.allowed, true);
      assert.equal(scheduler.snapshot().hourStartedAt, hourStart);
      assert.equal(scheduler.snapshot().hourUsed, 3, 'legacy usage must be preserved when anchored');
      assert.equal((await scheduler.consumeWhenAvailable('ON_DEMAND')).reason, 'HOUR_LIMIT');

      const migrated = durableStorage.loadAppSettings()[storageKey];
      assert.equal(migrated.hourStartedAt, hourStart, 'legacy migration must persist even when subsequent requests are blocked');
      assert.equal(migrated.hourUsed, 3);

      const currentSettings = durableStorage.loadAppSettings();
      currentSettings[storageKey].hourStartedAt = hourStart - 3_600_000;
      durableStorage.saveAppSettings(currentSettings);
      const nextHour = await scheduler.consumeWhenAvailable('ON_DEMAND');
      assert.equal(nextHour.allowed, true);
      assert.equal(scheduler.snapshot().hourStartedAt, hourStart);
      assert.equal(scheduler.snapshot().hourUsed, 1, 'a new UTC hour must reset only the hourly counter');
      assert.equal(scheduler.snapshot().dayUsed, 4, 'daily usage must remain cumulative');
    }

    const suites: Array<[string, () => Promise<void>]> = [
      ['testConcurrentQueueSequentialInterval', testConcurrentQueueSequentialInterval],
      ['testConcurrentMinuteCapEnforcement', testConcurrentMinuteCapEnforcement],
      ['testConcurrentHourlyLimitEnforcement', testConcurrentHourlyLimitEnforcement],
      ['testConcurrentDailyHardStopEnforcement', testConcurrentDailyHardStopEnforcement],
      ['testConcurrentAutoBudgetIsolation', testConcurrentAutoBudgetIsolation],
      ['testInterleavedAutoAndOnDemandQueue', testInterleavedAutoAndOnDemandQueue],
      ['testQueueResilienceAfterTaskError', testQueueResilienceAfterTaskError],
      ['testMinuteRolloverWindowReset', testMinuteRolloverWindowReset],
      ['testProviderSchedulersIntegrity', testProviderSchedulersIntegrity],
      ['testFreshDayHourlyInitialization', testFreshDayHourlyInitialization],
      ['testLegacyHourlyStateMigration', testLegacyHourlyStateMigration],
    ];
    for (const [name, test] of suites) {
      await test();
      console.log(`[${name}] PASS`);
    }
    console.log('\nALL 11 PROVIDER SCHEDULER REGRESSION TEST SUITES PASSED!');
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
