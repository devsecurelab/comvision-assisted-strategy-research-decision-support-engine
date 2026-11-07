# PR-7 Specification — Security, Session & Operations

**Branch:** `engine/i-batch-2026-10-pr-7`  
**Base:** PR-3 merged `main`  
**Status:** Planning / test-first implementation  
**Scope:** Security hardening, session configuration, market-calendar correctness, runtime operations and Termux monitoring.

## 1. Goals

PR-7 makes the private decision-support service fail closed at startup, keeps registration and authentication safe under load, makes session/kill-zone decisions timezone-correct across DST transitions, and adds operational visibility without changing the non-execution boundary.

The engine remains a manual-alert system. PR-7 must not add broker connections, order execution, credential transmission to brokers, or UI automation.

## 2. Security and registration requirements

### 2.1 Async password hashing

Replace synchronous registration password hashing (`scryptSync`) with asynchronous `scrypt`. Registration must not block the event loop while hashing.

The existing registration request limiter remains active and must be enforced before hashing:

- Maximum **5 registration attempts per IP per rolling hour**.
- Maximum **20 registration attempts globally per rolling hour**.
- Maximum **50 PENDING accounts**.
- Rejected requests must not create users or bypass the limiter through validation order.
- Registration is private by default: `REGISTRATION_ENABLED=false` when unset.
- Private-tool registration endpoints must reject requests when registration is disabled.
- Existing approved/admin login behavior must remain compatible.

### 2.2 Host safety guard

- Default `HOST=127.0.0.1`.
- If `HOST=0.0.0.0`, startup must fail unless `ALLOW_LAN=true`.
- Any unsupported or unsafe host configuration must fail closed before the server starts accepting requests.
- The startup error must identify the configuration key and remediation without printing secrets.

### 2.3 Bootstrap password handling

- `ADMIN_BOOTSTRAP_PASSWORD` is the source of the initial administrator password.
- No plaintext bootstrap password or `.admin_bootstrap_secret` file may be written.
- An old `.admin_bootstrap_secret` under the configured `DATA_DIR` must be removed during startup migration.
- Bootstrap state is stored under `DATA_DIR`, never implicitly under `cwd/data`.
- If the environment password is absent, startup must follow one explicit documented policy: reject in production; in development, print a one-time generated bootstrap value only if the existing security contract permits it, mark the account `mustChangePassword`, and never persist the plaintext value.
- README and `.env.example` must use `ADMIN_BOOTSTRAP_PASSWORD`; stale `ADMIN_BOOTSTRAP_KEY` references must be removed or clearly marked as legacy compatibility only.

## 3. Session configuration and strategy identity

### 3.1 Configuration file

Create `config/sessions.json`, loaded relative to the repository/config boundary and validated before server startup. It must contain:

- Core session definition.
- London kill zone.
- New York kill zone.
- Start margin and end margin.
- IANA timezone for every zone; do not encode session logic as fixed UTC offsets.
- Entry-rule variant, defaulting to `TRADE_WITHIN_ZONE`.

Invalid schema, missing zones, invalid IANA timezone, malformed `HH:MM`, negative margin, `end <= start`, or invalid expiry/window values must reject startup.

The validated file must be included in the strategy-parameter identity:

- Derive a deterministic `session_config_hash`.
- Include the session configuration in the active strategy/config hash or strategy parameter manifest.
- Changing the file while the epoch is active must not silently alter live behavior; require a new config hash/epoch and restart.
- Every ledger record must carry `config_hash`, `session_config_hash`, `engine_fingerprint`, `rule_variant`, and operational parameters such as entry window, expiry and margins.

### 3.2 Session decision rule

For `TRADE_WITHIN_ZONE`:

```text
entry = signal candle close
zone_start + start_margin <= entry <= zone_end - end_margin
entry + expiry <= zone_end
```

The same rule must be used for scan-time evaluation and delivery-time validation. If delivery is outside the permitted window, return `SIGNAL_OUTSIDE_WINDOW` and do not alert.

Broker time is display-only. It must not participate in session or kill-zone decisions.

### 3.3 Session labels and market closure

- London and New York labels use local wall-clock time in their IANA zones.
- Remove Asia from new classification output; `00:00–06:00 UTC` is `OFF_PEAK`.
- Preserve `ASIA` in compatibility types/readers so old records remain readable.
- When the FX market is closed, session classification must be `CLOSED`.
- Preserve existing strategy decisions except for the explicitly requested operational/session boundary behavior.

## 4. DST and boundary test matrix

Use timezone conversion, not hard-coded UTC offsets. Tests must cover:

- London DST end: **25 October 2026**.
- US DST end: **1 November 2026**.
- US DST start: **14 March 2027**.
- UK DST start: **28 March 2027**.
- Mismatch weeks where London and New York offsets differ.
- First valid and last valid entry candle after start/end margins.
- Entry plus expiry exactly at the boundary and one candle beyond it.
- Each timeframe: `5m`, `15m`, `30m`.
- Calendar-closed timestamps return `CLOSED` and do not fetch provider data.

## 5. Runtime status and operational behavior

