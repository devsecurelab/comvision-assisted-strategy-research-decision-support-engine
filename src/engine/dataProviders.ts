// Market data adapters. Live provenance is assigned only after validated provider data.
// All provider credentials remain server-side; replay is never used as a live fallback.

import type { Candle, DataProvenance, Timeframe } from './types';
import { RateLimitScheduler } from './rateLimitScheduler';
import { MAX_CLOCK_DRIFT_MS, measureClockDrift } from './dataIntegrity';
import { PROVIDER_ORDER, type IForexDataProvider, type MarketDataProvider, type ManuallySelectableProvider, type ProviderCircuitSnapshot } from './providers/contracts';
import { FallbackManager } from './providers/fallbackManager';
import { ProviderAdapterError } from './providers/http';
import { normalizeCandles } from './providers/normalize';
import { TwelveDataAdapter } from './providers/twelveDataAdapter';
import { OandaAdapter } from './providers/oandaAdapter';
import { TiingoAdapter } from './providers/tiingoAdapter';
import { FinnhubAdapter } from './providers/finnhubAdapter';
import { FinnhubWebSocketClient } from './providers/finnhubWebSocket';
import { AlphaVantageAdapter } from './providers/alphaVantageAdapter';

export type { MarketDataProvider } from './providers/contracts';
export type ManualMarketDataProvider = ManuallySelectableProvider;

export interface ProviderQuotaInfo {
  used: number;
  limit: number;
  hourlyUsed?: number;
  hourlyLimit?: number;
  perMinute: number;
  configured: boolean;
  status: 'ONLINE' | 'STANDBY' | 'OPEN' | 'HALF_OPEN' | 'RATE_LIMITED' | 'UNCONFIGURED';
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
    oanda: ProviderQuotaInfo;
    tiingo: ProviderQuotaInfo;
    finnhub: ProviderQuotaInfo;
    alphaVantage: ProviderQuotaInfo;
  };
  circuits: ProviderCircuitSnapshot[];
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

function cloneCandles(candles: Candle[]): Candle[] { return candles.map((candle) => ({ ...candle })); }
function normalizePair(pair: string): string {
  const normalized = pair.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9._-]+\/[A-Z0-9._-]+$/.test(normalized)) throw new Error('Pair must use BASE/QUOTE format, for example EUR/USD.');
  return normalized;
}

const LABEL: Record<MarketDataProvider, string> = {
  TWELVE_DATA: 'Twelve Data', OANDA: 'OANDA v20 Practice', TIINGO: 'Tiingo FX', FINNHUB: 'Finnhub', ALPHA_VANTAGE: 'Alpha Vantage',
};
const QUOTA_KEY: Record<MarketDataProvider, keyof ProviderStatus['quota']> = {
  TWELVE_DATA: 'twelveData', OANDA: 'oanda', TIINGO: 'tiingo', FINNHUB: 'finnhub', ALPHA_VANTAGE: 'alphaVantage',
};
export type ProviderKeys = Partial<Record<MarketDataProvider, string>>;

export function createProviderSchedulers(): Map<MarketDataProvider, RateLimitScheduler> {
  return new Map([
    ['TWELVE_DATA', new RateLimitScheduler({ perMinute: Number(process.env.TD_PER_MINUTE || 8), perDay: Number(process.env.TD_PER_DAY || 800), autoDailyBudget: Number(process.env.TD_AUTO_DAILY_BUDGET || 560), hardStopDaily: Number(process.env.TD_HARD_STOP_DAILY || 640), minimumIntervalMs: 8_000, storageKey: 'rateLimitScheduler' })],
    ['OANDA', new RateLimitScheduler({ perMinute: 60, perDay: 20_000, autoDailyBudget: 14_000, hardStopDaily: 16_000, minimumIntervalMs: 1_000, storageKey: 'providerQuota.OANDA' })],
    ['TIINGO', new RateLimitScheduler({ perMinute: 50, perHour: 50, perDay: 1_000, autoDailyBudget: 700, hardStopDaily: 1_000, storageKey: 'providerQuota.TIINGO' })],
    ['FINNHUB', new RateLimitScheduler({ perMinute: 60, perDay: 1_440, autoDailyBudget: 1_008, hardStopDaily: 1_440, storageKey: 'providerQuota.FINNHUB' })],
    ['ALPHA_VANTAGE', new RateLimitScheduler({ perMinute: 5, perDay: 25, autoDailyBudget: 17, hardStopDaily: 25, storageKey: 'providerQuota.ALPHA_VANTAGE' })],
  ]);
}

