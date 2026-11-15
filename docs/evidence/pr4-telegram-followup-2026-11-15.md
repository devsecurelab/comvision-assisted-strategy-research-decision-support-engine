# PR-4 Telegram reliability follow-up — 2026-11-15

## Scope and review correction

The Telegram reliability implementation is already present on `main`: plain-text signal/result alerts, the shared `telegramSend()` helper, bounded timeout and retries, Telegram `retry_after`, token redaction, signal-ID dedupe, notification health counts, Nodemailer timeout, and test-alert escaping are covered by the existing implementation and tests.

The review note that an expired persisted `SENDING` record immediately becomes `FAILED` is not accurate for the current `main` snapshot. A valid, expired `SENDING` record already sends `SIGNAL EXPIRED — do not enter` and is covered by `testPersistedSendingResumesOnlyWithinValidityWindow`. This follow-up addressed a related uncovered safety edge: when `valid_until` was missing or malformed, restart recovery could enter the safe-notice path but the transport helper might still send the original signal. Missing or malformed expiry now fails closed to the safe notice.

The other confirmed gap was a parse-entity HTTP 400 on the final ordinary retry: the plain-text fallback was not sent after the four-attempt retry budget ended. A final parse error now permits one immediate plain-text fallback attempt, reported in the attempt count.

## Validation on the follow-up branch

| Check | Result |
|---|---|
| `npm run lint` (`tsc --noEmit`) | PASS |
| `npm run test:inventory` | PASS — all 55 `.test.ts` files included |
| `npm test` | PASS — full configured suite, exit code 0 |
| `npm run build` | PASS |
| `npm audit` | PASS — 0 vulnerabilities |
| `git diff --check` | PASS |
| Common credential-pattern scan | PASS — no matches |
| Gate 4 parity | PASS — 24,024 `b90004f` baseline decisions unchanged |
| R8 core regression | PASS |
| `v3_safety_invariants` | PASS |
| PR-4 focused regressions | PASS — final-attempt plain fallback; valid-expired, missing, and malformed-expiry `SENDING` recovery; existing 429, timeout, dedupe, plain-text, redaction, and mail-timeout coverage |

No real-provider or live Telegram test was run. These checks use local test doubles and do not establish live delivery readiness.

## Pre-live identity and migration record

Captured with `npm run engine:fingerprint` from the PR-4 follow-up tree before any live test:

- `CONFIG_HASH`: `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652`
- `CONFIG_HASH_EPOCH`: `V3_CANONICAL_2026-11-12_28ab43a2_bf1f14da`
- `PARAMS_CANONICAL_HASH`: `1ef39428852f65418a82daad603e1ef02557981028414e82592bdd39adf1e1b2`
- `SESSION_CONFIG_HASH`: `28ab43a2980876392e94e2813e26f9186ba9b33542bec35e94d81d9f3f0f68b7`
- `ENGINE_FINGERPRINT`: `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723`
- Fingerprint verification: `params_hash_matches=true`, `fingerprint_matches=true`
- Migration status: no schema or persisted notification-record migration is introduced by this follow-up. Runtime migration state was not checked against a live `DATA_DIR`; confirm it on the target runtime before live testing.
- Live-testing status: **NOT RUN**.

## Historical test-count note

`HANDOVER.md` contains dated 2026-10-16/C5 validation totals. Those figures are preserved as historical evidence and should not be read as the current suite result; the current follow-up results are recorded in this file.
