import type { Candle, Timeframe } from '../types';

export const PROVIDER_ORDER = ['TWELVE_DATA', 'OANDA', 'TIINGO'] as const;
export type MarketDataProvider = typeof PROVIDER_ORDER[number];
export type ManuallySelectableProvider = 'TWELVE_DATA';

export interface ProviderCandlePayload {
  rows: unknown[];
  timezone?: string;
  volumeAvailable?: boolean;
  serverDate?: string | null;
  creditsUsed?: number;
  creditsLeft?: number;
}

export interface IForexDataProvider {
  readonly id: MarketDataProvider;
  readonly label: string;
  isConfigured(): boolean;
  canServeFromStream?(pair: string, timeframe: Timeframe): boolean;
  fetchCandles(pair: string, timeframe: Timeframe, signal: AbortSignal): Promise<ProviderCandlePayload>;
  fetchHistoricalCandles?(pair: string, timeframe: Timeframe, startDate: string, endDateInclusive: string, signal: AbortSignal): Promise<ProviderCandlePayload>;
}

export interface ProviderCircuitSnapshot {
  provider: MarketDataProvider;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'UNCONFIGURED';
  retryAt?: string;
  consecutiveFailures: number;
  lastFailureCode?: string;
  lastFailureAt?: string;
  lastSuccessAt?: string;
}

export interface NormalizedProviderResult {
  candles: Candle[];
  volumeAvailable: boolean;
}
