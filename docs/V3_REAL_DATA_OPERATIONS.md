# RDP Strategy v3.0 — Real-Data Operations

## Live economic calendar

Production News Guard no longer seeds NFP/CPI/FOMC timestamps and does not label synthetic data as ForexFactory. It uses the server-side Trading Economics calendar adapter when `TRADING_ECONOMICS_API_KEY` is configured.

- Provider endpoint: Trading Economics calendar by country and UTC date range
- Refresh: at startup and every 15 minutes
- Manual refresh: `POST /api/news/refresh`
- High impact: provider `Importance >= 3`
- Restriction: ±30 minutes around a high-impact event
- Provider failure or missing key: `NEWS_DATA_UNAVAILABLE` and fail-safe; never `CLEAR`
- No API key is sent to the browser or logged

Required Termux `.env` entry:

```env
TRADING_ECONOMICS_API_KEY=your_server_side_calendar_key
ECONOMIC_CALENDAR_COUNTRIES=united states,united kingdom,euro area,japan,australia,canada,new zealand,switzerland
```

The News view explicitly shows **Live Provider** and **Refresh Live Calendar**. The old synthetic button is not part of the production UI.

## Telegram update timeout

The admin `getUpdates` request has an 8-second abort timeout and URL-encoded `allowed_updates`. A stalled network request now returns a clear timeout message instead of leaving the UI in `Reading Updates...` indefinitely.

## Telemetry history and 100-record target

The experiment's `targetValidSetups = 100` is a **valid-signal sample target**, not a cap on rejected, inconclusive, or total telemetry records.

- Candidate history remains durably persisted.
- Dashboard candidate fetch requests up to 1,000 records.
- API requests may ask for up to 10,000 records; server-side counts remain authoritative and unbounded by 100.
- `validSetupsCount`, `rejectedSetupsCount`, `inconclusiveCount`, and `totalCandidateFramesEvaluated` are calculated across the full persisted candidate history.
- The 100-item batch outcome request limit only protects one manual OHLC submission request and does not limit telemetry history.

Therefore 500 rejected records remain countable and retrievable; they are not silently reduced to 100.
