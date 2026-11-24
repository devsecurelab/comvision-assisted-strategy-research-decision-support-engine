import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { slippagePips } from './price';
import { CONFIG_HASH, CONFIG_HASH_EPOCH, ENGINE_FINGERPRINT, PREVIOUS_V3_CONFIG_HASH, PREVIOUS_V3_CONFIG_HASH_EPOCH, PREVIOUS_V3_ENGINE_FINGERPRINT, SESSION_CONFIG, SESSION_CONFIG_HASH, STRATEGY_MANIFEST } from './manifest';

/**
 * Append-only signal ledger (JSON Lines) with a SHA-256 hash chain.
 * Every line commits to the previous line's hash, so editing, deleting or
 * reordering any historical record is detected by verify().
 */
export type LedgerEventType = 'SIGNAL' | 'SCAN' | 'RESULT' | 'TRADE_TAKEN' | 'CANDLE_REVISION' | 'SIGNAL_SENT' | 'EDGE_LOST' | 'EDGE_RESUMED' | 'SCAN_GAP';
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
  /** Added to newly committed payloads; absent only on historical records. */
  engine_fingerprint?: string;
  experiment_id: string;
  config_hash?: string;
  config_hash_epoch?: string;
  session_config_hash?: string;
  session?: string;
  kill_zone?: string;
  signal_price?: number;
  quote_price?: number;
  quote_ts?: string;
  price_tolerance?: number;
}

export interface ScanPayload {
  scan_id: string;
  pair: string;
  timeframe: '5m' | '15m' | '30m';
  trigger: 'MANUAL' | 'AUTO';
  status: 'CALL' | 'PUT' | 'NO_TRADE';
  reason: string;
  signal_id?: string;
  scan_started_at: string;
  candle_available_at: string | null;
  delivered_at: string;
  engine_fingerprint?: string;
}

export interface ResultPayload {
  signal_id: string;
  outcome: SignalOutcome;
  source: 'AUTO_PROVIDER' | 'TELEGRAM_MANUAL';
  entry_price?: number;
  exit_price?: number;
  provider?: string;
  broker_close_price?: number;
  broker_entry_price?: number;
  slippage_pips?: number;
  note?: string;
  engine_fingerprint?: string;
}

export interface SignalView extends SignalPayload {
  outcome?: SignalOutcome;
  provider_outcome?: SignalOutcome;
  broker_outcome?: SignalOutcome;
  result_source?: ResultPayload['source'];
  resolved_at?: string;
  entry_price?: number;
  exit_price?: number;
  broker_entry_price?: number;
  broker_close_price?: number;
  slippage_pips?: number;
  candle_revision_pips?: number;
  telegram_sent_at?: string;
}

export interface TradeTakenPayload { signal_id: string; broker_entry_price: number }
export interface CandleRevisionPayload { signal_id: string; candle_revision_pips: number }
export interface SignalSentPayload { signal_id: string; telegram_sent_at: string }
export interface LedgerStats { signals: number; resolved: number; wins: number; losses: number; ties: number; winRatePercentage: number | null }

export const GENESIS_HASH = '0'.repeat(64);

function identityMetadata(payload: Record<string, unknown>) {
  const timeframe = payload.timeframe;
  const tf = timeframe === '5m' || timeframe === '15m' || timeframe === '30m' ? timeframe : undefined;
  const entryWindowSeconds = tf ? Number(process.env[`ENTRY_WINDOW_${tf.toUpperCase()}_SECONDS`] || ({ '5m': 45, '15m': 60, '30m': 90 } as const)[tf]) : null;
  const expiryMinutes = tf ? SESSION_CONFIG.expiryMinutes[tf] : null;
  return {
    config_hash: CONFIG_HASH,
    config_hash_epoch: CONFIG_HASH_EPOCH,
    session_config_hash: SESSION_CONFIG_HASH,
    engine_fingerprint: ENGINE_FINGERPRINT,
    rule_variant: SESSION_CONFIG.entryRule,
    operational_parameters: {
      timeframe: tf ?? null,
      entry_window_seconds: entryWindowSeconds,
      expiry_minutes: expiryMinutes,
      start_margin_minutes: SESSION_CONFIG.startMarginMinutes,
      end_margin_minutes: SESSION_CONFIG.endMarginMinutes,
      session_version: SESSION_CONFIG.version,
      market_calendar_hash: STRATEGY_MANIFEST.market_calendar_hash,
    },
  };
}

