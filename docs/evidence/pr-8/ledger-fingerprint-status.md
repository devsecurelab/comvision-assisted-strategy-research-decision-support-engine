# PR-8 Ledger Fingerprint Integration Status

## Completed

Every newly appended signal-ledger event receives the active `ENGINE_FINGERPRINT` in its committed payload alongside `CONFIG_HASH`, `CONFIG_HASH_EPOCH`, session configuration identity, rule variant, and operational parameters. Signal, scan, result, edge, delivery, and recovery events all pass through the same identity-enrichment path.

Ledger verification remains backward-compatible for historical entries that predate engine fingerprint integration and therefore have no fingerprint field. When a fingerprint is present, verification now checks it against the current engine identity before accepting the entry. A stale or substituted fingerprint fails closed with `ENGINE_FINGERPRINT_MISMATCH`; the existing hash-chain, sequence, previous-hash, tamper, and partial-tail checks remain active.

The typed signal, scan, and result payload contracts now expose the optional fingerprint field for committed records while allowing callers to submit the pre-enrichment input shape.

## Verification

- Red-to-green contract: `test/pr8_ledger_fingerprint.test.ts`
- `npm run lint`: PASS
- PR-7 session/config identity test: PASS
- owner regression test: PASS
- R9 ledger/scan/resolve/edge suite: PASS
- Full `npm test`: PASS
- Live provider integration: explicit `SKIPPED` unless `P3_LIVE_INTEGRATION=1`

No strategy rule, threshold, parameter value, R8 golden count, Gate 4 parity rule, or V3 safety invariant was changed.
