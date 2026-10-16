import type { Candle, Timeframe } from '../../src/engine/types';
import { idealFullSetup, idealPriceOnlySetup, unitFor } from './v3Reachability';

export interface GateRenumberCase {
  id: string;
  candles: Candle[];
  direction: 'BULLISH' | 'BEARISH';
  timeframe: Timeframe;
  full: boolean;
}

const timeframes: Timeframe[] = ['5m', '15m', '30m'];
const scales = [{ name: 'EUR/USD', base: 1.085 }, { name: 'USD/JPY', base: 150 }];
const modes = ['PRICE_ONLY', 'FULL'] as const;
const directions = ['BULLISH', 'BEARISH'] as const;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function randomWindow(random: () => number, base: number, timeframe: Timeframe, full: boolean): Candle[] {
  const pip = unitFor(base);
  const step = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 }[timeframe] * 60_000;
  const end = Date.parse('2026-01-14T08:30:00.000Z') + Math.floor(random() * 10) * 3_600_000 / 2;
  const endAligned = Math.floor(end / step) * step;
  const vol = (2 + random() * 12) * pip;
  let price = base;
  const out: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const drift = (random() - 0.5) * vol * 2.2 + (random() < 0.06 ? (random() - 0.5) * vol * 8 : 0);
    const open = price;
    const close = price + drift;
    const high = Math.max(open, close) + random() * vol;
    const low = Math.min(open, close) - random() * vol;
    out.push({
      timestamp: new Date(endAligned - (59 - i) * step).toISOString(), open, high, low, close,
      volume: full ? Math.round(50 + random() * 200) : null,
      ...(full ? { volumeDelta: Math.round((random() - 0.5) * 200), cvd: Math.round((random() - 0.5) * 1000), pocPrice: low + (high - low) * random() } : {}),
    });
    price = close;
  }
  return out;
}

/** Reproduce the 24 ideal setups and 24,000 seeded random windows used at b90004f. */
export function* baselineGateRenumberCases(): Generator<GateRenumberCase> {
  for (const mode of modes) for (const timeframe of timeframes) for (const scale of scales) for (const direction of directions) {
    const full = mode === 'FULL';
    yield {
      id: `${mode}|${timeframe}|${scale.name}|${direction}`,
      candles: full ? idealFullSetup(scale.base, timeframe, direction) : idealPriceOnlySetup(scale.base, timeframe, direction),
      direction, timeframe, full,
    };
  }
  for (const mode of modes) for (const direction of directions) {
    const random = rng(0xBADA55 ^ (mode === 'FULL' ? 1 : 0) ^ (direction === 'BEARISH' ? 2 : 0));
    for (let i = 0; i < 6000; i++) {
      const timeframe = timeframes[i % 3];
      const scale = scales[i % 2];
      const full = mode === 'FULL';
      yield {
        id: `random|${mode}|${direction}|${i}`,
        candles: randomWindow(random, scale.base, timeframe, full),
        direction, timeframe, full,
      };
    }
  }
}