export function signalIdFor(pair: string, timeframe: string, signalCandleOpenTs: string): string {
  return `SIG-${createHash('sha256').update(`${pair}|${timeframe}|${signalCandleOpenTs}`).digest('hex').slice(0, 12).toUpperCase()}`;
}

function hashEntry(entry: Omit<LedgerEntry, 'hash'>): string {
  return createHash('sha256').update(JSON.stringify({ seq: entry.seq, type: entry.type, ts: entry.ts, payload: entry.payload, prevHash: entry.prevHash })).digest('hex').toLowerCase();
}

function defaultLedgerPath(): string {
  const explicit = String(process.env.SIGNAL_LEDGER_PATH || '').trim();
  if (explicit) return explicit;
  const dataDir = String(process.env.DATA_DIR || '').trim();
  if (dataDir) {
    const dateStr = new Date().toISOString().split('T')[0];
    return path.join(dataDir, 'ledger', `${dateStr}.jsonl`);
  }
  if (process.env.NODE_ENV === 'test') {
    const dateStr = new Date().toISOString().split('T')[0];
    return path.join(process.cwd(), 'data', 'ledger', `${dateStr}.jsonl`);
  }
  throw new Error('SIGNAL_LEDGER_PATH_REQUIRED: configure DATA_DIR or SIGNAL_LEDGER_PATH before creating the signal ledger.');
}

export class SignalLedger {
  private cachedEntries: LedgerEntry[] | undefined;
  private cachedSignature: string | undefined;
  private cacheVerified = false;

  constructor(private readonly filePath: string = defaultLedgerPath()) {
    this.recoverPartialTail();
  }

  public get path(): string { return this.filePath; }

