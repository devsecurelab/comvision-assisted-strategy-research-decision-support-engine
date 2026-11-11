# PR-8 Local Completion Summary

**Baseline:** PR-8 documented baseline/final evidence from `09bad15` and the current canonical identity evidence.

**Current revision:** `55fcb9d` plus the uncommitted isolated-server readiness fix (Node 22 local validation complete; CI rerun pending).

**Local environment:** Node `v22.23.4`, npm `10.9.9`, Linux x64.

| Check | Result | Baseline | Current | Status |
|---|---|---|---|---|
| `CONFIG_HASH` | Canonical engine identity | `0a2418d28d76710e9fdae9ce54a4be3a6d9c1004695496d2068631f9cc6a1003` | `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652` | PASS — documented canonicalization/epoch change |
| Engine fingerprint | Deterministic engine identity | `7ff16d8643ca931963e31936da624d265a3417ed2799dc4ad454f6a8195435e7` | `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723` | PASS — `npm run engine:fingerprint`, params/fingerprint verification true |
| R8 golden count | R8 regression/golden coverage | Preserved | Preserved; full suite passed | PASS |
| Gate 4 parity | Golden parity and non-G4 invariants | `24,024` cases; `changed=15,079`; `PASS->BLOCKED=8,110`; `BLOCKED->PASS=6,969` | Same counts; non-G4 gates/stages/MFCI unchanged | PASS |
| `v3_safety_invariants` | Eight safety assertions | 8/8 pass | 8/8 pass | PASS |
| Node 22 | Install/lint/build/test runtime | Previous CI run failed in `pr_a_owner_regressions` readiness | `v22.23.4`; lint, build, targeted owner regression and full `npm test` pass after fix | PASS locally; CI rerun pending |
| Node 24 | Install/lint/build/test runtime | CI matrix configured; previous CI run failed in the same readiness test | n/a locally — Node 24 is not installed; pre-fix CI had setup/ci, lint and build pass but full test failed at readiness | PENDING CI rerun; pre-fix failure resolved locally |
| lint | `npm run lint` | PASS | PASS | PASS |
| build | `npm run build` | PASS | PASS | PASS |
| `full test` | `npm test` | PASS | PASS, exit code 0 after readiness fix | PASS |
| `auth_hardening` | Focused authentication regression | PASS in documented PR-8 runtime evidence | PASS, exit code 0 | PASS |
| `storage_recovery` | Focused storage recovery regression | PASS in documented PR-8 runtime evidence | PASS, exit code 0 | PASS |
| `npm audit` | Dependency vulnerability scan | 6 findings: 4 moderate, 2 low | 0 vulnerabilities; 0 low/moderate/high/critical | PASS |

## Local gate disposition

All checks executed locally passed. The prior CI run `43104366909` failed on both Node 22 and Node 24 during `pr_a_owner_regressions.test.ts` because the isolated server exited before readiness. The fix removes the test's free-port-close/rebind TOCTOU race by letting the child server bind to port `0` and reporting its actual bound port; child output is also retained for actionable startup errors. Node 24 is not installed locally, so its post-fix result requires a new CI run.

The current result is therefore: **PASS for executed local checks; completion gate pending post-fix Node 24 CI confirmation.** A draft/open PR must not be described as completion-gate passed while any required check is failed or pending.

## Evidence commands

- `npm run engine:fingerprint`
- `ADMIN_BOOTSTRAP_PASSWORD=test-only-pr8-bootstrap-password npx tsx test/auth_hardening.test.ts`
- `npx tsx test/storage_recovery.test.ts`
- `npx tsx test/v3_safety_invariants.test.ts`
- `npx tsx test/gate4_pr_b_equivalence.test.ts`
- `npx tsx test/r8_gate4_compare.test.ts`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm audit`

## Readiness remediation

- **Root cause:** the test reserved a free TCP port, closed the listener, and then asked the child server to rebind it. That TOCTOU window can produce an early child exit in CI. Because child stdout/stderr were discarded, the harness reported only a generic readiness error.
- **Fix:** `test/pr_a_owner_regressions.test.ts` now starts the child with `--port 0`, parses the actual port from the server's startup line, and includes captured stdout/stderr when startup fails. `server.ts` now logs the actual bound port returned by `listener.address()`, including when the requested port is `0`.
- **Post-fix local checks:** targeted `pr_a_owner_regressions` PASS; `npm run lint` PASS; `npm test` PASS; `npm run build` PASS; `npm audit` PASS with zero vulnerabilities.
