# npm audit remediation — 2026-11-12

## Scope

This patch remediates the six findings recorded by the PR-8 baseline audit on commit `09bad15`: four moderate and two low findings in the `vite-plugin-pwa` / Workbox build dependency chain. No high or critical finding was present in the baseline.

## Decision

The vulnerable chain was removed rather than forcing npm's automatic fix. `npm audit fix --force` proposed changing `vite-plugin-pwa` from `1.3.0` to `1.1.0`, which is a semver-major downgrade and does not support the repository's Vite 8 peer range. A compatibility check of `vite-plugin-pwa@2.0.0` also retained the same Workbox findings because it still depends on `workbox-build@7.4.1`.

The patch therefore:

- removes the direct `vite-plugin-pwa` dependency and its Workbox transitive chain;
- removes the Vite PWA plugin configuration;
- keeps the application name, icons, install metadata, and manifest as a committed static `public/manifest.webmanifest` linked from `index.html`;
- removes the obsolete `vite-plugin-pwa/client` TypeScript type entry;
- explicitly does not generate a service worker or offline cache until a separately reviewed, maintained replacement is selected.

This is an intentional change in offline/PWA behavior: the app remains web-app-manifest-ready, but generated Workbox service-worker caching is no longer shipped.

## Validation

All commands were run from the patched tree after a clean install:

| Check | Result |
|---|---|
| `npm ci` | PASS |
| `npm audit` | PASS — 0 vulnerabilities: 0 low, 0 moderate, 0 high, 0 critical |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Built manifest validation | PASS — 3 icons present; no `dist/sw.js` or Workbox artifact generated |
| `npm test` | PASS — full configured regression suite |
| `git diff --check` | PASS |

The historical baseline files `docs/evidence/npm-audit-2026-11-11.{md,json}` remain unchanged as evidence of the pre-remediation state.

## Follow-up

If offline support is required again, select and compatibility-test a maintained service-worker generator or a narrowly scoped hand-written service worker. That follow-up must include installability, cache invalidation, `/api/` network-only behavior, build output, and full regression coverage before reintroducing a dependency chain.
