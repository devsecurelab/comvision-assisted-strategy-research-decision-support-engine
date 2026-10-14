import type { KillZoneState, MarketSession, SessionContext } from './types';

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return { hour, minute, decimal: hour + minute / 60 };
}

function utcLabel(date: Date) {
  return `${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}`;
}

function utcForLocal(date: Date, timeZone: string, targetHour: number, targetMinute = 0) {
  const start = date.getTime() - 36 * 60 * 60 * 1000;
  for (let offset = 0; offset <= 72 * 60; offset += 15) {
    const candidate = new Date(start + offset * 60 * 1000);
    const local = zonedParts(candidate, timeZone);
    if (local.hour === targetHour && local.minute === targetMinute) return utcLabel(candidate);
  }
  return 'UNKNOWN';
}

/** Resolves sessions in local exchange timezones, so London/New York DST is not hard-coded to UTC. */
export function classifySessionAndKillZone(timestampIso: string): SessionContext {
  const date = new Date(timestampIso);
  const london = zonedParts(date, 'Europe/London');
  const newYork = zonedParts(date, 'America/New_York');
  const tokyo = zonedParts(date, 'Asia/Tokyo');
  const londonOpen = london.decimal >= 8 && london.decimal < 17;
  const newYorkOpen = newYork.decimal >= 8 && newYork.decimal < 17;
  const asiaOpen = tokyo.decimal >= 9 && tokyo.decimal < 15;
  let session: MarketSession = 'OFF_PEAK';
  if (londonOpen && newYorkOpen) session = 'LONDON_NEW_YORK_OVERLAP';
  else if (londonOpen) session = 'LONDON';
  else if (newYorkOpen) session = 'NEW_YORK';
  else if (asiaOpen) session = 'ASIA';

  let kill_zone: KillZoneState = 'OUTSIDE_KILL_ZONE';
  let kill_zone_start_utc: string | undefined;
  let kill_zone_end_utc: string | undefined;
  if (london.decimal >= 8 && london.decimal < 10) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_start_utc = utcForLocal(date, 'Europe/London', 8);
    kill_zone_end_utc = utcForLocal(date, 'Europe/London', 10);
  } else if (newYork.decimal >= 8 && newYork.decimal < 10) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_start_utc = utcForLocal(date, 'America/New_York', 8);
    kill_zone_end_utc = utcForLocal(date, 'America/New_York', 10);
  } else if (tokyo.decimal >= 9 && tokyo.decimal < 11) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_start_utc = utcForLocal(date, 'Asia/Tokyo', 9);
    kill_zone_end_utc = utcForLocal(date, 'Asia/Tokyo', 11);
  }

  const sessionTimeZone = session === 'LONDON' || session === 'LONDON_NEW_YORK_OVERLAP' ? 'Europe/London' : session === 'NEW_YORK' ? 'America/New_York' : 'Asia/Tokyo';
  const sessionStartHour = session === 'ASIA' ? 9 : 8;
  const sessionEndHour = session === 'ASIA' ? 15 : 17;
  return {
    session,
    kill_zone,
    session_start_utc: session === 'OFF_PEAK' ? 'NONE' : utcForLocal(date, sessionTimeZone, sessionStartHour),
    session_end_utc: session === 'OFF_PEAK' ? 'NONE' : utcForLocal(date, sessionTimeZone, sessionEndHour),
    kill_zone_start_utc,
    kill_zone_end_utc,
    timestamp_utc: date.toISOString(),
    timestamp_bdt: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'short', timeStyle: 'medium' }).format(date),
  };
}
