# PR-1 Gap Completion Evidence

## Scope

This PR closes the remaining PR-1 gaps for signal timing, batching, broker-time display, alert formatting, and integration coverage. The implementation remains strictly display-only and does not place broker orders.

## Completed gaps

- `ScanService.runAutoCycle` now sends the eligible pair set through `fetchCandlesBatch` for one timeframe/provider request. Provider responses remain symbol-keyed and a failed symbol does not discard successful symbols.
- The auto-cycle performs an explicit hourly HTF cache prefetch during the `hh:00:01` window; normal scan paths continue to fail closed if HTF data is unavailable.
- Retryable provider/data failures use the declared `[1000, 2000, 3000]` ms sequence.
- Alerts render concrete `HH:MM:SS UTC / BDT / Broker` times. Broker time is display-only and uses a persisted owner-set offset.
- `/brokertime HH:MM:SS` calculates and persists the display offset from the current UTC clock; `/brokertime` reports the saved setting.
- Alert price guidance now reports pair-specific tolerance in pips, including JPY pip size, alongside the raw price distance.
- Integration coverage verifies one-request batching with partial symbol failure, four-pair auto-cycle batching, concrete alert times, JPY pip formatting, and broker-time persistence.
- Stale notification text claiming an unconditional full-suite pass was replaced with evidence-based wording.

## Verification performed locally

- `npm run test:inventory` — PASS (53 test files included)
- `npx tsx test/pr1_batch_timing.test.ts` — PASS
- `npx tsx test/pr1_latency_boundary.test.ts` — PASS
- `npx tsx test/pr1_limiter.test.ts` — PASS
- `npx tsx test/pr1_signal_price.test.ts` — PASS
- `npx tsx test/pr1_integration_gaps.test.ts` — PASS
- `npm run lint` — PASS
- `npm run build` — PASS

The full CI matrix remains the authoritative merge gate, including Node 22/24, full `npm test`, and the npm audit job. Live-provider testing remains opt-in and is not run from this evidence document.

## Frozen identity recorded before live testing

- Active experiment: `EXP-2026-V3-REAL-001`
- Config hash: `a1f859bc165b9b36de005af2eb33b27ba6594301f929f14157615a1a5d6e8652`
- Config hash epoch: `V3_CANONICAL_2026-11-12_28ab43a2_bf1f14da`
- Session config hash: `28ab43a2980876392e94e2813e26f9186ba9b33542bec35e94d81d9f3f0f68b7`
- Engine fingerprint: `e3419da92a169ebd0c42c04028b8df262d780f7caf26f143c616d0f38a858723`
- Migration status: no schema migration is introduced by these PR-1 changes; existing append-only ledger compatibility and migration tests remain in the suite.

## Safety invariants

Gate-4 parity, R8 golden baselines, V3 safety invariants, TypeScript compilation, production build, npm audit, and repository secret-handling rules remain CI-enforced. No broker API, order placement, or execution path is introduced.
