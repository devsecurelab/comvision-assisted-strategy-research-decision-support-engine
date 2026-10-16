# ComVision Engine Handover — 2026-10-16

## Status

The authorized C1–C5 scope, F1 fetch-boundary fix, and tests are complete. The current September EUR/USD R8 replay uses complete raw CSVs, excludes scheduled FX-closure timestamps only from analysis, and reports exact raw/analyzed/excluded counts; raw provider CSVs remain unchanged. The original F2 inspection found no fully flat OHLC bars. The Owner explicitly accepts the A4 `reused` metadata markers and A10 header-capture limitation as passes. Strategy predicates, thresholds, weights, and FULL-mode default remain unchanged; `ENGINE_FULL_MODE_ENABLED=false` remains the default.

R8 artifacts are retained locally under `data/r8-smoke/` and `data/r8-smoke-rerun/`; they are Git-ignored, and no provider CSV or generated R8 JSON is committed. The full A1–A10 report, manifest hashes, funnel tables, raw R8 output, and limitations are in [docs/evidence/r8-smoke-2026-10-16.md](docs/evidence/r8-smoke-2026-10-16.md).

## C1–C4 and commit sequence

| Work | Status | Commit |
|---|---|---|
| T1 baseline golden decisions at `b90004f` | Complete; saved before C1 | `0f81bd3` |
| C1 gate order/names and T1–T3 | Complete; 24,024 baseline decisions unchanged | `99dadcc` |
| C3/C4 ignore rules, safe `.env.example`, stale test marker removal, T4 | Complete | `bbb3686` |
| C2 HTF pre-roll and warm-up reporting, T5 | Required and implemented; seven-day 1h pre-roll; zero evaluation bars marked warm-up in this run | `85679ea` |
| C3 smoke-output ignore correction | Complete; explicitly ignores both requested smoke output paths | `6aff5ff` |
| R8 evidence | Complete; raw data stays local | `4994f34` |
| F1 historical end-date and clipping correction + mock regression | Complete; date-only end range fetched through 23:59:59 UTC and clipped; 30-day two-chunk continuity test | `491ec02` |
| C5 market-hours gate, scanner no-fetch guard, R8 closure filtering and regression coverage | Complete; UTC weekly/holiday closure, raw CSV preserved, offline C5 funnel captured | `2f5c3ca` |

**C1 final gate order:** G1 Structure; G2 Imbalance; G3 OB & Breaker; G4 Premium/Discount; G5 Wick; G6 Liquidity Sweep; G7 Momentum; G8 Session & Kill Zone; G9 BSL/SSL Target. C1 changed numbering, labels, ordering, and reason-code alignment only; it did not alter signal decisions. T1 compares pre-C1 goldens and confirms the Owner's G4/G5/G6 mapping.

C2 was needed: the prior runner fetched 1h data only for the evaluation window, while the bias calculation needs closed HTF history. The runner now fetches 1h from seven days before the start and records both ranges. R8 records zero HTF warm-up bars in the evaluation periods; no crash occurred.

C3 needed one further, tightly scoped `.gitignore` adjustment after the run showed `data/r8/` alone did not ignore the explicitly requested `data/r8-smoke/` output path. The added rules cover `data/r8-smoke/` and `data/r8-smoke-rerun/`. No data or engine logic was changed.

## Validation

All four required baseline commands passed at `b90004f`. After C5 (`2f5c3ca`), all four required commands were rerun and passed:

- `npm run lint` — exit 0 (`tsc --noEmit`)
- `npm run build` — exit 0
- `npm test` — exit 0; 77 passed, 0 failed (includes 24,024-decision gate-equivalence, C5 market-hours test, and legacy suite)
- `npm run test:legacy` — exit 0; 77 passed, 0 failed
- C5 tests — passed; weekend/holiday boundaries, MARKET_CLOSED no-trade, unchanged open CALL, R8 filtering, and no-provider-fetch during closure
- F1 mock — passed; request end strings, next-boundary clipping, all 8,640 5m bars, and zero chunk-boundary gaps checked
- `git diff --check` — passed; generated R8 outputs remain ignored

