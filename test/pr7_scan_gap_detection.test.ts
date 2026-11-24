import assert from 'node:assert/strict';
import { ScanLoop, type ScanService } from '../src/engine/scanScheduler';
import { SignalLedger } from '../src/engine/signalLedger';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Create a temporary ledger for testing
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-gap-test-'));
const ledgerPath = path.join(tempDir, 'test-ledger.jsonl');
process.env.SIGNAL_LEDGER_PATH = ledgerPath;

const ledger = new SignalLedger(ledgerPath);

// Mock ScanService
const mockService = {
  ledger,
  runAutoCycle: async () => [],
  resolvePending: async () => {},
} as unknown as ScanService;

// Mock state storage
let storedState: any = { enabled: true, timeframe: '5m' };
const deps = {
  now: () => Date.now(),
  loadState: () => storedState,
  saveState: (state: any) => { storedState = state; },
};

// Test 1: No gap when lastRunAt is recent
storedState = { enabled: true, timeframe: '5m', lastRunAt: new Date(Date.now() - 60_000).toISOString() };
const loop1 = new ScanLoop(mockService, deps, { timeframe: '5m', enabled: true });
await loop1.tick();
const entries1 = ledger.readAll();
const gapEvents1 = entries1.filter(e => e.type === 'SCAN_GAP');
assert.equal(gapEvents1.length, 0, 'No SCAN_GAP when lastRunAt is recent');

// Test 2: Gap detected when lastRunAt is old (> 2x timeframe)
const oldTime = new Date(Date.now() - 15 * 60_000).toISOString(); // 15 minutes ago for 5m timeframe
storedState = { enabled: true, timeframe: '5m', lastRunAt: oldTime, lastCycleCandleOpen: 'old-candle' };
const loop2 = new ScanLoop(mockService, deps, { timeframe: '5m', enabled: true });
await loop2.tick();
const entries2 = ledger.readAll();
const gapEvents2 = entries2.filter(e => e.type === 'SCAN_GAP');
assert.ok(gapEvents2.length > 0, 'SCAN_GAP detected when lastRunAt is old');
assert.equal(gapEvents2[0].payload.timeframe, '5m');
assert.ok(gapEvents2[0].payload.gap_ms > 10 * 60_000, 'Gap is at least 10 minutes');

// Cleanup
fs.rmSync(tempDir, { recursive: true, force: true });

console.log('[pr7_scan_gap_detection] PASS — SCAN_GAP detection logic verified for missed cycles');
