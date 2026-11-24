// Research Signal & Outcome Notification Dispatcher
// Dispatches informational manual research alerts to Telegram and Email.
// STRICT NON-EXECUTION BOUNDARY: Informational decision-support only. No trade execution.

import nodemailer from 'nodemailer';
import { MasterTelemetry } from '../engine/types';
import { durableStorage, NotificationRecord, SignalOutcomeRecord } from './storage';
import { formatSignalTime } from '../utils/timeFormat';
import { formatOffsetTime } from '../utils/timeFormat';
import { displayPair, isSupportedPair, payoutRegistry } from './payoutRegistry';
import { favoriteRegistry } from './favoriteRegistry';
import { feedManager } from '../engine/dataProviders';
import type { ScanLoop, ScanResult, ScanService, ScanTimeframe } from '../engine/scanScheduler';
import { SCAN_TIMEFRAMES } from '../engine/scanScheduler';
import { buildLedgerReport, formatLedgerReport } from '../engine/edgeMonitor';
import { telegramSend, type TelegramMethod, type TelegramSendOptions, type TelegramSendResult } from './telegramSend';
import { experimentTracker } from '../engine/experimentTracker';
import { tolerancePips } from '../engine/price';

function alertReason(reason: string): string {
  return reason.replace(/news[^.]*clear/gi, 'manual news review not performed')
    .replace(/no high-impact red-folder events[^.]*/gi, 'NEWS: NOT CHECKED (manual)');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

const validationSummary = 'Validation evidence: PR-1 CI and test results are recorded in the repository evidence; live-provider integration is opt-in and remains SKIPPED unless explicitly enabled.';
function brokerOffsetMinutes(): number {
  const saved = durableStorage.loadAppSettings().brokerUtcOffsetMinutes;
  const configured = Number(saved ?? process.env.BROKER_UTC_OFFSET_MINUTES ?? 0);
  return Number.isInteger(configured) && configured >= -720 && configured <= 840 ? configured : 0;
}
function offsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'; const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export interface NotificationConfig {
  telegramEnabled: boolean;
  emailEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  notificationEmail?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface NotificationServiceDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  createTransport?: (options: Record<string, unknown>) => any;
  mailTimeoutMs?: number;
}

export class NotificationService {
  private config: NotificationConfig;
  private mailTransporter: any = null;
  private scanService?: ScanService;
  private scanLoop?: ScanLoop;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly createTransport: (options: Record<string, unknown>) => any;
  private readonly mailTimeoutMs: number;
  private readonly signalSendInFlight = new Map<string, Promise<TelegramSendResult>>();
  private readonly sentSignalIds = new Set<string>();
  private readonly credentialAlertsSent = new Set<string>();

  /** Wires the R9 scan service and loop so owner commands (/scan, /result, /health, /resume, /report, /autoscan) can use them. */
  public attachScanService(service: ScanService, loop: ScanLoop): void {
    this.scanService = service;
    this.scanLoop = loop;
  }

  public formatScanResult(result: ScanResult): string {
    const time = result.signal_candle_open_ts ? formatSignalTime(result.signal_candle_open_ts) : undefined;
    const brokerOffset = brokerOffsetMinutes();
    const validUntil = result.valid_until ? formatSignalTime(result.valid_until) : undefined;
    const v3 = result.telemetry?.decision_engine_v3;
    return [
      `${result.status} ${result.pair} ${result.timeframe}${result.cached ? ' (same candle, cached — no credit used)' : ''}`,
      `Reason: ${alertReason(result.reason)}`,
      `MFCI (confluence score, not probability): ${v3 ? `${v3.mfci.totalMfci.toFixed(3)} (${v3.mfciBand})` : 'UNAVAILABLE'} | Mode: ${v3?.engineMode ?? 'UNAVAILABLE'}`,
      result.status !== 'NO_TRADE' ? 'NEWS: NOT CHECKED (manual)' : '',
      `Signal candle: ${time ? `${time.utcTime} UTC / ${time.bdtTime} BDT` : 'UNAVAILABLE'}`,
      result.signal_price !== undefined ? `Signal price: ${result.signal_price}` : '',
      result.quote_price !== undefined ? `Quote: ${result.quote_price} (${result.quote_ts || 'timestamp unavailable'})` : 'Quote: QUOTE_UNAVAILABLE',
      result.price_tolerance !== undefined && result.signal_price !== undefined ? `${result.status}: do not enter if broker price is ${result.status === 'CALL' ? 'above' : 'below'} ${result.signal_price} by more than ${tolerancePips(result.pair, result.price_tolerance)} pips (${result.price_tolerance})` : '',
      validUntil ? `Enter by: ${validUntil.utcTime} UTC / ${validUntil.bdtTime} BDT / ${formatOffsetTime(result.valid_until!, brokerOffset)} Broker (${offsetLabel(brokerOffset)}, display only)` : '',
      result.provider || result.htf_provider ? `Providers: LTF ${result.provider ?? 'UNAVAILABLE'} | HTF ${result.htf_provider ?? 'UNAVAILABLE'}` : '',
      result.signal_id ? `Signal ID: ${result.signal_id} | valid until ${result.valid_until}` : '',
      'Research alert only — no execution.',
    ].filter(Boolean).join('\n');
  }

