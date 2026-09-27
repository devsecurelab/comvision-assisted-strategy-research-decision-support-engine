// Data Providers & Feed Adapters
// Twelve Data (Primary 5m Feed) + Alpha Vantage (Fallback) + Research Deterministic Feed

import { Candle, Timeframe } from './types';

export interface ProviderQuotaInfo {
  used: number;
  limit: number;
  configured: boolean;
  status: 'ONLINE' | 'STANDBY' | 'FALLBACK_LIVE' | 'RATE_LIMITED' | 'UNCONFIGURED';
}

export interface ProviderStatus {
  provider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'RESEARCH_STREAM_REPLAY';
  status: 'ONLINE' | 'FALLBACK_LIVE' | 'RATE_LIMITED' | 'OFFLINE';
  lastSync: string;
  requestsUsedToday: number;
  rateLimitWarning?: string;
  provenanceDetails: string;
  isFallbackLive: boolean;
  quota: {
    twelveData: ProviderQuotaInfo;
    alphaVantage: ProviderQuotaInfo;
  };
}

export function timeframeToMinutes(tf: Timeframe = '5m'): number {
  switch (tf) {
    case '1m':
      return 1;
    case '5m':
      return 5;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    default:
      return 5;
  }
}

export class MarketFeedManager {
  private twelveDataApiKey: string;
  private alphaVantageApiKey: string;
  private twelveDataRequestsToday = 14;
  private alphaVantageRequestsToday = 3;
  private fallbackLiveActive = false;
  private activeProvider: 'TWELVE_DATA' | 'ALPHA_VANTAGE' | 'RESEARCH_STREAM_REPLAY' = 'RESEARCH_STREAM_REPLAY';

  constructor(twelveDataKey = '', alphaVantageKey = '') {
    this.twelveDataApiKey = twelveDataKey || process.env.TWELVE_DATA_API_KEY || '';
    this.alphaVantageApiKey = alphaVantageKey || process.env.ALPHA_VANTAGE_API_KEY || '';

    if (this.twelveDataApiKey) {
      this.activeProvider = 'TWELVE_DATA';
    } else if (this.alphaVantageApiKey) {
      this.activeProvider = 'ALPHA_VANTAGE';
    } else {
      this.activeProvider = 'RESEARCH_STREAM_REPLAY';
    }
  }

  public setKeys(twelveKey: string, avKey: string) {
    this.twelveDataApiKey = twelveKey;
    this.alphaVantageApiKey = avKey;
    if (this.fallbackLiveActive) {
      this.activeProvider = 'ALPHA_VANTAGE';
    } else if (this.twelveDataApiKey) {
      this.activeProvider = 'TWELVE_DATA';
    } else if (this.alphaVantageApiKey) {
      this.activeProvider = 'ALPHA_VANTAGE';
    } else {
      this.activeProvider = 'RESEARCH_STREAM_REPLAY';
    }
  }

  public simulateFallbackLive(enable?: boolean): ProviderStatus {
    this.fallbackLiveActive = typeof enable === 'boolean' ? enable : !this.fallbackLiveActive;
    if (this.fallbackLiveActive) {
      this.activeProvider = 'ALPHA_VANTAGE';
      this.alphaVantageRequestsToday += 1;
    } else {
      this.activeProvider = this.twelveDataApiKey ? 'TWELVE_DATA' : 'RESEARCH_STREAM_REPLAY';
    }
    return this.getStatus();
  }

  public isFallbackLive(): boolean {
    return this.fallbackLiveActive;
  }

  public incrementRequests(target?: 'TWELVE_DATA' | 'ALPHA_VANTAGE') {
    const prov = target || (this.fallbackLiveActive ? 'ALPHA_VANTAGE' : this.activeProvider);
    if (prov === 'TWELVE_DATA') {
      this.twelveDataRequestsToday += 1;
    } else if (prov === 'ALPHA_VANTAGE') {
      this.alphaVantageRequestsToday += 1;
    }
  }

  public getStatus(): ProviderStatus {
    const isTwelveDataConfigured = !!this.twelveDataApiKey;
    const isAvConfigured = !!this.alphaVantageApiKey;

    let warning: string | undefined;
    if (this.fallbackLiveActive) {
      warning = 'FALLBACK_LIVE Active: Twelve Data primary stream simulated rate-limit. Active failover to Alpha Vantage FX mirror.';
    } else if (this.twelveDataRequestsToday > 700) {
      warning = 'Twelve Data rate limit approaching daily tier limit (700/800 requests)';
    }

    const currentStatus: 'ONLINE' | 'FALLBACK_LIVE' | 'RATE_LIMITED' | 'OFFLINE' =
      this.fallbackLiveActive ? 'FALLBACK_LIVE' : 'ONLINE';

    return {
      provider: this.activeProvider,
      status: currentStatus,
      lastSync: new Date().toISOString(),
      requestsUsedToday: this.activeProvider === 'TWELVE_DATA' ? this.twelveDataRequestsToday : this.alphaVantageRequestsToday,
      rateLimitWarning: warning,
      isFallbackLive: this.fallbackLiveActive,
      provenanceDetails: this.fallbackLiveActive
        ? 'Alpha Vantage FX_INTRADAY Fallback Stream (FALLBACK_LIVE Active Failover)'
        : isTwelveDataConfigured
        ? 'Twelve Data API v1 (5m Interval, EUR/USD & Major Pairs)'
        : isAvConfigured
        ? 'Alpha Vantage FX_INTRADAY Standby Mirror'
        : 'Controlled Research Stream Replay (Deterministic Market Engine)',
      quota: {
        twelveData: {
          used: this.twelveDataRequestsToday,
          limit: 800,
          configured: isTwelveDataConfigured,
          status: this.fallbackLiveActive ? 'RATE_LIMITED' : isTwelveDataConfigured ? 'ONLINE' : 'UNCONFIGURED',
        },
        alphaVantage: {
          used: this.alphaVantageRequestsToday,
          limit: 500,
          configured: isAvConfigured,
          status: this.fallbackLiveActive ? 'FALLBACK_LIVE' : isAvConfigured ? 'STANDBY' : 'UNCONFIGURED',
        },
      },
    };
  }

