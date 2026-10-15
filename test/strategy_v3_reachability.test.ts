import assert from 'node:assert/strict';
import { evaluateStrategyV3, type V3Decision } from '../src/engine/strategyV3Engine';
import type { Candle, Timeframe } from '../src/engine/types';
import { idealFullSetup, idealPriceOnlySetup, unitFor } from './fixtures/v3Reachability';

/**
 * P3 reachability (non-circular). The engine is never told the answer:
 *  (a) ideal setups for every mode x timeframe x scale x direction must alert;
 *  (b) the setup's OWN candles are mutated (all candles, incl. the signal candle) with seeded
 *      noise at 0.5/1/2/3 pip plus large-body shocks, >= 10,000 windows -> alerts must survive;
 *  (c) honest random-walk windows report marginal and cumulative gate funnels; any gate with a
 *      0% marginal pass rate fails the suite unless it is listed in APPROVED_ZERO with a reason.
 */
const started = Date.now();
const timeframes: Timeframe[] = ['5m', '15m', '30m'];
const scales = [{ name: 'EUR/USD', base: 1.085 }, { name: 'USD/JPY', base: 150 }];
const modes = ['PRICE_ONLY', 'FULL'] as const;
const directions = ['BULLISH', 'BEARISH'] as const;
const APPROVED_ZERO: Record<string, string> = {};

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const evaluate = (candles: Candle[], d: 'BULLISH' | 'BEARISH', tf: Timeframe, full: boolean) => evaluateStrategyV3({ candles, htfBias: d, newsEvents: [], newsSourceOnline: true, timeframe: tf, fullModeEnabled: full });

function noisy(source: Candle[], random: () => number, pip: number, magnitude: number, largeBody: boolean): Candle[] {
  return source.map((c) => {
    const j = () => (random() * 2 - 1) * magnitude * pip;
    let open = c.open + j(); let close = c.close + j();
    if (largeBody && random() < 0.08) { const mid = (open + close) / 2; const half = (close - open) * (2 + random()); open = mid - half / 2; close = mid + half / 2; }
    const high = Math.max(c.high + j(), open, close); const low = Math.min(c.low + j(), open, close);
    return { ...c, open, high, low, close };
  });
}

class Funnel {
  marginal = Array(9).fill(0); cumulative = Array(9).fill(0); alerts = 0; n = 0;
  add(r: V3Decision) {
    this.n++; if (r.binarySignal !== 'NO_TRADE') this.alerts++;
    if (r.gates.length !== 9) return;
    let all = true;
    r.gates.forEach((g, i) => { if (g.status === 'PASS') this.marginal[i]++; all = all && g.status === 'PASS'; if (all) this.cumulative[i]++; });
  }
  text() { const f = (xs: number[]) => xs.map((x) => `${((x / Math.max(1, this.n)) * 100).toFixed(1)}%`).join(','); return `marginal=${f(this.marginal)} cumulative=${f(this.cumulative)} alerts=${this.alerts}/${this.n}`; }
}

// (a) ideal matrix
for (const mode of modes) for (const tf of timeframes) for (const { name, base } of scales) for (const d of directions) {
  const candles = mode === 'FULL' ? idealFullSetup(base, tf, d) : idealPriceOnlySetup(base, tf, d);
  const r = evaluate(candles, d, tf, mode === 'FULL');
  assert.equal(r.engineMode, mode);
  assert.equal(r.binarySignal, d === 'BULLISH' ? 'CALL' : 'PUT', `${mode}/${tf}/${name}/${d} ideal must alert`);
  assert.ok((r.mfci.totalMfci as number) >= 0.85);
  assert.ok(r.gates.every((g) => g.status === 'PASS'));
}
console.log('[REACHABILITY] ideal matrix: 24/24 combinations alert (PRICE_ONLY/FULL x 5m/15m/30m x EUR/JPY scale x BULLISH/BEARISH)');