Complete baseline and final raw outputs are appended below. R8 raw console output is in the evidence file linked above.

## R8 acceptance summary

The A1–A10 and F2 figures immediately below record the original pre-C5 raw-history run. Current C5 analysis-only closure filtering, updated counts, and funnel percentages are documented in the C5 section below and in the linked evidence addendum.

- **Run:** EUR/USD, September 1–30, 2026; 5m/15m/30m; payout 85%; `PRICE_ONLY`; historical news unavailable and explicitly excluded.
- **A1/A2:** the live runner produced all five requested fetch outputs and `R8_OUTPUT`; the log contains no `R8_FAILED`. The outer shell's exit-status capture failed after the runner completed, so no numeric runner exit code is claimed. Provenance is Twelve Data / `LIVE_INGESTED`; `FULL` is `UNAVAILABLE` because FX volume is absent.
- **A3 coverage: PASS for the initial raw audit.** Source CSVs have 8,640/2,880/1,440 bars for 5m/15m/30m, zero missing slots/gaps/duplicates/off-grid timestamps, and complete final-day candles. After C5, R8 excludes scheduled-closure timestamp rows only from analysis; filtered reports remain `dataQuality.ok=true`, and the raw CSV bytes are unchanged. C5 counts and filtered A3 results follow below.
- **A4: PASS (Owner accepted).** Three per-timeframe report JSONs match byte-for-byte. The summary matches after dropping `generatedAt` and offline `reused: true` markers; the Owner explicitly accepts the markers. One-byte tampering was rejected by SHA-256.
- **A5:** One 5m in-sample alert; it is a `PUT` and its next-candle outcome is a loss. The closed-hour bias, session, next-bar prices, and SSL target are documented in the evidence report. One nearest missed bar per timeframe is also included. News was not assessed.
- **A6:** The initial pre-C5 raw-series funnel has no marginal gate at 0% or 100%; the current C5 post-filter funnel is tabulated below and in the evidence addendum.
- **A7:** OOS decisive N=0 in all three timeframes; verdict `INCONCLUSIVE`; theoretical breakeven 54.05%. Ties are excluded by report logic. No performance or profitability claim is made.
- **A8:** 15m and 30m have zero alerts for the full month; 5m has one in-sample alert and zero OOS alerts. All reports completed.
- **A9:** The earlier secret-value scan passed across 120 tracked/output/log/history files. For this rerun the key was entered hidden and unset; it was not emitted in the live log or committed, and smoke outputs remain ignored.
- **A10: PASS (Owner accepted).** Five R8 fetch requests; the original per-request headers were not retained. A separate earlier probe returned `creditsUsed=1`, `creditsLeft=7`; the Owner explicitly accepts the limitation, and no extra probe or code change was made.

## F1/F2 follow-up

F1 changes only the historical fetch boundary: the Twelve Data `end_date` is sent as `YYYY-MM-DD 23:59:59` UTC and any returned candle outside `[start 00:00, end+1 day 00:00)` is clipped. The mock test covers the two 5m request chunks across Sep 1–30 and verifies continuous data through Sep 30 23:55.

F2 uses exact OHLC comparisons on UTC timestamps. **Fully flat (`high==low` and `open==close`) bars: zero** in every evaluation timeframe and in both windows. Saturday/Sunday bars: 2,304 (5m), 768 (15m), 384 (30m). Friday 21:00 inclusive through Sunday 21:00 exclusive has the same counts; `open==close`-only bars with nonzero ranges number 414/101/47 on Sat/Sun and 424/98/47 in the Friday-to-Sunday window. Those F2 counts use the untouched raw CSVs; C5 now removes scheduled-closure rows from R8 analysis only.

## C5 — closure policy, scanner, and filtered R8 replay

