# RDP Strategy v3.0 Kotlin → TypeScript Mapping

## Authority

The only decision-engine authority is the supplied `rdp-strategy-v3-engine-only` Kotlin ZIP. The React/UI body remains frozen. Kotlin is not copied into the Node project; each pure engine module is ported to TypeScript.

## Contract freeze

`executeStrategyPipeline(input: PipelineInput): MasterTelemetry` remains the public adapter consumed by the server and UI. Existing telemetry field names remain available, including `system_execution.system_decision`, `system_execution.final_action`, validation metrics, stage telemetry, and audit identifiers. The adapter attaches the V3 payload as `decision_engine_v3` and maps V3 decisions into the existing visible decision fields.

Production callers use V3 by default. `LEGACY_V2_FIXTURES=1` exists only for archived historical tests and is not used by server routes.

## File-by-file mapping

| Kotlin source | TypeScript target | Porting rule |
|---|---|---|
| `data/model/Candle.kt` | `src/engine/types.ts` `Candle` | ISO timestamp remains the web boundary; optional `volumeDelta`, `cvd`, `pocPrice`, and `spread` carry Kotlin order-flow fields without breaking old feeds. |
| `data/model/NewsEvent.kt` | `src/engine/types.ts` `NewsEvent` | Existing web news shape is adapted at the V3 evaluator boundary. |
| `engine/types/EngineTypes.kt` | `src/engine/strategyV3Engine.ts` interfaces and `src/engine/types.ts` unions | `StageResult`, `CoreGateResult`, `MfciBreakdown`, and `DecisionPayload` become TypeScript interfaces. `FinalAction` is exactly `MANUAL_ALERT | SAFE_HOLD | NO_ACTION`. |
| `engine/stages/StructureStages.kt` | `src/engine/strategyV3Engine.ts` stages 1–3 | Dynamic ATR14/ATR50 lookback 3/5/7, zero-lookahead swing confirmation, BOS displacement `>=1.2`, volume spike and CVD alignment. |
| `engine/stages/ImbalanceStages.kt` | `src/engine/strategyV3Engine.ts` stages 4–8 | FVG/CE and micro-gap filter, IFVG retest/absorption, BPR overlap, VWOB POC extreme zone, and breaker delta spike. |
| `engine/stages/LiquidityStages.kt` | `src/engine/strategyV3Engine.ts` stages 9–11 | CVD divergence liquidity sweep plus ATR-normalized BSL/SSL clustering and merge distance. |
| `engine/stages/EquilibriumStages.kt` | `src/engine/strategyV3Engine.ts` stages 12–13 | Dynamic dealing range equilibrium and OTE 61.8–78.6% with 70.5% sweet spot. |
| `engine/stages/MechanicsStages.kt` | `src/engine/strategyV3Engine.ts` stages 14–15 | Directional rejection wick ratio and rolling 10-body Z-score. |
| `engine/stages/SessionNewsStages.kt` | `src/engine/strategyV3Engine.ts` stages 16–18 | UTC institutional session/IB, ICT kill zones/macro windows, offline fail-safe, high-impact ±30m guard, and spread >3× baseline blocker. |
| `engine/stages/VisionAiStage.kt` | `src/engine/strategyV3Engine.ts` stage 19 | MFCI weights 35/25/20/20 and threshold `>=0.85`. |
| `engine/gates/CoreDecisionGates.kt` | `src/engine/strategyV3Engine.ts` gate synthesis | Nine gate rules remain frozen and evaluate the 19 stage results. |
| `engine/RdpPipelineEngineV3.kt` | `src/engine/strategyV3Engine.ts` `evaluateStrategyV3()` plus `pipeline.ts` adapter | Minimum 15 candles, stage orchestration, MFCI, gates, PASS/HOLD/BLOCKED, final action, and risk-coordinate payload. |

## Decision mapping

| Kotlin V3 | Visible MasterTelemetry |
|---|---|
| `PASS` | `system_decision = PASS`, `final_action = MANUAL_ALERT` |
| `HOLD` | `system_decision = INCONCLUSIVE`, `final_action = SAFE_HOLD` |
| `BLOCKED` | `system_decision = REJECT`, `final_action = NO_ACTION` |

The UI body is unchanged; existing cards and notifications consume these existing fields. No broker execution route is introduced.

## Verification contract

The default `npm test` suite covers Termux feature fixtures and V3 stage/gate/MFCI/visible-mapping tests. The archived `npm run test:legacy` command is isolated behind `LEGACY_V2_FIXTURES=1` and is not a production path. Production verification must also run `npm run lint` and `npm run build`.
