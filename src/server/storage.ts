// Durable JSON-Backed Persistence Store for ComVision Engine
// Ensures all candidate telemetry, experiment progress, user accounts,
// audit logs, outcomes, and notification states survive server restart.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MasterTelemetry, UserAccount, UserRecordedAction } from '../engine/types';
import { compactScanSummary, ScanSummaryRing, shouldWriteSummary, type CompactScanSummary } from './operationalStorage';

// Research Outcome Semantics:
// Frozen compatibility outcomes: NEXT_CANDLE_FAVORABLE | NEXT_CANDLE_UNFAVORABLE | NEXT_CANDLE_NEUTRAL | NEXT_CANDLE_INCONCLUSIVE
// Historical v1.0 legacy compatibility: WIN | LOSS | INVALIDATED | UNRESOLVED
export type SignalOutcome =
  | 'NEXT_CANDLE_FAVORABLE'
  | 'NEXT_CANDLE_UNFAVORABLE'
  | 'NEXT_CANDLE_NEUTRAL'
  | 'NEXT_CANDLE_INCONCLUSIVE'
  | 'WIN'
  | 'LOSS'
  | 'INVALIDATED'
  | 'UNRESOLVED';

export interface SignalOutcomeRecord {
  setup_id: string;
  pair?: string;
  bias?: 'BULLISH' | 'BEARISH' | 'UNCLEAR';
  timeframe?: string;
  signal_timestamp_utc?: string;
  signal_timestamp_bdt?: string;
  result_timestamp_utc?: string;
  result_timestamp_bdt?: string;
  signal_outcome?: SignalOutcome;
  outcome?: SignalOutcome;
  user_recorded_action?: UserRecordedAction;
  userAction?: UserRecordedAction;
  timestamp?: string;
  nextCandleOpen?: number;
  nextCandleClose?: number;
  next_candle?: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  notes?: string;
}

export interface AuditEvent {
  id: string;
  timestamp_utc: string;
  event_type: string;
  action?: string;
  actor_id?: string;
  actor_email?: string;
  user_id?: string;
  user_email?: string;
  details?: Record<string, any> | any;
  ip_address?: string;
}

export interface NotificationRecord {
  id: string;
  setup_id: string;
  type: 'SIGNAL_ALERT' | 'RESULT_ALERT' | 'SYSTEM_ALERT';
  channel: 'TELEGRAM' | 'EMAIL';
  recipient: string;
  status: 'SENT' | 'FAILED' | 'DISABLED';
  dispatched_at_utc: string;
  error_message?: string;
  payload_summary: string;
}

export interface ChatMessage {
  id: string;
  timestamp_utc: string;
  user_id: string;
  user_query: string;
  assistant_response: string;
  query_type: 'HISTORICAL_ANALYTICS' | 'MARKET_CONDITION' | 'STRATEGY_EXPLANATION' | 'MUTATION_ATTEMPT' | 'GENERAL';
  referenced_setup_ids?: string[];
}

export interface StoredSession {
  tokenHash?: string;
  /** Legacy sessions may contain a raw token; new writes never do. */
  token?: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface ExperimentState {
  experimentId: string;
  strategyVersion: string;
  isLocked: boolean;
  scannerActive: boolean;
  alertsMuted: boolean;
  alertsMuteUntil?: string | null;
  lastHash: string;
  targetValidSetups: number;
  updatedAt: string;
  notifiedMilestones?: number[];
  pendingMilestones?: number[];
}

export class DurableStorage {
  private dataDir!: string;
  private usersFile!: string;
  private sessionsFile!: string;
  private candidatesFile!: string;
  private signalsFile!: string;
  private scanSummariesFile!: string;
  private outcomesFile!: string;
  private auditFile!: string;
  private notificationsFile!: string;
  private chatFile!: string;
  private experimentFile!: string;
  private settingsFile!: string;
  private readonly jsonCache = new Map<string, { signature: string; value: unknown }>();

