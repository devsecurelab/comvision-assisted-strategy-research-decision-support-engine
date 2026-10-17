import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candlesToCsv } from '../src/engine/r8Backtest';
import type { Candle, Timeframe } from '../src/engine/types';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r8-gate4-compare-'));
const pair = 'EUR/USD';
const safe = pair.replace(/[^A-Za-z0-9]+/g, '_');
const start = '2026-09-01';
const end = '2026-09-30';

function makeCandles(from: string, to: string, tf: Timeframe): Candle[] {
  const step = tf === '1h' ? 3_600_000 : tf === '30m' ? 1_800_000 : tf === '15m' ? 900_000 : 300_000;
  const out: Candle[] = [];
  const first = Date.parse(`${from}T00:00:00.000Z`);
  const last = Date.parse(`${to}T23:59:00.000Z`);
  let price = 1.085;
  for (let i = 0, ts = first; ts <= last; i++, ts += step) {
    const drift = ((i % 17) - 8) * 0.000001;
    const open = price;
    const close = price + drift + (i % 2 ? 0.000002 : -0.000001);
    const high = Math.max(open, close) + 0.00002;
    const low = Math.min(open, close) - 0.00002;
    out.push({ timestamp: new Date(ts).toISOString(), open, high, low, close, volume: null });
    price = close;
  }
  return out;
}

const htfWarmup = '2026-08-25';
fs.writeFileSync(path.join(dir, `${safe}-1h-${htfWarmup}-${end}.csv`), candlesToCsv(makeCandles(htfWarmup, end, '1h')));
for (const tf of ['5m', '15m', '30m'] as const) {
  fs.writeFileSync(path.join(dir, `${safe}-${tf}-${start}-${end}.csv`), candlesToCsv(makeCandles(start, end, tf)));
}

const output = path.join(dir, 'comparison.json');
const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/r8-gate4-compare.ts'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, R8_CSV_INPUT_DIR: dir, R8_COMPARE_OUTPUT: output, R8_START_DATE: start, R8_END_DATE: end, R8_PAYOUT_PCT: '85', R8_TIMEFRAMES: '5m,15m,30m' },
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.match(result.stdout, /R8_GATE4_COMPARE_OUTPUT/);
const report = JSON.parse(fs.readFileSync(output, 'utf8')) as { comparisons: Array<Record<string, any>> };
assert.equal(report.comparisons.length, 3);
for (const comparison of report.comparisons) {
  for (const mode of ['modeA_legacy', 'modeB_approved']) {
    for (const split of ['IS', 'OOS']) {
      const summary = comparison[mode][split];
      assert.ok(summary.gate4ReasonCounts && typeof summary.gate4ReasonCounts === 'object');
      const reasons = Object.keys(summary.gate4ReasonCounts);
      assert.ok(reasons.every((reason) => ['LEGACY_A', 'RANGE_UNAVAILABLE', 'ZONE_UNAVAILABLE', 'ZONE_ON_WRONG_SIDE', 'MID_AT_EQ', 'PASS', 'UNAVAILABLE'].includes(reason)));
      if (mode === 'modeA_legacy') assert.ok(reasons.every((reason) => reason === 'LEGACY_A' || reason === 'UNAVAILABLE'));
    }
  }
  assert.match(comparison.note, /N < 200 remains inconclusive/);
}
console.log('=== R8 GATE4 COMPARE: synthetic 1h/5m/15m/30m CSVs loaded, A/B IS/OOS reason counts emitted ===');
