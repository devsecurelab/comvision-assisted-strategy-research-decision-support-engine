// Research Signal & Outcome Notification Dispatcher
// Dispatches informational manual research alerts to Telegram and Email.
// STRICT NON-EXECUTION BOUNDARY: Informational decision-support only. No trade execution.

import nodemailer from 'nodemailer';
import { MasterTelemetry } from '../engine/types';
import { durableStorage, NotificationRecord, SignalOutcomeRecord } from './storage';
import { formatSignalTime } from '../utils/timeFormat';
import { displayPair, isSupportedPair, payoutRegistry } from './payoutRegistry';
import { favoriteRegistry } from './favoriteRegistry';
import { feedManager } from '../engine/dataProviders';
import type { ScanLoop, ScanResult, ScanService, ScanTimeframe } from '../engine/scanScheduler';
import { SCAN_TIMEFRAMES } from '../engine/scanScheduler';
import { buildLedgerReport, formatLedgerReport } from '../engine/edgeMonitor';

function alertReason(reason: string): string {
  return reason.replace(/news[^.]*clear/gi, 'manual news review not performed')
    .replace(/no high-impact red-folder events[^.]*/gi, 'NEWS: NOT CHECKED (manual)');
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

export class NotificationService {
  private config: NotificationConfig;
  private mailTransporter: any = null;
  private scanService?: ScanService;
  private scanLoop?: ScanLoop;

  /** Wires the R9 scan service and loop so owner commands (/scan, /result, /health, /resume, /report, /autoscan) can use them. */
  public attachScanService(service: ScanService, loop: ScanLoop): void {
    this.scanService = service;
    this.scanLoop = loop;
  }

  public formatScanResult(result: ScanResult): string {
    const time = result.signal_candle_open_ts ? formatSignalTime(result.signal_candle_open_ts) : undefined;
    const v3 = result.telemetry?.decision_engine_v3;
    return [
      `${result.status} ${result.pair} ${result.timeframe}${result.cached ? ' (same candle, cached — no credit used)' : ''}`,
      `Reason: ${alertReason(result.reason)}`,
      `MFCI (confluence score, not probability): ${v3 ? `${v3.mfci.totalMfci.toFixed(3)} (${v3.mfciBand})` : 'UNAVAILABLE'} | Mode: ${v3?.engineMode ?? 'UNAVAILABLE'}`,
      result.status !== 'NO_TRADE' ? 'NEWS: NOT CHECKED (manual)' : '',
      `Signal candle: ${time ? `${time.utcTime} UTC / ${time.bdtTime} BDT` : 'UNAVAILABLE'}`,
      result.provider || result.htf_provider ? `Providers: LTF ${result.provider ?? 'UNAVAILABLE'} | HTF ${result.htf_provider ?? 'UNAVAILABLE'}` : '',
      result.signal_id ? `Signal ID: ${result.signal_id} | valid until ${result.valid_until}` : '',
      result.failover_reason ? `Provider failover: ${result.failover_reason}` : '',
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
      `Edge: ${edge ? (edge.paused ? `EDGE_LOST since ${edge.lostAt} — এখন ট্রেড নয় (${edge.reason})` : 'ACTIVE') : 'NOT_WIRED'}`,
    ].join('\n');
  }

  constructor() {
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
        this.mailTransporter = nodemailer.createTransport({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          secure: this.config.smtpPort === 465,
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
      // Query Telegram getUpdates
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?limit=25&allowed_updates=["message"]`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        if (res.status === 401) {
          return {
            success: false,
            configured: true,
            error: 'Telegram Bot API returned 401 Unauthorized. The configured bot token is invalid or has been revoked.',
          };
        }
        const errBody = await res.text();
        return {
          success: false,
          configured: true,
          error: `Telegram API error (${res.status}): ${sanitize(errBody)}`,
        };
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) {
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
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=25&timeout=0&allowed_updates=["message"]`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) return { configured: true, processed: 0, rejected: 0, responses: [], error: `TELEGRAM_HTTP_${response.status}` };
      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.result)) return { configured: true, processed: 0, rejected: 0, responses: [], error: 'TELEGRAM_INVALID_RESPONSE' };
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
      if (!tokens[1] || !tokens[2]) return 'ERROR INVALID_RESULT: use /result <signal_id> win|loss|tie|skipped.';
      return this.scanService.recordManualResult(tokens[1], tokens[2]);
    }
    if (command === '/health') return this.buildHealthText();
    if (command === '/resume') {
      if (!this.scanService) return 'ERROR SCAN_SERVICE_NOT_WIRED.';
      return this.scanService.edge.resume(tokens.slice(1).join(' ')).message;
    }
    if (command === '/report') {
      if (!this.scanService) return 'ERROR SCAN_SERVICE_NOT_WIRED.';
      const weekly = (tokens[1] || '').toLowerCase() === 'weekly';
      const since = Date.now() - (weekly ? 7 : 1) * 86_400_000;
      return formatLedgerReport(weekly ? 'WEEKLY REPORT' : 'DAILY REPORT', buildLedgerReport(this.scanService.ledger.signals(), since));
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

  public async sendTelegramText(text: string): Promise<void> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) return;
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: this.config.telegramChatId, text }) });
  }

  /**
   * Formats Message #1: VALID SIGNAL ALERT payload (RDP Strategy V3.0 (Frozen) Specification Section 35)
   */
  public formatSignalAlert(telemetry: MasterTelemetry, extra: { signalId?: string; validUntil?: string } = {}): string {
    const v3 = telemetry.decision_engine_v3;
    const binarySignal = v3?.binarySignal || 'NO_TRADE';
    const pair = telemetry.metadata?.pair || telemetry.metadata?.asset || 'UNAVAILABLE';
    const tf = telemetry.market_context?.selected_timeframe || 'UNAVAILABLE';
    const signalTs = telemetry.metadata?.signal_candle_open_ts || telemetry.metadata?.signal_timestamp_utc;
    const time = signalTs ? formatSignalTime(signalTs) : undefined;
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
      extra.validUntil ? `Valid until: ${extra.validUntil}` : '',
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
  public async dispatchSignalAlert(telemetry: MasterTelemetry, extra: { signalId?: string; validUntil?: string } = {}): Promise<{
    telegram: 'SENT' | 'FAILED' | 'DISABLED';
    email: 'SENT' | 'FAILED' | 'DISABLED';
  }> {
    const setupId = telemetry.metadata.setup_id;
    const pair = telemetry.metadata.pair || telemetry.metadata.asset || 'EUR/USD';
    const bias = telemetry.market_context.local_bias;
    const messageText = this.formatSignalAlert(telemetry, extra);

    let telegramStatus: 'SENT' | 'FAILED' | 'DISABLED' = 'DISABLED';
    let emailStatus: 'SENT' | 'FAILED' | 'DISABLED' = 'DISABLED';

    // 1. Telegram
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      try {
        const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.config.telegramChatId,
            text: messageText,
            parse_mode: 'HTML',
          }),
        });
        if (res.ok) {
          telegramStatus = 'SENT';
        } else {
          const errData = await res.text();
          console.error('[NotificationService] Telegram API error:', errData);
          telegramStatus = 'FAILED';
        }
      } catch (err: any) {
        console.error('[NotificationService] Telegram fetch failure:', err);
        telegramStatus = 'FAILED';
      }
    }

    // 2. Email
    if (this.mailTransporter && this.config.notificationEmail) {
      try {
        await this.mailTransporter.sendMail({
          from: `"ComVision Research Engine" <${this.config.smtpUser}>`,
          to: this.config.notificationEmail,
          subject: `[COMVISION SIGNAL] ${pair} ${bias} (${setupId})`,
          text: messageText,
        });
        emailStatus = 'SENT';
      } catch (err) {
        console.error('[NotificationService] Email delivery failure:', err);
        emailStatus = 'FAILED';
      }
    }

    // Log to durable storage
    durableStorage.recordNotification({
      setup_id: setupId,
      type: 'SIGNAL_ALERT',
      channel: 'TELEGRAM',
      recipient: this.config.telegramChatId ? 'OWNER_CHAT' : 'NOT_CONFIGURED',
      status: telegramStatus,
      payload_summary: `${pair} ${bias} ${setupId}`,
    });

    durableStorage.recordNotification({
      setup_id: setupId,
      type: 'SIGNAL_ALERT',
      channel: 'EMAIL',
      recipient: this.config.notificationEmail || 'NOT_CONFIGURED',
      status: emailStatus,
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

    // 1. Telegram
    if (this.config.telegramBotToken && this.config.telegramChatId) {
      try {
        const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.config.telegramChatId,
            text: messageText,
            parse_mode: 'HTML',
          }),
        });
        telegramStatus = res.ok ? 'SENT' : 'FAILED';
      } catch (err) {
        telegramStatus = 'FAILED';
      }
    }

    // 2. Email
    if (this.mailTransporter && this.config.notificationEmail) {
      try {
        await this.mailTransporter.sendMail({
          from: `"ComVision Research Engine" <${this.config.smtpUser}>`,
          to: this.config.notificationEmail,
          subject: `[COMVISION RESULT] ${outcome.pair} ${outcome.signal_outcome} (${outcome.setup_id})`,
          text: messageText,
        });
        emailStatus = 'SENT';
      } catch (err) {
        emailStatus = 'FAILED';
      }
    }

    durableStorage.recordNotification({
      setup_id: outcome.setup_id,
      type: 'RESULT_ALERT',
      channel: 'TELEGRAM',
      recipient: this.config.telegramChatId ? 'OWNER_CHAT' : 'NOT_CONFIGURED',
      status: telegramStatus,
      payload_summary: `${outcome.pair} Result: ${outcome.signal_outcome} (${outcome.setup_id})`,
    });

    durableStorage.recordNotification({
      setup_id: outcome.setup_id,
      type: 'RESULT_ALERT',
      channel: 'EMAIL',
      recipient: this.config.notificationEmail || 'NOT_CONFIGURED',
      status: emailStatus,
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
      try {
        const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.config.telegramChatId,
            text: testText,
          }),
        });
        if (res.ok) {
          tgResult = { status: 'SENT', detail: 'Test message delivered to Telegram.' };
        } else {
          const body = await res.text();
          tgResult = { status: 'FAILED', detail: `Telegram API error: ${body}` };
        }
      } catch (err: any) {
        tgResult = { status: 'FAILED', detail: err.message };
      }
    }

    let emailResult: { status: 'SENT' | 'FAILED' | 'DISABLED'; detail?: string } = {
      status: 'DISABLED',
      detail: 'SMTP credentials or notification email not configured in environment.',
    };

    if (this.mailTransporter && this.config.notificationEmail) {
      try {
        await this.mailTransporter.sendMail({
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
      `🧪 <b>COMVISION — TELEGRAM INTEGRATION TEST</b>`,
      ``,
      `<b>System:</b> ComVision Strategy v1.0 Research Engine`,
      `<b>Target Chat ID:</b> <code>${chatId}</code>`,
      `<b>Verification:</b> Real-time Channel Operational`,
      ``,
      `<b>Timestamp:</b>`,
      `UTC: <code>${timeData.utcTime}</code>`,
      `Bangladesh (Asia/Dhaka): <code>${timeData.bdtTime}</code>`,
      ``,
      `✅ <i>Telegram Bot integration verified successfully. Signal & Result alerts will dispatch to this chat.</i>`,
    ].join('\n');

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: testText,
          parse_mode: 'HTML',
        }),
      });

      if (res.ok) {
        const resData = await res.json();
        const messageId = resData.result?.message_id;

        durableStorage.recordNotification({
          setup_id: 'TEST-TELEGRAM',
          type: 'SIGNAL_ALERT',
          channel: 'TELEGRAM',
          recipient: 'OWNER_CHAT',
          status: 'SENT',
          payload_summary: `Telegram Bot Test Alert verified (Message ID: ${messageId || 'N/A'})`,
        });

        return {
          success: true,
          status: 'SENT',
          chatId,
          messageId,
          detail: `Test alert successfully delivered to Telegram chat ${chatId}!`,
          timestampUtc: timeData.utcTime,
          timestampBdt: timeData.bdtTime,
        };
      } else {
        const errRaw = await res.text();
        let errMsg = errRaw;
        try {
          const parsed = JSON.parse(errRaw);
          errMsg = parsed.description || errRaw;
        } catch {
          // fallback to raw text
        }

        durableStorage.recordNotification({
          setup_id: 'TEST-TELEGRAM',
          type: 'SIGNAL_ALERT',
          channel: 'TELEGRAM',
          recipient: 'OWNER_CHAT',
          status: 'FAILED',
          payload_summary: `Telegram Bot Test Alert failed: ${sanitize(errMsg)}`,
        });

        return {
          success: false,
          status: 'FAILED',
          chatId,
          detail: `Telegram delivery error: ${sanitize(errMsg)}`,
          timestampUtc: timeData.utcTime,
          timestampBdt: timeData.bdtTime,
        };
      }
    } catch (err: any) {
      const safeMsg = sanitize(err?.message || 'Network error reaching Telegram API.');
      return {
        success: false,
        status: 'FAILED',
        chatId,
        detail: `Network failure: ${safeMsg}`,
        timestampUtc: timeData.utcTime,
        timestampBdt: timeData.bdtTime,
      };
    }
  }
}

export const notificationService = new NotificationService();
