import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Append-only signal ledger (JSON Lines) with a SHA-256 hash chain.
 * Every line commits to the previous line's hash, so editing, deleting or
 * reordering any historical record is detected by verify().
 */
export type LedgerEventType = 'SIGNAL' | 'RESULT' | 'EDGE_LOST' | 'EDGE_RESUMED';
export type SignalOutcome = 'WIN' | 'LOSS' | 'TIE' | 'SKIPPED' | 'UNRESOLVED';

export interface LedgerEntry<T = Record<string, unknown>> { seq: number; type: LedgerEventType; ts: string; payload: T; prevHash: string; hash: string }

export interface SignalPayload {
  signal_id: string;
  pair: string;
  timeframe: '5m' | '15m' | '30m';
  direction: 'CALL' | 'PUT';
  signal_candle_open_ts: string;
  entry_ts: string;
  expiry_ts: string;
  valid_until: string;
  payout_pct: number;
  breakeven: number;
  mfci_total: number;
  mfci_band: string;
  engine_mode: 'FULL' | 'PRICE_ONLY';
  provider: string;
  ltf_provider?: string;
  htf_provider?: string;
  setup_id: string;
  experiment_id: string;
  session?: string;
  kill_zone?: string;
}

export interface ResultPayload {
  signal_id: string;
  outcome: SignalOutcome;
  source: 'AUTO_PROVIDER' | 'TELEGRAM_MANUAL';
  entry_price?: number;
  exit_price?: number;
  provider?: string;
  note?: string;
}

export interface SignalView extends SignalPayload { outcome?: SignalOutcome; result_source?: ResultPayload['source']; resolved_at?: string; entry_price?: number; exit_price?: number }

export const GENESIS_HASH = '0'.repeat(64);

export function signalIdFor(pair: string, timeframe: string, signalCandleOpenTs: string): string {
  return `SIG-${createHash('sha256').update(`${pair}|${timeframe}|${signalCandleOpenTs}`).digest('hex').slice(0, 12).toUpperCase()}`;
}

function hashEntry(entry: Omit<LedgerEntry, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify({ seq: entry.seq, type: entry.type, ts: entry.ts, payload: entry.payload, prevHash: entry.prevHash })).digest('hex');
}

export class SignalLedger {
  constructor(private readonly filePath: string = process.env.SIGNAL_LEDGER_PATH || path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'signal-ledger.jsonl')) {}

  public get path(): string { return this.filePath; }

  public readAll(): LedgerEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as LedgerEntry);
  }

  public verify(): { ok: boolean; entries: number; brokenAt?: number; reason?: string } {
    let entries: LedgerEntry[];
    try { entries = this.readAll(); } catch { return { ok: false, entries: 0, reason: 'LEDGER_UNPARSEABLE' }; }
    let prev = GENESIS_HASH;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.seq !== i) return { ok: false, entries: entries.length, brokenAt: i, reason: 'SEQUENCE_BROKEN' };
      if (e.prevHash !== prev) return { ok: false, entries: entries.length, brokenAt: i, reason: 'PREV_HASH_MISMATCH' };
      if (hashEntry(e) !== e.hash) return { ok: false, entries: entries.length, brokenAt: i, reason: 'HASH_MISMATCH' };
      prev = e.hash;
    }
    return { ok: true, entries: entries.length };
  }

  public append<T extends object>(type: LedgerEventType, payload: T, ts = new Date().toISOString()): LedgerEntry<T> {
    const check = this.verify();
    if (!check.ok) throw new Error(`LEDGER_TAMPERED: ${check.reason} at entry ${check.brokenAt ?? 'unknown'}; refusing to append.`);
    const entries = this.readAll();
    const prevHash = entries.at(-1)?.hash ?? GENESIS_HASH;
    const base = { seq: entries.length, type, ts, payload: payload as Record<string, unknown>, prevHash };
    const entry = { ...base, hash: hashEntry(base) };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const fd = fs.openSync(this.filePath, 'a');
    try { fs.writeSync(fd, `${JSON.stringify(entry)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return entry as unknown as LedgerEntry<T>;
  }

  /** Records a CALL/PUT once per pair/timeframe/signal candle. Returns false if it already exists. */
  public recordSignal(signal: SignalPayload, ts?: string): boolean {
    if (this.signals().some((s) => s.signal_id === signal.signal_id)) return false;
    this.append('SIGNAL', signal, ts);
    return true;
  }

  public recordResult(result: ResultPayload, ts?: string): LedgerEntry<ResultPayload> {
    if (!this.signals().some((s) => s.signal_id === result.signal_id)) throw new Error(`UNKNOWN_SIGNAL: ${result.signal_id}`);
    return this.append('RESULT', result, ts);
  }

  public signals(): SignalView[] {
    const map = new Map<string, SignalView>();
    for (const e of this.readAll()) {
      if (e.type === 'SIGNAL') map.set((e.payload as unknown as SignalPayload).signal_id, { ...(e.payload as unknown as SignalPayload) });
      if (e.type === 'RESULT') {
        const r = e.payload as unknown as ResultPayload; const s = map.get(r.signal_id);
        if (s) Object.assign(s, { outcome: r.outcome, result_source: r.source, resolved_at: e.ts, entry_price: r.entry_price, exit_price: r.exit_price });
      }
    }
    return [...map.values()];
  }

  public get(signalId: string): SignalView | undefined {
    return this.signals().find((s) => s.signal_id.toUpperCase() === signalId.toUpperCase());
  }

  public pending(nowMs: number): SignalView[] {
    return this.signals().filter((s) => (!s.outcome || s.outcome === 'UNRESOLVED') && Date.parse(s.expiry_ts) <= nowMs);
  }

  public edgeEvents(): LedgerEntry[] {
    return this.readAll().filter((e) => e.type === 'EDGE_LOST' || e.type === 'EDGE_RESUMED');
  }
}