export class MarketFeedManager {
  private activeProvider: ManuallySelectableProvider = 'TWELVE_DATA';
  private usageDay = new Date().toISOString().slice(0, 10);
  private readonly request: typeof fetch;
  private readonly adapters = new Map<MarketDataProvider, IForexDataProvider>();
  private readonly schedulers = createProviderSchedulers();
  private readonly fallbackManager: FallbackManager;
  private readonly cache = new Map<string, { minute: number; result: MarketDataResult }>();
  private readonly inFlight = new Map<string, Promise<MarketDataResult>>();
  private readonly requestsToday: Record<MarketDataProvider, number> = { TWELVE_DATA: 0, OANDA: 0, TIINGO: 0, FINNHUB: 0, ALPHA_VANTAGE: 0 };
  private lastSuccessfulSync = '';
  private lastSuccessfulProvider: MarketDataProvider | undefined;
  private lastFailedProvider: MarketDataProvider | undefined;
  private lastClockDriftMs: number | null = null;
  private lastClockStatus: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' = 'CLOCK_UNAVAILABLE';
  private readonly twelveDataAdapter: TwelveDataAdapter;
  private readonly oandaAdapter: OandaAdapter;
  private readonly tiingoAdapter: TiingoAdapter;
  private readonly finnhubAdapter: FinnhubAdapter;
  private readonly alphaVantageAdapter: AlphaVantageAdapter;
  private finnhubStream?: FinnhubWebSocketClient;

  constructor(twelveDataKey = '', alphaVantageKey = '', requestFn: typeof fetch = fetch, providerKeys: ProviderKeys = {}) {
    this.request = requestFn;
    this.twelveDataAdapter = new TwelveDataAdapter(requestFn, twelveDataKey || providerKeys.TWELVE_DATA || process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY || '');
    this.alphaVantageAdapter = new AlphaVantageAdapter(requestFn, alphaVantageKey || providerKeys.ALPHA_VANTAGE || process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '');
    const oandaToken = providerKeys.OANDA ?? process.env.OANDA_PRACTICE_TOKEN;
    const tiingoKey = providerKeys.TIINGO ?? process.env.TIINGO_API_KEY;
    const finnhubKey = providerKeys.FINNHUB ?? process.env.FINNHUB_API_KEY;
    if (finnhubKey) this.finnhubStream = new FinnhubWebSocketClient(finnhubKey);
    this.oandaAdapter = new OandaAdapter(requestFn, oandaToken, providerKeys.OANDA ? process.env.OANDA_ACCOUNT_ID || '' : undefined);
    this.tiingoAdapter = new TiingoAdapter(requestFn, tiingoKey);
    this.finnhubAdapter = new FinnhubAdapter(requestFn, finnhubKey, this.finnhubStream);
    const adapters: IForexDataProvider[] = [
      this.twelveDataAdapter,
      this.oandaAdapter,
      this.tiingoAdapter,
      this.finnhubAdapter,
      this.alphaVantageAdapter,
    ];
    for (const adapter of adapters) this.adapters.set(adapter.id, adapter);
    this.fallbackManager = new FallbackManager(adapters);
    this.activeProvider = this.twelveDataAdapter.isConfigured() ? 'TWELVE_DATA' : this.alphaVantageAdapter.isConfigured() ? 'ALPHA_VANTAGE' : 'TWELVE_DATA';
  }

