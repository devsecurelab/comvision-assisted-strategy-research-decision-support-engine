// Market data adapters. Live provenance is assigned only after a successful provider HTTP response.
// Replay candles are available only when RESEARCH_STREAM_REPLAY is explicitly selected.

import { Candle, DataProvenance, Timeframe } from './types';

export type MarketDataProvider = 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'RESEARCH_STREAM_REPLAY';

export interface ProviderQuotaInfo {
  used: number;
  limit: number;
  configured: boolean;
  status: 'ONLINE' | 'STANDBY' | 'FALLBACK_LIVE' | 'RATE_LIMITED' | 'UNCONFIGURED';
}

export interface ProviderStatus {
  provider: MarketDataProvider;
  status: 'ONLINE' | 'FALLBACK_LIVE' | 'RATE_LIMITED' | 'OFFLINE';
  lastSync: string;
  requestsUsedToday: number;
  rateLimitWarning?: string;
  provenanceDetails: string;
  isFallbackLive: boolean;
  quota: {
    twelveData: ProviderQuotaInfo;
    alphaVantage: ProviderQuotaInfo;
  };
}

export interface MarketDataResult {
  candles: Candle[];
  provider: MarketDataProvider;
  dataProvenance: DataProvenance;
  fetchedAt: string;
  lastTickAt: string;
  latencyMs: number;
  cacheHit: boolean;
  volumeAvailable?: boolean;
  creditsUsed?: number;
  creditsLeft?: number;
}

export class MarketDataError extends Error {
  public readonly code: string;
  public readonly provider: MarketDataProvider;

  constructor(code: string, message: string, provider: MarketDataProvider) {
    super(message);
    this.name = 'MarketDataError';
    this.code = code;
    this.provider = provider;
  }
}

export function timeframeToMinutes(tf: Timeframe = '5m'): number {
  switch (tf) {
    case '1m': return 1;
    case '5m': return 5;
    case '15m': return 15;
    case '30m': return 30;
    case '1h': return 60;
    default: return 5;
  }
}

const timeframeToTwelveDataInterval: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1h',
};

const timeframeToAlphaVantageInterval: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '60min',
};

function cloneCandles(candles: Candle[]): Candle[] {
  return candles.map((candle) => ({ ...candle }));
}

function normalizePair(pair: string): string {
  const normalized = pair.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9._-]+\/[A-Z0-9._-]+$/.test(normalized)) {
    throw new Error('Pair must use BASE/QUOTE format, for example EUR/USD.');
  }
  return normalized;
}

function parseProviderTimestamp(value: unknown, timezone = 'UTC'): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Provider returned an invalid candle timestamp.');
  const raw = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  let timestamp: Date;
  if (hasTimezone) {
    timestamp = new Date(raw);
  } else {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (!match) throw new Error('Provider returned an unparsable candle timestamp.');
    const targetUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
    let candidateUtc = targetUtc;
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(candidateUtc)).map((part) => [part.type, part.value]));
      const representedUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
      const correction = targetUtc - representedUtc;
      candidateUtc += correction;
      if (!correction) break;
    }
    timestamp = new Date(candidateUtc);
  }
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Provider returned an unparsable candle timestamp.');
  return timestamp.toISOString();
}

function parseCandleRows(rows: unknown, provider: MarketDataProvider, timezone = 'UTC'): Candle[] {
  if (!Array.isArray(rows)) throw new MarketDataError('INVALID_PROVIDER_RESPONSE', 'Provider response did not contain a candle array.', provider);
  const candles: Candle[] = rows.map((row: any) => {
    const open = Number(row?.open ?? row?.['1. open']);
    const high = Number(row?.high ?? row?.['2. high']);
    const low = Number(row?.low ?? row?.['3. low']);
    const close = Number(row?.close ?? row?.['4. close']);
    const volumeValue = row?.volume ?? row?.['5. volume'];
    const volume = volumeValue === undefined || volumeValue === null || volumeValue === '' ? 0 : Number(volumeValue);
    if (![open, high, low, close, volume].every(Number.isFinite) || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      throw new MarketDataError('INVALID_PROVIDER_RESPONSE', 'Provider returned malformed OHLC values.', provider);
    }
    return {
      timestamp: parseProviderTimestamp(row.datetime ?? row.timestamp, timezone),
      open,
      high,
      low,
      close,
      volume,
    };
  });

  candles.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const deduplicated = candles.filter((candle, index) => index === 0 || candle.timestamp !== candles[index - 1].timestamp);
  if (deduplicated.length < 25) {
    throw new MarketDataError('INSUFFICIENT_HISTORY', `Provider returned ${deduplicated.length} candles; at least 25 are required.`, provider);
  }
  return deduplicated;
}