// (b) mutation of the setup's own candles
let mutationWindows = 0; let mutationAlerts = 0;
const magnitudes = [0.5, 1, 2, 3];
for (const mode of modes) for (const tf of timeframes) for (const { name, base } of scales) for (const d of directions) {
  const ideal = mode === 'FULL' ? idealFullSetup(base, tf, d) : idealPriceOnlySetup(base, tf, d);
  const pip = unitFor(base);
  const parts: string[] = [];
  for (const mag of magnitudes) {
    const random = rng(0xC0FFEE ^ (mag * 1000) ^ (timeframes.indexOf(tf) << 8) ^ (base > 20 ? 1 << 12 : 0) ^ (d === 'BEARISH' ? 1 << 13 : 0) ^ (mode === 'FULL' ? 1 << 14 : 0));
    const funnel = new Funnel();
    for (let i = 0; i < 110; i++) funnel.add(evaluate(noisy(ideal, random, pip, mag, i % 2 === 1), d, tf, mode === 'FULL'));
    mutationWindows += funnel.n; mutationAlerts += funnel.alerts;
    parts.push(`${mag}pip ${funnel.alerts}/${funnel.n}`);
    if (mag <= 1) assert.ok(funnel.alerts > 0, `${mode}/${tf}/${name}/${d} must survive ${mag}-pip noise`);
  }
  console.log(`[ROBUSTNESS] ${mode} ${tf} ${name} ${d}: ${parts.join(' | ')}`);
}
assert.ok(mutationWindows >= 10_000, `mutation windows ${mutationWindows}`);
assert.ok(mutationAlerts > 0);
console.log(`[ROBUSTNESS] total ${mutationAlerts}/${mutationWindows} alerts across seeded noise 0.5/1/2/3 pip with large-body shocks`);

// (c) honest random-walk windows (both modes, both directions)
function randomWindow(random: () => number, base: number, tf: Timeframe, full: boolean): Candle[] {
  const pip = unitFor(base); const step = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60 }[tf] * 60_000;
  const end = Date.parse('2026-01-14T08:30:00.000Z') + Math.floor(random() * 10) * 3_600_000 / 2;
  const endAligned = Math.floor(end / step) * step;
  const vol = (2 + random() * 12) * pip; let price = base; const out: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const drift = (random() - 0.5) * vol * 2.2 + (random() < 0.06 ? (random() - 0.5) * vol * 8 : 0);
    const open = price; const close = price + drift;
    const high = Math.max(open, close) + random() * vol; const low = Math.min(open, close) - random() * vol;
    out.push({ timestamp: new Date(endAligned - (59 - i) * step).toISOString(), open, high, low, close, volume: full ? Math.round(50 + random() * 200) : null, ...(full ? { volumeDelta: Math.round((random() - 0.5) * 200), cvd: Math.round((random() - 0.5) * 1000), pocPrice: low + (high - low) * random() } : {}) });
    price = close;
  }
  return out;
}
for (const mode of modes) for (const d of directions) {
  const funnel = new Funnel(); const random = rng(0xBADA55 ^ (mode === 'FULL' ? 1 : 0) ^ (d === 'BEARISH' ? 2 : 0));
  for (let i = 0; i < 6000; i++) {
    const tf = timeframes[i % 3]; const base = scales[i % 2].base;
    funnel.add(evaluate(randomWindow(random, base, tf, mode === 'FULL'), d, tf, mode === 'FULL'));
  }
  console.log(`[FUNNEL] random ${mode} ${d}: ${funnel.text()}`);
  funnel.marginal.forEach((m, i) => { if (m === 0) assert.ok(APPROVED_ZERO[`G${i + 1}`], `${mode}/${d} Gate ${i + 1} is structurally zero-pass on random windows`); });
}

const seconds = (Date.now() - started) / 1000;
console.log(`[REACHABILITY] runtime ${seconds.toFixed(1)}s`);
assert.ok(seconds <= 180, 'reachability suite must finish within ~180 s');
console.log('=== V3 REACHABILITY SUITE (P3): ideal matrix, own-candle mutation >= 10k windows, honest random-window funnels passed ===');
