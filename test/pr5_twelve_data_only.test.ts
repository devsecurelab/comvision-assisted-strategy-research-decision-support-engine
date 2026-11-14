import assert from 'node:assert/strict';
import { PROVIDER_ORDER } from '../src/engine/providers/contracts';
import { ProviderAdapterError, requestJson } from '../src/engine/providers/http';
import { TwelveDataAdapter } from '../src/engine/providers/twelveDataAdapter';
import { normalizeCandles } from '../src/engine/providers/normalize';
import { TwelveDataCircuit } from '../src/engine/providers/circuit';
import type { ProviderCandlePayload } from '../src/engine/providers/contracts';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { generateResearchCandles } from './fixtures/marketCandles';

const response = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', date: new Date().toUTCString(), ...headers },
  });

async function httpClassification() {
  const unauthorized = async () => response({ code: 401, message: 'invalid api key' }, 401);
  await assert.rejects(
    requestJson('TWELVE_DATA', unauthorized, new URL('https://api.twelvedata.com/time_series'), new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'CREDENTIAL_INVALID' && error.httpStatus === 401,
  );

  const payloadRateLimit = async () => response({ code: 429, message: 'credits exhausted' }, 200);
  await assert.rejects(
    requestJson('TWELVE_DATA', payloadRateLimit, new URL('https://api.twelvedata.com/time_series'), new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'RATE_LIMITED',
  );

  const serverError = async () => response({ code: 500, message: 'temporarily unavailable' }, 500);
  await assert.rejects(
    requestJson('TWELVE_DATA', serverError, new URL('https://api.twelvedata.com/time_series'), new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'PROVIDER_SERVER_ERROR',
  );
}

async function strictPayloadValidation() {
  const adapter = new TwelveDataAdapter(async () => response({ values: [{ datetime: '2026-10-26 10:00:00', open: '1.1', high: '1.2', low: '1.0', close: '1.1' }] }), 'test-key');
  await assert.rejects(
    adapter.fetchCandles('EUR/USD', '5m', new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && /timezone/i.test(error.message),
  );

  const malformed: ProviderCandlePayload = {
    timezone: 'UTC',
    rows: Array.from({ length: 30 }, (_, i) => ({
      datetime: new Date(Date.UTC(2026, 9, 26, 10, i * 5)).toISOString(),
      open: '1.1', high: '1.0', low: '1.0', close: '1.1',
    })),
  };
  assert.throws(
    () => normalizeCandles(malformed, 'TWELVE_DATA', '5m', false),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'DATA_QUALITY_FAIL',
  );
}

async function historicalRequestCeiling() {
  const urls: URL[] = [];
  const adapter = new TwelveDataAdapter(async (input) => {
    urls.push(new URL(String(input)));
    return response({ values: [{ datetime: '2026-10-26T10:00:00.000Z', open: '1.1', high: '1.2', low: '1.0', close: '1.1' }] });
  }, 'test-key');
  await adapter.fetchHistoricalCandles('EUR/USD', '5m', '2026-10-01', '2026-10-02', new AbortController().signal);
  assert.equal(urls[0]?.searchParams.get('outputsize'), '4500');

  const truncated = new TwelveDataAdapter(async () => response({
    values: Array.from({ length: 4500 }, (_, i) => ({ datetime: new Date(Date.UTC(2026, 9, 1, 0, i * 5)).toISOString(), open: '1.1', high: '1.2', low: '1.0', close: '1.1' })),
  }), 'test-key');
  await assert.rejects(
    truncated.fetchHistoricalCandles('EUR/USD', '5m', '2026-10-01', '2026-10-02', new AbortController().signal),
    (error: unknown) => error instanceof ProviderAdapterError && error.code === 'HISTORICAL_TRUNCATED',
  );
}

async function circuitSemantics() {
  let now = Date.parse('2026-10-26T10:00:10.000Z');
  const manager = new TwelveDataCircuit(() => now);
  await assert.rejects(manager.execute(async () => {
    throw new ProviderAdapterError('TWELVE_DATA', 'RATE_LIMITED', 'limited');
  }));
  const retryAt = Date.parse(manager.snapshot().retryAt!);
  assert.equal(new Date(retryAt).getUTCSeconds(), 0);
  assert.equal(new Date(retryAt).getUTCMinutes(), 1);

  manager.reset();
  await assert.rejects(manager.execute(async () => {
    throw new ProviderAdapterError('TWELVE_DATA', 'PROVIDER_TIMEOUT', 'timed out');
  }));
  const timeoutFailures = manager.snapshot().consecutiveFailures;
  manager.reset();
  await assert.rejects(manager.execute(async () => {
    throw new ProviderAdapterError('TWELVE_DATA', 'OPERATOR_ABORT', 'operator stopped');
  }));
  assert.equal(manager.snapshot().consecutiveFailures, 0);
  assert.ok(timeoutFailures > 0);
}

function resultInput(candles: ReturnType<typeof generateResearchCandles>) {
  return { candles, htfBias: 'BULLISH' as const, newsEvents: [], newsSourceOnline: true, timeframe: '15m' as const };
}

function newsIsManualAndNonBlocking() {
  const candles = generateResearchCandles(60, 1.085, '15m');
  const offline = evaluateStrategyV3({ ...resultInput(candles), newsSourceOnline: false });
  const online = evaluateStrategyV3(resultInput(candles));
  const highImpact = evaluateStrategyV3({
    ...resultInput(candles),
    newsEvents: [{ id: 'n', title: 'NFP', currency: 'USD', impact: 'HIGH', timestamp: candles.at(-1)!.timestamp }],
  });
  assert.equal(offline.binarySignal, online.binarySignal);
  assert.equal(offline.operationalGuards[0]?.status, 'PASS');
  assert.equal(highImpact.operationalGuards[0]?.status, 'PASS');
  for (const result of [offline, online, highImpact]) {
    const stage18 = result.stages.find((stage) => stage.stageNumber === 18);
    assert.equal(stage18?.available, true);
    assert.equal(stage18?.passed, true);
    assert.match(stage18?.telemetry || '', /NOT CHECKED/);
  }
}

assert.deepEqual(PROVIDER_ORDER, ['TWELVE_DATA']);
await httpClassification();
await strictPayloadValidation();
await historicalRequestCeiling();
await circuitSemantics();
newsIsManualAndNonBlocking();
console.log('[pr5_twelve_data_only] RED/GREEN contract suite completed');
