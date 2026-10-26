import type { Timeframe } from '../types';
import type { IForexDataProvider, ProviderCandlePayload, ProviderQuotePayload } from './contracts';
import { ProviderAdapterError, assertProviderPayload, requestJson } from './http';

const INTERVAL: Record<Timeframe, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h' };

export class TwelveDataAdapter implements IForexDataProvider {
  public readonly id = 'TWELVE_DATA' as const;
  public readonly label = 'Twelve Data';
  private apiKey: string;

  constructor(private readonly request: typeof fetch = fetch, apiKey = process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY || '') {
    this.apiKey = apiKey;
  }

  public isConfigured(): boolean { return !!this.apiKey; }
  public setApiKey(apiKey: string): void { this.apiKey = apiKey; }

  public async fetchCandles(pair: string, timeframe: Timeframe, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Twelve Data key is not configured.');
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', pair);
    url.searchParams.set('interval', INTERVAL[timeframe]);
    url.searchParams.set('outputsize', '130');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('order', 'asc');
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `apikey ${this.apiKey}` });
    const payload = response.payload as any;
    return { ...this.parsePayload(payload, response.serverDate), creditsUsed: response.creditsUsed, creditsLeft: response.creditsLeft };
  }

  public async fetchCandlesBatch(pairs: string[], timeframe: Timeframe, signal: AbortSignal): Promise<Record<string, ProviderCandlePayload>> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Twelve Data key is not configured.');
    const symbols = [...new Set(pairs.map((pair) => pair.trim().toUpperCase()))];
    if (!symbols.length) return {};
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', symbols.join(',')); url.searchParams.set('interval', INTERVAL[timeframe]);
    url.searchParams.set('outputsize', '130'); url.searchParams.set('timezone', 'UTC'); url.searchParams.set('order', 'asc');
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `apikey ${this.apiKey}` });
    const payload = response.payload as any; const result: Record<string, ProviderCandlePayload> = {};
    for (const symbol of symbols) {
      const item = payload?.[symbol] ?? (symbols.length === 1 ? payload : undefined);
      if (!item || item.status === 'error') continue;
      try { result[symbol] = { ...this.parsePayload(item, response.serverDate), creditsUsed: response.creditsUsed, creditsLeft: response.creditsLeft }; } catch { /* preserve other symbols */ }
    }
    return result;
  }

  public async fetchQuote(pair: string, signal: AbortSignal): Promise<ProviderQuotePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Twelve Data key is not configured.');
    const url = new URL('https://api.twelvedata.com/price'); url.searchParams.set('symbol', pair);
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `apikey ${this.apiKey}` });
    const price = Number((response.payload as any)?.price);
    if (!Number.isFinite(price)) throw new ProviderAdapterError(this.id, 'INVALID_PROVIDER_RESPONSE', 'Twelve Data price response did not contain a numeric price.');
    return { price, ts: response.serverDate || new Date().toISOString(), creditsUsed: response.creditsUsed, creditsLeft: response.creditsLeft };
  }

  public async fetchHistoricalCandles(pair: string, timeframe: Timeframe, startDate: string, endDateInclusive: string, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Twelve Data key is not configured.');
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', pair);
    url.searchParams.set('interval', INTERVAL[timeframe]);
    url.searchParams.set('outputsize', '5000');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('order', 'asc');
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDateInclusive);
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `apikey ${this.apiKey}` });
    return { ...this.parsePayload(response.payload as any, response.serverDate), creditsUsed: response.creditsUsed, creditsLeft: response.creditsLeft };
  }

  private parsePayload(payload: any, serverDate: string | null): ProviderCandlePayload {
    if (payload?.status === 'error') {
      const detail = String(payload?.message || '');
      const rateLimited = /credit|rate.?limit|too many requests/i.test(detail);
      throw new ProviderAdapterError(this.id, rateLimited ? 'RATE_LIMITED' : 'PROVIDER_API_ERROR', rateLimited ? 'Twelve Data credit/rate limit reached.' : 'Twelve Data rejected the request.');
    }
    assertProviderPayload(this.id, Array.isArray(payload?.values), 'INVALID_PROVIDER_RESPONSE', 'Twelve Data response did not contain time-series values.');
    const rows = payload.values as unknown[];
    const volumeAvailable = rows.some((row: any) => row?.volume !== undefined && row?.volume !== null && row?.volume !== '' && Number.isFinite(Number(row.volume)));
    return { rows, timezone: 'UTC', volumeAvailable, serverDate };
  }
}
