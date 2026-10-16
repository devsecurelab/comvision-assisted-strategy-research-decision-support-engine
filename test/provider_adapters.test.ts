import assert from 'node:assert/strict';
import { createProviderSchedulers, MarketFeedManager } from '../src/engine/dataProviders';
import { FinnhubWebSocketClient, type FinnhubWebSocketLike } from '../src/engine/providers/finnhubWebSocket';
import { FallbackManager } from '../src/engine/providers/fallbackManager';
import type { IForexDataProvider, ProviderCandlePayload } from '../src/engine/providers/contracts';
import { ProviderAdapterError } from '../src/engine/providers/http';
import type { Timeframe } from '../src/engine/types';

const timeframe: Timeframe = '5m';
const step = 300_000;
const latestOpen = Math.floor(Date.now() / step) * step - step;
const firstOpen = latestOpen - 29 * step;
const times = Array.from({ length: 30 }, (_, i) => firstOpen + i * step);
const iso = (ms: number) => new Date(ms).toISOString();
const price = (i: number) => (1.08 + i * 0.00001).toFixed(5);
const baseRows = times.map((ms, i) => ({ datetime: iso(ms), open: price(i), high: price(i + 1), low: price(i), close: price(i + 1) }));

const mockResponse = (payload: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: { date: new Date().toUTCString(), 'content-type': 'application/json', ...headers },
});

async function adapterContracts() {
  const observed: Array<{ url: URL; headers: Headers }> = [];
  const request = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    observed.push({ url, headers });
    if (url.hostname === 'api.twelvedata.com') return mockResponse({ values: baseRows.map((r) => ({ ...r, volume: '12' })) }, 200, { 'api-credits-used': '1', 'api-credits-left': '99' });
    if (url.hostname === 'api-fxpractice.oanda.com') return mockResponse({ candles: [
      ...times.map((ms, i) => ({ complete: true, time: iso(ms), mid: { o: price(i), h: price(i + 1), l: price(i), c: price(i + 1) }, volume: 123 })),
      { complete: false, time: iso(latestOpen + step), mid: { o: '1', h: '1', l: '1', c: '1' } },
    ] });
    if (url.hostname === 'api.tiingo.com') return mockResponse(baseRows.map((r) => ({ ...r, date: r.datetime, volume: 123 })));
    if (url.hostname === 'finnhub.io') return mockResponse({
      s: 'ok', t: times.map((ms) => Math.floor(ms / 1000)),
      o: times.map((_, i) => Number(price(i))), h: times.map((_, i) => Number(price(i + 1))),
      l: times.map((_, i) => Number(price(i))), c: times.map((_, i) => Number(price(i + 1))), v: times.map(() => 123),
    });
    if (url.hostname === 'www.alphavantage.co') {
      const series = Object.fromEntries(baseRows.map((r) => [r.datetime.replace('T', ' ').slice(0, 19), {
        '1. open': r.open, '2. high': r.high, '3. low': r.low, '4. close': r.close, '5. volume': '123',
      }]));
      return mockResponse({ 'Meta Data': { '6. Time Zone': 'UTC' }, 'Time Series FX (5min)': series });
    }
    throw new Error(`Unexpected test URL host: ${url.hostname}`);
  };

  const manager = new MarketFeedManager('td-test-secret', 'av-test-secret', request, {
    OANDA: 'oanda-test-secret', TIINGO: 'tiingo-test-secret', FINNHUB: 'finnhub-test-secret',
  });
  assert.deepEqual(manager.getFallbackProviders(), ['TWELVE_DATA', 'OANDA', 'TIINGO', 'FINNHUB', 'ALPHA_VANTAGE']);
  const runtimeConfigured = new MarketFeedManager('', '', request);
  runtimeConfigured.setProviderKeys({ OANDA: 'memory-only-secret' });
  assert.deepEqual(runtimeConfigured.getFallbackProviders(), ['OANDA']);
  assert.equal(runtimeConfigured.getStatus().quota.oanda.configured, true);
  assert.equal(JSON.stringify(runtimeConfigured.getStatus()).includes('memory-only-secret'), false);
  const twelve = await manager.fetchCandles('EUR/USD', timeframe, 'TWELVE_DATA');
  assert.equal(twelve.provider, 'TWELVE_DATA');
  assert.equal(twelve.candles.length, 30);
  assert.equal(twelve.creditsUsed, 1);
  assert.equal(observed.at(-1)!.headers.get('authorization'), 'apikey td-test-secret');

  const oanda = await manager.fetchCandles('EUR/USD', timeframe, 'OANDA');
  assert.equal(oanda.provider, 'OANDA');
  assert.equal(oanda.candles.length, 30, 'incomplete OANDA bar is excluded');
  assert.ok(oanda.candles.every((candle) => candle.volume === null));
  assert.equal(observed.at(-1)!.headers.get('authorization'), 'Bearer oanda-test-secret');
  assert.match(observed.at(-1)!.url.pathname, /EUR_USD\/candles$/);

  const tiingo = await manager.fetchCandles('EUR/USD', timeframe, 'TIINGO');
  assert.equal(tiingo.provider, 'TIINGO');
  assert.equal(tiingo.candles.length, 30);
  assert.ok(tiingo.candles.every((candle) => candle.volume === null));
  assert.equal(observed.at(-1)!.headers.get('authorization'), 'Token tiingo-test-secret');
  assert.match(observed.at(-1)!.url.pathname, /EURUSD\/prices$/);

  const finnhub = await manager.fetchCandles('EUR/USD', timeframe, 'FINNHUB');
  assert.equal(finnhub.provider, 'FINNHUB');
  assert.equal(finnhub.candles.length, 30);
  assert.ok(finnhub.candles.every((candle) => candle.volume === null));
  assert.equal(observed.at(-1)!.headers.get('x-finnhub-token'), 'finnhub-test-secret');
  assert.equal(observed.at(-1)!.url.searchParams.get('symbol'), 'OANDA:EUR_USD');

  const alpha = await manager.fetchCandles('EUR/USD', timeframe, 'ALPHA_VANTAGE');
  assert.equal(alpha.provider, 'ALPHA_VANTAGE');
  assert.equal(alpha.candles.length, 30);
  assert.ok(alpha.candles.every((candle) => candle.volume === null));
  assert.equal(observed.at(-1)!.url.searchParams.get('apikey'), 'av-test-secret');
}

