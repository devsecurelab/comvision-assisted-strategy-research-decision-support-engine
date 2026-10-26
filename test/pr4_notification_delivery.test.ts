import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { durableStorage } from '../src/server/storage';
import { NotificationService } from '../src/server/notificationService';

const token = '98765:notification-test-token';
const chatId = '4242';
let clockMs = Date.parse('2026-10-26T12:00:00.000Z');
const requests: Array<{ url: string; init?: RequestInit; payload?: Record<string, unknown> }> = [];
let respond: (url: string, init?: RequestInit) => Promise<Response> = async () => jsonResponse(200, { ok: true, result: { message_id: 101 } });
const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
  requests.push({ url, init, payload });
  return respond(url, init);
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const originalFetch = globalThis.fetch;
const envKeys = ['DATA_DIR', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SMTP_USER', 'SMTP_PASS', 'SMTP_HOST', 'SMTP_PORT', 'NOTIFICATION_EMAIL'] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr4-notification-delivery-'));
process.env.DATA_DIR = testDataDir;
process.env.TELEGRAM_BOT_TOKEN = token;
process.env.TELEGRAM_CHAT_ID = chatId;
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.NOTIFICATION_EMAIL = '';
durableStorage.setDataDir(testDataDir);
globalThis.fetch = mockFetch as typeof fetch;

function resetNotifications(): void {
  durableStorage.clearAll();
  requests.length = 0;
  respond = async () => jsonResponse(200, { ok: true, result: { message_id: 101 } });
}

function newService(options: Record<string, unknown> = {}): NotificationService {
  return new NotificationService({
    fetchImpl: mockFetch,
    sleep: async () => undefined,
    now: () => clockMs,
    ...options,
  } as any);
}

function telemetry(signalId: string, reason: string): any {
  return {
    metadata: {
      setup_id: signalId,
      pair: 'EUR/USD',
      experiment_id: 'EXP-2026-V3-REAL-001',
      payout_pct: 90,
      htf_bias: 'BULLISH',
      provider: 'TWELVE_DATA',
      data_provenance: 'LIVE_INGESTED',
      status_reason: reason,
      signal_timestamp_utc: new Date(clockMs).toISOString(),
    },
    market_context: { local_bias: 'BULLISH', selected_timeframe: '5m', session: 'LONDON', kill_zone: 'LONDON' },
    decision_engine_v3: {
      binarySignal: 'CALL',
      gates: [],
      mfci: { totalMfci: 0.5 },
      mfciBand: 'MEDIUM',
      engineMode: 'PRICE_ONLY',
      statusReason: reason,
    },
    system_execution: { rejection_reason: reason },
  };
}

async function testLiteralAngleBracketDeliveryAndSignalIdDedupe(): Promise<void> {
  resetNotifications();
  clockMs = Date.parse('2026-10-26T12:00:00.000Z');
  const service = newService();
  const signalId = 'V3-SIGNAL-IDEMPOTENT-1';
  const payload = telemetry(signalId, 'spread < & maximum');
  const extra = { signalId, validUntil: new Date(clockMs + 60_000).toISOString() };

  const first = await service.dispatchSignalAlert(payload, extra);
  assert.equal(first.telegram, 'SENT');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload?.parse_mode, undefined);
  assert.match(String(requests[0].payload?.text), /Reason: spread < & maximum/);

  const second = await service.dispatchSignalAlert(payload, extra);
  assert.equal(second.telegram, 'SENT');
  assert.equal(requests.length, 1, 'an already-SENT signal_id must not be delivered twice');

  const restartedService = newService();
  await restartedService.dispatchSignalAlert(payload, extra);
  assert.equal(requests.length, 1, 'signal_id idempotency must survive NotificationService restart');

  const concurrentSignalId = 'V3-SIGNAL-CONCURRENT-1';
  const concurrentPayload = telemetry(concurrentSignalId, 'concurrent probe');
  const concurrentExtra = { signalId: concurrentSignalId, validUntil: new Date(clockMs + 60_000).toISOString() };
  await Promise.all([
    service.dispatchSignalAlert(concurrentPayload, concurrentExtra),
    service.dispatchSignalAlert(concurrentPayload, concurrentExtra),
  ]);
  assert.equal(requests.length, 2, 'concurrent dispatches with the same signal_id must share one Telegram send');
}

