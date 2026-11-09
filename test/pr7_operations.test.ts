import assert from 'node:assert/strict';
import { payoutStatusFor, DEFAULT_PAYOUT_MAX_AGE_HOURS } from '../src/server/payoutRegistry';
import { buildOperationalStatus, getNextZoneStart, payoutReminderMessages, detectScanGap, pingDeadManSwitch, scanGapActionState, deliverPendingScanGapNotification } from '../src/server/operations';
import { evaluateSelfChecks, type SelfCheck } from '../src/server/runtimeSelfCheck';
import { loadSessionConfig } from '../src/engine/sessionConfig';

const nowMs = Date.parse('2026-10-26T06:30:00.000Z');
const sessionConfig = loadSessionConfig();
assert.equal(DEFAULT_PAYOUT_MAX_AGE_HOURS, 12, 'default payout freshness window is 12h');
assert.equal(payoutStatusFor({ pct: 90, setAt: new Date(nowMs - 11 * 3_600_000).toISOString(), source: 'TELEGRAM_MANUAL' }, nowMs), 'ELIGIBLE');
assert.equal(payoutStatusFor({ pct: 90, setAt: new Date(nowMs - 12 * 3_600_000 - 1).toISOString(), source: 'TELEGRAM_MANUAL' }, nowMs), 'PAYOUT_STALE');
assert.equal(payoutStatusFor({ pct: 90, setAt: new Date(nowMs + 1000).toISOString(), source: 'TELEGRAM_MANUAL' }, nowMs), 'PAYOUT_STALE', 'future-dated payout must fail closed');

const next = getNextZoneStart(nowMs, sessionConfig);
assert.equal(next.zone, 'LONDON');
assert.equal(next.at.toISOString(), '2026-10-26T07:00:00.000Z');
assert.ok(next.countdownMs > 0);
const sundayClosedNext = getNextZoneStart(Date.parse('2026-10-25T12:00:00Z'), sessionConfig);
assert.equal(sundayClosedNext.zone, 'LONDON', 'next-zone countdown skips local zone starts while the FX market remains closed');
assert.equal(sundayClosedNext.at.toISOString(), '2026-10-26T07:00:00.000Z');

const snapshot = buildOperationalStatus({
  nowMs,
  brokerOffsetMinutes: 120,
  sessionConfig,
  sessionConfigHash: 'session-hash',
  configHash: 'config-hash',
  engineFingerprint: 'engine-fingerprint',
  session: { session: 'OFF_PEAK', kill_zone: 'OUTSIDE_KILL_ZONE' },
  market: { state: 'OPEN', reason: 'FX_WEEK_OPEN' },
  scanner: { enabled: true, timeframe: '15m', lastRunAt: '2026-10-26T06:15:00.000Z', lastCycleCandleOpen: '2026-10-26T06:00:00.000Z', lastError: undefined },
  payouts: { 'EUR/USD': { pct: 90, setAt: new Date(nowMs - 60_000).toISOString(), source: 'TELEGRAM_MANUAL' }, 'GBP/USD': undefined, 'USD/JPY': { pct: 92, setAt: new Date(nowMs + 60_000).toISOString(), source: 'TELEGRAM_MANUAL' } },
  providerBudget: { remainingDay: 123, remainingAuto: 45 },
});
assert.equal(snapshot.current_utc, new Date(nowMs).toISOString());
assert.ok(snapshot.current_bdt);
assert.equal(snapshot.broker.offset_minutes, 120);
assert.equal(snapshot.scanner.last_run_at, '2026-10-26T06:15:00.000Z');
assert.equal(snapshot.payouts['EUR/USD'].age_hours, 0.02);
assert.equal(snapshot.payouts['EUR/USD'].status, 'ELIGIBLE');
assert.equal(snapshot.payouts['GBP/USD'].status, 'PAYOUT_UNSET');
assert.equal(snapshot.payouts['USD/JPY'].status, 'PAYOUT_STALE');
assert.equal(snapshot.payouts['USD/JPY'].age_hours, null, 'future/invalid payout age is unknown rather than negative');
assert.equal(snapshot.provider_budget.remaining_day, 123);
assert.equal(snapshot.market.state, 'OPEN');
assert.equal(snapshot.identity.session_config_hash, 'session-hash');
assert.equal(JSON.stringify(snapshot).includes('API_KEY'), false);
assert.equal(JSON.stringify(snapshot).includes('SESSION_SECRET'), false);

