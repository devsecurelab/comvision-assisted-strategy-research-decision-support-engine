# PR-8 Branch Protection and CI Checklist

## Current PR state

- PR: [#32](https://github.com/devsecurelab/comvision-assisted-strategy-research-decision-support-engine/pull/32)
- Draft: Yes
- Base: `main`
- Head: `engine/i-batch-2026-10-pr-8`
- Current head: `199e137`
- Final successful CI for the previous code/evidence head: [run #43110671736](https://github.com/devsecurelab/comvision-assisted-strategy-research-decision-support-engine/actions/runs/43110671736)
- CI for the latest summary-only head `199e137`: [run #43113188305](https://github.com/devsecurelab/comvision-assisted-strategy-research-decision-support-engine/actions/runs/43113188305); Node 22 and npm audit have passed, Node 24 was still running when this checklist was written.

The PR remains Draft. It must be marked **Ready for review** before merge; it must not be merged while Draft.

## Required PR and branch policy

| Requirement | Checklist | Current evidence/status |
|---|---:|---|
| Pull request required | [ ] | PR #32 exists against `main`; branch-protection enforcement could not be read because the GitHub API returned `403 Forbidden`. Admin confirmation required. |
| Required status checks enabled | [ ] | Admin confirmation required. The workflow exposes `Node 22 / npm validation`, `Node 24 / npm validation`, and `npm audit report (canonical Node)` as job checks. |
| Node 22 tests required | [ ] | Workflow job is configured; final prior run passed. |
| Node 24 tests required | [ ] | Workflow job is configured; final prior run passed; latest summary-only run was pending at capture time. |
| lint required | [ ] | Runs inside both Node matrix jobs as the `Lint` step (`npm run lint`); require the job checks rather than an unavailable standalone step check. |
| build required | [ ] | Runs inside both Node matrix jobs as the `Build` step (`npm run build`); require the job checks rather than an unavailable standalone step check. |
| full test required | [ ] | Runs inside both Node matrix jobs as the `Test` step (`npm test`); require the job checks. |
| Safety/parity/golden checks required | [ ] | Included in `npm test`: `v3_safety_invariants`, Gate 4 equivalence/parity, R8 compare/core and the 24,024-case golden set. Require Node 22/24 jobs, and do not create a bypass check that omits them. |
| Branch must be up to date before merge | [ ] | Admin confirmation required; branch-protection API unavailable. |
| Force pushes prohibited | [ ] | Admin confirmation required; branch-protection API unavailable. |
| Required review count | [ ] | Admin confirmation required; branch-protection API unavailable. Recommended minimum: 1 approving review. |
| Stale review dismissal | [ ] | Admin confirmation required; branch-protection API unavailable. Recommended: dismiss stale approvals after new commits. |
| CODEOWNERS review | [ ] | No `CODEOWNERS` file is present in the checked-out repository; add/configure one if owner review is required. |
| CI failure bypass prohibited | [ ] | Admin confirmation required; require branches to be up to date and required checks to pass, with administrator bypass disabled where supported. |

## No-silent-skip policy

- `npm test` begins with `test:inventory`, which verifies that all repository `.test.ts` files are included in the test command.
- `p3_live_provider` may print an explicit `SKIPPED` result when `P3_LIVE_INTEGRATION=1` is not enabled. This is credential-gated and documented, not silent; it must not be represented as a live-provider PASS.
- Any missing test inventory entry, test command error, or silently skipped suite must make the Node validation job fail. Do not weaken `test:inventory` or mark a failed job successful.

## Merge sequence

1. Confirm the latest head commit has completed Node 22, Node 24, npm audit, lint, build, full test, safety, parity and golden validation.
2. Confirm repository administrators have enabled the required branch-protection settings above.
3. Mark PR #32 **Ready for review**; do not merge while Draft.
4. Obtain the required review(s), including CODEOWNERS review if CODEOWNERS is configured.
5. Re-check that the branch is up to date and every required status check is green.
6. Merge only after all required checks and reviews pass. Never bypass a CI failure or a stale/pending required check.

## Known remaining issues / follow-up

- Branch-protection settings could not be independently verified from this token because GitHub returned `403 Forbidden`; repository-admin confirmation is still required.
- No `CODEOWNERS` file is currently present; add one only if repository policy requires owner-based review, then make that review required in branch protection.
- The latest summary-only commit triggered a new CI run; its Node 24 job must complete successfully before treating the current head as fully merge-ready.
- Live provider integration remains explicitly credential-gated and is not run by default; this is documented and separate from the deterministic regression gate.
