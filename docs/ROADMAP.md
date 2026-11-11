# Implementation Roadmap & Verification Acceptance Matrix
## Project: ComVision-Assisted Strategy Research & Decision-Support Engine

### Phase 1: Architectural Foundation & Boundaries (Complete)
- [x] Non-execution boundary enforced: No broker API, no credentials, no automated order placement.
- [x] Only affirmative signal action is `MANUAL_ALERT`; fail-safe paths may return `NO_ALERT` and never place orders.
- [x] Strategy v1.0 Frozen Specification established (`EXP-2026-001`).

### Phase 2: 9-Stage Deterministic Validation Pipeline (Complete)
- [x] Stage 1: Market Structure (5-candle fractal, confirmation at Close of t+2, no look-ahead).
- [x] Stage 2: FVG & Order Block Confluence + Mitigation state tracking.
- [x] Stage 3: 3-Candle Pattern & Breakout Validation.
- [x] Stage 4: Volume / Tick Activity Proxy (Ascending or Above Average 10).
- [x] Stage 5: Directional Wick Validation & Liquidity Sweep/Fakeout detection.
- [x] Stage 6: Inside Candle verification (no sequence reset, no candle index increments).
- [x] Stage 7: Fibonacci 50% Equilibrium Zone (whole zone discount/premium check).
- [x] Stage 8: News Guard Fail-Safe ([-30m, +30m] window; offline = INCONCLUSIVE).
- [x] Stage 9: T-10s Pressure Observation (Non-filtering, categorical observations only).

### Phase 3: Data Feeds & Provider Provenance (Twelve Data-only live scope)
- [x] Twelve Data `time_series` REST ingestion with OHLC validation, per-pair/timeframe minute cache, and stale-data rejection.
- [x] Only verified `LIVE_INGESTED` candles may reach signal decisions; replay/demo/override/test inputs are inconclusive in the live decision path and do not fall back into live alerts.
- [x] Request scheduling, rate-limit enforcement, and provider circuit-breaker handling for the configured live provider.
- [x] Synthetic and deterministic replay remain separate research/test inputs, not alternative live providers.
- [ ] Improve provider quota/latency reporting; current status is local operational telemetry and is not represented as an authoritative Twelve Data account quota report.

### Phase 4: Access Control & Server-Side Security (Complete)
- [x] Public informational portal & methodology guide.
- [x] Private ComVision Research Dashboard.
- [x] Secure authentication with `scrypt` password hashing.
- [x] Role-Based Access: Admin and Analyst.
- [x] Status Lifecycle: `PENDING`, `APPROVED`, `SUSPENDED`, `REVOKED`.
- [x] Server-side middleware guarding all research data & engine endpoints.

### Phase 5: Verification & Controlled Experiment (Complete)
- [x] Master Telemetry JSON schema adhering strictly to Section 6.
- [x] 100-valid-setup controlled experiment protocol tracker.
- [x] Automated deterministic tests for engine, storage, security, provider, parity, and safety contracts.

### PR-8: Canonical configuration, telemetry source, and runtime policy

**Status:** Implemented on the current PR-8 draft branch; review/merge is still pending.

- [x] Centralize strategy parameters in `src/engine/params.ts` and generate the active configuration snapshot from that object and its canonical digest.
- [x] Derive `CONFIG_HASH` from canonical JSON and bind an engine/config identity fingerprint to new ledger events.
- [x] Use V3-native engine telemetry for new decision calculations; keep legacy telemetry projections optional for historical read/render paths only.
- [x] Preserve historical ledger verification through the explicit compatibility path without accepting arbitrary mismatched identities.
- [x] Document that PR-8 changed no strategy threshold, score formula, or gate rule; the canonical parameter hash and golden/safety baseline remain unchanged.
- [x] Set `.nvmrc` to canonical Node 22; declare `>=22 <25` in package metadata and validate Node 22/24 in GitHub Actions.
- [x] Use committed `package-lock.json` and `npm ci`; remove the unused Bun lockfile after successful npm resolution.
- [x] Generate UTC-dated npm audit JSON and Markdown reports in `docs/evidence/`; upload evidence even when the audit job fails.
- [x] Resolve the PR-8 PWA/Workbox dependency audit findings by removing the vulnerable build chain. The static manifest and icons remain, while generated service-worker/offline caching is intentionally disabled; a separately reviewed maintained replacement may be considered later. See the [baseline audit report](evidence/npm-audit-2026-11-11.md) and [remediation validation](evidence/npm-audit-remediation-2026-11-12.md).

#### Future parameter-change review checklist

1. Make proposed strategy parameter edits only in `src/engine/params.ts`; do not edit generated snapshots or create parallel literals.
2. Review the exact parameter diff, rationale, and expected decision impact. Obtain explicit review for behavior-changing thresholds.
3. Run `npm ci`, lint, build, and the full test suite; regenerate identity evidence with `npm run engine:fingerprint`.
4. Record before/after parameter and config hashes and compare golden parity and `v3_safety_invariants`. Do not treat changed golden counts or safety outputs as equivalent without explicit review and explanation.
5. Rotate `CONFIG_HASH` automatically from the generated data. Change the identity epoch only when the snapshot/schema identity contract changes, and explain any fingerprint change in the PR.

### Runtime/CI reference

- Supported Node versions: 22 and 24; `.nvmrc` pins 22 as the canonical local runtime.
- CI workflow: `.github/workflows/ci.yml`, with `npm ci` → `npm run lint` → `npm run build` → `npm test` on both versions.
- Audit command: `npm run audit:report`; reports use `docs/evidence/npm-audit-<UTC-date>.json` and `.md`. A nonzero audit result is intentionally visible as a failing audit job, not suppressed.
- Live provider policy and credential boundaries: [`Twelve Data-only documentation`](TWELVE_DATA_ONLY.md).
