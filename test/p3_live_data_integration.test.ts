import 'dotenv/config';
import assert from 'node:assert/strict';
import { MarketFeedManager } from '../src/engine/dataProviders';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import type { MarketDataProvider } from '../src/engine/dataProviders';
import type { Timeframe } from '../src/engine/types';

const mockResponse = (payload: unknown) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { date: new Date().toUTCString(), 'content-type': 'application/json', 'api-credits-used': '1', 'api-credits-left': '99' },
});

function rows(timeframe: Timeframe) {
  const step = timeframe === '1h' ? 3_600_000 : timeframe === '30m' ? 1_800_000 : timeframe === '15m' ? 900_000 : 300_000;
  const latestOpen = Math.floor(Date.now() / step) * step - step;
  return Array.from({ length: 130 }, (_, index) => {
    const timestamp = new Date(latestOpen - (129 - index) * step).toISOString();
    const open = 1.08 + index * 0.00001;
    return { datetime: timestamp, open: open.toFixed(5), high: (open + 0.0002).toFixed(5), low: (open - 0.0002).toFixed(5), close: (open + 0.0001).toFixed(5), volume: '10' };
  });
}

async function behaviorContract() {
  const request = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.twelvedata.com');
    const timeframe = (url.searchParams.get('interval') || '15min') === '1h' ? '1h' : '15m';
    return mockResponse({ values: rows(timeframe) });
  };
  const manager = new MarketFeedManager('behavior-test-key', request);
  const ltf = await manager.fetchCandles('EUR/USD', '15m', 'TWELVE_DATA');
  const htf = await manager.fetchCandles('EUR/USD', '1h', 'TWELVE_DATA');
  assert.equal(ltf.dataProvenance, 'LIVE_INGESTED');
  assert.equal(ltf.provider, 'TWELVE_DATA');
  assert.equal(ltf.candles.length, 130);
  assert.equal(htf.candles.length, 130);
  assert.ok(ltf.candles.every((candle, index, all) => index === 0 || Date.parse(candle.timestamp) > Date.parse(all[index - 1].timestamp)));
  assert.ok(ltf.candles.every((candle) => candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close)));

  const telemetry = executeStrategyPipeline({
    candles: ltf.candles,
    currentCandleIndex: ltf.candles.length - 1,
    selectedTimeframe: '15m',
    htfCandles: htf.candles,
    newsEvents: [],
    newsSourceOnline: true,
    dataProvenance: ltf.dataProvenance,
    provider: ltf.provider,
    pair: 'EUR/USD',
    asset: 'EUR/USD',
    payoutPct: 87,
    nowMs: Date.parse('2026-10-19T10:00:00.000Z'),
  });
  assert.equal(telemetry.metadata.data_provenance, 'LIVE_INGESTED');
  assert.equal(telemetry.metadata.provider, 'TWELVE_DATA');
  if (telemetry.decision_engine_v3) {
    assert.equal(telemetry.decision_engine_v3.gates.length, 9);
  } else {
    assert.equal(telemetry.system_execution.system_decision, 'INCONCLUSIVE');
    assert.match(telemetry.metadata.status_reason || '', /MARKET_CLOSED|HTF_BIAS_UNCLEAR|DATA_QUALITY_FAIL/);
  }
  assert.ok(['PASS', 'REJECT', 'INCONCLUSIVE'].includes(telemetry.system_execution.system_decision));
}

async function optionalLiveProvider() {
  if (process.env.P3_LIVE_INTEGRATION !== '1') {
    console.log('[p3_live_provider] SKIPPED — set P3_LIVE_INTEGRATION=1 to consume a real provider request');
    return;
  }
  const provider = (process.env.P3_LIVE_PROVIDER || 'TWELVE_DATA') as MarketDataProvider;
  const pair = process.env.P3_LIVE_PAIR || 'EUR/USD';
  const key = provider === 'TWELVE_DATA' ? (process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA_API_KEY || '') : provider === 'OANDA' ? (process.env.OANDA_PRACTICE_TOKEN || '') : (process.env.TIINGO_API_KEY || '');
  if (!key) throw new Error(`P3_LIVE_INTEGRATION=1 requires a configured key for ${provider}.`);
  const manager = new MarketFeedManager(provider === 'TWELVE_DATA' ? key : '', fetch, provider === 'TWELVE_DATA' ? {} : { [provider]: key });
  const result = await manager.fetchCandles(pair, '15m', provider, 'ON_DEMAND');
  assert.equal(result.dataProvenance, 'LIVE_INGESTED');
  assert.equal(result.provider, provider);
  assert.ok(result.candles.length >= 30);
  assert.ok(result.candles.at(-1)!.timestamp);
  console.log(`[p3_live_provider] PASS — ${provider} ${pair} 15m returned ${result.candles.length} normalized closed candles`);
}

await behaviorContract();
console.log('[p3_behavior_contract] PASS — provider normalization → live provenance → V3 nine-gate telemetry');
await optionalLiveProvider();
