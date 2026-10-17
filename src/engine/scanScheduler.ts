import type { MarketDataResult, MarketDataProvider } from './dataProviders';
import { MarketDataError } from './dataProviders';
import { executeStrategyPipeline, MIN_PAYOUT_PCT } from './pipeline';
import { ACTIVE_EXPERIMENT_ID } from './manifest';
import type { Candle, MasterTelemetry, NewsEvent, Timeframe } from './types';
import { timeframeMs } from './dataIntegrity';
import { breakevenFor, EdgeMonitor } from './edgeMonitor';
import { SignalLedger, signalIdFor, type SignalOutcome, type SignalView } from './signalLedger';
import { filterFxOpenMarketCandles, isFxBarClosed, isFxMarketClosed } from './marketHours';
import { classifySessionAndKillZone } from './session';

export type ScanTimeframe = '5m' | '15m' | '30m';
export type ScanTrigger = 'MANUAL' | 'AUTO';
export const SCAN_TIMEFRAMES: ScanTimeframe[] = ['5m', '15m', '30m'];
/** Auto-scan pair caps per timeframe so 2 credits/pair stays inside 70% of an 800/day, 8/min budget. */
export const MAX_AUTO_PAIRS: Record<ScanTimeframe, number> = { '5m': 1, '15m': 4, '30m': 7 };
export const SCAN_DELAY_AFTER_CLOSE_MS = 3_000;
export const SIGNAL_VALIDITY_MS = 10_000;
const RETRY_BACKOFF_MS = [5_000, 10_000, 20_000];
const PAIR_RE = /^[A-Z]{6}$/;

export interface ScanResult {
  pair: string;
  timeframe: ScanTimeframe;
  trigger: ScanTrigger;
  status: 'CALL' | 'PUT' | 'NO_TRADE';
  reason: string;
  signal_candle_open_ts: string | null;
  signal_id?: string;
  valid_until?: string;
  provider?: MarketDataProvider;
  htf_provider?: MarketDataProvider;
  failover_reason?: string;
  provider_changes?: ProviderSwitchNotice;
  scan_started_at?: string;
  candle_available_at?: string | null;
  delivered_at?: string;
  cached: boolean;
  telemetry?: MasterTelemetry;
}

export interface ProviderSwitchStep { fromProvider: MarketDataProvider; toProvider: MarketDataProvider; reason: string }
export interface ProviderSwitchNotice {
  pair: string;
  timeframe: ScanTimeframe;
  changedAt: string;
  changes: Array<ProviderSwitchStep & { series: Array<'LTF' | 'HTF'> }>;
}

type FetchedMarketData = MarketDataResult & { failoverReason?: string; providerSwitches: ProviderSwitchStep[] };

export interface ScanDeps {
  fetchCandles(pair: string, timeframe: Timeframe, provider: MarketDataProvider, kind: 'AUTO' | 'ON_DEMAND'): Promise<MarketDataResult>;
  providers(): MarketDataProvider[];
  getPayout(pair: string): { pct: number; setAt: string } | undefined;
  favorites(): string[];
  newsEvents(): NewsEvent[];
  newsSourceOnline(): boolean;
  autoBudgetRemaining(): number;
  now(): number;
  ledger: SignalLedger;
  onScan?(result: ScanResult): Promise<void> | void;
  onResolved?(signal: SignalView, outcome: SignalOutcome): Promise<void> | void;
  onEdgeLost?(reason: string): Promise<void> | void;
  loadState?(): ScanLoopState | undefined;
  saveState?(state: ScanLoopState): void;
  onProviderSwitches?(notice: ProviderSwitchNotice): Promise<void> | void;
}

export interface ScanLoopState { enabled: boolean; timeframe: ScanTimeframe; lastCycleCandleOpen?: string; lastRunAt?: string; lastSummary?: string; lastError?: string }

