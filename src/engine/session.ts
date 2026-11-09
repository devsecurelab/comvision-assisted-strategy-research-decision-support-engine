import type { KillZoneState, MarketSession, SessionContext } from './types';
import { loadSessionConfig } from './sessionConfig';
import { isMarketCalendarClosed } from './marketCalendar';

/**
 * Owner session rules (N1): London kill zone 07:00-10:00 Europe/London local,
 * New York kill zone 07:00-10:00 America/New_York local, core session from
 * London 07:00 local to New York 16:00 local. Asia (00:00-06:00 UTC) is context
 * only and never passes Stage 16. There is no Tokyo kill zone. DST is resolved
 * through IANA zones, never through fixed UTC hours.
 */
export const LONDON_TZ = 'Europe/London';
export const NEW_YORK_TZ = 'America/New_York';
let activeSessionConfig: ReturnType<typeof loadSessionConfig> | undefined;
function getSessionConfig() { return activeSessionConfig ??= loadSessionConfig(); }

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

/** Local weekday and minute-of-day for an instant, using the same IANA-zone formatting as session rules. */
export function zonedWeekdayMinute(date: Date, timeZone: string): { weekday: string; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return { weekday: get('weekday') ?? 'UNKNOWN', minuteOfDay: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function classifySessionAndKillZone(timestampIso: string): SessionContext {
  const date = new Date(timestampIso);
  if (!Number.isFinite(date.getTime())) {
    return { session: 'UNKNOWN', kill_zone: 'UNKNOWN', session_start_utc: 'NONE', session_end_utc: 'NONE', timestamp_utc: 'INVALID', timestamp_bdt: 'INVALID' };
  }
  if (isMarketCalendarClosed(date)) {
    return { session: 'CLOSED', kill_zone: 'OUTSIDE_KILL_ZONE', session_start_utc: 'NONE', session_end_utc: 'NONE', timestamp_utc: date.toISOString(), timestamp_bdt: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'short', timeStyle: 'medium' }).format(date) };
  }
  const config = getSessionConfig();
  const londonZone = config.zones.LONDON;
  const newYorkZone = config.zones.NEW_YORK;
  const london = zonedParts(date, londonZone.timezone);
  const newYork = zonedParts(date, newYorkZone.timezone);
  const [coreStartHour, coreStartMinute] = config.coreSession.startLocal.split(':').map(Number);
  const [coreEndHour, coreEndMinute] = config.coreSession.endLocal.split(':').map(Number);
  const coreStartZone = config.zones[config.coreSession.startZone];
  const coreEndZone = config.zones[config.coreSession.endZone];
  const coreStart = utcInstantForLocal(date, coreStartZone.timezone, coreStartHour, coreStartMinute);
  const coreEnd = utcInstantForLocal(date, coreEndZone.timezone, coreEndHour, coreEndMinute);
  const t = date.getTime();
  const inCore = t >= coreStart.getTime() && t < coreEnd.getTime();

  let session: MarketSession = 'OFF_PEAK';
  let sessionStart = 'NONE';
  let sessionEnd = 'NONE';
  if (inCore) {
    const newYorkStart = Number(newYorkZone.startLocal.slice(0, 2)) + Number(newYorkZone.startLocal.slice(3, 5)) / 60;
    session = newYork.decimal < newYorkStart ? 'LONDON' : london.decimal < 16 ? 'LONDON_NEW_YORK_OVERLAP' : 'NEW_YORK';
    sessionStart = hhmm(coreStart);
    sessionEnd = hhmm(coreEnd);
  }

  let kill_zone: KillZoneState = 'OUTSIDE_KILL_ZONE';
  let kill_zone_start_utc: string | undefined;
  let kill_zone_end_utc: string | undefined;
  let kill_zone_name: 'LONDON' | 'NEW_YORK' | undefined;
  const londonStart = Number(londonZone.startLocal.slice(0, 2)) + Number(londonZone.startLocal.slice(3, 5)) / 60;
  const londonEnd = Number(londonZone.endLocal.slice(0, 2)) + Number(londonZone.endLocal.slice(3, 5)) / 60;
  const nyStart = Number(newYorkZone.startLocal.slice(0, 2)) + Number(newYorkZone.startLocal.slice(3, 5)) / 60;
  const nyEnd = Number(newYorkZone.endLocal.slice(0, 2)) + Number(newYorkZone.endLocal.slice(3, 5)) / 60;
  if (london.decimal >= londonStart && london.decimal < londonEnd) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_name = 'LONDON';
    const [startHour, startMinute] = londonZone.startLocal.split(':').map(Number);
    const [endHour, endMinute] = londonZone.endLocal.split(':').map(Number);
    kill_zone_start_utc = hhmm(utcInstantForLocal(date, londonZone.timezone, startHour, startMinute));
    kill_zone_end_utc = hhmm(utcInstantForLocal(date, londonZone.timezone, endHour, endMinute));
  } else if (newYork.decimal >= nyStart && newYork.decimal < nyEnd) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_name = 'NEW_YORK';
    const [startHour, startMinute] = newYorkZone.startLocal.split(':').map(Number);
    const [endHour, endMinute] = newYorkZone.endLocal.split(':').map(Number);
    kill_zone_start_utc = hhmm(utcInstantForLocal(date, newYorkZone.timezone, startHour, startMinute));
    kill_zone_end_utc = hhmm(utcInstantForLocal(date, newYorkZone.timezone, endHour, endMinute));
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
