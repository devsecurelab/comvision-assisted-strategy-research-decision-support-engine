import fs from 'node:fs';
import { resolveRepositoryConfigPath } from './configPath';
import { canonicalJson } from '../utils/canonicalJson';
import { sha256 } from '../utils/sha256';
import { utcInstantForLocal } from './session';

export type SessionEntryRule = 'TRADE_WITHIN_ZONE' | 'OPEN_TS';
export type SessionTimeframe = '5m' | '15m' | '30m';
export type SessionZoneName = 'LONDON' | 'NEW_YORK';

export interface SessionZoneConfig {
  timezone: string;
  startLocal: string;
  endLocal: string;
}

export interface SessionConfig {
  version: string;
  entryRule: SessionEntryRule;
  startMarginMinutes: number;
  endMarginMinutes: number;
  expiryMinutes: Record<SessionTimeframe, number>;
  coreSession: { startZone: SessionZoneName; startLocal: string; endZone: SessionZoneName; endLocal: string };
  zones: { LONDON: SessionZoneConfig; NEW_YORK: SessionZoneConfig };
}

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEFRAMES: SessionTimeframe[] = ['5m', '15m', '30m'];
const defaultSessionConfigPath = resolveRepositoryConfigPath('sessions.json', process.env.SESSION_CONFIG_PATH);

function assertTimeZone(timezone: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new Error(`INVALID_SESSION_TIMEZONE: ${timezone}`); }
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function assertZone(name: string, value: unknown): asserts value is SessionZoneConfig {
  if (!value || typeof value !== 'object') throw new Error(`INVALID_SESSION_ZONE: ${name}`);
  const zone = value as Partial<SessionZoneConfig>;
  if (typeof zone.timezone !== 'string') throw new Error(`INVALID_SESSION_TIMEZONE: ${name}`);
  assertTimeZone(zone.timezone);
  if (typeof zone.startLocal !== 'string' || !HHMM.test(zone.startLocal) || typeof zone.endLocal !== 'string' || !HHMM.test(zone.endLocal)) {
    throw new Error(`INVALID_SESSION_TIME: ${name}`);
  }
  if (minutes(zone.endLocal) <= minutes(zone.startLocal)) throw new Error(`INVALID_SESSION_ZONE_ORDER: ${name}; endLocal must be after startLocal.`);
}

export function validateSessionConfig(value: unknown): SessionConfig {
  if (!value || typeof value !== 'object') throw new Error('INVALID_SESSION_CONFIG');
  const raw = value as Partial<SessionConfig>;
  if (typeof raw.version !== 'string' || !raw.version.trim()) throw new Error('INVALID_SESSION_VERSION');
  const entryRule = raw.entryRule ?? 'TRADE_WITHIN_ZONE';
  if (entryRule !== 'TRADE_WITHIN_ZONE' && entryRule !== 'OPEN_TS') throw new Error('INVALID_SESSION_ENTRY_RULE');
  if (!Number.isInteger(raw.startMarginMinutes) || (raw.startMarginMinutes as number) < 0) throw new Error('INVALID_SESSION_START_MARGIN');
  if (!Number.isInteger(raw.endMarginMinutes) || (raw.endMarginMinutes as number) < 0) throw new Error('INVALID_SESSION_END_MARGIN');
  if (!raw.expiryMinutes || typeof raw.expiryMinutes !== 'object') throw new Error('INVALID_SESSION_EXPIRY');
  const expiryMinutes = {} as Record<SessionTimeframe, number>;
  for (const timeframe of TIMEFRAMES) {
    const expiry = (raw.expiryMinutes as Record<string, unknown>)[timeframe];
    if (!Number.isInteger(expiry) || (expiry as number) <= 0 || (expiry as number) > 24 * 60) throw new Error(`INVALID_SESSION_EXPIRY: ${timeframe}`);
    expiryMinutes[timeframe] = expiry as number;
  }
  if (!raw.zones || typeof raw.zones !== 'object') throw new Error('INVALID_SESSION_ZONES');
  assertZone('LONDON', raw.zones.LONDON);
  assertZone('NEW_YORK', raw.zones.NEW_YORK);
  for (const [name, zone] of Object.entries(raw.zones)) {
    if (zone && typeof zone === 'object') {
      const typed = zone as SessionZoneConfig;
      if (minutes(typed.startLocal) + (raw.startMarginMinutes as number) >= minutes(typed.endLocal) - (raw.endMarginMinutes as number)) {
        throw new Error(`INVALID_SESSION_WINDOW: margins leave no entry window for ${name}.`);
      }
    }
  }
  const core = raw.coreSession;
  if (!core || !['LONDON', 'NEW_YORK'].includes(core.startZone) || !['LONDON', 'NEW_YORK'].includes(core.endZone)
    || typeof core.startLocal !== 'string' || !HHMM.test(core.startLocal)
    || typeof core.endLocal !== 'string' || !HHMM.test(core.endLocal)) {
    throw new Error('INVALID_SESSION_CORE');
  }
  return {
    version: raw.version,
    entryRule,
    startMarginMinutes: raw.startMarginMinutes as number,
    endMarginMinutes: raw.endMarginMinutes as number,
    expiryMinutes,
    coreSession: { ...core },
    zones: { LONDON: { ...raw.zones.LONDON }, NEW_YORK: { ...raw.zones.NEW_YORK } },
  };
}

