import fs from 'node:fs';
import { resolveRepositoryConfigPath } from './configPath';
import { canonicalJson } from '../utils/canonicalJson';
import { sha256 } from '../utils/sha256';
import { utcInstantForLocal, zonedWeekdayMinute } from './session';

export type CalendarWeekday = 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY';

export interface MarketCalendarRule {
  weekday: CalendarWeekday;
  localTime: string;
}

export interface MarketCalendarConfig {
  version: string;
  timezone: string;
  weeklyClose: MarketCalendarRule;
  weeklyOpen: MarketCalendarRule;
  holidays: {
    fixedDates: string[];
    goodFriday: boolean;
  };
  earlyCloseRules: Array<{ monthDay: string; closeLocal: string }>;
}

const WEEKDAYS: CalendarWeekday[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MONTH_DAY = /^(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const defaultPath = resolveRepositoryConfigPath('market-calendar.json', process.env.MARKET_CALENDAR_PATH);

function assertTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new Error(`INVALID_MARKET_CALENDAR_TIMEZONE: ${timezone}`); }
}

function assertRule(name: string, value: unknown): asserts value is MarketCalendarRule {
  if (!value || typeof value !== 'object') throw new Error(`INVALID_MARKET_CALENDAR_RULE: ${name}`);
  const rule = value as Partial<MarketCalendarRule>;
  if (!WEEKDAYS.includes(rule.weekday as CalendarWeekday)) throw new Error(`INVALID_MARKET_CALENDAR_WEEKDAY: ${name}`);
  if (typeof rule.localTime !== 'string' || !HHMM.test(rule.localTime)) throw new Error(`INVALID_MARKET_CALENDAR_TIME: ${name}`);
}

