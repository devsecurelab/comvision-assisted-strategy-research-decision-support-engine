# ComVision প্রজেক্ট কোড রিডিং রিপোর্ট

**পর্যালোচনার ধরন:** read-only; কোনো project source/config/test ফাইল পরিবর্তন করা হয়নি।
**Snapshot:** branch `fix/pr4-telegram-final-fallback`, commit `8df877c` (2026-11-17-এ checkout-এ দেখা অবস্থা)।
**Scope:** `src/engine/`, `src/server/`, root `server.ts`, types, feed, chart, storage, package/test, retry/backfill।

> `server.ts`-এর সম্পূর্ণ ১,১০৭-লাইন snapshot আলাদা [পূর্ণ server.ts কোড ফাইল](project-code-review-server-2026-11-17.ts)-এ আছে। এটি repository-এর source নয়, বাইরে রাখা অপরিবর্তিত copy।

## সংক্ষিপ্ত উত্তর

এটি forex research/decision-support অ্যাপ। Live market feed বর্তমানে **Twelve Data REST time-series/price API** থেকে আসে; Binance বা অন্য কোনো exchange WebSocket, `kline` stream বা `aggTrade` stream এই checkout-এ নেই। ক্যান্ডেল আগে থেকে OHLC আকারে provider দেয়; অ্যাপ tick/Trade থেকে bar বানায় না। `Trade` নামে production market-trade interface নেই, এবং aggressor/buyer-maker side ফিল্ডও নেই। Candle data normalized করে V3 pipeline-এ যায়; directional ফল notification service দিয়ে Telegram-এ পাঠানো হয়, scan ও event append-only JSONL ledger-এ এবং telemetry/users/settings ইত্যাদি `DATA_DIR`-এর JSON ফাইলে রাখা হয়। UI chart কোনো chart package নয়—React নিজে SVG candlestick আঁকে।

## 1. `src/engine` ও `src/server` সম্পূর্ণ file tree — প্রতিটির এক লাইনের কাজ

### `src/engine/`

| ফাইল | এক-লাইন বিবরণ |
|---|---|
| `backtestStats.ts` | Wilson confidence interval, MFCI bucket statistics এবং sample-size-ভিত্তিক verdict হিসাব করে। |
| `configPath.ts` | caller-এর working directory/import.meta-র ওপর নির্ভর না করে repository config path resolve করে। |
| `dataIntegrity.ts` | Candle series-এর OHLC, timestamp alignment/gap, closure ও clock drift validation করে। |
| `dataProviders.ts` | Twelve Data-only provider manager; quota scheduler, cache, circuit breaker, normalize, quote ও historical-fetch orchestration। |
| `edgeMonitor.ts` | ledger outcome থেকে breakeven/Wilson-based edge state এবং report তৈরি করে। |
| `experimentTracker.ts` | experiment/candidate telemetry, setup lifecycle, state persistence, lock/mute/scanner state ও milestones পরিচালনা করে। |
| `legacyTelemetry.ts` | পুরোনো telemetry alias-কে কেবল backward-read compatibility-তে পড়ে। |
| `manifest.ts` | frozen strategy identity, canonical parameter/session/config hash ও engine fingerprint প্রকাশ করে। |
| `marketCalendar.ts` | configurable market calendar load/validate/hash এবং holiday/weekday rules সামলায়। |
| `marketHours.ts` | FX weekly/holiday closure যাচাই করে এবং closed interval-এ candle বাদ দেয়। |
| `marketStructureV3.ts` | FVG, IFVG, BPR এবং provider-volume-weighted POC হিসাব করে। |
| `milestones.ts` | experiment milestone crossing-এর restart-safe notification threshold দেয়। |
| `params.ts` | V3 engine-এর canonical, frozen parameter set ও constants। |
| `pipeline.ts` | provenance/payout/data/HTF checks-এর পর causally-truncated input-এ authoritative V3 evaluation চালায় এবং MasterTelemetry বানায়। |
| `price.ts` | pair pip size, ATR-derived tolerance ও pips conversion। |
| `providers/circuit.ts` | Twelve Data circuit-breaker state; 429, daily quota ও transient provider outage-এর cooldown। |
| `providers/contracts.ts` | provider IDs, payload/result এবং adapter interface/type contract। |
| `providers/http.ts` | fetch timeout/error/status classification এবং sanitized provider error wrapper। |
| `providers/normalize.ts` | provider rows-কে Candle-এ map, OHLC/timestamp/order/closed-candle validation। |
| `providers/twelveDataAdapter.ts` | Twelve Data time-series, batch, current price ও bounded historical endpoint adapter। |
| `r8Backtest.ts` | একই live pipeline দিয়ে causal walk-forward R8 backtest ও trade/bar outputs। |
| `rateLimitScheduler.ts` | per-minute/hour/day quota, auto-budget, hard stop এবং request class scheduling। |
| `scanScheduler.ts` | manual/auto scans, pair/timeframe scheduling, retry, signal/result ledger এবং scan loop lifecycle। |
| `session.ts` | session/kill-zone classification এবং session boundary helpers। |
| `sessionConfig.ts` | session, entry rule, margins, expiry ও timeframe config validation/hash। |
| `signalLedger.ts` | append-only JSONL signal/scan/result ledger, SHA-256 hash chain, verification ও derived signal views। |
| `strategyV3Engine.ts` | V3 gates/stages, HTF direction, MFCI এবং CALL/PUT/NO_TRADE সিদ্ধান্ত। |
| `types.ts` | Candle, telemetry, rule, quality, signal, user এবং runtime settings-এর shared TS types। |

### `src/server/`

