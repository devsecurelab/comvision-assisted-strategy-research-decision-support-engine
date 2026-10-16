import type { Timeframe } from '../types';
import type { IForexDataProvider, ProviderCandlePayload } from './contracts';
import { ProviderAdapterError, requestJson } from './http';

const INTERVAL: Record<Timeframe, string> = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '60min' };
const SERIES_KEY: Record<Timeframe, string> = {
  '1m': 'Time Series FX (1min)', '5m': 'Time Series FX (5min)', '15m': 'Time Series FX (15min)',
  '30m': 'Time Series FX (30min)', '1h': 'Time Series FX (60min)',
};

export class AlphaVantageAdapter implements IForexDataProvider {
  public readonly id = 'ALPHA_VANTAGE' as const;
  public readonly label = 'Alpha Vantage';
  private apiKey: string;

  constructor(private readonly request: typeof fetch = fetch, apiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '') {
    this.apiKey = apiKey;
  }

  public isConfigured(): boolean { return !!this.apiKey; }
  public setApiKey(apiKey: string): void { this.apiKey = apiKey; }

  public async fetchCandles(pair: string, timeframe: Timeframe, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Alpha Vantage key is not configured.');
    const [fromSymbol, toSymbol] = pair.split('/');
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'FX_INTRADAY');
    url.searchParams.set('from_symbol', fromSymbol);
    url.searchParams.set('to_symbol', toSymbol);
    url.searchParams.set('interval', INTERVAL[timeframe]);
    url.searchParams.set('outputsize', 'compact');
    url.searchParams.set('datatype', 'json');
    url.searchParams.set('apikey', this.apiKey);
    const response = await requestJson(this.id, this.request, url, signal);
    const payload = response.payload as any;
    if (payload?.['Error Message'] || payload?.Note || payload?.Information) {
      const detail = String(payload['Error Message'] || payload.Note || payload.Information);
      const premium = /premium endpoint|premium membership|premium plan|subscribe to premium/i.test(detail);
      const rateLimited = /call frequency|requests per minute|daily limit|rate limit|thank you for using alpha vantage/i.test(detail);
      if (premium) throw new ProviderAdapterError(this.id, 'UNSUPPORTED_ON_FREE_KEY', 'Alpha Vantage indicates FX_INTRADAY requires an eligible entitlement.');
      if (rateLimited) throw new ProviderAdapterError(this.id, 'RATE_LIMITED', 'Alpha Vantage rate limit reached.');
      throw new ProviderAdapterError(this.id, 'PROVIDER_API_ERROR', 'Alpha Vantage rejected the request.');
    }
    const series = payload?.[SERIES_KEY[timeframe]];
    if (!series || typeof series !== 'object') throw new ProviderAdapterError(this.id, 'INVALID_PROVIDER_RESPONSE', `Alpha Vantage did not return ${SERIES_KEY[timeframe]}.`);
    const rows = Object.entries(series as Record<string, any>).map(([datetime, fields]) => ({
      datetime, open: fields?.['1. open'], high: fields?.['2. high'], low: fields?.['3. low'], close: fields?.['4. close'], volume: null,
    }));
    return { rows, timezone: payload?.['Meta Data']?.['6. Time Zone'] || 'US/Eastern', volumeAvailable: false, serverDate: response.serverDate };
  }
}
