import assert from 'node:assert/strict';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import type { Candle, Timeframe } from '../src/engine/types';
import { idealFullSetup, idealPriceOnlySetup } from './fixtures/v3Reachability';

const timeframes: Timeframe[] = ['5m', '15m', '30m'];
const scales = [{ name: 'EUR/USD', base: 1.085 }, { name: 'USD/JPY', base: 150 }];

type Mode = 'PRICE_ONLY' | 'FULL';

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

function evaluateIdeal(base: number, timeframe: Timeframe, direction: 'BULLISH' | 'BEARISH', mode: Mode) {
  return evaluateStrategyV3({
    candles: mode === 'FULL' ? idealFullSetup(base, timeframe, direction) : idealPriceOnlySetup(base, timeframe, direction),
    direction,
    newsEvents: [],
    newsSourceOnline: true,
  });
}

function runMatrix(): void {
  let totalWindows = 0;
  let totalAlerts = 0;
  for (const mode of ['PRICE_ONLY', 'FULL'] as const) {
    for (const timeframe of timeframes) {
      for (const { name, base } of scales) {
        for (const direction of ['BULLISH', 'BEARISH'] as const) {
          const ideal = mode === 'FULL' ? idealFullSetup(base, timeframe, direction) : idealPriceOnlySetup(base, timeframe, direction);
          const decision = evaluateIdeal(base, timeframe, direction, mode);
          assert.equal(decision.engineMode, mode);
          assert.equal(decision.finalAction, 'MANUAL_ALERT', `${mode}/${timeframe}/${name}/${direction} ideal fixture must be reachable`);
          assert.ok(decision.mfci.totalMfci >= 0.85, `${mode}/${timeframe}/${name}/${direction} MFCI must clear threshold`);
          const applicable = decision.gates.filter((gate) => gate.status !== 'UNAVAILABLE');
          assert.ok(applicable.length > 0 && applicable.every((gate) => gate.status === 'PASS'), `${mode}/${timeframe}/${name}/${direction} all applicable gates must pass`);
          if (mode === 'PRICE_ONLY') {
            assert.equal(decision.gates[3].status, 'UNAVAILABLE');
            assert.ok(decision.excludedStages.some((stage) => stage.reason === 'GATE4_NEEDS_VOLUME_POC'));
            assert.equal(decision.stages[2].available, false);
            assert.equal(decision.stages[4].available, false);
            assert.equal(decision.stages[7].available, false);
          } else {
            assert.ok(decision.gates.every((gate) => gate.status !== 'UNAVAILABLE'));
            assert.ok(decision.stages.filter((stage) => !stage.available).length === 0);
          }

          const random = rng(0xC0FFEE + (mode === 'FULL' ? 7000 : 0) + timeframes.indexOf(timeframe) * 1000 + (base > 20 ? 500 : 0) + (direction === 'BEARISH' ? 250 : 0));
          const marginal = Array(9).fill(0);
          const cumulative = Array(9).fill(0);
          let alerts = 0;
          const windows = 5000;
          for (let i = 0; i < windows; i++) {
            const mutated = mutateStableWindow(ideal, random, base);
            const result = evaluateStrategyV3({ candles: mutated, direction, newsEvents: [], newsSourceOnline: true });
            result.gates.forEach((gate, gateIndex) => {
              if (gate.status === 'PASS') marginal[gateIndex]++;
              if (gate.status === 'PASS' && result.gates.slice(0, gateIndex).filter((previous) => previous.status !== 'UNAVAILABLE').every((previous) => previous.status === 'PASS')) cumulative[gateIndex]++;
            });
            if (result.finalAction === 'MANUAL_ALERT') alerts++;
          }
          totalWindows += windows;
          totalAlerts += alerts;
          console.log(`[REACHABILITY] ${mode} ${timeframe} ${name} ${direction}: windows=${windows} MANUAL_ALERT=${alerts}/${windows}`);
          console.log(`[FUNNEL] ${mode} ${timeframe} ${name} ${direction} marginal=${marginal.map((n) => `${((n / windows) * 100).toFixed(1)}%`).join(',')} cumulative=${cumulative.map((n) => `${((n / windows) * 100).toFixed(1)}%`).join(',')}`);
          assert.ok(alerts > 0, `${mode}/${timeframe}/${name}/${direction} brute-force must produce at least one MANUAL_ALERT`);
          const applicableGateIndexes = mode === 'PRICE_ONLY' ? [0, 1, 2, 4, 5, 6, 7, 8] : Array.from({ length: 9 }, (_, index) => index);
          assert.ok(applicableGateIndexes.every((index) => marginal[index] > 0), `${mode}/${timeframe}/${name}/${direction} every applicable gate must be reachable`);
        }
      }
    }
  }
  assert.equal(totalWindows, 120000);
  assert.ok(totalAlerts > 0);
  console.log(`[REACHABILITY] matrix complete: ${totalAlerts}/${totalWindows} MANUAL_ALERT windows across PRICE_ONLY/FULL, 5m/15m/30m and EUR/USD/USD/JPY scales`);
}

runMatrix();

const source = idealPriceOnlySetup(1.085, '15m', 'BULLISH');
const copy = source.map((c) => ({ ...c }));
assert.deepEqual(source, copy);
assert.equal(mirrored(source, 1.085)[29].close, 2 * 1.085 - source[29].close);
console.log('=== V3 REACHABILITY SUITE: PRICE_ONLY/FULL matrix and funnel assertions passed ===');