export const normalizeScanPair = (input: string) => String(input ?? '').replace('/', '').replace(/\s+/g, '').toUpperCase();
export const displayScanPair = (input: string) => { const p = normalizeScanPair(input); return p.length === 6 ? `${p.slice(0, 3)}/${p.slice(3)}` : p; };

/** Open time of the most recent fully closed candle at `nowMs`. */
export function latestClosedCandleOpenMs(nowMs: number, timeframe: Timeframe): number {
  const interval = timeframeMs(timeframe);
  return Math.floor(nowMs / interval) * interval - interval;
}

export function nextCandleCloseMs(nowMs: number, timeframe: Timeframe): number {
  const interval = timeframeMs(timeframe);
  return Math.floor(nowMs / interval) * interval + interval;
}

export class ScanService {
  private readonly cache = new Map<string, ScanResult>();
  private readonly htfCache = new Map<string, { hourOpen: number; result: FetchedMarketData }>();
  private cycleProvider: { cycle: string; provider: MarketDataProvider; reason?: string } | undefined;
  public readonly edge: EdgeMonitor;

  constructor(private readonly deps: ScanDeps) { this.edge = new EdgeMonitor(deps.ledger); }

  public get ledger(): SignalLedger { return this.deps.ledger; }

  private noTrade(pair: string, timeframe: ScanTimeframe, trigger: ScanTrigger, reason: string, extra: Partial<ScanResult> = {}): ScanResult {
    return { pair: displayScanPair(pair), timeframe, trigger, status: 'NO_TRADE', reason, signal_candle_open_ts: null, cached: false, ...extra };
  }

  private recordUnfetchedScan(result: ScanResult): ScanResult {
    const scanStartedAt = new Date(this.deps.now()).toISOString();
    const deliveredAt = new Date(this.deps.now()).toISOString();
    const timed: ScanResult = { ...result, scan_started_at: scanStartedAt, candle_available_at: null, delivered_at: deliveredAt };
    this.deps.ledger.recordScan({
      scan_id: `${scanStartedAt}|${timed.pair}|${timed.timeframe}|${timed.trigger}`,
      pair: timed.pair, timeframe: timed.timeframe, trigger: timed.trigger,
      status: timed.status, reason: timed.reason, scan_started_at: scanStartedAt,
      candle_available_at: null, delivered_at: deliveredAt,
    });
    return timed;
  }

  /** One provider per scan window; a failover is sticky for the window and its reason is preserved. */
  private async fetchWithFailover(pair: string, timeframe: Timeframe, kind: 'AUTO' | 'ON_DEMAND', windowKey: string): Promise<FetchedMarketData> {
    let lastError: unknown;
    let failedProvider: MarketDataProvider | undefined;
    const attempted = new Set<MarketDataProvider>();
    const providerSwitches: ProviderSwitchStep[] = [];
    if (this.cycleProvider?.cycle === windowKey) {
      const sticky = this.cycleProvider;
      attempted.add(sticky.provider);
      try {
        const res = await this.deps.fetchCandles(pair, timeframe, sticky.provider, kind);
        return { ...res, failoverReason: sticky.reason, providerSwitches };
      } catch (error) {
        lastError = error;
        failedProvider = sticky.provider;
        this.cycleProvider = undefined;
      }
    }
    const providers = this.deps.providers().filter((provider) => !attempted.has(provider));
    for (const provider of providers) {
      if (lastError && failedProvider) {
        const reason = lastError instanceof MarketDataError ? lastError.code : 'PROVIDER_ERROR';
        providerSwitches.push({ fromProvider: failedProvider, toProvider: provider, reason });
      }
      try {
        const res = await this.deps.fetchCandles(pair, timeframe, provider, kind);
        const reason = providerSwitches.length ? providerSwitches.map((step) => `${step.fromProvider} ${step.reason} → ${step.toProvider}`).join('; ') : undefined;
        this.cycleProvider = { cycle: windowKey, provider, reason };
        return { ...res, failoverReason: reason, providerSwitches };
      } catch (error) {
        lastError = error;
        failedProvider = error instanceof MarketDataError ? error.provider : provider;
      }
    }
    throw lastError ?? new MarketDataError('PROVIDER_NOT_CONFIGURED', 'No market-data provider configured.', 'TWELVE_DATA');
  }

