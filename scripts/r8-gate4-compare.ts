import fs from 'node:fs/promises';
import path from 'node:path';
import { buildR8Report, csvToCandles, htfWarmupStartDate, runCausalBacktest } from '../src/engine/r8Backtest';
import { filterFxOpenMarketCandles } from '../src/engine/marketHours';
import type { Timeframe } from '../src/engine/types';

const csvDir = process.env.R8_CSV_INPUT_DIR || 'data/r8-smoke/historical';
const outFile = process.env.R8_COMPARE_OUTPUT || 'data/r8-gate4-comparison.json';
const pair = process.env.R8_PAIRS || 'EUR/USD';
const start = process.env.R8_START_DATE || '2026-09-01';
const end = process.env.R8_END_DATE || '2026-09-30';
const payoutPct = Number(process.env.R8_PAYOUT_PCT || 85);
const timeframes = (process.env.R8_TIMEFRAMES || '5m,15m,30m').split(',').map((x) => x.trim()) as Timeframe[];
const safe = (x: string) => x.replace(/[^A-Za-z0-9]+/g, '_');

async function load(tf: Timeframe, from = start) {
  const file = `${safe(pair)}-${tf}-${from}-${end}.csv`;
  return csvToCandles(await fs.readFile(path.join(csvDir, file), 'utf8'));
}
function countStatusChanges(a: ReturnType<typeof runCausalBacktest>['bars'], b: ReturnType<typeof runCausalBacktest>['bars']) {
  const bm = new Map(b.map((x) => [x.signal_ts, x]));
  let passToBlocked = 0; let blockedToPass = 0; let changed = 0; const ids: string[] = [];
  for (const x of a) {
    const y = bm.get(x.signal_ts); if (!y || x.gates.length !== 9 || y.gates.length !== 9) continue;
    const oldG4 = x.gates[3]; const newG4 = y.gates[3];
    if (oldG4 !== newG4) { changed++; ids.push(x.signal_ts); if (oldG4 === 'PASS' && newG4 === 'BLOCKED') passToBlocked++; if (oldG4 === 'BLOCKED' && newG4 === 'PASS') blockedToPass++; }
  }
  return { changed, passToBlocked, blockedToPass, ids };
}
async function main() {
  const htf = await load('1h', htfWarmupStartDate(start));
  const comparisons = [];
  for (const timeframe of timeframes) {
    const candles = await load(timeframe);
    const common = { pair, timeframe, payoutPct, newsEvents: [], newsSourceOnline: true, mode: 'PRICE_ONLY' as const };
    const a = buildR8Report(candles, htf, { ...common, gate4Mode: 'A' });
    const b = buildR8Report(candles, htf, { ...common, gate4Mode: 'B' });
    const aRun = runCausalBacktest(filterFxOpenMarketCandles(candles, timeframe), filterFxOpenMarketCandles(htf, '1h'), { ...common, gate4Mode: 'A' });
    const bRun = runCausalBacktest(filterFxOpenMarketCandles(candles, timeframe), filterFxOpenMarketCandles(htf, '1h'), { ...common, gate4Mode: 'B' });
    const changes = countStatusChanges(aRun.bars, bRun.bars);
    comparisons.push({
      timeframe,
      gate4ModeA: { inSample: a.inSample.funnel, outOfSample: a.outOfSample.funnel },
      gate4ModeB: { inSample: b.inSample.funnel, outOfSample: b.outOfSample.funnel },
      g4ChangeBreakdown: changes,
      note: 'A is the legacy 20-candle close-vs-midpoint rule. B is the approved confirmed-swing-range plus all available reference-zone midpoint rule. No edge or profit claim; N must be assessed separately.'
    });
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), pair, start, end, payoutPct, csvDir, comparisons }, null, 2));
  console.log(`R8_GATE4_COMPARE_OUTPUT ${outFile}`);
}
void main().catch((error) => { console.error(`R8_GATE4_COMPARE_FAILED: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
