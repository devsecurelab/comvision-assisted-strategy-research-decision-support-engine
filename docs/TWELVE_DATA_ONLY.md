# Twelve Data-only live market-data policy

**Scope:** This page describes the current live market-data provider boundary in this repository. It does not promise provider uptime, quotas, coverage, or data quality beyond the checks implemented here.

## Supported live provider

Twelve Data is the only configured live market-data provider. The provider registry in [`src/engine/dataProviders.ts`](../src/engine/dataProviders.ts) returns `TWELVE_DATA` only when its adapter is configured; there is no live fallback to another provider. The adapter is implemented in [`src/engine/providers/twelveDataAdapter.ts`](../src/engine/providers/twelveDataAdapter.ts) and currently uses Twelve Data's `time_series` and `price` endpoints.

The credential is configured on the server side through provider settings/environment. The adapter recognizes `TWELVE_DATA_API_KEY` and the compatibility alias `TWELVEDATA_API_KEY`. Keep either value out of client bundles, URLs, logs, committed files, and public status output. See `.env.example` and the Termux instructions in the [README](../README.md).

## Live decisions and fail-closed behavior

- Live automatic/manual candle requests and quote probes use the Twelve Data adapter, subject to its configured credential, request scheduler, circuit breaker, validation, and provider response.
- Normalized provider candles carry `LIVE_INGESTED` provenance. The V3 decision pipeline rejects data without verified live provenance and can return an inconclusive/no-alert result when required inputs or quality checks fail. Demo, synthetic, replay, or test fixtures are not substituted as live candles.
- Historical R8 fetches also require Twelve Data configuration; that path does not silently substitute replay or simulated data when the provider is unavailable.
- Requests can fail because the key is missing/rejected, the provider is unavailable or rate-limited, the circuit is open, or returned candles fail validation. No specific quota or uptime is guaranteed by this application.

CSV backtests, deterministic replay, and unit-test fixtures are separate research/testing inputs. They do not establish live provenance and are not an automatic fallback for live scanning.

## Calculation and ledger boundary

Twelve Data supplies candle/quote inputs; it does not calculate strategy decisions. New decisions are evaluated by the V3-native engine. New telemetry and ledger records bind the result to the current configuration and engine identity. Legacy telemetry fields are retained only for reading/rendering historical records, not as calculation inputs.

The service remains a research and decision-support tool. It does not connect to brokers, submit orders, or execute trades.

## Testing

The default `npm test` suite runs provider contract tests without making a real provider request. The real-provider subcheck `p3_live_provider` runs only when `P3_LIVE_INTEGRATION=1` is explicitly set and valid credentials/network access are available. Treat such a run as credit-consuming and opt-in; do not put provider credentials in test logs or CI output.

## Implementation references

- Provider selection, scheduling, circuit and provenance: [`src/engine/dataProviders.ts`](../src/engine/dataProviders.ts)
- Twelve Data REST calls and response validation: [`src/engine/providers/twelveDataAdapter.ts`](../src/engine/providers/twelveDataAdapter.ts)
- Fail-closed provenance check: [`src/engine/pipeline.ts`](../src/engine/pipeline.ts)
- Twelve Data contract tests: [`test/pr5_twelve_data_only.test.ts`](../test/pr5_twelve_data_only.test.ts)
- Provider integration contract and opt-in live subcheck: [`test/p3_live_data_integration.test.ts`](../test/p3_live_data_integration.test.ts)