| ফাইল | এক-লাইন বিবরণ |
|---|---|
| `alertBeforeTelemetry.ts` | status-ভিত্তিক signal notification attempt-কে পূর্ণ candidate telemetry persistence-এর আগে চালায়; persistence তবু চালায়। |
| `analyticsService.ts` | persisted telemetry/outcomes থেকে history, performance, trade action এবং analytics তৈরি করে। |
| `auth.ts` | password/session, account status/role, authentication এবং audit operations। |
| `chatService.ts` | research chat query classify করে deterministic analytics/strategy response দেয়; engine mutation নয়। |
| `favoriteRegistry.ts` | supported FX favorites load/add/remove persistence। |
| `notificationService.ts` | Telegram/email alerts, command polling, test alert, dedupe, health ও timeout পরিচালনা করে। |
| `operationalStorage.ts` | compact scan-summary ring, size guard এবং idempotent/backoff upload utility। |
| `operations.ts` | operator status/payout reminders, scan-gap detection/dead-man operational helpers। |
| `payoutRegistry.ts` | manually-set payout data, supported pair validation ও payout freshness/eligibility। |
| `preflight.ts` | startup-এর আগে config/data/ledger path normalize ও resolve করে। |
| `runtimeConfig.ts` | environment runtime config validate করে, production DATA_DIR/HOST ইত্যাদি resolve করে। |
| `runtimeSelfCheck.ts` | startup checks aggregate করে PASS/FAILED/DEGRADED status তৈরি করে। |
| `storage.ts` | atomic/backup JSON-file persistence for users, sessions, telemetry, outcomes, notifications, settings ইত্যাদি। |
| `summaryUploader.ts` | idempotent summary upload-এর ছোট retry/backoff wrapper। |
| `telegramSend.ts` | shared Telegram Bot API transport, timeout, retry_after, retry, plain-text fallback ও token redaction। |

## 2. `server.ts`-এর সম্পূর্ণ কোড

সম্পূর্ণ কোড আলাদা [পূর্ণ `server.ts` snapshot](project-code-review-server-2026-11-17.ts)-এ সংযুক্ত। এটি checkout থেকে byte-for-byte copy; source tree-তে কোনো পরিবর্তন করা হয়নি। Server-টি Express API, auth middleware, engine/scan composition, Vite/static frontend serving, operational boot checks ও timers চালায়। প্রধান route-গুলোর সূচি নিচে §6-এ।

## 3. Candle, Trade, Signal type/interface

`Candle`-এর shared definition `src/engine/types.ts`-এ। `Trade` নামে generic/live trade interface নেই। Backtest-only `R8Trade` আছে, আর broker entry-র জন্য ledger-এ শুধু `TradeTakenPayload` আছে—এটি কোনো exchange tick/trade feed object নয়। Named `Signal` interface-ও নেই; ledger-এর `SignalPayload` এবং enriched read model `SignalView` signal schema হিসেবে কাজ করে। Engine output হলো `MasterTelemetry` এবং তার nested `decision_engine_v3.binarySignal` (`CALL | PUT | NO_TRADE`)। নিচে প্রাসঙ্গিক definitions হুবহু দেওয়া হলো।

### Candle (সম্পূর্ণ interface)

উৎস: `src/engine/types.ts:9-17`

```ts
export interface Candle {
  timestamp: string; // ISO string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  volumeDelta?: number;
  cvd?: number;
```
### Directional signal literal type

উৎস: `src/engine/types.ts:213`

```ts
export type BinarySignal = 'CALL' | 'PUT' | 'NO_TRADE';
```
### Ledger SignalPayload (সম্পূর্ণ interface)

উৎস: `src/engine/signalLedger.ts:17-47`

```ts
export interface SignalPayload {
  signal_id: string;
  pair: string;
  timeframe: '5m' | '15m' | '30m';
  direction: 'CALL' | 'PUT';
  signal_candle_open_ts: string;
  entry_ts: string;
  expiry_ts: string;
  valid_until: string;
  payout_pct: number;
  breakeven: number;
  mfci_total: number;
  mfci_band: string;
  engine_mode: 'FULL' | 'PRICE_ONLY';
  provider: string;
  ltf_provider?: string;
  htf_provider?: string;
  setup_id: string;
  /** Added to newly committed payloads; absent only on historical records. */
  engine_fingerprint?: string;
  experiment_id: string;
  config_hash?: string;
  config_hash_epoch?: string;
  session_config_hash?: string;
  session?: string;
  kill_zone?: string;
  signal_price?: number;
  quote_price?: number;
  quote_ts?: string;
  price_tolerance?: number;
}
```
### SignalView (সম্পূর্ণ interface)

উৎস: `src/engine/signalLedger.ts:77-90`

```ts
export interface SignalView extends SignalPayload {
  outcome?: SignalOutcome;
  provider_outcome?: SignalOutcome;
  broker_outcome?: SignalOutcome;
  result_source?: ResultPayload['source'];
  resolved_at?: string;
  entry_price?: number;
  exit_price?: number;
  broker_entry_price?: number;
  broker_close_price?: number;
  slippage_pips?: number;
  candle_revision_pips?: number;
  telegram_sent_at?: string;
}
```
### TradeTakenPayload এবং backtest-only R8Trade

উৎস: `src/engine/signalLedger.ts:92; src/engine/r8Backtest.ts:36`

```ts
export interface TradeTakenPayload { signal_id: string; broker_entry_price: number }
export interface R8Trade { signal_ts: string; direction: 'CALL' | 'PUT'; mfci: number; entry_open: number; exit_close: number; outcome: 'WIN' | 'LOSS' | 'TIE'; session: string; hour_utc: number }
```
### MasterTelemetry (সম্পূর্ণ interface; engine-এর research record)

উৎস: `src/engine/types.ts:265-407`

