import type { Timeframe } from '../types';
import type { IForexDataProvider, ProviderCandlePayload } from './contracts';
import { ProviderAdapterError, requestJson } from './http';

const GRANULARITY: Record<Timeframe, string> = { '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1h': 'H1' };

export class OandaAdapter implements IForexDataProvider {
  public readonly id = 'OANDA' as const;
  public readonly label = 'OANDA v20 Practice';
  private token: string;
  private readonly accountId: string;

  constructor(
    private readonly request: typeof fetch = fetch,
    token = process.env.OANDA_PRACTICE_TOKEN || '',
    accountId = process.env.OANDA_ACCOUNT_ID || '',
  ) {
    this.token = token;
    this.accountId = accountId;
  }

  public isConfigured(): boolean { return !!this.token; }
  public get configuredAccountId(): boolean { return !!this.accountId; }
  public setApiKey(token: string): void { this.token = token; }

  public async fetchCandles(pair: string, timeframe: Timeframe, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'OANDA practice token is not configured.');
    const instrument = pair.replace('/', '_').toUpperCase();
    const url = new URL(`https://api-fxpractice.oanda.com/v3/instruments/${encodeURIComponent(instrument)}/candles`);
    url.searchParams.set('granularity', GRANULARITY[timeframe]);
    url.searchParams.set('count', '130');
    url.searchParams.set('price', 'M');
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `Bearer ${this.token}` });
    const payload = response.payload as any;
    if (payload?.errorMessage) {
      const message = String(payload.errorMessage);
      const limited = /rate|throttl|too many/i.test(message);
      throw new ProviderAdapterError(this.id, limited ? 'RATE_LIMITED' : 'PROVIDER_API_ERROR', limited ? 'OANDA request rate limit reached.' : 'OANDA rejected the candle request.');
    }
    if (!Array.isArray(payload?.candles)) throw new ProviderAdapterError(this.id, 'INVALID_PROVIDER_RESPONSE', 'OANDA response did not contain candles.');
    const rows = payload.candles
      .filter((candle: any) => candle?.complete !== false && candle?.mid)
      .map((candle: any) => ({ datetime: candle.time, open: candle.mid.o, high: candle.mid.h, low: candle.mid.l, close: candle.mid.c, volume: null }));
    return { rows, timezone: 'UTC', volumeAvailable: false, serverDate: response.serverDate };
  }
}
