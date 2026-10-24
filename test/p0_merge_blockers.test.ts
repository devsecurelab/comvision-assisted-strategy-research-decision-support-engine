import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ScanLoop, type ScanLoopState } from '../src/engine/scanScheduler';
import { SignalLedger } from '../src/engine/signalLedger';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comvision-p0-'));
const ledgerPath = path.join(tempDir, 'signal-ledger.jsonl');
const ledger = new SignalLedger(ledgerPath);
ledger.recordScan({
  scan_id: 'scan-1', pair: 'EUR/USD', timeframe: '15m', trigger: 'AUTO', status: 'NO_TRADE', reason: 'TEST',
  scan_started_at: new Date(0).toISOString(), candle_available_at: null, delivered_at: new Date(0).toISOString(),
});
fs.appendFileSync(ledgerPath, '{"seq":1,"type":"SCAN"');
const recovered = new SignalLedger(ledgerPath);
assert.equal(recovered.verify().ok, true, 'incomplete final JSONL line must be recovered');
assert.equal(recovered.readAll().length, 1, 'recovery must not remove valid prior entries');

let observedContinue: boolean | undefined;
let resolveCycle!: () => void;
const cycleFinished = new Promise<void>((resolve) => { resolveCycle = resolve; });
const fakeService = {
  runAutoCycle: async (_timeframe: string, _sleep: unknown, shouldContinue: () => boolean) => {
    await cycleFinished;
    observedContinue = shouldContinue();
    return [];
  },
  resolvePending: async () => [],
};
let state: ScanLoopState = { enabled: true, timeframe: '15m' };
const loop = new ScanLoop(fakeService as never, {
  now: () => Date.now(),
  loadState: () => state,
  saveState: (patch) => { state = { ...state, ...patch }; },
}, { timeframe: '15m', enabled: true });
const running = loop.tick();
state = { ...state, enabled: false };
loop.stop();
resolveCycle();
await running;
assert.equal(observedContinue, false, 'stopped scanner must report cancellation to an in-flight cycle');

const server = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
const chat = fs.readFileSync(path.join(process.cwd(), 'src/server/chatService.ts'), 'utf8');
assert.match(server, /CLIENT_CANDLE_NOT_ACCEPTED/);
assert.match(server, /INVALID_OUTCOME/);
assert.match(server, /app\.post\('\/api\/engine\/toggle-scanner', requireOperator/);
assert.match(server, /app\.post\('\/api\/engine\/record-outcome', requireResearcher/);
assert.match(server, /app\.get\('\/api\/audit\/verify-signal-ledger', requireAdmin/);
assert.match(chat, /payoutRegistry\.get/);
assert.match(chat, /payoutPct: payout\.pct/);
assert.doesNotMatch(chat, /dataProvenance: 'LIVE_INGESTED'/);

console.log('=== P0 MERGE BLOCKERS: scanner cancellation, ledger tail recovery, outcome boundary and role guards passed ===');