  private async htfCandles(pair: string, nowMs: number, kind: 'AUTO' | 'ON_DEMAND', windowKey: string): Promise<FetchedMarketData> {
    const hourOpen = latestClosedCandleOpenMs(nowMs, '1h');
    const cached = this.htfCache.get(pair);
    if (cached && cached.hourOpen === hourOpen) return { ...cached.result, candles: cached.result.candles.map((candle) => ({ ...candle })), providerSwitches: [] };
    const res = await this.fetchWithFailover(pair, '1h', kind, windowKey);
    const filtered = { ...res, candles: filterFxOpenMarketCandles(res.candles, '1h') };
    this.htfCache.set(pair, { hourOpen, result: filtered });
    return filtered;
  }

  private async notifyProviderSwitches(pair: string, timeframe: ScanTimeframe, rows: Array<{ series: 'LTF' | 'HTF'; step: ProviderSwitchStep }>): Promise<ProviderSwitchNotice | undefined> {
    if (rows.length === 0) return undefined;
    const grouped = new Map<string, ProviderSwitchNotice['changes'][number]>();
    for (const { series, step } of rows) {
      const key = `${step.fromProvider}|${step.toProvider}|${step.reason}`;
      const existing = grouped.get(key);
      if (existing) { if (!existing.series.includes(series)) existing.series.push(series); }
      else grouped.set(key, { ...step, series: [series] });
    }
    const notice: ProviderSwitchNotice = { pair, timeframe, changedAt: new Date(this.deps.now()).toISOString(), changes: [...grouped.values()] };
    try { await this.deps.onProviderSwitches?.(notice); } catch { /* Notifications must not change scan decisions. */ }
    return notice;
  }

  public async scanPair(pairInput: string, timeframe: ScanTimeframe, trigger: ScanTrigger = 'MANUAL'): Promise<ScanResult> {
    const scanStartedAt = new Date(this.deps.now()).toISOString();
    let candleAvailableAt: string | null = null;
    let result: ScanResult;
    try {
      result = await this.scanPairCore(pairInput, timeframe, trigger, (timestamp) => { candleAvailableAt = timestamp; });
    } catch (error) {
      const deliveredAt = new Date(this.deps.now()).toISOString();
      const pair = displayScanPair(pairInput);
      const reason = error instanceof MarketDataError ? error.code : 'SCAN_ERROR';
      this.deps.ledger.recordScan({ scan_id: `${scanStartedAt}|${pair}|${timeframe}|${trigger}`, pair, timeframe, trigger, status: 'NO_TRADE', reason, scan_started_at: scanStartedAt, candle_available_at: candleAvailableAt, delivered_at: deliveredAt });
      throw error;
    }
    const deliveredAt = new Date(this.deps.now()).toISOString();
    const timedResult: ScanResult = { ...result, scan_started_at: scanStartedAt, candle_available_at: candleAvailableAt, delivered_at: deliveredAt };
    this.deps.ledger.recordScan({
      scan_id: `${scanStartedAt}|${timedResult.pair}|${timeframe}|${trigger}`,
      pair: timedResult.pair, timeframe, trigger, status: timedResult.status, reason: timedResult.reason,
      signal_id: timedResult.signal_id, scan_started_at: scanStartedAt, candle_available_at: candleAvailableAt, delivered_at: deliveredAt,
    });
    if (timedResult.signal_candle_open_ts) {
      const key = `${normalizeScanPair(timedResult.pair)}|${timeframe}|${timedResult.signal_candle_open_ts}`;
      const cached = this.cache.get(key);
      if (cached && !cached.cached) this.cache.set(key, timedResult);
    }
    return timedResult;
  }

