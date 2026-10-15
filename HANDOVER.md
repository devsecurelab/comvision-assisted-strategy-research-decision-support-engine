# ComVision Engine — Handover (EXP-2026-V3-REAL-001)

Date: 2026-10-15 · Branch: `devin/1792101641-v3-p0-p6-real-market-engine` · Base: `5df1a83`

Research alert engine only. No broker execution. Every alert says "Research alert only".

## 1. Package status (P0 → P6)

| Package | Status | Notes |
|---|---|---|
| P0 — Strategy aligned to owner rules M1–M6, N1, N2, N4; fake values removed | **COMPLETE** | `src/engine/strategyV3Engine.ts` rewritten. `src/engine/session.ts` is now the only session/kill-zone implementation (the duplicate in `pipeline.ts` was removed and replaced with a re-export). Unit tests cover pass and fail for every PRICE_ONLY stage, plus DST checks on 2026-03-08, 03-29, 10-25 and 11-01, plus forbidden-pattern grep tests. |
| P1 — Direction set inside the engine from the 1h HTF bias | **COMPLETE** | `evaluateStrategyV3` no longer takes a `direction` argument. Direction comes only from `htfBias`. `deriveHtfBias()` reads closed 1h candles only. An UNCLEAR bias gives NO_TRADE, and an alert against the HTF bias cannot happen (tested). R8 no longer guesses direction from close drift. |
| P2 — Data integrity | **COMPLETE** | `src/engine/dataIntegrity.ts` checks continuity (the weekend/holiday market closure is allowed), OHLC consistency, alignment, duplicates, order and forming candles. Clock drift from the provider `Date` header must stay within 2 s. Any failure gives `DATA_QUALITY_FAIL` / NO_TRADE. |
| P3 — Reachability rewrite (non-circular) | **COMPLETE** | Ideal matrix: 24/24. ≥10,000 windows mutate the setup's own candles with 0.5/1/2/3-pip noise and large-body shocks. Honest random-window marginal and cumulative funnels, for PRICE_ONLY and FULL, BULLISH and BEARISH. No gate is structurally stuck at 0%. Runtime ≈ 47 s (limit 180 s). |
| P4 — R8 backtest rewrite | **CODE COMPLETE — REAL RUN OUTSTANDING** | `scripts/r8-backtest.ts` and `src/engine/r8Backtest.ts`: run through `executeStrategyPipeline`, use causal windows only, fetch date chunks (≤5000 rows each), save CSV + SHA-256 manifest, re-run from verified CSVs, give IS (first 2/3) and OOS (last 1/3) reports, Wilson 95%, breakeven, expectancy, baselines (always CALL/PUT, random, random at signal times), MFCI bands, session/hour breakdown and funnel, with a verdict only when N ≥ 200. **Not run**: this needs the owner's real `TWELVE_DATA_API_KEY` and a historical high-impact news CSV. With no key the runner exits `R8_NOT_RUN` (code 2) and writes nothing. No result has been invented. |
| P5 — R9 scan loop, signal ledger, auto-resolve, `/result` | **CODE COMPLETE — LIVE SOAK OUTSTANDING** | `src/engine/scanScheduler.ts` (candle-close +3 s loop, restart-safe state, favourites in order, payout gate, per-timeframe caps 5m:1 / 15m:4 / 30m:7, explicit `BUDGET_LIMIT`, same-candle cache with no second credit charge, sticky provider failover with the reason kept, `SIGNAL_EXPIRED` after valid_until = entry + 10 s, 3 retries with backoff). `src/engine/signalLedger.ts`: append-only JSONL with a SHA-256 hash chain; a tampered ledger refuses further writes. Auto-resolve uses the provider entry candle. Telegram `/result <id> win|loss|tie|skipped` appends to history. All covered by mocked-provider tests. **Outstanding**: a multi-day live soak in Termux with real keys and Telegram. |
| P6 — `/health`, EDGE_LOST, reports | **CODE COMPLETE — OPERATIONAL EVIDENCE OUTSTANDING** | `src/engine/edgeMonitor.ts`: EDGE_LOST triggers when the Wilson upper bound of the last 50 decisive results falls below breakeven. The state is stored in the ledger and survives restarts. `/resume <written reason>` is required to continue. Daily/weekly reports (`/report`, plus an automatic daily Telegram report). `/health` shows the scan loop, provider, credits, clock drift, news source, ledger integrity and edge state. **Outstanding**: real ledger evidence (≥50 resolved live alerts). |

### Owner confirmation requested
1. **Gate numbering.** The spec fixes only Gate 3 = OB & Breaker and Gate 9 = BSL/SSL target. The rest follows stage order: G1 Structure (S1–S3), G2 Imbalance (S4–S6), G3 OB & Breaker (S7–S8), G4 Sweep (S9), G5 Premium/Discount (S12; OTE S13 counts toward the score only, per §13.2), G6 Wick (S14), G7 Momentum (S15), G8 Session & Kill Zone (S16–S17), G9 BSL/SSL target. The News Guard is a separate Operational Guard (M7). Please confirm.
2. **§13.2 defaults applied from the owner document.** S1 uses a fixed 5-candle fractal (N=2). S2 BOS is a body close beyond the latest confirmed swing (displacement only affects the score). S15 requires the body to exceed the 10-period mean body, and a flat window fails closed. S14 keeps the 0.50 wick limit. ATR-normalised pools are kept. The MFCI weights and the 0.85 threshold are unchanged.
3. **FULL mode** needs real provider volume/delta **and** `ENGINE_FULL_MODE_ENABLED=true`. Twelve Data FX has no volume, so live runs use PRICE_ONLY.

