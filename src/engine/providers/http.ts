import type { MarketDataProvider } from './contracts';

export interface ProviderHttpResponse {
  payload: unknown;
  serverDate: string | null;
  creditsUsed?: number;
  creditsLeft?: number;
}

export class ProviderAdapterError extends Error {
  constructor(
    public readonly provider: MarketDataProvider,
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ProviderAdapterError';
  }
}

export async function requestJson(
  provider: MarketDataProvider,
  request: typeof fetch,
  url: URL,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<ProviderHttpResponse> {
  let response: Response;
  try {
    response = await request(url, { signal, headers: { Accept: 'application/json', ...headers } });
  } catch (error: unknown) {
    if (error instanceof ProviderAdapterError) throw error;
    const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    const timeout = error instanceof Error && error.name === 'TimeoutError';
    throw new ProviderAdapterError(provider, timeout ? 'PROVIDER_TIMEOUT' : aborted ? 'OPERATOR_ABORT' : 'PROVIDER_UNAVAILABLE', timeout ? `${provider} request timed out.` : aborted ? `${provider} request aborted by operator.` : `${provider} market-data request failed.`);
  }

  let payload: any;
  try { payload = await response.clone().json(); } catch { payload = undefined; }
  const payloadCode = Number(payload?.code);
  if (response.status === 401 || response.status === 403 || payloadCode === 401 || payloadCode === 403) throw new ProviderAdapterError(provider, 'CREDENTIAL_INVALID', `${provider} credentials were rejected.`, response.status || payloadCode);
  if (response.status === 429 || payloadCode === 429) {
    const daily = /daily|day|quota/i.test(String(payload?.message || payload?.error || ''));
    throw new ProviderAdapterError(provider, daily ? 'DAILY_QUOTA_EXHAUSTED' : 'RATE_LIMITED', `${provider} ${daily ? 'daily quota exhausted' : 'rate limit reached'}.`, response.status || 429);
  }
  if (response.status >= 500) throw new ProviderAdapterError(provider, 'PROVIDER_SERVER_ERROR', `${provider} server error (HTTP ${response.status}).`, response.status);
  if (!response.ok) throw new ProviderAdapterError(provider, 'PROVIDER_HTTP_ERROR', `${provider} returned HTTP ${response.status}.`, response.status);

  try {
    payload = payload ?? await response.json();
  } catch {
    throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} returned invalid JSON.`, response.status);
  }
  const used = response.headers.get('api-credits-used');
  const left = response.headers.get('api-credits-left');
  return {
    payload,
    serverDate: response.headers.get('date'),
    creditsUsed: used && /^\d+$/.test(used) ? Number(used) : undefined,
    creditsLeft: left && /^\d+$/.test(left) ? Number(left) : undefined,
  };
}

export function assertProviderPayload(
  provider: MarketDataProvider,
  condition: boolean,
  code: string,
  safeMessage: string,
): void {
  if (!condition) throw new ProviderAdapterError(provider, code, safeMessage);
}
