import type { Candle, Timeframe } from '../types';
import { validateCandleSeries, timeframeMs } from '../dataIntegrity';

export interface FinnhubWebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: any) => void, options?: { once?: boolean }): void;
}

type Bucket = { timestamp: number; open: number; high: number; low: number; close: number };
type SocketFactory = (url: string) => FinnhubWebSocketLike;
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h'];

/** One-key/one-socket Finnhub stream with a bounded, non-synthetic OHLC buffer. */
export class FinnhubWebSocketClient {
  private readonly socketFactory: SocketFactory;
  private socket?: FinnhubWebSocketLike;
  private started = false;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDelayMs = 1_000;
  private readonly subscribed = new Set<string>();
  private readonly bars = new Map<string, Map<Timeframe, Bucket[]>>();
  private readonly maxSymbols: number;

  constructor(
    private readonly apiKey: string,
    options: { socketFactory?: SocketFactory; now?: () => number; reconnectBaseMs?: number; reconnectMaxMs?: number; maxSymbols?: number } = {},
  ) {
    this.socketFactory = options.socketFactory || ((url) => new WebSocket(url));
    this.now = options.now || (() => Date.now());
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30_000;
    this.maxSymbols = options.maxSymbols ?? 50;
    this.reconnectDelayMs = this.reconnectBaseMs;
  }

  private readonly now: () => number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;

  public subscribePair(pair: string): boolean {
    if (!this.apiKey || this.stopped) return false;
    const normalized = pair.toUpperCase();
    if (!this.subscribed.has(normalized) && this.subscribed.size >= this.maxSymbols) return false;
    this.subscribed.add(normalized);
    if (this.socket?.readyState === 1) this.sendSubscribe(normalized);
    else if (!this.socket) this.connect();
    return true;
  }

  public getCandles(pair: string, timeframe: Timeframe): Candle[] | null {
    const normalized = pair.toUpperCase();
    const duration = timeframeMs(timeframe);
    const buckets = this.bars.get(normalized)?.get(timeframe) || [];
    const candles: Candle[] = buckets
      .filter((bar) => bar.timestamp + duration <= this.now())
      .map((bar) => ({ timestamp: new Date(bar.timestamp).toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: null }));
    if (validateCandleSeries(candles, { timeframe, nowMs: this.now(), minCandles: 25 }).ok) return candles;
    return null;
  }

  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.socket?.close();
    this.socket = undefined;
  }

  private connect(): void {
    if (this.started || this.socket || this.stopped || !this.apiKey) return;
    this.started = true;
    const url = `wss://ws.finnhub.io?token=${encodeURIComponent(this.apiKey)}`;
    let socket: FinnhubWebSocketLike;
    try {
      socket = this.socketFactory(url);
    } catch {
      this.started = false;
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.started = false;
      this.reconnectDelayMs = this.reconnectBaseMs;
      for (const pair of this.subscribed) this.sendSubscribe(pair);
    }, { once: true });
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      this.consumeMessage(event?.data);
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      try { socket.close(); } catch { /* reconnect is handled by close */ }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.started = false;
      this.scheduleReconnect();
    }, { once: true });
  }

  private sendSubscribe(pair: string): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return;
    const symbol = `OANDA:${pair.replace('/', '_').toUpperCase()}`;
    try { socket.send(JSON.stringify({ type: 'subscribe', symbol })); } catch { /* close/error path will reconnect */ }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer || this.subscribed.size === 0) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectMaxMs, Math.max(this.reconnectBaseMs, this.reconnectDelayMs * 2));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
    if (typeof this.reconnectTimer === 'object' && 'unref' in this.reconnectTimer) this.reconnectTimer.unref();
  }

  private consumeMessage(raw: unknown): void {
    let message: any;
    try { message = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    if (message?.type !== 'trade' || !Array.isArray(message.data)) return;
    for (const tick of message.data) {
      const symbol = typeof tick?.s === 'string' ? tick.s : '';
      const pairKey = this.symbolToPair(symbol);
      const price = Number(tick?.p);
      const timestamp = Number(tick?.t);
      if (!pairKey || !Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) || timestamp > this.now() + 60_000 || timestamp < this.now() - 7 * 86_400_000) continue;
      this.recordTick(pairKey, price, timestamp);
    }
  }

  private symbolToPair(symbol: string): string | undefined {
    const code = symbol.split(':').pop()?.replace('_', '/').toUpperCase();
    return code && this.subscribed.has(code) ? code : undefined;
  }

  private recordTick(pair: string, price: number, timestamp: number): void {
    let byTimeframe = this.bars.get(pair);
    if (!byTimeframe) { byTimeframe = new Map(); this.bars.set(pair, byTimeframe); }
    for (const timeframe of TIMEFRAMES) {
      const duration = timeframeMs(timeframe);
      const bucketStart = Math.floor(timestamp / duration) * duration;
      let buckets = byTimeframe.get(timeframe);
      if (!buckets) { buckets = []; byTimeframe.set(timeframe, buckets); }
      const latest = buckets[buckets.length - 1];
      if (latest && bucketStart < latest.timestamp) continue;
      if (latest && bucketStart === latest.timestamp) {
        latest.high = Math.max(latest.high, price);
        latest.low = Math.min(latest.low, price);
        latest.close = price;
        continue;
      }
      buckets.push({ timestamp: bucketStart, open: price, high: price, low: price, close: price });
      if (buckets.length > 500) buckets.splice(0, buckets.length - 500);
    }
  }
}