## 2. What changed (summary)
- **Engine (P0/P1):** price-only CHoCH (volume/delta is an extra check in FULL only); IFVG built from a real prior FVG, a body-close inversion and a retest; OB = the last opposite candle before a 3-candle expansion, with FVG confluence (POC in FULL only); Breaker = a real S9 sweep followed by a body-close break of a failed OB (delta z ≥ 2 over 50 bars in FULL only). Gate 3 is restored in PRICE_ONLY. Gate 9 requires an untouched BSL/SSL in front of price. Removed: `pocPrice ?? typical price`, `Liquidity_Sweep_Preceded: 'true'`, the z fallback `1.5`, the spread placeholder, and the hard-coded `|delta| >= 120`.
- **Sessions (N1):** London and New York kill zones run 07:00–10:00 local time. The core session runs from London 07:00 to New York 16:00. Asia (00–06 UTC) is context only. The Tokyo kill zone is removed. All times use IANA zones.
- **Provenance (N4):** the `REPLAY` default became `NOT_LIVE` (the `REPLAY` value is kept in the type only for old stored records).
- **Pipeline:** the V3 path requires a payout (`PAYOUT_UNSET` / `PAYOUT_BELOW_MIN` below 85) and validates data integrity. It passes only candles up to the decision index (zero lookahead) and writes full telemetry (`decision_engine`, `provider`, `poc_label`, `signal_candle_open_ts`, `htf_bias`, MFCI as null rather than 0) on NO_TRADE too.
- **Scheduler:** the hard stop at 80% of the daily quota was added (`DAY_HARD_STOP`), and auto-scans keep their 70% cap. Auto-scans use `consume('AUTO')`.
- **Server wiring (minimal):** `server.ts` creates the ledger, scan service and loop. The manual scan route uses the same service and no longer uses hard-coded tick-pressure values or overwrites the signal time. Telegram command polling runs every 10 s; set `TELEGRAM_COMMAND_POLLING=false` to turn it off. Chat IDs are no longer written to audit or notification logs.
- **Bug fixed:** the Telegram poll saved an old copy of settings and silently erased `/payout` and `/fav` changes made in the same poll.
- **Telegram:** `/scan <pair> [tf]`, `/result`, `/health`, `/resume`, `/report [daily|weekly]` and `/autoscan on|off [tf]` were added. The alert text was rewritten: no fake defaults, no SL/TP, and "Research alert only".

### New environment variables (Termux `.env`; keys never in logs or URLs)
`ENGINE_FULL_MODE_ENABLED` (default false) · `AUTO_SCAN_ENABLED` (default false) · `AUTO_SCAN_TIMEFRAME` (5m/15m/30m, default 15m) · `TELEGRAM_COMMAND_POLLING` · `TELEGRAM_POLL_MS` · `SIGNAL_LEDGER_PATH` (default `data/signal-ledger.jsonl`) · R8: `R8_PAIRS`, `R8_TIMEFRAMES`, `R8_START_DATE`, `R8_END_DATE`, `R8_PAYOUT_PCT`, `R8_NEWS_CSV` (or `R8_ALLOW_NO_NEWS=1` for a labelled ablation), `R8_CSV_INPUT_DIR`, `R8_OUTPUT_DIR`.

### How to run R8 (owner)
```
TWELVE_DATA_API_KEY=... R8_START_DATE=2025-01-01 R8_END_DATE=2025-06-30 R8_PAYOUT_PCT=87 \
R8_NEWS_CSV=./news-2025H1.csv R8_PAIRS=EUR/USD,GBP/USD npm run backtest:r8
```

## 3. Files not changed (confirmed by `git diff --name-only`)
`src/components/**`, `src/App.tsx`, all CSS, the Settings page, auth/user management (`src/server/auth.ts`, `src/server/storage.ts`), docs/legal pages, `users.json` / `data/*`, and Telegram/email configuration data are untouched. `package.json`: only the `test` script changed; there are no new dependencies. Changed files:
```
package.json
scripts/r8-backtest.ts
server.ts
src/engine/dataIntegrity.ts
src/engine/dataProviders.ts
src/engine/edgeMonitor.ts
src/engine/pipeline.ts
src/engine/r8Backtest.ts
src/engine/rateLimitScheduler.ts
src/engine/scanScheduler.ts
src/engine/session.ts
src/engine/signalLedger.ts
src/engine/strategyV3Engine.ts
src/engine/types.ts
src/server/notificationService.ts
test/fixtures/v3Reachability.ts
test/payout_gate.test.ts
test/r8_backtest_core.test.ts
test/r9_ledger_scan.test.ts
test/strategy_pipeline.test.ts
test/strategy_v3_engine.test.ts
test/strategy_v3_reachability.test.ts
test/v3_safety_invariants.test.ts
test/w2_market_structure_integration.test.ts
test/w3_binary_output.test.ts
test/w5w6_modules.test.ts
```

