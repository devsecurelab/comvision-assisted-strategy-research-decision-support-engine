// Research Signal & Outcome Notification Dispatcher
// Dispatches informational manual research alerts to Telegram and Email.
// STRICT NON-EXECUTION BOUNDARY: Informational decision-support only. No trade execution.

import nodemailer from 'nodemailer';
import { MasterTelemetry } from '../engine/types';
import { durableStorage, NotificationRecord, SignalOutcomeRecord } from './storage';
import { formatSignalTime } from '../utils/timeFormat';

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

  /**
   * Formats Message #1: VALID SIGNAL ALERT payload (Strategy v2.0-FROZEN Specification Section 35)
   */
  public formatSignalAlert(telemetry: MasterTelemetry): string {
    const setupId = telemetry.metadata?.setup_id || 'UNKNOWN';
    const asset = telemetry.metadata?.pair || telemetry.metadata?.asset || 'EUR/USD';
    const tf = telemetry.market_context?.selected_timeframe || '5m';
    const bias = telemetry.market_context?.local_bias || 'BULLISH';
    const timeData = formatSignalTime(telemetry.metadata?.signal_timestamp_utc || telemetry.metadata?.timestamp_utc);

    const bosInfo = telemetry.validation_metrics?.bos?.bos_detected
      ? `${telemetry.validation_metrics.bos.bos_direction} BOS`
      : 'Structural Continuity';
    const chochInfo = telemetry.validation_metrics?.choch?.choch_status || 'NO_CHoCH';
    const fvgInfo = telemetry.validation_metrics?.fvg?.fvg_status === 'PASS' ? 'Confirmed' : 'None';
    const ifvgInfo = telemetry.validation_metrics?.ifvg?.ifvg_status === 'IFVG_CONFIRMED'
      ? `${telemetry.validation_metrics.ifvg.ifvg_direction} IFVG`
      : 'None';
    const bprInfo = telemetry.validation_metrics?.bpr?.bpr_status === 'BPR_CONFIRMED' ? 'Confirmed' : 'None';
    const obInfo = telemetry.validation_metrics?.order_block?.ob_detected ? 'Valid' : 'None';
    const breakerInfo = telemetry.validation_metrics?.breaker_block?.breaker_status === 'BREAKER_CONFIRMED'
      ? `${telemetry.validation_metrics.breaker_block.breaker_direction} Breaker`
      : 'None';

    const targetContext = telemetry.validation_metrics?.bsl_ssl?.selected_liquidity_target || 'BSL';
    const momentumInfo = telemetry.validation_metrics?.momentum?.momentum_state || 'Aligned';
    const wickStatus = telemetry.validation_metrics?.wick_check?.status || 'PASS';
    const oteStatus = telemetry.validation_metrics?.ote?.zone_status || 'INSIDE_OTE';
    const session = telemetry.market_context?.session || 'London';
    const killZone = telemetry.market_context?.kill_zone === 'INSIDE_KILL_ZONE' ? 'ACTIVE' : 'OUTSIDE';

    const newsStatus = telemetry.guardrails?.news_guard?.news_window_state === 'CLEAR' ? 'CLEAR' : 'GUARD_ACTIVE';
    const visionStatus = telemetry.vision_verification?.verification_status || 'PASS';

    return [
      `🟢 COMVISION RESEARCH ALERT — VALID SIGNAL DETECTED`,
      ``,
      `Strategy: v2.0-FROZEN (EXP-2026-V2-001)`,
      `Asset: ${asset}`,
      `Timeframe: ${tf}`,
      `Bias: ${bias}`,
      ``,
      `--- STAGE RESULTS ---`,
      `Structure: ${bosInfo}`,
      `CHoCH: ${chochInfo}`,
      `FVG: ${fvgInfo}`,
      `IFVG: ${ifvgInfo}`,
      `BPR: ${bprInfo}`,
      `OB: ${obInfo}`,
      `Breaker: ${breakerInfo}`,
      ``,
      `BSL/SSL:`,
      `Target Context: ${targetContext}`,
      ``,
      `Momentum: ${momentumInfo}`,
      `Wick: ${wickStatus}`,
      `OTE: ${oteStatus}`,
      `Session: ${session}`,
      `Kill Zone: ${killZone}`,
      ``,
      `News Guard: ${newsStatus}`,
      `Vision Verification: ${visionStatus}`,
      ``,
      `Timestamp:`,
      `UTC: ${timeData.utcTime}`,
      `BDT (Asia/Dhaka): ${timeData.bdtTime}`,
      ``,
      `Decision: MANUAL_RESEARCH_ALERT`,
      `Setup Record: ${setupId}`,
      ``,
      `⚠️ MANUAL RESEARCH ALERT ONLY: Strictly non-execution decision-support alert.`,
    ].join('\n');
  }

  /**
   * Formats Message #2: NEXT-CANDLE RESULT ALERT payload (Strategy v2.0-FROZEN Specification Section 36)
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
      `Strategy: v2.0-FROZEN (EXP-2026-V2-001)`,
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
  public async dispatchSignalAlert(telemetry: MasterTelemetry): Promise<{
    telegram: 'SENT' | 'FAILED' | 'DISABLED';
    email: 'SENT' | 'FAILED' | 'DISABLED';
  }> {
    const setupId = telemetry.metadata.setup_id;
    const pair = telemetry.metadata.pair || telemetry.metadata.asset || 'EUR/USD';
    const bias = telemetry.market_context.local_bias;
    const messageText = this.formatSignalAlert(telemetry);

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
      recipient: this.config.telegramChatId || 'NOT_CONFIGURED',
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
      `Direction: ${outcome.resolution_direction || 'N/A'}`,
      `Authoritative Rule: ${outcome.resolution_rule || 'Backend OHLC resolver'}`,
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
      recipient: this.config.telegramChatId || 'NOT_CONFIGURED',
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
          recipient: chatId,
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
          recipient: chatId,
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
