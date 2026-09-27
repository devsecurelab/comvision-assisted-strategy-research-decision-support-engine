// Time Formatting Utilities for Strategy v1.0 Frozen Specification
// Authoritative canonical UTC timestamps converted to Bangladesh Time (Asia/Dhaka, UTC+06:00)
// Uses Intl.DateTimeFormat with explicit timezones to avoid manual arithmetic errors

export interface FormattedSignalTime {
  utcTime: string;      // e.g. "06:32:15"
  bdtTime: string;      // e.g. "12:32:15"
  utcShort: string;     // e.g. "06:32"
  bdtShort: string;     // e.g. "12:32"
  utcDate: string;      // e.g. "2026-09-20"
  bdtDate: string;      // e.g. "2026-09-20"
  dualDisplay: string;  // e.g. "06:32 UTC / 12:32 BDT"
  dualDetail: string;   // e.g. "06:32:15 UTC | 12:32:15 BDT"
  bdtTimezoneLabel: string; // "Asia/Dhaka (UTC+06:00)"
  isValid: boolean;
  rawIso: string;
}

/**
 * Formats a canonical UTC ISO string into UTC and Bangladesh Time (Asia/Dhaka)
 * Retains canonical UTC and converts for display using timezone 'Asia/Dhaka'
 */
export function formatSignalTime(timestampUtc?: string | null): FormattedSignalTime {
  const fallback: FormattedSignalTime = {
    utcTime: 'N/A',
    bdtTime: 'N/A',
    utcShort: 'N/A',
    bdtShort: 'N/A',
    utcDate: 'N/A',
    bdtDate: 'N/A',
    dualDisplay: 'Time Unavailable',
    dualDetail: 'Timestamp Unavailable',
    bdtTimezoneLabel: 'Asia/Dhaka (UTC+06:00)',
    isValid: false,
    rawIso: '',
  };

  if (!timestampUtc) {
    return fallback;
  }

  const date = new Date(timestampUtc);
  if (isNaN(date.getTime())) {
    return {
      ...fallback,
      dualDisplay: 'Invalid Timestamp',
      dualDetail: 'Invalid Timestamp',
    };
  }

  // Format UTC
  const utcFull = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  const utcShort = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const utcDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  // Format Bangladesh Time (Asia/Dhaka, UTC+06:00)
  const bdtFull = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  const bdtShort = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const bdtDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  return {
    utcTime: utcFull,
    bdtTime: bdtFull,
    utcShort,
    bdtShort,
    utcDate,
    bdtDate,
    dualDisplay: `${utcShort} UTC / ${bdtShort} BDT`,
    dualDetail: `${utcFull} UTC | ${bdtFull} BDT`,
    bdtTimezoneLabel: 'Asia/Dhaka (UTC+06:00)',
    isValid: true,
    rawIso: date.toISOString(),
  };
}