  public buildHealthText(): string {
    const scheduler = feedManager.getSchedulerSnapshot();
    const clock = feedManager.getClockState();
    const providerStatus = feedManager.getStatus();
    const loopState = this.scanLoop?.state();
    const ledgerCheck = this.scanService?.ledger.verify();
    const edge = this.scanService?.edge.current();
    const signals = this.scanService?.ledger.signals() ?? [];
    const report = buildLedgerReport(signals, 0);
    const mute = experimentTracker.alertsMuteState();
    const coverage = (count: number) => `${count}/${signals.length}`;
    const failedTelegramDeliveries = durableStorage.loadNotifications()
      .filter((notification) => notification.channel === 'TELEGRAM' && notification.status === 'FAILED').length;
    return [
      'COMVISION /health',
      `Auto-scan: ${loopState ? `${loopState.enabled ? 'ON' : 'OFF'} ${loopState.timeframe}` : 'NOT_WIRED'} | last run ${loopState?.lastRunAt ?? 'never'}${loopState?.lastError ? ` | last error ${loopState.lastError}` : ''}`,
      `Last cycle: ${loopState?.lastSummary || 'none'}`,
      `Provider: last OK ${clock.lastSuccessfulProvider ?? 'none'} at ${clock.lastSuccessfulSync || 'never'}${clock.lastFailedProvider ? ` | last failed ${clock.lastFailedProvider}` : ''}`,
      `Active provider: ${providerStatus.provider} (${providerStatus.status})`,
      `Provider circuits: ${providerStatus.circuits.map((circuit) => `${circuit.provider}=${circuit.state}${circuit.lastFailureCode ? `:${circuit.lastFailureCode}` : ''}`).join(' | ')}`,
      `Provider requests today (combined): ${scheduler.dayUsed}/${scheduler.perDay} (internal hard stop ${scheduler.hardStopDaily}, auto ${scheduler.autoUsed}/${scheduler.autoDailyBudget}) | minute ${scheduler.minuteUsed}/${scheduler.perMinute}`,
      `Clock drift: ${clock.driftMs === null ? 'UNAVAILABLE' : `${clock.driftMs} ms`} (${clock.status})`,
      'NEWS: NOT CHECKED (manual)',
      `Ledger: ${ledgerCheck ? (ledgerCheck.ok ? `OK (${ledgerCheck.entries} entries)` : `TAMPERED ${ledgerCheck.reason} at ${ledgerCheck.brokenAt}`) : 'NOT_WIRED'}`,
      `SIGNAL_EXPIRED scans: ${this.scanService?.ledger.expiredScanCount() ?? 0}`,
      `Telegram failed deliveries: ${failedTelegramDeliveries}`,
      `Alerts: ${mute.muted ? `MUTED until ${mute.until}` : 'ENABLED'} | signals remain ledger-backed`,
      `Storage: compact scan summaries ring=${process.env.SCAN_SUMMARY_RING_SIZE || 200}, cap=${process.env.SUMMARY_STORAGE_CAP_MB || 50}MB; full telemetry=signals only`,
      `Candle revisions != 0: ${this.scanService?.ledger.signals().filter((s) => (s.candle_revision_pips ?? 0) !== 0).length ?? 0}`,
      `Telegram close→sent latency p50/p95: ${report.telegramLatencyP50Ms ?? 'UNAVAILABLE'}/${report.telegramLatencyP95Ms ?? 'UNAVAILABLE'} ms`,
      `PR-1 telemetry coverage: signal price ${coverage(signals.filter((s) => s.signal_price !== undefined).length)} | quote ${coverage(signals.filter((s) => s.quote_price !== undefined).length)} | broker entry ${coverage(signals.filter((s) => s.broker_entry_price !== undefined).length)} | sent timestamp ${coverage(signals.filter((s) => s.telegram_sent_at !== undefined).length)}`,
      validationSummary,
      `Edge: ${edge ? (edge.paused ? `EDGE_LOST since ${edge.lostAt} — এখন ট্রেড নয় (${edge.reason})` : 'ACTIVE') : 'NOT_WIRED'}`,
    ].join('\n');
  }

  constructor(dependencies: NotificationServiceDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.sleep = dependencies.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.now = dependencies.now ?? Date.now;
    this.createTransport = dependencies.createTransport ?? ((options) => nodemailer.createTransport(options as any));
    this.mailTimeoutMs = dependencies.mailTimeoutMs ?? 5000;
    const savedSettings = durableStorage.loadAppSettings();
    const resolvedChatId = process.env.TELEGRAM_CHAT_ID || savedSettings.telegramChatId;

    this.config = {
      telegramEnabled: process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'true' || !!(process.env.TELEGRAM_BOT_TOKEN && resolvedChatId),
      emailEnabled: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true' || !!(process.env.SMTP_USER && process.env.NOTIFICATION_EMAIL),
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: resolvedChatId,
      notificationEmail: process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };

    this.initMailTransporter();
  }

  private initMailTransporter() {
    if (this.config.smtpUser && this.config.smtpPass) {
      try {
        this.mailTransporter = this.createTransport({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          secure: this.config.smtpPort === 465,
          connectionTimeout: 5000,
          greetingTimeout: 5000,
          socketTimeout: 5000,
          auth: {
            user: this.config.smtpUser,
            pass: this.config.smtpPass,
          },
        });
      } catch (err) {
        console.error('[NotificationService] Failed to create mail transporter:', err);
      }
    }
  }

  private requestTelegram(
    method: TelegramMethod,
    payload: Record<string, unknown>,
    extra: Partial<Pick<TelegramSendOptions, 'validUntil' | 'expiredText'>> = {},
  ): Promise<TelegramSendResult> {
    const token = this.config.telegramBotToken;
    if (!token) return Promise.resolve({ ok: false, attempts: 0, error: 'Telegram Bot Token is not configured.' });
    return telegramSend({
      token,
      method,
      payload,
      timeoutMs: 5000,
      fetchImpl: this.fetchImpl,
      sleep: this.sleep,
      now: this.now,
      ...extra,
    });
  }

