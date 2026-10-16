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
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    throw new ProviderAdapterError(provider, isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', isTimeout ? `${provider} request timed out.` : `${provider} market-data request failed.`);
  }

  if (response.status === 429) throw new ProviderAdapterError(provider, 'RATE_LIMITED', `${provider} rate limit reached (HTTP 429).`, response.status);
  if (response.status >= 500) throw new ProviderAdapterError(provider, 'PROVIDER_SERVER_ERROR', `${provider} server error (HTTP ${response.status}).`, response.status);
  if (!response.ok) throw new ProviderAdapterError(provider, 'PROVIDER_HTTP_ERROR', `${provider} returned HTTP ${response.status}.`, response.status);

  let payload: unknown;
  try {
    payload = await response.json();
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
