# PR-8 Baseline and Golden Snapshot

Captured on the PR-8 branch before implementation changes.

## Identity

- Branch: `engine/i-batch-2026-10-pr-8`
- Base/main at capture: `00790a5ae73a271f6424dee042c4f607de6939ce`
- Strategy version: `RDP_STRATEGY_V3.0`
- Experiment: `EXP-2026-V3-REAL-001`
- Config hash: `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003`
- Config hash epoch: `V3_CANONICAL_2026-10-18_28ab43a2_bf1f14da`
- Session config hash: `28ab43a2980876392e94e2813e26f9186ba9b33542bec35e94d81d9f3f0f68b7`
- Market calendar hash: `bf1f14da807ed0ab8d2e14156a58d6c48825073604518ea046e88c8d3483d3eb`
- Engine fingerprint: `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7`

The full canonical V3 configuration snapshot is in `config-and-fingerprint.json`.

## Golden snapshot

The immutable source fixture is `test/fixtures/golden-b90004f.json`, copied into this directory as `golden-b90004f.json`.

- Golden baseline identifier: `b90004f`
- Schema: `finalAction`, `systemDecision`, `mfci`, `stagePasses`, `gateStatuses`
- Ideal cases: 24
- Random groups: 4
- Random cases: 24,000
- Total golden cases: 24,024
- Source SHA-256: `37d7ffe1f2a8ee52687ce28e7da95afdce5271733f995058c3e36817fa619902`

The full R8/Gate 4 test output reports unchanged golden execution across 24,024 cases. It also records Gate 4 parity as `changed=15079`, `PASS->BLOCKED=8110`, and `BLOCKED->PASS=6969`, with non-G4 gates, stages and MFCI unchanged.

## Baseline validation

- `npm ci`: completed; npm reported 15 audit vulnerabilities (3 low, 8 moderate, 4 high).
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: passed; all suites listed in the package script ran. A coverage inventory is saved in `test-coverage-inventory.txt`; the four suites not directly listed there were run separately and their raw outputs are preserved.
- `auth_hardening.test.ts`: passed separately with a test-only bootstrap password, because the fail-closed runtime policy rejects an unset `ADMIN_BOOTSTRAP_PASSWORD` before test assertions load.
- `storage_recovery.test.ts`, `pr5_twelve_data_only.test.ts`, and `gate_renumber_equivalence.test.ts`: passed separately. Gate renumber equivalence is also invoked through `npm run test:gate-renumber` in the package test chain.
- Gate renumber equivalence: passed across 24,024 `b90004f` decisions.
- Gate 4 golden parity: passed across 24,024 cases.
- R8 Gate 4 A/B comparison: passed using the test's synthetic fixture data.
- `v3_safety_invariants`: passed for determinism, closed-candle enforcement, zero lookahead, scale invariance, no zero-fill, data integrity and forbidden-pattern checks.
- R8 core: passed for causal walk-forward mechanics, IS/OOS handling, baselines, N>=200 verdict rule, CSV/SHA-256, pagination and the no-fabrication `R8_NOT_RUN` guard.

The R8 live historical runner was not invoked in this baseline capture because no live Twelve Data history/API-key-backed run was requested. The saved R8 core and Gate 4 evidence is test-fixture evidence only and must not be represented as a live market-data performance result.

The npm audit command exited with status 1 because the baseline dependency tree reported 15 vulnerabilities (3 low, 8 moderate, 4 high). The complete raw JSON report is preserved in `npm-audit.json`; no automatic remediation was applied during baseline capture.

## Supporting files

- `git.txt` — branch and commit identity.
- `environment.txt` — capture time and runtime versions.
- `config-and-fingerprint.json` — canonical config and identity values.
- `golden-count.json` — machine-readable golden counts.
- `golden-b90004f.json` — copied golden fixture.
- `golden-sha256.txt` — fixture and lockfile checksums.
- `lint.txt`, `build.txt`, `npm-test.txt` — raw command output.
- `status.txt` — command exit statuses.
- `npm-audit.json` — raw npm audit report.
