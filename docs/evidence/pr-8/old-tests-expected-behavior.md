# PR-8 Old Tests: Expected Behavior Register

This document records the behavior that existing tests protect before further V3 telemetry refactoring. It is a documentation artefact; it does not change thresholds, strategy rules, telemetry values, or test semantics.

## Suite inclusion status

The `npm test` command currently runs the PR-1 through PR-8 contracts, including authentication hardening, storage recovery, Twelve Data-only provider behavior, UI truthfulness, merge blockers, hash epoch, persistence/performance, P3 behavior contract, P4 audit, owner regressions, V3 engine/safety suites, Gate 4 parity, R8 compare/core, provider scheduling, notification delivery, market-hours, payout, favorites, and W5/W6 modules.

The historical contracts `test/auth_hardening.test.ts`, `test/storage_recovery.test.ts`, and `test/pr5_twelve_data_only.test.ts` are included in the current `npm test` chain. The live-provider portion inside `test/p3_live_data_integration.test.ts` is the only conditional path: it is explicitly reported as `SKIPPED` unless `P3_LIVE_INTEGRATION=1`; its offline/provider contract portion remains in the suite.

## Historical and PR-specific contracts

| Test | Expected behavior preserved |
|---|---|
| `auth_hardening.test.ts` | Password verification is asynchronous; the legacy `salt:scrypt-hash` format remains readable; malformed unequal-length hashes fail safely; bootstrap identity is neutral and uses `ADMIN_NAME`; real creation time is used; password/email/name length limits are enforced; five failed logins trigger a 15-minute lockout; valid login succeeds after expiry; invalid bearer-token lookup performs no disk read; concurrent login hashing does not starve the event loop; only token hashes are persisted. **Included in npm test.** |
| `storage_recovery.test.ts` | Corrupt critical JSON is quarantined with a UTC suffix while original bytes remain unchanged; quarantine permissions are `0600`; zero-byte and wrong-type files are treated as corrupt; first boot `ENOENT` initializes empty state without quarantine; corrupt chat history is quarantined and starts empty; valid `.prev` is automatically recovered; successful replacement preserves the prior valid file as `.prev`; recovery is local-only through `storage:recover`, not an HTTP route; recovery artefacts are gitignored. **Included in npm test.** |
| `pr5_twelve_data_only.test.ts` | Provider order is exactly Twelve Data; HTTP 401 maps to `CREDENTIAL_INVALID`, payload/HTTP 429 maps to `RATE_LIMITED`, and server 5xx maps to `PROVIDER_SERVER_ERROR`; timezone and candle geometry are strictly validated; rate-limit circuit retry is aligned to the next minute; timeout failures count while operator abort does not; offline news makes stage 18 unavailable without changing the strategy signal. **Included in npm test.** |
| `p3_live_data_integration.test.ts` | Offline/provider normalization and V3 telemetry contract are always tested; live Twelve Data request is opt-in and emits an explicit `SKIPPED` message unless enabled. |
| `p1_hash_epoch.test.ts` | Canonical JSON and SHA-256 identity are stable; active canonical hash differs from retained legacy hash; epoch and legacy identity remain distinguishable. |
| `pr8_params_centralization.test.ts` | Centralized frozen parameters preserve the existing manifest/config identity and engine-facing compatibility exports. |
| `pr8_params_scores_formulas.test.ts` | Remaining score bands and strategy formula constants are named in `params.ts`; selected inline score/formula literals are absent from the engine; values remain frozen. |
| `v3_safety_invariants.test.ts` | Closed-candle evaluation, determinism, zero-lookahead, scale invariance, no zero-filled volume/order flow, data-integrity checks, no legacy SL/TP output, one session implementation, safe environment defaults, and forbidden production patterns remain enforced. |
| `strategy_v3_engine.test.ts` | PRICE_ONLY stage reachability, HTF-owned direction, fail-closed data behavior, and stage pass/fail contracts remain stable. |
| `w3_binary_output.test.ts` | V3 emits CALL/PUT/NO_TRADE with nine gates; no SL/TP/RR fields are emitted; unavailable payout/MFCI remains unavailable; `decision_engine_v3` is the active engine marker. |
| `gate_renumber_equivalence.test.ts` | The 24,024-case golden decision set keeps the approved gate numbering/mapping unchanged. |
| `gate4_pr_b_equivalence.test.ts` | Gate 4 parity is measured against the golden set; non-G4 gates, stages, and MFCI must remain unchanged. |
| `r8_gate4_compare.test.ts` | Synthetic 1h/5m/15m/30m IS/OOS Gate 4 A/B reports load and emit reason counts; legacy mode A uses `LEGACY_A`/`UNAVAILABLE` reasons. |
| `r8_backtest_core.test.ts` | R8 uses the live pipeline and causal walk-forward path; inclusive dates, clipping, chunk boundaries, CSV SHA-256, pagination, baselines, and the `N < 200` inconclusive rule remain enforced. |

## Telemetry expectations common to old tests

A new pipeline result has one authoritative decision source: `decision_engine_v3`. It contains the V3 direction, stages, nine gates, MFCI, binary signal, system decision, final action, status, status reason, engine mode, provenance-sensitive fields, and signal candle identity. `MasterTelemetry.metadata.decision_engine` is `decision_engine_v3`; the metadata also carries the active config hash/epoch, timestamp, provider, provenance, MFCI summary, status, and first failed gate.

A directional PASS may carry `candle_snapshot`; a rejected, held, blocked, unavailable, or non-directional result must not fabricate a chart signal or price. Missing V3 telemetry is rendered as `UNAVAILABLE`/`NO_TRADE` by consumers rather than reconstructed from legacy fields. V3 gates and MFCI are never recomputed by analytics, notification, chat, UI, or R8 consumers.

Legacy fields remain readable only for historical compatibility. `userAction`/`user_recorded_action`, old next-candle fields, pressure observations, validation metrics, legacy hashes, and old badge fields cannot create a new signal, PASS, outcome, risk claim, price, or strategy calculation. Current V3 output must not emit `stopLoss`, `takeProfit`, or `riskRewardRatio`.

## Test maintenance rule

Any future change to a consumer must update this register and the V3 telemetry inventory before implementation. The change must add or adjust a red test for source-of-truth precedence, preserve the baseline golden count and Gate 4 parity, and leave explicit `SKIPPED` output for tests requiring live credentials or an external provider.