  public setKeys(twelveKey: string, avKey: string): void {
    this.setProviderKeys({ TWELVE_DATA: twelveKey, ALPHA_VANTAGE: avKey });
  }

  /** Runtime dashboard credentials are held only in memory; .env is the persistent configuration path. */
  public setProviderKeys(keys: ProviderKeys): void {
    if (keys.TWELVE_DATA !== undefined) { this.twelveDataAdapter.setApiKey(keys.TWELVE_DATA); this.fallbackManager.reset('TWELVE_DATA'); }
    if (keys.OANDA !== undefined) { this.oandaAdapter.setApiKey(keys.OANDA); this.fallbackManager.reset('OANDA'); }
    if (keys.TIINGO !== undefined) { this.tiingoAdapter.setApiKey(keys.TIINGO); this.fallbackManager.reset('TIINGO'); }
    if (keys.FINNHUB !== undefined) {
      this.finnhubStream?.stop();
      this.finnhubStream = keys.FINNHUB ? new FinnhubWebSocketClient(keys.FINNHUB) : undefined;
      this.finnhubAdapter.setCredentials(keys.FINNHUB, this.finnhubStream);
      this.fallbackManager.reset('FINNHUB');
    }
    if (keys.ALPHA_VANTAGE !== undefined) { this.alphaVantageAdapter.setApiKey(keys.ALPHA_VANTAGE); this.fallbackManager.reset('ALPHA_VANTAGE'); }
    this.cache.clear();
    if (!this.isConfigured(this.activeProvider)) this.activeProvider = this.twelveDataAdapter.isConfigured() ? 'TWELVE_DATA' : this.alphaVantageAdapter.isConfigured() ? 'ALPHA_VANTAGE' : 'TWELVE_DATA';
  }

  public selectProvider(provider: ManuallySelectableProvider): ProviderStatus {
    this.activeProvider = provider;
    return this.getStatus();
  }

  public incrementRequests(target: MarketDataProvider = this.activeProvider): void {
    this.resetDailyUsageIfNeeded();
    this.requestsToday[target] += 1;
  }

  public getFallbackProviders(): MarketDataProvider[] { return this.fallbackManager.configuredProviders(); }
  public getCircuitStatuses(): ProviderCircuitSnapshot[] { return this.fallbackManager.snapshots(); }

  public getSchedulerSnapshot(provider?: MarketDataProvider) {
    if (provider) return this.schedulers.get(provider)!.snapshot();
    const snapshots = PROVIDER_ORDER.map((id) => ({ provider: id, ...this.schedulers.get(id)!.snapshot() }));
    const configured = snapshots.filter((item) => this.isConfigured(item.provider));
    const sum = (key: 'dayUsed' | 'autoUsed' | 'hardStopDaily' | 'autoDailyBudget' | 'remainingDay' | 'remainingAuto' | 'minuteUsed' | 'perMinute') => configured.reduce((total, item) => total + Number(item[key] || 0), 0);
    return {
      dayUtc: new Date().toISOString().slice(0, 10), dayUsed: sum('dayUsed'), autoUsed: sum('autoUsed'),
      perDay: configured.reduce((total, item) => total + item.perDay, 0), hardStopDaily: sum('hardStopDaily'),
      autoDailyBudget: sum('autoDailyBudget'), remainingDay: sum('remainingDay'), remainingAuto: sum('remainingAuto'),
      minuteUsed: sum('minuteUsed'), perMinute: sum('perMinute'), byProvider: snapshots,
    };
  }

  public getClockState(): { driftMs: number | null; status: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE'; lastSuccessfulSync: string; lastSuccessfulProvider?: MarketDataProvider; lastFailedProvider?: MarketDataProvider } {
    return { driftMs: this.lastClockDriftMs, status: this.lastClockStatus, lastSuccessfulSync: this.lastSuccessfulSync, lastSuccessfulProvider: this.lastSuccessfulProvider, lastFailedProvider: this.lastFailedProvider };
  }

