# PR-8 final validation and baseline comparison

Generated after the final clean install and full test run on 2026-11-12.

## Required commands

| Command | Result |
|---|---|
| `npm ci` (`--no-audit --no-fund`) | PASS; 503 packages installed from lockfile. |
| `npm run lint` | PASS (`tsc --noEmit`). |
| `npm run build` | PASS (Vite PWA and server bundle generated). |
| `npm test` | PASS (exit code 0), including `auth_hardening`, `storage_recovery`, `pr5_twelve_data_only`, and every other repository `.test.ts` suite. |
| `npm run engine:fingerprint` | PASS; canonical params hash and engine fingerprint verified. |

## Coverage and skips

The repository-wide inventory guard found 52 executable `*.test.ts` files in the `test/` directory and verified that all 52 are referenced by `npm test` or its nested `test:gate-renumber` command. Excluded test files: zero. No other test or `__tests__` directory exists. Fixture/helper files are not suites.

The sole conditional skip is the real-provider subcheck `p3_live_provider`, which reports `SKIPPED` unless `P3_LIVE_INTEGRATION=1` is set. The containing integration contract suite ran and passed; live credentials/network use were not enabled.

## Baseline equivalence

- Golden baseline `b90004f`: 24,024 cases before and after; fixture SHA-256 remains `37d7ffe1f2a8ee52687ce28e7da95afdce5271733f995058c3e36817fa619902`.
- Gate 4 parity: baseline and current both report 24,024 cases, `changed=15079`, `PASS->BLOCKED=8110`, `BLOCKED->PASS=6969`; non-G4 gates, stages, and MFCI are unchanged.
- `v3_safety_invariants`: same eight assertions pass in baseline and current output: same-candle determinism, closed decision candle, zero lookahead, scale invariance, no zero-fill, data integrity, forbidden patterns, and environment-example secret scan.
- Strategy-parameter hash remains `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`, matching the recorded PR-8 baseline parameter hash; score/formula contracts and golden equivalence passed. No strategy threshold was changed.

## Identity change and reason

| Identity | PR-8 baseline | Final |
|---|---|---|
| `CONFIG_HASH` | `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003` | `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652` |
| `CONFIG_HASH_EPOCH` | `V3_CANONICAL_2026-10-18_28ab43a2_bf1f14da` | `V3_CANONICAL_2026-11-12_28ab43a2_bf1f14da` |
| `ENGINE_FINGERPRINT` | `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7` | `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723` |
| Canonical params hash | `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2` | `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2` |

The config hash/fingerprint change is limited to canonicalization/centralization: the generated snapshot now commits the complete canonical parameter object and its hash instead of a second manually flattened projection, with a new schema epoch. The strategy parameter hash is unchanged, and expected equivalence is demonstrated by unchanged golden count, Gate 4 comparison, safety assertions, and frozen parameter tests.

## Evidence files

- `final-npm-ci.txt`, `final-npm-lint.txt`, `final-npm-build.txt`, `final-npm-test.txt` — raw command logs.
- `test-suite-inventory.txt` — complete inclusion list and documented skip.
- `engine-fingerprint.txt`, `current-identity.txt` — final generated identity verification.
