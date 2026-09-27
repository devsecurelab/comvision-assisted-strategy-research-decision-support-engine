# TECHNICAL SPECIFICATION — Consolidated Final Frozen Golden Specification
## System Title: ComVision-Assisted Strategy Research & Decision-Support Engine
### Target Scope: Strategy v1.0 — Locked Scope (First 100 Valid Setups Controlled Experiment)
**Status: FINAL & FROZEN — Developer-Authoritative Document (Specification v3.4)**

---

## 1. System Purpose & Non-Execution Architectural Boundary

### 1.1 Architectural Boundary
The system is strictly classified and built as a **ComVision-Assisted Strategy Research & Decision-Support Engine**. It is **NOT** an automated trade execution bot.

Under no circumstances shall the engine or any of its sub-modules:
1. Connect to, authenticate with, or maintain direct API sessions for trading execution with any brokerage or exchange.
2. Store, transmit, or request broker/exchange account credentials, API trading keys, or private financial tokens.
3. Automatically execute orders, modify existing positions, or trigger execution scripts.
4. Utilize UI automation tools (e.g., Selenium, Playwright, Puppeteer, PyAutoGUI, or native OS mouse/keyboard emulation) to interact with trading platform execution interfaces.
5. Emulate human input to bypass execution safeguards or broker controls.

### 1.2 Final System Output
The functional lifecycle of the engine terminates strictly at the following sequence:
`Data Ingestion ⟶ Validation Pipeline ⟶ Telemetry Logging ⟶ Manual Alert Output`

The final system execution state is strictly defined as `MANUAL_ALERT`. Trade entry, execution parameters, position sizing, and order placement remain exclusively the manual responsibility of the human operator.

#### Telemetry Decision & Action Semantics:
- `system_decision = PASS`: Setup has successfully passed the defined Strategy v1.0 validation pipeline.
- `final_action = MANUAL_ALERT`: The system is permitted to issue the configured manual research alert after successful validation.
- `MANUAL_ALERT` is not a broker execution command, trade execution instruction, or automated order action. It represents the final non-execution system action defined by this specification.

---

## 2. Complete Core Strategy Pipeline Order
Every candidate setup must sequentially pass through the complete 9-stage validation pipeline. If any stage outputs a `REJECT` or `INCONCLUSIVE` state, processing for the candidate setup halts immediately at that node, the state is recorded in telemetry, and no `MANUAL_ALERT` is dispatched.

1. **Stage 1**: Market Structure (5-Candle Fractal)
2. **Stage 2**: Fair Value Gap (FVG) & Order Block Confluence
3. **Stage 3**: 3-Candle Pattern & Breakout Validation
4. **Stage 4**: Volume / Tick Activity Proxy
5. **Stage 5**: Wick Validation & Liquidity Sweep Evaluation
6. **Stage 6**: Inside Candle Verification
7. **Stage 7**: Fibonacci 50% Equilibrium Zone
8. **Stage 8**: News Guard Fail-Safe
9. **Stage 9**: T-10s Pressure Observation (Non-Filtering)

---

## 3. Mathematical & Behavioral Definitions per Pipeline Node

### Stage 1: Dashboard Selected Timeframe & Market Structure
- **Final Decision Authority Rule**: The timeframe selected by the human operator via the Dashboard UI is the authoritative final decision timeframe. Additional timeframe analysis provides context but never overrides the user-selected timeframe.
- **Swing High Definition (Fractal Model)**:
  `High(t) > High(t-1) ∧ High(t) > High(t-2) ∧ High(t) > High(t+1) ∧ High(t) > High(t+2)`
- **Swing Low Definition (Fractal Model)**:
  `Low(t) < Low(t-1) ∧ Low(t) < Low(t-2) ∧ Low(t) < Low(t+1) ∧ Low(t) < Low(t+2)`
