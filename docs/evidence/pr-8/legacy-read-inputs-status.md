# PR-8 Legacy Optional Reads and Unused Inputs Status

## Completed

`customSettings` and `liveTickPressure` are absent from `PipelineInput`, the source/API contracts, and new calls. Neither participates in V3-native decisions; keeping them would imply caller-controlled thresholds or a legacy tick proxy could affect the active engine.

`validation_metrics` and `pressure_observation` are now optional compatibility fields on `MasterTelemetry`. The pipeline no longer constructs or emits either projection for successful or fail-closed new records. `ExperimentTracker.recordCandidate()` strips both fields before hashing and persistence. Historical values remain accessible at read boundaries through `readLegacyOptional()` in the UI and tracker; stored historical hash chains use this same helper when verifying old records.

The centralized read-only helper, `src/engine/legacyTelemetry.ts`, continues to handle historical aliases without writing aliases or feeding a new V3 decision. Supported mappings include:

- `user_recorded_action` ↔ historical `userAction`
- `signal_outcome` ↔ historical `outcome`
- `next_candle_observation` ↔ historical `nextCandle`
- historical next-candle open/close aliases

Analytics keeps canonical V3 fields preferred and uses the compatibility helper only as fallback. Historical `WIN`/`LOSS` values remain normalized to frozen `NEXT_CANDLE_FAVORABLE`/`NEXT_CANDLE_UNFAVORABLE` research semantics.

## Verification

- Consumer search completed before removal; see `telemetry-consumer-inventory.md`
- Red-to-green generated-snapshot/backward-read test: `test/pr8_snapshot_legacy_backward_read.test.ts`
- New pipeline absence asserted by `test/pr_a_owner_regressions.test.ts`
- Historical chart/read and storage suites: PASS
- Exact prior ledger config/fingerprint tuple remains readable; mismatched stale identities fail closed
- `npm run lint`: PASS
- `npm run build`: PASS
- Full `npm test`: PASS (exit code 0); complete output archived in `final-npm-test.txt`
- Real-provider integration remains explicitly `SKIPPED` unless `P3_LIVE_INTEGRATION=1`

No strategy threshold, formula, Gate 4 parity rule, golden count, or V3 safety invariant was changed. The config-hash/fingerprint values changed only because the active canonical snapshot schema now covers the complete canonical parameter object; the previous identity remains a backward-read compatibility entry.
