# PR-5 follow-up validation — 2026-11-18

## Scope

This follow-up completes the remaining PR-5 Twelve Data-only validation work. Automated news inputs remain accepted only for backward-compatible callers; Stage 18 is manual `NOT_CHECKED` and non-blocking, and news-on/news-off/high-impact-news parity is covered by the focused PR-5 contract.

## Implemented gaps

- Added mandatory validation-clock typing and `STALE_LAST_CANDLE` quality reporting.
- Propagated live provider clock status into the pipeline; `CLOCK_UNAVAILABLE`, `CLOCK_UNVERIFIED`, and `CLOCK_DRIFT` fail closed as `NO_TRADE`.
- Kept historical request sizing at `outputsize=4500`, rejected exact-cap truncation, and rejected returned rows beyond the requested end boundary.
- Parsed an explicit daily-quota reset timestamp when Twelve Data supplies one; circuit retry uses it instead of blindly assuming the next UTC midnight.
- Distinguished timeout-triggered aborts from operator aborts using an explicit `TimeoutError` abort reason.
- Added exactly-once per-process `CREDENTIAL_INVALID` Telegram notification dedupe at the live scan error boundary.
- Removed the client-bundled quick-login credential from `AuthModal`.
- Added dedicated PR-5 cases for stale candles, clock fail-closed behavior, quota reset parsing, timeout/operator abort, historical boundary, truncation, and news parity.

## Validation results

- `npm run lint`: PASS
- `npm run build`: PASS
- `npx tsx test/pr5_twelve_data_only.test.ts`: PASS
- `npx tsx test/v3_safety_invariants.test.ts`: PASS
- `npm test`: PASS
- Gate 4 golden parity: PASS, 24,024 cases
- R8 Gate 4 compare and R8 core: PASS
- V3 reachability: PASS, 24/24 ideal combinations
- Live provider integration: SKIPPED because `P3_LIVE_INTEGRATION=1` was not enabled; no provider credits were consumed.

## Pre-live identity and migration evidence

- Strategy version: `RDP_STRATEGY_V3.0`
- Experiment ID: `EXP-2026-V3-REAL-001`
- Config hash: `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652`
- Config hash epoch: `V3_CANONICAL_2026-11-12_28ab43a2_bf1f14da`
- Session config hash: `28ab43a2980876392e94e2813e26f9186ba9b33542bec35e94d81d9f3f0f68b7`
- Engine fingerprint: `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723`
- Params canonical hash: `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`
- Market calendar hash: `bf1f14da807ed0ab8d2e14156a58d6c48825073604518ea046e88c8d3483d3eb`
- Migration status: **NOT REQUIRED for this follow-up**. No storage schema, ledger identity, or historical-record migration was performed; historical compatibility paths remain unchanged.

## Security status

- Production-source secret scan: PASS. Synthetic credentials remain only in test fixtures.
- `git diff --check`: PASS.
- `npm audit`: **BLOCKED / pre-existing dependency finding**, not clean: 12 high, 0 critical, 0 moderate, 0 low. The findings are in direct dev dependencies (`vite`, `@vitejs/plugin-react`, `tailwindcss`) and their transitive build tooling; available automatic fixes require major-version changes. Full details are recorded in [`npm-audit-2026-11-18.md`](npm-audit-2026-11-18.md). This must be resolved in a separately scoped dependency-security PR before claiming repository-wide security-scan clean status.

## Merge / live-testing gate

This branch was rebased from `origin/main` before implementation. The follow-up is not merged and no live-provider test was run. Before merging, rebase/update from `main` again, run the complete suite again after the merge, verify R8 golden count and Gate 4 parity, run `v3_safety_invariants`, lint, build, security/secret scans, and confirm Draft PR descriptions/status. The hashes above are the identity record to carry into any later live-testing approval.
