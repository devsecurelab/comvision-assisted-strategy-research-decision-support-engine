# PR-8 V3 Telemetry Producer-Consumer Inventory

This inventory maps the authoritative V3 telemetry path, consumers, persistence surfaces, and legacy fields that may remain readable. It is an audit artefact only; no telemetry behavior is changed by this document.

**Verification update: 2026-11-11.** Source references and test anchors were rechecked against the current PR-8 branch. The companion expected-behavior register is `docs/evidence/pr-8/old-tests-expected-behavior.md`.

## Source-of-truth rule

`executeStrategyPipeline()` produces one `MasterTelemetry` record. `decision_engine_v3`, its nine gates, nineteen stages, MFCI, binary signal, status reason, provenance, and identity metadata are authoritative for new decisions. Consumers must read V3 fields first. Legacy fields are readable only where explicitly marked `BACKWARD_READ`; they must not create a new PASS, signal, outcome, price, risk claim, or strategy calculation.

## Producers

| Producer | Source | Output | Persistence/hand-off | Status |
|---|---|---|---|---|
| V3 evaluator | `src/engine/strategyV3Engine.ts:evaluateStrategyV3` | `V3DecisionTelemetry` with stages, gates, MFCI, `binarySignal`, status | Returned to pipeline | AUTHORITATIVE |
| Pipeline | `src/engine/pipeline.ts:executeStrategyPipeline` | `MasterTelemetry` with V3 decision plus metadata, validation, context, guards, observation state | Candidate tracker, scan service, chat, notifications | AUTHORITATIVE ADAPTER |
| Manual scan | `src/engine/scanScheduler.ts:scanPairCore` | `ScanResult.telemetry` from pipeline | Scan ledger and UI/API result | AUTHORITATIVE |
| R8 causal backtest | `src/engine/r8Backtest.ts:runCausalBacktest` | V3-derived bars/trades and nine gate statuses | R8 report/test output | AUTHORITATIVE FOR R8 EVALUATION |
| Signal ledger identity layer | `src/engine/signalLedger.ts:identityMetadata` | `config_hash`, epoch, session hash, engine fingerprint, rule variant, operational parameters | Every ledger event payload | AUDIT IDENTITY |
| Experiment tracker | `src/engine/experimentTracker.ts:recordCandidate` | Durable candidate record derived from `MasterTelemetry` | Candidate/outcome storage | AUTHORITATIVE PERSISTENCE ADAPTER |

## V3 consumers

| Consumer | Source | Fields consumed | Required behavior |
|---|---|---|---|
| Scanner result/status | `src/engine/scanScheduler.ts:208-250` | `decision_engine_v3.binarySignal`, `statusReason`, metadata identity, market context | V3 signal determines CALL/PUT/NO_TRADE; no legacy decision fallback |
| Signal creation | `src/engine/scanScheduler.ts:235-249` | V3 signal, MFCI, engine mode, provider, setup ID, timeframe | Writes ledger payload with V3-derived values and identity metadata |
| Candidate tracker | `src/engine/experimentTracker.ts:recordCandidate` | V3 decision, validation metrics, context, metadata, guardrails | Stores deterministic telemetry and config identity |
| R8 report | `src/engine/r8Backtest.ts:68-73` | V3 gates, binary signal, MFCI, status reason | Uses live pipeline output; no synthetic decision path |
| Signal alert | `src/server/notificationService.ts:620-649` | V3 binary signal, gates, MFCI, engine mode, provider/provenance, status reason | Formats only current V3 telemetry; unavailable values remain unavailable |
| Result alert | `src/server/notificationService.ts:655-694` | Outcome record plus telemetry identity/context | Must not invent outcome prices; reads persisted observed values only |
| Chat market analysis | `src/server/chatService.ts:299-352` | V3 gates, actual timeframe, binary signal, metadata provenance | Uses approved payout and actual provider; no legacy fallback to EUR/USD or old badges |
| Analytics | `src/server/analyticsService.ts:185-410` | Candidate observation, outcome records, user action | V3 candidate observation is preferred; legacy action outcome is backward-read only |
| UI decision card | `src/components/DecisionAlertCard.tsx` | `decision_engine_v3`, metadata status/provenance | Renders V3 gate state and `UNAVAILABLE`; no fabricated PASS/risk/price |
| UI binary status | `src/components/BinaryStatusCard.tsx` | `decision_engine_v3.binarySignal`, system status | Renders CALL/PUT/NO_TRADE from V3 only |
| UI chart | `src/components/ChartModal.tsx` | `candle_snapshot`, V3 Gate 4 zone and signal timestamp | Renders stored telemetry snapshot; no generated next candle |
| UI telemetry modal | `src/components/TelemetryModal.tsx` | V3 stages/gates and metadata | Displays authoritative structured telemetry |
| UI setup/feed/log views | `src/components/ValidSetupsFeed.tsx`, `ValidSetupsModal.tsx`, `SetupLogsTable.tsx` | Candidate V3 decision, setup identity, status and provenance | Must use V3 decision and explicit unavailable states |
| Experiment view | `src/components/views/ExperimentView.tsx` | `CONFIG_HASH`, tracker history, V3 identity | Displays active canonical identity; no editable threshold path |
| API export | `server.ts:/api/engine/export-telemetry` | Experiment tracker records | Exports persisted MasterTelemetry; no recalculation |
| Ledger audit API | `server.ts:/api/audit/verify-signal-ledger` | Ledger entries and hash chain | Verifies persisted identity and hashes; no strategy recomputation |

