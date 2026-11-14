// Market data adapters. Live provenance is assigned only after validated provider data.
// Twelve Data is the sole live market-data provider.

import type { Candle, DataProvenance, Timeframe } from './types';
import { RateLimitScheduler } from './rateLimitScheduler';
import { MAX_CLOCK_DRIFT_MS, measureClockDrift } from './dataIntegrity';
import { PROVIDER_ORDER, type MarketDataProvider, type ManuallySelectableProvider, type ProviderCircuitSnapshot } from './providers/contracts';
import { TwelveDataCircuit } from './providers/circuit';
import { ProviderAdapterError } from './providers/http';
import { normalizeCandles } from './providers/normalize';
import { TwelveDataAdapter } from './providers/twelveDataAdapter';

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
  status: 'ONLINE' | 'RATE_LIMITED' | 'OFFLINE';
  lastSync: string;
  requestsUsedToday: number;
  rateLimitWarning?: string;
  provenanceDetails: string;
  quota: {
    twelveData: ProviderQuotaInfo;
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
  clockStatus?: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' | 'CLOCK_UNVERIFIED';
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

const LABEL = 'Twelve Data';
export type ProviderKeys = Partial<Record<MarketDataProvider, string>>;

export function createProviderSchedulers(): Map<MarketDataProvider, RateLimitScheduler> {
  return new Map([['TWELVE_DATA', new RateLimitScheduler({ perMinute: Number(process.env.TWELVE_DATA_CREDITS_PER_MIN || process.env.TD_PER_MINUTE || 8), perDay: Number(process.env.TWELVE_DATA_CREDITS_PER_DAY || process.env.TD_PER_DAY || 800), autoDailyBudget: Number(process.env.TWELVE_DATA_AUTO_DAILY_BUDGET || process.env.TD_AUTO_DAILY_BUDGET || 560), hardStopDaily: Number(process.env.TWELVE_DATA_HARD_STOP_DAILY || process.env.TD_HARD_STOP_DAILY || 640), minimumIntervalMs: 0, storageKey: 'rateLimitScheduler' })]]);
}

export class MarketFeedManager {
  private activeProvider: ManuallySelectableProvider = 'TWELVE_DATA';
  private usageDay = new Date().toISOString().slice(0, 10);
  private readonly request: typeof fetch;
  private readonly schedulers = createProviderSchedulers();
  private readonly circuit = new TwelveDataCircuit();
  private readonly cache = new Map<string, { minute: number; result: MarketDataResult }>();
  private readonly inFlight = new Map<string, Promise<MarketDataResult>>();
  private readonly requestsToday: Record<MarketDataProvider, number> = { TWELVE_DATA: 0 };
  private lastSuccessfulSync = '';
  private lastSuccessfulProvider: MarketDataProvider | undefined;
  private lastFailedProvider: MarketDataProvider | undefined;
  private lastClockDriftMs: number | null = null;
  private lastClockStatus: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' | 'CLOCK_UNVERIFIED' = 'CLOCK_UNAVAILABLE';
  private readonly twelveDataAdapter: TwelveDataAdapter;

  constructor(twelveDataKey = '', requestFn: typeof fetch = fetch, providerKeys: ProviderKeys = {}) {
    this.request = requestFn;
    this.twelveDataAdapter = new TwelveDataAdapter(requestFn, twelveDataKey || providerKeys.TWELVE_DATA || process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY || '');
    this.activeProvider = 'TWELVE_DATA';
  }

  /** Runtime dashboard credentials are held only in memory; .env is the persistent configuration path. */
  public setProviderKeys(keys: ProviderKeys): void {
    if (keys.TWELVE_DATA !== undefined) { this.twelveDataAdapter.setApiKey(keys.TWELVE_DATA); this.circuit.reset(); }
    this.cache.clear();
  }

  public selectProvider(provider: ManuallySelectableProvider): ProviderStatus {
    this.activeProvider = provider;
    return this.getStatus();
  }

  public incrementRequests(target: MarketDataProvider = this.activeProvider): void {
    this.resetDailyUsageIfNeeded();
    this.requestsToday[target] += 1;
  }

  public getProviders(): MarketDataProvider[] { return this.twelveDataAdapter.isConfigured() ? ['TWELVE_DATA'] : []; }
  public getCircuitStatuses(): ProviderCircuitSnapshot[] { return [this.circuit.snapshot()]; }

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

  public getClockState(): { driftMs: number | null; status: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' | 'CLOCK_UNVERIFIED'; lastSuccessfulSync: string; lastSuccessfulProvider?: MarketDataProvider; lastFailedProvider?: MarketDataProvider } {
    return { driftMs: this.lastClockDriftMs, status: this.lastClockStatus, lastSuccessfulSync: this.lastSuccessfulSync, lastSuccessfulProvider: this.lastSuccessfulProvider, lastFailedProvider: this.lastFailedProvider };
  }

  public getStatus(): ProviderStatus {
    this.resetDailyUsageIfNeeded();
    const provider = this.lastSuccessfulProvider || this.activeProvider;
    const status: ProviderStatus['status'] = this.lastSuccessfulProvider && this.lastSuccessfulSync ? 'ONLINE' : 'OFFLINE';
    const snapshot = this.schedulers.get('TWELVE_DATA')!.snapshot();
    const circuit = this.circuit.snapshot();
    const configured = this.isConfigured('TWELVE_DATA');
    const quota = { twelveData: {
      used: snapshot.dayUsed, limit: snapshot.perDay, hourlyUsed: snapshot.hourUsed, hourlyLimit: snapshot.perHour,
      perMinute: snapshot.perMinute, configured,
      status: !configured ? 'UNCONFIGURED' : circuit.state === 'OPEN' ? 'OPEN' : this.lastSuccessfulProvider === 'TWELVE_DATA' ? 'ONLINE' : 'STANDBY',
    } satisfies ProviderQuotaInfo };
    const warning = !configured || circuit.state === 'OPEN' ? 'Twelve Data is not currently eligible for a scan.' : undefined;
    return {
      provider,
      status,
      lastSync: this.lastSuccessfulSync,
      requestsUsedToday: this.requestsToday[provider],
      rateLimitWarning: warning,
      provenanceDetails: `${LABEL} market-data adapter`,
      quota,
      circuits: [circuit],
    };
  }

  public async fetchCandles(pair: string, timeframe: Timeframe = '5m', provider: MarketDataProvider = this.activeProvider, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<MarketDataResult> {
    const normalizedPair = normalizePair(pair);
    if (!this.isConfigured(provider)) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${LABEL} credentials are not configured. Configure a Twelve Data key.`, provider);
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
  /** Fetches one timeframe for multiple symbols with one provider credit. Failed symbols are omitted. */
  public async fetchCandlesBatch(pairs: string[], timeframe: Timeframe = '5m', provider: MarketDataProvider = this.activeProvider, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<Record<string, MarketDataResult>> {
    const normalizedPairs = [...new Set(pairs.map(normalizePair))];
    if (!normalizedPairs.length) return {};
    if (!this.isConfigured(provider)) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${LABEL} credentials are not configured.`, provider);
    const adapter = this.twelveDataAdapter;
    if (!adapter.fetchCandlesBatch) throw new MarketDataError('BATCH_UNSUPPORTED', `${LABEL} does not support multi-symbol requests.`, provider);
    const budget = await this.schedulers.get(provider)!.consumeWhenAvailable(kind);
    if (!budget.allowed) throw new MarketDataError('RATE_LIMITED', `Provider batch request blocked by scheduler: ${budget.reason}.`, provider);
    this.incrementRequests(provider);
    const startedAt = Date.now();
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const raw = await adapter.fetchCandlesBatch(normalizedPairs, timeframe, controller.signal);
      const fetchedAt = new Date().toISOString(); const result: Record<string, MarketDataResult> = {};
      for (const pair of normalizedPairs) {
        const payload = raw[pair]; if (!payload) continue;
        const normalized = normalizeCandles(payload, provider, timeframe, true);
        const latest = normalized.candles.at(-1); if (!latest) continue;
        result[pair] = { candles: normalized.candles, provider, dataProvenance: 'LIVE_INGESTED', fetchedAt, lastTickAt: latest.timestamp, latencyMs: Date.now() - startedAt, cacheHit: false, volumeAvailable: normalized.volumeAvailable, creditsUsed: payload.creditsUsed, creditsLeft: payload.creditsLeft, clockStatus: 'CLOCK_UNAVAILABLE', clockDriftMs: null };
      }
      this.lastSuccessfulSync = fetchedAt; this.lastSuccessfulProvider = provider; this.lastFailedProvider = undefined;
      return result;
    }
    catch (error) {
      if (error instanceof ProviderAdapterError) throw new MarketDataError(error.code, error.message, provider);
      throw new MarketDataError('PROVIDER_UNAVAILABLE', `${LABEL} batch request failed.`, provider);
    } finally { clearTimeout(timeout); }
  }

  public async fetchQuote(pair: string, provider: MarketDataProvider = 'TWELVE_DATA'): Promise<{ price: number; ts: string }> {
    const normalizedPair = normalizePair(pair);
    if (provider !== 'TWELVE_DATA' || !this.isConfigured(provider)) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${LABEL} credentials are not configured.`, provider);
    const adapter = this.twelveDataAdapter;
    if (!adapter?.fetchQuote) throw new MarketDataError('QUOTE_UNAVAILABLE', 'Provider does not expose a quote endpoint.', provider);
    const budget = await this.schedulers.get(provider)!.consumeWhenAvailable('ON_DEMAND');
    if (!budget.allowed) throw new MarketDataError('RATE_LIMITED', `Provider quote blocked by scheduler: ${budget.reason}.`, provider);
    this.incrementRequests(provider);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 3_000);
    try { const quote = await adapter.fetchQuote(normalizedPair, controller.signal); return { price: quote.price, ts: quote.ts }; }
    catch (error) { if (error instanceof ProviderAdapterError) throw new MarketDataError(error.code, error.message, provider); throw error instanceof MarketDataError ? error : new MarketDataError('QUOTE_UNAVAILABLE', 'Provider quote request failed.', provider); }
    finally { clearTimeout(timeout); }
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
    if (!this.isConfigured(provider)) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${LABEL} credentials are not configured.`, provider);
    return this.fetchProviderCandles(normalizePair(pair), timeframe, provider);
  }

  private async fetchProviderCandles(pair: string, timeframe: Timeframe, provider: MarketDataProvider, requireClosed = true, historical?: { startDate: string; endDate: string }, kind: 'AUTO' | 'ON_DEMAND' = 'ON_DEMAND'): Promise<MarketDataResult> {
    const startedAt = Date.now();
    const adapter = this.twelveDataAdapter;
    if (!adapter) throw new MarketDataError('PROVIDER_NOT_CONFIGURED', `${provider} adapter is unavailable.`, provider);
    const streamReady = false;
    if (!streamReady && this.circuit.isOpen()) throw new MarketDataError('CIRCUIT_OPEN', `${LABEL} circuit is cooling down.`, provider);
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
              : (() => { throw new ProviderAdapterError(provider, 'HISTORICAL_UNSUPPORTED', `${LABEL} does not support this historical range.`); })()
            : await adapter.fetchCandles(pair, timeframe, controller.signal);
          const clock = measureClockDrift(raw.serverDate, startedAt, Date.now());
          this.lastClockDriftMs = clock.driftMs;
          this.lastClockStatus = clock.status;
          if (!clock.ok) throw new ProviderAdapterError(provider, 'CLOCK_DRIFT', `Local clock differs from ${LABEL} by ${clock.driftMs} ms (> ${MAX_CLOCK_DRIFT_MS} ms). DATA_QUALITY_FAIL.`);
          if (!historical && clock.status === 'CLOCK_UNAVAILABLE') {
            this.lastClockStatus = 'CLOCK_UNVERIFIED';
            throw new ProviderAdapterError(provider, 'CLOCK_UNVERIFIED', `${LABEL} response did not include a trustworthy server clock. NO_TRADE.`);
          }
          const normalized = normalizeCandles(raw, provider, timeframe, requireClosed);
          const latest = normalized.candles[normalized.candles.length - 1];
          if (requireClosed) {
            const ageMs = Date.now() - Date.parse(latest.timestamp);
            const freshnessLimitMs = timeframeToMinutes(timeframe) * 60_000 * 2 + 60_000;
            if (ageMs < -60_000 || ageMs > freshnessLimitMs) throw new ProviderAdapterError(provider, 'STALE_MARKET_DATA', `Latest ${LABEL} candle is stale (${Math.round(ageMs / 1000)} seconds old).`);
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
          throw new MarketDataError('PROVIDER_UNAVAILABLE', `${LABEL} market-data request failed.`, provider);
        }
      };
      return await (streamReady ? operation() : this.circuit.execute(operation));
    } catch (error) {
      this.lastFailedProvider = provider;
      if (error instanceof MarketDataError) throw error;
      if (error instanceof ProviderAdapterError) throw new MarketDataError(error.code, error.message, provider);
      throw new MarketDataError('PROVIDER_UNAVAILABLE', `${LABEL} market-data request failed.`, provider);
    } finally {
      clearTimeout(timeout);
    }
  }

  private isConfigured(provider: MarketDataProvider): boolean { return provider === 'TWELVE_DATA' && this.twelveDataAdapter.isConfigured(); }

  private resetDailyUsageIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.usageDay) {
      this.usageDay = today;
      for (const provider of PROVIDER_ORDER) this.requestsToday[provider] = 0;
    }
  }
}

export const feedManager = new MarketFeedManager();