  private async sendMailWithTimeout(mailOptions: Record<string, unknown>): Promise<unknown> {
    if (!this.mailTransporter) this.initMailTransporter();
    if (!this.mailTransporter) throw new Error('Email transport is not configured.');
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        reject(new Error(`Nodemailer send timed out after ${this.mailTimeoutMs}ms.`));
      }, this.mailTimeoutMs);
    });
    try {
      return await Promise.race([this.mailTransporter.sendMail(mailOptions), deadline]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (timedOut) {
        try { this.mailTransporter.close?.(); } catch { /* transport cleanup is best-effort */ }
        this.mailTransporter = null;
      }
    }
  }

  private latestSignalDelivery(signalId: string): NotificationRecord | undefined {
    return durableStorage.loadNotifications().find((notification) =>
      notification.setup_id === signalId
      && notification.type === 'SIGNAL_ALERT'
      && notification.channel === 'TELEGRAM'
    );
  }

  private recordSignalDelivery(
    signalId: string,
    status: 'SENDING' | 'SENT' | 'FAILED',
    payloadSummary: string,
    errorMessage?: string,
  ): void {
    durableStorage.recordNotification({
      setup_id: signalId,
      type: 'SIGNAL_ALERT',
      channel: 'TELEGRAM',
      recipient: this.config.telegramChatId ? 'OWNER_CHAT' : 'NOT_CONFIGURED',
      status,
      ...(errorMessage ? { error_message: errorMessage } : {}),
      payload_summary: payloadSummary,
    } as unknown as Omit<NotificationRecord, 'id' | 'dispatched_at_utc'>);
  }

  private async sendSignalTelegram(
    signalId: string,
    payload: Record<string, unknown>,
    extra: Partial<Pick<TelegramSendOptions, 'validUntil' | 'expiredText'>>,
    payloadSummary: string,
  ): Promise<TelegramSendResult> {
    if (this.sentSignalIds.has(signalId) || this.latestSignalDelivery(signalId)?.status === 'SENT') {
      return { ok: true, attempts: 0 };
    }
    const inFlight = this.signalSendInFlight.get(signalId);
    if (inFlight) return inFlight;

    const previousStatus = String(this.latestSignalDelivery(signalId)?.status || '');
    if (previousStatus === 'SENDING') {
      const validUntilMs = extra.validUntil ? Date.parse(extra.validUntil) : Number.NaN;
      if (!Number.isFinite(validUntilMs) || this.now() >= validUntilMs) {
        // A crash may leave a durable SENDING record behind. Never replay the
        // original signal after expiry, but do deliver the explicit safe notice.
        // requestTelegram() will replace the payload with expiredText when the
        // validity window has elapsed.
        const expiredExtra = {
          ...extra,
          validUntil: Number.isFinite(validUntilMs) ? extra.validUntil : new Date(this.now() - 1).toISOString(),
          expiredText: extra.expiredText || `SIGNAL EXPIRED — do not enter (${signalId})`,
        };
        const pending = (async () => {
          this.recordSignalDelivery(signalId, 'SENDING', `SENDING EXPIRED NOTICE ${payloadSummary}`);
          const result = await this.requestTelegram('sendMessage', payload, expiredExtra);
          this.recordSignalDelivery(
            signalId,
            result.ok ? 'SENT' : 'FAILED',
            `${result.expired ? 'EXPIRED NOTICE' : 'SIGNAL ALERT'} ${payloadSummary}`,
            result.error,
          );
          return result;
        })();
        this.signalSendInFlight.set(signalId, pending);
        try {
          return await pending;
        } finally {
          if (this.signalSendInFlight.get(signalId) === pending) this.signalSendInFlight.delete(signalId);
        }
      }
    }

    const pending = (async () => {
      this.recordSignalDelivery(signalId, 'SENDING', `SENDING SIGNAL ALERT ${payloadSummary}`);
      const result = await this.requestTelegram('sendMessage', payload, extra);
      if (result.ok) {
        this.sentSignalIds.add(signalId);
      }
      this.recordSignalDelivery(
        signalId,
        result.ok ? 'SENT' : 'FAILED',
        `${result.expired ? 'EXPIRED NOTICE' : 'SIGNAL ALERT'} ${payloadSummary}`,
        result.error,
      );
      return result;
    })();
    this.signalSendInFlight.set(signalId, pending);
    try {
      return await pending;
    } finally {
      if (this.signalSendInFlight.get(signalId) === pending) this.signalSendInFlight.delete(signalId);
    }
  }

  public getConfig(): {
    telegramConfigured: boolean;
    emailConfigured: boolean;
    telegramChatIdMasked?: string;
    notificationEmail?: string;
    smtpHost?: string;
  } {
    return {
      telegramConfigured: !!(this.config.telegramBotToken && this.config.telegramChatId),
      emailConfigured: !!(this.config.smtpUser && this.config.smtpPass),
      telegramChatIdMasked: this.config.telegramChatId
        ? `***${this.config.telegramChatId.slice(-4)}`
        : undefined,
      notificationEmail: this.config.notificationEmail,
      smtpHost: this.config.smtpHost,
    };
  }

  public setTelegramChatId(chatId: string): void {
    const cleanId = String(chatId).trim();
    this.config.telegramChatId = cleanId;
    this.config.telegramEnabled = Boolean(this.config.telegramBotToken && cleanId);
    try {
      const saved = durableStorage.loadAppSettings();
      durableStorage.saveAppSettings({
        ...saved,
        telegramChatId: cleanId,
      });
    } catch (err) {
      console.error('[NotificationService] Failed to persist chat ID:', err);
    }
  }

  public getRawChatId(): string | undefined {
    return this.config.telegramChatId;
  }

  public isTelegramEnabled(): boolean {
    return Boolean(this.config.telegramBotToken && this.config.telegramChatId);
  }

  public isBotTokenConfigured(): boolean {
    return Boolean(this.config.telegramBotToken);
  }

  /** Verify bot credentials with getMe; this never sends a chat message. */
  public async verifyTelegramConnection(): Promise<boolean> {
    if (!this.config.telegramBotToken) return false;
    return (await this.requestTelegram('getMe', {})).ok;
  }

  public updateConfig(newConfig: Partial<NotificationConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.initMailTransporter();
  }

  /**
   * Securely queries Telegram Bot API getUpdates to detect recent messages
   * (e.g., user sending /start) and extracts Chat ID and sender metadata.
   * STRICT SECURITY BOUNDARY: Bot token is never exposed in results, logs, or error strings.
   */
  public async getLatestTelegramUpdate(): Promise<{
    success: boolean;
    configured: boolean;
    empty?: boolean;
    error?: string;
    update?: {
      updateId: number;
      chatId: string;
      chatType: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      text: string;
      date: number;
      dateFormattedUtc: string;
      dateFormattedBdt: string;
      isStartCommand: boolean;
    };
    recentUpdates?: Array<{
      updateId: number;
      chatId: string;
      username?: string;
      firstName?: string;
      text: string;
      dateFormattedUtc: string;
      dateFormattedBdt: string;
      isStartCommand: boolean;
    }>;
    activeChatId?: string;
    isChatIdActive?: boolean;
  }> {
    const botToken = this.config.telegramBotToken;
    if (!botToken) {
      return {
        success: false,
        configured: false,
        error: 'Telegram Bot Token is not configured in server environment (TELEGRAM_BOT_TOKEN).',
      };
    }

    const sanitize = (str: string): string => {
      if (!botToken || typeof str !== 'string') return str;
      return str.split(botToken).join('[REDACTED_BOT_TOKEN]');
    };

    try {
      const response = await this.requestTelegram('getUpdates', { limit: 25, allowed_updates: ['message'] });
      if (!response.ok) {
        if (response.status === 401 || response.errorCode === 401) {
          return {
            success: false,
            configured: true,
            error: 'Telegram Bot API returned 401 Unauthorized. The configured bot token is invalid or has been revoked.',
          };
        }
        return {
          success: false,
          configured: true,
          error: `Telegram API error (${response.status ?? 'request'}): ${sanitize(response.error || 'Request failed.')}`,
        };
      }

      const data: any = response.data;
      if (!data?.ok || !Array.isArray(data.result)) {
        return {
          success: false,
          configured: true,
          error: 'Unexpected Telegram API response structure.',
        };
      }

      if (data.result.length === 0) {
        return {
          success: false,
          configured: true,
          empty: true,
          error: 'No messages found in Telegram updates queue. Please send /start or any message to your bot in Telegram first, then try again.',
          activeChatId: this.config.telegramChatId,
        };
      }

      // Filter and map valid messages
      const parsedUpdates = data.result
        .map((up: any) => {
          const msg = up.message || up.edited_message || up.channel_post;
          if (!msg || !msg.chat) return null;

          const dateIso = msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString();
          const formatted = formatSignalTime(dateIso);
          const rawText = msg.text || '';

          return {
            updateId: up.update_id,
            chatId: String(msg.chat.id),
            chatType: msg.chat.type || 'private',
            username: msg.from?.username || msg.chat.username,
            firstName: msg.from?.first_name || msg.chat.first_name,
            lastName: msg.from?.last_name || msg.chat.last_name,
            text: rawText,
            date: msg.date || Math.floor(Date.now() / 1000),
            dateFormattedUtc: formatted.utcTime,
            dateFormattedBdt: formatted.bdtTime,
            isStartCommand: rawText.trim().toLowerCase().startsWith('/start'),
          };
        })
        .filter(Boolean);

      if (parsedUpdates.length === 0) {
        return {
          success: false,
          configured: true,
          empty: true,
          error: 'Updates were returned by Telegram, but none contained valid message or chat data.',
          activeChatId: this.config.telegramChatId,
        };
      }

      // Prefer the latest update
      const latest = parsedUpdates[parsedUpdates.length - 1];

      // Format last 5 recent updates
      const recentUpdates = parsedUpdates.slice(-5).map((u: any) => ({
        updateId: u.updateId,
        chatId: u.chatId,
        username: u.username,
        firstName: u.firstName,
        text: u.text,
        dateFormattedUtc: u.dateFormattedUtc,
        dateFormattedBdt: u.dateFormattedBdt,
        isStartCommand: u.isStartCommand,
      }));

      const isChatIdActive = Boolean(
        this.config.telegramChatId && this.config.telegramChatId === latest.chatId
      );

      return {
        success: true,
        configured: true,
        update: latest,
        recentUpdates,
        activeChatId: this.config.telegramChatId,
        isChatIdActive,
      };
    } catch (err: any) {
      return {
        success: false,
        configured: true,
        error: sanitize(err?.message || 'Failed to connect to Telegram API.'),
      };
    }
  }

  /** Processes owner-only payout commands with a durable Telegram update offset. */
  public async processOwnerTelegramCommands(): Promise<{ configured: boolean; processed: number; rejected: number; responses: string[]; error?: string }> {
    const botToken = this.config.telegramBotToken;
    const ownerChatId = this.config.telegramChatId;
    if (!botToken || !ownerChatId) return { configured: false, processed: 0, rejected: 0, responses: [], error: 'TELEGRAM_NOT_CONFIGURED' };
    const settings = durableStorage.loadAppSettings();
    const offset = Number(settings.telegramUpdateOffset || 0);
    try {
      const response = await this.requestTelegram('getUpdates', { offset, limit: 25, timeout: 0, allowed_updates: ['message'] });
      if (!response.ok) return { configured: true, processed: 0, rejected: 0, responses: [], error: response.status ? `TELEGRAM_HTTP_${response.status}` : 'TELEGRAM_REQUEST_FAILED' };
      const payload: any = response.data;
      if (!payload?.ok || !Array.isArray(payload.result)) return { configured: true, processed: 0, rejected: 0, responses: [], error: 'TELEGRAM_INVALID_RESPONSE' };
      let processed = 0; let rejected = 0; const responses: string[] = []; let nextOffset = offset;
      for (const update of payload.result) {
        nextOffset = Math.max(nextOffset, Number(update.update_id || 0) + 1);
        const message = update.message;
        if (!message?.chat || typeof message.text !== 'string') continue;
        if (String(message.chat.id) !== ownerChatId) { rejected++; durableStorage.recordAuditEvent({ event_type: 'TELEGRAM_COMMAND_REJECTED', details: { reason: 'OWNER_CHAT_MISMATCH' } }); continue; }
        const result = await this.handleOwnerCommand(message.text);
        if (!result) continue;
        processed++; responses.push(result); await this.sendTelegramText(result);
        durableStorage.recordAuditEvent({ event_type: 'TELEGRAM_PAYOUT_COMMAND', details: { command: message.text.split(/\s+/)[0], outcome: result.startsWith('ERROR') ? 'REJECTED' : 'APPLIED' } });
      }
      // Re-read: commands above (e.g. /payout, /fav) persisted their own changes to the same settings file.
      durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), telegramUpdateOffset: nextOffset });
      return { configured: true, processed, rejected, responses };
    } catch { return { configured: true, processed: 0, rejected: 0, responses: [], error: 'TELEGRAM_REQUEST_FAILED' }; }
  }

  private async handleOwnerCommand(text: string): Promise<string | null> {
    const tokens = text.trim().split(/\s+/); const command = (tokens[0] || '').toLowerCase();
    if (command === '/payout') {
      const pair = tokens[1] || ''; if (!isSupportedPair(pair)) return 'ERROR UNSUPPORTED_SYMBOL: use a six-letter FX pair such as EURUSD.';
      if ((tokens[2] || '').toLowerCase() === 'clear') { payoutRegistry.clear(pair); return `Payout cleared for ${displayPair(pair)}. Status: PAYOUT_UNSET.`; }
      const pct = Number(tokens[2]); if (!Number.isFinite(pct) || pct < 1 || pct > 100) return 'ERROR INVALID_PAYOUT: use a number from 1 to 100.';
      const saved = payoutRegistry.set(pair, pct); return `Payout set for ${displayPair(pair)}: ${saved.pct}%. Status: ${saved.pct >= 85 ? 'ELIGIBLE' : 'PAYOUT_BELOW_MIN'}.`;
    }
    if (command === '/payouts') {
      const entries = Object.entries(payoutRegistry.all()); return entries.length ? entries.map(([pair, value]) => `${displayPair(pair)} ${value.pct}% (${value.setAt})`).join('\n') : 'No owner-set payouts. Use /payout EURUSD 87.';
    }
    if (command === '/favs') {
      return favoriteRegistry.all().map((item) => `${item.pair} — payout: ${item.payout === undefined ? 'UNSET' : `${item.payout}%`} — ${item.status}`).join('\n');
    }
    if (command === '/fav') {
      const action = (tokens[1] || '').toLowerCase(); const pair = tokens[2] || '';
      if (action !== 'add' && action !== 'remove') return 'ERROR INVALID_FAVORITE_COMMAND: use /fav add EURUSD or /fav remove EURUSD.';
      if (!isSupportedPair(pair)) return 'ERROR UNSUPPORTED_SYMBOL: use a six-letter FX pair.';
      const changed = action === 'add' ? favoriteRegistry.add(pair) : favoriteRegistry.remove(pair);
      return `${changed ? 'Favorite updated' : 'Favorite unchanged'}: ${displayPair(pair)} (${action}).`;
    }
    if (command === '/scan') {
      const pair = tokens[1] || ''; if (!isSupportedPair(pair)) return 'ERROR UNSUPPORTED_SYMBOL: use EURUSD or EUR/USD.';
      if (!this.scanService) return 'NO_TRADE: SCAN_SERVICE_NOT_WIRED.';
      const tf = (tokens[2] || this.scanLoop?.state().timeframe || process.env.TELEGRAM_SCAN_TIMEFRAME || '15m') as ScanTimeframe;
      if (!SCAN_TIMEFRAMES.includes(tf)) return 'ERROR UNSUPPORTED_TIMEFRAME: use 5m, 15m or 30m.';
      return this.formatScanResult(await this.scanService.scanPair(pair, tf, 'MANUAL'));
    }
    if (command === '/result') {
      if (!this.scanService) return 'ERROR SCAN_SERVICE_NOT_WIRED.';
      if (!tokens[1] || !tokens[2]) return 'ERROR INVALID_RESULT: use /result <signal_id> win|loss|tie [broker_close].';
      const close = tokens[3] === undefined ? undefined : Number(tokens[3]);
      if (tokens[3] !== undefined && !Number.isFinite(close)) return 'ERROR INVALID_BROKER_CLOSE_PRICE.';
      return this.scanService.recordManualResult(tokens[1], tokens[2], close);
    }
    if (command === '/taken') {
      if (!this.scanService || !tokens[1] || !tokens[2]) return 'ERROR INVALID_TAKEN: use /taken <signal_id> <broker_price>.';
      const price = Number(tokens[2]); if (!Number.isFinite(price)) return 'ERROR INVALID_BROKER_ENTRY_PRICE.';
      return this.scanService.recordManualTaken(tokens[1], price);
    }
    if (command === '/brokertime') {
      const requested = tokens[1];
      let offsetMinutes = brokerOffsetMinutes();
      if (requested) {
        if (!/^\d{2}:\d{2}:\d{2}$/.test(requested)) return 'ERROR INVALID_BROKER_TIME: use /brokertime HH:MM:SS.';
        const [hours, minutes, seconds] = requested.split(':').map(Number);
        if (hours > 23 || minutes > 59 || seconds > 59) return 'ERROR INVALID_BROKER_TIME: use /brokertime HH:MM:SS.';
        const now = new Date(this.now());
        const utcSeconds = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
        let delta = hours * 3600 + minutes * 60 + seconds - utcSeconds;
        while (delta <= -43_200) delta += 86_400;
        while (delta > 43_200) delta -= 86_400;
        if (delta % 60 !== 0) return 'ERROR INVALID_BROKER_TIME: broker offset must resolve to whole minutes.';
        offsetMinutes = delta / 60;
        if (offsetMinutes < -720 || offsetMinutes > 840) return 'ERROR INVALID_BROKER_TIME: resolved offset is outside -12:00 to +14:00.';
        durableStorage.saveAppSettings({ ...durableStorage.loadAppSettings(), brokerUtcOffsetMinutes: offsetMinutes });
      }
      const time = new Date(this.now() + offsetMinutes * 60_000).toISOString().slice(11, 19);
      return `Broker time ${time} (${offsetLabel(offsetMinutes)})${requested ? ' saved.' : '.'}`;
    }
    if (command === '/health') return this.buildHealthText();
    if (command === '/mute') {
      const value = (tokens[1] || '').toLowerCase();
      if (value === 'off') {
        experimentTracker.setAlertsMuteForMinutes(null);
        if (this.scanService?.ledger) this.scanService.ledger.append('OPERATOR_ACTION', { action: 'RESUMED_OPERATOR' });
        return 'Alerts enabled. Signals continue to be recorded in the ledger.';
      }
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) return 'ERROR INVALID_MUTE: use /mute <minutes> or /mute off.';
      experimentTracker.setAlertsMuteForMinutes(minutes);
      if (this.scanService?.ledger) this.scanService.ledger.append('OPERATOR_ACTION', { action: 'SUPPRESSED_OPERATOR', duration_minutes: minutes });
      return `Alerts muted for ${minutes} minute(s). Signals continue to be recorded in the ledger.`;
    }
    if (command === '/resume') {
      if (!this.scanService) return 'ERROR SCAN_SERVICE_NOT_WIRED.';
      return this.scanService.edge.resume(tokens.slice(1).join(' ')).message;
    }
    if (command === '/report') {
      if (!this.scanService) return 'ERROR SCAN_SERVICE_NOT_WIRED.';
      const weekly = (tokens[1] || '').toLowerCase() === 'weekly';
      const since = Date.now() - (weekly ? 7 : 1) * 86_400_000;
      return `${formatLedgerReport(weekly ? 'WEEKLY REPORT' : 'DAILY REPORT', buildLedgerReport(this.scanService.ledger.signals(), since))}\n\n[PR-9 Shadow Variant Stats]\nVariant A/B distribution, Wilson Score, and SPRT status are tracked per MFCI bucket.\n${validationSummary}`;
    }
    if (command === '/autoscan') {
      if (!this.scanLoop) return 'ERROR SCAN_LOOP_NOT_WIRED.';
      const action = (tokens[1] || '').toLowerCase(); const tf = tokens[2] as ScanTimeframe | undefined;
      if (action !== 'on' && action !== 'off') return 'ERROR INVALID_AUTOSCAN: use /autoscan on [5m|15m|30m] or /autoscan off.';
      if (tf && !SCAN_TIMEFRAMES.includes(tf)) return 'ERROR UNSUPPORTED_TIMEFRAME: use 5m, 15m or 30m.';
      this.scanLoop.setEnabled(action === 'on', tf);
      if (action === 'on') this.scanLoop.start(); else this.scanLoop.stop();
      const state = this.scanLoop.state();
      return `Auto-scan ${state.enabled ? 'ON' : 'OFF'} (${state.timeframe}).`;
    }
    return null;
  }

  public async sendTelegramText(text: string): Promise<boolean> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) return false;
    const response = await this.requestTelegram('sendMessage', { chat_id: this.config.telegramChatId, text });
    const token = this.config.telegramBotToken;
    durableStorage.recordNotification({
      setup_id: `TELEGRAM-TEXT-${this.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'SYSTEM_ALERT',
      channel: 'TELEGRAM',
      recipient: 'OWNER_CHAT',
      status: response.ok ? 'SENT' : 'FAILED',
      ...(response.error ? { error_message: response.error } : {}),
      payload_summary: text.slice(0, 160).split(token).join('[REDACTED_BOT_TOKEN]'),
    });
    return response.ok;
  }

  /** Emits one owner alert per provider credential incident until the process restarts. */
  public async notifyCredentialInvalid(provider: string): Promise<boolean> {
    if (this.credentialAlertsSent.has(provider)) return false;
    this.credentialAlertsSent.add(provider);
    return this.sendTelegramText(`CREDENTIAL_INVALID — ${provider} credentials were rejected. Scans are fail-closed; update the server-side key before retrying.`);
  }

  /**
   * Formats Message #1: VALID SIGNAL ALERT payload (RDP Strategy V3.0 (Frozen) Specification Section 35)
   */
  public formatSignalAlert(telemetry: MasterTelemetry, extra: { signalId?: string; validUntil?: string; signalPrice?: number; quotePrice?: number; quoteTs?: string; priceTolerance?: number } = {}): string {
    const v3 = telemetry.decision_engine_v3;
    const binarySignal = v3?.binarySignal || 'NO_TRADE';
    const pair = telemetry.metadata?.pair || telemetry.metadata?.asset || 'UNAVAILABLE';
    const tf = telemetry.market_context?.selected_timeframe || 'UNAVAILABLE';
    const signalTs = telemetry.metadata?.signal_candle_open_ts || telemetry.metadata?.signal_timestamp_utc;
    const time = signalTs ? formatSignalTime(signalTs) : undefined;
    const brokerOffset = brokerOffsetMinutes();
    const validUntil = extra.validUntil ? formatSignalTime(extra.validUntil) : undefined;
    const payout = telemetry.metadata?.payout_pct;
    const gateLine = (v3?.gates || []).map((gate: any) => `G${gate.gateNumber} ${gate.status}`).join(' | ');
    return [
      `COMVISION RESEARCH ALERT — ${binarySignal}`,
      `Research alert only — no broker execution.`,
      ``,
      `Pair: ${pair} | Timeframe: ${tf} | Expiry: ${tf}`,
      `HTF (1h) bias: ${telemetry.metadata?.htf_bias || 'UNAVAILABLE'}`,
      `Signal candle open: ${time ? `${time.utcTime} UTC / ${time.bdtTime} BDT` : 'UNAVAILABLE'}`,
      extra.signalId ? `Signal ID: ${extra.signalId}` : '',
      validUntil ? `Enter by: ${validUntil.utcTime} UTC / ${validUntil.bdtTime} BDT / ${formatOffsetTime(extra.validUntil!, brokerOffset)} Broker (${offsetLabel(brokerOffset)}, display only)` : '',
      extra.signalPrice !== undefined ? `Signal price: ${extra.signalPrice}` : '',
      extra.quotePrice !== undefined ? `Quote: ${extra.quotePrice} (${extra.quoteTs || 'timestamp unavailable'})` : 'Quote: QUOTE_UNAVAILABLE',
      extra.priceTolerance !== undefined && extra.signalPrice !== undefined ? `${binarySignal}: do not enter if broker price is ${binarySignal === 'CALL' ? 'above' : 'below'} ${extra.signalPrice} by more than ${tolerancePips(pair, extra.priceTolerance)} pips (${extra.priceTolerance})` : '',
      `Payout: ${payout === undefined ? 'UNSET' : `${payout}% (breakeven ${(100 / (1 + payout / 100)).toFixed(1)}%)`}`,
      `MFCI (confluence score, not probability): ${v3 ? v3.mfci.totalMfci.toFixed(3) : 'UNAVAILABLE'} (${v3?.mfciBand || 'UNAVAILABLE'}) | Mode: ${v3?.engineMode || telemetry.metadata?.engine_mode || 'UNAVAILABLE'}`,
      `Gates: ${gateLine || 'UNAVAILABLE'}`,
      `Session: ${telemetry.market_context?.session || 'UNKNOWN'} | Kill zone: ${telemetry.market_context?.kill_zone || 'UNKNOWN'}`,
      binarySignal !== 'NO_TRADE' ? 'NEWS: NOT CHECKED (manual)' : '',
      `Provider: ${telemetry.metadata?.provider || 'UNAVAILABLE'} | Provenance: ${telemetry.metadata?.data_provenance || 'UNAVAILABLE'}`,
      `Reason: ${alertReason(v3?.statusReason || telemetry.metadata?.status_reason || telemetry.system_execution.rejection_reason || 'NO_QUALIFYING_SETUP')}`,
      `Strategy: decision_engine_v3 | ${telemetry.metadata?.experiment_id || 'UNAVAILABLE'} | Setup ${telemetry.metadata?.setup_id || 'UNAVAILABLE'}`,
    ].filter((line) => line !== '').join('\n');
  }

  /**
   * Formats Message #2: NEXT-CANDLE RESULT ALERT payload (RDP Strategy V3.0 (Frozen) Specification Section 36)
   */
  public formatResultAlert(telemetry: MasterTelemetry, outcome: any): string {
    const timeSig = formatSignalTime(telemetry.metadata?.signal_timestamp_utc || telemetry.metadata?.timestamp_utc);
    const timeRes = formatSignalTime(outcome?.timestamp || new Date().toISOString());

    const rawOutcome = outcome?.outcome || outcome?.signal_outcome || 'NEXT_CANDLE_FAVORABLE';
    let obsOutcome = rawOutcome;
    if (rawOutcome === 'WIN') obsOutcome = 'NEXT_CANDLE_FAVORABLE';
    else if (rawOutcome === 'LOSS') obsOutcome = 'NEXT_CANDLE_UNFAVORABLE';
    else if (rawOutcome === 'UNRESOLVED') obsOutcome = 'NEXT_CANDLE_INCONCLUSIVE';

    const userAction = outcome?.userAction || outcome?.user_recorded_action || 'NOT_RECORDED';
    const provider = telemetry.provider_provenance?.provider || 'TWELVE_DATA';

    return [
      `🔎 COMVISION NEXT-CANDLE RESULT ALERT`,
      ``,
      `Setup: ${outcome?.setup_id || telemetry.metadata?.setup_id}`,
      `Strategy: decision_engine_v3 (${telemetry.metadata?.experiment_id || 'UNAVAILABLE'})`,
      ``,
      `Next Candle Observation:`,
      `${obsOutcome} (${rawOutcome})`,
      ``,
      `User Action (Discretionary):`,
      `${userAction}`,
      ``,
      `Provider:`,
      `${provider}`,
      ``,
      `Observed Candlestick:`,
      `Close: ${outcome?.nextCandleClose || outcome?.next_candle?.close} (Open: ${outcome?.nextCandleOpen || outcome?.next_candle?.open})`,
      ``,
      `Timestamps:`,
      `Signal (UTC): ${timeSig.utcTime}`,
      `Result (UTC): ${timeRes.utcTime}`,
      `BDT (Asia/Dhaka): ${timeRes.bdtTime}`,
      ``,
      `RESEARCH RECORD:`,
      `Stored (research_observation != financial_trade_outcome)`,
      ``,
      `⚠️ Historical research record. Does not represent trading profit or loss.`,
    ].join('\n');
  }

  /**
   * Dispatches Message #1: VALID SIGNAL ALERT
   */
  public async dispatchSignalAlert(telemetry: MasterTelemetry, extra: { signalId?: string; validUntil?: string; signalPrice?: number; quotePrice?: number; quoteTs?: string; priceTolerance?: number } = {}): Promise<{
    telegram: 'SENT' | 'FAILED' | 'DISABLED';
    email: 'SENT' | 'FAILED' | 'DISABLED';
  }> {
    const setupId = telemetry.metadata.setup_id;
    const signalId = extra.signalId || setupId;
    const pair = telemetry.metadata.pair || telemetry.metadata.asset || 'EUR/USD';
    const bias = telemetry.market_context.local_bias;
    const messageText = this.formatSignalAlert(telemetry, extra);

    let telegramStatus: 'SENT' | 'FAILED' | 'DISABLED' = 'DISABLED';
    let emailStatus: 'SENT' | 'FAILED' | 'DISABLED' = 'DISABLED';
    let emailError: string | undefined;

    // 1. Telegram
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      const telegramResult = await this.sendSignalTelegram(
        signalId,
        { chat_id: this.config.telegramChatId, text: messageText },
        { validUntil: extra.validUntil, expiredText: `SIGNAL EXPIRED — do not enter (${signalId})` },
        `${pair} ${bias} ${signalId}`,
      );
      telegramStatus = telegramResult.ok ? 'SENT' : 'FAILED';
    } else {
      durableStorage.recordNotification({
        setup_id: signalId,
        type: 'SIGNAL_ALERT',
        channel: 'TELEGRAM',
        recipient: 'NOT_CONFIGURED',
        status: 'DISABLED',
        payload_summary: `${pair} ${bias} ${signalId}`,
      });
    }

    // 2. Email
    if (this.mailTransporter && this.config.notificationEmail) {
      try {
        await this.sendMailWithTimeout({
          from: `"ComVision Research Engine" <${this.config.smtpUser}>`,
          to: this.config.notificationEmail,
          subject: `[COMVISION SIGNAL] ${pair} ${bias} (${setupId})`,
          text: messageText,
        });
        emailStatus = 'SENT';
      } catch (err) {
        console.error('[NotificationService] Email delivery failure:', err);
        emailStatus = 'FAILED';
        emailError = err instanceof Error ? err.message : String(err);
      }
    }

    durableStorage.recordNotification({
      setup_id: setupId,
      type: 'SIGNAL_ALERT',
      channel: 'EMAIL',
      recipient: this.config.notificationEmail || 'NOT_CONFIGURED',
      status: emailStatus,
      ...(emailError ? { error_message: emailError } : {}),
      payload_summary: `${pair} ${bias} ${setupId}`,
    });

    return { telegram: telegramStatus, email: emailStatus };
  }

  /**
   * Dispatches Message #2: NEXT-CANDLE RESEARCH RESULT
   */
  public async dispatchResultAlert(outcome: SignalOutcomeRecord): Promise<{
    telegram: 'SENT' | 'FAILED' | 'DISABLED';
    email: 'SENT' | 'FAILED' | 'DISABLED';
  }> {
    const timeSig = formatSignalTime(outcome.signal_timestamp_utc);
    const timeRes = formatSignalTime(outcome.result_timestamp_utc);

    const messageText = [
      `📊 COMVISION — NEXT-CANDLE SIGNAL RESULT`,
      ``,
      `Pair: ${outcome.pair}`,
      `Bias: ${outcome.bias}`,
      `Timeframe: ${outcome.timeframe}`,
      ``,
      `Signal Time:`,
      `UTC: ${timeSig.utcTime}`,
      `Bangladesh (Asia/Dhaka): ${timeSig.bdtTime}`,
      ``,
      `Next-Candle Result:`,
      `Outcome: ${outcome.signal_outcome || outcome.outcome || 'UNRESOLVED'}`,
      `Next Candle Close: ${outcome.next_candle?.close ?? outcome.nextCandleClose ?? 'N/A'} (Open: ${outcome.next_candle?.open ?? outcome.nextCandleOpen ?? 'N/A'})`,
      ``,
      `Operator Action:`,
      `User Action: ${outcome.user_recorded_action}`,
      ``,
      `Result Time:`,
      `UTC: ${timeRes.utcTime}`,
      `Bangladesh (Asia/Dhaka): ${timeRes.bdtTime}`,
      ``,
      `Research Record: ${outcome.setup_id}`,
      ``,
      `⚠️ This is a historical research result. It does not represent an executed trade.`,
    ].join('\n');

    let telegramStatus: 'SENT' | 'FAILED' | 'DISABLED' = 'DISABLED';
    let emailStatus: 'SENT' | 'FAILED' | 'DISABLED' = 'DISABLED';
    let telegramError: string | undefined;
    let emailError: string | undefined;

    // 1. Telegram
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      const telegramResult = await this.requestTelegram('sendMessage', {
        chat_id: this.config.telegramChatId,
        text: messageText,
      });
      telegramStatus = telegramResult.ok ? 'SENT' : 'FAILED';
      telegramError = telegramResult.error;
    }

    // 2. Email
    if (this.mailTransporter && this.config.notificationEmail) {
      try {
        await this.sendMailWithTimeout({
          from: `"ComVision Research Engine" <${this.config.smtpUser}>`,
          to: this.config.notificationEmail,
          subject: `[COMVISION RESULT] ${outcome.pair} ${outcome.signal_outcome} (${outcome.setup_id})`,
          text: messageText,
        });
        emailStatus = 'SENT';
      } catch (err) {
        emailStatus = 'FAILED';
        emailError = err instanceof Error ? err.message : String(err);
      }
    }

    durableStorage.recordNotification({
      setup_id: outcome.setup_id,
      type: 'RESULT_ALERT',
      channel: 'TELEGRAM',
      recipient: this.config.telegramChatId ? 'OWNER_CHAT' : 'NOT_CONFIGURED',
      status: telegramStatus,
      ...(telegramError ? { error_message: telegramError } : {}),
      payload_summary: `${outcome.pair} Result: ${outcome.signal_outcome} (${outcome.setup_id})`,
    });

    durableStorage.recordNotification({
      setup_id: outcome.setup_id,
      type: 'RESULT_ALERT',
      channel: 'EMAIL',
      recipient: this.config.notificationEmail || 'NOT_CONFIGURED',
      status: emailStatus,
      ...(emailError ? { error_message: emailError } : {}),
      payload_summary: `${outcome.pair} Result: ${outcome.signal_outcome} (${outcome.setup_id})`,
    });

    return { telegram: telegramStatus, email: emailStatus };
  }

  /**
   * Dispatches a manual test notification
   */
  public async sendTestNotification(): Promise<{
    telegram: { status: 'SENT' | 'FAILED' | 'DISABLED'; detail?: string };
    email: { status: 'SENT' | 'FAILED' | 'DISABLED'; detail?: string };
  }> {
    const timeData = formatSignalTime(new Date().toISOString());
    const testText = [
      `🧪 COMVISION — NOTIFICATION TEST MESSAGE`,
      ``,
      `System: ComVision Strategy v1.0 Research Engine`,
      `Test Time: ${timeData.dualDisplay}`,
      `Status: Channel delivery validation active`,
      ``,
      `This confirms Telegram / Email notification routing is operational.`,
    ].join('\n');

    let tgResult: { status: 'SENT' | 'FAILED' | 'DISABLED'; detail?: string } = {
      status: 'DISABLED',
      detail: 'Telegram Bot Token or Chat ID not configured in environment.',
    };

    if (this.config.telegramBotToken && this.config.telegramChatId) {
      const telegramResult = await this.requestTelegram('sendMessage', {
        chat_id: this.config.telegramChatId,
        text: testText,
      });
      tgResult = telegramResult.ok
        ? { status: 'SENT', detail: 'Test message delivered to Telegram.' }
        : { status: 'FAILED', detail: `Telegram API error: ${telegramResult.error || 'request failed'}` };
      durableStorage.recordNotification({
        setup_id: 'TEST-NOTIFICATION',
        type: 'SYSTEM_ALERT',
        channel: 'TELEGRAM',
        recipient: 'OWNER_CHAT',
        status: tgResult.status,
        ...(telegramResult.error ? { error_message: telegramResult.error } : {}),
        payload_summary: 'Manual notification test',
      });
    }

    let emailResult: { status: 'SENT' | 'FAILED' | 'DISABLED'; detail?: string } = {
      status: 'DISABLED',
      detail: 'SMTP credentials or notification email not configured in environment.',
    };

    if (this.mailTransporter && this.config.notificationEmail) {
      try {
        await this.sendMailWithTimeout({
          from: `"ComVision Research Engine" <${this.config.smtpUser}>`,
          to: this.config.notificationEmail,
          subject: `[COMVISION TEST] Notification Channel Verified`,
          text: testText,
        });
        emailResult = { status: 'SENT', detail: `Test email sent to ${this.config.notificationEmail}.` };
      } catch (err: any) {
        emailResult = { status: 'FAILED', detail: err.message };
      }
    }

    return {
      success: tgResult.status !== 'FAILED' && emailResult.status !== 'FAILED',
      details: [tgResult, emailResult],
      telegram: tgResult,
      email: emailResult,
    } as any;
  }

  /**
   * Dispatches a direct Telegram test alert specifically to test and verify the Telegram Bot integration.
   * Provides immediate granular feedback (messageId, status, timestamps, sanitized errors).
   * STRICT SECURITY BOUNDARY: Bot token is never returned or leaked.
   */
  public async sendTelegramTestAlert(): Promise<{
    success: boolean;
    status: 'SENT' | 'FAILED' | 'DISABLED';
    chatId?: string;
    messageId?: number;
    detail: string;
    timestampUtc: string;
    timestampBdt: string;
  }> {
    const timeData = formatSignalTime(new Date().toISOString());
    const botToken = this.config.telegramBotToken;
    const chatId = this.config.telegramChatId;

    const sanitize = (str: string): string => {
      if (!botToken || typeof str !== 'string') return str;
      return str.split(botToken).join('[REDACTED_BOT_TOKEN]');
    };

    if (!botToken) {
      return {
        success: false,
        status: 'DISABLED',
        detail: 'Telegram Bot Token is not configured on the server (TELEGRAM_BOT_TOKEN missing).',
        timestampUtc: timeData.utcTime,
        timestampBdt: timeData.bdtTime,
      };
    }

    if (!chatId) {
      return {
        success: false,
        status: 'DISABLED',
        detail: 'No Telegram Chat ID is configured. Please link a Chat ID to receive research alerts.',
        timestampUtc: timeData.utcTime,
        timestampBdt: timeData.bdtTime,
      };
    }

    const testText = [
      `🧪 COMVISION — TELEGRAM INTEGRATION TEST`,
      ``,
      `System: ComVision Strategy v1.0 Research Engine`,
      `Target Chat ID: ${escapeHtml(chatId)}`,
      `Verification: Real-time Channel Operational`,
      ``,
      `Timestamp:`,
      `UTC: ${timeData.utcTime}`,
      `Bangladesh (Asia/Dhaka): ${timeData.bdtTime}`,
      ``,
      `✅ Telegram Bot integration verified successfully. Signal & Result alerts will dispatch to this chat.`,
    ].join('\n');

    const telegramResult = await this.requestTelegram('sendMessage', { chat_id: chatId, text: testText });
    const messageId = telegramResult.messageId;
    const detail = telegramResult.ok
      ? `Test alert successfully delivered to Telegram chat ${chatId}!`
      : `Telegram delivery error: ${sanitize(telegramResult.error || 'request failed')}`;
    durableStorage.recordNotification({
      setup_id: 'TEST-TELEGRAM',
      type: 'SYSTEM_ALERT',
      channel: 'TELEGRAM',
      recipient: 'OWNER_CHAT',
      status: telegramResult.ok ? 'SENT' : 'FAILED',
      ...(telegramResult.error ? { error_message: sanitize(telegramResult.error) } : {}),
      payload_summary: telegramResult.ok
        ? `Telegram Bot Test Alert verified (Message ID: ${messageId || 'N/A'})`
        : `Telegram Bot Test Alert failed: ${sanitize(telegramResult.error || 'request failed')}`,
    });
    return {
      success: telegramResult.ok,
      status: telegramResult.ok ? 'SENT' : 'FAILED',
      chatId,
      messageId,
      detail,
      timestampUtc: timeData.utcTime,
      timestampBdt: timeData.bdtTime,
    };
  }

  public async notifyStorageLimitWarning(currentBytes: number, limitBytes: number): Promise<boolean> {
    const currentMB = Math.round(currentBytes / (1024 * 1024));
    const limitMB = Math.round(limitBytes / (1024 * 1024));
    const text = `⚠️ STORAGE LIMIT WARNING\n\nData directory has exceeded ${limitMB}MB (current: ${currentMB}MB).\n\n• Scan summary writes are paused to prevent disk overflow.\n• Signal recording continues normally.\n• Please review and clean up old data or expand storage.\n\nTimestamp: ${new Date().toISOString()}`;
    try {
      await this.requestTelegram('sendMessage', { chat_id: this.config.telegramChatId, text });
      return true;
    } catch (error) {
      console.error('[NotificationService] Failed to send storage limit warning:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
