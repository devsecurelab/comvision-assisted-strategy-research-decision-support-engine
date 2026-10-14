import type { Candle, Timeframe } from '../../src/engine/types';

const minutes: Record<Timeframe, number> = { '5m': 5, '15m': 15, '30m': 30, '1m': 1, '1h': 60 };

/** Test-only fixture. It deliberately exercises the frozen gates; production never imports test fixtures. */
export function idealPriceOnlySetup(basePrice: number, timeframe: Timeframe, direction: 'BULLISH' | 'BEARISH'): Candle[] {
  const scale = basePrice > 20 ? 0.01 : 0.0001;
  const step = minutes[timeframe];
  const startHour = timeframe === '30m' ? 0 : 6;
  const ts = (i: number) => new Date(Date.UTC(2026, 0, 1, startHour, i * step)).toISOString();
  const bullish: Candle[] = [];
  for (let i = 0; i < 20; i++) {
    bullish.push({ timestamp: ts(i), open: basePrice, high: basePrice + scale, low: basePrice - scale, close: basePrice, volume: null });
  }
  bullish[14] = { ...bullish[14], high: basePrice + 20 * scale, low: basePrice - scale, close: basePrice + scale };
  bullish[16] = { ...bullish[16], high: basePrice + scale, low: basePrice - 20 * scale, close: basePrice - scale };
  for (let i = 20; i < 30; i++) {
    bullish.push({ timestamp: ts(i), open: basePrice - 10 * scale, high: basePrice - 9 * scale, low: basePrice - 11 * scale, close: basePrice - 10 * scale, volume: null });
  }
  bullish[24] = { ...bullish[24], high: basePrice - 9 * scale, low: basePrice - 11 * scale };
  bullish[25] = { ...bullish[25], high: basePrice - 9 * scale, low: basePrice - 11 * scale };
  bullish[26] = { ...bullish[26], high: basePrice - 7 * scale, low: basePrice - 7 * scale, close: basePrice - 8 * scale };
  bullish[27] = { ...bullish[27], high: basePrice - 7 * scale, low: basePrice - 9 * scale, close: basePrice - 8 * scale };
  bullish[28] = { ...bullish[28], high: basePrice - 7 * scale, low: basePrice - 9 * scale, close: basePrice - 8 * scale };
  bullish[29] = { ...bullish[29], open: basePrice - 30 * scale, high: basePrice - 7.5 * scale, low: basePrice - 15 * scale, close: basePrice - 8 * scale };
  if (direction === 'BULLISH') return bullish;
  return bullish.map((c) => ({ ...c, open: 2 * basePrice - c.open, high: 2 * basePrice - c.low, low: 2 * basePrice - c.high, close: 2 * basePrice - c.close }));
}

/** Test-only FULL fixture: every candle has volume, delta, CVD and provider POC. */
export function idealFullSetup(basePrice: number, timeframe: Timeframe, direction: 'BULLISH' | 'BEARISH'): Candle[] {
  const candles = idealPriceOnlySetup(basePrice, timeframe, direction);
  return candles.map((candle, index) => ({
    ...candle,
    volume: index === candles.length - 1 ? 500 : 100,
    volumeDelta: index === candles.length - 1 ? (direction === 'BULLISH' ? 200 : -200) : (direction === 'BULLISH' ? 1 : -1),
    cvd: index === candles.length - 1 ? (direction === 'BULLISH' ? 2 : -2) : (direction === 'BULLISH' ? 1 : -1),
    pocPrice: index === candles.length - 4 ? candle.low : candle.close,
  }));
}