async function testPersistedSendingResumesOnlyWithinValidityWindow(): Promise<void> {
  resetNotifications();
  clockMs = Date.parse('2026-10-26T12:00:00.000Z');
  const validSignalId = 'TEST-SIGNAL-SENDING-RECOVERY';
  durableStorage.recordNotification({
    setup_id: validSignalId,
    type: 'SIGNAL_ALERT',
    channel: 'TELEGRAM',
    recipient: 'OWNER_CHAT',
    status: 'SENDING',
    payload_summary: 'SENDING TEST SIGNAL',
  } as any);
  const validUntil = new Date(clockMs + 60_000).toISOString();
  const resumed = await newService().dispatchSignalAlert(telemetry(validSignalId, 'test recovery'), { signalId: validSignalId, validUntil });
  assert.equal(resumed.telegram, 'SENT');
  assert.equal(requests.length, 1, 'stale SENDING is retried after restart only while valid');
  assert.equal(durableStorage.loadNotifications().find((notification) => notification.setup_id === validSignalId && notification.channel === 'TELEGRAM')?.status, 'SENT');

  resetNotifications();
  const expiredSignalId = 'TEST-SIGNAL-SENDING-EXPIRED';
  durableStorage.recordNotification({
    setup_id: expiredSignalId,
    type: 'SIGNAL_ALERT',
    channel: 'TELEGRAM',
    recipient: 'OWNER_CHAT',
    status: 'SENDING',
    payload_summary: 'SENDING TEST SIGNAL',
  } as any);
  const expired = await newService().dispatchSignalAlert(telemetry(expiredSignalId, 'test recovery'), {
    signalId: expiredSignalId,
    validUntil: new Date(clockMs - 1).toISOString(),
  });
  assert.equal(expired.telegram, 'FAILED');
  assert.equal(requests.length, 0, 'expired in-flight signal must not be sent after restart');
  assert.match(String(durableStorage.loadNotifications().find((notification) => notification.setup_id === expiredSignalId && notification.channel === 'TELEGRAM')?.error_message), /expired.*not resent/i);
}

async function testExpiredSignalSendsOnlySafeNotice(): Promise<void> {
  resetNotifications();
  clockMs = Date.parse('2026-10-26T12:00:00.000Z');
  const service = newService();
  const signalId = 'V3-SIGNAL-EXPIRED-1';
  const result = await service.dispatchSignalAlert(telemetry(signalId, 'eligible CALL'), {
    signalId,
    validUntil: new Date(clockMs - 1).toISOString(),
  });

  assert.equal(result.telegram, 'SENT');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload?.text, `SIGNAL EXPIRED — do not enter (${signalId})`);
  assert.equal(String(requests[0].payload?.text).includes('COMVISION RESEARCH ALERT'), false);
}

async function testFailedTelegramDeliveryIsCountedInHealth(): Promise<void> {
  resetNotifications();
  respond = async () => jsonResponse(401, { ok: false, error_code: 401, description: 'Unauthorized' });
  const service = newService();
  assert.equal(await service.sendTelegramText('health counter probe'), false);
  assert.match(service.buildHealthText(), /Telegram failed deliveries: 1/);
  const result = await service.dispatchSignalAlert(telemetry('V3-SIGNAL-FAILED-1', 'eligible'), {
    signalId: 'V3-SIGNAL-FAILED-1',
    validUntil: new Date(clockMs + 60_000).toISOString(),
  });

  assert.equal(result.telegram, 'FAILED');
  assert.match(service.buildHealthText(), /Telegram failed deliveries: 2/);
}

