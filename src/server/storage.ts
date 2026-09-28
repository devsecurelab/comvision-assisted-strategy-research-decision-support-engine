// Durable JSON-Backed Persistence Store for ComVision Engine
// Ensures all candidate telemetry, experiment progress, user accounts,
// audit logs, outcomes, and notification states survive server restart.

import fs from 'node:fs';
import path from 'node:path';
import { MasterTelemetry, UserAccount, UserRecordedAction } from '../engine/types';

// Research Outcome Semantics:
// v2.0-FROZEN: NEXT_CANDLE_FAVORABLE | NEXT_CANDLE_UNFAVORABLE | NEXT_CANDLE_NEUTRAL | NEXT_CANDLE_INCONCLUSIVE
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
  requested_outcome?: SignalOutcome;
  resolution_rule?: string;
  resolution_direction?: 'UP' | 'DOWN' | 'FLAT';
  duplicate_submission?: boolean;
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
  token: string;
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
  lastHash: string;
  targetValidSetups: number;
  updatedAt: string;
}

export class DurableStorage {
  private dataDir!: string;
  private usersFile!: string;
  private sessionsFile!: string;
  private candidatesFile!: string;
  private outcomesFile!: string;
  private auditFile!: string;
  private notificationsFile!: string;
  private chatFile!: string;
  private experimentFile!: string;
  private settingsFile!: string;

  constructor(customDir?: string) {
    this.setDataDir(customDir || process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  }

  public setDataDir(dir: string) {
    this.dataDir = dir;
    this.ensureDirExists(this.dataDir);

    this.usersFile = path.join(this.dataDir, 'users.json');
    this.sessionsFile = path.join(this.dataDir, 'sessions.json');
    this.candidatesFile = path.join(this.dataDir, 'candidates.json');
    this.outcomesFile = path.join(this.dataDir, 'outcomes.json');
    this.auditFile = path.join(this.dataDir, 'audit_log.json');
    this.notificationsFile = path.join(this.dataDir, 'notifications.json');
    this.chatFile = path.join(this.dataDir, 'chat_history.json');
    this.experimentFile = path.join(this.dataDir, 'experiment_state.json');
    this.settingsFile = path.join(this.dataDir, 'app_settings.json');
  }

  public clearAll() {
    const files = [
      this.usersFile,
      this.sessionsFile,
      this.candidatesFile,
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

  private readJson<T>(filePath: string, fallback: T): T {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as T;
      }
    } catch (err) {
      console.error(`[Storage] Failed to read ${filePath}, using fallback:`, err);
    }
    return fallback;
  }

  private writeJson<T>(filePath: string, data: T) {
    try {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.error(`[Storage] Failed to write ${filePath}:`, err);
    }
  }

  // --- USERS ---
  public loadUsers(): UserAccount[] {
    return this.readJson<UserAccount[]>(this.usersFile, []);
  }

  public saveUsers(users: UserAccount[]) {
    this.writeJson(this.usersFile, users);
  }

  // --- SESSIONS ---
  public loadSessions(): StoredSession[] {
    return this.readJson<StoredSession[]>(this.sessionsFile, []);
  }

  public saveSessions(sessions: StoredSession[]) {
    this.writeJson(this.sessionsFile, sessions);
  }

  // --- CANDIDATES & TELEMETRY ---
  public loadCandidates(): MasterTelemetry[] {
    return this.readJson<MasterTelemetry[]>(this.candidatesFile, []);
  }

  public saveCandidates(candidates: MasterTelemetry[]) {
    this.writeJson(this.candidatesFile, candidates);
  }

  // --- SIGNAL OUTCOMES ---
  public loadOutcomes(): SignalOutcomeRecord[] {
    return this.readJson<SignalOutcomeRecord[]>(this.outcomesFile, []);
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
    return this.readJson<ChatMessage[]>(this.chatFile, []);
  }

  public recordChatMessage(msg: Omit<ChatMessage, 'id' | 'timestamp_utc'>): ChatMessage {
    const fullMsg: ChatMessage = {
      id: `CHAT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp_utc: new Date().toISOString(),
      ...msg,
    };
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
