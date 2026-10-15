import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { executeStrategyPipeline } from '../src/engine/pipeline';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { measureClockDrift, validateCandleSeries } from '../src/engine/dataIntegrity';
import type { Candle } from '../src/engine/types';
import { htfCandlesFor, idealPriceOnlySetup, SIGNAL_TS } from './fixtures/v3Reachability';

const tf = '15m' as const;
const close = Date.parse(SIGNAL_TS) + 15 * 60_000;
const htf = htfCandlesFor('BULLISH', new Date(close).toISOString());
const pipe = (candles: Candle[], idx = candles.length - 1, nowMs = close + 3_000) => executeStrategyPipeline({ decisionEngineVersion: 'V3', candles, currentCandleIndex: idx, selectedTimeframe: tf, htfCandles: htf, newsEvents: [], newsSourceOnline: true, dataProvenance: 'LIVE_INGESTED', provider: 'TWELVE_DATA', pair: 'EUR/USD', payoutPct: 90, nowMs });
const strip = (t: ReturnType<typeof pipe>) => JSON.stringify({ ...t, metadata: { ...t.metadata, timestamp_utc: undefined }, provider_provenance: undefined });

// same_candle_determinism: identical closed input -> byte-identical decision (excluding wall-clock fields).
const ideal = idealPriceOnlySetup(1.085, tf, 'BULLISH');
assert.equal(strip(pipe(ideal)), strip(pipe(ideal.map((c) => ({ ...c })))));
console.log('[same_candle_determinism] PASS');

// decision_candle_always_closed: evaluating before the signal candle closes is DATA_QUALITY_FAIL (FORMING_CANDLE).
const forming = pipe(ideal, ideal.length - 1, close - 1);
assert.match(forming.metadata.status_reason || '', /^DATA_QUALITY_FAIL: FORMING_CANDLE/);
assert.equal(forming.metadata.status, 'DATA_QUALITY_FAIL');
assert.equal(pipe(ideal, ideal.length - 1, close).decision_engine_v3?.binarySignal, 'CALL');
console.log('[decision_candle_always_closed] PASS');

// zero_lookahead: appending future candles never changes the decision at index i.
const future: Candle[] = Array.from({ length: 25 }, (_, k) => ({ timestamp: new Date(close + k * 900_000).toISOString(), open: 1.09, high: 1.2 + k * 0.01, low: 1.0, close: 1.1, volume: null }));
const extended = [...ideal, ...future];
for (let i = 31; i < ideal.length; i++) {
  const a = pipe(ideal.slice(0, i + 1), i, Date.parse(ideal[i].timestamp) + 900_000);
  const b = pipe(extended, i, Date.parse(ideal[i].timestamp) + 900_000);
  assert.equal(strip(a), strip(b), `lookahead detected at ${i}`);
}
console.log('[zero_lookahead] PASS');

// scale_invariance: EUR/USD (1.085) vs USD/JPY-like (150) geometry gives the same verdict for both directions and all timeframes.
for (const t of ['5m', '15m', '30m'] as const) for (const d of ['BULLISH', 'BEARISH'] as const) {
  const a = evaluateStrategyV3({ candles: idealPriceOnlySetup(1.085, t, d), htfBias: d, newsEvents: [], newsSourceOnline: true, timeframe: t });
  const b = evaluateStrategyV3({ candles: idealPriceOnlySetup(150, t, d), htfBias: d, newsEvents: [], newsSourceOnline: true, timeframe: t });
  assert.equal(a.binarySignal, b.binarySignal); assert.equal(a.gates.map((g) => g.status).join(), b.gates.map((g) => g.status).join());
}
console.log('[scale_invariance] PASS');

// price_only_no_zero_fill: missing volume stays null; nothing is zero-filled into order-flow fields.
const po = pipe(ideal);
assert.equal(po.metadata.engine_mode, 'PRICE_ONLY'); assert.equal(po.metadata.mfci_orderflow, null); assert.equal(po.metadata.poc_label, 'UNAVAILABLE');
assert.equal(po.decision_engine_v3?.stages[8].calculatedValues.CVD_Status, 'CVD_UNAVAILABLE');
assert.ok(ideal.every((c) => c.volume === null));
console.log('[price_only_no_zero_fill] PASS');

