// Market data adapters. Live provenance is assigned only after a successful provider HTTP response.
// Replay is retained only as a fail-closed test provenance; normal production selection is live-provider-only.

import { Candle, DataProvenance, Timeframe } from './types';
import { RateLimitScheduler } from './rateLimitScheduler';
import { MAX_CLOCK_DRIFT_MS, measureClockDrift } from './dataIntegrity';

export type MarketDataProvider = 'TWELVE_DATA' | 'ALPHA_VANTAGE';

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
  clockDriftMs?: number | null;
  clockStatus?: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE';
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

function parseCandleRows(rows: unknown, provider: MarketDataProvider, timeframe: Timeframe, timezone = 'UTC', requireClosed = true): Candle[] {
  if (!Array.isArray(rows)) throw new MarketDataError('INVALID_PROVIDER_RESPONSE', 'Provider response did not contain a candle array.', provider);
  const candles: Candle[] = rows.map((row: any) => {
    const open = Number(row?.open ?? row?.['1. open']);
    const high = Number(row?.high ?? row?.['2. high']);
    const low = Number(row?.low ?? row?.['3. low']);
    const close = Number(row?.close ?? row?.['4. close']);
    const volumeValue = row?.volume ?? row?.['5. volume'];
    const volume = volumeValue === undefined || volumeValue === null || volumeValue === '' ? null : Number(volumeValue);
    if (![open, high, low, close].every(Number.isFinite) || (volume !== null && (!Number.isFinite(volume) || volume < 0)) || open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
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
  const intervalMs = timeframeToMinutes(timeframe) * 60_000;
  const nowMs = Date.now();
  const closed = requireClosed ? candles.filter((candle) => Date.parse(candle.timestamp) + intervalMs <= nowMs) : candles;
  const deduplicated = closed.filter((candle, index) => index === 0 || candle.timestamp !== closed[index - 1].timestamp);
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
  private activeProvider: MarketDataProvider = 'TWELVE_DATA';
  private usageDay = new Date().toISOString().slice(0, 10);
  private lastSuccessfulSync = '';
  private lastSuccessfulProvider: MarketDataProvider | undefined;
  private lastFailedProvider: MarketDataProvider | undefined;
  private lastClockDriftMs: number | null = null;
  private lastClockStatus: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' = 'CLOCK_UNAVAILABLE';
  private readonly cache = new Map<string, { minute: number; result: MarketDataResult }>();
  private readonly inFlight = new Map<string, Promise<MarketDataResult>>();
  private readonly request: typeof fetch;
  private readonly scheduler = new RateLimitScheduler();

  constructor(twelveDataKey = '', alphaVantageKey = '', requestFn: typeof fetch = fetch) {
    this.twelveDataApiKey = twelveDataKey || process.env.TWELVE_DATA_API_KEY || '';
    this.alphaVantageApiKey = alphaVantageKey || process.env.ALPHA_VANTAGE_API_KEY || '';
    this.request = requestFn;
    this.activeProvider = this.twelveDataApiKey
      ? 'TWELVE_DATA'
      : this.alphaVantageApiKey
        ? 'ALPHA_VANTAGE'
        : 'TWELVE_DATA';
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
          : 'TWELVE_DATA';
    }
  }

  public selectProvider(provider: MarketDataProvider): ProviderStatus {
    this.activeProvider = provider;
    return this.getStatus();
  }

  public incrementRequests(target?: 'TWELVE_DATA' | 'ALPHA_VANTAGE') {
    this.resetDailyUsageIfNeeded();
    const provider = target || (this.activeProvider === 'ALPHA_VANTAGE' ? 'ALPHA_VANTAGE' : 'TWELVE_DATA');
    if (provider === 'TWELVE_DATA') this.twelveDataRequestsToday += 1;
    else this.alphaVantageRequestsToday += 1;
  }

  public getSchedulerSnapshot() {
    return this.scheduler.snapshot();
  }

  public getClockState(): { driftMs: number | null; status: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE'; lastSuccessfulSync: string; lastSuccessfulProvider?: MarketDataProvider; lastFailedProvider?: MarketDataProvider } {
    return { driftMs: this.lastClockDriftMs, status: this.lastClockStatus, lastSuccessfulSync: this.lastSuccessfulSync, lastSuccessfulProvider: this.lastSuccessfulProvider, lastFailedProvider: this.lastFailedProvider };
  }

  public getStatus(): ProviderStatus {
    this.resetDailyUsageIfNeeded();
    const twelveConfigured = !!this.twelveDataApiKey;
    const alphaConfigured = !!this.alphaVantageApiKey;
    const selectedConfigured = this.isConfigured(this.activeProvider);
    const selectedHasLiveResponse = this.lastSuccessfulProvider === this.activeProvider && this.lastFailedProvider !== this.activeProvider;
    const warning = !selectedConfigured
        ? `${this.activeProvider} is selected but its API key is not configured.`
        : undefined;

    return {
      provider: this.activeProvider,
      status: selectedConfigured && selectedHasLiveResponse ? 'ONLINE' : 'OFFLINE',
      lastSync: this.lastSuccessfulSync,
      requestsUsedToday: this.activeProvider === 'ALPHA_VANTAGE' ? this.alphaVantageRequestsToday : this.twelveDataRequestsToday,
      rateLimitWarning: warning,
      provenanceDetails: this.activeProvider === 'TWELVE_DATA'
          ? 'Twelve Data time_series REST API'
          : 'Alpha Vantage FX_INTRADAY REST API',
      quota: {
        twelveData: { used: this.twelveDataRequestsToday, limit: 0, configured: twelveConfigured, status: twelveConfigured ? (this.lastSuccessfulProvider === 'TWELVE_DATA' && this.lastFailedProvider !== 'TWELVE_DATA' ? 'ONLINE' : 'STANDBY') : 'UNCONFIGURED' },
        alphaVantage: { used: this.alphaVantageRequestsToday, limit: 0, configured: alphaConfigured, status: alphaConfigured ? (this.lastSuccessfulProvider === 'ALPHA_VANTAGE' && this.lastFailedProvider !== 'ALPHA_VANTAGE' ? 'ONLINE' : 'STANDBY') : 'UNCONFIGURED' },
      },
    };
  }

  public async fetchCandles(pair: string, timeframe: Timeframe = '5m', provider: MarketDataProvider = this.activeProvider, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<MarketDataResult> {
    const normalizedPair = normalizePair(pair);

    if (!this.isConfigured(provider)) {
      throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${provider} is selected but its API key is missing. Configure a live provider key.`, provider);
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

    const fetchTask = this.fetchProviderCandles(normalizedPair, timeframe, provider, true, undefined, kind).finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, fetchTask);
    const result = await fetchTask;
    this.cache.set(cacheKey, { minute, result: { ...result, candles: cloneCandles(result.candles) } });
    return { ...result, candles: cloneCandles(result.candles), cacheHit: false };
  }

  public async fetchHistoricalCandles(pair: string, timeframe: Timeframe, startDate: string, endDate: string, provider: 'TWELVE_DATA' = 'TWELVE_DATA'): Promise<MarketDataResult> {
    const normalizedPair = normalizePair(pair);
    if (provider !== 'TWELVE_DATA' || !this.twelveDataApiKey) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', 'R8 requires TWELVE_DATA_API_KEY; no replay or simulated fallback is permitted.', provider);
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T23:59:59Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) throw new MarketDataError('INVALID_BACKTEST_RANGE', 'R8 start/end dates must be valid and start before end.', provider);
    return this.fetchProviderCandles(normalizedPair, timeframe, provider, false, { startDate, endDate, outputSize: 5000 });
  }

  /** Forces one real-provider request for the protected Step 0 health probe; never uses replay or cache. */
  public async probeProvider(pair: string, timeframe: Timeframe, provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE'): Promise<MarketDataResult> {
    if (!this.isConfigured(provider)) {
      throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${provider} API key is not configured.`, provider);
    }
    return this.fetchProviderCandles(normalizePair(pair), timeframe, provider);
  }

  private async fetchProviderCandles(pair: string, timeframe: Timeframe, provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE', requireClosed = true, historical?: { startDate: string; endDate: string; outputSize: number }, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<MarketDataResult> {
    const startedAt = Date.now();
    const budget = this.scheduler.consume(kind);
    if (!budget.allowed) throw new MarketDataError('RATE_LIMITED', `Provider request blocked by scheduler: ${budget.reason}.`, provider);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = provider === 'TWELVE_DATA'
        ? this.buildTwelveDataUrl(pair, timeframe, historical)
        : this.buildAlphaVantageUrl(pair, timeframe);
      this.incrementRequests(provider);
      const response = await this.request(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      const clock = measureClockDrift(response.headers.get('date'), startedAt, Date.now());
      this.lastClockDriftMs = clock.driftMs;
      this.lastClockStatus = clock.status;
      if (!clock.ok) {
        throw new MarketDataError('CLOCK_DRIFT', `Local clock differs from ${provider} by ${clock.driftMs} ms (> ${MAX_CLOCK_DRIFT_MS} ms). DATA_QUALITY_FAIL.`, provider);
      }
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
        const alphaMessage = String(payload['Error Message'] || payload.Note || payload.Information);
        const entitlementRequired = /premium endpoint|premium membership|premium plan|subscribe to premium/i.test(alphaMessage);
        throw new MarketDataError(
          entitlementRequired ? 'UNSUPPORTED_ON_FREE_KEY' : 'PROVIDER_API_ERROR',
          entitlementRequired ? 'Alpha Vantage indicates FX_INTRADAY requires a premium entitlement.' : 'Alpha Vantage rejected the request.',
          provider,
        );
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
      const candles = parseCandleRows(rows, provider, timeframe, sourceTimezone, requireClosed);
      const latest = candles[candles.length - 1];
      if (requireClosed) {
        const ageMs = Date.now() - Date.parse(latest.timestamp);
        const freshnessLimitMs = timeframeToMinutes(timeframe) * 60_000 * 2 + 60_000;
        if (ageMs < -60_000 || ageMs > freshnessLimitMs) {
          throw new MarketDataError('STALE_MARKET_DATA', `Latest ${provider} candle is stale (${Math.round(ageMs / 1000)} seconds old).`, provider);
        }
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
        clockDriftMs: this.lastClockDriftMs,
        clockStatus: this.lastClockStatus,
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

  private buildTwelveDataUrl(pair: string, timeframe: Timeframe, historical?: { startDate: string; endDate: string; outputSize: number }): string {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', pair);
    url.searchParams.set('interval', timeframeToTwelveDataInterval[timeframe]);
    url.searchParams.set('outputsize', String(historical?.outputSize ?? 100));
    url.searchParams.set('timezone', 'UTC');
    if (historical) {
      url.searchParams.set('start_date', historical.startDate);
      url.searchParams.set('end_date', historical.endDate);
    }
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

}

export const feedManager = new MarketFeedManager();
