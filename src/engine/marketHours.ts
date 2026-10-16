import type { Candle, Timeframe } from './types';
import { isScheduledMarketClosure, timeframeMs } from './dataIntegrity';

/** Whether an instant is inside the FX weekly or fixed-date UTC holiday closure. */
export function isFxMarketClosed(value: string | number | Date): boolean {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return isScheduledMarketClosure(time);
}

/** A signal bar is unavailable if its open or close instant falls in a closed market interval. */
export function isFxBarClosed(timestamp: string, timeframe: Timeframe): boolean {
  const openMs = Date.parse(timestamp);
  if (!Number.isFinite(openMs)) return false; // Preserve malformed timestamps for the data-quality validator.
  const closeMs = openMs + timeframeMs(timeframe);
  return isFxMarketClosed(openMs) || isFxMarketClosed(closeMs);
}

/** Filter rows whose candle-open timestamps are closed; callers retain the original provider CSV unchanged. */
export function filterFxOpenMarketCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  void timeframe; // The row's timestamp is the R8 market-hours boundary; timeframe is retained for API symmetry/audit clarity.
  return candles.filter((candle) => !isFxMarketClosed(candle.timestamp));
}

/** Number of candles excluded from analysis, useful for audit reports. */
export function countFxClosedMarketCandles(candles: Candle[], timeframe: Timeframe): number {
  return candles.length - filterFxOpenMarketCandles(candles, timeframe).length;
}