## Source-verified test anchors

| Invariant | Tests that protect it |
|---|---|
| V3 is the sole new decision source; nine gates and binary output are preserved | `test/strategy_v3_engine.test.ts`, `test/w3_binary_output.test.ts`, `test/v3_safety_invariants.test.ts`, `test/pr_a_owner_regressions.test.ts` |
| Gate 4 parity and non-G4 stability | `test/gate_renumber_equivalence.test.ts`, `test/gate4_pr_b_equivalence.test.ts`, `test/r8_gate4_compare.test.ts` |
| R8 consumes live pipeline output and remains causal | `test/r8_backtest_core.test.ts`, `test/r8_gate4_compare.test.ts` |
| Ledger identity is attached to new events | `test/pr7_session_config.test.ts`, `test/pr_a_owner_regressions.test.ts`, `test/p1_hash_epoch.test.ts`, `test/r9_ledger_scan.test.ts` |
| UI/notification consumers do not fabricate prices, risk fields, or V3 status | `test/ui_truthfulness.test.ts`, `test/pr4_notification_delivery.test.ts`, `test/pr6_chart_modal.test.ts`, `test/w3_binary_output.test.ts` |
| Legacy fields remain backward-read only | `test/pr2_durable_migration.test.ts`, `test/pr2_stats_parity.test.ts`, `test/pr3_storage_operations.test.ts`, `test/r9_ledger_scan.test.ts` |
| Provider/provenance and unavailable-state behavior | `test/pr5_twelve_data_only.test.ts` (explicitly omitted from npm test), `test/p3_live_data_integration.test.ts`, `test/w3_binary_output.test.ts` |

## Legacy fields and permitted backward reads

| Legacy field/path | Current read/write location | Permitted use | Forbidden use |
|---|---|---|---|
| `userAction` | `analyticsService.ts:348,407`, `notificationService.ts:665` | Read old outcome records when `user_recorded_action` is absent | Must not override current user action or create a V3 decision |
| `user_recorded_action` values `WIN/LOSS` | `analyticsService.ts:272-274` | Historical compatibility for old records | Must not be interpreted as a new research outcome when a proper observation/outcome exists |
| `nextCandleOpen` / `nextCandleClose` | `analyticsService.ts:167-169`, `notificationService.ts:684,788` | Read old persisted records for historical display | Must not be generated from dashboard candles or client input |
| `next_candle` | `storage.ts:40`, `experimentTracker.ts:466-496` | Persist/read verified operator observation records | Must not be accepted from the client `record-outcome` boundary; new OHLC comes from verified provider only |
| `pressure_observation` | `pipeline.ts:1550`, `types.ts:378`, UI/analytics surfaces | Preserve legacy observation layer and explicit `UNAVAILABLE` | Must not affect V3 gates, signal, MFCI, or risk claims |
| `validation_metrics` | `pipeline.ts:1500`, tracker persistence | Preserve structured historical validation details | Must not be used as a second decision engine or recomputed independently |
| `REPLAY` provenance type | `types.ts:4` | Type-check historical records only | Must not be the default for new data; new non-live data uses `NOT_LIVE`/`TEST`/`SYNTHETIC_OVERRIDE` explicitly |
| `V2_CONFIG_SNAPSHOT` / `LEGACY_CONFIG_HASH` | `manifest.ts:12-167,269-273` | Verify/read historical records | Must not participate in active decisions or current `CONFIG_HASH` |
| Legacy 15-badge/gate fields | Historical UI/data only; current UI uses V3 nine gates | Backward display only if a record cannot be migrated | Must not be used for new UI status, parity, signal, or analytics calculations |
| `stopLoss`, `takeProfit`, `riskRewardRatio` | Explicitly excluded by current V3 tests | Historical type/read compatibility only if encountered | Must not be emitted or displayed as current V3 strategy output |

## Consumer invariants for PR-8 tests

The red tests should assert that a new pipeline result has exactly one authoritative decision source (`decision_engine_v3`), that V3 gate/status values win over legacy fields, and that legacy fields cannot manufacture a signal or PASS. They should also assert that missing V3 telemetry renders/returns `UNAVAILABLE` or `NO_TRADE`, that provider provenance is preserved, and that `config_hash`, `config_hash_epoch`, `session_config_hash`, and `engine_fingerprint` remain attached to new ledger records.

The inventory also identifies the main duplicate-calculation risk: `analyticsService.ts` derives historical counts from persisted observations and has a legacy `WIN/LOSS` fallback. That fallback is a backward-read path, not a V3 telemetry consumer, and must remain isolated while centralization proceeds.

## Current documentation status

The producer/consumer map and old-test behavior register are now documented. The current implementation still has one authoritative V3 pipeline path; no consumer rewrite was made in this documentation step. The three historical suites not included in `npm test` are explicitly listed in the companion register rather than being treated as silently covered.

## Planned implementation order

1. Add red tests for V3-only consumer precedence and legacy backward-read boundaries.
2. Centralize frozen strategy parameters while preserving manifest shape and current identity hashes until the intentional canonical snapshot update is reviewed.
3. Change no consumer behavior except removing duplicate calculations that are proven redundant by the tests.
4. Re-run the baseline suite, R8 golden count, Gate 4 parity, and `v3_safety_invariants` before opening the draft PR.
