export interface MarketCalendarConfig {
  timezone: string;
  closeLocal?: string;
  earlyCloseDates?: string[];
}

const DEFAULT_EARLY_CLOSE_DATES = new Set(['2026-11-27', '2026-12-24']);

export function isEarlyClose(timestamp: string | number, dates: Set<string> | string[] = DEFAULT_EARLY_CLOSE_DATES): boolean {
  const date = new Date(timestamp);
  const isoDate = date.toISOString().slice(0, 10);
  return (dates instanceof Set ? dates : new Set(dates)).has(isoDate);
}

export function isCalendarSessionValid(config: MarketCalendarConfig): boolean {
  if (!config || typeof config.timezone !== 'string' || !config.timezone.trim()) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: config.timezone }).format(); }
  catch { return false; }
  if (config.closeLocal !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.closeLocal)) return false;
  return (config.earlyCloseDates ?? []).every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
}
