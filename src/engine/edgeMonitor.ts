import { wilsonInterval } from './backtestStats';
import type { SignalLedger, SignalView } from './signalLedger';
import { classifySessionAndKillZone } from './session';

export const EDGE_WINDOW = 50;

export interface EdgeState { state: 'EDGE_OK' | 'EDGE_LOST' | 'INSUFFICIENT_SAMPLE'; n: number; wins: number; wilsonLow: number | null; wilsonHigh: number | null; breakeven: number | null; since?: string; reason: string }

export const breakevenFor = (payoutPct: number) => 1 / (1 + payoutPct / 100);

function decisive(signals: SignalView[]) {
  return signals.filter((s) => s.outcome === 'WIN' || s.outcome === 'LOSS').sort((a, b) => Date.parse(a.resolved_at ?? a.expiry_ts) - Date.parse(b.resolved_at ?? b.expiry_ts));
}

/** EDGE_LOST when the Wilson 95% upper bound of the last 50 decisive results is below the mean breakeven. */
export function evaluateEdge(signals: SignalView[], sinceIso?: string): EdgeState {
  const after = sinceIso ? signals.filter((s) => Date.parse(s.resolved_at ?? '') > Date.parse(sinceIso)) : signals;
  const recent = decisive(after).slice(-EDGE_WINDOW);
  const n = recent.length; const wins = recent.filter((s) => s.outcome === 'WIN').length;
  if (n < EDGE_WINDOW) return { state: 'INSUFFICIENT_SAMPLE', n, wins, wilsonLow: null, wilsonHigh: null, breakeven: null, reason: `Need ${EDGE_WINDOW} decisive results; have ${n}.` };
  const [low, high] = wilsonInterval(wins, n)!;
  const breakeven = recent.reduce((sum, s) => sum + breakevenFor(s.payout_pct), 0) / n;
  const lost = high < breakeven;
  return { state: lost ? 'EDGE_LOST' : 'EDGE_OK', n, wins, wilsonLow: low, wilsonHigh: high, breakeven, reason: lost ? `Wilson upper ${(high * 100).toFixed(1)}% < breakeven ${(breakeven * 100).toFixed(1)}% over last ${n}.` : 'Edge not rejected.' };
}

/** Persisted edge state lives in the hash-chained ledger, so it survives restarts and cannot be silently edited. */
export class EdgeMonitor {
  constructor(private readonly ledger: SignalLedger) {}

  public current(): { paused: boolean; lostAt?: string; resumedAt?: string; reason?: string } {
    const last = this.ledger.edgeEvents().at(-1);
    if (!last) return { paused: false };
    if (last.type === 'EDGE_LOST') return { paused: true, lostAt: last.ts, reason: String((last.payload as any).reason) };
    return { paused: false, resumedAt: last.ts, reason: String((last.payload as any).reason) };
  }

  /** Re-evaluates after each resolved result; counts only results after the latest /resume. */
  public check(): EdgeState & { transitioned: boolean } {
    const status = this.current();
    const edge = evaluateEdge(this.ledger.signals(), status.resumedAt);
    if (!status.paused && edge.state === 'EDGE_LOST') {
      this.ledger.append('EDGE_LOST', { reason: edge.reason, n: edge.n, wins: edge.wins, wilson_high: edge.wilsonHigh, breakeven: edge.breakeven });
      return { ...edge, transitioned: true };
    }
    return { ...edge, state: status.paused ? 'EDGE_LOST' : edge.state, transitioned: false };
  }

  public resume(reason: string): { ok: boolean; message: string } {
    const clean = reason.trim();
    if (!this.current().paused) return { ok: false, message: 'EDGE_NOT_LOST: alerts are not paused.' };
    if (clean.length < 5) return { ok: false, message: 'ERROR RESUME_REASON_REQUIRED: use /resume <written reason>.' };
    this.ledger.append('EDGE_RESUMED', { reason: clean });
    return { ok: true, message: `Alerts resumed. Reason recorded in ledger: ${clean}` };
  }
}

type Bucket = { n: number; wins: number; losses: number; ties: number };
const bucket = (): Bucket => ({ n: 0, wins: 0, losses: 0, ties: 0 });

/** Daily/weekly research report built only from ledger outcomes. */
export function buildLedgerReport(signals: SignalView[], sinceMs: number, untilMs = Date.now()) {
  const rows = signals.filter((s) => { const t = Date.parse(s.signal_candle_open_ts); return t >= sinceMs && t < untilMs; });
  const groups: Record<string, Record<string, Bucket>> = { timeframe: {}, pair: {}, session: {}, mfci_band: {} };
  const total = bucket();
  for (const s of rows) {
    const keys = { timeframe: s.timeframe, pair: s.pair, session: s.session ?? classifySessionAndKillZone(s.signal_candle_open_ts).session, mfci_band: s.mfci_total >= .95 ? '0.95-1.00' : s.mfci_total >= .90 ? '0.90-0.95' : '0.85-0.90' };
    for (const target of [total, ...Object.entries(keys).map(([g, k]) => (groups[g][k] ??= bucket()))]) {
      target.n++;
      if (s.outcome === 'WIN') target.wins++; else if (s.outcome === 'LOSS') target.losses++; else if (s.outcome === 'TIE') target.ties++;
    }
  }
  const decisiveN = total.wins + total.losses;
  const interval = wilsonInterval(total.wins, decisiveN);
  const breakeven = rows.length ? rows.reduce((sum, s) => sum + breakevenFor(s.payout_pct), 0) / rows.length : null;
  return { signals: total.n, ...total, winRate: decisiveN ? total.wins / decisiveN : null, wilson: interval, breakeven, position: !interval || breakeven === null ? 'UNAVAILABLE' : interval[0] > breakeven ? 'ABOVE_BREAKEVEN' : interval[1] < breakeven ? 'BELOW_BREAKEVEN' : 'INCONCLUSIVE', groups };
}

export function formatLedgerReport(title: string, report: ReturnType<typeof buildLedgerReport>): string {
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'UNAVAILABLE' : `${(v * 100).toFixed(1)}%`);
  const lines = [
    `COMVISION ${title} — research alert only`,
    `Signals: ${report.signals} | WIN ${report.wins} | LOSS ${report.losses} | TIE ${report.ties}`,
    `Win rate: ${pct(report.winRate)} | Wilson 95%: ${report.wilson ? `${pct(report.wilson[0])}–${pct(report.wilson[1])}` : 'UNAVAILABLE'}`,
    `Breakeven: ${pct(report.breakeven)} | Position: ${report.position}`,
  ];
  for (const [group, entries] of Object.entries(report.groups)) {
    const parts = Object.entries(entries).map(([k, b]) => `${k} ${b.wins}/${b.wins + b.losses}`);
    if (parts.length) lines.push(`${group}: ${parts.join(', ')}`);
  }
  return lines.join('\n');
}
