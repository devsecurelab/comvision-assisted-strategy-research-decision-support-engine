# PR-A security and validation review

**Date:** 2026-10-18

**Branch:** `engine/h-batch-2026-10`

**Scope:** H1, H3, H4 and H5 only. This review does not authorize merging; merge remains subject to the owner's written approval.

## Security findings

### API access and CORS

The only unauthenticated application API routes are `POST /api/auth/register` and `POST /api/auth/login`. Unknown `/api/*` paths return JSON `404`. `/api/auth/me` and `/api/auth/logout` require a bearer session. Engine/operator routes use `requireApprovedUser`; administrative credential, user, audit-log, settings and Telegram-control routes use `requireAdmin`.

The middleware accepts bearer tokens from the `Authorization` header; query-string tokens are not accepted. Registration creates `PENDING` users; login denies them until approval. Suspended/revoked users' sessions are terminated. CORS trusts only exact origins configured in `APP_URL` or the comma-separated `CORS_ALLOWED_ORIGINS`; wildcard/subdomain suffix matching is absent. Credentialed CORS headers are sent only for an exact allowlisted origin.

Focused HTTP regressions exercised missing/invalid bearer tokens, rejection of query-string tokens (including a valid session token), allowed and untrusted origins, pending-user denial, bootstrap-admin authentication, and `404` for removed package routes and unknown API routes.

### Removed package-download surface

`/api/engine/download-package` and `/api/engine/package-info` are absent. The legacy package URL and unknown API routes return `404`; `.zip` requests are rejected. The PR regression scans tracked paths and `public`, `dist`, and `protected_storage` for ComVision package archives. No current archive/package artifact was found.

### Credential-history review

A heuristic scan covered 66 reachable commits and 728 unique Git objects. It found **no confirmed credential**. A historical text match in `docs/V3_REAL_DATA_OPERATIONS.md` is marked as a `TRADING_ECONOMICS_API_KEY` demo placeholder, not a usable key. A Telegram-token-shaped match in a historical launcher image is binary-image noise, not a credential. Values are intentionally omitted from this report.

Separately, an actual Twelve Data key was pasted into the conversation history rather than kept only in an environment variable. For precaution, rotate that key at the provider and keep its replacement out of chat, source files, logs and commits. The repository scan did not find that key.

## Residual risks not changed in PR-A

Login has no explicit per-IP/account rate limiter or lockout in the reviewed code. Add throttling in a separate, tested change if desired. Session bearer tokens are persisted in `DATA_DIR/sessions.json` as JSON. File access therefore depends on deployment filesystem ownership/permissions and the process umask. Keep `DATA_DIR` private and consider a separate hardening change to enforce restrictive file permissions or store only token hashes.

These are existing deployment/authentication concerns, not changes made under PR-A's scoped requirements.

## H1, H4 and H5 checks

**H1:** FX closure calculations use `America/New_York` IANA-zone rules for the Friday 17:00–Sunday 17:00 market interval; the targeted market-hours test verifies closed-time suppression, open-time behavior, R8 filtering and scanner suppression.

**H4:** News-facing copy uses `NEWS: NOT CHECKED (manual)`; Stage 18's displayed successful reason now uses the same manual label rather than claiming “News clear.” Pressure observations default to `UNAVAILABLE`. The Stage 18 decision conditions were not changed.

**H5:** Live requests fetch 130 candles. The append-only ledger records `SCAN` lifecycle events, separate provider and broker outcomes, and scan timing fields; expiry counts are derived from scan events. Targeted ledger/scan tests passed.

## Validation run

Passed: `npm run lint`, `npm run build`, `npx tsx test/pr_a_owner_regressions.test.ts`, `npx tsx test/market_hours.test.ts`, `npx tsx test/provider_adapters.test.ts`, `npx tsx test/r9_ledger_scan.test.ts`, and `npx tsx test/strategy_v3_engine.test.ts`.

The aggregate `npm test` and `test:legacy` suites were **not run**, as requested. The positive and NO_TRADE notification regressions both assert that manual-news wording is retained; the regression initially exposed an incorrect test expectation, which was corrected before the passing rerun.
