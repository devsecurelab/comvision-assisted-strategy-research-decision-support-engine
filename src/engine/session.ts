import type { KillZoneState, MarketSession, SessionContext } from './types';

/**
 * Owner session rules (N1): London kill zone 07:00-10:00 Europe/London local,
 * New York kill zone 07:00-10:00 America/New_York local, core session from
 * London 07:00 local to New York 16:00 local. Asia (00:00-06:00 UTC) is context
 * only and never passes Stage 16. There is no Tokyo kill zone. DST is resolved
 * through IANA zones, never through fixed UTC hours.
 */
export const LONDON_TZ = 'Europe/London';
export const NEW_YORK_TZ = 'America/New_York';
const KILL_ZONE_START = 7;
const KILL_ZONE_END = 10;
const CORE_START_LONDON = 7;
const CORE_END_NEW_YORK = 16;
const ASIA_START_UTC = 0;
const ASIA_END_UTC = 6;

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; decimal: number }

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const hour = get('hour');
  const minute = get('minute');
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute, decimal: hour + minute / 60 };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** UTC instant of a wall-clock time on the local calendar day of `reference` in `timeZone`. */
export function utcInstantForLocal(reference: Date, timeZone: string, hour: number, minute = 0): Date {
  const local = zonedParts(reference, timeZone);
  const naive = Date.UTC(local.year, local.month - 1, local.day, hour, minute);
  let instant = naive - offsetMs(new Date(naive), timeZone);
  instant = naive - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

const hhmm = (date: Date) => `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;

export function classifySessionAndKillZone(timestampIso: string): SessionContext {
  const date = new Date(timestampIso);
  if (!Number.isFinite(date.getTime())) {
    return { session: 'UNKNOWN', kill_zone: 'UNKNOWN', session_start_utc: 'NONE', session_end_utc: 'NONE', timestamp_utc: 'INVALID', timestamp_bdt: 'INVALID' };
  }
  const london = zonedParts(date, LONDON_TZ);
  const newYork = zonedParts(date, NEW_YORK_TZ);
  const coreStart = utcInstantForLocal(date, LONDON_TZ, CORE_START_LONDON);
  const coreEnd = utcInstantForLocal(date, NEW_YORK_TZ, CORE_END_NEW_YORK);
  const t = date.getTime();
  const inCore = t >= coreStart.getTime() && t < coreEnd.getTime();

  let session: MarketSession = 'OFF_PEAK';
  let sessionStart = 'NONE';
  let sessionEnd = 'NONE';
  if (inCore) {
    session = newYork.decimal < KILL_ZONE_START ? 'LONDON' : london.decimal < 16 ? 'LONDON_NEW_YORK_OVERLAP' : 'NEW_YORK';
    sessionStart = hhmm(coreStart);
    sessionEnd = hhmm(coreEnd);
  } else if (date.getUTCHours() >= ASIA_START_UTC && date.getUTCHours() < ASIA_END_UTC) {
    session = 'ASIA';
    sessionStart = '00:00';
    sessionEnd = '06:00';
  }

  let kill_zone: KillZoneState = 'OUTSIDE_KILL_ZONE';
  let kill_zone_start_utc: string | undefined;
  let kill_zone_end_utc: string | undefined;
  let kill_zone_name: 'LONDON' | 'NEW_YORK' | undefined;
  if (london.decimal >= KILL_ZONE_START && london.decimal < KILL_ZONE_END) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_name = 'LONDON';
    kill_zone_start_utc = hhmm(utcInstantForLocal(date, LONDON_TZ, KILL_ZONE_START));
    kill_zone_end_utc = hhmm(utcInstantForLocal(date, LONDON_TZ, KILL_ZONE_END));
  } else if (newYork.decimal >= KILL_ZONE_START && newYork.decimal < KILL_ZONE_END) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_name = 'NEW_YORK';
    kill_zone_start_utc = hhmm(utcInstantForLocal(date, NEW_YORK_TZ, KILL_ZONE_START));
    kill_zone_end_utc = hhmm(utcInstantForLocal(date, NEW_YORK_TZ, KILL_ZONE_END));
  }

  return {
    session,
    kill_zone,
    kill_zone_name,
    session_start_utc: sessionStart,
    session_end_utc: sessionEnd,
    kill_zone_start_utc,
    kill_zone_end_utc,
    timestamp_utc: date.toISOString(),
    timestamp_bdt: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'short', timeStyle: 'medium' }).format(date),
  };
}

/** Stage 16 passes only inside the London 07:00 -> New York 16:00 core session. Asia is context only. */
export function isCoreSession(session: MarketSession): boolean {
  return session === 'LONDON' || session === 'LONDON_NEW_YORK_OVERLAP' || session === 'NEW_YORK';
}