class FakeSocket implements FinnhubWebSocketLike {
  public readyState = 0;
  public sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: any) => void>>();
  public send(data: string) { this.sent.push(data); }
  public close() { this.readyState = 3; this.emit('close', {}); }
  public addEventListener(type: string, listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }
  public open() { this.readyState = 1; this.emit('open', {}); }
  public message(data: unknown) { this.emit('message', { data: JSON.stringify(data) }); }
  private emit(type: string, event: unknown) { for (const listener of this.listeners.get(type) || []) listener(event); }
}

async function finnhubSocket() {
  let now = Date.UTC(2026, 9, 16, 12, 0, 0);
  const sockets: FakeSocket[] = [];
  const client = new FinnhubWebSocketClient('socket-test-key', {
    now: () => now,
    reconnectBaseMs: 5,
    reconnectMaxMs: 10,
    socketFactory: (url) => {
      assert.match(url, /^wss:\/\/ws\.finnhub\.io\?token=socket-test-key$/);
      const socket = new FakeSocket(); sockets.push(socket); return socket;
    },
  });
  client.subscribePair('EUR/USD');
  assert.equal(sockets.length, 1);
  sockets[0].open();
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), { type: 'subscribe', symbol: 'OANDA:EUR_USD' });
  const first = now - 35 * 60_000;
  const ticks = Array.from({ length: 31 }, (_, i) => ({ s: 'OANDA:EUR_USD', p: 1.08 + i * 0.0001, t: first + i * 60_000 + 1_000, v: 1 }));
  sockets[0].message({ type: 'trade', data: ticks });
  now = first + 32 * 60_000;
  const candles = client.getCandles('EUR/USD', '1m');
  assert.ok(candles && candles.length >= 25, 'at least 25 complete, contiguous bars are required');
  assert.ok(candles!.every((candle) => candle.volume === null));
  assert.equal(candles!.at(-1)!.close, ticks.at(-1)!.p);
  assert.equal(client.getCandles('EUR/USD', '1h'), null, 'insufficient 1h warm-up uses REST instead');

  sockets[0].close();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(sockets.length, 2, 'closed socket reconnects with bounded backoff');
  sockets[1].open();
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), { type: 'subscribe', symbol: 'OANDA:EUR_USD' });
  client.stop();
}

async function circuitBreaker() {
  let now = 10_000;
  const adapter: IForexDataProvider = {
    id: 'TWELVE_DATA', label: 'Twelve Data', isConfigured: () => true,
    fetchCandles: async (): Promise<ProviderCandlePayload> => ({ rows: [], timezone: 'UTC' }),
  };
  const manager = new FallbackManager([adapter], 1_000, () => now);
  await assert.rejects(
    manager.execute('TWELVE_DATA', async () => { throw new ProviderAdapterError('TWELVE_DATA', 'RATE_LIMITED', 'limited'); }),
    /limited/,
  );
  assert.equal(manager.snapshots()[0].state, 'OPEN');
  assert.deepEqual(manager.availableProviders(), []);
  await assert.rejects(manager.execute('TWELVE_DATA', async () => 'unexpected'), /circuit is open/);
  now += 1_001;
  assert.equal(manager.snapshots()[0].state, 'HALF_OPEN');
  assert.equal(await manager.execute('TWELVE_DATA', async () => 'recovered'), 'recovered');
  assert.equal(manager.snapshots()[0].state, 'CLOSED');
}

async function main() {
  assert.equal(createProviderSchedulers().get('TWELVE_DATA')?.snapshot().minimumIntervalMs, 8_000);
  console.log('[twelve_data_minimum_spacing] PASS');
  await adapterContracts();
  console.log('[provider_adapter_rest_contracts] PASS');
  await finnhubSocket();
  console.log('[finnhub_websocket_buffer_reconnect] PASS');
  await circuitBreaker();
  console.log('[provider_circuit_breaker] PASS');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
