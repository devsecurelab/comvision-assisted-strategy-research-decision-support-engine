import assert from 'node:assert/strict';
import { classifySessionAndKillZone } from '../src/engine/session';
import { loadSessionConfig, tradeWithinZone } from '../src/engine/sessionConfig';

const config = loadSessionConfig();
const timeframes = ['5m', '15m', '30m'] as const;

const cases = [
  { label: 'London DST end', zone: config.zones.LONDON, before: '2026-10-25T07:29:00Z', first: '2026-10-25T07:30:00Z', last: '2026-10-25T09:14:00Z', beyond: '2026-10-25T09:31:00Z' },
  { label: 'US DST end', zone: config.zones.NEW_YORK, before: '2026-11-01T12:29:00Z', first: '2026-11-01T12:30:00Z', last: '2026-11-01T14:14:00Z', beyond: '2026-11-01T14:31:00Z' },
  { label: 'US DST start', zone: config.zones.NEW_YORK, before: '2027-03-14T11:29:00Z', first: '2027-03-14T11:30:00Z', last: '2027-03-14T13:14:00Z', beyond: '2027-03-14T13:31:00Z' },
  { label: 'UK DST start', zone: config.zones.LONDON, before: '2027-03-28T06:29:00Z', first: '2027-03-28T06:30:00Z', last: '2027-03-28T08:14:00Z', beyond: '2027-03-28T08:31:00Z' },
] as const;

for (const item of cases) {
  assert.equal(tradeWithinZone(new Date(item.before), item.zone, 30, 30, 15), false, `${item.label}: before start margin`);
  assert.equal(tradeWithinZone(new Date(item.first), item.zone, 30, 30, 15), true, `${item.label}: first valid 15m entry`);
  assert.equal(tradeWithinZone(new Date(item.last), item.zone, 30, 30, 15), true, `${item.label}: last valid entry`);
  assert.equal(tradeWithinZone(new Date(item.beyond), item.zone, 30, 30, 15), false, `${item.label}: after end margin`);
}

for (const timeframe of timeframes) {
  const expiry = config.expiryMinutes[timeframe];
  const first = new Date('2026-10-26T07:30:00Z');
  const exactBoundary = new Date(Date.parse('2026-10-26T10:00:00Z') - expiry * 60_000);
  const oneBeyond = new Date(exactBoundary.getTime() + 1_000);
  assert.equal(tradeWithinZone(first, config.zones.LONDON, config.startMarginMinutes, config.endMarginMinutes, expiry), true, `${timeframe}: first valid entry`);
  assert.equal(tradeWithinZone(exactBoundary, config.zones.LONDON, 0, 0, expiry), true, `${timeframe}: expiry exactly at zone end`);
  assert.equal(tradeWithinZone(oneBeyond, config.zones.LONDON, 0, 0, expiry), false, `${timeframe}: expiry beyond zone end`);
}

// Mismatch week: London is on UTC while New York remains on EDT.
assert.equal(classifySessionAndKillZone('2026-10-26T07:30:00Z').kill_zone, 'INSIDE_KILL_ZONE');
assert.equal(classifySessionAndKillZone('2026-10-26T11:30:00Z').kill_zone, 'INSIDE_KILL_ZONE');
assert.equal(classifySessionAndKillZone('2026-10-26T07:30:00Z').session, 'LONDON');
assert.equal(classifySessionAndKillZone('2026-10-26T11:30:00Z').session, 'LONDON_NEW_YORK_OVERLAP');

// New classification has no Asia output; compatibility readers may still accept ASIA records.
assert.notEqual(classifySessionAndKillZone('2026-10-26T02:00:00Z').session, 'ASIA');

console.log('[pr7_dst_boundaries] PASS — 2026/2027 DST, mismatch-week, margin, expiry, and timeframe matrix verified');