  constructor(customDir?: string) {
    const configuredDir = customDir || process.env.DATA_DIR?.trim();
    if (!configuredDir && process.env.NODE_ENV === 'production') throw new Error('DATA_DIR_REQUIRED: configure a persistent DATA_DIR before production startup.');
    this.setDataDir(configuredDir || path.join(os.tmpdir(), `comvision-test-data-${process.pid}`));
  }

  public setDataDir(dir: string) {
    this.dataDir = path.resolve(dir);
    this.ensureDirExists(this.dataDir);
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const name of fs.readdirSync(this.dataDir)) {
      if (name.includes('.tmp.') && fs.statSync(path.join(this.dataDir, name)).mtimeMs < cutoff) {
        try { fs.unlinkSync(path.join(this.dataDir, name)); } catch {}
      }
    }

    this.usersFile = path.join(this.dataDir, 'users.json');
    this.sessionsFile = path.join(this.dataDir, 'sessions.json');
    this.candidatesFile = path.join(this.dataDir, 'candidates.json');
    this.signalsFile = path.join(this.dataDir, 'signals.json');
    this.scanSummariesFile = path.join(this.dataDir, 'scan_summaries.json');
    this.outcomesFile = path.join(this.dataDir, 'outcomes.json');
    this.auditFile = path.join(this.dataDir, 'audit_log.json');
    this.notificationsFile = path.join(this.dataDir, 'notifications.json');
    this.chatFile = path.join(this.dataDir, 'chat_history.json');
    this.experimentFile = path.join(this.dataDir, 'experiment_state.json');
    this.settingsFile = path.join(this.dataDir, 'app_settings.json');
  }

  public getDataDir(): string { return this.dataDir; }

  public clearAll() {
    const files = [
      this.usersFile,
      this.sessionsFile,
      this.candidatesFile,
      this.signalsFile,
      this.scanSummariesFile,
      this.outcomesFile,
      this.auditFile,
      this.notificationsFile,
      this.chatFile,
      this.experimentFile,
      this.settingsFile,
    ];
    for (const f of files) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  }

