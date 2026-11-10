# PR-8 Numeric Parameter Inventory

Captured from the frozen PR-8 starting point before centralization. This inventory records current values and ownership; it does not authorize changing any value.

## Rules for centralization

Values classified as `FROZEN_STRATEGY` must move behind a typed parameter source without changing their value, comparison operator, rounding, or formula. They remain part of the canonical V3 configuration hash. `OPERATIONAL_CONFIG` values may be centralized separately, but remain operational controls and must not be silently added to the strategy-rule hash. `IMPLEMENTATION/SCHEMA` values are mechanics, serialization limits, or display precision and are not strategy thresholds.

The proposed central module is `src/engine/params.ts`. The first implementation must preserve the existing public exports (`MFCI_THRESHOLD`, `MIN_ENGINE_CANDLES`, and any test-facing constants) as compatibility aliases where tests or downstream readers depend on them.

## Frozen strategy parameters

| ID | Current value | Current source | Use | Class | Planned canonical key |
|---|---:|---|---|---|---|
| S-01 | 30 candles | `src/engine/strategyV3Engine.ts:51`, manifest `minimum_candles` | Minimum engine input | FROZEN_STRATEGY | `engine.minimumCandles` |
| S-02 | 120 candles | `strategyV3Engine.ts:52`, manifest `analysis_window` | Analysis window | FROZEN_STRATEGY | `engine.analysisWindow` |
| S-03 | 2 | `strategyV3Engine.ts:53`, manifest `fractal_n` | Symmetric fractal radius / t+2 confirmation | FROZEN_STRATEGY | `structure.fractalN` |
| S-04 | 20 candles | `strategyV3Engine.ts:54`, manifest `event_lookback` | CHoCH/breaker event lookback | FROZEN_STRATEGY | `structure.eventLookback` |
| S-05 | 10 candles | `strategyV3Engine.ts:55`, manifest `sweep_lookback` | Recent liquidity sweep window | FROZEN_STRATEGY | `liquidity.sweepLookback` |
| S-06 | 20 candles | `strategyV3Engine.ts:56`, manifest `pool_lookback` | BSL/SSL pool window | FROZEN_STRATEGY | `liquidity.poolLookback` |
| S-07 | 50 samples | `strategyV3Engine.ts:57`, breaker delta path | FULL breaker delta sample | FROZEN_STRATEGY | `breaker.deltaSample` |
| S-08 | 9 gates | `manifest.ts:195`, strategy gate array | Gate cardinality | FROZEN_STRATEGY | `engine.gateCount` |
| S-09 | 19 stages | `manifest.ts:196`, strategy stage array | Stage cardinality | FROZEN_STRATEGY | `engine.stageCount` |
| S-10 | 0.85 | `strategyV3Engine.ts:50`, manifest `mfci.threshold` | MFCI pass threshold | FROZEN_STRATEGY | `mfci.threshold` |
| S-11 | 0.35 / 0.25 / 0.20 | `strategyV3Engine.ts:424`, manifest `mfci.full_weights` | FULL MFCI weights | FROZEN_STRATEGY | `mfci.fullWeights` |
| S-12 | 0.35 / 0.20 | `strategyV3Engine.ts:424`, manifest `mfci.price_only_weights` | PRICE_ONLY MFCI weights | FROZEN_STRATEGY | `mfci.priceOnlyWeights` |
| S-13 | 14 periods | `strategyV3Engine.ts:151` | ATR14 | FROZEN_STRATEGY | `volatility.atrPeriod` |
| S-14 | 1.5 / 1.2 | `strategyV3Engine.ts:186` | BOS displacement score bands | FROZEN_STRATEGY | `structure.bosDisplacementBands` |
| S-15 | 1.5 × mean | `strategyV3Engine.ts:203-204` | FULL CHoCH volume spike | FROZEN_STRATEGY | `structure.chochVolumeSpikeMultiplier` |
| S-16 | 0.20 ATR | `strategyV3Engine.ts:213` | Minimum FVG gap | FROZEN_STRATEGY | `imbalance.minFvgGapAtr` |
| S-17 | 5 candles | `strategyV3Engine.ts:221` | Recent FVG search tail | FROZEN_STRATEGY | `imbalance.fvgSearchLookback` |
| S-18 | 40 candles | `strategyV3Engine.ts:226`, `340` | IFVG and order-block/reference-zone lookback | FROZEN_STRATEGY | `imbalance.referenceLookback` |
| S-19 | 30 candles | `strategyV3Engine.ts:231` | BPR input window | FROZEN_STRATEGY | `imbalance.bprLookback` |
| S-20 | 0.35 / 0.65 | `strategyV3Engine.ts:259` | FULL POC relative-position acceptance | FROZEN_STRATEGY | `orderBlock.pocRelativeBounds` |
| S-21 | 50 samples | `strategyV3Engine.ts:289-292` | Breaker delta sample minimum | FROZEN_STRATEGY | `breaker.deltaSample` |
| S-22 | 2.0 z | `strategyV3Engine.ts:292`, formula at `295` | Breaker FULL delta z-score | FROZEN_STRATEGY | `breaker.deltaZMinimum` |
| S-23 | 0.10 / 0.05 ATR | `strategyV3Engine.ts:312` | BSL/SSL equality tolerance and merge distance | FROZEN_STRATEGY | `liquidity.poolToleranceAtr` / `poolMergeDistanceAtr` |
| S-24 | 0.80 + touches×0.05, cap 1.0 | `strategyV3Engine.ts:326-327` | Pool stage score | FROZEN_STRATEGY | `liquidity.poolScore` |
| S-25 | 20 candles | `strategyV3Engine.ts:366`, `374-375` | Legacy Gate-4 comparison window and OTE window | FROZEN_STRATEGY/COMPAT | `gate4.legacyWindow` / `ote.window` |
| S-26 | 0.618 / 0.786 | `strategyV3Engine.ts:379`, manifest `ote` | OTE boundaries | FROZEN_STRATEGY | `ote.start` / `ote.end` |
| S-27 | 0.705 and 0.05 span | `strategyV3Engine.ts:380` | OTE sweet spot and tolerance | FROZEN_STRATEGY | `ote.sweetSpot` / `ote.sweetSpotTolerance` |
| S-28 | 0.50 | `strategyV3Engine.ts:386-387`, manifest `wick_ratio_max` | Wick pushback maximum | FROZEN_STRATEGY | `wick.maxRatio` |
| S-29 | 0.20 / 0.35 / 0.50 | `strategyV3Engine.ts:387` | Wick score bands | FROZEN_STRATEGY | `wick.scoreBands` |
| S-30 | 10 periods | `strategyV3Engine.ts:390`, formula at `394` | Momentum body baseline | FROZEN_STRATEGY | `momentum.lookback` |
| S-31 | 0.05 ATR | `strategyV3Engine.ts:391`, formula at `394` | Flat-window threshold | FROZEN_STRATEGY | `momentum.flatStdDevAtr` |
| S-32 | 2.5 / 1.5 z | `strategyV3Engine.ts:394` | Momentum score bands | FROZEN_STRATEGY | `momentum.zScoreBands` |
| S-33 | 30 minutes | `strategyV3Engine.ts:411`, manifest `news_guard` | High-impact news blocking window | FROZEN_STRATEGY | `news.restrictionWindowMinutes` |
| S-34 | 0.35 / 0.25 / 0.20 and divisors 0.55 / 0.80 | `strategyV3Engine.ts:424-426` | MFCI formula normalization | FROZEN_STRATEGY | `mfci.formula` |

