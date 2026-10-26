import assert from 'node:assert/strict';
import { telegramSend } from '../src/server/telegramSend';

const token = '12345:unit-test-token';
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

async function test429HonorsRetryAfterAndReturnsMessageId(): Promise<void> {
  const delays: number[] = [];
  const requests: Array<{ url: string; init?: RequestInit; payload?: Record<string, unknown> }> = [];
  let deliveredMessages = 0;
  const result = await telegramSend({
    token,
    method: 'sendMessage',
    payload: { chat_id: '42', text: 'signal', parse_mode: 'HTML' },
    sleep: async (ms: number) => { delays.push(ms); },
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      requests.push({ url, init, payload });
      if (requests.length === 1) {
        return jsonResponse(429, { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } });
      }
      deliveredMessages++;
      return jsonResponse(200, { ok: true, result: { message_id: 987 } });
    },
  });

  assert.deepEqual(delays, [3000]);
  assert.equal(requests.length, 2);
  assert.equal(deliveredMessages, 1, 'a 429 retry must yield one delivered message, not a duplicate');
  assert.ok(requests[0].url.endsWith(`/bot${token}/sendMessage`));
  assert.deepEqual(result, { ok: true, attempts: 2, messageId: 987 });
}

async function testParseEntity400RetriesWithoutParseMode(): Promise<void> {
  const payloads: Array<Record<string, unknown> | undefined> = [];
  const result = await telegramSend({
    token,
    method: 'sendMessage',
    payload: { chat_id: '42', text: 'literal <reason>', parse_mode: 'HTML' },
    sleep: async () => undefined,
    fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined);
      if (payloads.length === 1) {
        return jsonResponse(400, { ok: false, error_code: 400, description: "Bad Request: can't parse entities" });
      }
      return jsonResponse(200, { ok: true, result: { message_id: 988 } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(payloads[1]?.text, 'literal <reason>');
  assert.equal(payloads[1]?.parse_mode, undefined);
}

async function testTimeoutIsBoundedAndUsesConfiguredBackoff(): Promise<void> {
  const delays: number[] = [];
  const signals: AbortSignal[] = [];
  const result = await telegramSend({
    token,
    method: 'sendMessage',
    payload: { chat_id: '42', text: 'timeout probe' },
    timeoutMs: 5,
    sleep: async (ms: number) => { delays.push(ms); },
    fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      assert.ok(signal instanceof AbortSignal);
      signals.push(signal);
      return await new Promise<Response>((_resolve, reject) => {
        const keepAlive = setTimeout(() => undefined, 1000);
        const abort = () => { clearTimeout(keepAlive); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.attempts, 4);
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.equal(signals.length, 4);
  assert.ok(signals.every((signal) => signal.aborted));
}

async function testDefaultTimeoutIsFiveSeconds(): Promise<void> {
  const originalTimeout = AbortSignal.timeout;
  let requestedTimeout: number | undefined;
  Object.defineProperty(AbortSignal, 'timeout', {
    configurable: true,
    value: (ms: number) => {
      requestedTimeout = ms;
      return originalTimeout(30_000);
    },
  });
  try {
    const result = await telegramSend({
      token,
      method: 'sendMessage',
      payload: { chat_id: '42', text: 'timeout default' },
      fetchImpl: async () => jsonResponse(200, { ok: true, result: { message_id: 1 } }),
      sleep: async () => undefined,
    });
    assert.equal(result.ok, true);
    assert.equal(requestedTimeout, 5000);
  } finally {
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: originalTimeout });
  }
}

async function testRetryAfterExpirySendsOnlySafeExpiredNotice(): Promise<void> {
  let nowMs = Date.parse('2026-10-26T12:00:00.000Z');
  const validUntil = new Date(nowMs + 500).toISOString();
  const payloads: Array<Record<string, unknown> | undefined> = [];
  const result = await telegramSend({
    token,
    method: 'sendMessage',
    payload: { chat_id: '42', text: 'CALL signal — do not send after expiry' },
    validUntil,
    expiredText: 'SIGNAL EXPIRED — do not enter',
    now: () => nowMs,
    sleep: async (ms: number) => { nowMs += ms; },
    fetchImpl: async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      payloads.push(payload);
      if (payloads.length === 1) return jsonResponse(503, { ok: false, description: 'temporarily unavailable' });
      return jsonResponse(200, { ok: true, result: { message_id: 989 } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.expired, true);
  assert.match(String(payloads[0]?.text), /CALL signal/);
  assert.equal(payloads[1]?.text, 'SIGNAL EXPIRED — do not enter');
}

async function testGetUpdatesUsesTheSharedHelper(): Promise<void> {
  let requestedUrl = '';
  let requestMethod = '';
  const result = await telegramSend({
    token,
    method: 'getUpdates',
    payload: { limit: 25, allowed_updates: '["message"]' },
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestMethod = init?.method || 'GET';
      return jsonResponse(200, { ok: true, result: [] });
    },
    sleep: async () => undefined,
  });

  assert.equal(result.ok, true);
  assert.equal(requestMethod, 'GET');
  assert.match(requestedUrl, new RegExp(`/bot${token}/getUpdates`));
  assert.ok(result.data && Array.isArray((result.data as { result?: unknown[] }).result));
}

async function testLongPollAbortExceedsLongPollDuration(): Promise<void> {
  const originalTimeout = AbortSignal.timeout;
  let requestedTimeout: number | undefined;
  Object.defineProperty(AbortSignal, 'timeout', {
    configurable: true,
    value: (ms: number) => { requestedTimeout = ms; return originalTimeout(30_000); },
  });
  try {
    const result = await telegramSend({
      token,
      method: 'getUpdates',
      payload: { timeout: 30, limit: 25 },
      fetchImpl: async () => jsonResponse(200, { ok: true, result: [] }),
      sleep: async () => undefined,
    });
    assert.equal(result.ok, true);
    assert.equal(requestedTimeout, 31_000);
  } finally {
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: originalTimeout });
  }
}

async function testOrdinary400401403ArePermanentFailures(): Promise<void> {
  for (const [status, errorCode, description] of [
    [400, 400, 'Bad Request: chat not found'],
    [401, 401, 'Unauthorized'],
    [403, 403, 'Forbidden'],
  ] as const) {
    let attempts = 0;
    const delays: number[] = [];
    const result = await telegramSend({
      token,
      method: 'sendMessage',
      payload: { chat_id: '42', text: 'permanent failure' },
      sleep: async (ms) => { delays.push(ms); },
      fetchImpl: async () => { attempts++; return jsonResponse(status, { ok: false, error_code: errorCode, description }); },
    });
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 1);
    assert.equal(attempts, 1);
    assert.deepEqual(delays, []);
  }
}

async function testTokenIsRedactedFromFailures(): Promise<void> {
  const result = await telegramSend({
    token,
    method: 'sendMessage',
    payload: { chat_id: '42', text: 'redaction probe' },
    sleep: async () => undefined,
    fetchImpl: async () => jsonResponse(500, { ok: false, description: `upstream echoed ${token}` }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error || '', /\[REDACTED_BOT_TOKEN\]/);
  assert.equal((result.error || '').includes(token), false);
}

async function testFetchUrlIsRedactedIncludingGetUpdates(): Promise<void> {
  const delays: number[] = [];
  const result = await telegramSend({
    token,
    method: 'getUpdates',
    payload: { offset: 17 },
    sleep: async (ms) => { delays.push(ms); },
    fetchImpl: async (input) => { throw new Error(`network failed for ${String(input)}`); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 4);
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.match(result.error || '', /\[REDACTED_BOT_TOKEN\]/);
  assert.equal((result.error || '').includes(token), false);
}

await test429HonorsRetryAfterAndReturnsMessageId();
await testParseEntity400RetriesWithoutParseMode();
await testTimeoutIsBoundedAndUsesConfiguredBackoff();
await testDefaultTimeoutIsFiveSeconds();
await testRetryAfterExpirySendsOnlySafeExpiredNotice();
await testGetUpdatesUsesTheSharedHelper();
await testLongPollAbortExceedsLongPollDuration();
await testOrdinary400401403ArePermanentFailures();
await testTokenIsRedactedFromFailures();
await testFetchUrlIsRedactedIncludingGetUpdates();
console.log('[pr4_telegram_reliability] all transport contract tests passed');