// P2 data integrity units.
assert.equal(validateCandleSeries(ideal, { timeframe: tf }).ok, true);
const dup = [...ideal]; dup.splice(10, 0, { ...ideal[10] });
assert.ok(validateCandleSeries(dup, { timeframe: tf }).issues.some((i) => i.code === 'DUPLICATE_TIMESTAMP'));
const misaligned = ideal.map((c, i) => (i === 5 ? { ...c, timestamp: new Date(Date.parse(c.timestamp) + 60_000).toISOString() } : c));
assert.ok(validateCandleSeries(misaligned, { timeframe: tf }).issues.some((i) => i.code === 'MISALIGNED_TIMESTAMP'));
const weekend: Candle[] = [
  { timestamp: '2026-01-09T21:45:00.000Z', open: 1, high: 1.1, low: 0.9, close: 1, volume: null },
  { timestamp: '2026-01-11T22:00:00.000Z', open: 1, high: 1.1, low: 0.9, close: 1, volume: null },
];
assert.equal(validateCandleSeries(weekend, { timeframe: tf }).ok, true, 'weekend closure is not a gap');
assert.equal(measureClockDrift(new Date(1_000_000).toUTCString(), 1_000_000 + 4_000, 1_000_000 + 4_100).status, 'CLOCK_DRIFT');
assert.equal(measureClockDrift(new Date(1_000_000).toUTCString(), 1_000_300, 1_000_400).status, 'CLOCK_OK');
assert.equal(measureClockDrift(null, 0, 1).status, 'CLOCK_UNAVAILABLE');
console.log('[data_integrity] PASS');

// Forbidden-pattern grep over production code (P0 / N4 / W1b).
const root = process.cwd();
const walk = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
const production = [...walk('src'), 'server.ts', 'scripts/r8-backtest.ts'];
const rules: Array<[RegExp, string]> = [
  [/from ['"][^'"]*test\/fixtures/, 'production must never import test fixtures'],
  [/\?\?\s*'REPLAY'|\|\|\s*'REPLAY'|=\s*'REPLAY'/, 'REPLAY provenance default (use NOT_LIVE)'],
  [/Liquidity_Sweep_Preceded:\s*'true'/, 'hard-coded sweep flag'],
  [/:\s*1\.5;|\?\s*[^:]+:\s*1\.5\b\s*;/, 'z-score fallback 1.5'],
  [/pocPrice\s*\?\?\s*\(/, 'POC fallback from typical price'],
  [/volume\s*\?\?\s*0\b/, 'zero-filled volume'],
  [/Asia\/Tokyo/, 'Tokyo kill zone removed'],
  [/directionFor\(|close\s*>=\s*lookback\[0\]\.close/, 'external drift-based direction'],
  [/close\s*[+-]\s*\.001\b|close\s*[+-]\s*0\.001\b/, 'fabricated IFVG offset'],
  [/simulate-fallback|LiveVisionStream|screen-capture|cv_confidence/, 'removed Vision/simulation surface'],
];
for (const file of production) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [re, why] of rules) assert.doesNotMatch(src, re, `${file}: ${why}`);
}
for (const file of ['src/engine/strategyV3Engine.ts', 'src/engine/types.ts', 'src/server/notificationService.ts', 'src/engine/scanScheduler.ts']) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  if (file !== 'src/engine/types.ts') assert.doesNotMatch(src, /stopLoss|takeProfit|riskRewardRatio/, `${file}: SL/TP removed from V3 output`);
}
assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/engine/types.ts'), 'utf8').split('export interface V3DecisionTelemetry')[1].split('}')[0], /stopLoss|takeProfit/);
assert.equal((fs.readFileSync(path.join(root, 'src/engine/pipeline.ts'), 'utf8').match(/function classifySessionAndKillZone/g) || []).length, 0, 'single session implementation');
assert.match(fs.readFileSync(path.join(root, 'src/engine/strategyV3Engine.ts'), 'utf8'), /MFCI_THRESHOLD = 0\.85;/);
console.log('[forbidden_patterns] PASS');
console.log('=== V3 SAFETY INVARIANTS: determinism, closed candle, zero lookahead, scale, no zero-fill, data integrity, grep passed ===');
