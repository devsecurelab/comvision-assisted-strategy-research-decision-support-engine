# PR-C H6 — V2 inventory and deletion plan

Date: 2026-10-18
Base: `c6cd0e6` (`PR-B: approved Gate 4 confirmed-range midpoint rule`)
Branch: `engine/h-batch-2026-10-pr-c`

## Scope and baseline

The merged main checkout is clean before PR-C changes. The completed pre-cleanup checks were:

- `npm run lint`: PASS
- `npm run build`: PASS
- focused production/safety/provider tests: PASS
- merged-main full suite reached and passed through the PR-B/R8 tests; the shell job was later terminated by the environment before the remaining suite completed (`exit 143`), so a fresh full-suite run is required after each cleanup commit.
- PR-B golden parity baseline: `24,024` cases; `changed=15,079`; `PASS→BLOCKED=8,110`; `BLOCKED→PASS=6,969`.

No files under `data/` or `docs/evidence/` are deletion targets. Historical stored records must remain readable.

## Grep evidence and reference inventory

Commands used:

```sh
git grep -nI -E 'V2|v2\\.0|v2_0|v2-|Strategy v2|strategy_version|decisionEngineVersion|LEGACY|legacy|historical|archived|WIN|LOSS|Pressure|TickSequence|TickBaseline' -- ':!package-lock.json' ':!bun.lock'
grep -RInE 'v2Baseline|v3Refinement|tick_sequence|tick_baseline|pressure_observation|liveTickPressure|input_snapshot' src server.ts test scripts --include='*.ts' --include='*.tsx'
```

| Area | Current symbols/files | Reachability / references | Decision |
|---|---|---|---|
| V3 production engine | `src/engine/strategyV3Engine.ts`, `src/engine/pipeline.ts`, `src/engine/scanScheduler.ts`, `src/engine/r8Backtest.ts` | Live scan and R8 call `executeStrategyPipeline(... decisionEngineVersion: 'V3')`; V3 decision has 19 stages and 9 gates | **Keep** |
| Legacy V2 execution switch | `PipelineInput.decisionEngineVersion?: 'V2'|'V3'`; default `process.env.LEGACY_V2_FIXTURES`; V2 branch in `executeStrategyPipeline` | Only archived `test/strategy_pipeline.test.ts` uses the implicit V2 mode; production callers explicitly use V3 | **Remove in a separate commit** |
| Archived V2 test suite | `test/strategy_pipeline.test.ts` | Only `package.json` `test:legacy` and its own guard reference it; contains old V2 pipeline assertions | **Remove in a separate commit** |
| Legacy test script | `package.json` `test:legacy` and final `npm test` chain | Only archived suite | **Remove with archived test commit** |
| V3-used pipeline helpers | `detectFractalSwings`, `evaluateMarketStructure`, `evaluateBOS`, `evaluateCHoCH`, `detectFVG`, `evaluateIFVG`, `detectBPR`, `detectOrderBlock`, `evaluateBreakerBlock`, `evaluateLiquiditySweep`, `detectLiquidityPools`, `evaluateDiscountPremium`, `evaluateOTE`, `evaluateWickPushback`, `evaluateMomentum`, `isInsideCandle`, `evaluateTickProxy` | `executeStrategyPipeline` V3 telemetry still calls these; `chatService` directly calls the swing helpers | **Keep unless separately proven unreachable** |
| Gate 4 comparison mode A | `gate4Mode`, `legacyWindow20`, `legacyEquilibrium`, `LEGACY_A`, `scripts/r8-gate4-compare.ts` | R8 A/B comparison tests and reports use it; it is the approved historical comparator | **Keep; it is not dead code** |
| V3 stage compatibility labels | `V3Stage.v2Baseline`, `V3Stage.v3Refinement` and stage factory output | Grep finds no UI, analytics, chat, export, or test consumer; only declaration/production construction | **Remove in a separate telemetry-shape commit** |
| Frozen configuration snapshot | `V2_CONFIG_SNAPSHOT` in `src/engine/manifest.ts`, exported through `STRATEGY_MANIFEST.parameters`, `CONFIG_HASH` | Active experiment tracker and metadata use the frozen object/hash | **Keep data; rename/relabel only if hash and records remain stable** |
| Experiment IDs/counters | `generateNextSetupId()` emits `V2-...`; startup scans `V2-` records | Active `experimentTracker.recordCandidate()` uses this for live candidates; old records may contain it | **Suspect — do not delete without migration decision** |
| Experiment freeze wording | `EXP-2026-V2-001`, “Strategy v2.0” strings in `experimentTracker`, chat, UI | UI/chat/export-facing strings and stored experiment metadata depend on these labels | **Suspect — update to V3 wording only after owner confirms compatibility label** |
| Stored outcome compatibility | `WIN`, `LOSS`, `INVALIDATED`, `UNRESOLVED` in `storage.ts`, analytics, tracker, signal ledger | Analytics, chat, notifications, ledger and old records read these values | **Keep; explicitly protected by requirement** |
| Legacy telemetry aliases | `strategy_version`, `experiment_id`, `setup_id`, `config_hash`, `DataProvenance.REPLAY`, legacy `tick_*`, pressure observation | Stored `MasterTelemetry` and UI/chat/export read parts of these; some old records need compatibility | **Keep unless field-by-field migration proves safe** |
| `input_snapshot` fallback | `src/App.tsx`, analytics fallback | Reads old candidate records | **Keep for old-record readability** |
| Historical docs/evidence | `HANDOVER.md`, `docs/evidence/*`, `docs/SPECIFICATION_v3.4.md`, historical README sections | Evidence is explicitly protected; old docs are not active imports | **Evidence keep; old-doc deletion is suspect until owner confirms exact files** |
| Retired package route strings | `test/pr_a_owner_regressions.test.ts` references `/comvision-engine-v2.0-package.zip` to assert 404 | Security regression test, not an active route; server has no such route | **Keep 404 regression assertion** |
| “OANDA v20” | Provider adapter label | OANDA API product name, unrelated to Strategy V2 | **Keep** |

