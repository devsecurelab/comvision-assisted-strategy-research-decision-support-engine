import type { Candle, Timeframe } from './types';
import { isScheduledMarketBarClosed, isScheduledMarketClosure, timeframeMs } from './dataIntegrity';

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
  return isScheduledMarketBarClosed(openMs, timeframeMs(timeframe));
}

/** Filter rows whose candle interval touches a scheduled closure; callers retain the original provider CSV unchanged. */
export function filterFxOpenMarketCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  return candles.filter((candle) => !isFxBarClosed(candle.timestamp, timeframe));
}

/** Number of candles excluded from analysis, useful for audit reports. */
export function countFxClosedMarketCandles(candles: Candle[], timeframe: Timeframe): number {
  return candles.length - filterFxOpenMarketCandles(candles, timeframe).length;
}