```ts
export interface MasterTelemetry {
  decision_engine_v3?: V3DecisionTelemetry;
  /** Closed candles captured only for a directional signal; absent means a chart is unavailable. */
  candle_snapshot?: {
    candles: Candle[];
    signal_candle_open_ts?: string | null;
    source: 'SIGNAL_TELEMETRY' | 'STORED_WINDOW';
    setup_id?: string;
  };
  metadata: {
    project_name: string;
    strategy_version: string; // active engine version, e.g. "RDP_STRATEGY_V3.0"
    experiment_id: string; // e.g. "EXP-2026-V3-REAL-001"
    setup_id: string; // e.g. "V3-..."
    config_hash?: string; // SHA-256 of frozen rule parameters
    config_hash_epoch?: string; // Canonical hash scheme identifier; absent on legacy records
    timestamp_utc: string;
    signal_timestamp_utc?: string;
    pair?: string;
    asset?: string;
    data_quality: DataQuality;
    data_provenance?: DataProvenance;
    sha256_hash?: string;
    prev_hash?: string;
    engine_mode?: 'FULL' | 'PRICE_ONLY';
    excluded_stages?: Array<{ stage: number; name: string; reason: string }>;
    decision_engine?: 'decision_engine_v3';
    provider?: 'TWELVE_DATA' | 'UNAVAILABLE';
    poc_label?: 'PROVIDER_VOLUME_POC' | 'UNAVAILABLE';
    signal_candle_open_ts?: string | null;
    htf_bias?: 'BULLISH' | 'BEARISH' | 'UNCLEAR';
    data_quality_issues?: string[];
    mfci_total?: number | null;
    mfci_structure?: number | null;
    mfci_orderflow?: number | null;
    mfci_liquidity?: number | null;
    mfci_band?: MfciBand;
    status?: string;
    status_reason?: string;
    first_failed_gate?: number;
    payout_pct?: number;
    payout_set_at?: string;
    payout_source?: 'TELEGRAM_MANUAL';
  };
  market_context: {
    selected_timeframe: Timeframe;
    supporting_timeframe_analysis: {
      htf_analyzed: string;
      htf_bias: StructuralState;
    };
    local_bias: StructuralState;
    context_state: 'ALIGNED' | 'TRANSITION' | 'UNCLEAR';
    regime_tag: 'TRENDING' | 'RANGING' | 'TRANSITION' | 'UNCLEAR';
    session: MarketSession;
    kill_zone: KillZoneState;
    session_start_utc?: string;
    session_end_utc?: string;
  };
  validation_metrics?: {
    structure: {
      status: 'PASS' | 'REJECT' | 'INCONCLUSIVE';
      swing_confirmed_at_timestamp?: string;
      reason?: string;
    };
    bos?: BosState;
    choch?: ChochState;
    fvg: {
      fvg_status: 'PASS' | 'REJECT' | 'EXPIRED' | 'INVALID' | 'INCONCLUSIVE';
      fvg_mitigation_state: FVGMitigationState;
      zone?: [number, number];
      reason?: string;
    };
    ifvg?: IfvgState;
    bpr?: BprState;
    order_block: {
      ob_detected: boolean;
      ob_confluence_status: 'PASS' | 'FAIL';
      ob_zone?: [number, number];
      reason?: string;
    };
    breaker_block?: BreakerState;
    pattern_3_candle: {
      status: 'PASS' | 'REJECT';
      reason?: string;
    };
    inside_candle: {
      inside_candle_detected: boolean;
    };
    fib_zone: {
      status: 'PASS_DISCOUNT' | 'PASS_PREMIUM' | 'REJECT';
      fib_50_level?: number;
      reason?: string;
    };
    ote?: OteState;
    tick_proxy: {
      status: 'PASS' | 'REJECT';
      tick_sequence: TickSequence;
      tick_baseline: TickBaseline;
      reason?: string;
    };
    momentum?: MomentumStateInfo;
    wick_check: {
      status: 'PASS' | 'REJECT';
      wick_ratio: number;
      reason?: string;
    };
    liquidity_sweep: {
      status: LiquiditySweepStatus;
      tested_swing_level?: number;
      reason?: string;
    };
    bsl_ssl?: BslSslState;
  };
  pressure_observation?: PressureObservation;
  guardrails: {
    news_guard: {
      news_event_detected: boolean;
      news_window_state: NewsWindowState;
      news_source: string;
      reason?: string;
    };
  };
  system_execution: {
    system_decision: SystemDecision;
    final_action: FinalAction;
    user_recorded_action: UserRecordedAction;
    halted_at_stage?: string;
    rejection_reason?: string;
  };
  next_candle_observation?: {
    status: NextCandleObservation;
    observation_timestamp?: string;
    observed_candle?: Candle;
    details?: string;
  };
  provider_provenance?: {
    provider?: 'TWELVE_DATA';
    provider_state?: string;
    rate_limit_usage?: string;
    timestamp_ingested: string;
    data_provenance?: DataProvenance;
  };
}
```
## 4. Data feed: source, stream, symbols/timeframes, aggressor side

