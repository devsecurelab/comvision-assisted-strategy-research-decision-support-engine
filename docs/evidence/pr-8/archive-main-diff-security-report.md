# PR-8 Archive vs Main and Repository Security Report

**Report date:** 2026-11-12

**Repository:** `devsecurelab/comvision-assisted-strategy-research-decision-support-engine`

## Scope and refs

This report compares the archived PR-8 working-branch tip with the current default branch.

| Ref | SHA | Meaning |
|---|---|---|
| `archive/engine-i-batch-2026-10-pr-8` | `73493313fd6fa5ce09415fc4f1d8b4be9318a133` | Exact original PR #32 head; preserved archive of the working branch |
| `main` | `c334d631bdc3a0f77f896b7a4b7ffeeaedc1d2af` | Current default branch after PR #32 and PR #33 |
| Common ancestor | `00790a5ae73a271f6424dee042c4f607de6939ce` | Merge base used for the comparison |

PR #32 is merged. The original remote working branch `engine/i-batch-2026-10-pr-8` is deleted; the archive branch is the retained reference.

## Code and commit difference

The archive contains the complete PR-8 implementation history. `main` is ahead of the archive by the PR #32 merge commit and the PR #33 documentation/ownership merge commit:

1. `57a61e8b052704f7ae5f7c0e51b7abce073d9b7f` — `fix: remediate PR-8 identity and npm audit findings`
2. `c334d631bdc3a0f77f896b7a4b7ffeeaedc1d2af` — `docs: refresh test and branch protection records (#33)`

The direct tree diff `archive..main` is documentation and repository-policy metadata only:

| Change | Lines added | Lines removed | Summary |
|---|---:|---:|---|
| `.github/CODEOWNERS` | 4 | 0 | Adds `* @devsecurelab` as the default code owner and documents the intended required-Code-Owners setting |
| `docs/evidence/pr-8/branch-protection-checklist.md` | 67 | 47 | Replaces stale PR-32 Draft/pending-CI claims with the merged-main state, current CI evidence, required policy, and the private-plan API limitation |
| `docs/evidence/pr-8/old-tests-expected-behavior.md` | 5 | 5 | Corrects the test register: auth hardening, storage recovery, and Twelve Data-only tests are included in `npm test`; live-provider execution remains explicitly opt-in/skipped without credentials |
| **Total** | **76** | **52** | **3 files changed** |

No engine implementation file, production source file, test implementation, or dependency file differs between the archive tip and current `main` in this direct comparison. The implementation work remains represented by the archived PR-8 commit chain and is present in `main` through PR #32.

## Repository visibility and general settings

Verified through GitHub API on 2026-11-12:

- Visibility: **Private**
- Default branch: `main`
- Repository is not archived
- Issues: enabled
- Wiki: disabled
- Discussions: disabled
- Delete branch on merge: disabled
- GitHub security policy file: not present; `isSecurityPolicyEnabled: false`
- Dependabot configuration file: not present at `.github/dependabot.yml`
- Active workflow: `.github/workflows/ci.yml` — `Node CI and npm audit`
- `.github/CODEOWNERS` exists on `main` and assigns all paths to `@devsecurelab`

## Security feature checks

The following results are API observations, not assumptions:

| Feature | Observed status | Evidence / limitation |
|---|---|---|
| `npm audit` | PASS in the latest CI | The post-merge `main` workflow passed the canonical npm audit job with zero findings in the previously recorded validation |
| GitHub vulnerability alerts | **Enabled** | The enablement script returned success; verification request returned HTTP 204 No Content. |
| Automated security fixes | **Enabled** | The enablement script enabled the feature and its verification step returned `enabled: true`. |
| Secret scanning | **Not verifiable** | Alerts endpoint returned 403 “Resource not accessible by integration”; no positive enabled-state evidence was available |
| Code scanning | **Disabled / not configured** | Alerts endpoint returned 403 with “Code scanning is not enabled for this repository” |
| Security policy | **Not configured** | `SECURITY.md` was not found and repository metadata reported `isSecurityPolicyEnabled: false` |

## Branch protection status

The requested protection configuration was successfully applied and verified through the API while the repository was temporarily public, before visibility was restored to private. The applied target included:

- pull request required
- strict up-to-date branch requirement
- required checks: `Node 22 / npm validation`, `Node 24 / npm validation`, `npm audit report (canonical Node)`
- at least one approving review
- stale approval dismissal
- required Code Owners review
- administrator enforcement
- force pushes disabled
- branch deletion disabled
- conversation resolution required

After the repository was returned to **private**, `GET /repos/{owner}/{repo}/branches/main/protection` returned:

> Upgrade to GitHub Pro or make this repository public to enable this feature.

Therefore the current private-repository enforcement state cannot be independently read or re-verified with the available GitHub plan/token. This report records the last successful public-state apply/verification and does **not** falsely claim that the rules are currently observable while private.

## Enablement script

The repository now includes [`scripts/enable-github-security-features.sh`](../../../scripts/enable-github-security-features.sh). Run it with an authenticated GitHub CLI session:

```bash
./scripts/enable-github-security-features.sh devsecurelab/comvision-assisted-strategy-research-decision-support-engine
```

The script enables and then verifies both vulnerability alerts and automated security fixes. It fails closed with the GitHub plan/permission remediation when the private-repository API returns 403.

## Follow-up actions

1. Keep the archive branch as the immutable historical reference unless a retention policy says otherwise.
2. Upgrade the GitHub plan, use an organization plan with private-repository protection support, or temporarily make the repository public if current branch-protection verification is required again.
3. Consider adding Dependabot, secret scanning, and code scanning after confirming plan support.
4. Add a `SECURITY.md` policy if the repository will accept vulnerability reports.
5. Merge this report through the normal pull-request workflow so the evidence itself is retained on `main`.
