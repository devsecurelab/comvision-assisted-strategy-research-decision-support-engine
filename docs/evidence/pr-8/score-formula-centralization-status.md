# PR-8 Score Band and Formula Centralization Status

## Completed

The V3 stage score bands and strategy formula constants are represented in `V3_STRATEGY_PARAMS`. The engine reads those values for structure, BOS, CHoCH, FVG/IFVG/BPR, order block, breaker, liquidity sweep/pools, Gate 4 equilibrium, OTE, wick, momentum, session/kill-zone, and MFCI normalization.

The refactor preserves existing values, comparison directions, formulas, and decision output. No strategy threshold or owner rule changed. The active generated config snapshot now hashes the complete canonical parameter object; config and engine hashes intentionally rotate due to the schema change, while the prior identity tuple is retained for historical ledger verification.

## Red-to-green evidence

`test/pr8_params_scores_formulas.test.ts` protects centralized score/formula values. `test/pr8_snapshot_legacy_backward_read.test.ts` verifies canonical snapshot generation, config hashing, and engine fingerprint binding. Historical ledger compatibility is covered by `test/pr8_ledger_fingerprint.test.ts`.

## Verification results

- Focused parameter, source-of-truth, snapshot, ledger-read, and V3 safety contracts: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- Full `npm test`: PASS (exit code 0); complete output archived in `final-npm-test.txt`
- Gate 4 golden parity baseline: 24,024 cases; final suite result pending
- R8 Gate 4 compare and historical core: PASS
- Live provider integration remains explicitly `SKIPPED` unless `P3_LIVE_INTEGRATION=1`

## Current identity

- `CONFIG_HASH`: `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652`
- `ENGINE_FINGERPRINT`: `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723`
- `V3_PARAMS_CANONICAL_HASH`: `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`

Generic implementation mechanics (time-unit multipliers, array/index loop bounds, zero/one clamps, cryptographic/display precision, and text-only formula descriptions) remain excluded from strategy parameters because they do not change the frozen rule set.