  private async scanPairCore(pairInput: string, timeframe: ScanTimeframe, trigger: ScanTrigger, markCandleAvailable: (timestamp: string | null) => void): Promise<ScanResult> {
    const pair = normalizeScanPair(pairInput);
    if (!PAIR_RE.test(pair)) return this.noTrade(pairInput, timeframe, trigger, 'UNSUPPORTED_SYMBOL');
    if (!SCAN_TIMEFRAMES.includes(timeframe)) return this.noTrade(pair, timeframe, trigger, 'UNSUPPORTED_TIMEFRAME');
    const nowMs = this.deps.now();
    const expectedOpen = latestClosedCandleOpenMs(nowMs, timeframe);
    if (isFxMarketClosed(nowMs) || isFxBarClosed(new Date(expectedOpen).toISOString(), timeframe)) return this.noTrade(pair, timeframe, trigger, 'MARKET_CLOSED');
    if (classifySessionAndKillZone(new Date(expectedOpen).toISOString()).kill_zone !== 'INSIDE_KILL_ZONE') return this.noTrade(pair, timeframe, trigger, 'OUTSIDE_KILL_ZONE');
    const payout = this.deps.getPayout(pair);
    if (!payout) return this.noTrade(pair, timeframe, trigger, 'PAYOUT_UNSET');
    if (payout.pct < MIN_PAYOUT_PCT) return this.noTrade(pair, timeframe, trigger, `PAYOUT_BELOW_MIN (${payout.pct}%)`);
    const edge = this.edge.current();
    if (edge.paused) return this.noTrade(pair, timeframe, trigger, `EDGE_LOST: alerts paused since ${edge.lostAt}. Use /resume <reason>.`);

    const expectedIso = new Date(expectedOpen).toISOString();
    const cacheKey = `${pair}|${timeframe}|${expectedIso}`;
    const cached = this.cache.get(cacheKey);
    if (cached) { markCandleAvailable(cached.candle_available_at ?? null); return { ...cached, trigger, cached: true }; }

    const kind = trigger === 'AUTO' ? 'AUTO' : 'ON_DEMAND';
    const windowKey = `${timeframe}|${expectedIso}`;
    let primary: FetchedMarketData | undefined;
    let htf: FetchedMarketData | undefined;
    try {
      primary = await this.fetchWithFailover(displayScanPair(pair), timeframe, kind, windowKey);
      markCandleAvailable(new Date(this.deps.now()).toISOString());
      htf = await this.htfCandles(displayScanPair(pair), nowMs, kind, windowKey);
    } catch (error) {
      const providerChanges = primary ? await this.notifyProviderSwitches(displayScanPair(pair), timeframe, primary.providerSwitches.map((step) => ({ series: 'LTF' as const, step }))) : undefined;
      const code = error instanceof MarketDataError ? error.code : 'PROVIDER_ERROR';
      const reason = code === 'RATE_LIMITED' ? `BUDGET_LIMIT: ${error instanceof Error ? error.message : ''}` : `${code}: ${error instanceof Error ? error.message : 'market data unavailable'}`;
      return this.noTrade(pair, timeframe, trigger, reason, { provider: primary?.provider, provider_changes: providerChanges });
    }
    const providerChanges = await this.notifyProviderSwitches(displayScanPair(pair), timeframe, [
      ...primary.providerSwitches.map((step) => ({ series: 'LTF' as const, step })),
      ...htf.providerSwitches.map((step) => ({ series: 'HTF' as const, step })),
    ]);
    const candles = filterFxOpenMarketCandles(primary.candles, timeframe);
    const htfCandles = htf.candles;
    const latest = candles.at(-1);
    if (!latest || Date.parse(latest.timestamp) !== expectedOpen) {
      return this.noTrade(pair, timeframe, trigger, `DATA_QUALITY_FAIL: LATEST_CLOSED_CANDLE_MISSING (expected ${expectedIso}, got ${latest?.timestamp ?? 'none'})`, { provider: primary.provider, htf_provider: htf.provider, failover_reason: primary.failoverReason, provider_changes: providerChanges });
    }

    const telemetry = executeStrategyPipeline({
      decisionEngineVersion: 'V3', candles, currentCandleIndex: candles.length - 1, selectedTimeframe: timeframe,
      htfCandles, newsEvents: this.deps.newsEvents(), newsSourceOnline: this.deps.newsSourceOnline(),
      dataProvenance: primary.dataProvenance, provider: primary.provider, pair: displayScanPair(pair), asset: displayScanPair(pair),
      payoutPct: payout.pct, payoutSetAt: payout.setAt, nowMs,
    });
    const v3 = telemetry.decision_engine_v3;
    const signal = v3?.binarySignal ?? 'NO_TRADE';
    let result: ScanResult = {
      pair: displayScanPair(pair), timeframe, trigger, status: signal,
      reason: v3?.statusReason ?? telemetry.metadata.status_reason ?? telemetry.system_execution.rejection_reason ?? 'NO_QUALIFYING_SETUP',
      signal_candle_open_ts: latest.timestamp, provider: primary.provider, htf_provider: htf.provider,
      failover_reason: [primary.failoverReason, htf.failoverReason].filter(Boolean).join('; ') || undefined, provider_changes: providerChanges, cached: false, telemetry,
    };
    if (signal !== 'NO_TRADE' && v3) {
      const entryMs = expectedOpen + timeframeMs(timeframe);
      const validUntil = entryMs + SIGNAL_VALIDITY_MS;
      if (this.deps.now() > validUntil) {
        result = { ...result, status: 'NO_TRADE', reason: `SIGNAL_EXPIRED: ${signal} was not delivered before ${new Date(validUntil).toISOString()}.` };
      } else {
        const signalId = signalIdFor(displayScanPair(pair), timeframe, latest.timestamp);
        this.deps.ledger.recordSignal({
          signal_id: signalId, pair: displayScanPair(pair), timeframe, direction: signal,
          signal_candle_open_ts: latest.timestamp, entry_ts: new Date(entryMs).toISOString(), expiry_ts: new Date(entryMs + timeframeMs(timeframe)).toISOString(),
          valid_until: new Date(validUntil).toISOString(), payout_pct: payout.pct, breakeven: breakevenFor(payout.pct),
          mfci_total: v3.mfci.totalMfci, mfci_band: v3.mfciBand, engine_mode: v3.engineMode ?? 'PRICE_ONLY', provider: primary.provider,
          ltf_provider: primary.provider, htf_provider: htf.provider,
          setup_id: telemetry.metadata.setup_id, experiment_id: ACTIVE_EXPERIMENT_ID, session: telemetry.market_context.session, kill_zone: telemetry.market_context.kill_zone,
        });
        result = { ...result, signal_id: signalId, valid_until: new Date(validUntil).toISOString() };
      }
    }
    this.cache.set(cacheKey, result);
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
    await this.deps.onScan?.(result);
    return result;
  }

