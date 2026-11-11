# PR-8 V3 Source-of-Truth and Fingerprint Status

## Scope completed

The active pipeline no longer exports or executes the retired legacy stage calculators. `executeStrategyPipeline` now validates input, calls `evaluateStrategyV3` once, and projects the resulting V3-native decision into the existing telemetry envelope for backward-readable fields. The projection does not recalculate structure, FVG, order block, wick, momentum, liquidity, news, or gate decisions. `chatService` now obtains higher-timeframe bias through `deriveHtfBias` from the V3 engine instead of the retired pipeline helpers.

`decision_engine_v3` is the authoritative decision record. Gate, stage, MFCI, binary signal, final action, status, and first-failed-gate values are taken from that record. Legacy-compatible fields are projections or unavailable markers only; they are not a second source of truth.

## Canonical identity

- `CONFIG_HASH`: `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003`
- `CONFIG_HASH_EPOCH`: `V3_CANONICAL_2026-10-18_28ab43a2_bf1f14da`
- `V3_PARAMS_CANONICAL_HASH`: `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`
- `ENGINE_FINGERPRINT`: `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7`
- Canonical params JSON size: `2091` UTF-8 bytes

`src/engine/params.ts` now exports the stable canonical JSON and SHA-256 params hash. `scripts/engine-fingerprint.ts`, exposed as `npm run engine:fingerprint`, verifies both the params hash and the manifest fingerprint payload.

## Verification

- `npm run lint`: PASS
- V3 source-of-truth/fingerprint red-to-green contract: PASS
- Gate 4 parity: PASS; 24,024 cases; non-G4 gates/stages/MFCI unchanged
- R8 Gate 4 comparison: PASS
- R8 core/golden: PASS
- `v3_safety_invariants`: PASS
- Full `npm test`: PASS
- Live Twelve Data integration: explicit `SKIPPED` unless `P3_LIVE_INTEGRATION=1`

## Remaining issue

No implementation blocker remains for this scope. The live-provider integration remains credential-gated by design and is not silently treated as a passing live request.