- **Provider vs exchange:** কোডে একমাত্র provider `TWELVE_DATA`; Twelve Data FX symbol API ব্যবহৃত হয়েছে। নির্দিষ্ট underlying exchange/venue-র field বা venue pinning নেই—FX pair quote feed, exchange-specific order/trade tape নয়।
- **Endpoint/stream:** `https://api.twelvedata.com/time_series` (REST polling, `outputsize=130`, timezone UTC) এবং `/price` REST quote। **WebSocket stream নেই**; `kline`/`aggTrade` subscription নেই। `dataProviders.ts`-এ `streamReady = false` hard-coded আছে।
- **Intervals:** adapter mapping `1m→1min`, `5m→5min`, `15m→15min`, `30m→30min`, `1h→1h`। Operational scanner selectable timeframe শুধু `5m,15m,30m`; 1h candle higher-timeframe bias-এর জন্য।
- **Symbols:** default favorites `EUR/USD`, `GBP/USD`, `AUD/CAD`, `AUD/CHF`, `EUR/GBP`, `AUD/JPY`, `AUD/USD`, `EUR/CHF`, `CAD/CHF`। Validator মূলত slash মুছে ছয়টি uppercase letter pattern গ্রহণ করে; তাই ওই favorites-ই exhaustive allowlist নয়।
- **Trade/aggressor:** generic live `Trade` type নেই। `Candle`-এ volume nullable; optional `volumeDelta`, `cvd`, `pocPrice` আছে, কিন্তু Twelve Data live normalizer মূলত OHLCV map করে—`aggressorSide`, buyer-maker, bid/ask trade flag বা aggTrade নেই। Volume absent হতে পারে।

### Provider candle normalization — পূর্ণ function

উৎস: `src/engine/providers/normalize.ts:36-69`

```ts
export function normalizeCandles(
  payload: ProviderCandlePayload,
  provider: MarketDataProvider,
  timeframe: Timeframe,
  requireClosed = true,
  nowMs = Date.now(),
): NormalizedProviderResult {
  if (!Array.isArray(payload.rows)) throw new ProviderAdapterError(provider, 'INVALID_PROVIDER_RESPONSE', `${provider} response did not contain a candle array.`);
  const candles: Candle[] = payload.rows.map((row: any) => {
    const open = Number(row?.open ?? row?.['1. open']);
    const high = Number(row?.high ?? row?.['2. high']);
    const low = Number(row?.low ?? row?.['3. low']);
    const close = Number(row?.close ?? row?.['4. close']);
    const volumeValue = row?.volume ?? row?.['5. volume'];
    const volume = volumeValue === undefined || volumeValue === null || volumeValue === '' ? null : Number(volumeValue);
    if (![open, high, low, close].every(Number.isFinite) || (volume !== null && (!Number.isFinite(volume) || volume < 0)) || open <= 0 || high <= 0 || low <= 0 || close <= 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      throw new ProviderAdapterError(provider, 'DATA_QUALITY_FAIL', `${provider} returned malformed OHLC values.`);
    }
    return {
      timestamp: parseTimestamp(row?.datetime ?? row?.timestamp ?? row?.time ?? row?.date, payload.timezone || 'UTC', provider),
      open, high, low, close, volume,
    };
  });

  const originalOrder = candles.map((candle) => candle.timestamp);
  const sorted = [...originalOrder].sort((a, b) => Date.parse(a) - Date.parse(b));
  if (sorted.some((timestamp, index) => timestamp !== originalOrder[index])) throw new ProviderAdapterError(provider, 'DATA_QUALITY_FAIL', `${provider} returned candles out of chronological order.`);
  const intervalMs: Record<Timeframe, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000 };
  const closed = requireClosed ? candles.filter((candle) => Date.parse(candle.timestamp) + intervalMs[timeframe] <= nowMs) : candles;
  if (closed.some((candle, index) => index > 0 && candle.timestamp === closed[index - 1].timestamp)) throw new ProviderAdapterError(provider, 'DATA_QUALITY_FAIL', `${provider} returned duplicate candle timestamps.`);
  if (closed.length < 25) throw new ProviderAdapterError(provider, 'INSUFFICIENT_HISTORY', `${provider} returned ${closed.length} candles; at least 25 are required.`);
  const hasVolume = closed.some((candle) => typeof candle.volume === 'number');
  return { candles: closed, volumeAvailable: payload.volumeAvailable ?? hasVolume };
}
```
## 5. Candle/bar builder এবং signal rule

**নিজস্ব tick-to-bar builder নেই।** Provider-ই interval-ভিত্তিক OHLC candles ফেরত দেয়; `normalizeCandles()` timestamp/OHLC/duplicate/closed-candle validation করে। অর্থাৎ candle builder হিসেবে অ্যাপের কোনো WebSocket tick aggregator বা aggTrade aggregator পাওয়া যায়নি।

একটি বাস্তব V3 market-structure rule হিসেবে নিচে তিন-ক্যান্ডেল FVG detector-এর সম্পূর্ণ কোড দেওয়া হলো। এটি মাঝের bar-কে কেবল index spacing-এ অন্তর্ভুক্ত করে; bullish gap: তৃতীয়/right candle-এর low প্রথম/left candle-এর high-এর ওপরে; bearish gap উল্টো। এই detector নিজে একা final `CALL/PUT` signal পাঠায় না; `strategyV3Engine` একাধিক stage/gate ও operational guard মিলিয়ে সিদ্ধান্ত দেয়।

### Existing signal-rule helper: detectFvgZones (সম্পূর্ণ function)

উৎস: `src/engine/marketStructureV3.ts:11-36`

```ts
/** Detects closed three-candle fair-value gaps using body-independent wick boundaries. */
export function detectFvgZones(candles: Candle[]): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < candles.length; i += 1) {
    const left = candles[i - 2];
    const right = candles[i];
    if (right.low > left.high) {
      zones.push({
        bottom: left.high,
        top: right.low,
        creationTimestamp: right.timestamp,
        mitigationState: 'UNMITIGATED',
        direction: 'BULLISH',
      });
    } else if (right.high < left.low) {
      zones.push({
        bottom: right.high,
        top: left.low,
        creationTimestamp: right.timestamp,
        mitigationState: 'UNMITIGATED',
        direction: 'BEARISH',
      });
    }
  }
  return zones;
}
```
## 6. Signal তৈরির পর কোথায় যায়

