# PR-8 Score Band and Formula Centralization Status

## Completed

The remaining V3 stage score bands and strategy formula constants are now represented in `V3_STRATEGY_PARAMS`. The engine reads those values for structure, BOS, CHoCH, FVG/IFVG/BPR, order block, breaker, liquidity sweep/pools, Gate 4 equilibrium, OTE, wick, momentum, session/kill-zone, and MFCI normalization.

The changes preserve the existing values, comparison directions, formulas, and output behavior. No strategy threshold or owner rule was changed.

## Red-to-green evidence

`test/pr8_params_scores_formulas.test.ts` was run before implementation and failed because `V3_STRATEGY_PARAMS.scores` did not exist. After implementation, the same contract passed and was added to `npm test`, so it cannot be silently omitted from the suite.

## Verification results

- `npm run lint`: pass.
- Focused params, engine, and V3 safety tests: pass.
- Full `npm test`: pass, exit code 0.
- Gate 4 golden parity: pass for 24,024 cases; non-G4 gates/stages/MFCI unchanged.
- R8 Gate 4 compare: pass.
- R8 historical fetch/core: pass.
- P3 live-provider integration remains explicitly reported as `SKIPPED` unless `P3_LIVE_INTEGRATION=1`; it was not silently removed.

## Identity

`CONFIG_HASH` remains `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003`. `ENGINE_FINGERPRINT` remains `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7` under the current identity-based fingerprint contract.

## Deliberate exclusions

This pass does not move generic implementation mechanics into strategy parameters: time-unit multipliers, array/index loop bounds, zero/one clamps, cryptographic/display precision mechanics, and text-only formula descriptions remain inline. These do not alter the frozen strategy rule set. Any future centralization of those utilities should be a separate mechanical refactor with no strategy-hash change.