  public getStatus(): ProviderStatus {
    this.resetDailyUsageIfNeeded();
    const provider = this.lastSuccessfulProvider || this.activeProvider;
    const status: ProviderStatus['status'] = this.lastSuccessfulProvider && this.lastSuccessfulSync ? 'ONLINE' : 'OFFLINE';
    const warning = this.fallbackManager.availableProviders().length === 0 ? 'No configured provider is currently eligible for a scan.' : undefined;
    const circuits = this.fallbackManager.snapshots();
    const quota = {} as ProviderStatus['quota'];
    for (const id of PROVIDER_ORDER) {
      const snapshot = this.schedulers.get(id)!.snapshot();
      const circuit = circuits.find((item) => item.provider === id)!;
      const circuitState = circuit.state;
      const configured = this.isConfigured(id);
      const value: ProviderQuotaInfo = {
        used: snapshot.dayUsed, limit: snapshot.perDay, hourlyUsed: snapshot.hourUsed, hourlyLimit: snapshot.perHour,
        perMinute: snapshot.perMinute, configured,
        status: !configured ? 'UNCONFIGURED' : circuitState === 'OPEN' ? 'OPEN' : circuitState === 'HALF_OPEN' ? 'HALF_OPEN' : this.lastSuccessfulProvider === id ? 'ONLINE' : 'STANDBY',
      };
      (quota as any)[QUOTA_KEY[id]] = value;
    }
    return {
      provider,
      status,
      lastSync: this.lastSuccessfulSync,
      requestsUsedToday: this.requestsToday[provider],
      rateLimitWarning: warning,
      provenanceDetails: `${LABEL[provider]} market-data adapter`,
      quota,
      circuits,
    };
  }

  public async fetchCandles(pair: string, timeframe: Timeframe = '5m', provider: MarketDataProvider = this.activeProvider, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<MarketDataResult> {
    const normalizedPair = normalizePair(pair);
    if (!this.isConfigured(provider)) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${LABEL[provider]} credentials are not configured. Configure a live provider key.`, provider);
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
    if (provider !== 'TWELVE_DATA' || !this.twelveDataAdapter.isConfigured()) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', 'R8 requires a Twelve Data key; no replay or simulated fallback is permitted.', provider);
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const validDate = (value: string, date: Date) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    if (!validDate(startDate, start) || !validDate(endDate, end) || start.getTime() > end.getTime()) throw new MarketDataError('INVALID_BACKTEST_RANGE', 'R8 start/end dates must be valid UTC dates with start on or before end.', provider);
    const fetched = await this.fetchProviderCandles(normalizedPair, timeframe, provider, false, { startDate, endDate: `${endDate} 23:59:59` }, 'ON_DEMAND');
    const startMs = start.getTime();
    const endExclusiveMs = end.getTime() + 86_400_000;
    const candles = fetched.candles.filter((candle) => {
      const timestamp = Date.parse(candle.timestamp);
      return timestamp >= startMs && timestamp < endExclusiveMs;
    });
    if (candles.length < 25) throw new MarketDataError('INSUFFICIENT_HISTORY', `Provider returned ${candles.length} candles inside the requested UTC range; at least 25 are required.`, provider);
    return { ...fetched, candles, lastTickAt: candles[candles.length - 1].timestamp, volumeAvailable: candles.some((candle) => typeof candle.volume === 'number') };
  }

  /** Forces a fresh request against one named provider for protected diagnostics. */
  public async probeProvider(pair: string, timeframe: Timeframe, provider: MarketDataProvider): Promise<MarketDataResult> {
    if (!this.isConfigured(provider)) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${LABEL[provider]} credentials are not configured.`, provider);
    return this.fetchProviderCandles(normalizePair(pair), timeframe, provider);
  }

