import type { Timeframe } from '../types';
import type { IForexDataProvider, ProviderCandlePayload } from './contracts';
import { ProviderAdapterError, requestJson } from './http';

// 5min is explicitly shown by Tiingo's FX REST docs. The other mappings follow
// conventional resampling names but must still be verified against each account's API entitlement.
const RESAMPLE: Record<Timeframe, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min' };

export class TiingoAdapter implements IForexDataProvider {
  public readonly id = 'TIINGO' as const;
  public readonly label = 'Tiingo FX';
  private apiKey: string;

  constructor(private readonly request: typeof fetch = fetch, apiKey = process.env.TIINGO_API_KEY || '') {
    this.apiKey = apiKey;
  }

  public isConfigured(): boolean { return !!this.apiKey; }
  public setApiKey(apiKey: string): void { this.apiKey = apiKey; }

  public async fetchCandles(pair: string, timeframe: Timeframe, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Tiingo API key is not configured.');
    const ticker = pair.replace('/', '').toUpperCase();
    const url = new URL(`https://api.tiingo.com/tiingo/fx/${encodeURIComponent(ticker)}/prices`);
    url.searchParams.set('resampleFreq', RESAMPLE[timeframe]);
    const startDate = new Date(Date.now() - Math.max(2, timeframe === '1m' || timeframe === '5m' ? 2 : 7) * 86_400_000).toISOString().slice(0, 10);
    url.searchParams.set('startDate', startDate);
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `Token ${this.apiKey}` });
    if (!Array.isArray(response.payload)) throw new ProviderAdapterError(this.id, 'INVALID_PROVIDER_RESPONSE', 'Tiingo FX response did not contain a price-row array.');
    const rows = response.payload.map((row: any) => {
      const timestamp = row?.date ?? row?.datetime ?? row?.timestamp;
      if (typeof timestamp === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) {
        throw new ProviderAdapterError(this.id, 'UNVERIFIED_TIMESTAMP_TIMEZONE', 'Tiingo FX candle timestamp omitted timezone; refusing to infer UTC.');
      }
      return { datetime: timestamp, open: row?.open, high: row?.high, low: row?.low, close: row?.close ?? row?.last ?? row?.lastPrice, volume: null };
    });
    return { rows, timezone: 'UTC', volumeAvailable: false, serverDate: response.serverDate };
  }
}
