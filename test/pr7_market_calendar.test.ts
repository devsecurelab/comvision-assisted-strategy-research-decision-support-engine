import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isFxBarClosed, isFxMarketClosed } from '../src/engine/marketHours';
import {
  loadMarketCalendar,
  marketCalendarHash,
  validateMarketCalendar,
  type MarketCalendarConfig,
} from '../src/engine/marketCalendar';
import { CONFIG_HASH, MARKET_CALENDAR_HASH, STRATEGY_MANIFEST } from '../src/engine/manifest';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const calendar = loadMarketCalendar(path.join(repoRoot, 'config/market-calendar.json'));
assert.equal(calendar.timezone, 'America/New_York');
assert.equal(calendar.weeklyClose.weekday, 'FRIDAY');
assert.equal(calendar.weeklyOpen.weekday, 'SUNDAY');
assert.match(marketCalendarHash(calendar), /^[a-f0-9]{64}$/);
assert.equal(marketCalendarHash(calendar), marketCalendarHash(JSON.parse(JSON.stringify(calendar))));
assert.equal(MARKET_CALENDAR_HASH, marketCalendarHash(calendar));
assert.equal(STRATEGY_MANIFEST.market_calendar_hash, MARKET_CALENDAR_HASH);
assert.match(CONFIG_HASH, /^[a-f0-9]{64}$/);

const invalid = JSON.parse(JSON.stringify(calendar)) as MarketCalendarConfig;
invalid.timezone = 'Not/AZone';
assert.throws(() => validateMarketCalendar(invalid), /INVALID_MARKET_CALENDAR_TIMEZONE/);
const invalidTime = JSON.parse(JSON.stringify(calendar)) as MarketCalendarConfig;
invalidTime.weeklyClose.localTime = '25:00';
assert.throws(() => validateMarketCalendar(invalidTime), /INVALID_MARKET_CALENDAR_TIME/);
const invalidHoliday = JSON.parse(JSON.stringify(calendar)) as MarketCalendarConfig;
invalidHoliday.holidays.fixedDates = ['02-30'];
assert.throws(() => validateMarketCalendar(invalidHoliday), /INVALID_MARKET_CALENDAR_DATE/);

// Weekly closure: Friday 17:00 New York is closed; Sunday 17:00 is open.
assert.equal(isFxMarketClosed('2026-10-30T20:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-10-30T21:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-11-01T21:59:59.999Z'), true);
assert.equal(isFxMarketClosed('2026-11-01T22:00:00.000Z'), false);

// Full-day fixed holidays and Good Friday are closed in the configured local calendar.
assert.equal(isFxMarketClosed('2026-12-25T16:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2027-01-01T16:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2027-03-26T16:00:00.000Z'), true);

// Early-close dates are open immediately before the local close and closed at the boundary.
assert.equal(isFxMarketClosed('2026-12-24T16:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-12-24T17:00:00.000Z'), true);
assert.equal(isFxMarketClosed('2026-12-31T16:59:59.999Z'), false);
assert.equal(isFxMarketClosed('2026-12-31T17:00:00.000Z'), true);

// A bar touching a closure boundary is unavailable, while a bar fully before it remains usable.
assert.equal(isFxBarClosed('2026-12-24T16:45:00.000Z', '15m'), true);
assert.equal(isFxBarClosed('2026-12-24T16:30:00.000Z', '15m'), false);

// Calendar changes are hash-visible and reject malformed persisted files.
const changed = { ...calendar, earlyCloseRules: calendar.earlyCloseRules.map((rule) => ({ ...rule, closeLocal: '13:00' })) };
assert.notEqual(marketCalendarHash(changed), marketCalendarHash(calendar));
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr7-calendar-')), 'invalid.json');
fs.writeFileSync(file, '{not-json');
assert.throws(() => loadMarketCalendar(file), /MARKET_CALENDAR_LOAD_FAILED/);

console.log('[pr7_market_calendar] PASS — schema/hash, weekly closure, holidays, early-close, and bar boundaries verified');
