import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateStrategyV3 } from '../src/engine/strategyV3Engine';
import { feedManager, MarketDataError } from '../src/engine/dataProviders';
import type { Candle, Timeframe } from '../src/engine/types';
import { confidenceByMfci, verdict, wilsonInterval } from '../src/engine/backtestStats';

type Direction = 'BULLISH' | 'BEARISH';
const pairs = (process.env.R8_PAIRS || 'EUR/USD').split(',').map((value) => value.trim()).filter(Boolean);
const timeframes = (process.env.R8_TIMEFRAMES || '5m').split(',').map((value) => value.trim()) as Timeframe[];
const startDate = process.env.R8_START_DATE || '2025-01-01';
const endDate = process.env.R8_END_DATE || '2025-03-31';
const outputPath = process.env.R8_OUTPUT || 'data/r8-backtest-results.json';
const payoutPct = Number(process.env.R8_PAYOUT_PCT || 85);
const csvDir = process.env.R8_CSV_DIR || 'data/r8-historical';

function candleCsv(candles: Candle[]): string {
  const header = 'timestamp,open,high,low,close,volume,volumeDelta,cvd,pocPrice\n';
  const rows = candles.map((c) => [c.timestamp, c.open, c.high, c.low, c.close, c.volume ?? '', c.volumeDelta ?? '', c.cvd ?? '', c.pocPrice ?? ''].join(','));
  return header + rows.join('\n') + '\n';
}

function directionFor(candles: Candle[]): Direction {
  const lookback = candles.slice(-20);
  return lookback[lookback.length - 1].close >= lookback[0].close ? 'BULLISH' : 'BEARISH';
}

function summarize(candles: Candle[], pair: string, timeframe: Timeframe) {
  const decisions = { evaluated: 0, manualAlerts: 0, noAction: 0, safeHold: 0, inconclusive: 0 };
  const outcomes = { favorable: 0, unfavorable: 0, neutral: 0 };
  const gateMarginal = Array(9).fill(0) as number[];
  const gateCumulative = Array(9).fill(0) as number[];
  const alertRecords: Array<Record<string, unknown>> = [];
  for (let index = 24; index < candles.length - 1; index++) {
    const window = candles.slice(0, index + 1);
    const direction = directionFor(window);
    const decision = evaluateStrategyV3({ candles: window, direction, newsEvents: [], newsSourceOnline: true, timestamp: window.at(-1)!.timestamp });
    decisions.evaluated++;
    if (decision.finalAction === 'MANUAL_ALERT') {
      decisions.manualAlerts++;
      const next = candles[index + 1];
      const favorable = direction === 'BULLISH' ? next.close > next.open : next.close < next.open;
      const neutral = next.close === next.open;
      if (neutral) outcomes.neutral++;
      else if (favorable) outcomes.favorable++;
      else outcomes.unfavorable++;
      alertRecords.push({ timestamp: window.at(-1)!.timestamp, nextTimestamp: next.timestamp, direction, entry: decision.entryPrice, nextOpen: next.open, nextClose: next.close, outcome: neutral ? 'NEUTRAL' : favorable ? 'FAVORABLE' : 'UNFAVORABLE', mfci: decision.mfci.totalMfci, gates: decision.gates.map((gate) => gate.status) });
    } else if (decision.finalAction === 'SAFE_HOLD') decisions.safeHold++;
    else decisions.noAction++;
    if (decision.systemDecision === 'BLOCKED' && decision.stages.some((stage) => stage.telemetry.startsWith('UNAVAILABLE'))) decisions.inconclusive++;
    decision.gates.forEach((gate, gateIndex) => {
      if (gate.status === 'PASS') gateMarginal[gateIndex]++;
      if (gate.status === 'PASS' && decision.gates.slice(0, gateIndex).every((previous) => previous.status === 'PASS')) gateCumulative[gateIndex]++;
    });
  }
  const resolved = alertRecords.map((record) => ({ mfci: Number(record.mfci), favorable: record.outcome === 'FAVORABLE' }));
  const interval = wilsonInterval(outcomes.favorable, outcomes.favorable + outcomes.unfavorable);
  return { pair, timeframe, startDate, endDate, candles: candles.length, decisions, outcomes, winRateAmongAlerts: decisions.manualAlerts >= 30 ? outcomes.favorable / decisions.manualAlerts : null, wilson95: interval, breakeven: 1 / (1 + payoutPct / 100), verdict: verdict(outcomes.favorable, outcomes.favorable + outcomes.unfavorable, payoutPct), confidenceByMfci: confidenceByMfci(resolved), gateMarginal, gateCumulative, alerts: alertRecords };
}

async function main() {
  if (!process.env.TWELVE_DATA_API_KEY) {
    console.error('R8_NOT_RUN: TWELVE_DATA_API_KEY is not configured in this environment. No simulated or replay data will be used.');
    process.exitCode = 2;
    return;
  }
  const results = [];
  try {
    const exports: Array<Record<string, string | number>> = [];
    for (const pair of pairs) for (const timeframe of timeframes) {
      console.log(`R8_FETCH ${pair} ${timeframe} ${startDate}..${endDate}`);
      const feed = await feedManager.fetchHistoricalCandles(pair, timeframe, startDate, endDate, 'TWELVE_DATA');
      if (feed.dataProvenance !== 'LIVE_INGESTED') throw new Error('R8 provenance gate failed: historical candles were not LIVE_INGESTED.');
      const csv = candleCsv(feed.candles);
      const safePair = pair.replace(/[^A-Za-z0-9]+/g, '_');
      const csvPath = path.join(csvDir, `${safePair}-${timeframe}-${startDate}-${endDate}.csv`);
      const sha256 = createHash('sha256').update(csv).digest('hex');
      await fs.mkdir(csvDir, { recursive: true });
      await fs.writeFile(csvPath, csv, 'utf8');
      exports.push({ pair, timeframe, csvPath, sha256, candles: feed.candles.length });
      const result = summarize(feed.candles, pair, timeframe);
      results.push({ provider: feed.provider, provenance: feed.dataProvenance, fetchedAt: feed.fetchedAt, creditsUsed: feed.creditsUsed, creditsLeft: feed.creditsLeft, ...result });
      console.log(`R8_RESULT ${pair} ${timeframe} candles=${result.candles} alerts=${result.decisions.manualAlerts} favorable=${result.outcomes.favorable} unfavorable=${result.outcomes.unfavorable} neutral=${result.outcomes.neutral}`);
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), methodology: 'Walk-forward; direction from prior 20 closed candles; next-candle outcome only; no replay fallback.', history: { provider: 'TWELVE_DATA', provenance: 'LIVE_INGESTED', startDate, endDate, csvExports: exports }, results }, null, 2));
    await fs.writeFile(path.join(csvDir, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), provider: 'TWELVE_DATA', startDate, endDate, exports }, null, 2));
    console.log(`R8_OUTPUT ${outputPath}`);
  } catch (error) {
    const message = error instanceof MarketDataError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);
    console.error(`R8_FAILED: ${message}`);
    process.exitCode = 1;
  }
}

void main();
