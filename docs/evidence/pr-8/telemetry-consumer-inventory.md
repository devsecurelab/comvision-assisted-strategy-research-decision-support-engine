# PR-8 V3 Telemetry Producer–Consumer Inventory

This inventory records the source-of-truth rule, direct consumers, and compatibility behavior after the PR-8 removals. The consumer search was run before removing legacy projections and unused inputs, then repeated after implementation.

**Verification update: 2026-11-12.** Source references and test anchors were rechecked against the current PR-8 branch. The companion expected-behavior register is `docs/evidence/pr-8/old-tests-expected-behavior.md`.

## Source-of-truth rule

`executeStrategyPipeline()` calls `evaluateStrategyV3()` once. Its native gates, stages, MFCI, binary signal, status reason, and operational guards are the only decision-calculation source for new V3 records. `validation_metrics` and `pressure_observation` are optional historical fields: new pipeline outputs do not write them, and tracker writes strip them before persistence. A read-only helper provides old records to backward-compatible consumers. Legacy data cannot create a new V3 signal or PASS.

## Producers and persistence

| Producer | Source | Output / hand-off | Status |
|---|---|---|---|
| V3 evaluator | `src/engine/strategyV3Engine.ts:evaluateStrategyV3` | Native `V3DecisionTelemetry` with nine gates, nineteen stages, MFCI, `binarySignal`, and status | Sole decision calculator |
| Pipeline adapter | `src/engine/pipeline.ts:executeStrategyPipeline` | V3 decision plus metadata, application context, guards, and observation state; no new `validation_metrics` or `pressure_observation` | Single authoritative adapter |
| Manual scan and R8 backtest | `src/engine/scanScheduler.ts:scanPairCore`; `src/engine/r8Backtest.ts:runCausalBacktest` | Scan/API output and causal bars derived from the same pipeline | V3-native |
| Experiment tracker | `src/engine/experimentTracker.ts:recordCandidate` | New candidate persistence strips historical projections; verification reads them for old hash-chain payloads | V3-only writes; historical verification compatible |
| Signal ledger identity layer | `src/engine/signalLedger.ts:identityMetadata` | Config hash/epoch, parameter- and engine-derived identity, session/calendar hashes | Current identity attached to new events |

## Consumer map and required behavior

| Consumer | Source | V3/native fields | Required behavior |
|---|---|---|---|
| Scanner result/status and signal creation | `src/engine/scanScheduler.ts` | `decision_engine_v3.binarySignal`, `statusReason`, MFCI, metadata, context | Signal and status follow V3; no legacy decision fallback |
| Notification and chat | `src/server/notificationService.ts`, `src/server/chatService.ts` | V3 gates, binary signal, MFCI, provenance, actual timeframe | Format authoritative telemetry; unavailable values remain unavailable |
| Analytics | `src/server/analyticsService.ts` | Candidate observations and persisted outcome/action fields | Canonical V3 fields preferred; old action/outcome aliases read only |
| Decision and binary UI | `DecisionAlertCard.tsx`, `BinaryStatusCard.tsx`, `TelemetryModal.tsx` | V3 decision, gates, status, metadata | No legacy PASS/signal or fabricated prices/risk |
| Chart UI | `ChartModal.tsx` | Stored candle snapshot and V3 signal timestamp; legacy zone via `readLegacyOptional()` | Current missing legacy zone is shown unavailable; old stored zone can render |
| Setup log/feed | `SetupLogsTable.tsx`, `ValidSetupsFeed.tsx`, `ValidSetupsModal.tsx` | V3 decision/reason and candidate context | V3 reason preferred; old pressure/validation data read only when present |
| Experiment view/API export | `ExperimentView.tsx`, `server.ts:/api/engine/export-telemetry` | Active generated identity and persisted candidate records | Export/display only; no recalculation |
| Ledger audit API | `server.ts:/api/audit/verify-signal-ledger` | Event hashes and engine identity | Validates persisted identity; no strategy recomputation |

## Legacy fields and read boundaries

| Historical field/path | Current boundary | Permitted use | New-write rule |
|---|---|---|---|
| `validation_metrics` | Optional `MasterTelemetry`; chart/log UI and tracker verification access through `readLegacyOptional()` | Read archived chart/validation details and verify old hash-chain content | Not emitted by pipeline; stripped before tracker writes |
| `pressure_observation` | Optional `MasterTelemetry`; old UI records use `readLegacyOptional()` | Display archived pressure observation only | Not emitted by pipeline; stripped before tracker writes |
| `userAction`, `outcome`, `nextCandle`, next-candle price aliases | `legacyTelemetry.ts` and analytics/outcome readers | Query archived telemetry/outcomes where canonical fields are absent | Not used in a new decision; aliases are not generated as telemetry |
| Historical `WIN`/`LOSS` values | Analytics normalization | Translate archived operator outcomes to research observation semantics | Never substitutes for a newly observed candle outcome |
| Prior PR-8 config hash/fingerprint | Manifest compatibility constants; `signalLedger.ts:verify()` | Verify records created under the immediately previous PR-8 snapshot | Only the exact previous config hash, epoch, and fingerprint tuple is accepted; arbitrary stale identities fail |
| `V2_CONFIG_SNAPSHOT` / `LEGACY_CONFIG_HASH` | Archived manifest compatibility section | Historical config/record reading | Excluded from current config hash and V3 calculations |
| Removed `customSettings` / `liveTickPressure` inputs | Absent from `PipelineInput` and source/API contracts | None; callers cannot supply retired thresholds/tick pressure | Removed from API/schema and new calculation calls |

## Test coverage

The generated snapshot and backward-read boundary are covered by `test/pr8_snapshot_legacy_backward_read.test.ts`; the V3 source/fingerprint contract by `test/pr8_v3_source_of_truth_fingerprint.test.ts`; and the exact historical identity allowlist plus stale-fingerprint rejection by `test/pr8_ledger_fingerprint.test.ts`. New-output absence is also asserted by `test/pr_a_owner_regressions.test.ts`. Historical chart, storage, migration, and stats paths remain covered by `test/pr6_chart_modal.test.ts`, `test/pr2_durable_migration.test.ts`, `test/pr3_storage_operations.test.ts`, and `test/pr2_stats_parity.test.ts`.

The 24,024-case Gate 4 equivalence/parity and R8 regression tests continue to protect frozen strategy behavior. `docs/evidence/pr-8/test-suite-inventory.txt` identifies all included tests and the three explicit exclusions. Live provider integration remains skipped unless its credential-gated environment flag is enabled.

## Verification status

Pre-removal source search and consumer inventory were completed. After removal, searches found no pipeline/server write constructors for `validation_metrics` or `pressure_observation`, no `customSettings`/`liveTickPressure` source/API inputs, and only backward-read consumers for historical telemetry. Focused compatibility tests, lint, and production build passed. The full `npm test` suite passed (exit code 0), including 24,024-case Gate 4 parity, R8 regression tests, and `v3_safety_invariants`; the real-provider check reported its documented `SKIPPED` status.