  /** Candle-close aligned auto cycle over eligible favourites, in favourite order, within the auto budget. */
  public async runAutoCycle(timeframe: ScanTimeframe, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<ScanResult[]> {
    const nowMs = this.deps.now();
    const expectedOpen = latestClosedCandleOpenMs(nowMs, timeframe);
    if (isFxMarketClosed(nowMs) || isFxBarClosed(new Date(expectedOpen).toISOString(), timeframe)) return this.deps.favorites().map((fav) => this.recordUnfetchedScan(this.noTrade(normalizeScanPair(fav), timeframe, 'AUTO', 'MARKET_CLOSED')));
    if (classifySessionAndKillZone(new Date(expectedOpen).toISOString()).kill_zone !== 'INSIDE_KILL_ZONE') return this.deps.favorites().map((fav) => this.recordUnfetchedScan(this.noTrade(normalizeScanPair(fav), timeframe, 'AUTO', 'OUTSIDE_KILL_ZONE')));
    const results: ScanResult[] = [];
    let scanned = 0;
    for (const fav of this.deps.favorites()) {
      const pair = normalizeScanPair(fav);
      const payout = this.deps.getPayout(pair);
      if (!payout || payout.pct < MIN_PAYOUT_PCT) { results.push(this.recordUnfetchedScan(this.noTrade(pair, timeframe, 'AUTO', payout ? `PAYOUT_BELOW_MIN (${payout.pct}%)` : 'PAYOUT_UNSET'))); continue; }
      if (scanned >= MAX_AUTO_PAIRS[timeframe]) { results.push(this.recordUnfetchedScan(this.noTrade(pair, timeframe, 'AUTO', `BUDGET_LIMIT: ${timeframe} auto-scan cap is ${MAX_AUTO_PAIRS[timeframe]} pair(s) per candle.`))); continue; }
      if (this.deps.autoBudgetRemaining() < 2) { results.push(this.recordUnfetchedScan(this.noTrade(pair, timeframe, 'AUTO', 'BUDGET_LIMIT: daily auto-scan budget (70%) exhausted.'))); continue; }
      scanned++;
      let result = await this.scanPair(pair, timeframe, 'AUTO');
      for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length && /LATEST_CLOSED_CANDLE_MISSING|PROVIDER_HTTP_ERROR|PROVIDER_ERROR|STALE_MARKET_DATA/.test(result.reason) && this.deps.autoBudgetRemaining() >= 1; attempt++) {
        await sleep(RETRY_BACKOFF_MS[attempt]);
        result = await this.scanPair(pair, timeframe, 'AUTO');
      }
      results.push(result);
    }
    return results;
  }

