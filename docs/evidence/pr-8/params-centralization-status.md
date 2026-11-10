# PR-8 Parameter Centralization Status

## Scope completed

`src/engine/params.ts` now owns the frozen V3 engine parameter set used by the manifest and strategy engine. The first green slice centralizes engine windows, ATR, BOS/CHoCH, imbalance lookbacks, order-block POC bounds, breaker z-score/sample, liquidity tolerances, Gate 4 legacy window, OTE, news window, MFCI threshold and MFCI weights. Existing engine-facing exports remain compatibility aliases.

`V3_CONFIG_SNAPSHOT` now reads the relevant values from `V3_STRATEGY_PARAMS`. The canonical `CONFIG_HASH` is unchanged because the serialized values and snapshot shape are unchanged.

## Verification

- Red contract captured before implementation: `src/engine/params.ts` was missing and `test/pr8_params_centralization.test.ts` failed with `ERR_MODULE_NOT_FOUND`.
- Green params contract: pass.
- `npm run lint`: pass.
- `npm run build`: pass.
- `npm test`: pass, exit code 0. The real-provider integration test remains explicitly reported as `SKIPPED` unless `P3_LIVE_INTEGRATION=1`; no suite portion was silently removed.
- V3 safety invariants: pass.
- Gate 4 golden parity: pass, 24,024 cases; non-G4 gates/stages/MFCI unchanged.
- R8 Gate 4 compare: pass.
- R8 historical fetch/core: pass.

## Current identity

- Baseline `CONFIG_HASH`: `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003`
- Current `CONFIG_HASH`: `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003`
- Baseline engine fingerprint: `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7`
- Current engine fingerprint: `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7` (unchanged because the current fingerprint contract is derived from the active canonical identity, not raw source text).

## Remaining issue

Stage score bands and a small number of formula/display literals remain inline in `strategyV3Engine.ts` (for example pool score bands, wick score bands, momentum score bands, and normalization divisors). They are behavior-preserving in this slice and remain covered by the golden/safety tests, but they should be moved into `params.ts` in the next centralization pass before PR-8 is marked complete.