export function loadSessionConfig(filePath = defaultSessionConfigPath): SessionConfig {
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { throw new Error('SESSION_CONFIG_LOAD_FAILED: unable to read configured session file.'); }
  return validateSessionConfig(parsed);
}

export function sessionConfigHash(config: SessionConfig): string {
  return sha256(canonicalJson(validateSessionConfig(config)));
}

function localBoundary(reference: Date, zone: SessionZoneConfig, localTime: string): Date {
  const [hour, minute] = localTime.split(':').map(Number);
  return utcInstantForLocal(reference, zone.timezone, hour, minute);
}

export function tradeWithinZone(
  entry: Date,
  zone: SessionZoneConfig,
  startMarginMinutes: number,
  endMarginMinutes: number,
  expiryMinutes: number,
): boolean {
  if (!(entry instanceof Date) || !Number.isFinite(entry.getTime())) return false;
  if (!Number.isInteger(startMarginMinutes) || startMarginMinutes < 0) return false;
  if (!Number.isInteger(endMarginMinutes) || endMarginMinutes < 0) return false;
  if (!Number.isInteger(expiryMinutes) || expiryMinutes <= 0) return false;
  if (minutes(zone.endLocal) <= minutes(zone.startLocal)) return false;
  const zoneStart = localBoundary(entry, zone, zone.startLocal).getTime();
  const zoneEnd = localBoundary(entry, zone, zone.endLocal).getTime();
  const start = zoneStart + startMarginMinutes * 60_000;
  const permittedEnd = zoneEnd - endMarginMinutes * 60_000;
  const timestamp = entry.getTime();
  return timestamp >= start && timestamp <= permittedEnd && timestamp + expiryMinutes * 60_000 <= zoneEnd;
}

export function tradeDeliveryWithinZone(
  delivery: Date,
  entry: Date,
  zone: SessionZoneConfig,
  startMarginMinutes: number,
  endMarginMinutes: number,
  expiryMinutes: number,
): boolean {
  return tradeWithinZone(entry, zone, startMarginMinutes, endMarginMinutes, expiryMinutes)
    && delivery instanceof Date && Number.isFinite(delivery.getTime())
    && delivery.getTime() >= entry.getTime()
    && tradeWithinZone(delivery, zone, startMarginMinutes, endMarginMinutes, expiryMinutes);
}

export function signalDeliveryWithinConfiguredSession(input: {
  deliveryMs: number;
  entryMs: number;
  validUntil: string;
  timeframe: SessionTimeframe;
  zoneName: SessionZoneName | undefined;
  config: SessionConfig;
}): boolean {
  const deadline = Date.parse(input.validUntil);
  if (!input.zoneName || !Number.isFinite(deadline) || input.deliveryMs > deadline) return false;
  const zone = input.config.zones[input.zoneName];
  return tradeDeliveryWithinZone(
    new Date(input.deliveryMs),
    new Date(input.entryMs),
    zone,
    input.config.startMarginMinutes,
    input.config.endMarginMinutes,
    input.config.expiryMinutes[input.timeframe],
  );
}