## 4. `git diff --stat` (raw)
```
package.json                                 |   2 +-
 scripts/r8-backtest.ts                       | 152 ++++-----
 server.ts                                    | 145 ++++-----
 src/engine/dataIntegrity.ts                  |  97 ++++++
 src/engine/dataProviders.ts                  |  29 +-
 src/engine/edgeMonitor.ts                    |  92 ++++++
 src/engine/pipeline.ts                       | 154 +++++----
 src/engine/r8Backtest.ts                     | 173 ++++++++++
 src/engine/rateLimitScheduler.ts             |  10 +-
 src/engine/scanScheduler.ts                  | 290 +++++++++++++++++
 src/engine/session.ts                        | 119 ++++---
 src/engine/signalLedger.ts                   | 130 ++++++++
 src/engine/strategyV3Engine.ts               | 457 +++++++++++++++++++++++----
 src/engine/types.ts                          |  23 +-
 src/server/notificationService.ts            | 201 ++++++------
 test/fixtures/v3Reachability.ts              |  78 +++--
 test/payout_gate.test.ts                     |  29 ++
 test/r8_backtest_core.test.ts                |  38 +++
 test/r9_ledger_scan.test.ts                  | 170 ++++++++++
 test/strategy_pipeline.test.ts               |  12 +-
 test/strategy_v3_engine.test.ts              | 125 ++++++--
 test/strategy_v3_reachability.test.ts        | 173 +++++-----
 test/v3_safety_invariants.test.ts            |  97 ++++++
 test/w2_market_structure_integration.test.ts |  96 +++---
 test/w3_binary_output.test.ts                |  50 +--
 test/w5w6_modules.test.ts                    |  13 +
 26 files changed, 2294 insertions(+), 661 deletions(-)
```