export class MarketFeedManager {
  private twelveDataApiKey: string;
  private alphaVantageApiKey: string;
  private twelveDataRequestsToday = 0;
  private alphaVantageRequestsToday = 0;
  private fallbackLiveActive = false;
  private activeProvider: MarketDataProvider = 'RESEARCH_STREAM_REPLAY';
  private usageDay = new Date().toISOString().slice(0, 10);
  private lastSuccessfulSync = '';
  private lastSuccessfulProvider: MarketDataProvider | undefined;
  private lastFailedProvider: MarketDataProvider | undefined;
  private readonly cache = new Map<string, { minute: number; result: MarketDataResult }>();
  private readonly inFlight = new Map<string, Promise<MarketDataResult>>();
  private readonly request: typeof fetch;

  constructor(twelveDataKey = '', alphaVantageKey = '', requestFn: typeof fetch = fetch) {
    this.twelveDataApiKey = twelveDataKey || process.env.TWELVE_DATA_API_KEY || '';
    this.alphaVantageApiKey = alphaVantageKey || process.env.ALPHA_VANTAGE_API_KEY || '';
    this.request = requestFn;
    this.activeProvider = this.twelveDataApiKey
      ? 'TWELVE_DATA'
      : this.alphaVantageApiKey
        ? 'ALPHA_VANTAGE'
        : 'RESEARCH_STREAM_REPLAY';
  }

  public setKeys(twelveKey: string, avKey: string) {
    this.twelveDataApiKey = twelveKey;
    this.alphaVantageApiKey = avKey;
    this.cache.clear();
    if (!this.isConfigured(this.activeProvider)) {
      this.activeProvider = this.twelveDataApiKey
        ? 'TWELVE_DATA'
        : this.alphaVantageApiKey
          ? 'ALPHA_VANTAGE'
          : 'RESEARCH_STREAM_REPLAY';
    }
  }

  public selectProvider(provider: MarketDataProvider): ProviderStatus {
    this.activeProvider = provider;
    this.fallbackLiveActive = false;
    return this.getStatus();
  }

  /** Kept for the UI's explicitly-labelled fallback simulation control; it never fetches data. */
  public simulateFallbackLive(enable?: boolean): ProviderStatus {
    this.fallbackLiveActive = typeof enable === 'boolean' ? enable : !this.fallbackLiveActive;
    return this.getStatus();
  }

  public isFallbackLive(): boolean {
    return this.fallbackLiveActive;
  }

  public incrementRequests(target?: 'TWELVE_DATA' | 'ALPHA_VANTAGE') {
    this.resetDailyUsageIfNeeded();
    const provider = target || (this.activeProvider === 'ALPHA_VANTAGE' ? 'ALPHA_VANTAGE' : 'TWELVE_DATA');
    if (provider === 'TWELVE_DATA') this.twelveDataRequestsToday += 1;
    else this.alphaVantageRequestsToday += 1;
  }

