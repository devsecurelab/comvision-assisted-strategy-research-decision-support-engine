# Main Branch Protection and CI Checklist

## Current repository state

- Repository: `devsecurelab/comvision-assisted-strategy-research-decision-support-engine`
- Protected target: `main`
- PR #32: **Merged**
- Merge commit: `57a61e8b052704f7ae5f7c0e51b7abce073d9b7f`
- Former working branch: `engine/i-batch-2026-10-pr-8` — deleted after merge
- Post-merge GitHub Actions run: [#43119553621](https://github.com/devsecurelab/comvision-assisted-strategy-research-decision-support-engine/actions/runs/43119553621) — **success**

## Required branch policy

The following is the required target configuration for `main`. The GitHub branch-protection and ruleset APIs currently return `403 Forbidden` because this repository is private and the available GitHub plan does not expose these settings. Therefore the enforcement rows remain **pending administrator configuration**, not falsely marked as verified.

| Requirement | Target configuration | Current status |
|---|---|---|
| Pull request required | Require a pull request before merging to `main` | **Pending admin configuration** — API returns 403 |
| Required status checks | Require `Node 22 / npm validation`, `Node 24 / npm validation`, and `npm audit report (canonical Node)` | **Workflow configured; enforcement pending** |
| Node 22 tests | Required job check; runs lint, build, full `npm test` | **CI pass; enforcement pending** |
| Node 24 tests | Required job check; runs lint, build, full `npm test` | **CI pass; enforcement pending** |
| lint | Covered by both Node matrix jobs through `npm run lint` | **Workflow configured** |
| build | Covered by both Node matrix jobs through `npm run build` | **Workflow configured** |
| full test | Covered by both Node matrix jobs through `npm test` | **Workflow configured** |
| Safety/parity/golden | Required transitively through `npm test`, including V3 safety, Gate 4 parity and 24,024-case golden checks | **Test coverage verified; enforcement pending** |
| Branch up to date | Require branches to be up to date before merging | **Pending admin configuration** |
| Force pushes | Disable force pushes to `main` | **Pending admin configuration** |
| Required review count | Require at least 1 approving review | **Pending admin configuration** |
| Stale review dismissal | Dismiss stale approvals after new commits | **Pending admin configuration** |
| CODEOWNERS review | Require review from the configured CODEOWNERS owner | **CODEOWNERS added in this change; enforcement pending** |
| CI failure bypass | Disable administrator bypass where supported; do not merge failed/pending required checks | **Pending admin configuration** |

## CODEOWNERS

The repository owner is configured as the default owner in `.github/CODEOWNERS`:

```text
* @devsecurelab
```

When branch protection is available, enable **Require review from Code Owners** for `main`. If a separate review team is desired, replace `@devsecurelab` with the approved organization team before enabling enforcement.

## No-silent-skip policy

- `npm test` begins with `test:inventory`, which verifies that every repository `.test.ts` file is included in the test command.
- `auth_hardening.test.ts`, `storage_recovery.test.ts`, and `pr5_twelve_data_only.test.ts` are included in the current `npm test` chain.
- The live-provider portion of `p3_live_data_integration.test.ts` reports an explicit `SKIPPED` result unless `P3_LIVE_INTEGRATION=1` is enabled. Its offline/provider contract still runs.
- Any missing test inventory entry, test command error, or silently skipped suite must fail the Node validation job.

## Verified CI and local validation

- `npm ci`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run test:inventory`: PASS
- `npm test`: PASS
- `npm run audit:report`: PASS — zero vulnerabilities
- Node 22 GitHub Actions job: PASS
- Node 24 GitHub Actions job: PASS
- npm audit GitHub Actions job: PASS
- Gate 4 parity/golden: 24,024 cases PASS
- V3 safety and R8 regression suites: PASS

## Configuration steps once GitHub plan/API access is available

1. Configure branch protection or a repository ruleset targeting `main`.
2. Require pull requests, at least one approval, stale-review dismissal, CODEOWNERS review, up-to-date branches, and the three required status checks.
3. Disable force pushes and administrator bypass where supported.
4. Verify the settings through GitHub UI or the branch-protection/ruleset API.
5. Re-run the required checks after every subsequent commit.

## Remaining limitation

This checklist documents the desired and verified state, but it cannot enable GitHub branch protection while the private repository plan/API returns `403 Forbidden`. Enabling enforcement requires upgrading the repository plan or changing repository visibility, followed by administrator configuration.