প্রবাহটি: `ScanService.scanPair()` → `executeStrategyPipeline()` → `ScanResult`/telemetry → `server.ts`-এর `onScan` callback. Directional eligible result হলে `alertBeforeTelemetry()`-এর মাধ্যমে `notificationService.dispatchSignalAlert()` Telegram-এ alert attempt করে। তারপর telemetry `experimentTracker`/`durableStorage.saveCandidates()` দিয়ে JSON files-এ যায়; scan/signal/result events `SignalLedger`-এ JSONL hash-chain append হয়। Telegram message delivery record-ও `notifications.json`-এ durable হয়; সফল signal delivery ledger-এর `SIGNAL_SENT` event হিসেবে রাখা হয়।

**Telegram:** হ্যাঁ, configured/eligible signal ও result alerts Telegram Bot API-তে যায় (shared `telegramSend` helper)। **Database:** relational DB নেই; JSON files এবং append-only JSONL ledger আছে। **WebSocket:** backend/frontend source search-এ WebSocket/socket.io implementation পাওয়া যায়নি; browser API polling/request-response REST `fetch()` ব্যবহার করে।

প্রাসঙ্গিক REST endpoints: `GET /api/engine/dashboard-state` ও `/status`, `/api/engine/candidates`, `/api/market/feed`, `/api/ledger/stats`, `/api/research/analytics`, `/api/notifications/*`, `/api/chat/*`, `/api/admin/*`; auth `/api/auth/*`। Protected routes bearer-token middleware ব্যবহার করে।

## 7. Storage: কী কোথায়

Production-এ `DATA_DIR` বাধ্যতামূলক। `DurableStorage`-এর file map:

| ফাইল (DATA_DIR-এর নিচে) | ডেটা |
|---|---|
| `users.json` | user account records |
| `sessions.json` | session records; current write path-এ token hash/expiry/user relation |
| `candidates.json` | bounded full candidate telemetry history (default 500; `CANDIDATE_HISTORY_LIMIT`) |
| `signals.json` | PASS/directional compatible signal view (default cap 500; `SIGNAL_RETENTION_LIMIT`) |
| `scan_summaries.json` | compact scan summaries ring (default 200; storage cap guard) |
| `outcomes.json` | manually/provider-resolved research outcome records |
| `audit_log.json` | last 1,000 audit events |
| `notifications.json` | last 500 Telegram/email notification states |
| `chat_history.json` | optional chat history, up to 500; disable via `CHAT_HISTORY_ENABLED=false` |
| `experiment_state.json` | lock/scanner/mute/hash/milestone state |
| `app_settings.json` | payout/favorites/Telegram offset/reminder/operational settings |
| `SIGNAL_LEDGER_PATH` (default `DATA_DIR/signal-ledger.jsonl`) | append-only signal/scan/result/edge/repair events with SHA-256 chain |

JSON writes temp-file + rename, `.prev` backup, permission `0600` and critical fsync ব্যবহার করে। Broken JSON quarantine করে `.prev` restore চেষ্টা করে। এটি application-level durable file storage; SQL/NoSQL database নয়।

## 8. Frontend: chart library ও backend data fetching

Chart dependency নেই (package-এ `lightweight-charts`, Recharts, Chart.js, D3 নেই)। `src/components/ChartModal.tsx` React-built native SVG-তে telemetry `candle_snapshot` থেকে সর্বশেষ 40 candle আঁকে, signal candle highlight করে এবং available হলে Gate 4 zone overlay করে। তাই এটি live market chart/widget নয়; signal telemetry-তে সংরক্ষিত snapshot chart-ই। Snapshot missing হলে “CHART UNAVAILABLE” দেখায়.

`src/config/api.ts`-এর `apiFetch()` browser-native `fetch()` wrapper; relative `/api/...` URLs default, optional API base URL browser `localStorage`/Vite env থেকে। `App.tsx` status, candidates, scanner, record-action/outcome ইত্যাদি REST API endpoint কল করে। WebSocket stream/push নেই।

## 9. `package.json` scripts/dependencies এবং `tsconfig.json`

বর্তমান পূর্ণ `package.json` ও `tsconfig.json` নিচে হুবহু।

### package.json (সম্পূর্ণ; scripts/dependencies সহ)

উৎস: `package.json`

