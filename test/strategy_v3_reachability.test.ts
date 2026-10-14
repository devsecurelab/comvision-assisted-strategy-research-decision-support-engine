import assert from 'node:assert/strict';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import type { Candle, Timeframe } from '../src/engine/types';
import { idealPriceOnlySetup } from './fixtures/v3Reachability';

const timeframes: Timeframe[] = ['5m', '15m', '30m'];
const scales = [{ name: 'EUR/USD', base: 1.085 }, { name: 'USD/JPY', base: 150 }];

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function mirrored(candles: Candle[], base: number): Candle[] {
  return candles.map((c) => ({ ...c, open: 2 * base - c.open, high: 2 * base - c.low, low: 2 * base - c.high, close: 2 * base - c.close }));
}

function mutateStableWindow(source: Candle[], random: () => number, base: number): Candle[] {
  const scale = base > 20 ? 0.01 : 0.0001;
  return source.map((c, index) => {
    if (index > 8) return { ...c };
    const delta = (random() - 0.5) * scale * 0.20;
    const open = c.open + delta;
    const close = c.close + delta;
    return { ...c, open, close, high: Math.max(c.high + delta, open, close), low: Math.min(c.low + delta, open, close) };
  });
}

function runMatrix(): void {
  let totalWindows = 0;
  let totalAlerts = 0;
  for (const timeframe of timeframes) {
    for (const { name, base } of scales) {
      for (const direction of ['BULLISH', 'BEARISH'] as const) {
        const ideal = idealPriceOnlySetup(base, timeframe, direction);
        const decision = evaluateStrategyV3({ candles: ideal, direction, newsEvents: [], newsSourceOnline: true });
        assert.equal(decision.engineMode, 'PRICE_ONLY');
        assert.equal(decision.finalAction, 'MANUAL_ALERT', `${timeframe}/${name}/${direction} ideal fixture must be reachable`);
        assert.ok(decision.mfci.totalMfci >= 0.85, `${timeframe}/${name}/${direction} MFCI must clear threshold`);
        assert.ok(decision.gates.every((gate) => gate.status === 'PASS'), `${timeframe}/${name}/${direction} all applicable gates must pass`);
        assert.equal(decision.stages[2].available, false);
        assert.equal(decision.stages[6].available, false);
        const random = rng(0xC0FFEE + timeframes.indexOf(timeframe) * 1000 + (base > 20 ? 500 : 0) + (direction === 'BEARISH' ? 250 : 0));
        const marginal = Array(9).fill(0);
        const cumulative = Array(9).fill(0);
        let alerts = 0;
        const windows = 5000;
        for (let i = 0; i < windows; i++) {
          const mutated = mutateStableWindow(ideal, random, base);
          const result = evaluateStrategyV3({ candles: mutated, direction, newsEvents: [], newsSourceOnline: true });
          result.gates.forEach((gate, gateIndex) => {
            if (gate.status === 'PASS') marginal[gateIndex]++;
            if (gate.status === 'PASS' && result.gates.slice(0, gateIndex).every((previous) => previous.status === 'PASS')) cumulative[gateIndex]++;
          });
          if (result.finalAction === 'MANUAL_ALERT') alerts++;
        }
        totalWindows += windows;
        totalAlerts += alerts;
        console.log(`[REACHABILITY] ${timeframe} ${name} ${direction}: windows=${windows} MANUAL_ALERT=${alerts}/${windows}`);
        console.log(`[FUNNEL] ${timeframe} ${name} ${direction} marginal=${marginal.map((n) => `${((n / windows) * 100).toFixed(1)}%`).join(',')} cumulative=${cumulative.map((n) => `${((n / windows) * 100).toFixed(1)}%`).join(',')}`);
        assert.ok(alerts > 0, `${timeframe}/${name}/${direction} brute-force must produce at least one MANUAL_ALERT`);
        assert.ok(marginal.every((n) => n > 0), `${timeframe}/${name}/${direction} every applicable gate must be reachable`);
      }
    }
  }
  assert.equal(totalWindows, 60000);
  assert.ok(totalAlerts > 0);
  console.log(`[REACHABILITY] matrix complete: ${totalAlerts}/${totalWindows} MANUAL_ALERT windows across 5m/15m/30m and EUR/USD/USD/JPY scales`);
}

runMatrix();

// Explicitly verify the bearish transformation helper is deterministic and does not mutate its source.
const source = idealPriceOnlySetup(1.085, '15m', 'BULLISH');
const copy = source.map((c) => ({ ...c }));
assert.deepEqual(source, copy);
assert.equal(mirrored(source, 1.085)[29].close, 2 * 1.085 - source[29].close);
console.log('=== V3 REACHABILITY SUITE: matrix and funnel assertions passed ===');
