export type TelegramMethod = 'sendMessage' | 'getUpdates';

export interface TelegramSendOptions {
  token: string;
  method: TelegramMethod;
  payload: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  validUntil?: string;
  expiredText?: string;
}

export interface TelegramSendResult {
  ok: boolean;
  attempts: number;
  messageId?: number;
  data?: unknown;
  error?: string;
  status?: number;
  errorCode?: number;
  expired?: boolean;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;
const DEFAULT_TIMEOUT_MS = 5000;

function redactString(value: string, token: string): string {
  return token ? value.split(token).join('[REDACTED_BOT_TOKEN]') : value;
}

function redactValue(value: unknown, token: string): unknown {
  if (typeof value === 'string') return redactString(value, token);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, token));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactValue(item, token)]));
  }
  return value;
}

function buildUrl(token: string, method: TelegramMethod, payload: Record<string, unknown>): string {
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  if (method === 'getUpdates') {
    for (const [key, rawValue] of Object.entries(payload)) {
      if (rawValue === undefined || rawValue === null) continue;
      const value = Array.isArray(rawValue) ? JSON.stringify(rawValue) : String(rawValue);
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function failure(
  token: string,
  attempts: number,
  error: string,
  status?: number,
  errorCode?: number,
  expired?: boolean,
): TelegramSendResult {
  return {
    ok: false,
    attempts,
    error: redactString(error, token),
    status,
    errorCode,
    ...(expired ? { expired: true } : {}),
  };
}

function isExpired(validUntil: string | undefined, now: () => number): boolean {
  if (!validUntil) return false;
  const expiryMs = Date.parse(validUntil);
  return Number.isFinite(expiryMs) && now() >= expiryMs;
}

export async function telegramSend(options: TelegramSendOptions): Promise<TelegramSendResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const requestedTimeoutSeconds = options.method === 'getUpdates' ? Number(options.payload.timeout) : 0;
  const longPollTimeoutMs = Number.isFinite(requestedTimeoutSeconds) && requestedTimeoutSeconds > 0
    ? (requestedTimeoutSeconds + 1) * 1000
    : 0;
  const timeoutMs = Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, longPollTimeoutMs);
  let payload: Record<string, unknown> = { ...options.payload };
  let expired = false;
  let parseModeFallbackUsed = false;
  let lastStatus: number | undefined;
  let lastErrorCode: number | undefined;
  let lastError = 'Telegram request failed.';

  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    if (!expired && options.expiredText && isExpired(options.validUntil, now)) {
      payload = { ...payload, text: options.expiredText };
      delete payload.parse_mode;
      expired = true;
    }

    try {
      const method = options.method === 'getUpdates' ? 'GET' : 'POST';
      const response = await fetchImpl(buildUrl(options.token, options.method, payload), {
        method,
        headers: method === 'POST'
          ? { 'Content-Type': 'application/json', Accept: 'application/json' }
          : { Accept: 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let data: any;
      if (typeof response.text === 'function') {
        const responseText = await response.text();
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = { description: responseText };
        }
      } else if (typeof response.json === 'function') {
        data = await response.json();
      } else {
        data = {};
      }
      const safeData = redactValue(data, options.token);
      const errorCode = Number(data?.error_code || response.status) || response.status;
      const description = typeof data?.description === 'string' ? data.description : `Telegram API returned HTTP ${response.status}.`;
      const succeeded = response.ok && data?.ok !== false;

      if (succeeded) {
        const messageId = Number(data?.result?.message_id);
        return {
          ok: true,
          attempts: attempt,
          ...(Number.isFinite(messageId) && messageId > 0 ? { messageId } : {}),
          ...(options.method === 'getUpdates' ? { data: safeData } : {}),
          ...(expired ? { expired: true } : {}),
        };
      }

      lastStatus = response.status;
      lastErrorCode = Number(data?.error_code) || response.status;
      lastError = description;
      const normalizedDescription = description.toLowerCase();
      const isParseEntityError = (response.status === 400 || lastErrorCode === 400)
        && Boolean(payload.parse_mode)
        && !parseModeFallbackUsed
        && (normalizedDescription.includes("can't parse entities") || normalizedDescription.includes('parse entities'));
      if (isParseEntityError && attempt < RETRY_DELAYS_MS.length + 1) {
        payload = { ...payload };
        delete payload.parse_mode;
        parseModeFallbackUsed = true;
        continue;
      }

      const rateLimited = response.status === 429 || lastErrorCode === 429;
      const retryable = rateLimited || response.status >= 500 || lastErrorCode >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length + 1) {
        return failure(options.token, attempt, lastError, lastStatus, lastErrorCode, expired);
      }

      const retryAfter = Number(data?.parameters?.retry_after);
      const headerRetryAfter = Number(response.headers?.get?.('retry-after'));
      const delayMs = rateLimited && Number.isFinite(retryAfter) && retryAfter >= 0
        ? retryAfter * 1000
        : rateLimited && Number.isFinite(headerRetryAfter) && headerRetryAfter >= 0
          ? headerRetryAfter * 1000
          : RETRY_DELAYS_MS[attempt - 1];
      await sleep(delayMs);
    } catch (error: unknown) {
      lastStatus = undefined;
      lastErrorCode = undefined;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= RETRY_DELAYS_MS.length + 1) {
        return failure(options.token, attempt, lastError, lastStatus, lastErrorCode, expired);
      }
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  return failure(options.token, RETRY_DELAYS_MS.length + 1, lastError, lastStatus, lastErrorCode, expired);
}
