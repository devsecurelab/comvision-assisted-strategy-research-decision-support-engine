# PR-8 Legacy Optional Reads and Unused Inputs Status

## Completed

`customSettings` and `liveTickPressure` were removed from `PipelineInput`. Neither field participated in the V3-native decision calculation after the legacy pipeline removal; retaining them would have suggested that a caller-controlled threshold or tick proxy could affect the active engine. The pipeline now emits the compatibility `pressure_observation` as unavailable rather than calculating or accepting a legacy pressure input.

A centralized read-only helper, `src/engine/legacyTelemetry.ts`, now handles historical aliases at read boundaries. It never writes aliases and never feeds a new V3 decision. Supported compatibility mappings include:

- `user_recorded_action` ↔ historical `userAction`
- `signal_outcome` ↔ historical `outcome`
- `next_candle_observation` ↔ historical `nextCandle`
- historical next-candle open/close aliases

Analytics uses this helper when resolving archived outcome and action records. Existing canonical V3 fields remain preferred; legacy aliases are fallback reads only. Historical `WIN`/`LOSS` values are still normalized to frozen `NEXT_CANDLE_FAVORABLE`/`NEXT_CANDLE_UNFAVORABLE` research semantics.

## Verification

- Red contract captured before implementation: `docs/evidence/pr-8/legacy-read-inputs-red-test.txt`
- Focused legacy-read/input contract: PASS
- `npm run lint`: PASS
- Gate 4 parity: PASS; 24,024 cases; non-G4 gates/stages/MFCI unchanged
- R8 Gate 4 comparison: PASS
- R8 core/golden: PASS
- `v3_safety_invariants`: PASS
- Full `npm test`: PASS
- Live provider integration: explicit `SKIPPED` unless `P3_LIVE_INTEGRATION=1`

No strategy threshold, parameter, golden count, Gate 4 parity rule, or safety invariant was changed.
