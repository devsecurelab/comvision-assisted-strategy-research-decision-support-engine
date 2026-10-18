import { createHash } from 'node:crypto';
import { executeStrategyPipeline, MIN_PAYOUT_PCT } from './pipeline';
import { confidenceByMfci, verdict, wilsonInterval } from './backtestStats';
import { timeframeMs, validateCandleSeries } from './dataIntegrity';
import { classifySessionAndKillZone } from './session';
import { filterFxOpenMarketCandles } from './marketHours';
import type { Candle, NewsEvent, Timeframe } from './types';

/**
 * R8 core: causal walk-forward through the SAME live executeStrategyPipeline.
 * At bar i the pipeline sees only candles <= i and 1h candles closed by bar i's close.
 * Direction comes only from the engine (1h HTF bias); outcome is the next candle (expiry = timeframe).
 */
export const R8_WINDOW = 120;
export const R8_HTF_WINDOW = 80;
export const R8_HTF_MIN_CLOSED_CANDLES = 2 * 2 + 3;
export const R8_GATE_LABELS = [
  'G1 Market Structure',
  'G2 Imbalance',
  'G3 Order Block & Breaker',
  'G4 Premium / Discount',
  'G5 Wick Pushback',
  'G6 Liquidity Sweep',
  'G7 Momentum',
  'G8 Session & Kill Zone',
  'G9 BSL/SSL Target',
];

export function htfWarmupStartDate(startDate: string, days = 7): string {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  if (!Number.isFinite(start)) throw new Error('R8_START_DATE must be a valid YYYY-MM-DD date.');
  return new Date(start - days * 86_400_000).toISOString().slice(0, 10);
}

export interface R8Options { pair: string; timeframe: Timeframe; payoutPct: number; newsEvents: NewsEvent[]; newsSourceOnline: boolean; mode: 'PRICE_ONLY' | 'FULL'; gate4Mode?: 'A' | 'B'; seed?: number }
export interface R8Trade { signal_ts: string; direction: 'CALL' | 'PUT'; mfci: number; entry_open: number; exit_close: number; outcome: 'WIN' | 'LOSS' | 'TIE'; session: string; hour_utc: number }
export interface R8Bar { signal_ts: string; next_up: boolean | null; evaluated: boolean; gates: string[]; gate4_reason: string | null; status_reason: string; htfClosedCandles: number; htfWarmup: boolean }

