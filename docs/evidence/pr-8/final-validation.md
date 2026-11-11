# PR-8 final validation and baseline comparison

Generated after npm metadata and lockfile changes on 2026-11-12.

## Runtime and CI policy

- Canonical local Node version: `.nvmrc` = `22`.
- Supported engines: `package.json` and `package-lock.json` both declare `node >=22 <25`.
- GitHub Actions matrix: Node 22 and Node 24. Each matrix job runs, in order, `npm ci`, `npm run lint`, `npm run build`, and `npm test`.
- A separate canonical-Node audit job runs `npm run audit:report`; it uploads the dated JSON/Markdown reports even when the audit command exits nonzero. Audit findings are not suppressed.
- `package-lock.json` is the committed authoritative npm lockfile. After `npm ci` resolved it successfully, the unused `bun.lock` was removed; no `bun.lockb` remains.

## Required validation

| Command | Result |
|---|---|
| `npm ci` | PASS from committed `package-lock.json`. |
| `npm run lint` | PASS (`tsc --noEmit`). |
| `npm run build` | PASS (Vite/PWA and server bundle). |
| `npm test` | PASS, exit code 0; 52/52 executable test files included. |
| `npm run test:gate-renumber` | PASS; 24,024 `b90004f` decisions unchanged. |
| `npm run engine:fingerprint` | PASS; canonical parameter hash and engine fingerprint verified. |

The only conditional test skip is the real-provider subcheck `p3_live_provider`, which reports `SKIPPED` unless `P3_LIVE_INTEGRATION=1`; the containing integration contract test ran and passed. Excluded suites: zero. Full inventory is in `test-suite-inventory.txt`.

## Baseline equivalence

- Golden baseline `b90004f`: 24,024 cases before and after; source fixture SHA-256 remains `37d7ffe1f2a8ee52687ce28e7da95afdce5271733f995058c3e36817fa619902`.
- Gate 4 parity: baseline and current both report 24,024 cases, `changed=15079`, `PASS->BLOCKED=8110`, `BLOCKED->PASS=6969`; non-G4 gates, stages, and MFCI are unchanged.
- `v3_safety_invariants`: same eight assertions pass in baseline and current output—same-candle determinism, closed decision candle, zero lookahead, scale invariance, no zero-fill, data integrity, forbidden patterns, and environment-example secret scan.
- Canonical strategy parameter hash remains `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`; no threshold changed.

## Identity change and reason

| Identity | PR-8 baseline | Final |
|---|---|---|
| `CONFIG_HASH` | `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003` | `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652` |
| `CONFIG_HASH_EPOCH` | `V3_CANONICAL_2026-10-18_28ab43a2_bf1f14da` | `V3_CANONICAL_2026-11-12_28ab43a2_bf1f14da` |
| `ENGINE_FINGERPRINT` | `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7` | `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723` |

The config hash/fingerprint change is limited to canonicalization/centralization: the generated snapshot records the full canonical parameter object and hash instead of a separately flattened projection, with a new schema epoch. The parameter hash and equivalence outputs remain unchanged.

## npm audit outcome and risk disposition

The initial lockfile audit reported 15 findings (4 high, 8 moderate, 3 low, 0 critical). `npm audit fix` applied only semver-compatible updates and removed all four high findings plus three other findings. The final audit still exits 1 with **6 findings: 0 critical, 0 high, 4 moderate, 2 low**.

The remaining findings are in the PWA/Workbox build-tool dependency chain: direct `vite-plugin-pwa` plus transitive `workbox-build`, `glob`, `minimatch`, `deepmerge`, and `@rollup/plugin-node-resolve`. npm's only suggested automatic fix is a semver-major downgrade of `vite-plugin-pwa` from 1.3.0 to 1.1.0. **Accepted temporarily for PR-8:** do not force an untested major downgrade that may alter service-worker generation. Track a compatibility-tested PWA toolchain upgrade/replacement as follow-up. No high/critical finding remains. The CI audit job deliberately remains failed while these findings exist and uploads full evidence; it is not presented as green.

The dated machine-readable and human-readable report is `docs/evidence/npm-audit-2026-11-11.json` and `.md` (UTC filename date). The Markdown includes severity, package, dependency directness, affected range, advisories, and fix availability.

## Raw logs

- `runtime-final-npm-ci.txt`
- `runtime-final-npm-lint.txt`
- `runtime-final-npm-build.txt`
- `runtime-final-npm-test.txt`
- `test-suite-inventory.txt`
- `engine-fingerprint.txt`
