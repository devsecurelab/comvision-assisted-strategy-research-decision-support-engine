
## Final PR-C status after validated cleanup commits

The clear deletion set is complete and split into separate commits:

| Commit | Scope | Lines deleted |
|---|---|---:|
| `102a2d0` | Unused `V3Stage.v2Baseline` / `v3Refinement` fields and construction | 2 |
| `a476ace` | Archived `test/strategy_pipeline.test.ts` and `test:legacy` script | 1,862 |
| `3d97dca` | Unreachable V2 selector/default branch; explicit V3 selector arguments in callers/tests | 44 |
| **Total** |  | **1,908** |

The 3d97dca changes also add 37 lines while flattening the V3 preflight/final-decision path; it does not delete V3-used helpers, UI/analytics/chat fields, frozen parameters, retained-record readers, R8 mode-A comparison, or evidence/data records.

Post-deletion validation passed for each deletion commit:

- `npm run lint` — PASS
- `npm run build` — PASS
- `npm test` — PASS
- R8 core, Gate 4 parity/reachability, provider, scheduler, safety, and production-surface suites — PASS
- `git diff --check` — PASS

The remaining `v2.0` strings are active compatibility/frozen-experiment semantics or historical evidence. In particular, `HANDOVER.md` retains historical command output that mentions the now-deleted archived suite; those appendix records are not executable instructions and are intentionally not rewritten as evidence. The remaining active setup-ID, experiment-ID, outcome, `REPLAY`, and telemetry aliases remain on the suspicion list because analytics/chat/UI and old-record compatibility still reference them.