function validMonthDay(value: string): boolean {
  if (!MONTH_DAY.test(value)) return false;
  const [month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateMarketCalendar(value: unknown): MarketCalendarConfig {
  if (!value || typeof value !== 'object') throw new Error('INVALID_MARKET_CALENDAR');
  const raw = value as Partial<MarketCalendarConfig>;
  if (typeof raw.version !== 'string' || !raw.version) throw new Error('INVALID_MARKET_CALENDAR_VERSION');
  if (typeof raw.timezone !== 'string' || !raw.timezone.trim()) throw new Error('INVALID_MARKET_CALENDAR_TIMEZONE');
  assertTimezone(raw.timezone);
  assertRule('weeklyClose', raw.weeklyClose);
  assertRule('weeklyOpen', raw.weeklyOpen);
  if (!raw.holidays || typeof raw.holidays !== 'object' || !Array.isArray(raw.holidays.fixedDates) || typeof raw.holidays.goodFriday !== 'boolean') {
    throw new Error('INVALID_MARKET_CALENDAR_HOLIDAYS');
  }
  for (const value of raw.holidays.fixedDates) if (typeof value !== 'string' || !validMonthDay(value)) throw new Error(`INVALID_MARKET_CALENDAR_DATE: ${value}`);
  if (!Array.isArray(raw.earlyCloseRules)) throw new Error('INVALID_MARKET_CALENDAR_EARLY_CLOSE_RULES');
  for (const rule of raw.earlyCloseRules) {
    if (!rule || typeof rule.monthDay !== 'string' || !validMonthDay(rule.monthDay)) throw new Error(`INVALID_MARKET_CALENDAR_DATE: ${String(rule?.monthDay)}`);
    if (typeof rule.closeLocal !== 'string' || !HHMM.test(rule.closeLocal)) throw new Error(`INVALID_MARKET_CALENDAR_TIME: ${String(rule?.closeLocal)}`);
  }
  return {
    version: raw.version,
    timezone: raw.timezone,
    weeklyClose: { ...raw.weeklyClose },
    weeklyOpen: { ...raw.weeklyOpen },
    holidays: { fixedDates: [...raw.holidays.fixedDates], goodFriday: raw.holidays.goodFriday },
    earlyCloseRules: raw.earlyCloseRules.map((rule) => ({ monthDay: rule.monthDay, closeLocal: rule.closeLocal })),
  };
}

export function loadMarketCalendar(filePath = defaultPath): MarketCalendarConfig {
  try { return validateMarketCalendar(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('INVALID_MARKET_CALENDAR')) throw error;
    throw new Error(`MARKET_CALENDAR_LOAD_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function marketCalendarHash(config: MarketCalendarConfig): string {
  return sha256(canonicalJson(validateMarketCalendar(config)));
}

const ACTIVE_CALENDAR = loadMarketCalendar();

function localDateParts(date: Date, timezone: string): { date: string; monthDay: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const dateValue = `${get('year')}-${get('month')}-${get('day')}`;
  return { date: dateValue, monthDay: `${get('month')}-${get('day')}` };
}

function easterSunday(year: number): Date {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function localIsoDate(date: Date, timezone: string): string {
  return localDateParts(date, timezone).date;
}

function localWeekday(date: Date, timezone: string): CalendarWeekday {
  const { weekday } = zonedWeekdayMinute(date, timezone);
  return WEEKDAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)];
}

function minutes(localTime: string): number { const [hour, minute] = localTime.split(':').map(Number); return hour * 60 + minute; }

function localRuleInstant(date: Date, config: MarketCalendarConfig, rule: MarketCalendarRule): Date {
  const [hour, minute] = rule.localTime.split(':').map(Number);
  return utcInstantForLocal(date, config.timezone, hour, minute);
}

export function isMarketCalendarClosed(value: string | number | Date, config = ACTIVE_CALENDAR): boolean {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  const date = new Date(ms);
  const parts = localDateParts(date, config.timezone);
  const weekday = localWeekday(date, config.timezone);
  const minuteOfDay = zonedWeekdayMinute(date, config.timezone).minuteOfDay;
  if (config.holidays.fixedDates.includes(parts.monthDay)) return true;
  const goodFridayIso = new Date(easterSunday(Number(parts.date.slice(0, 4))).getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  if (config.holidays.goodFriday && parts.date === goodFridayIso) return true;
  const earlyClose = config.earlyCloseRules.find((rule) => rule.monthDay === parts.monthDay);
  if (earlyClose && minuteOfDay >= minutes(earlyClose.closeLocal)) return true;
  if (weekday === config.weeklyClose.weekday) {
    const close = localRuleInstant(date, config, config.weeklyClose);
    if (ms >= close.getTime()) return true;
  }
  if (weekday === config.weeklyOpen.weekday) {
    const open = localRuleInstant(date, config, config.weeklyOpen);
    if (ms < open.getTime()) return true;
  }
  if (weekday === 'SATURDAY') return true;
  return false;
}

export function isMarketCalendarBarClosed(openMs: number, durationMs: number, config = ACTIVE_CALENDAR): boolean {
  return isMarketCalendarClosed(openMs, config) || isMarketCalendarClosed(openMs + durationMs, config);
}

// Backward-compatible helper retained for existing callers and tests.
export function isEarlyClose(timestamp: string | number, dates: Set<string> | string[] = new Set(['11-27', '12-24'])): boolean {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return false;
  const key = localDateParts(date, ACTIVE_CALENDAR.timezone).date;
  const values = dates instanceof Set ? dates : new Set(dates);
  return values.has(key) || values.has(key.slice(5));
}

export function isCalendarSessionValid(config: unknown): boolean {
  try {
    if (config && typeof config === 'object' && 'weeklyClose' in config) {
      validateMarketCalendar(config);
      return true;
    }
    const legacy = config as unknown as { timezone?: unknown; closeLocal?: unknown; earlyCloseDates?: unknown };
    if (typeof legacy.timezone !== 'string' || !legacy.timezone.trim()) return false;
    assertTimezone(legacy.timezone);
    if (legacy.closeLocal !== undefined && (typeof legacy.closeLocal !== 'string' || !HHMM.test(legacy.closeLocal))) return false;
    return legacy.earlyCloseDates === undefined || (Array.isArray(legacy.earlyCloseDates) && legacy.earlyCloseDates.every((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)));
  } catch { return false; }
}
