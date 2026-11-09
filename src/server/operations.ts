import { utcInstantForLocal } from '../engine/session';
import type { SessionConfig } from '../engine/sessionConfig';
import { isFxMarketClosed } from '../engine/marketHours';
import { payoutStatusFor, type PayoutRecord, type OperationalPayoutStatus } from './payoutRegistry';
import type { ScanLoopState } from '../engine/scanScheduler';

export interface NextZoneStart { zone: 'LONDON' | 'NEW_YORK'; at: Date; countdownMs: number }

export function getNextZoneStart(nowMs: number, config: SessionConfig): NextZoneStart {
  const zones: Array<['LONDON' | 'NEW_YORK', SessionConfig['zones']['LONDON']]> = [
    ['LONDON', config.zones.LONDON],
    ['NEW_YORK', config.zones.NEW_YORK],
  ];
  const candidates: NextZoneStart[] = [];
  for (const [name, zone] of zones) {
    const [hour, minute] = zone.startLocal.split(':').map(Number);
    for (let day = 0; day <= 9; day++) {
      const reference = new Date(nowMs + day * 86_400_000);
      const at = utcInstantForLocal(reference, zone.timezone, hour, minute);
      if (at.getTime() > nowMs && !isFxMarketClosed(at)) {
        candidates.push({ zone: name, at, countdownMs: at.getTime() - nowMs });
        break;
      }
    }
  }
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!candidates[0]) throw new Error('NEXT_SESSION_ZONE_UNAVAILABLE');
  return candidates[0];
}

export interface OperationalStatusInput {
  nowMs: number;
  brokerOffsetMinutes: number;
  sessionConfig: SessionConfig;
  sessionConfigHash: string;
  configHash: string;
  engineFingerprint: string;
  session: { session: string; kill_zone: string; kill_zone_name?: string };
  market: { state: 'OPEN' | 'CLOSED'; reason: string };
  scanner: ScanLoopState;
  payouts: Record<string, PayoutRecord | undefined>;
  providerBudget: { remainingDay: number; remainingAuto: number };
}

const formatDateTime = (date: Date, timezone: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone: timezone, dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23',
}).format(date);

export function buildOperationalStatus(input: OperationalStatusInput) {
  const now = new Date(input.nowMs);
  const brokerOffsetMs = input.brokerOffsetMinutes * 60_000;
  const brokerDate = new Date(input.nowMs + brokerOffsetMs);
  const nextZone = getNextZoneStart(input.nowMs, input.sessionConfig);
  const payouts: Record<string, { pct?: number; source?: string; set_at?: string; age_hours: number | null; status: OperationalPayoutStatus }> = {};
  for (const [pair, record] of Object.entries(input.payouts)) {
    const rawAge = record ? (input.nowMs - Date.parse(record.setAt)) / 3_600_000 : null;
    const age = rawAge !== null && Number.isFinite(rawAge) && rawAge >= 0 ? rawAge : null;
    payouts[pair] = {
      ...(record ? { pct: record.pct, source: record.source, set_at: record.setAt } : {}),
      age_hours: age === null ? null : Math.max(0, Number(age.toFixed(2))),
      status: payoutStatusFor(record, input.nowMs),
    };
  }
  return {
    current_utc: now.toISOString(),
    current_bdt: formatDateTime(now, 'Asia/Dhaka'),
    broker: { display_time: formatDateTime(brokerDate, 'UTC'), offset_minutes: input.brokerOffsetMinutes },
    session: {
      current: input.session.session,
      kill_zone: input.session.kill_zone,
      zone_name: input.session.kill_zone_name ?? null,
      next_zone: nextZone.zone,
      next_zone_at_utc: nextZone.at.toISOString(),
      next_zone_at_bdt: formatDateTime(nextZone.at, 'Asia/Dhaka'),
      countdown_seconds: Math.ceil(nextZone.countdownMs / 1000),
    },
    scanner: {
      state: input.scanner.enabled ? 'active' : 'paused',
      timeframe: input.scanner.timeframe,
      last_run_at: input.scanner.lastRunAt ?? null,
      last_candle: input.scanner.lastCycleCandleOpen ?? null,
      last_error: input.scanner.lastError ?? null,
      last_summary: input.scanner.lastSummary ?? null,
    },
    payouts,
    provider_budget: {
      remaining_day: input.providerBudget.remainingDay,
      remaining_auto: input.providerBudget.remainingAuto,
    },
    market: input.market,
    identity: {
      config_hash: input.configHash,
      session_config_hash: input.sessionConfigHash,
      engine_fingerprint: input.engineFingerprint,
    },
  };
}

export function payoutReminderMessages(input: {
  nowMs: number;
  zone: 'LONDON' | 'NEW_YORK';
  localDate: string;
  payouts: Record<string, PayoutRecord | undefined>;
}): string[] {
  return Object.entries(input.payouts).sort(([a], [b]) => a.localeCompare(b)).map(([pair, record]) => {
    if (!record) return `PAYOUT REMINDER ${input.zone} ${input.localDate}: ${pair} payout is UNSET; reconfirm the current payout before scanning.`;
    const ageHours = (input.nowMs - Date.parse(record.setAt)) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours < 0) return `PAYOUT REMINDER ${input.zone} ${input.localDate}: ${pair} payout timestamp is INVALID/STALE; reconfirm before scanning.`;
    return `PAYOUT REMINDER ${input.zone} ${input.localDate}: ${pair} payout ${record.pct}% is ${ageHours.toFixed(1)}h old; reconfirm before scanning.`;
  });
}

export function detectScanGap(lastRunAt: string | undefined, nowMs: number, timeframe: string): { missedCandles: number; lastRunAt: string; detectedAt: string } | null {
  if (!lastRunAt) return null;
  const lastMs = Date.parse(lastRunAt);
  const durationMs = ({ '5m': 300_000, '15m': 900_000, '30m': 1_800_000 } as Record<string, number>)[timeframe];
  if (!Number.isFinite(lastMs) || !durationMs) return null;
  const elapsed = nowMs - lastMs;
  if (elapsed < durationMs * 2) return null;
  return { missedCandles: Math.max(1, Math.floor(elapsed / durationMs) - 1), lastRunAt, detectedAt: new Date(nowMs).toISOString() };
}

export function scanGapActionState(input: { key: string; recordedKey?: string; notifiedKey?: string }): { appendEvent: boolean; sendNotification: boolean } {
  return { appendEvent: input.recordedKey !== input.key, sendNotification: input.notifiedKey !== input.key };
}

export async function deliverPendingScanGapNotification(input: {
  key: string;
  notifiedKey?: string;
  message: string;
  send: (message: string) => Promise<boolean>;
  markNotified: () => Promise<void> | void;
}): Promise<boolean> {
  if (input.notifiedKey === input.key) return false;
  let delivered = false;
  try { delivered = await input.send(input.message); } catch { delivered = false; }
  if (delivered) await input.markNotified();
  return delivered;
}

/** Sends only a fixed health marker; refuses credentials, query strings and non-HTTPS destinations. */
export async function pingDeadManSwitch(urlValue: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const raw = String(urlValue ?? '').trim();
  if (!raw) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ status: 'ok' }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch { return false; }
}