  /** Resolves expired signals from provider candles: the entry candle opens at entry_ts and closes at expiry. */
  public async resolvePending(): Promise<Array<{ signal_id: string; outcome: SignalOutcome | 'RESOLVE_PENDING' }>> {
    const nowMs = this.deps.now();
    const out: Array<{ signal_id: string; outcome: SignalOutcome | 'RESOLVE_PENDING' }> = [];
    const pending = this.deps.ledger.pending(nowMs - 5_000);
    if (isFxMarketClosed(nowMs)) return pending.map((signal) => ({ signal_id: signal.signal_id, outcome: 'RESOLVE_PENDING' as const }));
    const groups = new Map<string, SignalView[]>();
    for (const s of pending) { const key = `${s.pair}|${s.timeframe}`; groups.set(key, [...(groups.get(key) ?? []), s]); }
    for (const [key, signals] of groups) {
      const [pair, timeframe] = key.split('|') as [string, ScanTimeframe];
      let candles: Candle[] = [];
      try { candles = (await this.fetchWithFailover(pair, timeframe, 'AUTO', `resolve|${key}|${latestClosedCandleOpenMs(nowMs, timeframe)}`)).candles; } catch { /* stays RESOLVE_PENDING */ }
      for (const s of signals) {
        const c = candles.find((x) => x.timestamp === s.entry_ts || Date.parse(x.timestamp) === Date.parse(s.entry_ts));
        if (!c) {
          if (nowMs - Date.parse(s.expiry_ts) > 24 * 3_600_000 && s.outcome !== 'UNRESOLVED') {
            this.deps.ledger.recordResult({ signal_id: s.signal_id, outcome: 'UNRESOLVED', source: 'AUTO_PROVIDER', note: 'Entry candle unavailable 24h after expiry.' });
            out.push({ signal_id: s.signal_id, outcome: 'UNRESOLVED' });
          } else out.push({ signal_id: s.signal_id, outcome: 'RESOLVE_PENDING' });
          continue;
        }
        const outcome: SignalOutcome = c.close === c.open ? 'TIE' : (s.direction === 'CALL') === (c.close > c.open) ? 'WIN' : 'LOSS';
        this.deps.ledger.recordResult({ signal_id: s.signal_id, outcome, source: 'AUTO_PROVIDER', entry_price: c.open, exit_price: c.close });
        out.push({ signal_id: s.signal_id, outcome });
        await this.deps.onResolved?.(this.deps.ledger.get(s.signal_id)!, outcome);
      }
    }
    if (out.some((r) => r.outcome === 'WIN' || r.outcome === 'LOSS')) {
      const edge = this.edge.check();
      if (edge.transitioned) await this.deps.onEdgeLost?.(edge.reason);
    }
    return out;
  }

