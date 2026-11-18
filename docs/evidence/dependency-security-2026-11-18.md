# Dependency-security PR evidence — 2026-11-18

## Scope

This branch is based on `origin/main` and is intentionally separate from PR-5. Build-only tooling was upgraded and moved out of runtime dependencies. The application runtime dependency surface is therefore audited independently from the development/build toolchain.

## Changes

- Upgraded `vite` to `8.3.8`.
- Upgraded `@vitejs/plugin-react` to `6.3.0`.
- Upgraded `tailwindcss` to `4.3.5` and added `@tailwindcss/vite` `4.3.5`.
- Migrated the stylesheet entrypoint to `@import "tailwindcss"`.
- Configured Tailwind through the Vite plugin and removed the obsolete Tailwind PostCSS plugin.
- Moved Vite and its React plugin from runtime `dependencies` to `devDependencies`.
- Added `npm run audit:production`, which runs `npm audit --omit=dev`.

## Results

The baseline audit reported 12 high advisories. After the upgrade, the production-only audit is clean:

```text
npm run audit:production
0 vulnerabilities
```

The full audit still reports 5 high advisories in build-only tooling. They all resolve through `picomatch@4.0.7`, which is currently the latest registry release and has no patched version available. npm's suggested alternatives are either a downgrade to Vite 6.2.7 or a major-version change that is not a security fix for the current latest Vite line. No unsafe `npm audit fix --force` result was accepted.

## Compatibility validation

The following all passed on this branch:

- `npm run lint`
- `npm run build`
- `npm test`
- UI truthfulness test
- production-surface test
- `v3_safety_invariants`
- Gate 4 golden parity: 24,024 cases
- R8 core and Gate 4 compare
- V3 reachability: 24/24 ideal combinations

Live provider integration remained skipped as documented elsewhere; no provider credits were consumed.

## Merge recommendation

This PR is suitable for review because production dependencies are audit-clean and the major build-tool migration is fully regression-tested. The residual five high findings are dev/build-only and upstream-unfixable at the current latest `picomatch` release. They should remain visible in CI rather than be suppressed or falsely reported as clean. The production gate should use `npm run audit:production`; full-audit findings should remain tracked until an upstream patched `picomatch` release is available.
