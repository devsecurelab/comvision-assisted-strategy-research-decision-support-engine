# ComVision — Handover (EXP-2026-V3-REAL-001)

**Date:** 2026-10-16
**Branch:** `engine/handover-2026-10`
**Baseline:** `b90004f`
**Current code HEAD:** `85679ea`
**Status: PARTIAL — do not merge.** Code changes and tests are complete, but the required live Twelve Data R8 smoke was not run because `TWELVE_DATA_API_KEY` was not present. Consequently no R8 evidence, PR, merge, tag, or fresh-clone validation was produced.

Research alert engine only; no broker order execution.

## 1. Requested changes

| Item | Status | Commit / evidence |
|---|---|---|
| Golden decisions before C1 | Complete | `0f81bd3`; 24 ideal + 24,000 deterministic seeded windows captured from `b90004f` |
| C1 — owner-order gate numbering | Complete | `99dadcc`; gate names/order/reasons changed only; T1 compares finalAction, systemDecision, exact MFCI, each stage pass/fail, and mapped gate statuses across all 24,024 windows |
| C2 — R8 HTF warm-up | Implemented and tested | `85679ea`; fetches 1h candles from 7 days before evaluation start; report includes pre-roll/evaluation ranges and counts bars with fewer than 7 closed 1h candles; no real R8 output exists yet |
| C3 — ignore generated data | Complete | `bbb3686`; ignores `data/r8/`, `data/*.jsonl`, `data/**/*.csv`; tracked `data/.gitkeep` retained |
| C4 — env template/stale marker | Complete | `bbb3686`; safe defaults and commented R8 settings; removed `docs/TESTS_PENDING.md`; T4 checks secrets are empty |

No strategy rule, threshold, score weight, or candle logic was changed. Files under UI, auth/user, settings, legal, and saved user data were untouched. No dependency was added or updated.

## 2. Baseline and final validation

Baseline was run at `b90004f` before any code changes; all four required commands passed. The same four commands passed after the changes. The complete captured raw output is included below.

T1 passed: **24,024/24,024** cases retained identical `finalAction`, `systemDecision`, MFCI, and stage pass/fail values. Gate statuses matched the required mapping (new G4=old G5, new G5=old G6, new G6=old G4). T2/T3/T4/T5 coverage also passed in the full suite.

## 3. R8 smoke — not run

The required no-key preflight was run with the requested EUR/USD / September 2026 settings:

```text
> react-example@0.0.0 backtest:r8
> tsx scripts/r8-backtest.ts
R8_NOT_RUN: TWELVE_DATA_API_KEY is not configured. No simulated or replay data will be used.
EXIT_CODE=2
NO_OUTPUT_FILES_CREATED=true
```

The output directory did not exist before the preflight and was not created. **No provider request was made.** The following acceptance items therefore remain unverified:

| Item | Result |
|---|---|
| A1 run success / CSVs / reports | Not run |
| A2 source provenance | Not run; no history fetched |
| A3 candle health | Not run |
| A4 offline replay / tamper rejection | Not run |
| A5 hand-check of alerts | Not run; no alerts or market bars loaded |
| A6 nine-gate R8 funnel | Not run; suspicious 0%/100% gates unknown |
| A7 verdict / ties / breakeven | Not run; payout 85% would imply theoretical breakeven 54.05%, not an observed result |
| A8 zero-alert handling | Not run |
| A9 secret check | No Twelve Data key was supplied or used; the keyless preflight created no output. T4 verified no values in the configured secret fields of `.env.example`. Since no key value was available, a value-specific grep cannot be performed. |
| A10 request/credit/time totals | 0 provider requests; credit usage not applicable; no live run duration to report |

Do not infer strategy performance or gate health from this keyless preflight or from test fixtures.

## 4. Git status and scope snapshot

The working tree was clean after the final test run. The code diff snapshot below is from `85679ea`, before this handover document was added. All changed paths fall within the permitted engine, runner, test, environment, ignore, and documentation scope.

### `git diff --stat main..HEAD` (at `85679ea`)

```text

 .env.example                           | 23 ++++++++++++
 .gitignore                             |  3 ++
 docs/TESTS_PENDING.md                  | 13 -------
 package.json                           |  2 +-
 scripts/r8-backtest.ts                 | 21 ++++++-----
 src/engine/r8Backtest.ts               | 27 +++++++++++--
 src/engine/strategyV3Engine.ts         |  6 +--
 test/fixtures/gateRenumberCases.ts     | 69 ++++++++++++++++++++++++++++++++++
 test/fixtures/golden-b90004f.json      |  1 +
 test/gate_renumber_equivalence.test.ts | 69 ++++++++++++++++++++++++++++++++++
 test/r8_backtest_core.test.ts          | 13 ++++++-
 test/strategy_v3_engine.test.ts        |  6 +--
 test/v3_safety_invariants.test.ts      |  9 +++++
 13 files changed, 228 insertions(+), 34 deletions(-)
```

### `git diff --name-only main..HEAD` (at `85679ea`)

