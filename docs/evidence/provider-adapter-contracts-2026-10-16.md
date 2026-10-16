# Provider Adapter Contracts (active scope)

Research on the retained providers' official documentation was recorded on 2026-10-16. These notes describe adapter constraints, not any account's entitlement. No real credentials were used in research or tests.

## Active provider order

Automatic fallback is Twelve Data → OANDA v20 Practice → Tiingo FX, skipping providers that are not configured or whose circuit is unavailable. Credentials remain server-side. Dashboard-entered credentials are held in memory only; `.env` values persist locally and must not be committed. Historical R8 retrieval requires Twelve Data; offline CSV replay does not require an API key.

## Twelve Data

- FX candles: `GET https://api.twelvedata.com/time_series`; server-side header `Authorization: apikey <key>`; pair format `EUR/USD`; supported intervals include 1m, 5m, 15m, 30m, and 1h. Candle-open timestamps are normalized to UTC. OHLC rows may include volume, but FX volume is not centralized traded volume.
- `time_series` costs one credit per symbol. Public quota depends on account tier; the Basic tier documents 8 credits/minute and 800/day. Runtime defaults use 8/min and 800/day and enforce an 8-second minimum between requests, including concurrent requests. Verify the account's actual plan limits before operation.
- Official sources: [time series](https://twelvedata.com/docs/llms/market-data/time-series.md), [quickstart/auth](https://twelvedata.com/docs/quickstart), [API usage](https://twelvedata.com/docs/llms/advanced/api-usage.md), [pricing](https://twelvedata.com/pricing), [credits](https://support.twelvedata.com/en/articles/5615854-credits), [history](https://support.twelvedata.com/en/articles/5214728-getting-historical-data).

## OANDA v20 Practice

- Instrument candles use `GET https://api-fxpractice.oanda.com/v3/instruments/{instrument}/candles`, e.g. `EUR_USD`; bearer token stays in the `Authorization` header. Supported granularities include M1/M5/M15/M30/H1; `complete` identifies closed candles; UTC candle-start timestamps are used.
- OANDA's `volume` is the number of provider-created prices in an interval, not traded units or consolidated FX volume. The adapter sets candle volume to `null`, preventing this field from satisfying volume-dependent gates.
- Published REST limits differ across OANDA documentation. The adapter enforces a conservative one-second minimum interval instead of relying on the largest stated ceiling.
- Official sources: [development guide](https://developer.oanda.com/rest-live-v20/development-guide/), [candles endpoint](https://developer.oanda.com/rest-live-v20/instrument-ep/), [definitions](https://developer.oanda.com/rest-live-v20/instrument-df/), [auth](https://developer.oanda.com/rest-live-v20/authentication/), [best practices](https://developer.oanda.com/rest-live-v20/best-practices/), [API comparison](https://developer.oanda.com/rest-live-v20/api-comparison/).

## Tiingo FX

- Historical FX endpoint: `GET https://api.tiingo.com/tiingo/fx/{ticker}/prices`; `EUR/USD` maps to `EURUSD`; server-side `Authorization: Token <key>`; official examples use `resampleFreq=5min` and `startDate=YYYY-MM-DD`.
- FX REST is labeled beta. Documentation does not fully specify timezone semantics, all supported resampling values, or `endDate`; the adapter rejects timezone-less timestamps rather than assuming UTC. No volume field is documented, so volume is set unavailable.
- The Free product tier documents 50 requests/hour and 1,000/day; runtime defaults are capped at that tier. Confirm the account's actual plan and resampling behavior before operational use.
- Official sources: [FX docs](https://www.tiingo.com/documentation/forex), [connection/auth](https://www.tiingo.com/documentation/general/connecting), [overview](https://www.tiingo.com/documentation/general/overview), [symbology](https://www.tiingo.com/documentation/appendix/symbology), [FX product quotas](https://www.tiingo.com/products/forex-api).

## Operational safeguards

- Provider tokens are not included in public status, health responses, test messages, or provider-switch notifications.
- Circuit-breaker status and provider provenance are visible in `/health`; scan/ledger records distinguish LTF and HTF source providers.
- Provider adapter contract tests use mocked HTTP responses only. Account-specific connectivity, data entitlements, and live quotas still require owner-side validation.
- This engine is decision-support only. It does not place broker orders.