  /** Recover only an incomplete final JSONL line; any earlier corruption remains fail-closed. */
  public recoverPartialTail(): { recovered: boolean; reason?: string } {
    if (!fs.existsSync(this.filePath)) return { recovered: false };
    const raw = fs.readFileSync(this.filePath, 'utf8');
    if (!raw || raw.endsWith('\n')) return { recovered: false };
    const lastNewline = raw.lastIndexOf('\n');
    const tail = raw.slice(lastNewline + 1).trim();
    if (!tail) return { recovered: false };
    try {
      JSON.parse(tail);
      fs.appendFileSync(this.filePath, '\n');
      return { recovered: false };
    } catch {
      if (/[}\]]$/.test(tail)) return { recovered: false, reason: 'FINAL_LINE_PARSE_ERROR' };
      if (lastNewline < 0) throw new Error('LEDGER_CORRUPT_NO_VALID_PREFIX');
      const fd = fs.openSync(this.filePath, 'r+');
      try {
        fs.ftruncateSync(fd, lastNewline + 1);
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      return { recovered: true, reason: 'TRUNCATED_INCOMPLETE_FINAL_LINE' };
    }
  }

  /** Explicit, idempotent repair hook for an administrator/audit job. */
  public repairPartialTail(): { repaired: boolean; reason?: string; verification: ReturnType<SignalLedger['verify']> } {
    const result = this.recoverPartialTail();
    this.cachedEntries = undefined;
    this.cachedSignature = undefined;
    this.cacheVerified = false;
    return { repaired: result.recovered, reason: result.reason, verification: this.verify() };
  }

  public readAll(): LedgerEntry[] {
    this.refreshCache();
    return this.cachedEntries!.map((entry) => entry);
  }

  public verify(): { ok: boolean; entries: number; brokenAt?: number; reason?: string } {
    let entries: LedgerEntry[];
    try { this.refreshCache(true); entries = this.cachedEntries!; } catch { return { ok: false, entries: 0, reason: 'LEDGER_UNPARSEABLE' }; }
    return this.verifyEntries(entries);
  }

  private verifyEntries(entries: LedgerEntry[]): { ok: boolean; entries: number; brokenAt?: number; reason?: string } {
    let prev = GENESIS_HASH;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.seq !== i) return { ok: false, entries: entries.length, brokenAt: i, reason: 'SEQUENCE_BROKEN' };
      if (e.prevHash !== prev) return { ok: false, entries: entries.length, brokenAt: i, reason: 'PREV_HASH_MISMATCH' };
      const payload = e.payload && typeof e.payload === 'object' ? e.payload as Record<string, unknown> : {};
      const fingerprint = payload.engine_fingerprint;
      const isKnownPreviousIdentity = fingerprint === PREVIOUS_V3_ENGINE_FINGERPRINT
        && payload.config_hash === PREVIOUS_V3_CONFIG_HASH
        && payload.config_hash_epoch === PREVIOUS_V3_CONFIG_HASH_EPOCH;
      if (fingerprint !== undefined && fingerprint !== ENGINE_FINGERPRINT && !isKnownPreviousIdentity) return { ok: false, entries: entries.length, brokenAt: i, reason: 'ENGINE_FINGERPRINT_MISMATCH' };
      if (hashEntry(e) !== e.hash) return { ok: false, entries: entries.length, brokenAt: i, reason: 'HASH_MISMATCH' };
      prev = e.hash;
    }
    return { ok: true, entries: entries.length };
  }

  private fileSignature(): string {
    if (!fs.existsSync(this.filePath)) return 'MISSING';
    const stat = fs.statSync(this.filePath);
    return `${stat.size}:${stat.mtimeMs}`;
  }

  private refreshCache(force = false): void {
    const signature = this.fileSignature();
    if (!force && this.cachedEntries && this.cachedSignature === signature) return;
    const entries = signature === 'MISSING'
      ? []
      : fs.readFileSync(this.filePath, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as LedgerEntry);
    this.cachedEntries = entries;
    this.cachedSignature = signature;
    this.cacheVerified = this.verifyEntries(entries).ok;
  }

  public append<T extends object>(type: LedgerEventType, payload: T, ts = new Date().toISOString()): LedgerEntry<T> {
    this.refreshCache();
    const check = this.cacheVerified ? { ok: true, entries: this.cachedEntries!.length } : this.verifyEntries(this.cachedEntries!);
    if (!check.ok) throw new Error(`LEDGER_TAMPERED: ${check.reason} at entry ${check.brokenAt ?? 'unknown'}; refusing to append.`);
    const entries = this.cachedEntries!;
    const prevHash = entries.at(-1)?.hash ?? GENESIS_HASH;
    const committedPayload = { ...(payload as Record<string, unknown>), ...identityMetadata(payload as Record<string, unknown>) };
    const base = { seq: entries.length, type, ts, payload: committedPayload, prevHash };
    const entry = { ...base, hash: hashEntry(base) };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const fd = fs.openSync(this.filePath, 'a');
    try { fs.writeSync(fd, `${JSON.stringify(entry)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    entries.push(entry as LedgerEntry);
    this.cachedSignature = this.fileSignature();
    this.cacheVerified = true;
    return entry as unknown as LedgerEntry<T>;
  }

  /** Records a CALL/PUT once per pair/timeframe/signal candle. Returns false if it already exists. */
  public recordSignal(signal: SignalPayload, ts?: string): boolean {
    if (this.signals().some((s) => s.signal_id === signal.signal_id)) return false;
    this.append('SIGNAL', signal, ts);
    return true;
  }

  /** Records every scan invocation, including cached and NO_TRADE results. */
  public recordScan(scan: ScanPayload): LedgerEntry<ScanPayload> {
    return this.append('SCAN', scan, scan.delivered_at);
  }

  public scanEntries(): ScanPayload[] {
    return this.readAll().filter((entry) => entry.type === 'SCAN').map((entry) => entry.payload as unknown as ScanPayload);
  }

  public expiredScanCount(): number {
    return this.scanEntries().filter((scan) => scan.reason.startsWith('SIGNAL_EXPIRED')).length;
  }

  public recordResult(result: ResultPayload, ts?: string): LedgerEntry<ResultPayload> {
    const signal = this.signals().find((s) => s.signal_id === result.signal_id);
    if (!signal) throw new Error(`UNKNOWN_SIGNAL: ${result.signal_id}`);
    const brokerEntry = result.broker_entry_price ?? signal.broker_entry_price;
    const enriched = brokerEntry !== undefined && signal.signal_price !== undefined
      ? { ...result, broker_entry_price: brokerEntry, slippage_pips: result.slippage_pips ?? slippagePips(signal.pair, signal.signal_price, brokerEntry) }
      : result;
    return this.append('RESULT', enriched, ts);
  }

  public recordTaken(signalId: string, brokerEntryPrice: number, ts?: string): boolean {
    const signal = this.get(signalId);
    if (!signal) throw new Error(`UNKNOWN_SIGNAL: ${signalId}`);
    if (!Number.isFinite(brokerEntryPrice)) throw new Error('INVALID_BROKER_ENTRY_PRICE');
    this.append('TRADE_TAKEN', { signal_id: signal.signal_id, broker_entry_price: brokerEntryPrice }, ts);
    return true;
  }

  public recordCandleRevision(signalId: string, candleRevisionPips: number, ts?: string): LedgerEntry<CandleRevisionPayload> {
    if (!this.get(signalId)) throw new Error(`UNKNOWN_SIGNAL: ${signalId}`);
    return this.append('CANDLE_REVISION', { signal_id: signalId, candle_revision_pips: candleRevisionPips }, ts);
  }

  public recordTelegramSent(signalId: string, telegramSentAt = new Date().toISOString(), ts?: string): LedgerEntry<SignalSentPayload> {
    if (!this.get(signalId)) throw new Error(`UNKNOWN_SIGNAL: ${signalId}`);
    return this.append('SIGNAL_SENT', { signal_id: signalId, telegram_sent_at: telegramSentAt }, ts);
  }

  public signals(): SignalView[] {
    const map = new Map<string, SignalView>();
    for (const e of this.readAll()) {
      if (e.type === 'SIGNAL') map.set((e.payload as unknown as SignalPayload).signal_id, { ...(e.payload as unknown as SignalPayload) });
      if (e.type === 'RESULT') {
        const r = e.payload as unknown as ResultPayload;
        const s = map.get(r.signal_id);
        if (s) {
          if (r.source === 'AUTO_PROVIDER') s.provider_outcome = r.outcome;
          else s.broker_outcome = r.outcome;
          Object.assign(s, { outcome: r.outcome, result_source: r.source, resolved_at: e.ts, entry_price: r.entry_price, exit_price: r.exit_price, broker_close_price: r.broker_close_price ?? s.broker_close_price, broker_entry_price: r.broker_entry_price ?? s.broker_entry_price, slippage_pips: r.slippage_pips ?? s.slippage_pips });
        }
      }
      if (e.type === 'TRADE_TAKEN') { const p = e.payload as unknown as TradeTakenPayload; const s = map.get(p.signal_id); if (s) s.broker_entry_price = p.broker_entry_price; }
      if (e.type === 'CANDLE_REVISION') { const p = e.payload as unknown as CandleRevisionPayload; const s = map.get(p.signal_id); if (s) s.candle_revision_pips = p.candle_revision_pips; }
      if (e.type === 'SIGNAL_SENT') { const p = e.payload as unknown as SignalSentPayload; const s = map.get(p.signal_id); if (s) s.telegram_sent_at = p.telegram_sent_at; }
    }
    return [...map.values()];
  }

  public get(signalId: string): SignalView | undefined {
    return this.signals().find((s) => s.signal_id.toUpperCase() === signalId.toUpperCase());
  }

  public stats(): LedgerStats {
    const signals = this.signals();
    const wins = signals.filter((s) => s.outcome === 'WIN').length;
    const losses = signals.filter((s) => s.outcome === 'LOSS').length;
    const ties = signals.filter((s) => s.outcome === 'TIE').length;
    const resolved = wins + losses + ties;
    return { signals: signals.length, resolved, wins, losses, ties, winRatePercentage: wins + losses ? Number((wins / (wins + losses) * 100).toFixed(1)) : null };
  }

  public pending(nowMs: number): SignalView[] {
    return this.signals().filter((s) => (!s.outcome || s.outcome === 'UNRESOLVED') && Date.parse(s.expiry_ts) <= nowMs);
  }

  public edgeEvents(): LedgerEntry[] {
    return this.readAll().filter((e) => e.type === 'EDGE_LOST' || e.type === 'EDGE_RESUMED');
  }
}
