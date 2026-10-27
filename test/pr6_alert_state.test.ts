import assert from 'node:assert/strict';
import { alertReducer, initialAlertState, type AlertState } from '../src/alertState';

const alert = (setup_id: string, signal_timestamp_utc = '2026-10-27T10:00:00.000Z') => ({
  metadata: { setup_id, signal_timestamp_utc, data_provenance: 'LIVE_INGESTED' },
  system_execution: { system_decision: 'PASS', final_action: 'CALL', user_recorded_action: 'NOT_RECORDED' },
});

const stateWith = (patch: Partial<AlertState>): AlertState => ({ ...initialAlertState, ...patch });

// Polling server state must never overwrite an operator-owned selection.
{
  const selected = alert('SETUP-SELECTED');
  const polled = alert('SETUP-SERVER');
  const next = alertReducer(stateWith({ selectedSetup: selected }), { type: 'POLL_SUCCESS', activeAlert: polled, serverNowUtc: '2026-10-27T10:01:00.000Z' });
  assert.equal(next.serverActiveAlert?.metadata.setup_id, 'SETUP-SERVER');
  assert.equal(next.selectedSetup?.metadata.setup_id, 'SETUP-SELECTED');
}

// Expired active signals must not remain visible as an actionable card.
{
  const next = alertReducer(initialAlertState, { type: 'POLL_SUCCESS', activeAlert: alert('SETUP-EXPIRED', '2026-10-27T09:00:00.000Z'), serverNowUtc: '2026-10-27T10:00:00.000Z', signalAgeSeconds: 3600, entryWindowExpired: true });
  assert.equal(next.serverActiveAlert, null);
  assert.equal(next.actionCardVisible, false);
}

// A blocking banner owns the surface; the action card must be hidden.
{
  const next = alertReducer(initialAlertState, { type: 'API_FAILURE', message: 'Scanner state unknown' });
  assert.equal(next.banner?.message, 'Scanner state unknown');
  assert.equal(next.actionCardVisible, false);
}

// Failed stop must produce a high-severity warning and leave the button pending state cleared.
{
  const pending = alertReducer(initialAlertState, { type: 'SCANNER_COMMAND_PENDING', command: 'stop' });
  assert.equal(pending.pendingCommand, 'stop');
  assert.equal(pending.controlsDisabled, true);
  const failed = alertReducer(pending, { type: 'SCANNER_COMMAND_FAILURE', command: 'stop', message: 'network failure' });
  assert.equal(failed.pendingCommand, null);
  assert.equal(failed.banner?.severity, 'critical');
  assert.equal(failed.banner?.message, 'Failed to stop scanner');
  assert.equal(failed.actionCardVisible, false);
}

// Invalid persisted auth/session JSON is represented as a safe empty value.
{
  const next = alertReducer(initialAlertState, { type: 'RESTORE_SESSION', raw: '{invalid-json' });
  assert.equal(next.sessionToken, null);
  assert.equal(next.sessionRestoreError, false);
}

console.log('[pr6_alert_state] PASS');
