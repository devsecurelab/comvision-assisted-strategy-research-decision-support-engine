import assert from 'node:assert/strict';
import { MAX_AUTO_PAIRS, ScanService, type ScanDeps } from '../src/engine/scanScheduler';
import { SignalLedger } from '../src/engine/signalLedger';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Test 1: MAX_AUTO_PAIRS['5m'] should be 8
assert.equal(MAX_AUTO_PAIRS['5m'], 8, 'MAX_AUTO_PAIRS[5m] should be 8 for free tier optimization');
console.log('✅ Test 1 passed: MAX_AUTO_PAIRS[5m] = 8');

// Test 2: Verify requiredCreditsForScan logic
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'step1-test-'));
const ledgerPath = path.join(tempDir, 'test-ledger.jsonl');
const ledger = new SignalLedger(ledgerPath);

let currentTime = Date.now();
const mockDeps: any = {
  now: () => currentTime,
  ledger,
  // pairs list defined locally in test
  autoBudgetRemaining: () => 100,
  providers: () => ['TWELVE_DATA'],
  favorites: () => ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY'],
  getPayout: () => 85,
  fetchCandles: async () => ({ candles: [], provider: 'TWELVE_DATA', dataProvenance: 'LIVE_INGESTED', fetchedAt: new Date().toISOString(), lastTickAt: new Date().toISOString(), latencyMs: 0, cacheHit: false }),
};

const service = new ScanService(mockDeps as ScanDeps);

// Test 2a: When HTF is not cached, should require 2 credits
const required1 = (service as any).requiredCreditsForScan('EUR/USD', '5m');
assert.equal(required1, 2, 'Should require 2 credits when HTF is not cached');
console.log('✅ Test 2a passed: Required credits = 2 when HTF not cached');

// Test 2b: After HTF is cached, should require only 1 credit
currentTime = Date.now();
await (service as any).htfCandles('EUR/USD', currentTime, 'AUTO');
const required2 = (service as any).requiredCreditsForScan('EUR/USD', '5m');
assert.equal(required2, 1, 'Should require 1 credit when HTF is cached');
console.log('✅ Test 2b passed: Required credits = 1 when HTF cached');

// Test 3: HTF pre-fetch should work within first 5 minutes
currentTime = new Date('2026-11-27T10:02:00Z').getTime(); // xx:02
const allPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'EUR/GBP', 'EUR/JPY'];
let htfFetchCount = 0;
const mockDepsWithCounter: any = {
  ...mockDeps,
  now: () => currentTime,
  fetchCandles: async () => {
    htfFetchCount++;
    return { candles: [], provider: 'TWELVE_DATA', dataProvenance: 'LIVE_INGESTED', fetchedAt: new Date().toISOString(), lastTickAt: new Date().toISOString(), latencyMs: 0, cacheHit: false };
  },
};

const service2 = new ScanService(mockDepsWithCounter as ScanDeps);
await service2.runAutoCycle('5m');
assert.ok(htfFetchCount >= 8, 'HTF should be pre-fetched for all 8 pairs within first 5 minutes');
console.log(`✅ Test 3 passed: HTF pre-fetched for ${htfFetchCount} pairs at xx:02`);

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('\n[step1_free_tier] PASS — 5m chart 8 pairs, credit optimization, and HTF pre-fetch verified');
