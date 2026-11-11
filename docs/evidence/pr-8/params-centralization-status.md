# PR-8 Parameter Centralization Status

## Scope completed

`src/engine/params.ts` owns the frozen V3 engine parameter set used by the strategy engine and generated configuration snapshot. The centralized set covers engine windows, ATR, BOS/CHoCH, imbalance lookbacks, order-block POC bounds, breaker z-score/sample, liquidity tolerances, Gate 4 legacy window, OTE, news window, MFCI threshold and weights, score bands, and formulas. Existing engine-facing exports remain compatibility aliases.

`V3_CONFIG_SNAPSHOT` now embeds the complete canonical `V3_STRATEGY_PARAMS` object and its parameter hash rather than maintaining a manually flattened copy of selected parameters. `ENGINE_SNAPSHOT` is generated from that config plus its config hash and engine fingerprint.

## Verification

- Parameter centralization contracts: PASS
- Generated snapshot / fingerprint contract: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- Full `npm test`: PASS (exit code 0); complete output archived in `final-npm-test.txt`
- Gate 4 parity baseline: 24,024 cases; exact final suite result pending
- R8 core/golden and `v3_safety_invariants`: PASS
- Real-provider integration remains explicitly `SKIPPED` unless `P3_LIVE_INTEGRATION=1`

## Current identity

- Previous projection `CONFIG_HASH`: `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003`
- Current canonical `CONFIG_HASH`: `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652`
- Previous engine fingerprint: `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7`
- Current engine fingerprint: `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723`
- Parameter values and strategy behavior remain unchanged; the new hash records the complete canonical snapshot schema. The old identity tuple is retained for historical ledger verification.

All inventoried score bands and formula constants are represented in `V3_STRATEGY_PARAMS`. Utility mechanics, serialization limits, and display precision remain excluded from the frozen strategy parameter object.
