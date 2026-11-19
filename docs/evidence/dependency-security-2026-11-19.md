# Dependency-security follow-up — 2026-11-19

## Analysis

The 2026-11-18 baseline report recorded 12 high findings in the pre-PR-45 dependency graph. PR #45 already remediated that graph by moving build-only packages to `devDependencies`, upgrading the Vite/Tailwind toolchain, and removing the vulnerable PWA/Workbox chain. No additional dependency version change is required on the current `main` tree.

## Current audit

The current lockfile was installed with `npm ci` and checked with Node `v22.23.4` / npm `10.9.9`:

| Check | Result |
|---|---|
| `npm run audit:production` | PASS — 0 vulnerabilities |
| `npm run audit:full` | PASS — 0 vulnerabilities |
| Full evidence | [`npm-audit-2026-11-19.md`](npm-audit-2026-11-19.md) and adjacent JSON |

## Guard added by this follow-up

The CI audit job now runs `npm run audit:full` with `--audit-level=high` and fails the job when any high or critical advisory is present. The full audit evidence generation is no longer allowed to continue on error, so a future high-severity regression cannot be reported as an informational artifact only.

Historical audit reports remain unchanged as evidence of the prior vulnerable dependency graph.