```text

.env.example
.gitignore
docs/TESTS_PENDING.md
package.json
scripts/r8-backtest.ts
src/engine/r8Backtest.ts
src/engine/strategyV3Engine.ts
test/fixtures/gateRenumberCases.ts
test/fixtures/golden-b90004f.json
test/gate_renumber_equivalence.test.ts
test/r8_backtest_core.test.ts
test/strategy_v3_engine.test.ts
test/v3_safety_invariants.test.ts
```

## 5. Not fixed; notify Owner

- `npm ci` reported 9 dependency advisories (2 moderate, 7 high). No audit remediation was attempted because dependency changes are outside the authorized scope. The advisories were not independently assessed in this task.
- Live R8 evidence is blocked on the Owner supplying the Twelve Data key through the intended private mechanism. Do not put the key in a commit, PR, issue, report, output file, or chat message.

## 6. Not verified

- Real-market R8 smoke run (A1–A10), including all data/quality/provenance checks.
- Real win rate, profitability, or strategy quality.
- Full R8 with N ≥ 200 and historical news data; live scan soak; Telegram live commands.
- PR creation, Owner approval, merge, `engine-v3.0-handover` tag, and fresh-clone verification.

**Next step:** after the Owner provides the Twelve Data key through the approved private channel, run the live R8 smoke exactly as specified, preserve raw key-free output, verify outputs and key absence, and then prepare the evidence report and PR. Do not merge until the Owner explicitly replies `OK`.

## Appendix A — captured raw command outputs


### Baseline before edits — npm run lint

```text


> react-example@0.0.0 lint
> tsc --noEmit

EXIT_CODE=0

```


### Baseline before edits — npm run build

```text


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

✓ built in 1.65s

PWA v1.3.0
mode      generateSW
precache  29 entries (653.79 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js

  dist/server.cjs      270.0kb
  dist/server.cjs.map  499.5kb

⚡ Done in 15ms
EXIT_CODE=0

```


### Baseline before edits — npm test

```text


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
[REACHABILITY] runtime 75.2s
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

EXIT_CODE=0

```


### Baseline before edits — npm run test:legacy

```text


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

EXIT_CODE=0

```


### Final after edits — npm run lint

```text


> react-example@0.0.0 lint
> tsc --noEmit

EXIT_CODE=0

```


### Final after edits — npm run build

```text


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

✓ built in 1.64s

PWA v1.3.0
mode      generateSW
precache  29 entries (653.79 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js

  dist/server.cjs      270.0kb
  dist/server.cjs.map  499.5kb

⚡ Done in 16ms
EXIT_CODE=0

```


### Final after edits — npm test

```text


> react-example@0.0.0 test
> tsx test/strategy_v3_engine.test.ts && tsx test/gate_renumber_equivalence.test.ts && tsx test/strategy_v3_reachability.test.ts && tsx test/w1b_production_surface.test.ts && tsx test/w2_market_structure_integration.test.ts && tsx test/w3_binary_output.test.ts && tsx test/v3_safety_invariants.test.ts && tsx test/payout_gate.test.ts && tsx test/favorite_registry.test.ts && tsx test/w5w6_modules.test.ts && tsx test/r9_ledger_scan.test.ts && tsx test/r8_backtest_core.test.ts && npm run test:legacy

=== V3 ENGINE UNIT TESTS: every PRICE_ONLY stage pass/fail, HTF-owned direction, fail-closed data passed ===
=== GATE RENUMBER EQUIVALENCE: 24024 b90004f decisions unchanged; G4/G5/G6 mapping and gate structure passed ===
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
[FUNNEL] random PRICE_ONLY BULLISH: marginal=16.6%,42.7%,50.7%,49.8%,84.9%,53.9%,43.9%,61.1%,85.7% cumulative=16.6%,12.0%,9.2%,0.1%,0.1%,0.1%,0.1%,0.1%,0.1% alerts=3/6000
[FUNNEL] random PRICE_ONLY BEARISH: marginal=16.6%,42.9%,51.4%,49.6%,85.7%,54.0%,44.4%,58.6%,85.0% cumulative=16.6%,12.0%,9.4%,0.1%,0.1%,0.1%,0.1%,0.1%,0.1% alerts=3/6000
[FUNNEL] random FULL BULLISH: marginal=1.1%,42.4%,12.5%,49.5%,84.7%,27.1%,44.3%,59.8%,85.6% cumulative=1.1%,0.9%,0.1%,0.0%,0.0%,0.0%,0.0%,0.0%,0.0% alerts=0/6000
[FUNNEL] random FULL BEARISH: marginal=1.1%,42.1%,12.2%,50.0%,85.2%,27.4%,45.7%,59.3%,85.3% cumulative=1.1%,0.8%,0.2%,0.0%,0.0%,0.0%,0.0%,0.0%,0.0% alerts=0/6000
[REACHABILITY] runtime 70.7s
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
[env_example_secrets] PASS
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

EXIT_CODE=0

```


### Final after edits — npm run test:legacy

```text


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

EXIT_CODE=0

```