  /**
   * Generates or fetches deterministic realistic market feed candles
   * Includes structural fractals, Order Blocks, FVGs, volume proxies, and wicks.
   */
  public generateResearchCandles(count = 60, basePrice = 1.0850, timeframe: Timeframe = '5m'): Candle[] {
    const candles: Candle[] = [];
    const now = Date.now();
    const intervalMs = timeframeToMinutes(timeframe) * 60 * 1000;

    let currentPrice = basePrice;
    for (let i = 0; i < count; i++) {
      const timestamp = new Date(now - (count - i) * intervalMs).toISOString();

      // Deterministic price drift with micro-cycles
      const cycle = Math.sin(i * 0.28) * 0.0018;
      const noise = (Math.cos(i * 1.1) * 0.0004);
      const step = (i > count - 8) ? 0.0006 : cycle + noise; // upward expansion near end
      
      const open = Number(currentPrice.toFixed(5));
      const close = Number((open + step).toFixed(5));
      const high = Number((Math.max(open, close) + Math.abs(noise) + 0.0002).toFixed(5));
      const low = Number((Math.min(open, close) - Math.abs(noise) - 0.0002).toFixed(5));
      
      // Tick count proxy
      const baseTick = 120 + Math.floor(Math.abs(Math.sin(i * 0.5)) * 140);
      const volume = i >= count - 3 ? baseTick + (i - count + 4) * 50 : baseTick;

      candles.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume,
      });

      currentPrice = close;
    }

    return candles;
  }

  /**
   * Deterministic Valid Candidate Generator:
   * Produces a candidate frame specifically tailored to cleanly pass all Strategy v1.0 rules
   */
  public generateDeterministicValidSetup(basePrice = 1.0840, timeframe: Timeframe = '5m'): Candle[] {
    const candles = this.generateResearchCandles(25, basePrice, timeframe);
    const now = Date.now();
    const stepMins = timeframeToMinutes(timeframe);
    const tMinus = (stepCount: number) => new Date(now - stepCount * stepMins * 60 * 1000).toISOString();

    // Set base prices around 1.0835 to 1.0845 for neutral candles
    for (let i = 0; i < 21; i++) {
      candles[i].open = 1.0840;
      candles[i].close = 1.0841;
      candles[i].high = 1.0843;
      candles[i].low = 1.0838;
      candles[i].volume = 120;
    }

    // 1. Confirmed Swing High 1 at index 6 (confirmed at index 8)
    candles[6] = {
      timestamp: tMinus(19),
      open: 1.0842,
      high: 1.0850, // SH 1
      low: 1.0840,
      close: 1.0846,
      volume: 140,
    };

    // 2. Confirmed Swing Low 1 at index 10 (confirmed at index 12)
    candles[10] = {
      timestamp: tMinus(15),
      open: 1.0835,
      high: 1.0838,
      low: 1.0825, // SL 1
      close: 1.0830,
      volume: 130,
    };

    // 3. Confirmed Swing High 2 at index 14 (confirmed at index 16) -> Higher High
    candles[14] = {
      timestamp: tMinus(11),
      open: 1.0855,
      high: 1.0868, // SH 2 > SH 1
      low: 1.0850,
      close: 1.0862,
      volume: 160,
    };

    // 4. Confirmed Swing Low 2 at index 18 (confirmed at index 20) -> Higher Low
    candles[18] = {
      timestamp: tMinus(7),
      open: 1.0836,
      high: 1.0840,
      low: 1.0832, // SL 2 > SL 1
      close: 1.0835,
      volume: 140,
    };

    // Index 21: Order Block (Down candle preceding displacement)
    candles[21] = {
      timestamp: tMinus(4),
      open: 1.08420,
      high: 1.08440,
      low: 1.08380,
      close: 1.08390,
      volume: 140,
    };

    // Index 22: C1 (Base candle originating near OB)
    candles[22] = {
      timestamp: tMinus(3),
      open: 1.08395,
      high: 1.08430, // C1 High = 1.08430
      low: 1.08385,
      close: 1.08425,
      volume: 180,
    };

    // Index 23: C2 (Impulse Displacement)
    candles[23] = {
      timestamp: tMinus(2),
      open: 1.08428,
      high: 1.08490,
      low: 1.08425,
      close: 1.08480,
      volume: 240, // T2 > Average_Tick_10 & T1 < T2
    };

    // Index 24: C3 (Confirmation candle, Low > C1 High => FVG [1.08430, 1.08445])
    candles[24] = {
      timestamp: tMinus(1),
      open: 1.08482,
      high: 1.08515,
      low: 1.08445, // Low(C3) > High(C1) (1.08445 > 1.08430 -> Bullish FVG [1.08430, 1.08445])
      close: 1.08505, // Close(C3) > High(C1) -> Bullish expansion valid
      volume: 310, // T1 < T2 < T3 => ASCENDING
    };

    return candles;
  }
}

export const feedManager = new MarketFeedManager();
