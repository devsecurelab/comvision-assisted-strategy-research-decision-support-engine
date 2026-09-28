# Termux Web Engine — Android Feature Port

The Termux/web version now includes the feature contract ported from the verified Android implementation.

## Added capabilities

- 40 canonical FX pairs
- Major (20), Minor/Cross (20), and All (40) filters
- Pair search and operator focus selection
- Multi-market active scope and batch scan
- Evidence-bound candlestick rendering from telemetry candles
- FVG, Order Block, Fib 50%, BSL and SSL overlays
- Vision capture state control (`START CAPTURE` / `STOP CAPTURE`)
- Email/SMTP notification status and test UI
- Deterministic pair-catalog fixtures
- Authoritative next-candle outcome resolver
- Persistent timeframe and pair scope settings
- Additive single-click pair selection with second-click removal
- Main scanner switch as the backend signal-generation gate

## Outcome resolver

The backend ignores any client-supplied `WIN` or `LOSS` label when resolving a result. It uses the stored signal bias and submitted next-candle OHLC. A bullish signal is favorable when `close > open`; a bearish signal is favorable when `close < open`. The opposite direction is unfavorable. `close === open` is explicitly neutral, while invalid OHLC or unclear bias is inconclusive.

The resolved result is written into the candidate telemetry (`next_candle_observation`), durable `data/outcomes.json`, and the audit log. Telegram and Email result alerts use the same resolved record. A second submission for the same `setup_id` is idempotent and does not send duplicate notifications.

## Manual batch resolution

The dashboard provides **Resolve All Pending**. The operator enters the actual next-candle OHLC for every pending setup in one request. The server processes each `setup_id` independently through the authoritative resolver, persists each result, and dispatches its result notification. The batch endpoint accepts up to 100 rows, reports per-row failures, and safely identifies already-resolved rows as duplicates. It does not poll Twelve Data or Alpha Vantage, so this manual mode avoids unnecessary market-data API requests.

## Runtime controls

- Timeframe selection is stored in `data/app_settings.json` and restored after a server restart or page refresh.
- Pair scope is additive: click an inactive pair to add it; click an active pair again to remove it. At least one pair must remain active.
- The main scanner switch is authoritative. While active, the dashboard submits the selected active-pair scope for continuous analysis; while paused, the backend rejects both single and multi-market signal generation with `SCANNER_PAUSED`.
- The separate manual multi-market scan button was removed. Scanning follows the main switch only.

## Strategy v3.0 backend engine

The Android RDP Strategy v3.0 decision engine is ported into `src/engine/strategyV3Engine.ts` without changing the React dashboard, Settings UI, timeframe selector, pair selector, scanner controls, Vision chart, or other visual components. `executeStrategyPipeline()` attaches the `decision_engine_v3` payload to each telemetry record. It contains all 19 stage results, all 9 gate results, exact MFCI component scores, the 0.85 threshold result, and the V3 `PASS`/`HOLD`/`BLOCKED` plus `MANUAL_ALERT`/`SAFE_HOLD`/`NO_ACTION` decision.

Production scan routes and deterministic chat market analysis call the pipeline with `decisionEngineVersion: 'V3'`. In that mode the V3 result is mapped into the existing visible `system_execution.system_decision` and `system_execution.final_action` fields, so the existing dashboard cards, valid-setups feed, analytics, audit history, Telegram/Email candidate alerts, and experiment tracker all follow the V3 gate. Direct legacy test callers may omit the flag to preserve the v2 fixture contract. V3 parity tests verify stage numbering, gate numbering, MFCI arithmetic, offline-news blocking, spread blocking, and visible decision mapping. No frontend rendering code was changed.

## Termux operation

After pulling the branch and installing dependencies:

```bash
npm ci
npm run build
pm2 restart comvision --update-env
pm2 save
```

Open `http://127.0.0.1:3000`, sign in with an approved account, and use the **Multi-Market Selector** on the Overview tab.

- Click a pair to make it the focused pair.
- Double-click a pair to add/remove it from the active multi-market scope.
- Use `+ All Major`, `+ All Minor`, or `+ All 40` for batch selection.
- Use `Scan N Markets` to run the non-execution batch scan.
- Open the Vision tab to inspect telemetry-bound candles and overlays.
- Open Settings to check SMTP status and send an email test.

## API routes

All routes require an approved bearer-token session:

- `GET /api/engine/pairs`
- `POST /api/engine/select-pair` with `{ "pair": "USD/JPY" }`
- `POST /api/engine/active-pairs` with `{ "pairs": ["EUR/USD", "USD/JPY"] }`
- `POST /api/engine/scan-multi` with `{ "pairs": ["EUR/USD", "USD/JPY"] }`
- `POST /api/engine/record-outcomes-batch` with `{ "items": [{ "setupId": "V2-000001", "nextCandle": { "open": 1.08, "high": 1.081, "low": 1.079, "close": 1.0805 } }] }`
- `POST /api/notifications/test`

## Truthfulness boundary

The web port renders actual candles and validation fields present in the telemetry record. When the source is replay/simulation, the UI labels it accordingly. Browser capture state controls are explicit UI state; a real MT5/desktop screen capture source still requires an external capture/upload integration and is not silently claimed as live CV extraction.

The engine remains strictly non-executing: it produces research telemetry and `MANUAL_ALERT` notifications only. No broker order route was added.