```json
{
  "name": "react-example",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "export NODE_ENV=test; npm run test:inventory && ADMIN_BOOTSTRAP_PASSWORD=test-only-pr8-bootstrap-password tsx test/auth_hardening.test.ts && tsx test/pr7_security_session.test.ts && tsx test/pr7_registration_security.test.ts && tsx test/pr7_dst_boundaries.test.ts && tsx test/pr7_market_calendar.test.ts && tsx test/pr7_session_config.test.ts && tsx test/pr7_startup_guards.test.ts && tsx test/pr7_operations.test.ts && tsx test/pr7_termux_operations.test.ts && tsx test/pr3_storage_operations.test.ts && tsx test/storage_recovery.test.ts && tsx test/pr6_chart_modal.test.ts && tsx test/pr6_alert_state.test.ts && tsx test/pr2_v3_milestones.test.ts && tsx test/pr2_alert_ordering.test.ts && tsx test/pr3_bounded_retention.test.ts && tsx test/pr2_durable_migration.test.ts && tsx test/pr2_stats_parity.test.ts && tsx test/pr1_latency_boundary.test.ts && tsx test/pr1_batch_timing.test.ts && tsx test/pr1_limiter.test.ts && tsx test/pr1_signal_price.test.ts && tsx test/pr1_integration_gaps.test.ts && tsx test/ui_truthfulness.test.ts && tsx test/p0_merge_blockers.test.ts && tsx test/p1_hash_epoch.test.ts && tsx test/pr5_twelve_data_only.test.ts && tsx test/pr8_v3_source_of_truth_fingerprint.test.ts && tsx test/pr8_snapshot_legacy_backward_read.test.ts && tsx test/pr8_legacy_optional_inputs.test.ts && tsx test/pr8_ledger_fingerprint.test.ts && tsx test/pr8_params_centralization.test.ts && tsx test/pr8_params_scores_formulas.test.ts && tsx test/p2_persistence_performance.test.ts && tsx test/p3_live_data_integration.test.ts && tsx test/p4_second_audit.test.ts && tsx test/pr_a_owner_regressions.test.ts && tsx test/strategy_v3_engine.test.ts && npm run test:gate-renumber && tsx test/gate4_pr_b_equivalence.test.ts && tsx test/r8_gate4_compare.test.ts && tsx test/strategy_v3_reachability.test.ts && tsx test/w1b_production_surface.test.ts && tsx test/w2_market_structure_integration.test.ts && tsx test/w3_binary_output.test.ts && tsx test/v3_safety_invariants.test.ts && tsx test/payout_gate.test.ts && tsx test/favorite_registry.test.ts && tsx test/w5w6_modules.test.ts && tsx test/market_hours.test.ts && tsx test/r9_ledger_scan.test.ts && tsx test/provider_scheduler_concurrency.test.ts && tsx test/pr4_telegram_reliability.test.ts && tsx test/pr4_notification_delivery.test.ts && tsx test/r8_backtest_core.test.ts",
    "test:gate-renumber": "node --max-old-space-size=512 --import tsx test/gate_renumber_equivalence.test.ts",
    "dev": "tsx server.ts",
    "build": "vite build && mkdir -p build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=build/server.cjs",
    "start": "node build/server.cjs",
    "clean": "rm -rf dist build server.js",
    "lint": "tsc --noEmit",
    "backtest:r8": "tsx scripts/r8-backtest.ts",
    "storage:recover": "tsx scripts/storage-recover.ts",
    "migrate:v2-ids": "tsx scripts/migrate-v2-ids.ts",
    "verify:legacy-chain": "tsx scripts/verify-legacy-chain.ts",
    "engine:fingerprint": "tsx scripts/engine-fingerprint.ts",
    "test:inventory": "tsx scripts/verify-test-inventory.ts",
    "audit:report": "tsx scripts/npm-audit-report.ts"
  },
  "dependencies": {
    "@noble/hashes": "^1.8.0",
    "@vitejs/plugin-react": "^6.1.1",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "nodemailer": "^10.0.10",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "@types/nodemailer": "^8.0.2",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.28.2",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2"
  },
  "engines": {
    "node": ">=22 <25"
  }
}
```
### tsconfig.json (সম্পূর্ণ)

উৎস: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "types": ["vite/client"],
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```
## 10. Test নমুনা এবং framework

আলাদা Jest/Vitest/Mocha dependency নেই। Test-গুলি TypeScript-এ `tsx` দিয়ে চালানো হয়, assertions `node:assert/strict` থেকে; `npm test` একটি sequential aggregate script, সঙ্গে test-inventory checker। নীচে Twelve Data-only contract test সম্পূর্ণ দেওয়া হলো।

### Test sample (সম্পূর্ণ)

উৎস: `test/pr5_twelve_data_only.test.ts`

```ts
import assert from 'node:assert/strict';
import { PROVIDER_ORDER } from '../src/engine/providers/contracts';
import { ProviderAdapterError, requestJson } from '../src/engine/providers/http';
import { TwelveDataAdapter } from '../src/engine/providers/twelveDataAdapter';
import { normalizeCandles } from '../src/engine/providers/normalize';
import { TwelveDataCircuit } from '../src/engine/providers/circuit';
import type { ProviderCandlePayload } from '../src/engine/providers/contracts';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { generateResearchCandles } from './fixtures/marketCandles';

const response = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', date: new Date().toUTCString(), ...headers },
  });

