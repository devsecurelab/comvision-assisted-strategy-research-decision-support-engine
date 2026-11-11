# PR-8 V3 Source-of-Truth and Generated Snapshot Status

## Scope completed

`executeStrategyPipeline()` validates inputs, calls `evaluateStrategyV3()` once, and treats its native nine-gate/nineteen-stage telemetry as the sole decision-calculation source. The retired legacy pipeline calculators remain removed. New pipeline results no longer write `validation_metrics` or `pressure_observation`; both are optional historical-read fields only. The existing telemetry envelope retains adapter/context fields consumed by the application. `chatService` obtains higher-timeframe bias through the V3 `deriveHtfBias()` implementation.

The active configuration snapshot is generated directly from `V3_STRATEGY_PARAMS`, its canonical JSON hash, and the session/market-calendar hashes. No separate hand-mapped list of active strategy parameters is maintained. `ENGINE_SNAPSHOT` combines that generated config with the derived config hash and engine fingerprint. The fingerprint payload binds strategy version, config hash/epoch, parameter hash, session hash, and market-calendar hash.

## Canonical identity

- `CONFIG_HASH`: `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652`
- `CONFIG_HASH_EPOCH`: `V3_CANONICAL_2026-11-12_28ab43a2_bf1f14da`
- `V3_PARAMS_CANONICAL_HASH`: `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`
- `ENGINE_FINGERPRINT`: `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723`
- Canonical params JSON size: `2091` UTF-8 bytes

The prior PR-8 projection identity (`0a2418d…a1003` / `7ff16d86…5435e7`) remains explicitly identified for historical reads. Ledger verification accepts that exact previous config-hash, epoch, and engine-fingerprint tuple; unknown/stale fingerprints still fail closed. Older entries without a fingerprint remain readable.

`scripts/engine-fingerprint.ts`, exposed as `npm run engine:fingerprint`, emits and verifies the complete generated engine snapshot as well as params and identity hashes. Full command output is recorded in `docs/evidence/pr-8/engine-fingerprint.txt`.

## Verification

- Focused generated-snapshot/source-of-truth tests: PASS
- Focused previous-ledger-identity compatibility test: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- Full `npm test`: PASS (exit code 0); complete output archived in `final-npm-test.txt`
- Gate 4 parity: PASS; 24,024 cases; non-G4 gates/stages/MFCI unchanged
- Live Twelve Data integration remains explicitly `SKIPPED` unless `P3_LIVE_INTEGRATION=1`