## 5. Raw command output
### `npm run lint`
```
> react-example@0.0.0 lint
> tsc --noEmit

EXIT 0
```
### `npm run build`
```
> react-example@0.0.0 build
> vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

vite v8.3.0 building client environment for production...
transforming...
✓ 2096 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                            0.13 kB
dist/manifest.webmanifest                     0.52 kB
dist/index.html                               1.72 kB │ gzip:   0.62 kB
dist/assets/index-Bu0QUx80.css               37.48 kB │ gzip:   7.09 kB
dist/assets/hash-CCb_jRRe.js                  0.28 kB │ gzip:   0.18 kB
dist/assets/RiskView-BOGo_bnd.js              2.67 kB │ gzip:   1.03 kB
dist/assets/AuditLogView-mvPGn_2A.js          2.74 kB │ gzip:   1.08 kB
dist/assets/NewsGuardView-BpLaFDqs.js         3.52 kB │ gzip:   1.30 kB
dist/assets/AnalyticsView-BwgFfKM-.js         3.67 kB │ gzip:   1.12 kB
dist/assets/UserManagementView-DEHd_zI8.js    4.34 kB │ gzip:   1.47 kB
dist/assets/TermsView-D3UF5DRG.js             6.70 kB │ gzip:   2.42 kB
dist/assets/AboutView-f0hNq9Eb.js             7.53 kB │ gzip:   2.65 kB
dist/assets/SecurityView-Cnf0I78R.js          7.95 kB │ gzip:   2.38 kB
dist/assets/ExperimentView-Bmjvigro.js        8.75 kB │ gzip:   2.63 kB
dist/assets/PrivacyView-CydkA955.js          10.00 kB │ gzip:   2.84 kB
dist/assets/TelegramAdminTool-C-MPBVk_.js    14.23 kB │ gzip:   3.68 kB
dist/assets/SettingsView-DbMF1MID.js         15.07 kB │ gzip:   3.99 kB
dist/assets/DocsView-c4_ZsNX4.js             59.83 kB │ gzip:  13.00 kB
dist/assets/index-Cb-I3tlp.js               467.40 kB │ gzip: 138.24 kB

✓ built in 1.13s

PWA v1.3.0
mode      generateSW
precache  29 entries (653.79 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js

  dist/server.cjs      270.0kb
  dist/server.cjs.map  499.5kb

⚡ Done in 19ms
EXIT 0
```
### `npm test`
```
> react-example@0.0.0 test
> tsx test/strategy_v3_engine.test.ts && tsx test/strategy_v3_reachability.test.ts && tsx test/w1b_production_surface.test.ts && tsx test/w2_market_structure_integration.test.ts && tsx test/w3_binary_output.test.ts && tsx test/v3_safety_invariants.test.ts && tsx test/payout_gate.test.ts && tsx test/favorite_registry.test.ts && tsx test/w5w6_modules.test.ts && tsx test/r9_ledger_scan.test.ts && tsx test/r8_backtest_core.test.ts && npm run test:legacy

=== V3 ENGINE UNIT TESTS: every PRICE_ONLY stage pass/fail, HTF-owned direction, fail-closed data passed ===
[REACHABILITY] ideal matrix: 24/24 combinations alert (PRICE_ONLY/FULL x 5m/15m/30m x EUR/JPY scale x BULLISH/BEARISH)
[ROBUSTNESS] PRICE_ONLY 5m EUR/USD BULLISH: 0.5pip 102/110 | 1pip 73/110 | 2pip 32/110 | 3pip 24/110
[ROBUSTNESS] PRICE_ONLY 5m EUR/USD BEARISH: 0.5pip 99/110 | 1pip 61/110 | 2pip 40/110 | 3pip 34/110
[ROBUSTNESS] PRICE_ONLY 5m USD/JPY BULLISH: 0.5pip 104/110 | 1pip 68/110 | 2pip 32/110 | 3pip 23/110
[ROBUSTNESS] PRICE_ONLY 5m USD/JPY BEARISH: 0.5pip 101/110 | 1pip 71/110 | 2pip 30/110 | 3pip 20/110
[ROBUSTNESS] PRICE_ONLY 15m EUR/USD BULLISH: 0.5pip 98/110 | 1pip 76/110 | 2pip 22/110 | 3pip 20/110
[ROBUSTNESS] PRICE_ONLY 15m EUR/USD BEARISH: 0.5pip 102/110 | 1pip 67/110 | 2pip 29/110 | 3pip 23/110
[ROBUSTNESS] PRICE_ONLY 15m USD/JPY BULLISH: 0.5pip 101/110 | 1pip 73/110 | 2pip 34/110 | 3pip 26/110
[ROBUSTNESS] PRICE_ONLY 15m USD/JPY BEARISH: 0.5pip 102/110 | 1pip 76/110 | 2pip 30/110 | 3pip 35/110
[ROBUSTNESS] PRICE_ONLY 30m EUR/USD BULLISH: 0.5pip 96/110 | 1pip 71/110 | 2pip 33/110 | 3pip 22/110
[ROBUSTNESS] PRICE_ONLY 30m EUR/USD BEARISH: 0.5pip 101/110 | 1pip 70/110 | 2pip 28/110 | 3pip 24/110
[ROBUSTNESS] PRICE_ONLY 30m USD/JPY BULLISH: 0.5pip 97/110 | 1pip 77/110 | 2pip 39/110 | 3pip 26/110
[ROBUSTNESS] PRICE_ONLY 30m USD/JPY BEARISH: 0.5pip 97/110 | 1pip 70/110 | 2pip 27/110 | 3pip 22/110
[ROBUSTNESS] FULL 5m EUR/USD BULLISH: 0.5pip 90/110 | 1pip 48/110 | 2pip 13/110 | 3pip 11/110
[ROBUSTNESS] FULL 5m EUR/USD BEARISH: 0.5pip 88/110 | 1pip 57/110 | 2pip 12/110 | 3pip 5/110
[ROBUSTNESS] FULL 5m USD/JPY BULLISH: 0.5pip 95/110 | 1pip 46/110 | 2pip 16/110 | 3pip 13/110
[ROBUSTNESS] FULL 5m USD/JPY BEARISH: 0.5pip 88/110 | 1pip 48/110 | 2pip 12/110 | 3pip 11/110
[ROBUSTNESS] FULL 15m EUR/USD BULLISH: 0.5pip 93/110 | 1pip 44/110 | 2pip 19/110 | 3pip 5/110
[ROBUSTNESS] FULL 15m EUR/USD BEARISH: 0.5pip 89/110 | 1pip 54/110 | 2pip 15/110 | 3pip 5/110
[ROBUSTNESS] FULL 15m USD/JPY BULLISH: 0.5pip 97/110 | 1pip 56/110 | 2pip 8/110 | 3pip 6/110
[ROBUSTNESS] FULL 15m USD/JPY BEARISH: 0.5pip 99/110 | 1pip 46/110 | 2pip 16/110 | 3pip 8/110
[ROBUSTNESS] FULL 30m EUR/USD BULLISH: 0.5pip 98/110 | 1pip 65/110 | 2pip 15/110 | 3pip 6/110
[ROBUSTNESS] FULL 30m EUR/USD BEARISH: 0.5pip 95/110 | 1pip 54/110 | 2pip 10/110 | 3pip 7/110
[ROBUSTNESS] FULL 30m USD/JPY BULLISH: 0.5pip 93/110 | 1pip 49/110 | 2pip 15/110 | 3pip 10/110
[ROBUSTNESS] FULL 30m USD/JPY BEARISH: 0.5pip 99/110 | 1pip 52/110 | 2pip 11/110 | 3pip 10/110
[ROBUSTNESS] total 4730/10560 alerts across seeded noise 0.5/1/2/3 pip with large-body shocks
[FUNNEL] random PRICE_ONLY BULLISH: marginal=16.6%,42.7%,50.7%,53.9%,49.8%,84.9%,43.9%,61.1%,85.7% cumulative=16.6%,12.0%,9.2%,3.5%,0.1%,0.1%,0.1%,0.1%,0.1% alerts=3/6000
[FUNNEL] random PRICE_ONLY BEARISH: marginal=16.6%,42.9%,51.4%,54.0%,49.6%,85.7%,44.4%,58.6%,85.0% cumulative=16.6%,12.0%,9.4%,3.5%,0.1%,0.1%,0.1%,0.1%,0.1% alerts=3/6000
[FUNNEL] random FULL BULLISH: marginal=1.1%,42.4%,12.5%,27.1%,49.5%,84.7%,44.3%,59.8%,85.6% cumulative=1.1%,0.9%,0.1%,0.0%,0.0%,0.0%,0.0%,0.0%,0.0% alerts=0/6000
[FUNNEL] random FULL BEARISH: marginal=1.1%,42.1%,12.2%,27.4%,50.0%,85.2%,45.7%,59.3%,85.3% cumulative=1.1%,0.8%,0.2%,0.1%,0.0%,0.0%,0.0%,0.0%,0.0% alerts=0/6000
[REACHABILITY] runtime 43.3s
=== V3 REACHABILITY SUITE (P3): ideal matrix, own-candle mutation >= 10k windows, honest random-window funnels passed ===
=== W1b PRODUCTION SURFACE TEST: simulation, replay selector, and Vision mock surfaces removed ===
=== W2 MARKET STRUCTURE INTEGRATION: IFVG/BPR/POC, owner DST sessions (4 transition dates) and scale invariance passed ===
=== W3 BINARY OUTPUT: CALL/PUT/NO_TRADE, full telemetry incl. NO_TRADE, payout boundary, NOT_LIVE, no SL/TP passed ===
[same_candle_determinism] PASS
[decision_candle_always_closed] PASS
[zero_lookahead] PASS
[scale_invariance] PASS
[price_only_no_zero_fill] PASS
[data_integrity] PASS
[forbidden_patterns] PASS
=== V3 SAFETY INVARIANTS: determinism, closed candle, zero lookahead, scale, no zero-fill, data integrity, grep passed ===
=== PAYOUT GATE: unset, 84.9, 85, normalization, persistence and validation passed ===
=== PAYOUT AUTH: owner-only commands, payout validation, no chat IDs in audit passed ===
=== FAVORITES: seed, add/remove normalization and restart persistence passed ===
=== W5/W6 MODULES: Wilson confidence, verdict, durable token bucket and budget limits passed ===
=== W6 BUDGET: 70% auto budget and 80% hard stop passed ===
[ledger_tamper] PASS
[edge_lost_and_report] PASS
[scan_payout_and_same_candle] PASS
[scheduler_budget_auto_cycle] PASS
[auto_resolve_and_result] PASS
[failover_and_expiry] PASS
[edge_pause_resume] PASS
[restart_safe_loop] PASS
=== R9 LEDGER/SCAN/RESOLVE/EDGE: tamper, payout, same candle, budget, resolve, /result, failover, expiry, EDGE_LOST, restart passed ===
=== R8 CORE: live pipeline, causal walk-forward, OOS/IS, baselines, N>=200 verdict rule, CSV+SHA-256, pagination, R8_NOT_RUN passed ===

> react-example@0.0.0 test:legacy
> LEGACY_V2_FIXTURES=1 tsx test/strategy_pipeline.test.ts

[AuthService] Bootstrapped initial admin: admin@devsecure.engine. Credentials saved securely to data/.admin_bootstrap_secret
=== RUNNING COMVISION ENGINE DETERMINISTIC TEST SUITE ===

[PASS] Test 1: REPLAY provenance is INCONCLUSIVE and cannot emit an alert
[PASS] Test 2: Stage 1 - 5-candle symmetric fractal swing high/low confirmed strictly at Close of t+2
[PASS] Test 3: Stage 1 - Structure evaluates BULLISH, BEARISH or UNCLEAR correctly
[PASS] Test 4: Stage 2 - Bullish FVG mathematical zone defined as [High(C1), Low(C3)]
[PASS] Test 5: Stage 2 - FVG mitigation state tracking
[PASS] Test 6: Stage 2 - Order Block detection and confluence validation
[PASS] Test 7: Stage 3 - Bullish 3-candle expansion breakout validation
[PASS] Test 8: Stage 3 - Rejection if C3 closes back inside C1 boundary
[PASS] Test 9: Stage 4 - TICK_ACTIVITY_PROXY accepts ascending or above 10-period average
[PASS] Test 10: Stage 4 - Low tick activity proxy triggers deterministic REJECT
[PASS] Test 11: Stage 5 - Pushback wick ratio > 0.50 triggers REJECT ("Wick Fakeout")
[PASS] Test 12: Stage 5 - Sweeping prior swing high without closing above triggers SWEEP_DETECTED
[PASS] Test 13: Stage 6 - Inside candle recognized without resetting pattern sequence
[PASS] Test 14: Stage 7 - Bullish FVG must lie strictly below Fib 50% Equilibrium Level
[PASS] Test 15: Stage 8 - High-impact red-folder event within +/- 30m window triggers REJECT
[PASS] Test 16: Stage 8 - News source offline triggers INCONCLUSIVE ("Never assume no news = clear")
[PASS] Test 17: Stage 9 - Pressure observation is non-filtering and strictly categorical (no percentages)
[PASS] Test 18: Access Control - Authorization status lifecycle (PENDING / APPROVED / SUSPENDED / REVOKED)
[PASS] Test 19: Exact Boundary - Wick pushback ratio <= 0.500 PASS vs > 0.500 REJECT ("Wick Fakeout")
[PASS] Test 20: Exact Boundary - Bullish FVG strictly below Fib 50% PASS vs touching/above Fib 50% REJECT
[PASS] Test 21: Stage 3 Negative Boundary - Close(C3) exactly equal to High(C1) fails expansion (> High(C1))
[PASS] Test 22: Vision fields are absent and cannot influence data quality
[PASS] Test 23: Data Quality Fail-Safe - Zero range flat candle triggers DEGRADED + INCONCLUSIVE
[PASS] Test 24: Master Telemetry Completeness - All Section 6 schema fields populated without omission
[PASS] Test 25: Master Telemetry SHA-256 Hash Chain - Sequential verification and tamper detection
[PASS] Test 26: EXP-2026-001 Scope Freeze - Blocks parameter modification attempts during locked experiment
[PASS] Test 27: Server-Side Auth - 401 Unauthorized for missing, invalid, or expired tokens
[PASS] Test 28: Server-Side Auth - 403 Forbidden on PENDING, SUSPENDED, and REVOKED accounts
[PASS] Test 29: Server-Side Role Separation - Analyst role blocked from user administration
[PASS] Test 30: Session Revocation & Quick Demo - Logout destroys session; Quick Demo requires server auth
[PASS] Test 31: Stage 2 - Bearish FVG formation zone strictly defined as [High(C3), Low(C1)]
[PASS] Test 32: Stage 2 - Bearish FVG mitigation transitions: PARTIAL_FILL on retest, COMPLETELY_FILLED on invalidation
[PASS] Test 33: Stage 2 - Bearish OB + FVG confluence: (Low(C1) >= Low(Cob) || fvgTop >= Low(Cob)) && High(C3) < High(Cob)
[PASS] Test 34: Stage 3 - Bearish 3-Candle breakout: Close(C3) < Low(C1) PASS vs Close(C3) >= Low(C1) REJECT
[PASS] Test 35: Stage 5 - Bearish lower-wick pushback ratio <= 0.500 PASS vs > 0.500 REJECT ("Wick Fakeout")
[PASS] Test 36: Stage 5 - Bearish prior-swing-low liquidity sweep: Low(C3) < SL_n && Close(C3) >= SL_n triggers SWEEP_DETECTED
[PASS] Test 37: Stage 7 - Bearish Fib50 Premium rule: FVG Bottom > Fib50 PASS_PREMIUM vs FVG Bottom <= Fib50 REJECT
[PASS] Test 38: Scope Freeze - Rejection of maxWickRatio mutation under locked EXP-2026-001
[PASS] Test 39: Scope Freeze - Rejection of fibEquilibriumLevel mutation under locked EXP-2026-001
[PASS] Test 40: Scope Freeze - Rejection of timeframe/threshold mutation under locked EXP-2026-001
[PASS] Test 41: Persistence - DurableStorage saves and loads candidates surviving re-instantiation
[PASS] Test 42: Persistence - DurableStorage saves and loads user accounts surviving re-instantiation
[PASS] Test 43: Persistence - DurableStorage saves and loads session tokens surviving re-instantiation
[PASS] Test 44: Persistence - DurableStorage saves and loads experiment state & hash chain surviving re-instantiation
[PASS] Test 45: Credential Security - Zero hardcoded cleartext production passwords in auth service
[PASS] Test 46: Credential Security - Secure bootstrap admin generated via environment or private entropy
[PASS] Test 47: Notification Payload - Message #1 Valid Signal Alert format contains all required fields
[PASS] Test 48: Notification Payload - Message #2 Next-Candle Result Alert format contains all required fields
[PASS] Test 49: Notification Delivery Status - Signal Alert tracks Telegram & Email delivery states
[PASS] Test 50: Notification Safety - Notification failure does NOT invalidate candidate decision or alter experiment stats
[PASS] Test 51: Notification Manual Test - sendTestNotification() handles unconfigured channels gracefully
[PASS] Test 52: Next-Candle Result - Bullish signal: next candle close > open resolves to NEXT_CANDLE_FAVORABLE
[PASS] Test 53: Next-Candle Result - Bullish signal: next candle close <= open resolves to NEXT_CANDLE_UNFAVORABLE or NEUTRAL
[PASS] Test 54: Next-Candle Result - Bearish signal: next candle close < open resolves to NEXT_CANDLE_FAVORABLE
[PASS] Test 55: Next-Candle Result - User Action NOT_TAKEN does NOT alter NEXT_CANDLE_FAVORABLE research outcome
[PASS] Test 56: Research History - Analytics engine computes accurate WIN/LOSS/TAKEN/NOT_TAKEN counts
[PASS] Test 57: Research History - Analytics engine filters by pair (e.g. NQ vs ES) accurately
[PASS] Test 58: Date Boundary - Natural language date parser handles Bengali & English date ranges
[PASS] Test 59: Chat Assistant - Strategy mutation attempt is strictly blocked with frozen explanation
[PASS] Test 60: Chat Assistant - Market condition query executes deterministic Strategy v1.0 pipeline without hallucination
[PASS] Test 61: Chat Assistant - Bengali historical queries return verified counts
[PASS] Test 62: Audit Log Linkage - Every signal, outcome, notification, and chat event shares the authoritative setup_id
[PASS] Test 63: Telegram Updates - Handles unconfigured bot token safely without exposing secrets
[PASS] Test 64: Telegram Updates - Correctly parses Telegram /start message update and extracts user Chat ID
[PASS] Test 65: Telegram Chat ID - setTelegramChatId updates active target and persists in storage
[PASS] Test 66: Telegram Security - Error sanitizer strips bot token from API failure messages
[PASS] Test 67: Telegram Test Alert - Returns status DISABLED when Chat ID or bot token is missing
[PASS] Test 68: Telegram Test Alert - Verifies successful dispatch and zero token leakage on error
[PASS] Test 69: Strategy v2.0 - NEXT_CANDLE_FAVORABLE/UNFAVORABLE/NEUTRAL/INCONCLUSIVE semantics and user-action separation
[PASS] Test 70: Strategy v2.0 - BSL/SSL pool formation, equality tolerance, touches, merge, and invalidation
[PASS] Test 71: Strategy v2.0 - Momentum numerical formulas, baseline calculation, and equality boundaries
[PASS] Circuit breaker blocks synthetic overrides and test fixtures
[PASS] Twelve Data adapter fetches actual time_series OHLC and reuses same-minute cache
[PASS] Alpha Vantage adapter fetches real FX_INTRADAY OHLC and reports live provenance
[PASS] Stale provider candles and missing live credentials fail closed without replay fallback
[PASS] Step 0 provider probe bypasses cache and reports closed-candle data and credit headers
[PASS] Alpha Vantage premium endpoint denial reports UNSUPPORTED_ON_FREE_KEY without raw provider text

=== TEST SUITE FINISHED: 77 PASSED, 0 FAILED ===

EXIT 0
```
### `npm run test:legacy`
```
> react-example@0.0.0 test:legacy
> LEGACY_V2_FIXTURES=1 tsx test/strategy_pipeline.test.ts

[AuthService] Bootstrapped initial admin: admin@devsecure.engine. Credentials saved securely to data/.admin_bootstrap_secret
=== RUNNING COMVISION ENGINE DETERMINISTIC TEST SUITE ===

[PASS] Test 1: REPLAY provenance is INCONCLUSIVE and cannot emit an alert
[PASS] Test 2: Stage 1 - 5-candle symmetric fractal swing high/low confirmed strictly at Close of t+2
[PASS] Test 3: Stage 1 - Structure evaluates BULLISH, BEARISH or UNCLEAR correctly
[PASS] Test 4: Stage 2 - Bullish FVG mathematical zone defined as [High(C1), Low(C3)]
[PASS] Test 5: Stage 2 - FVG mitigation state tracking
[PASS] Test 6: Stage 2 - Order Block detection and confluence validation
[PASS] Test 7: Stage 3 - Bullish 3-candle expansion breakout validation
[PASS] Test 8: Stage 3 - Rejection if C3 closes back inside C1 boundary
[PASS] Test 9: Stage 4 - TICK_ACTIVITY_PROXY accepts ascending or above 10-period average
[PASS] Test 10: Stage 4 - Low tick activity proxy triggers deterministic REJECT
[PASS] Test 11: Stage 5 - Pushback wick ratio > 0.50 triggers REJECT ("Wick Fakeout")
[PASS] Test 12: Stage 5 - Sweeping prior swing high without closing above triggers SWEEP_DETECTED
[PASS] Test 13: Stage 6 - Inside candle recognized without resetting pattern sequence
[PASS] Test 14: Stage 7 - Bullish FVG must lie strictly below Fib 50% Equilibrium Level
[PASS] Test 15: Stage 8 - High-impact red-folder event within +/- 30m window triggers REJECT
[PASS] Test 16: Stage 8 - News source offline triggers INCONCLUSIVE ("Never assume no news = clear")
[PASS] Test 17: Stage 9 - Pressure observation is non-filtering and strictly categorical (no percentages)
[PASS] Test 18: Access Control - Authorization status lifecycle (PENDING / APPROVED / SUSPENDED / REVOKED)
[PASS] Test 19: Exact Boundary - Wick pushback ratio <= 0.500 PASS vs > 0.500 REJECT ("Wick Fakeout")
[PASS] Test 20: Exact Boundary - Bullish FVG strictly below Fib 50% PASS vs touching/above Fib 50% REJECT
[PASS] Test 21: Stage 3 Negative Boundary - Close(C3) exactly equal to High(C1) fails expansion (> High(C1))
[PASS] Test 22: Vision fields are absent and cannot influence data quality
[PASS] Test 23: Data Quality Fail-Safe - Zero range flat candle triggers DEGRADED + INCONCLUSIVE
[PASS] Test 24: Master Telemetry Completeness - All Section 6 schema fields populated without omission
[PASS] Test 25: Master Telemetry SHA-256 Hash Chain - Sequential verification and tamper detection
[PASS] Test 26: EXP-2026-001 Scope Freeze - Blocks parameter modification attempts during locked experiment
[PASS] Test 27: Server-Side Auth - 401 Unauthorized for missing, invalid, or expired tokens
[PASS] Test 28: Server-Side Auth - 403 Forbidden on PENDING, SUSPENDED, and REVOKED accounts
[PASS] Test 29: Server-Side Role Separation - Analyst role blocked from user administration
[PASS] Test 30: Session Revocation & Quick Demo - Logout destroys session; Quick Demo requires server auth
[PASS] Test 31: Stage 2 - Bearish FVG formation zone strictly defined as [High(C3), Low(C1)]
[PASS] Test 32: Stage 2 - Bearish FVG mitigation transitions: PARTIAL_FILL on retest, COMPLETELY_FILLED on invalidation
[PASS] Test 33: Stage 2 - Bearish OB + FVG confluence: (Low(C1) >= Low(Cob) || fvgTop >= Low(Cob)) && High(C3) < High(Cob)
[PASS] Test 34: Stage 3 - Bearish 3-Candle breakout: Close(C3) < Low(C1) PASS vs Close(C3) >= Low(C1) REJECT
[PASS] Test 35: Stage 5 - Bearish lower-wick pushback ratio <= 0.500 PASS vs > 0.500 REJECT ("Wick Fakeout")
[PASS] Test 36: Stage 5 - Bearish prior-swing-low liquidity sweep: Low(C3) < SL_n && Close(C3) >= SL_n triggers SWEEP_DETECTED
[PASS] Test 37: Stage 7 - Bearish Fib50 Premium rule: FVG Bottom > Fib50 PASS_PREMIUM vs FVG Bottom <= Fib50 REJECT
[PASS] Test 38: Scope Freeze - Rejection of maxWickRatio mutation under locked EXP-2026-001
[PASS] Test 39: Scope Freeze - Rejection of fibEquilibriumLevel mutation under locked EXP-2026-001
[PASS] Test 40: Scope Freeze - Rejection of timeframe/threshold mutation under locked EXP-2026-001
[PASS] Test 41: Persistence - DurableStorage saves and loads candidates surviving re-instantiation
[PASS] Test 42: Persistence - DurableStorage saves and loads user accounts surviving re-instantiation
[PASS] Test 43: Persistence - DurableStorage saves and loads session tokens surviving re-instantiation
[PASS] Test 44: Persistence - DurableStorage saves and loads experiment state & hash chain surviving re-instantiation
[PASS] Test 45: Credential Security - Zero hardcoded cleartext production passwords in auth service
[PASS] Test 46: Credential Security - Secure bootstrap admin generated via environment or private entropy
[PASS] Test 47: Notification Payload - Message #1 Valid Signal Alert format contains all required fields
[PASS] Test 48: Notification Payload - Message #2 Next-Candle Result Alert format contains all required fields
[PASS] Test 49: Notification Delivery Status - Signal Alert tracks Telegram & Email delivery states
[PASS] Test 50: Notification Safety - Notification failure does NOT invalidate candidate decision or alter experiment stats
[PASS] Test 51: Notification Manual Test - sendTestNotification() handles unconfigured channels gracefully
[PASS] Test 52: Next-Candle Result - Bullish signal: next candle close > open resolves to NEXT_CANDLE_FAVORABLE
[PASS] Test 53: Next-Candle Result - Bullish signal: next candle close <= open resolves to NEXT_CANDLE_UNFAVORABLE or NEUTRAL
[PASS] Test 54: Next-Candle Result - Bearish signal: next candle close < open resolves to NEXT_CANDLE_FAVORABLE
[PASS] Test 55: Next-Candle Result - User Action NOT_TAKEN does NOT alter NEXT_CANDLE_FAVORABLE research outcome
[PASS] Test 56: Research History - Analytics engine computes accurate WIN/LOSS/TAKEN/NOT_TAKEN counts
[PASS] Test 57: Research History - Analytics engine filters by pair (e.g. NQ vs ES) accurately
[PASS] Test 58: Date Boundary - Natural language date parser handles Bengali & English date ranges
[PASS] Test 59: Chat Assistant - Strategy mutation attempt is strictly blocked with frozen explanation
[PASS] Test 60: Chat Assistant - Market condition query executes deterministic Strategy v1.0 pipeline without hallucination
[PASS] Test 61: Chat Assistant - Bengali historical queries return verified counts
[PASS] Test 62: Audit Log Linkage - Every signal, outcome, notification, and chat event shares the authoritative setup_id
[PASS] Test 63: Telegram Updates - Handles unconfigured bot token safely without exposing secrets
[PASS] Test 64: Telegram Updates - Correctly parses Telegram /start message update and extracts user Chat ID
[PASS] Test 65: Telegram Chat ID - setTelegramChatId updates active target and persists in storage
[PASS] Test 66: Telegram Security - Error sanitizer strips bot token from API failure messages
[PASS] Test 67: Telegram Test Alert - Returns status DISABLED when Chat ID or bot token is missing
[PASS] Test 68: Telegram Test Alert - Verifies successful dispatch and zero token leakage on error
[PASS] Test 69: Strategy v2.0 - NEXT_CANDLE_FAVORABLE/UNFAVORABLE/NEUTRAL/INCONCLUSIVE semantics and user-action separation
[PASS] Test 70: Strategy v2.0 - BSL/SSL pool formation, equality tolerance, touches, merge, and invalidation
[PASS] Test 71: Strategy v2.0 - Momentum numerical formulas, baseline calculation, and equality boundaries
[PASS] Circuit breaker blocks synthetic overrides and test fixtures
[PASS] Twelve Data adapter fetches actual time_series OHLC and reuses same-minute cache
[PASS] Alpha Vantage adapter fetches real FX_INTRADAY OHLC and reports live provenance
[PASS] Stale provider candles and missing live credentials fail closed without replay fallback
[PASS] Step 0 provider probe bypasses cache and reports closed-candle data and credit headers
[PASS] Alpha Vantage premium endpoint denial reports UNSUPPORTED_ON_FREE_KEY without raw provider text

=== TEST SUITE FINISHED: 77 PASSED, 0 FAILED ===

EXIT 0
```