  public getStatus(): ProviderStatus {
    this.resetDailyUsageIfNeeded();
    const twelveConfigured = !!this.twelveDataApiKey;
    const alphaConfigured = !!this.alphaVantageApiKey;
    const selectedConfigured = this.isConfigured(this.activeProvider);
    const selectedHasLiveResponse = this.lastSuccessfulProvider === this.activeProvider && this.lastFailedProvider !== this.activeProvider;
    const warning = this.activeProvider === 'RESEARCH_STREAM_REPLAY'
      ? 'Replay/demo data selected. No live market-data request is being made.'
      : !selectedConfigured
        ? `${this.activeProvider} is selected but its API key is not configured.`
        : undefined;

    return {
      provider: this.activeProvider,
      status: this.activeProvider !== 'RESEARCH_STREAM_REPLAY' && selectedConfigured && selectedHasLiveResponse ? 'ONLINE' : 'OFFLINE',
      lastSync: this.lastSuccessfulSync,
      requestsUsedToday: this.activeProvider === 'ALPHA_VANTAGE' ? this.alphaVantageRequestsToday : this.twelveDataRequestsToday,
      rateLimitWarning: warning,
      provenanceDetails: this.activeProvider === 'RESEARCH_STREAM_REPLAY'
        ? 'Explicit deterministic demo/replay feed (not live market data)'
        : this.activeProvider === 'TWELVE_DATA'
          ? 'Twelve Data time_series REST API'
          : 'Alpha Vantage FX_INTRADAY REST API',
      isFallbackLive: this.fallbackLiveActive,
      quota: {
        twelveData: { used: this.twelveDataRequestsToday, limit: 0, configured: twelveConfigured, status: twelveConfigured ? (this.lastSuccessfulProvider === 'TWELVE_DATA' && this.lastFailedProvider !== 'TWELVE_DATA' ? 'ONLINE' : 'STANDBY') : 'UNCONFIGURED' },
        alphaVantage: { used: this.alphaVantageRequestsToday, limit: 0, configured: alphaConfigured, status: alphaConfigured ? (this.lastSuccessfulProvider === 'ALPHA_VANTAGE' && this.lastFailedProvider !== 'ALPHA_VANTAGE' ? 'ONLINE' : 'STANDBY') : 'UNCONFIGURED' },
      },
    };
  }

