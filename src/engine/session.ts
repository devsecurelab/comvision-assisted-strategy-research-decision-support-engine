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
    kill_zone_start_utc = utcLabel(new Date(date.getTime() - (london.decimal - 8) * 60 * 60 * 1000));
    kill_zone_end_utc = utcLabel(new Date(date.getTime() + (10 - london.decimal) * 60 * 60 * 1000));
  } else if (newYork.decimal >= 8 && newYork.decimal < 10) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_start_utc = utcLabel(new Date(date.getTime() - (newYork.decimal - 8) * 60 * 60 * 1000));
    kill_zone_end_utc = utcLabel(new Date(date.getTime() + (10 - newYork.decimal) * 60 * 60 * 1000));
  } else if (tokyo.decimal >= 9 && tokyo.decimal < 11) {
    kill_zone = 'INSIDE_KILL_ZONE';
    kill_zone_start_utc = utcLabel(new Date(date.getTime() - (tokyo.decimal - 9) * 60 * 60 * 1000));
    kill_zone_end_utc = utcLabel(new Date(date.getTime() + (11 - tokyo.decimal) * 60 * 60 * 1000));
  }

  return {
    session,
    kill_zone,
    session_start_utc: session === 'OFF_PEAK' ? 'NONE' : utcLabel(date),
    session_end_utc: session === 'OFF_PEAK' ? 'NONE' : utcLabel(date),
    kill_zone_start_utc,
    kill_zone_end_utc,
    timestamp_utc: date.toISOString(),
    timestamp_bdt: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'short', timeStyle: 'medium' }).format(date),
  };
}
