import { Candle, Timeframe } from '../../src/engine/types';
import { timeframeToMinutes } from '../../src/engine/dataProviders';

/** Test-only deterministic data. Never import this module from production code. */
export function generateResearchCandles(count = 60, basePrice = 1.0850, timeframe: Timeframe = '5m'): Candle[] {
  const candles: Candle[] = [];
  const now = Date.now();
  const intervalMs = timeframeToMinutes(timeframe) * 60 * 1000;
  let currentPrice = basePrice;
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now - (count - i) * intervalMs).toISOString();
    const cycle = Math.sin(i * 0.28) * 0.0018;
    const noise = Math.cos(i * 1.1) * 0.0004;
    const step = i > count - 8 ? 0.0006 : cycle + noise;
    const open = Number(currentPrice.toFixed(5));
    const close = Number((open + step).toFixed(5));
    const high = Number((Math.max(open, close) + Math.abs(noise) + 0.0002).toFixed(5));
    const low = Number((Math.min(open, close) - Math.abs(noise) - 0.0002).toFixed(5));
    const volume = 120 + Math.floor(Math.abs(Math.sin(i * 0.5)) * 140);
    candles.push({ timestamp, open, high, low, close, volume });
    currentPrice = close;
  }
  return candles;
}

export function generateDeterministicValidSetup(basePrice = 1.0840, timeframe: Timeframe = '5m'): Candle[] {
  const candles = generateResearchCandles(25, basePrice, timeframe);
  const now = Date.now();
  const stepMins = timeframeToMinutes(timeframe);
  const tMinus = (stepCount: number) => new Date(now - stepCount * stepMins * 60 * 1000).toISOString();

  for (let i = 0; i < 21; i++) {
    candles[i] = { ...candles[i], open: 1.0840, close: 1.0841, high: 1.0843, low: 1.0838, volume: 120 };
  }
  candles[6] = { timestamp: tMinus(19), open: 1.0842, high: 1.0850, low: 1.0840, close: 1.0846, volume: 140 };
  candles[10] = { timestamp: tMinus(15), open: 1.0835, high: 1.0838, low: 1.0825, close: 1.0830, volume: 130 };
  candles[14] = { timestamp: tMinus(11), open: 1.0855, high: 1.0868, low: 1.0850, close: 1.0862, volume: 160 };
  candles[18] = { timestamp: tMinus(7), open: 1.0836, high: 1.0840, low: 1.0832, close: 1.0835, volume: 140 };
  candles[21] = { timestamp: tMinus(4), open: 1.08420, high: 1.08440, low: 1.08380, close: 1.08390, volume: 140 };
  candles[22] = { timestamp: tMinus(3), open: 1.08395, high: 1.08430, low: 1.08385, close: 1.08425, volume: 180 };
  candles[23] = { timestamp: tMinus(2), open: 1.08428, high: 1.08490, low: 1.08425, close: 1.08480, volume: 240 };
  candles[24] = { timestamp: tMinus(1), open: 1.08482, high: 1.08515, low: 1.08445, close: 1.08505, volume: 310 };
  return candles;
}
