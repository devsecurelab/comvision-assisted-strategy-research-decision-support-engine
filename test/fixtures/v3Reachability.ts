import type { Candle, Timeframe } from '../../src/engine/types';

const minutes: Record<Timeframe, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 };

/**
 * Test-only fixture (production never imports test fixtures). Bullish geometry in units:
 * equal highs at 100 (untouched BSL, idx 21/24) -> decline -> lower high 64 (idx 30) ->
 * swing low 44 (idx 32) -> sweep of 44 at idx 35 -> bearish OB idx 36 -> 3-candle expansion
 * idx 37..39 with FVG; idx 39 closes 65.5 above the lower high (BOS + CHoCH), still in discount.
 * idx 33 is a failed bearish OB broken at idx 38 after the sweep (breaker).
 */
const LAYOUT: Array<[number, number, number, number]> = [
  [85, 95, 84, 94], [94, 100, 92, 96], [96, 97, 88, 89], [89, 93, 87, 92], [92, 100.05, 90, 91],
  [91, 92, 80, 81], [81, 83, 70, 72], [72, 74, 60, 62], [62, 63, 50, 52], [52, 58, 49, 56],
  [56, 64, 55, 60], [60, 61, 50, 51], [51, 53, 44, 46], [46, 52, 45, 50], [50, 51, 46, 47],
  [47, 48, 42, 46], [46, 47.5, 44.5, 44.8], [44.8, 52, 44.6, 51.5], [51.5, 57, 50, 56.5], [56.5, 66, 56, 65.5],
];

export const SIGNAL_TS = '2026-01-14T08:30:00.000Z';

export function unitFor(basePrice: number): number {
  return basePrice > 20 ? 0.01 : 0.0001;
}

export function idealPriceOnlySetup(basePrice: number, timeframe: Timeframe, direction: 'BULLISH' | 'BEARISH', signalTs = SIGNAL_TS): Candle[] {
  const u = unitFor(basePrice);
  const step = minutes[timeframe] * 60_000;
  const end = Date.parse(signalTs);
  const rows: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 20; i++) {
    const o = 70 + i * 0.7; const c = o + (i % 2 ? -1.5 : 2);
    rows.push([o, Math.max(o, c) + 1, Math.min(o, c) - 1, c]);
  }
  rows.push(...LAYOUT);
  const price = (v: number) => basePrice + (v - 70) * u;
  const bullish: Candle[] = rows.map(([o, h, l, c], i) => ({
    timestamp: new Date(end - (rows.length - 1 - i) * step).toISOString(),
    open: price(o), high: price(h), low: price(l), close: price(c), volume: null,
  }));
  if (direction === 'BULLISH') return bullish;
  return bullish.map((c) => ({ ...c, open: 2 * basePrice - c.open, high: 2 * basePrice - c.low, low: 2 * basePrice - c.high, close: 2 * basePrice - c.close }));
}

/** Test-only FULL fixture: volume, delta, CVD and provider POC on every candle. */
export function idealFullSetup(basePrice: number, timeframe: Timeframe, direction: 'BULLISH' | 'BEARISH'): Candle[] {
  const candles = idealPriceOnlySetup(basePrice, timeframe, direction);
  const sign = direction === 'BULLISH' ? 1 : -1;
  const last = candles.length - 1;
  return candles.map((candle, index) => ({
    ...candle,
    volume: index === last ? 500 : 100,
    volumeDelta: index === last ? 200 * sign : 5 * sign * (index % 3 === 0 ? -1 : 1),
    cvd: sign * index,
    pocPrice: direction === 'BULLISH' ? candle.low + (candle.high - candle.low) * 0.2 : candle.high - (candle.high - candle.low) * 0.2,
  }));
}

/** Closed 1h candles whose structure is HH+HL (BULLISH) or LH+LL (BEARISH) as of `asOfIso`. */
export function htfCandlesFor(direction: 'BULLISH' | 'BEARISH', asOfIso: string, basePrice = 1.085): Candle[] {
  const u = unitFor(basePrice) * 10;
  const lastClosedOpen = Math.floor(Date.parse(asOfIso) / 3_600_000) * 3_600_000 - 3_600_000;
  const pattern = [0, 3, 6, 2, 1, 5, 9, 12, 7, 6, 10, 14, 17, 12, 11, 15, 19];
  const sign = direction === 'BULLISH' ? 1 : -1;
  return pattern.map((v, i) => {
    const mid = basePrice + sign * v * u;
    return { timestamp: new Date(lastClosedOpen - (pattern.length - 1 - i) * 3_600_000).toISOString(), open: mid - u * 0.2, high: mid + u, low: mid - u, close: mid + u * 0.2, volume: null };
  });
}
