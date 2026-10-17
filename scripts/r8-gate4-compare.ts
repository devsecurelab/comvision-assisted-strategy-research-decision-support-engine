import fs from 'node:fs/promises';
import path from 'node:path';
import { buildR8Report, csvToCandles, htfWarmupStartDate, runCausalBacktest, type R8Bar } from '../src/engine/r8Backtest';
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
function summary(bars: R8Bar[]) {
  const evaluated = bars.filter((b) => b.evaluated && b.gates.length === 9);
  const g123 = evaluated.filter((b) => b.gates[0] === 'PASS' && b.gates[1] === 'PASS' && b.gates[2] === 'PASS');
  const g4Pass = g123.filter((b) => b.gates[3] === 'PASS').length;
  return { evaluatedBars: evaluated.length, g1G3PassBars: g123.length, g4PassAmongG1G3: g4Pass, g4PassRateAmongG1G3: g123.length ? g4Pass / g123.length : null };
}
function splitBars(bars: R8Bar[], candles: ReturnType<typeof filterFxOpenMarketCandles>) {
  const splitTs = candles[Math.floor(candles.length * 2 / 3)]?.timestamp ?? candles.at(-1)?.timestamp ?? '';
  return { IS: bars.filter((b) => b.signal_ts < splitTs), OOS: bars.filter((b) => b.signal_ts >= splitTs) };
}
function transitionBreakdown(a: R8Bar[], b: R8Bar[]) {
  const bm = new Map(b.map((x) => [x.signal_ts, x]));
  let eligible = 0; let passToBlocked = 0; let blockedToPass = 0; const ids: string[] = [];
  for (const oldBar of a) {
    const next = bm.get(oldBar.signal_ts);
    if (!next || oldBar.gates.length !== 9 || next.gates.length !== 9) continue;
    const g123 = oldBar.gates.slice(0, 3).every((x) => x === 'PASS') && next.gates.slice(0, 3).every((x) => x === 'PASS');
    if (!g123) continue;
    eligible++;
    if (oldBar.gates[3] === 'PASS' && next.gates[3] === 'BLOCKED') { passToBlocked++; ids.push(`${oldBar.signal_ts}:PASS->BLOCKED`); }
    if (oldBar.gates[3] === 'BLOCKED' && next.gates[3] === 'PASS') { blockedToPass++; ids.push(`${oldBar.signal_ts}:BLOCKED->PASS`); }
  }
  return { eligibleG1G3PassBars: eligible, passToBlocked, blockedToPass, changed: passToBlocked + blockedToPass, ids };
}
async function main() {
  const htf = await load('1h', htfWarmupStartDate(start));
  const comparisons = [];
  for (const timeframe of timeframes) {
    const candles = await load(timeframe);
    const openCandles = filterFxOpenMarketCandles(candles, timeframe);
    const openHtf = filterFxOpenMarketCandles(htf, '1h');
    const common = { pair, timeframe, payoutPct, newsEvents: [], newsSourceOnline: true, mode: 'PRICE_ONLY' as const };
    const a = buildR8Report(candles, htf, { ...common, gate4Mode: 'A' });
    const b = buildR8Report(candles, htf, { ...common, gate4Mode: 'B' });
    const aBars = splitBars(runCausalBacktest(openCandles, openHtf, { ...common, gate4Mode: 'A' }).bars, openCandles);
    const bBars = splitBars(runCausalBacktest(openCandles, openHtf, { ...common, gate4Mode: 'B' }).bars, openCandles);
    comparisons.push({
      timeframe,
      modeA_legacy: { IS: summary(aBars.IS), OOS: summary(aBars.OOS) },
      modeB_approved: { IS: summary(bBars.IS), OOS: summary(bBars.OOS) },
      transitionsAmongG1G3Pass: { IS: transitionBreakdown(aBars.IS, bBars.IS), OOS: transitionBreakdown(aBars.OOS, bBars.OOS) },
      reportOosN: { A: a.outOfSample.decisive, B: b.outOfSample.decisive },
      note: 'A is the legacy 20-candle close-vs-midpoint rule. B is the approved confirmed-swing-range plus all valid Gate 3 OB/Breaker midpoints, with Gate 2 fallback. No edge/profit claim; N < 200 remains inconclusive.'
    });
  }
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), pair, start, end, payoutPct, csvDir, comparisons }, null, 2));
  console.log(`R8_GATE4_COMPARE_OUTPUT ${outFile}`);
}
void main().catch((error) => { console.error(`R8_GATE4_COMPARE_FAILED: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