- **Confirmation Timing & No-Look-Ahead Rule**: Confirmation occurs strictly at the Close Timestamp of Candle `(t+2)`.
- **Structural State Classification**:
  - Bullish: `SH_n > SH_{n-1} ∧ SL_n > SL_{n-1}`
  - Bearish: `LH_n < LH_{n-1} ∧ LL_n < LL_{n-1}`
  - Unclear: Pipeline Decision = `REJECT`

### Stage 2: Fair Value Gap (FVG) & Order Block Confluence
- **Bullish FVG Condition**: `Low(C3) > High(C1)`, Zone = `[High(C1), Low(C3)]`
- **Bearish FVG Condition**: `High(C3) < Low(C1)`, Zone = `[High(C3), Low(C1)]`
- **Mitigation States**: `UNMITIGATED`, `PARTIAL_FILL`, `COMPLETELY_FILLED`
- **Order Block (OB) Confluence**:
  - Bullish OB: Last down-close candle immediately preceding displacement. FVG originates at or overlaps with OB zone.
  - Bearish OB: Last up-close candle immediately preceding displacement. FVG originates at or overlaps with OB zone.
  - Confluence status `FAIL` ⟹ `system_decision = REJECT`, `final_action = NO_ALERT`.

### Stage 3: Three-Candle Pattern & Breakout Validation
- `C1`: Base, `C2`: Displacement, `C3`: Confirmation.
- Bullish Expansion: `Close(C3) > High(C1)`
- Bearish Expansion: `Close(C3) < Low(C1)`
- Close inside `C1` price boundary ⟹ `REJECT`.

### Stage 4: Volume / Tick Activity Proxy
- Logged strictly as `TICK_ACTIVITY_PROXY`.
- Valid if `tick_sequence == ASCENDING` OR `T2 > Average_Tick_10`. Otherwise `REJECT`.

### Stage 5: Wick Validation & Liquidity Sweep Evaluation
- `BullishWickRatio = UpperWick / TotalRange`
- `BearishWickRatio = LowerWick / TotalRange`
- If pushback wick ratio > 0.50 ⟹ `REJECT` (`Wick Fakeout`).
- Testing prior swing high/low without closing beyond ⟹ `SWEEP_DETECTED` ⟹ `REJECT`.

### Stage 6: Inside Candle Verification
- `High(t) <= High(t-1) ∧ Low(t) >= Low(t-1)`
- Does not reset sequence, does not increment C1-C3 candle count.

### Stage 7: Fibonacci 50% Equilibrium Zone
- `Fib 50% Level = SL_n + 0.50 * (SH_n - SL_n)`
- Bullish: Entire FVG zone must lie strictly below Fib 50% (`FVG_HIGH < Fib 50%`).
- Bearish: Entire FVG zone must lie strictly above Fib 50% (`FVG_LOW > Fib 50%`).

### Stage 8: News Guard Fail-Safe Architecture
- Red-folder event restriction window: `[T_news - 30m, T_news + 30m]`.
- If active ⟹ `REJECT`.
- If source offline / unreachable ⟹ `system_decision = INCONCLUSIVE`, `final_action = NO_ALERT` ("Never assume no news = clear").

### Stage 9: T-10 Second Pressure Observation Engine
- Non-filtering observation only.
- Absolute percentage ban.
- Categorical values: Classification (`ALIGNED` | `NEUTRAL` | `OPPOSITE` | `UNCERTAIN`), Magnitude (`LOW` | `MEDIUM` | `HIGH`), Consistency (`LOW` | `MEDIUM` | `HIGH`).

---

## 4. Access Control & Security Architecture
- Public access to informational landing, methodology, and verification portal.
- Private ComVision Dashboard & Research Engine.
- Custom authentication (email/username + password) using cryptographically secure hashing (`scrypt`).
- Account authorization lifecycle: `PENDING`, `APPROVED`, `SUSPENDED`, `REVOKED`.
- Server-side token validation and authorization enforcement on all protected endpoints.