Stage score constants such as `.95`, `.90`, `.85`, `.75`, `.70`, `.55`, `.50`, `.45`, `.40`, `.35`, `.30`, `.25`, `.20`, `.15`, and `.10` are also numeric strategy outputs. They must be included in the implementation inventory before extraction because moving only pass/fail thresholds while leaving score bands inline would leave a split parameter source. Their exact stage mapping is preserved by the baseline golden and R8 tests.

## Session and operational configuration

| ID | Current value/source | Use | Class | Centralization rule |
|---|---|---|---|---|
| O-01 | `config/sessions.json` expiry minutes, margins, zones | Entry window and expiry | OPERATIONAL_CONFIG | Keep file-driven; expose typed validated config, do not copy into strategy params |
| O-02 | `src/engine/scanScheduler.ts:19` caps `5m=1`, `15m=4`, `30m=7` | Auto pair cap | OPERATIONAL_CONFIG | Centralize as scheduler policy, preserve 70%/800-day relationship |
| O-03 | `SCAN_DELAY_AFTER_CLOSE_MS=1000` | Post-close scheduling delay | OPERATIONAL_CONFIG | Scheduler params only |
| O-04 | `GENERATION_DEADLINE_MS=15000` | Scan generation deadline | OPERATIONAL_CONFIG | Env override remains supported |
| O-05 | Entry windows `45/60/90` seconds | 5m/15m/30m delivery window | OPERATIONAL_CONFIG | Preserve env overrides and ledger recording |
| O-06 | Retry backoff `1000/2000/3000` ms | Auto scan retry | OPERATIONAL_CONFIG | Scheduler params only |
| O-07 | Rate limits `8/min`, `800/day`, auto `70%`, hard stop `80%` | Provider credit protection | OPERATIONAL_CONFIG | Keep env/config override and audit values in ledger |
| O-08 | `minimumIntervalMs=0` default | Provider scheduler pacing | OPERATIONAL_CONFIG | Do not mix with frozen strategy hash |
| O-09 | `MAX_CLOCK_DRIFT_MS=2000` | Provider clock integrity | OPERATIONAL_CONFIG | Data-integrity policy, separate hash domain |
| O-10 | Provider normalization minimum history `25` | Input data validation | OPERATIONAL_CONFIG | Provider contract, not strategy threshold |
| O-11 | Twelve Data output sizes `130` and `5000` | Provider request sizing | OPERATIONAL_CONFIG | Adapter constant/config, not strategy hash |
| O-12 | Payout minimum `85`, max age `12h` | Signal eligibility and freshness | OPERATIONAL_CONFIG | Preserve `MIN_PAYOUT_PCT` and payout registry behavior |
| O-13 | Ledger pending grace `5000ms`, unresolved after `24h` | Outcome resolution | OPERATIONAL_CONFIG | Ledger/operations policy |
| O-14 | Cache cap `500`, timer floor `1000`, scan gap interval `30000` | Runtime resource behavior | OPERATIONAL_CONFIG | Runtime controls, not V3 strategy hash |

## Implementation/schema constants to exclude from strategy centralization

Time-unit multipliers (`60_000`, `3_600_000`, `86_400_000`), array/index positions, cryptographic hash lengths, HTTP status codes, score clamping bounds `[0,1]`, display precision defaults, and synthetic/test fixture values are not strategy parameters. They may later receive utility names, but must not be inserted into `V3_CONFIG_SNAPSHOT` merely because they are numeric.

## Required red-test assertions before implementation

1. Every `FROZEN_STRATEGY` value resolves to the current value recorded in `V3_CONFIG_SNAPSHOT` or its explicit central equivalent.
2. The canonical config hash remains exactly `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003` before implementation and changes only when the canonical representation intentionally changes.
3. `MFCI_THRESHOLD`, engine minimum candles, Gate 4 mode A/B behavior, R8 golden count, Gate 4 parity, and `v3_safety_invariants` remain unchanged.
4. Operational env overrides continue to take precedence where they do today.
5. No new numeric literal is introduced into the strategy engine for an inventoried parameter after centralization.
