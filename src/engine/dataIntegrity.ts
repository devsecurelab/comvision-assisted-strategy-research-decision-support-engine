import type { Candle, Timeframe } from './types';

export type DataQualityCode =
  | 'INSUFFICIENT_CANDLES'
  | 'NON_FINITE_OHLC'
  | 'OHLC_INCONSISTENT'
  | 'INVALID_TIMESTAMP'
  | 'NON_MONOTONIC'
  | 'DUPLICATE_TIMESTAMP'
  | 'MISALIGNED_TIMESTAMP'
  | 'CANDLE_GAP'
  | 'FORMING_CANDLE'
  | 'CLOCK_DRIFT';

export interface DataQualityIssue { code: DataQualityCode; index?: number; detail: string }
export interface DataQualityReport { ok: boolean; status: 'DATA_QUALITY_OK' | 'DATA_QUALITY_FAIL'; issues: DataQualityIssue[] }

export const MAX_CLOCK_DRIFT_MS = 2_000;
const TIMEFRAME_MINUTES: Record<Timeframe, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 };
const NEW_YORK_WEEK_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function timeframeMs(timeframe: Timeframe): number {
  return TIMEFRAME_MINUTES[timeframe] * 60_000;
}

/** Spot FX closure: Friday 17:00 through Sunday 17:00 America/New_York, plus UTC Dec 25 and Jan 1. */
export function isScheduledMarketClosure(ms: number): boolean {
  const date = new Date(ms);
  const month = date.getUTCMonth();
  const dom = date.getUTCDate();
  if ((month === 11 && dom === 25) || (month === 0 && dom === 1)) return true;
  const parts = NEW_YORK_WEEK_PARTS.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekday = get('weekday');
  const minuteOfDay = Number(get('hour')) * 60 + Number(get('minute'));
  if (weekday === 'Sat') return true;
  if (weekday === 'Fri') return minuteOfDay >= 17 * 60;
  return weekday === 'Sun' && minuteOfDay < 17 * 60;
}

/** A bar is unavailable when either its open or close boundary falls inside a scheduled closure. */
export function isScheduledMarketBarClosed(openMs: number, durationMs: number): boolean {
  return isScheduledMarketClosure(openMs) || isScheduledMarketClosure(openMs + durationMs);
}

/**
 * Fail-closed candle-series validation (P2). A series that is out of order, has
 * inconsistent OHLC, a forming candle, or an unexplained gap is DATA_QUALITY_FAIL.
 */
export function validateCandleSeries(
  candles: Candle[],
  options: { timeframe?: Timeframe; nowMs?: number; minCandles?: number } = {},
): DataQualityReport {
  const issues: DataQualityIssue[] = [];
  const minCandles = options.minCandles ?? 1;
  if (!Array.isArray(candles) || candles.length < minCandles) {
    issues.push({ code: 'INSUFFICIENT_CANDLES', detail: `Need at least ${minCandles} closed candles; received ${candles?.length ?? 0}.` });
    return { ok: false, status: 'DATA_QUALITY_FAIL', issues };
  }
  const interval = options.timeframe ? timeframeMs(options.timeframe) : undefined;
  let previousMs: number | undefined;
  candles.forEach((c, index) => {
    const ms = Date.parse(c.timestamp);
    if (!Number.isFinite(ms)) {
      issues.push({ code: 'INVALID_TIMESTAMP', index, detail: 'Candle timestamp is not a valid ISO time.' });
      return;
    }
    const values = [c.open, c.high, c.low, c.close];
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
      issues.push({ code: 'NON_FINITE_OHLC', index, detail: 'OHLC values must be finite positive numbers.' });
    } else if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.high < c.low) {
      issues.push({ code: 'OHLC_INCONSISTENT', index, detail: 'High must be >= max(open, close) and low <= min(open, close).' });
    }
    if (interval && ms % interval !== 0) {
      issues.push({ code: 'MISALIGNED_TIMESTAMP', index, detail: `Candle open is not aligned to the ${options.timeframe} boundary.` });
    }
    if (previousMs !== undefined) {
      if (ms === previousMs) issues.push({ code: 'DUPLICATE_TIMESTAMP', index, detail: 'Duplicate candle timestamp.' });
      else if (ms < previousMs) issues.push({ code: 'NON_MONOTONIC', index, detail: 'Candles must be strictly ascending in time.' });
      else if (interval && ms - previousMs > interval) {
        for (let slot = previousMs + interval; slot < ms; slot += interval) {
          if (!isScheduledMarketBarClosed(slot, interval)) {
            issues.push({ code: 'CANDLE_GAP', index, detail: `Missing ${options.timeframe} candle at ${new Date(slot).toISOString()}.` });
            break;
          }
        }
      }
    }
    previousMs = ms;
  });
  if (interval && options.nowMs !== undefined && previousMs !== undefined && previousMs + interval > options.nowMs) {
    issues.push({ code: 'FORMING_CANDLE', index: candles.length - 1, detail: 'Latest candle has not closed; decisions use closed candles only.' });
  }
  return { ok: issues.length === 0, status: issues.length === 0 ? 'DATA_QUALITY_OK' : 'DATA_QUALITY_FAIL', issues };
}

/** Drift between provider HTTP Date header and local clock, compensated for header 1s truncation and request latency. */
export function measureClockDrift(providerDateHeader: string | null | undefined, requestStartedMs: number, responseReceivedMs: number): { driftMs: number | null; ok: boolean; status: 'CLOCK_OK' | 'CLOCK_DRIFT' | 'CLOCK_UNAVAILABLE' } {
  const providerMs = providerDateHeader ? Date.parse(providerDateHeader) : NaN;
  if (!Number.isFinite(providerMs)) return { driftMs: null, ok: true, status: 'CLOCK_UNAVAILABLE' };
  const localMid = requestStartedMs + (responseReceivedMs - requestStartedMs) / 2;
  const driftMs = Math.round(providerMs + 500 - localMid);
  const ok = Math.abs(driftMs) <= MAX_CLOCK_DRIFT_MS + (responseReceivedMs - requestStartedMs) / 2;
  return { driftMs, ok, status: ok ? 'CLOCK_OK' : 'CLOCK_DRIFT' };
}