  private async fetchProviderCandles(pair: string, timeframe: Timeframe, provider: MarketDataProvider, requireClosed = true, historical?: { startDate: string; endDate: string }, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<MarketDataResult> {
    const startedAt = Date.now();
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${provider} adapter is unavailable.`, provider);
    const streamReady = !historical && !!adapter.canServeFromStream?.(pair, timeframe);
    if (!streamReady && this.fallbackManager.circuitIsOpen(provider)) throw new MarketDataError('CIRCUIT_OPEN', `${LABEL[provider]} circuit is cooling down.`, provider);
    if (!streamReady) {
      const budget = await this.schedulers.get(provider)!.consumeWhenAvailable(kind);
      if (!budget.allowed) {
        this.lastFailedProvider = provider;
        throw new MarketDataError('RATE_LIMITED', `Provider request blocked by scheduler: ${budget.reason}.`, provider);
      }
      this.incrementRequests(provider);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const operation = async (): Promise<MarketDataResult> => {
        try {
          const raw = historical
            ? adapter.fetchHistoricalCandles
              ? await adapter.fetchHistoricalCandles(pair, timeframe, historical.startDate, historical.endDate, controller.signal)
              : (() => { throw new ProviderAdapterError(provider, 'HISTORICAL_UNSUPPORTED', `${LABEL[provider]} does not support this historical range.`); })()
            : await adapter.fetchCandles(pair, timeframe, controller.signal);
          const clock = measureClockDrift(raw.serverDate, startedAt, Date.now());
          this.lastClockDriftMs = clock.driftMs;
          this.lastClockStatus = clock.status;
          if (!clock.ok) throw new ProviderAdapterError(provider, 'CLOCK_DRIFT', `Local clock differs from ${LABEL[provider]} by ${clock.driftMs} ms (> ${MAX_CLOCK_DRIFT_MS} ms). DATA_QUALITY_FAIL.`);
          const normalized = normalizeCandles(raw, provider, timeframe, requireClosed);
          const latest = normalized.candles[normalized.candles.length - 1];
          if (requireClosed) {
            const ageMs = Date.now() - Date.parse(latest.timestamp);
            const freshnessLimitMs = timeframeToMinutes(timeframe) * 60_000 * 2 + 60_000;
            if (ageMs < -60_000 || ageMs > freshnessLimitMs) throw new ProviderAdapterError(provider, 'STALE_MARKET_DATA', `Latest ${LABEL[provider]} candle is stale (${Math.round(ageMs / 1000)} seconds old).`);
          }
          this.lastSuccessfulSync = new Date().toISOString();
          this.lastSuccessfulProvider = provider;
          this.lastFailedProvider = undefined;
          return {
            candles: normalized.candles, provider, dataProvenance: 'LIVE_INGESTED', fetchedAt: this.lastSuccessfulSync,
            lastTickAt: latest.timestamp, latencyMs: Date.now() - startedAt, cacheHit: false,
            clockDriftMs: this.lastClockDriftMs, clockStatus: this.lastClockStatus,
            volumeAvailable: normalized.volumeAvailable, creditsUsed: raw.creditsUsed, creditsLeft: raw.creditsLeft,
          };
        } catch (error) {
          if (error instanceof ProviderAdapterError) throw new MarketDataError(error.code, error.message, provider);
          if (error instanceof MarketDataError) throw error;
          throw new MarketDataError('PROVIDER_UNAVAILABLE', `${LABEL[provider]} market-data request failed.`, provider);
        }
      };
      return await (streamReady ? operation() : this.fallbackManager.execute(provider, operation));
    } catch (error) {
      this.lastFailedProvider = provider;
      if (error instanceof MarketDataError) throw error;
      if (error instanceof ProviderAdapterError) throw new MarketDataError(error.code, error.message, provider);
      throw new MarketDataError('PROVIDER_UNAVAILABLE', `${LABEL[provider]} market-data request failed.`, provider);
    } finally {
      clearTimeout(timeout);
    }
  }

  private isConfigured(provider: MarketDataProvider): boolean { return this.fallbackManager.isConfigured(provider); }

  private resetDailyUsageIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.usageDay) {
      this.usageDay = today;
      for (const provider of PROVIDER_ORDER) this.requestsToday[provider] = 0;
    }
  }
}

export const feedManager = new MarketFeedManager();