- Weekly closure: **Friday 21:00 UTC inclusive to Sunday 21:00 UTC exclusive**. Full-day holidays: December 25 and January 1 UTC. Boundary and holiday cases are covered in `test/market_hours.test.ts`.
- The pipeline returns no strategy signal and exact `metadata.status_reason=MARKET_CLOSED` for a closed-time decision; the final action is `NO_ACTION`. The live scan service/automatic cycle short-circuit before provider fetches and return `NO_TRADE` / `MARKET_CLOSED`. It also skips the just-closed candle at the exact Sunday reopening and defers closed-time resolution requests.
- R8 filters candles whose open timestamps lie inside the closure from both the selected-timeframe analysis windows and 1h HTF bias history. Data-quality gap checks use the same exact schedule; raw provider CSVs are retained unchanged. The signal pipeline also blocks a bar whose decision-close instant is closed.
- Offline `R8_CSV_INPUT_DIR` replay reused the same September EUR/USD CSVs and made no new provider request/key use. Raw/analyzed/excluded rows: **5m 8,640/6,336/2,304; 15m 2,880/2,112/768; 30m 1,440/1,056/384**. HTF pre-roll: **888/648/240**. Manifest hashes still match; all reports have `dataQuality.ok=true`; Sep 30 remains complete through 23:55/23:45/23:30 UTC.
- Post-filter funnel denominators (evaluated IS/OOS): **5m 2,399/1,272; 15m 723/424; 30m 329/212**. Signals IS/OOS: **5m 1/0; 15m 0/0; 30m 0/0**. OOS decisive N=0 and all verdicts remain `INCONCLUSIVE`. The full marginal/cumulative nine-gate tables and exact keyless command are in the evidence file.
- Validation after C5: `npm run lint`, `npm run build`, `npm test` (77 passed), `npm run test:legacy` (77 passed), and `git diff --check` all pass; gate equivalence still confirms 24,024 baseline decisions unchanged. FULL mode remains disabled by default.

## Not corrected / owner review

1. The raw non-flat weekend provider rows remain unchanged for the Owner's interpretation. C5 excludes specified closure-time rows only from R8 analysis; it does not alter or rewrite provider CSVs.
2. `npm ci` previously reported 9 dependency advisories (2 moderate, 7 high); not investigated or changed, outside scope.

## Not verified

- Strategy profitability, or any claim of real-money readiness.
- Full R8 evidence with N≥200 and an appropriate historical news CSV.
- Live scan soak or live Telegram commands.
- Merge, release tag, or fresh-clone post-merge validation. The Owner requires written approval before merge; none is assumed here.

## Raw outputs

The appendix retains the original baseline/final outputs and the prior `4994f34` scope snapshot. The latest F1 validation logs are appended as Appendix B; the `4994f34` diff snapshot is historical and predates F1. The current PR shows the final branch diff.

## Appendix A — captured raw command outputs

### Baseline before edits — `npm run lint`

```text

> react-example@0.0.0 lint
> tsc --noEmit

EXIT_CODE=0
```

### Baseline before edits — `npm run build`

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

### Baseline before edits — `npm test`

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

### Baseline before edits — `npm run test:legacy`

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

### Final after code and C3 ignore correction — `npm run lint`

```text

> react-example@0.0.0 lint
> tsc --noEmit

EXIT_CODE=0
```

### Final after code and C3 ignore correction — `npm run build`

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

✓ built in 2.23s

