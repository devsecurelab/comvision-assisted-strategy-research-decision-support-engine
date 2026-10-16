import fs from 'node:fs/promises';
import path from 'node:path';
import { feedManager, MarketDataError } from '../src/engine/dataProviders';
import { buildR8Report, candlesToCsv, csvToCandles, dateChunks, htfWarmupStartDate, mergeCandles, parseNewsCsv, sha256 } from '../src/engine/r8Backtest';
import type { Candle, NewsEvent, Timeframe } from '../src/engine/types';

/**
 * R8 historical validation. Uses the live executeStrategyPipeline causally, real Twelve Data
 * history fetched in date chunks, and saves CSV + SHA-256 manifest. It never fabricates data:
 * without a key (or a previously exported, hash-verified CSV set) it exits with R8_NOT_RUN.
 */
const pairs = (process.env.R8_PAIRS || 'EUR/USD').split(',').map((v) => v.trim()).filter(Boolean);
const timeframes = (process.env.R8_TIMEFRAMES || '5m,15m,30m').split(',').map((v) => v.trim()) as Timeframe[];
const startDate = process.env.R8_START_DATE || '';
const endDate = process.env.R8_END_DATE || '';
const payoutPct = Number(process.env.R8_PAYOUT_PCT);
const outDir = process.env.R8_OUTPUT_DIR || 'data/r8';
const csvDir = process.env.R8_CSV_DIR || path.join(outDir, 'historical');
const csvInputDir = process.env.R8_CSV_INPUT_DIR;
const requestGapMs = Number(process.env.R8_REQUEST_GAP_MS || 8_000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const safe = (pair: string) => pair.replace(/[^A-Za-z0-9]+/g, '_');

function notRun(reason: string): never {
  console.error(`R8_NOT_RUN: ${reason}`);
  process.exit(2);
}

async function fetchChunked(pair: string, timeframe: Timeframe, rangeStart: string, rangeEnd: string): Promise<Candle[]> {
  const chunks: Candle[][] = [];
  for (const chunk of dateChunks(rangeStart, rangeEnd, timeframe)) {
    console.log(`R8_FETCH ${pair} ${timeframe} ${chunk.start}..${chunk.end}`);
    const feed = await feedManager.fetchHistoricalCandles(pair, timeframe, chunk.start, chunk.end, 'TWELVE_DATA');
    if (feed.dataProvenance !== 'LIVE_INGESTED') throw new Error('R8 provenance gate failed: candles were not LIVE_INGESTED.');
    chunks.push(feed.candles);
    await sleep(requestGapMs);
  }
  return mergeCandles(chunks);
}

async function loadSeries(pair: string, timeframe: Timeframe, manifest: Array<Record<string, unknown>>, rangeStart = startDate, rangeEnd = endDate): Promise<Candle[]> {
  const file = `${safe(pair)}-${timeframe}-${rangeStart}-${rangeEnd}.csv`;
  if (csvInputDir) {
    const inputManifest = JSON.parse(await fs.readFile(path.join(csvInputDir, 'manifest.json'), 'utf8'));
    const entry = inputManifest.exports.find((e: any) => e.file === file);
    if (!entry) throw new Error(`CSV ${file} is not listed in ${csvInputDir}/manifest.json.`);
    const csv = await fs.readFile(path.join(csvInputDir, file), 'utf8');
    if (sha256(csv) !== entry.sha256) throw new Error(`SHA-256 mismatch for ${file}; refusing to use altered history.`);
    manifest.push({ ...entry, reused: true });
    return csvToCandles(csv);
  }
  const candles = await fetchChunked(pair, timeframe, rangeStart, rangeEnd);
  const csv = candlesToCsv(candles);
  await fs.mkdir(csvDir, { recursive: true });
  await fs.writeFile(path.join(csvDir, file), csv, 'utf8');
  manifest.push({ pair, timeframe, startDate: rangeStart, endDate: rangeEnd, file, sha256: sha256(csv), candles: candles.length, provider: 'TWELVE_DATA', provenance: 'LIVE_INGESTED', fetchedAt: new Date().toISOString() });
  return candles;
}

async function main() {
  if (!startDate || !endDate) notRun('R8_START_DATE and R8_END_DATE (YYYY-MM-DD) are required.');
  const htfStartDate = htfWarmupStartDate(startDate, 7);
  if (!Number.isFinite(payoutPct) || payoutPct < 85 || payoutPct > 100) notRun('R8_PAYOUT_PCT must be set to the real payout (85-100).');
  if (!csvInputDir && !process.env.TWELVE_DATA_API_KEY) notRun('TWELVE_DATA_API_KEY is not configured. No simulated or replay data will be used.');
  let newsEvents: NewsEvent[] = [];
  let newsLabel = 'R8_NEWS_CSV';
  if (process.env.R8_NEWS_CSV) newsEvents = parseNewsCsv(await fs.readFile(process.env.R8_NEWS_CSV, 'utf8'));
  else if (process.env.R8_ALLOW_NO_NEWS === '1') newsLabel = 'NEWS_GUARD_HISTORY_UNAVAILABLE (results exclude the news guard; label every report accordingly)';
  else notRun('Historical high-impact news is required (R8_NEWS_CSV=timestamp,impact,currency,title). Set R8_ALLOW_NO_NEWS=1 only to run an explicitly labelled no-news-guard ablation.');

  const manifest: Array<Record<string, unknown>> = [];
  const reports: Array<Record<string, unknown>> = [];
  try {
    for (const pair of pairs) {
      const htf = await loadSeries(pair, '1h', manifest, htfStartDate, endDate);
      for (const timeframe of timeframes) {
        const candles = await loadSeries(pair, timeframe, manifest);
        const fullCapable = candles.every((c) => typeof c.volume === 'number' && (c.volumeDelta !== undefined || c.cvd !== undefined));
        for (const mode of ['PRICE_ONLY', 'FULL'] as const) {
          if (mode === 'FULL' && !fullCapable) { reports.push({ pair, timeframe, mode, status: 'UNAVAILABLE', reason: 'Provider history has no volume/delta; FULL mode cannot be evaluated.' }); continue; }
          const report = buildR8Report(candles, htf, { pair, timeframe, payoutPct, newsEvents, newsSourceOnline: true, mode });
          reports.push({ ...report, news: newsLabel });
          const name = `${safe(pair)}-${timeframe}-${mode}`;
          await fs.mkdir(outDir, { recursive: true });
          await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify({ ...report, news: newsLabel }, null, 2));
          const oos = report.outOfSample;
          console.log(`R8_RESULT ${pair} ${timeframe} ${mode} OOS N=${oos.decisive} wins=${oos.wins} winRate=${oos.winRate?.toFixed(4) ?? 'n/a'} wilson=${oos.wilson95?.map((v) => v.toFixed(4)).join('-') ?? 'n/a'} breakeven=${oos.breakeven.toFixed(4)} verdict=${oos.verdict}`);
        }
      }
    }
    await fs.mkdir(csvDir, { recursive: true });
    if (!csvInputDir) await fs.writeFile(path.join(csvDir, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), provider: 'TWELVE_DATA', provenance: 'LIVE_INGESTED', evaluationRange: { startDate, endDate }, htfWarmupRange: { startDate: htfStartDate, endDate }, exports: manifest }, null, 2));
    await fs.writeFile(path.join(outDir, 'r8-summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), methodology: 'Causal walk-forward via executeStrategyPipeline; closed FX-market bars are excluded from analysis but retained in raw CSV; direction from closed 1h HTF bias inside the engine; next-candle outcome (expiry = timeframe); IS = first 2/3, OOS = last 1/3; verdict only when N >= 200.', evaluationRange: { startDate, endDate }, htfWarmupRange: { startDate: htfStartDate, endDate }, payoutPct, news: newsLabel, manifest, reports: reports.map((r: any) => ({ pair: r.pair, timeframe: r.timeframe, mode: r.mode, status: r.status ?? 'EVALUATED', rawCandles: r.rawCandles, candles: r.candles, closedMarketCandlesExcluded: r.closedMarketCandlesExcluded, rawHtfCandles: r.rawHtfCandles, htfCandles: r.htfCandles, closedMarketHtfCandlesExcluded: r.closedMarketHtfCandlesExcluded, htfWarmupBars: r.htfWarmupBars, oos: r.outOfSample ? { n: r.outOfSample.decisive, wins: r.outOfSample.wins, verdict: r.outOfSample.verdict } : undefined })) }, null, 2));
    console.log(`R8_OUTPUT ${outDir}`);
  } catch (error) {
    const message = error instanceof MarketDataError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);
    console.error(`R8_FAILED: ${message}`);
    process.exitCode = 1;
  }
}

void main();