### 5.1 `/status`

Expose a protected operational status command/endpoint containing:

- Current UTC time.
- Current BDT time.
- Broker display time and configured offset.
- Current session/kill zone or next zone with BDT countdown.
- Scanner state: active/paused, last run, last candle, last error.
- Per-pair payout percentage, source/set time and age.
- Remaining provider credits/budget.
- Market state: open/closed and reason.
- Active `session_config_hash` and engine/config identity.

Do not expose API keys, session tokens, passwords or other secrets.

### 5.2 Payout freshness

- Add `PAYOUT_MAX_AGE_HOURS`, default `12`.
- Missing, below-minimum or stale payout produces `NO_TRADE` with reason `PAYOUT_STALE` for stale values.
- At each kill-zone start, send a Telegram reminder with payout age and instruction to reconfirm.
- Payout age checks must be deterministic under a fake clock.

### 5.3 Boot self-check

At startup run a fail-closed self-check covering:

1. Twelve Data key configuration and one `/price` verification call.
2. Telegram configuration/test delivery.
3. Clock drift.
4. Signal-ledger hash verification.
5. Data-directory existence, writability and disk capacity.
6. Repository visibility; reject or alert if the repository is public.
7. Config hash and session-config hash.
8. Session/calendar schema validity.

Every failure path must be testable independently. Failures must produce an operational notification without leaking secrets. Decide and document which failures block startup versus degrade scanning; security, invalid config, public repository and invalid ledger must fail closed.

## 6. Market calendar

Create `config/market-calendar.json` with schema validation and hash integration. It must support at minimum:

- Weekly FX closure.
- New Year and Christmas closures.
- Good Friday.
- December 24 and December 31 early-close rules.
- Explicit timezone and local close time for holiday rules.
- Deterministic boundary handling: immediately before close is open; at/after close is `CLOSED`.

Calendar changes require a new config hash/epoch and restart. Calendar-closed scans must not consume provider credits.

## 7. Termux and external operations

Create `scripts/termux/` scripts for Termux:Boot:

- Acquire `termux-wake-lock`.
- Start the service with safe environment/config validation.
- Recover the last scanner state after reboot.
- Detect missed candles from `lastRunAt` and emit a `SCAN_GAP` ledger event plus Telegram notification.
- Ping an externally configured dead-man switch/health-check URL once per cycle.
- Never include secrets in command output or ping payloads.
- Include dry-run mode and shellcheck-friendly error handling.

## 8. Test-first implementation plan

Implement tests before production changes. Required red/green suites:

1. `test/pr7_registration_security.test.ts`
   - Async hashing behavior/non-blocking contract.
   - IP 5/hour limiter.
   - Global 20/hour limiter.
   - PENDING cap 50.
   - Registration disabled by default.
   - Concurrent registration race safety.

2. `test/pr7_startup_guards.test.ts`
   - Unsafe `0.0.0.0` without `ALLOW_LAN` rejected.
   - Safe host combinations accepted.
   - Bootstrap file never written.
   - Legacy bootstrap file removed from `DATA_DIR`.
   - Required environment behavior.
   - Public repository/self-check failure paths.

3. `test/pr7_session_config.test.ts`
   - Schema and IANA timezone validation.
   - Session config hash stability and change detection.
   - Invalid config startup rejection.
   - `TRADE_WITHIN_ZONE` start/end margin and expiry rule.
   - Ledger metadata contains all identity/ops fields.

4. `test/pr7_dst_boundaries.test.ts`
   - Four 2026/2027 DST transition dates.
   - London/New York mismatch weeks.
   - 5m/15m/30m first/last valid candles.

5. `test/pr7_market_calendar.test.ts`
   - Early-close boundaries for Dec 24/31.
   - Good Friday and fixed holidays.
   - Open-before/closed-at boundary.
   - Closed market produces `CLOSED` and no provider fetch.

6. `test/pr7_operations.test.ts`
   - Payout stale/eligible behavior.
   - `/status` fields and secret redaction.
   - Each self-check failure path.
   - `SCAN_GAP` count/event and notification.
   - Termux dry-run behavior.

## 9. Completion gate

PR-7 is review-ready only when all are true:

- Security regression suite passes.
- Async registration hashing is verified.
- All registration limits and disabled-by-default behavior pass.
- Startup guards and bootstrap-file tests pass.
- Session schema/hash and ledger metadata tests pass.
- DST 2026/2027 boundary matrix passes for all three timeframes.
- Calendar early-close/holiday tests pass.
- Closed market returns `CLOSED` and consumes no provider credits.
- `/status` is truthful and secret-free.
- Self-check success and every failure path are tested.
- Termux scripts pass dry-run.
- Full lint, build and regression suite pass.
- No broker/execution capability is introduced.
- Branch is clean, pushed, and a review-ready PR is opened.

## 10. Non-goals

- Automated order placement or broker API integration.
- Fixed-UTC session logic.
- Persisting broker credentials.
- Changing frozen strategy gate logic except the explicitly requested session/calendar operational guards.
- Removing compatibility support for historical `ASIA` records.
