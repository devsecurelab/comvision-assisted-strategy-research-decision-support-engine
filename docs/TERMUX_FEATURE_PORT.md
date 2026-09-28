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

## Outcome resolver

The backend ignores any client-supplied `WIN` or `LOSS` label when resolving a result. It uses the stored signal bias and submitted next-candle OHLC. A bullish signal is favorable when `close > open`; a bearish signal is favorable when `close < open`. The opposite direction is unfavorable. `close === open` is explicitly neutral, while invalid OHLC or unclear bias is inconclusive.

The resolved result is written into the candidate telemetry (`next_candle_observation`), durable `data/outcomes.json`, and the audit log. Telegram and Email result alerts use the same resolved record. A second submission for the same `setup_id` is idempotent and does not send duplicate notifications.

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
- `POST /api/notifications/test`

## Truthfulness boundary

The web port renders actual candles and validation fields present in the telemetry record. When the source is replay/simulation, the UI labels it accordingly. Browser capture state controls are explicit UI state; a real MT5/desktop screen capture source still requires an external capture/upload integration and is not silently claimed as live CV extraction.

The engine remains strictly non-executing: it produces research telemetry and `MANUAL_ALERT` notifications only. No broker order route was added.