const reminder = payoutReminderMessages({
  nowMs,
  zone: 'LONDON',
  localDate: '2026-10-26',
  payouts: { 'EUR/USD': { pct: 90, setAt: new Date(nowMs - 13 * 3_600_000).toISOString(), source: 'TELEGRAM_MANUAL' }, 'GBP/USD': undefined },
});
assert.equal(reminder.length, 2);
assert.match(reminder[0], /EUR\/USD.*13\.0h.*reconfirm/i);
assert.match(reminder[1], /GBP\/USD.*unset.*reconfirm/i);

assert.equal(detectScanGap('2026-10-26T05:00:00.000Z', nowMs, '15m')?.missedCandles, 5);
assert.equal(detectScanGap(new Date(nowMs - 10 * 60_000).toISOString(), nowMs, '15m'), null);
assert.deepEqual(scanGapActionState({ key: 'gap-1' }), { appendEvent: true, sendNotification: true });
assert.deepEqual(scanGapActionState({ key: 'gap-1', recordedKey: 'gap-1' }), { appendEvent: false, sendNotification: true }, 'failed notification retries without appending another ledger event');
assert.deepEqual(scanGapActionState({ key: 'gap-1', recordedKey: 'gap-1', notifiedKey: 'gap-1' }), { appendEvent: false, sendNotification: false }, 'successful notification is not duplicated after restart');
let markedNotified = false;
const firstDelivery = await deliverPendingScanGapNotification({ key: 'gap-1', message: 'SCAN_GAP', send: async () => false, markNotified: () => { markedNotified = true; } });
assert.equal(firstDelivery, false);
assert.equal(markedNotified, false, 'failed delivery remains pending');
const retryDelivery = await deliverPendingScanGapNotification({ key: 'gap-1', message: 'SCAN_GAP', send: async () => true, markNotified: () => { markedNotified = true; } });
assert.equal(retryDelivery, true);
assert.equal(markedNotified, true, 'only successful delivery persists notification completion');
let pingBody = '';
const pingOk = await pingDeadManSwitch('https://deadman.example/ping', async (_url: any, init: any) => {
  pingBody = init.body;
  return { ok: true } as Response;
});
assert.equal(pingOk, true);
assert.equal(pingBody, JSON.stringify({ status: 'ok' }));
assert.equal(await pingDeadManSwitch('https://user:secret@deadman.example/ping', async () => ({ ok: true } as Response)), false);
assert.equal(await pingDeadManSwitch('http://deadman.example/ping', async () => ({ ok: true } as Response)), false);

const pass = (name: string): SelfCheck => ({ name, severity: 'BLOCK', run: async () => ({ ok: true }) });
const checks: SelfCheck[] = [pass('runtime'), pass('ledger'), { name: 'price', severity: 'DEGRADE', run: async () => ({ ok: false, code: 'PROVIDER_UNAVAILABLE' }) }];
const evaluation = await evaluateSelfChecks(checks);
assert.equal(evaluation.ok, true, 'degraded provider probe does not block startup');
assert.equal(evaluation.checks.price.status, 'DEGRADED');
const blocked = await evaluateSelfChecks([{ name: 'ledger', severity: 'BLOCK', run: async () => ({ ok: false, code: 'LEDGER_TAMPERED' }) }]);
assert.equal(blocked.ok, false);
assert.equal(blocked.checks.ledger.status, 'FAILED');
assert.deepEqual(blocked.failures, ['ledger: LEDGER_TAMPERED']);

console.log('[pr7_operations] PASS — operational status, payout freshness/reminders, scan-gap, and self-check policy');