  private ensureDirExists(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private quarantine(filePath: string): string | undefined {
    if (!fs.existsSync(filePath)) return undefined;
    const quarantinePath = `${filePath}.corrupt.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(filePath, quarantinePath);
    fs.chmodSync(quarantinePath, 0o600);
    return quarantinePath;
  }

  private readJson<T>(filePath: string, fallback: T, validate?: (value: unknown) => value is T): T {
    try {
      if (fs.existsSync(filePath)) {
        const signature = this.fileSignature(filePath);
        const cached = this.jsonCache.get(filePath);
        if (cached?.signature === signature) return cached.value as T;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const value: unknown = JSON.parse(raw);
        if (validate && !validate(value)) throw new TypeError(`Unexpected JSON shape for ${path.basename(filePath)}`);
        this.jsonCache.set(filePath, { signature, value });
        return value as T;
      }
    } catch (err) {
      if (!(err instanceof SyntaxError || err instanceof TypeError)) throw err;
      this.jsonCache.delete(filePath);
      this.quarantine(filePath);
      const previous = `${filePath}.prev`;
      if (fs.existsSync(previous)) {
        try {
          const recovered: unknown = JSON.parse(fs.readFileSync(previous, 'utf8'));
          if (!validate || validate(recovered)) {
            fs.copyFileSync(previous, filePath);
            fs.chmodSync(filePath, 0o600);
            this.jsonCache.set(filePath, { signature: this.fileSignature(filePath), value: recovered });
            return recovered as T;
          }
        } catch { /* invalid .prev is not a recovery source */ }
      }
      console.error(`[Storage] Failed to read ${filePath}, using fallback:`, err);
    }
    return fallback;
  }

  private writeJson<T>(filePath: string, data: T, critical = true) {
    let tempPath: string | undefined;
    let fd: number | undefined;
    try {
      tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      fd = fs.openSync(tempPath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf-8');
      if (critical) fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      if (fs.existsSync(filePath)) {
        const previous = `${filePath}.prev`;
        try { fs.linkSync(filePath, previous); } catch { fs.copyFileSync(filePath, previous); }
        fs.chmodSync(previous, 0o600);
      }
      fs.renameSync(tempPath, filePath);
      tempPath = undefined;
      this.jsonCache.delete(filePath);
      if (critical) {
        const dirFd = fs.openSync(path.dirname(filePath), 'r');
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      }
    } catch (err) {
      console.error(`[Storage] Failed to write ${filePath}:`, err);
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch {}
      if (tempPath) try { fs.unlinkSync(tempPath); } catch {}
    }
  }

  private fileSignature(filePath: string): string {
    const stat = fs.statSync(filePath);
    return `${stat.size}:${stat.mtimeMs}`;
  }

  // --- USERS ---
  public loadUsers(): UserAccount[] {
    return this.readJson<UserAccount[]>(this.usersFile, [], (value): value is UserAccount[] => Array.isArray(value));
  }

  public saveUsers(users: UserAccount[]) {
    this.writeJson(this.usersFile, users);
  }

  // --- SESSIONS ---
  public loadSessions(): StoredSession[] {
    return this.readJson<StoredSession[]>(this.sessionsFile, [], (value): value is StoredSession[] => Array.isArray(value));
  }

  public saveSessions(sessions: StoredSession[]) {
    this.writeJson(this.sessionsFile, sessions);
  }

  // --- CANDIDATES & TELEMETRY ---
  public loadCandidates(): MasterTelemetry[] {
    const signals = this.readJson<MasterTelemetry[]>(this.signalsFile, [], (value): value is MasterTelemetry[] => Array.isArray(value));
    if (signals.length > 0) return signals;
    return this.readJson<MasterTelemetry[]>(this.candidatesFile, [], (value): value is MasterTelemetry[] => Array.isArray(value));
  }

  public saveCandidates(candidates: MasterTelemetry[]) {
    const priorSignals = this.readJson<MasterTelemetry[]>(this.signalsFile, [], (value): value is MasterTelemetry[] => Array.isArray(value));
    const signalMap = new Map<string, MasterTelemetry>(priorSignals.map((candidate) => [candidate.metadata?.setup_id, candidate]));
    for (const candidate of candidates.filter((item) => item.system_execution?.system_decision === 'PASS')) signalMap.set(candidate.metadata?.setup_id, candidate);
    const signals = [...signalMap.values()];
    this.writeJson(this.signalsFile, signals);
    const ring = new ScanSummaryRing(Number(process.env.SCAN_SUMMARY_RING_SIZE || 200));
    for (const candidate of candidates) {
      ring.push(compactScanSummary({ pair: candidate.metadata?.pair || candidate.metadata?.asset || 'UNKNOWN', timeframe: candidate.market_context?.selected_timeframe || 'UNKNOWN', status: candidate.system_execution?.system_decision || 'UNKNOWN', reason: candidate.metadata?.status_reason || candidate.system_execution?.rejection_reason || '', signal_id: candidate.metadata?.setup_id, delivered_at: candidate.metadata?.timestamp_utc || new Date().toISOString() }));
    }
    if (shouldWriteSummary(this.dataDirSize(), Number(process.env.SUMMARY_STORAGE_CAP_MB || 50) * 1024 * 1024)) this.writeJson(this.scanSummariesFile, ring.values(), false);
    if (fs.existsSync(this.candidatesFile)) { try { fs.unlinkSync(this.candidatesFile); } catch {} }
  }

  public loadScanSummaries(): CompactScanSummary[] { return this.readJson<CompactScanSummary[]>(this.scanSummariesFile, [], (value): value is CompactScanSummary[] => Array.isArray(value)); }
  private dataDirSize(): number { return fs.readdirSync(this.dataDir).reduce((sum, name) => { try { return sum + fs.statSync(path.join(this.dataDir, name)).size; } catch { return sum; } }, 0); }

  // --- SIGNAL OUTCOMES ---
  public loadOutcomes(): SignalOutcomeRecord[] {
    return this.readJson<SignalOutcomeRecord[]>(this.outcomesFile, [], (value): value is SignalOutcomeRecord[] => Array.isArray(value));
  }

  public saveOutcomes(outcomes: SignalOutcomeRecord[]) {
    this.writeJson(this.outcomesFile, outcomes);
  }

  public recordOutcome(outcome: SignalOutcomeRecord) {
    const outcomes = this.loadOutcomes();
    const idx = outcomes.findIndex((o) => o.setup_id === outcome.setup_id);
    if (idx >= 0) {
      outcomes[idx] = outcome;
    } else {
      outcomes.unshift(outcome);
    }
    this.saveOutcomes(outcomes);
  }

  // --- AUDIT TRAIL ---
  public loadAuditEvents(): AuditEvent[] {
    return this.readJson<AuditEvent[]>(this.auditFile, []);
  }

  public getAuditLogs(): AuditEvent[] {
    return this.loadAuditEvents();
  }

  public appendAuditLog(event: { action: string; userId?: string; details?: any }): AuditEvent {
    return this.recordAuditEvent({
      event_type: event.action,
      user_id: event.userId,
      details: event.details,
    });
  }

  public recordAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp_utc'>): AuditEvent {
    const fullEvent: AuditEvent = {
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp_utc: new Date().toISOString(),
      ...event,
    };
    const events = this.loadAuditEvents();
    events.unshift(fullEvent);
    // Keep last 1000 events
    if (events.length > 1000) events.length = 1000;
    this.writeJson(this.auditFile, events);
    return fullEvent;
  }

  // --- NOTIFICATIONS ---
  public loadNotifications(): NotificationRecord[] {
    return this.readJson<NotificationRecord[]>(this.notificationsFile, []);
  }

  public recordNotification(record: Omit<NotificationRecord, 'id' | 'dispatched_at_utc'>): NotificationRecord {
    const fullRecord: NotificationRecord = {
      id: `NOTIF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      dispatched_at_utc: new Date().toISOString(),
      ...record,
    };
    const records = this.loadNotifications();
    records.unshift(fullRecord);
    if (records.length > 500) records.length = 500;
    this.writeJson(this.notificationsFile, records);
    return fullRecord;
  }