async function httpClassification() {
  const unauthorized = async () => response({ code: 401, message: 'invalid api key' }, 401);
  await assert.rejects(
    requestJson('TWELVE_DATA', unauthorized, new URL('https://api.twelvedata.com/time_series'), new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'CREDENTIAL_INVALID' && error.httpStatus === 401,
  );

  const payloadRateLimit = async () => response({ code: 429, message: 'credits exhausted' }, 200);
  await assert.rejects(
    requestJson('TWELVE_DATA', payloadRateLimit, new URL('https://api.twelvedata.com/time_series'), new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'RATE_LIMITED',
  );

  const serverError = async () => response({ code: 500, message: 'temporarily unavailable' }, 500);
  await assert.rejects(
    requestJson('TWELVE_DATA', serverError, new URL('https://api.twelvedata.com/time_series'), new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'PROVIDER_SERVER_ERROR',
  );
}

async function strictPayloadValidation() {
  const adapter = new TwelveDataAdapter(async () => response({ values: [{ datetime: '2026-10-26 10:00:00', open: '1.1', high: '1.2', low: '1.0', close: '1.1' }] }), 'test-key');
  await assert.rejects(
    adapter.fetchCandles('EUR/USD', '5m', new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && /timezone/i.test(error.message),
  );

  const malformed: ProviderCandlePayload = {
    timezone: 'UTC',
    rows: Array.from({ length: 30 }, (_, i) => ({
      datetime: new Date(Date.UTC(2026, 9, 26, 10, i * 5)).toISOString(),
      open: '1.1', high: '1.0', low: '1.0', close: '1.1',
    })),
  };
  assert.throws(
    () => normalizeCandles(malformed, 'TWELVE_DATA', '5m', false),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'DATA_QUALITY_FAIL',
  );
}

async function historicalRequestCeiling() {
  const urls: URL[] = [];
  const adapter = new TwelveDataAdapter(async (input) => {
    urls.push(new URL(String(input)));
    return response({ values: [{ datetime: '2026-10-26T10:00:00.000Z', open: '1.1', high: '1.2', low: '1.0', close: '1.1' }] });
  }, 'test-key');
  await adapter.fetchHistoricalCandles('EUR/USD', '5m', '2026-10-01', '2026-10-02', new AbortController().signal);
  assert.equal(urls[0]?.searchParams.get('outputsize'), '4500');

  const truncated = new TwelveDataAdapter(async () => response({
    values: Array.from({ length: 4500 }, (_, i) => ({ datetime: new Date(Date.UTC(2026, 9, 1, 0, i * 5)).toISOString(), open: '1.1', high: '1.2', low: '1.0', close: '1.1' })),
  }), 'test-key');
  await assert.rejects(
    truncated.fetchHistoricalCandles('EUR/USD', '5m', '2026-10-01', '2026-10-02', new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'HISTORICAL_TRUNCATED',
  );
}

async function circuitSemantics() {
  let now = Date.parse('2026-10-26T10:00:10.000Z');
  const manager = new TwelveDataCircuit(() => now);
  await assert.rejects(manager.execute(async () => {
    throw new ProviderAdapterError('TWELVE_DATA', 'RATE_LIMITED', 'limited');
  }));
  const retryAt = Date.parse(manager.snapshot().retryAt!);
  assert.equal(new Date(retryAt).getUTCSeconds(), 0);
  assert.equal(new Date(retryAt).getUTCMinutes(), 1);

  manager.reset();
  await assert.rejects(manager.execute(async () => {
    throw new ProviderAdapterError('TWELVE_DATA', 'PROVIDER_TIMEOUT', 'timed out');
  }));
  const timeoutFailures = manager.snapshot().consecutiveFailures;
  manager.reset();
  await assert.rejects(manager.execute(async () => {
    throw new ProviderAdapterError('TWELVE_DATA', 'OPERATOR_ABORT', 'operator stopped');
  }));
  assert.equal(manager.snapshot().consecutiveFailures, 0);
  assert.ok(timeoutFailures > 0);
}

function resultInput(candles: ReturnType<typeof generateResearchCandles>) {
  return { candles, htfBias: 'BULLISH' as const, newsEvents: [], newsSourceOnline: true, timeframe: '15m' as const };
}

function newsIsManualAndNonBlocking() {
  const candles = generateResearchCandles(60, 1.085, '15m');
  const offline = evaluateStrategyV3({ ...resultInput(candles), newsSourceOnline: false });
  const online = evaluateStrategyV3(resultInput(candles));
  const highImpact = evaluateStrategyV3({
    ...resultInput(candles),
    newsEvents: [{ id: 'n', title: 'NFP', currency: 'USD', impact: 'HIGH', timestamp: candles.at(-1)!.timestamp }],
  });
  assert.equal(offline.binarySignal, online.binarySignal);
  assert.equal(offline.operationalGuards[0]?.status, 'PASS');
  assert.equal(highImpact.operationalGuards[0]?.status, 'PASS');
  for (const result of [offline, online, highImpact]) {
    const stage18 = result.stages.find((stage) => stage.stageNumber === 18);
    assert.equal(stage18?.available, true);
    assert.equal(stage18?.passed, true);
    assert.match(stage18?.telemetry || '', /NOT CHECKED/);
  }
}

assert.deepEqual(PROVIDER_ORDER, ['TWELVE_DATA']);
await httpClassification();
await strictPayloadValidation();
await historicalRequestCeiling();
await circuitSemantics();
newsIsManualAndNonBlocking();
console.log('[pr5_twelve_data_only] RED/GREEN contract suite completed');
```
## 11. Reconnect/backfill/retry logic

- **Reconnect:** প্রযোজ্য WebSocket connection নেই; persistent stream reconnect loop-ও নেই। Provider হলো HTTP request. HTTP request timeout/abort/status normalize হয়; circuit breaker RATE_LIMITED হলে পরবর্তী UTC মিনিট, daily quota হলে পরবর্তী UTC midnight, timeout/server/unavailable হলে 60 সেকেন্ড cooldown ধরে।
- **Live scan retry:** `ScanService.runAutoCycle()` retryable failure (যেমন latest closed candle missing, HTTP/provider error, stale data, rate limit, quote unavailable, data quality) হলে initial attempt-এর পর 1s/2s/3s delay-তে সর্বোচ্চ 3 retry করে; budget ও cancellation gate বজায় থাকে। এটি historical candle gap পূরণ করে না।
- **Historical backfill:** R8-র জন্য explicit start/end UTC date দিয়ে Twelve Data historical time_series request; end date `23:59:59`, `outputsize=4500`; 4,500 rows হলে truncated বলে reject করে; পরে requested date window-তে filter ও minimum 25 candles যাচাই হয়। এটি arbitrary missing live scan-এর automatic replay নয়। Startup-এ scan-gap detect করে ledger/Telegram warning দেয়—missed scans retrospectively execute/backfill করে না।

### Historical endpoint adapter method (সম্পূর্ণ)

উৎস: `src/engine/providers/twelveDataAdapter.ts:58-75`

```ts
  public async fetchHistoricalCandles(pair: string, timeframe: Timeframe, startDate: string, endDateInclusive: string, signal: AbortSignal): Promise<ProviderCandlePayload> {
    if (!this.isConfigured()) throw new ProviderAdapterError(this.id, 'PROVIDER_NOT_CONFIGURED', 'Twelve Data key is not configured.');
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', pair);
    url.searchParams.set('interval', INTERVAL[timeframe]);
    // Keep every request below the PR-5 provider truncation boundary.
    url.searchParams.set('outputsize', '4500');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('order', 'asc');
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDateInclusive);
    const response = await requestJson(this.id, this.request, url, signal, { Authorization: `apikey ${this.apiKey}` });
    const payload = response.payload as any;
    if (Array.isArray(payload?.values) && payload.values.length >= 4500) {
      throw new ProviderAdapterError(this.id, 'HISTORICAL_TRUNCATED', 'Twelve Data returned the historical output cap; reduce the date range and retry.');
    }
    return { ...this.parsePayload(payload, response.serverDate), creditsUsed: response.creditsUsed, creditsLeft: response.creditsLeft };
  }
```
### Historical window validation/filter (manager method excerpt)

উৎস: `src/engine/dataProviders.ts:236-252`

```ts
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
```
### Auto scan retry constants and loop

উৎস: `src/engine/scanScheduler.ts:25-27, 303-309`

```ts
export const RETRY_BACKOFF_MS = [1_000, 2_000, 3_000];
const PAIR_RE = /^[A-Z]{6}$/;
const RETRYABLE_SCAN_FAILURE = /LATEST_CLOSED_CANDLE_MISSING|PROVIDER_HTTP_ERROR|PROVIDER_ERROR|PROVIDER_UNAVAILABLE|PROVIDER_API_ERROR|STALE_MARKET_DATA|RATE_LIMITED|QUOTE_UNAVAILABLE|DATA_QUALITY_FAIL/;
      let result = await this.scanPair(pair, timeframe, 'AUTO', shouldContinue);
      for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length && RETRYABLE_SCAN_FAILURE.test(result.reason) && this.deps.autoBudgetRemaining() >= 1; attempt++) {
        if (!shouldContinue()) break;
        await sleep(RETRY_BACKOFF_MS[attempt]);
        if (!shouldContinue()) break;
        result = await this.scanPair(pair, timeframe, 'AUTO', shouldContinue);
      }
```
## 12. অসম্পূর্ণ, অস্পষ্ট বা সম্ভাব্য সমস্যাযুক্ত অংশ

1. **Feed semantics:** “exchange” বললে বিভ্রান্তি হতে পারে—কোড Twelve Data REST vendor-কে চেনে, নির্দিষ্ট exchange/venue নয়। Order-flow/footprint বা aggressor-side দাবি সমর্থন করার মতো aggTrade/buyer-maker data নেই।
2. **No live stream:** server polling/closed-candle fetch model; WebSocket kline/aggTrade ও reconnect/backfill stream architecture নেই। `dataProviders.ts`-এ `streamReady=false` স্পষ্ট।
3. **No actual Trade model:** production market trade entity নেই; `R8Trade` কেবল গবেষণা/backtest result row, `TradeTakenPayload` broker-entry observation। Automated order execution নেই।
4. **Volume/order-flow availability:** Candle volume `number | null`, volumeDelta/CVD optional; live adapter normalization OHLCV-র বেশি enrich করে না। তাই FULL mode প্রয়োজনীয় real volume/delta পায় কিনা provider-specific contract-এ সীমাবদ্ধ/অনুপস্থিত; code fail-closed behaviour যোগ করে, কিন্তু aggressor-side বানায় না।
5. **Chart সীমা:** chart শুধু persisted signal snapshot-এর 40 candles; interactive third-party chart, live quote/chart subscription বা complete market-history chart নয়।
6. **Historical cap:** Twelve Data response 4,500 candle cap ছুঁলেই reject করে; report/command-কে range ছোট করতে হবে। R8 fetcher-এ range-chunking থাকলেও adapter cap-এর মধ্যে থাকা জরুরি। Live scan gap warning দেয়, পুরনো missing signal auto-recompute করে না।
7. **Supported symbol policy:** `isSupportedPair` regex 6 uppercase letters-এ সীমিত, favorites তালিকা আলাদা; এর ফলে provider-supported হলেও সব instrument নেওয়া যাবে না, আবার regex নিজে actual provider symbol validity যাচাই করে না।
8. **No tests/libs typed explicitly:** Jest/Vitest config নেই; test script সরাসরি দীর্ঘ shell command-এ test তালিকা রাখে। Inventory checker omissions ধরতে সাহায্য করে, কিন্তু test process setup/integration runner ecosystem minimal/custom।
9. **Potential dead/no-op initializer:** `server.ts`-এর `seedInitialCandidatesIfEmpty()` বিদ্যমান candidates থাকলে return করে, আর empty হলে body-তে seed action নেই; নাম seed বোঝালেও বাস্তবে seed করে না।
10. **Startup external probes:** startup self-check provider quote, repository visibility ও Telegram probe করতে পারে; এটি test/dev/local offline startup-এ configuration-dependent failure/degraded behaviour ঘটাতে পারে।
11. **Signal/result semantics:** signal ledger এবং candidates JSON আলাদা persistence paths; source-of-truth হিসেবে ledger stats ব্যবহার, tracker legacy/UI compatibility-তে থাকে—দুই store reconcile না করলে operators-দের আলাদা data views বোঝা দরকার।
12. **Status/health distinction:** `/health` কেবল boot self-check snapshot/UTC time দেয়; richer provider, scanner, payout/self-check operational state `/status` protected endpoint-এ। Monitoring integration-এ এটি স্পষ্ট হওয়া দরকার।

এগুলো source-reading observations, runtime/live provider verification নয়। Scope-এর বাইরে থাকা security/quality conclusions এখানে করা হয়নি।

## Snapshot integrity

এ রিপোর্ট তৈরি করতে project source পরিবর্তন করা হয়নি। Full `server.ts` companion copy-এর লাইনসংখ্যা source snapshot অনুযায়ী 1,107। Checkout-এ দেখা commit `8df877c`; কোনো live provider/Telegram request এই review-র জন্য চালানো হয়নি।