PWA v1.3.0
mode      generateSW
precache  29 entries (653.79 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js

  dist/server.cjs      270.0kb
  dist/server.cjs.map  499.5kb

⚡ Done in 14ms
EXIT_CODE=0
```

### Final after code and C3 ignore correction — `npm test`

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
[REACHABILITY] runtime 69.3s
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

### Final after code and C3 ignore correction — `npm run test:legacy`

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

### Raw `git diff --stat main..HEAD` snapshot at `4994f34` (before this handover refresh)

```text
 .env.example                           |  23 ++
 .gitignore                             |   5 +
 HANDOVER.md                            | 558 +++++++++++++++++++++++++++------
 docs/TESTS_PENDING.md                  |  13 -
 docs/evidence/r8-smoke-2026-10-16.md   | 167 ++++++++++
 package.json                           |   2 +-
 scripts/r8-backtest.ts                 |  21 +-
 src/engine/r8Backtest.ts               |  27 +-
 src/engine/strategyV3Engine.ts         |   6 +-
 test/fixtures/gateRenumberCases.ts     |  69 ++++
 test/fixtures/golden-b90004f.json      |   1 +
 test/gate_renumber_equivalence.test.ts |  69 ++++
 test/r8_backtest_core.test.ts          |  13 +-
 test/strategy_v3_engine.test.ts        |   6 +-
 test/v3_safety_invariants.test.ts      |   9 +
 15 files changed, 854 insertions(+), 135 deletions(-)
```

## Appendix B — raw F1 follow-up validation outputs

### F1 final — npm run lint

```text

> react-example@0.0.0 lint
> tsc --noEmit
```

### F1 final — npm run build

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

✓ built in 2.26s

PWA v1.3.0
mode      generateSW
precache  29 entries (653.79 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js

  dist/server.cjs      270.9kb
  dist/server.cjs.map  501.0kb

⚡ Done in 16ms
```

### F1 final — npm test

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
[REACHABILITY] runtime 67.9s
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
=== R8 HISTORICAL FETCH: full inclusive end date, out-of-range clipping, and chunk-boundary continuity passed ===
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
```

### F1 final — npm run test:legacy

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
```

### `git diff --stat main..HEAD` at code commit `491ec02` (before the evidence and handover refresh)

```text
 .env.example                           |  23 ++
 .gitignore                             |   5 +
 HANDOVER.md                            | 528 ++++++++++++++++++++++++++-------
 docs/TESTS_PENDING.md                  |  13 -
 docs/evidence/r8-smoke-2026-10-16.md   | 167 +++++++++++
 package.json                           |   2 +-
 scripts/r8-backtest.ts                 |  21 +-
 src/engine/dataProviders.ts            |  21 +-
 src/engine/r8Backtest.ts               |  27 +-
 src/engine/strategyV3Engine.ts         |   6 +-
 test/fixtures/gateRenumberCases.ts     |  69 +++++
 test/fixtures/golden-b90004f.json      |   1 +
 test/gate_renumber_equivalence.test.ts |  69 +++++
 test/r8_backtest_core.test.ts          |  59 +++-
 test/strategy_v3_engine.test.ts        |   6 +-
 test/v3_safety_invariants.test.ts      |   9 +
 16 files changed, 877 insertions(+), 149 deletions(-)
```


## Appendix C — C5 final validation and replay outputs

Final validation run after commit `2f5c3ca`:

```text
npm run lint       EXIT=0 (tsc --noEmit)
npm run build      EXIT=0
npm test           EXIT=0; 77 passed, 0 failed
npm run test:legacy EXIT=0; 77 passed, 0 failed
```

Relevant passing regression markers:

```text
=== GATE RENUMBER EQUIVALENCE: 24024 b90004f decisions unchanged; G4/G5/G6 mapping and gate structure passed ===
=== C5 MARKET HOURS: UTC boundaries/holidays, no closed-time signal, unchanged open CALL, R8 filter, and no-credit scanner suppression passed ===
=== R8 CORE: live pipeline, causal walk-forward, OOS/IS, baselines, N>=200 verdict rule, CSV+SHA-256, pagination, R8_NOT_RUN passed ===
=== TEST SUITE FINISHED: 77 PASSED, 0 FAILED ===
```

Keyless offline replay (`R8_CSV_INPUT_DIR=data/r8-smoke/historical`) output:

```text
R8_RESULT EUR/USD 5m PRICE_ONLY OOS N=0 wins=0 winRate=n/a wilson=n/a breakeven=0.5405 verdict=INCONCLUSIVE
R8_RESULT EUR/USD 15m PRICE_ONLY OOS N=0 wins=0 winRate=n/a wilson=n/a breakeven=0.5405 verdict=INCONCLUSIVE
R8_RESULT EUR/USD 30m PRICE_ONLY OOS N=0 wins=0 winRate=n/a wilson=n/a breakeven=0.5405 verdict=INCONCLUSIVE
R8_OUTPUT data/r8-smoke-rerun
RAW_CSV_HASHES_UNCHANGED=PASS
```

## G1–G6 follow-up — owner-run tests, interval-aware market closures, and adapter pruning

**Branch:** `engine/gaps-2026-10`, based on main `2da5232`. This follow-up preserves all gate logic, strategy thresholds, MFCI weights, and the disabled FULL-mode default. The Owner explicitly instructed the agent not to run `npm test` / `npm run test:legacy`; the Owner will run them. The new tests are present in the standard suite.

### Implementation

- **G1 — common live/R8 closure filter:** `filterFxOpenMarketCandles` is applied to both live LTF candles and cached/fetched HTF candles before pipeline evaluation; R8 uses the same helper. The helper removes a candle when its open or close instant overlaps a scheduled closure. Raw CSV inputs remain unchanged.
- **G2 — DST-aware market closure:** the weekly interval is Friday 17:00 through Sunday 17:00 in `America/New_York`, resolved with `Intl.DateTimeFormat`; this moves the UTC boundary between 21:00 and 22:00 as DST changes. December 25 and January 1 UTC holidays remain. Candle-interval checks and data-gap validation share the boundary predicate.
- **G3 — kill-zone credit guard:** manual scan and auto-cycle use `classifySessionAndKillZone` from `session.ts`; outside a London/New York kill zone they return `NO_TRADE` / `OUTSIDE_KILL_ZONE` before provider access. The market-closed check also occurs before provider access. A mock 24-hour, 96-window scan-credit regression and a Monday live-vs-R8 equivalence regression were added.
- **G4 — provenance visibility:** signal ledger records separate LTF/HTF providers. Provider switches are grouped per decision and sent as sanitized Telegram notices with source/destination, failure reason, circuit state and timestamp; health output reports active provider and circuits. Tests assert token/secret values are absent.
- **G5 — unsupported providers:** Finnhub and Alpha Vantage adapters, Finnhub WebSocket source, key variables, selector options and related adapter tests are removed. Active fallback order is Twelve Data → OANDA Practice → Tiingo FX. `.env.example`, setup/provider docs and the delivered Bengali Termux guide are aligned.
- **No strategy changes:** only data filtering, scheduling/visibility, provider surface and regression/documentation changes; no threshold, gate, MFCI weight, or FULL-mode default changes.

### Keyless R8 replay after G1/G2

The September EUR/USD CSVs were replayed from `R8_CSV_INPUT_DIR` with `TWELVE_DATA_API_KEY` and `TWELVEDATA_API_KEY` unset. No provider calls were made. Each original SHA-256 hash still matches its manifest. The latest raw/analyzed/excluded rows are: 1h 888/643/245; 5m 8,640/6,332/2,308; 15m 2,880/2,108/772; 30m 1,440/1,052/388. Each output has `dataQuality.ok=true` and retains the full Sep 30 last candle.

The previous open-time-only replay produced evaluated IS/OOS totals 2,399/1,272 (5m), 723/424 (15m), and 329/212 (30m). The interval-aware replay produces 2,242/1,272; 670/424; and 302/212. OOS totals are unchanged; IS evaluated-bar counts differ because excluding closure-overlapping boundary bars changes the 120-open-candle rolling input windows in subsequent history. The one 5m signal is unchanged (`2026-09-01T12:15:00Z`, PUT, LOSS); 15m/30m remain zero-signal; all OOS decisive N remain zero / `INCONCLUSIVE`. See `docs/evidence/gaps-2026-10.md` and the updated R8 evidence addendum for the full gate tables.

### Validation status (do not overstate)

- `npm run lint` (`tsc --noEmit`) — **PASS**.
- `npm run build` — **PASS**.
- Keyless offline R8 replay — **PASS** for all three reports; all remain `INCONCLUSIVE`.
- `npm test` and `npm run test:legacy` — **NOT RUN in this follow-up at the Owner's explicit request**. The Owner will run them. Historical C5 suite results are preserved above but do not certify the new G1–G6 changes.
- Live provider entitlements/Termux behavior — not verified; Owner will perform their real-data smoke run. No credentials were used, written, or logged.

Raw command outputs for lint, build, and offline R8 are recorded in the G1–G6 evidence file. The user requested immediate merge despite deferring tests to their own run; do not claim the full suite passed for this follow-up.
