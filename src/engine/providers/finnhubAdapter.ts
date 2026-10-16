import type { Timeframe } from '../types';
import type { IForexDataProvider, ProviderCandlePayload } from './contracts';
import { ProviderAdapterError, requestJson } from './http';
import type { FinnhubWebSocketClient } from './finnhubWebSocket';

const RESOLUTION: Record<Timeframe, string> = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60' };
const PERIOD_SECONDS: Record<Timeframe, number> = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };

export class FinnhubAdapter implements IForexDataProvider {
  public readonly id = 'FINNHUB' as const;
  public readonly label = 'Finnhub';
  private apiKey: string;

  constructor(private readonly request: typeof fetch = fetch, apiKey = process.env.FINNHUB_API_KEY || '', private stream?: FinnhubWebSocketClient) {
    this.apiKey = apiKey;
  }

  public isConfigured(): boolean { return !!this.apiKey; }
  public setCredentials(apiKey: string, stream?: FinnhubWebSocketClient): void {
    this.stream?.stop();
    this.apiKey = apiKey;
    this.stream = stream;
  }

  public canServeFromStream(pair: string, timeframe: Timeframe): boolean {
    if (!this.stream || !this.isConfigured()) return false;
    this.stream.subscribePair(pair);
    return !!this.stream.getCandles(pair, timeframe);
  }

  public async fetchCandles(pair: string, timeframe: Timeframe, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Finnhub API key is not configured.');
    this.stream?.subscribePair(pair);
    const buffered = this.stream?.getCandles(pair, timeframe);
    if (buffered) return { rows: buffered, timezone: 'UTC', volumeAvailable: false, serverDate: null };
    const symbol = `OANDA:${pair.replace('/', '_').toUpperCase()}`;
    const to = Math.floor(Date.now() / 1000);
    const from = to - PERIOD_SECONDS[timeframe] * 100;
    const url = new URL('https://finnhub.io/api/v1/forex/candle');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('resolution', RESOLUTION[timeframe]);
    url.searchParams.set('from', String(from));
    url.searchParams.set('to', String(to));
    const response = await requestJson(this.id, this.request, url, signal, { 'X-Finnhub-Token': this.apiKey });
    const payload = response.payload as any;
    if (payload?.error) {
      const message = String(payload.error);
      const rateLimited = /limit|too many|429/i.test(message);
      throw new ProviderAdapterError(this.id, rateLimited ? 'RATE_LIMITED' : 'PROVIDER_API_ERROR', rateLimited ? 'Finnhub rate limit reached.' : 'Finnhub rejected the candle request.');
    }
    if (payload?.s === 'no_data') throw new ProviderAdapterError(this.id, 'INSUFFICIENT_HISTORY', 'Finnhub returned no candle data for the requested window.');
    const arrays = [payload?.t, payload?.o, payload?.h, payload?.l, payload?.c];
    if (payload?.s !== 'ok' || !arrays.every(Array.isArray) || !arrays.every((arr: unknown[]) => arr.length === arrays[0].length)) {
      throw new ProviderAdapterError(this.id, 'INVALID_PROVIDER_RESPONSE', 'Finnhub candle response arrays are missing or inconsistent.');
    }
    const rows = arrays[0].map((stamp: number, i: number) => ({
      datetime: new Date(Number(stamp) * 1000).toISOString(),
      open: payload.o[i], high: payload.h[i], low: payload.l[i], close: payload.c[i],
      // Finnhub's Forex Candles response does not define volume units; do not pass it into volume-based gates.
      volume: null,
    }));
    return { rows, timezone: 'UTC', volumeAvailable: false, serverDate: response.serverDate };
  }
}