## Initial deletion set (clear)

1. Remove only the archived V2 test suite and `test:legacy` package script, in one deletion commit. Before and after: lint, build, full tests (with the test chain updated), and R8/golden checks.
2. Remove the unreachable V2 execution selector and V2-only branch from `pipeline.ts` in a separate commit, while retaining all helpers still used for V3 telemetry/chat and retaining the explicit V3 pipeline output shape.
3. Remove `V3Stage.v2Baseline` and `V3Stage.v3Refinement` in a separate telemetry cleanup commit; this is safe because no current consumer references them and JSON record loading remains structural.

## Suspicion list (not deleted without confirmation)

- `V2_CONFIG_SNAPSHOT` name and its specification text: the object is the active frozen parameter source and its hash is part of stored telemetry.
- `V2-...` setup IDs and `EXP-2026-V2-001`: active production tracker behavior and old record compatibility are coupled to them.
- `WIN`/`LOSS`/legacy outcome aliases and `REPLAY` provenance: required to read historical records and are used by analytics/chat/notifications.
- `tick_proxy`, pressure observation, and old pipeline validation fields: UI and chat still display them.
- `HANDOVER.md`, `docs/evidence/*`, `README.md`, and `docs/SPECIFICATION_v3.4.md`: deletion scope is ambiguous because some are historical evidence and some are user-facing documentation.

No deletion is made for the suspicion list in the inventory commit.

## Final PR-C status after validated cleanup commits

The clear deletion set is complete and split into separate commits:

| Commit | Scope | Lines deleted |
|---|---|---:|
| `102a2d0` | Unused `V3Stage.v2Baseline` / `v3Refinement` fields and construction | 2 |
| `a476ace` | Archived `test/strategy_pipeline.test.ts` and `test:legacy` script | 1,862 |
| `3d97dca` | Unreachable V2 selector/default branch; explicit V3 selector arguments in callers/tests | 44 |
| **Total** |  | **1,908** |

The `3d97dca` changes also add 37 lines while flattening the V3 preflight/final-decision path; it does not delete V3-used helpers, UI/analytics/chat fields, frozen parameters, retained-record readers, R8 mode-A comparison, or evidence/data records.

Post-deletion validation passed for each deletion commit:

- `npm run lint` — PASS
- `npm run build` — PASS
- `npm test` — PASS
- R8 core, Gate 4 parity/reachability, provider, scheduler, safety, and production-surface suites — PASS
- `git diff --check` — PASS

The remaining `v2.0` strings are active compatibility/frozen-experiment semantics or historical evidence. In particular, `HANDOVER.md` retains historical command output that mentions the now-deleted archived suite; those appendix records are not executable instructions and are intentionally not rewritten as evidence. The remaining active setup-ID, experiment-ID, outcome, `REPLAY`, and telemetry aliases remain on the suspicion list because analytics/chat/UI and old-record compatibility still reference them.
