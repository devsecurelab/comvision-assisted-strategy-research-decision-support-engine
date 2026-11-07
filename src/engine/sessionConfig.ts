import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../utils/canonicalJson';
import { sha256 } from '../utils/sha256';
import { utcInstantForLocal } from './session';

export type SessionEntryRule = 'TRADE_WITHIN_ZONE' | 'OPEN_TS';
export type SessionTimeframe = '5m' | '15m' | '30m';

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
  zones: { LONDON: SessionZoneConfig; NEW_YORK: SessionZoneConfig };
}

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEFRAMES: SessionTimeframe[] = ['5m', '15m', '30m'];

function assertTimeZone(timezone: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new Error(`INVALID_SESSION_TIMEZONE: ${timezone}`); }
}

function assertZone(name: string, value: unknown): asserts value is SessionZoneConfig {
  if (!value || typeof value !== 'object') throw new Error(`INVALID_SESSION_ZONE: ${name}`);
  const zone = value as Partial<SessionZoneConfig>;
  if (typeof zone.timezone !== 'string') throw new Error(`INVALID_SESSION_TIMEZONE: ${name}`);
  assertTimeZone(zone.timezone);
  if (!HHMM.test(String(zone.startLocal)) || !HHMM.test(String(zone.endLocal))) throw new Error(`INVALID_SESSION_TIME: ${name}`);
  if (zone.startLocal === zone.endLocal) throw new Error(`INVALID_SESSION_ZONE_ORDER: ${name}`);
}

export function validateSessionConfig(value: unknown): SessionConfig {
  if (!value || typeof value !== 'object') throw new Error('INVALID_SESSION_CONFIG');
  const raw = value as Partial<SessionConfig>;
  if (typeof raw.version !== 'string' || !raw.version) throw new Error('INVALID_SESSION_VERSION');
  if (raw.entryRule !== 'TRADE_WITHIN_ZONE' && raw.entryRule !== 'OPEN_TS') throw new Error('INVALID_SESSION_ENTRY_RULE');
  if (!Number.isInteger(raw.startMarginMinutes) || (raw.startMarginMinutes as number) < 0) throw new Error('INVALID_SESSION_START_MARGIN');
  if (!Number.isInteger(raw.endMarginMinutes) || (raw.endMarginMinutes as number) < 0) throw new Error('INVALID_SESSION_END_MARGIN');
  if (!raw.expiryMinutes || typeof raw.expiryMinutes !== 'object') throw new Error('INVALID_SESSION_EXPIRY');
  const expiryMinutes = {} as Record<SessionTimeframe, number>;
  for (const timeframe of TIMEFRAMES) {
    const expiry = (raw.expiryMinutes as Record<string, unknown>)[timeframe];
    if (!Number.isInteger(expiry) || (expiry as number) <= 0) throw new Error(`INVALID_SESSION_EXPIRY: ${timeframe}`);
    expiryMinutes[timeframe] = expiry as number;
  }
  assertZone('LONDON', raw.zones?.LONDON);
  assertZone('NEW_YORK', raw.zones?.NEW_YORK);
  return {
    version: raw.version,
    entryRule: raw.entryRule,
    startMarginMinutes: raw.startMarginMinutes as number,
    endMarginMinutes: raw.endMarginMinutes as number,
    expiryMinutes,
    zones: { LONDON: raw.zones!.LONDON, NEW_YORK: raw.zones!.NEW_YORK },
  };
}

const defaultSessionConfigPath = path.resolve(process.cwd(), 'config', 'sessions.json');

export function loadSessionConfig(filePath = process.env.SESSION_CONFIG_PATH || defaultSessionConfigPath): SessionConfig {
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) { throw new Error(`SESSION_CONFIG_LOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`); }
  return validateSessionConfig(parsed);
}

export function sessionConfigHash(config: SessionConfig): string {
  return sha256(canonicalJson(validateSessionConfig(config)));
}

function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
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
  const start = localBoundary(entry, zone, zone.startLocal).getTime() + startMarginMinutes * 60_000;
  const end = localBoundary(entry, zone, zone.endLocal).getTime() - endMarginMinutes * 60_000;
  const timestamp = entry.getTime();
  return timestamp >= start && timestamp <= end && timestamp + expiryMinutes * 60_000 <= localBoundary(entry, zone, zone.endLocal).getTime();
}

export function sessionLocalMinutes(value: string): number { return minutes(value); }