  /** Owner-entered result via Telegram /result; appended, never overwriting history. */
  public recordManualResult(signalId: string, outcomeInput: string): string {
    const outcome = outcomeInput.toUpperCase() as SignalOutcome;
    if (!['WIN', 'LOSS', 'TIE', 'SKIPPED'].includes(outcome)) return 'ERROR INVALID_RESULT: use /result <signal_id> win|loss|tie|skipped.';
    const signal = this.deps.ledger.get(signalId);
    if (!signal) return `ERROR UNKNOWN_SIGNAL: ${signalId}`;
    this.deps.ledger.recordResult({ signal_id: signal.signal_id, outcome, source: 'TELEGRAM_MANUAL' });
    if (outcome === 'WIN' || outcome === 'LOSS') this.edge.check();
    return `Result recorded: ${signal.signal_id} ${signal.pair} ${signal.timeframe} ${signal.direction} => ${outcome}${signal.outcome && signal.outcome !== outcome ? ` (previous ${signal.outcome} kept in ledger)` : ''}.`;
  }
}

/** Restart-safe candle-close loop. State persists through deps.saveState; a restart never re-runs a completed candle. */
export class ScanLoop {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(private readonly service: ScanService, private readonly deps: Pick<ScanDeps, 'now' | 'loadState' | 'saveState'>, private readonly defaults: { timeframe: ScanTimeframe; enabled: boolean }) {}

  public state(): ScanLoopState {
    return this.deps.loadState?.() ?? { enabled: this.defaults.enabled, timeframe: this.defaults.timeframe };
  }

  private save(patch: Partial<ScanLoopState>) { this.deps.saveState?.({ ...this.state(), ...patch }); }

  public start(): void { this.stop(); this.schedule(); }
  public stop(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  public setEnabled(enabled: boolean, timeframe?: ScanTimeframe) { this.save({ enabled, ...(timeframe ? { timeframe } : {}) }); }

  private schedule(): void {
    const { timeframe } = this.state();
    const delay = Math.max(1_000, nextCandleCloseMs(this.deps.now(), timeframe) + SCAN_DELAY_AFTER_CLOSE_MS - this.deps.now());
    this.timer = setTimeout(() => { void this.tick().finally(() => this.schedule()); }, delay);
  }

  public async tick(): Promise<ScanResult[]> {
    const state = this.state();
    if (!state.enabled || this.running) return [];
    const candleOpen = new Date(latestClosedCandleOpenMs(this.deps.now(), state.timeframe)).toISOString();
    if (state.lastCycleCandleOpen === candleOpen) return [];
    this.running = true;
    try {
      this.save({ lastCycleCandleOpen: candleOpen });
      const results = await this.service.runAutoCycle(state.timeframe);
      await this.service.resolvePending();
      this.save({ lastRunAt: new Date(this.deps.now()).toISOString(), lastSummary: results.map((r) => `${r.pair}:${r.status}`).join(','), lastError: undefined });
      return results;
    } catch (error) {
      this.save({ lastError: error instanceof Error ? error.message : String(error) });
      return [];
    } finally { this.running = false; }
  }
}