function lastIndexAtOrBefore(htf: Candle[], cutoffMs: number): number {
  let lo = 0; let hi = htf.length - 1; let ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (Date.parse(htf[mid].timestamp) + 3_600_000 <= cutoffMs) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

export function runCausalBacktest(candles: Candle[], htf: Candle[], opts: R8Options): { trades: R8Trade[]; bars: R8Bar[] } {
  const analysisCandles = filterFxOpenMarketCandles(candles, opts.timeframe);
  const analysisHtf = filterFxOpenMarketCandles(htf, '1h');
  const interval = timeframeMs(opts.timeframe);
  const trades: R8Trade[] = []; const bars: R8Bar[] = [];
  const prevEnv = process.env.ENGINE_FULL_MODE_ENABLED;
  process.env.ENGINE_FULL_MODE_ENABLED = opts.mode === 'FULL' ? 'true' : 'false';
  try {
    for (let i = R8_WINDOW - 1; i < analysisCandles.length - 1; i++) {
      const window = analysisCandles.slice(i - R8_WINDOW + 1, i + 1);
      const signalOpen = Date.parse(analysisCandles[i].timestamp);
      const signalClose = signalOpen + interval;
      const h = lastIndexAtOrBefore(analysisHtf, signalClose);
      const htfWindow = h >= 0 ? analysisHtf.slice(Math.max(0, h - R8_HTF_WINDOW + 1), h + 1) : [];
      const htfClosedCandles = h + 1;
      const htfWarmup = htfClosedCandles < R8_HTF_MIN_CLOSED_CANDLES;
      const next = analysisCandles[i + 1];
      const contiguous = Date.parse(next.timestamp) === signalClose;
      const t = executeStrategyPipeline({
        candles: window, currentCandleIndex: window.length - 1, selectedTimeframe: opts.timeframe,
        htfCandles: htfWindow, newsEvents: opts.newsEvents, newsSourceOnline: opts.newsSourceOnline,
        dataProvenance: 'LIVE_INGESTED', provider: 'TWELVE_DATA', pair: opts.pair, asset: opts.pair, payoutPct: opts.payoutPct, nowMs: signalClose, gate4Mode: opts.gate4Mode,
      });
      const v3 = t.decision_engine_v3;
      bars.push({ signal_ts: analysisCandles[i].timestamp, next_up: contiguous ? (next.close === next.open ? null : next.close > next.open) : null, evaluated: !!v3, gates: v3 ? v3.gates.map((g: any) => g.status) : [], gate4_reason: opts.gate4Mode === 'A' ? 'LEGACY_A' : v3?.stages?.[11]?.calculatedValues?.Gate4_Reason_Code ?? null, status_reason: v3?.statusReason ?? t.metadata.status_reason ?? '', htfClosedCandles, htfWarmup });
      if (!v3 || v3.binarySignal === 'NO_TRADE' || !contiguous) continue;
      if (v3.engineMode !== opts.mode) continue;
      const outcome = next.close === next.open ? 'TIE' : (v3.binarySignal === 'CALL') === (next.close > next.open) ? 'WIN' : 'LOSS';
      trades.push({ signal_ts: analysisCandles[i].timestamp, direction: v3.binarySignal, mfci: v3.mfci.totalMfci, entry_open: next.open, exit_close: next.close, outcome, session: classifySessionAndKillZone(analysisCandles[i].timestamp).session, hour_utc: new Date(signalOpen).getUTCHours() });
    }
  } finally {
    if (prevEnv === undefined) delete process.env.ENGINE_FULL_MODE_ENABLED; else process.env.ENGINE_FULL_MODE_ENABLED = prevEnv;
  }
  return { trades, bars };
}

function seeded(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function summarizeTrades(trades: R8Trade[], payoutPct: number) {
  const wins = trades.filter((t) => t.outcome === 'WIN').length; const losses = trades.filter((t) => t.outcome === 'LOSS').length; const ties = trades.length - wins - losses;
  const n = wins + losses; const p = n ? wins / n : null; const payout = payoutPct / 100;
  let streak = 0; let longestLosing = 0;
  for (const t of trades) { if (t.outcome === 'LOSS') { streak++; longestLosing = Math.max(longestLosing, streak); } else if (t.outcome === 'WIN') streak = 0; }
  const by = (key: (t: R8Trade) => string) => {
    const out: Record<string, { n: number; wins: number; winRate: number | null }> = {};
    for (const t of trades) { if (t.outcome === 'TIE') continue; const k = key(t); out[k] ??= { n: 0, wins: 0, winRate: null }; out[k].n++; if (t.outcome === 'WIN') out[k].wins++; }
    for (const v of Object.values(out)) v.winRate = v.n ? v.wins / v.n : null;
    return out;
  };
  return {
    signals: trades.length, wins, losses, ties, decisive: n, winRate: p, wilson95: wilsonInterval(wins, n), breakeven: 1 / (1 + payout),
    expectancyPerUnit: p === null ? null : p * payout - (1 - p), longestLosingStreak: longestLosing,
    verdict: verdict(wins, n, payoutPct), mfciBands: confidenceByMfci(trades.filter((t) => t.outcome !== 'TIE').map((t) => ({ mfci: t.mfci, favorable: t.outcome === 'WIN' }))),
    bySession: by((t) => t.session), byHourUtc: by((t) => String(t.hour_utc).padStart(2, '0')),
  };
}

export function baselines(bars: R8Bar[], trades: R8Trade[], seed: number) {
  const decisive = bars.filter((b) => b.next_up !== null);
  const rate = (wins: number, n: number) => ({ n, wins, winRate: n ? wins / n : null, wilson95: wilsonInterval(wins, n) });
  const random = seeded(seed);
  let randWins = 0;
  for (const b of decisive) if ((random() < 0.5) === b.next_up) randWins++;
  const signalBars = new Set(trades.map((t) => t.signal_ts));
  const atSignals = decisive.filter((b) => signalBars.has(b.signal_ts));
  const random2 = seeded(seed + 1); let randAtSignalWins = 0;
  for (const b of atSignals) if ((random2() < 0.5) === b.next_up) randAtSignalWins++;
  return {
    alwaysCall: rate(decisive.filter((b) => b.next_up).length, decisive.length),
    alwaysPut: rate(decisive.filter((b) => !b.next_up).length, decisive.length),
    randomDirection: rate(randWins, decisive.length),
    randomDirectionAtSignalTimes: rate(randAtSignalWins, atSignals.length),
  };
}

export function funnel(bars: R8Bar[]) {
  const evaluated = bars.filter((b) => b.evaluated && b.gates.length === 9);
  const marginal = Array(9).fill(0); const cumulative = Array(9).fill(0);
  for (const b of evaluated) {
    let allPrev = true;
    b.gates.forEach((g, i) => { if (g === 'PASS') marginal[i]++; allPrev = allPrev && g === 'PASS'; if (allPrev) cumulative[i]++; });
  }
  const pct = (x: number) => (evaluated.length ? x / evaluated.length : null);
  const reasons: Record<string, number> = {};
  for (const b of bars) { const k = b.status_reason.split(':')[0] || 'UNKNOWN'; reasons[k] = (reasons[k] ?? 0) + 1; }
  return { bars: bars.length, evaluated: evaluated.length, gateLabels: R8_GATE_LABELS, marginal: marginal.map(pct), cumulative: cumulative.map(pct), statusReasons: reasons, htfWarmupBars: bars.filter((b) => b.htfWarmup).length };
}

/** In-sample = first 2/3 chronologically, out-of-sample = last 1/3. OOS is the primary report. */
export function buildR8Report(candles: Candle[], htf: Candle[], opts: R8Options) {
  if (opts.payoutPct < MIN_PAYOUT_PCT) throw new Error(`R8 payout ${opts.payoutPct}% is below ${MIN_PAYOUT_PCT}%.`);
  const analysisCandles = filterFxOpenMarketCandles(candles, opts.timeframe);
  const analysisHtf = filterFxOpenMarketCandles(htf, '1h');
  const quality = validateCandleSeries(analysisCandles, { timeframe: opts.timeframe });
  const { trades, bars } = runCausalBacktest(analysisCandles, analysisHtf, opts);
  const splitTs = analysisCandles[Math.floor(analysisCandles.length * 2 / 3)]?.timestamp ?? analysisCandles.at(-1)?.timestamp ?? '';
  const isTrades = trades.filter((t) => t.signal_ts < splitTs); const oosTrades = trades.filter((t) => t.signal_ts >= splitTs);
  const isBars = bars.filter((b) => b.signal_ts < splitTs); const oosBars = bars.filter((b) => b.signal_ts >= splitTs);
  const seed = opts.seed ?? 20260101;
  return {
    pair: opts.pair, timeframe: opts.timeframe, mode: opts.mode, gate4Mode: opts.gate4Mode ?? 'B', payoutPct: opts.payoutPct,
    candles: analysisCandles.length, rawCandles: candles.length, closedMarketCandlesExcluded: candles.length - analysisCandles.length,
    htfCandles: analysisHtf.length, rawHtfCandles: htf.length, closedMarketHtfCandlesExcluded: htf.length - analysisHtf.length,
    firstCandle: analysisCandles[0]?.timestamp, lastCandle: analysisCandles.at(-1)?.timestamp, splitAt: splitTs,
    dataQuality: { ok: quality.ok, issueCounts: quality.issues.reduce<Record<string, number>>((acc, i) => { acc[i.code] = (acc[i.code] ?? 0) + 1; return acc; }, {}) },
    outOfSample: { ...summarizeTrades(oosTrades, opts.payoutPct), baselines: baselines(oosBars, oosTrades, seed), funnel: funnel(oosBars) },
    inSample: { ...summarizeTrades(isTrades, opts.payoutPct), baselines: baselines(isBars, isTrades, seed), funnel: funnel(isBars) },
    htfWarmupBars: { total: bars.filter((b) => b.htfWarmup).length, inSample: isBars.filter((b) => b.htfWarmup).length, outOfSample: oosBars.filter((b) => b.htfWarmup).length },
    trades,
  };
}

export function candlesToCsv(candles: Candle[]): string {
  const rows = candles.map((c) => [c.timestamp, c.open, c.high, c.low, c.close, c.volume ?? '', c.volumeDelta ?? '', c.cvd ?? '', c.pocPrice ?? ''].join(','));
  return `timestamp,open,high,low,close,volume,volumeDelta,cvd,pocPrice\n${rows.join('\n')}\n`;
}

export function csvToCandles(csv: string): Candle[] {
  const [header, ...lines] = csv.trim().split('\n');
  if (!header.startsWith('timestamp,open,high,low,close')) throw new Error('R8 CSV header mismatch.');
  const num = (v: string) => (v === '' || v === undefined ? undefined : Number(v));
  return lines.filter(Boolean).map((line) => {
    const [timestamp, open, high, low, close, volume, volumeDelta, cvd, pocPrice] = line.split(',');
    const vol = num(volume);
    return { timestamp, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: vol === undefined ? null : vol, volumeDelta: num(volumeDelta), cvd: num(cvd), pocPrice: num(pocPrice) };
  });
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Date chunks small enough that one Twelve Data request (<= 5000 rows) covers each chunk. */
export function dateChunks(startDate: string, endDate: string, timeframe: Timeframe): Array<{ start: string; end: string }> {
  const perDay = 1440 / (timeframeMs(timeframe) / 60_000);
  const days = Math.max(1, Math.floor((5000 * 0.9) / perDay));
  const out: Array<{ start: string; end: string }> = [];
  let cursor = Date.parse(`${startDate}T00:00:00Z`); const end = Date.parse(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const chunkEnd = Math.min(end, cursor + (days - 1) * 86_400_000);
    out.push({ start: new Date(cursor).toISOString().slice(0, 10), end: new Date(chunkEnd).toISOString().slice(0, 10) });
    cursor = chunkEnd + 86_400_000;
  }
  return out;
}

export function mergeCandles(chunks: Candle[][]): Candle[] {
  const map = new Map<string, Candle>();
  for (const chunk of chunks) for (const c of chunk) map.set(new Date(c.timestamp).toISOString(), { ...c, timestamp: new Date(c.timestamp).toISOString() });
  return [...map.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function parseNewsCsv(csv: string): NewsEvent[] {
  const [, ...lines] = csv.trim().split('\n');
  return lines.filter(Boolean).map((line, index) => {
    const [timestamp, impact, currency, ...title] = line.split(',');
    return { id: `R8-NEWS-${index}`, timestamp: new Date(timestamp).toISOString(), impact: impact.trim().toUpperCase(), currency: currency?.trim(), title: title.join(',').trim() } as unknown as NewsEvent;
  });
}