async function testAllNotificationAndUpdatePathsUsePlainTextTransport(): Promise<void> {
  resetNotifications();
  const service = newService();
  await service.sendTelegramText('operator message with < literal');
  await service.dispatchSignalAlert(telemetry('V3-SURFACE-SIGNAL', 'reason < threshold'), {
    signalId: 'V3-SURFACE-SIGNAL',
    validUntil: new Date(clockMs + 60_000).toISOString(),
  });
  await service.dispatchResultAlert({
    setup_id: 'V3-SURFACE-RESULT',
    pair: 'EUR/USD',
    bias: 'BULLISH',
    timeframe: '5m',
    signal_timestamp_utc: new Date(clockMs).toISOString(),
    result_timestamp_utc: new Date(clockMs + 300_000).toISOString(),
    user_recorded_action: 'NONE',
    signal_outcome: 'WIN',
    next_candle: { open: 1.1, close: 1.2 },
  } as any);
  await service.sendTestNotification();
  process.env.TELEGRAM_CHAT_ID = '4242<&';
  const escapedTestAlert = await newService().sendTelegramTestAlert();
  assert.equal(escapedTestAlert.status, 'SENT');
  const escapedTestPayload = requests.filter((request) => request.init?.method === 'POST')
    .find((request) => String(request.payload?.text).includes('TELEGRAM INTEGRATION TEST'));
  assert.match(String(escapedTestPayload?.payload?.text), /4242&lt;&amp;/);
  process.env.TELEGRAM_CHAT_ID = chatId;

  const testAlert = await service.sendTelegramTestAlert();
  assert.equal(testAlert.status, 'SENT');

  respond = async (url: string) => {
    if (url.includes('/getUpdates')) {
      const isCommandPoll = url.includes('offset=');
      const text = isCommandPoll ? '/payout EURUSD 90' : '/start';
      return jsonResponse(200, {
        ok: true,
        result: [{ update_id: isCommandPoll ? 2 : 1, message: { chat: { id: Number(chatId), type: 'private' }, date: 1793016000, text } }],
      });
    }
    return jsonResponse(200, { ok: true, result: { message_id: 102 } });
  };
  const latest = await service.getLatestTelegramUpdate();
  assert.equal(latest.success, true);
  const commands = await service.processOwnerTelegramCommands();
  assert.equal(commands.processed, 1);

  const postRequests = requests.filter((request) => request.init?.method === 'POST');
  const getRequests = requests.filter((request) => request.url.includes('/getUpdates'));
  assert.equal(getRequests.length, 2);
  assert.ok(postRequests.length >= 6);
  assert.ok(requests.every((request) => request.init?.signal instanceof AbortSignal), 'every Telegram request must use the shared timeout helper');
  for (const request of postRequests) {
    assert.equal(request.payload?.parse_mode, undefined, 'Telegram notification payloads must be plain text');
  }
  const telegramTestPayload = postRequests.find((request) => String(request.payload?.text).includes('TELEGRAM INTEGRATION TEST'));
  assert.ok(telegramTestPayload);
  assert.doesNotMatch(String(telegramTestPayload?.payload?.text), /<\/?(?:b|i|code)>/i);
}

async function testNodemailerHasAndEnforcesTimeout(): Promise<void> {
  resetNotifications();
  process.env.SMTP_USER = 'owner@example.test';
  process.env.SMTP_PASS = 'not-a-real-secret';
  process.env.NOTIFICATION_EMAIL = 'owner@example.test';
  const transportOptions: Array<Record<string, unknown>> = [];
  const service = newService({
    mailTimeoutMs: 10,
    createTransport: (options: Record<string, unknown>) => {
      transportOptions.push(options);
      return { sendMail: async () => new Promise(() => undefined) };
    },
  });
  const startedAt = Date.now();
  const result = await service.dispatchSignalAlert(telemetry('V3-SIGNAL-MAIL-TIMEOUT', 'eligible'), {
    signalId: 'V3-SIGNAL-MAIL-TIMEOUT',
    validUntil: new Date(clockMs + 60_000).toISOString(),
  });
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.email, 'FAILED');
  assert.ok(elapsedMs < 500, `mail send should time out promptly, took ${elapsedMs}ms`);
  assert.equal(transportOptions[0]?.connectionTimeout, 5000);
  assert.equal(transportOptions[0]?.greetingTimeout, 5000);
  assert.equal(transportOptions[0]?.socketTimeout, 5000);
}

function testNoTelegramFetchBypassesCentralHelper(): void {
  const source = fs.readFileSync(new URL('../src/server/notificationService.ts', import.meta.url), 'utf8');
  assert.match(source, /telegramSend\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/, 'all Telegram send/getUpdates network calls must use telegramSend');
}

try {
  await testLiteralAngleBracketDeliveryAndSignalIdDedupe();
  await testPersistedSendingResumesOnlyWithinValidityWindow();
  await testExpiredSignalSendsOnlySafeNotice();
  await testFailedTelegramDeliveryIsCountedInHealth();
  await testAllNotificationAndUpdatePathsUsePlainTextTransport();
  await testNodemailerHasAndEnforcesTimeout();
  testNoTelegramFetchBypassesCentralHelper();
  console.log('[pr4_notification_delivery] all service delivery tests passed');
} finally {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
