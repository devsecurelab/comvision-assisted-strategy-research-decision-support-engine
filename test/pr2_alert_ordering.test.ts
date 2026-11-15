import assert from 'node:assert/strict';
import { alertBeforeTelemetry } from '../src/server/alertBeforeTelemetry';
import type { ScanResult } from '../src/engine/scanScheduler';

const telemetry = {
  metadata: { setup_id: 'V3-ORDER-1' },
  system_execution: { system_decision: 'REJECT' },
} as any;
const signalResult = { status: 'CALL', telemetry, signal_id: 'V3-ORDER-1' } as ScanResult;

const events: string[] = [];
const result = await alertBeforeTelemetry(
  signalResult,
  async (scan) => {
    events.push(`alert:${scan.status}`);
    return 'SENT';
  },
  async (candidate) => {
    events.push(`telemetry:${candidate.metadata.setup_id}`);
    return candidate;
  },
);
assert.deepEqual(events, ['alert:CALL', 'telemetry:V3-ORDER-1']);
assert.equal(result.alertResult, 'SENT');

// The engine status alone controls whether the signal alert is attempted; the
// telemetry's legacy/system decision field is not a second eligibility gate.
const rejectSystemDecision = { ...signalResult, telemetry: { ...telemetry, system_execution: { system_decision: 'REJECT' } } } as ScanResult;
let dispatchedDespiteDecision = false;
await alertBeforeTelemetry(rejectSystemDecision, async () => { dispatchedDespiteDecision = true; }, async () => undefined);
assert.equal(dispatchedDespiteDecision, true);

const noTradeResult = { ...signalResult, status: 'NO_TRADE' } as ScanResult;
let noTradeDispatches = 0;
let noTradePersists = 0;
await alertBeforeTelemetry(noTradeResult, async () => { noTradeDispatches++; }, async () => { noTradePersists++; });
assert.equal(noTradeDispatches, 0);
assert.equal(noTradePersists, 1, 'NO_TRADE telemetry remains persistable');

const failureEvents: string[] = [];
await assert.rejects(() => alertBeforeTelemetry(
  signalResult,
  async () => { failureEvents.push('alert'); throw new Error('transport failed'); },
  async () => { failureEvents.push('telemetry'); },
), /transport failed/);
assert.deepEqual(failureEvents, ['alert', 'telemetry'], 'telemetry persistence runs after an attempted alert even if delivery fails');

console.log('[pr2_alert_ordering] PASS');