  public async fetchCandles(pair: string, timeframe: Timeframe = '5m', provider: MarketDataProvider = this.activeProvider): Promise<MarketDataResult> {
    const normalizedPair = normalizePair(pair);
    if (provider === 'RESEARCH_STREAM_REPLAY') {
      const basePrice = normalizedPair.startsWith('EUR/') ? 1.085 : 18500;
      const candles = this.generateDeterministicValidSetup(basePrice, timeframe);
      const now = new Date().toISOString();
      return { candles, provider, dataProvenance: 'REPLAY', fetchedAt: now, lastTickAt: candles[candles.length - 1].timestamp, latencyMs: 0, cacheHit: false };
    }

    if (!this.isConfigured(provider)) {
      throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${provider} is selected but its API key is missing. Select REPLAY explicitly or configure a valid provider key.`, provider);
    }

    const minute = Math.floor(Date.now() / 60_000);
    const cacheKey = `${provider}:${normalizedPair}:${timeframe}`;
    const cached = this.cache.get(cacheKey);
    if (cached?.minute === minute) return { ...cached.result, candles: cloneCandles(cached.result.candles), cacheHit: true };
    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      const result = await pending;
      return { ...result, candles: cloneCandles(result.candles), cacheHit: true };
    }

    const fetchTask = this.fetchProviderCandles(normalizedPair, timeframe, provider).finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, fetchTask);
    const result = await fetchTask;
    this.cache.set(cacheKey, { minute, result: { ...result, candles: cloneCandles(result.candles) } });
    return { ...result, candles: cloneCandles(result.candles), cacheHit: false };
  }

  /** Forces one real-provider request for the protected Step 0 health probe; never uses replay or cache. */
  public async probeProvider(pair: string, timeframe: Timeframe, provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE'): Promise<MarketDataResult> {
    if (!this.isConfigured(provider)) {
      throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${provider} API key is not configured.`, provider);
    }
    return this.fetchProviderCandles(normalizePair(pair), timeframe, provider);
  }

  private async fetchProviderCandles(pair: string, timeframe: Timeframe, provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE'): Promise<MarketDataResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = provider === 'TWELVE_DATA'
        ? this.buildTwelveDataUrl(pair, timeframe)
        : this.buildAlphaVantageUrl(pair, timeframe);
      this.incrementRequests(provider);
      const response = await this.request(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      const creditsUsedHeader = response.headers.get('api-credits-used');
      const creditsLeftHeader = response.headers.get('api-credits-left');
      const creditsUsed = creditsUsedHeader && /^\d+$/.test(creditsUsedHeader) ? Number(creditsUsedHeader) : undefined;
      const creditsLeft = creditsLeftHeader && /^\d+$/.test(creditsLeftHeader) ? Number(creditsLeftHeader) : undefined;
      const payload: any = await response.json().catch(() => null);
      if (!response.ok) {
        throw new MarketDataError('PROVIDER_HTTP_ERROR', `${provider} returned HTTP ${response.status}.`, provider);
      }
      if (provider === 'TWELVE_DATA' && payload?.status === 'error') {
        throw new MarketDataError('PROVIDER_API_ERROR', String(payload.message || 'Twelve Data returned an API error.'), provider);
      }
      if (provider === 'ALPHA_VANTAGE' && (payload?.['Error Message'] || payload?.Note || payload?.Information)) {
        throw new MarketDataError('PROVIDER_API_ERROR', String(payload['Error Message'] || payload.Note || payload.Information), provider);
      }
      const alphaSeries = provider === 'ALPHA_VANTAGE'
        ? payload?.['Time Series FX (1min)'] || payload?.['Time Series FX (5min)'] || payload?.['Time Series FX (15min)'] || payload?.['Time Series FX (30min)'] || payload?.['Time Series FX (60min)']
        : undefined;
      const rows = provider === 'TWELVE_DATA'
        ? payload?.values
        : alphaSeries && typeof alphaSeries === 'object'
          ? Object.entries(alphaSeries).map(([datetime, fields]) => ({ datetime, ...(fields as object) }))
          : undefined;
      const volumeAvailable = Array.isArray(rows) && rows.some((row: any) => {
        const value = row?.volume ?? row?.['5. volume'];
        return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
      });
      const sourceTimezone = provider === 'ALPHA_VANTAGE'
        ? payload?.['Meta Data']?.['6. Time Zone'] || 'US/Eastern'
        : 'UTC';
      const candles = parseCandleRows(rows, provider, sourceTimezone);
      const latest = candles[candles.length - 1];
      const ageMs = Date.now() - Date.parse(latest.timestamp);
      const freshnessLimitMs = timeframeToMinutes(timeframe) * 60_000 * 2 + 60_000;
      if (ageMs < -60_000 || ageMs > freshnessLimitMs) {
        throw new MarketDataError('STALE_MARKET_DATA', `Latest ${provider} candle is stale (${Math.round(ageMs / 1000)} seconds old).`, provider);
      }
      this.lastSuccessfulSync = new Date().toISOString();
      this.lastSuccessfulProvider = provider;
      this.lastFailedProvider = undefined;
      return {
        candles,
        provider,
        dataProvenance: 'LIVE_INGESTED',
        fetchedAt: this.lastSuccessfulSync,
        lastTickAt: latest.timestamp,
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
        volumeAvailable,
        creditsUsed,
        creditsLeft,
      };
    } catch (error: any) {
      this.lastFailedProvider = provider;
      if (error instanceof MarketDataError) throw error;
      const code = error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE';
      throw new MarketDataError(code, error?.name === 'AbortError' ? `${provider} request timed out.` : `${provider} market-data request failed.`, provider);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildTwelveDataUrl(pair: string, timeframe: Timeframe): string {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', pair);
    url.searchParams.set('interval', timeframeToTwelveDataInterval[timeframe]);
    url.searchParams.set('outputsize', '100');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('apikey', this.twelveDataApiKey);
    return url.toString();
  }

  private buildAlphaVantageUrl(pair: string, timeframe: Timeframe): string {
    const [fromSymbol, toSymbol] = pair.split('/');
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'FX_INTRADAY');
    url.searchParams.set('from_symbol', fromSymbol);
    url.searchParams.set('to_symbol', toSymbol);
    url.searchParams.set('interval', timeframeToAlphaVantageInterval[timeframe]);
    url.searchParams.set('outputsize', 'compact');
    url.searchParams.set('datatype', 'json');
    url.searchParams.set('apikey', this.alphaVantageApiKey);
    return url.toString();
  }

  private isConfigured(provider: MarketDataProvider): boolean {
    if (provider === 'TWELVE_DATA') return !!this.twelveDataApiKey;
    if (provider === 'ALPHA_VANTAGE') return !!this.alphaVantageApiKey;
    return true;
  }

  private resetDailyUsageIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.usageDay) {
      this.usageDay = today;
      this.twelveDataRequestsToday = 0;
      this.alphaVantageRequestsToday = 0;
    }
  }

  /** Deterministic demo-only setup; never marked live and blocked by the strategy circuit breaker. */
  public generateDeterministicValidSetup(basePrice = 1.0840, timeframe: Timeframe = '5m'): Candle[] {
    const candles = this.generateResearchCandles(25, basePrice, timeframe);
    const now = Date.now();
    const stepMins = timeframeToMinutes(timeframe);
    const tMinus = (stepCount: number) => new Date(now - stepCount * stepMins * 60 * 1000).toISOString();

    for (let i = 0; i < 21; i++) {
      candles[i] = { ...candles[i], open: 1.0840, close: 1.0841, high: 1.0843, low: 1.0838, volume: 120 };
    }
    candles[6] = { timestamp: tMinus(19), open: 1.0842, high: 1.0850, low: 1.0840, close: 1.0846, volume: 140 };
    candles[10] = { timestamp: tMinus(15), open: 1.0835, high: 1.0838, low: 1.0825, close: 1.0830, volume: 130 };
    candles[14] = { timestamp: tMinus(11), open: 1.0855, high: 1.0868, low: 1.0850, close: 1.0862, volume: 160 };
    candles[18] = { timestamp: tMinus(7), open: 1.0836, high: 1.0840, low: 1.0832, close: 1.0835, volume: 140 };
    candles[21] = { timestamp: tMinus(4), open: 1.08420, high: 1.08440, low: 1.08380, close: 1.08390, volume: 140 };
    candles[22] = { timestamp: tMinus(3), open: 1.08395, high: 1.08430, low: 1.08385, close: 1.08425, volume: 180 };
    candles[23] = { timestamp: tMinus(2), open: 1.08428, high: 1.08490, low: 1.08425, close: 1.08480, volume: 240 };
    candles[24] = { timestamp: tMinus(1), open: 1.08482, high: 1.08515, low: 1.08445, close: 1.08505, volume: 310 };
    return candles;
  }

  /** Synthetic research sequence for isolated strategy tests and explicitly selected demo mode only. */
  public generateResearchCandles(count = 60, basePrice = 1.0850, timeframe: Timeframe = '5m'): Candle[] {
    const candles: Candle[] = [];
    const now = Date.now();
    const intervalMs = timeframeToMinutes(timeframe) * 60 * 1000;
    let currentPrice = basePrice;
    for (let i = 0; i < count; i++) {
      const timestamp = new Date(now - (count - i) * intervalMs).toISOString();
      const cycle = Math.sin(i * 0.28) * 0.0018;
      const noise = Math.cos(i * 1.1) * 0.0004;
      const step = i > count - 8 ? 0.0006 : cycle + noise;
      const open = Number(currentPrice.toFixed(5));
      const close = Number((open + step).toFixed(5));
      const high = Number((Math.max(open, close) + Math.abs(noise) + 0.0002).toFixed(5));
      const low = Number((Math.min(open, close) - Math.abs(noise) - 0.0002).toFixed(5));
      const volume = 120 + Math.floor(Math.abs(Math.sin(i * 0.5)) * 140);
      candles.push({ timestamp, open, high, low, close, volume });
      currentPrice = close;
    }
    return candles;
  }
}

export const feedManager = new MarketFeedManager();