  // --- CHAT HISTORY ---
  public loadChatHistory(): ChatMessage[] {
    return this.readJson<ChatMessage[]>(this.chatFile, [], (value): value is ChatMessage[] => Array.isArray(value));
  }

  public recordChatMessage(msg: Omit<ChatMessage, 'id' | 'timestamp_utc'>): ChatMessage {
    const fullMsg: ChatMessage = {
      id: `CHAT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp_utc: new Date().toISOString(),
      ...msg,
    };
    if (process.env.CHAT_HISTORY_ENABLED === 'false') return fullMsg;
    const history = this.loadChatHistory();
    history.push(fullMsg);
    if (history.length > 500) history.shift();
    this.writeJson(this.chatFile, history);
    return fullMsg;
  }

  // --- EXPERIMENT STATE ---
  public loadExperimentState(): ExperimentState | null {
    return this.readJson<ExperimentState | null>(this.experimentFile, null);
  }

  public saveExperimentState(state: ExperimentState) {
    this.writeJson(this.experimentFile, state);
  }

  // --- APP SETTINGS (PERSISTENT RUNTIME OVERRIDES) ---
  public loadAppSettings(): Record<string, any> {
    return this.readJson<Record<string, any>>(this.settingsFile, {});
  }

  public saveAppSettings(settings: Record<string, any>) {
    this.writeJson(this.settingsFile, settings);
  }
}

export const durableStorage = new DurableStorage();
