import test from 'node:test';
import assert from 'node:assert/strict';
import { safeTimeZone, zonedParts, zonedToUtc, addDays, isDateString, isTimeString, describeNow, upcomingDays } from '../src/assistant/time.js';

const LA = 'America/Los_Angeles';

test('zonedToUtc: Los Angeles before DST ends is UTC-7', () => {
  assert.equal(zonedToUtc('2026-10-31', '12:00', LA).toISOString(), '2026-10-31T19:00:00.000Z');
});

test('zonedToUtc: Los Angeles after DST ends is UTC-8', () => {
  assert.equal(zonedToUtc('2026-11-02', '12:00', LA).toISOString(), '2026-11-02T20:00:00.000Z');
});

test('zonedToUtc: Asia/Kolkata is +5:30', () => {
  assert.equal(zonedToUtc('2026-11-10', '09:30', 'Asia/Kolkata').toISOString(), '2026-11-10T04:00:00.000Z');
});

test('zonedToUtc: UTC and default zone', () => {
  assert.equal(zonedToUtc('2026-11-10', '09:30', 'UTC').toISOString(), '2026-11-10T09:30:00.000Z');
  assert.equal(zonedToUtc('2026-11-10').toISOString(), '2026-11-10T00:00:00.000Z');
});

test('zonedToUtc: round-trips through zonedParts', () => {
  const d = zonedToUtc('2026-03-08', '09:15', LA); // day DST starts
  const p = zonedParts(d, LA);
  assert.equal(p.date, '2026-03-08');
  assert.equal(p.time, '09:15');
});

test('safeTimeZone falls back to UTC for invalid or missing zones', () => {
  assert.equal(safeTimeZone('Not/AZone'), 'UTC');
  assert.equal(safeTimeZone(undefined), 'UTC');
  assert.equal(safeTimeZone(LA), LA);
});

test('addDays across month and year end', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-11-10', 0), '2026-11-10');
});

test('isDateString / isTimeString', () => {
  assert.equal(isDateString('2026-11-10'), true);
  assert.equal(isDateString('2026-13-10'), false);
  assert.equal(isDateString('2026-11-1'), false);
  assert.equal(isDateString(null), false);
  assert.equal(isTimeString('00:00'), true);
  assert.equal(isTimeString('23:59'), true);
  assert.equal(isTimeString('24:00'), false);
  assert.equal(isTimeString('9:00'), false);
  assert.equal(isTimeString('12:60'), false);
});

test('describeNow uses the user zone', () => {
  // 2026-11-11T03:00Z is still Nov 10 in LA (19:00 PST)
  const d = describeNow(new Date('2026-11-11T03:00:00Z'), LA);
  assert.equal(d.date, '2026-11-10');
  assert.equal(d.weekday, 'Tuesday');
  assert.equal(d.today, 'Tuesday, 2026-11-10');
  assert.match(d.clock, /7:00\s?PM/);
  assert.equal(d.year, '2026');
});

test('upcomingDays labels today/tomorrow with correct weekdays', () => {
  const days = upcomingDays(new Date('2026-11-10T15:00:00Z'), 'UTC');
  assert.equal(days.length, 14);
  assert.equal(days[0], 'Tue 2026-11-10 (today)');
  assert.equal(days[1], 'Wed 2026-11-11 (tomorrow)');
  assert.equal(days[2], 'Thu 2026-11-12');
  assert.equal(days[13], 'Mon 2026-11-23');
});

test('upcomingDays starts from the local date, not the UTC date', () => {
  const days = upcomingDays(new Date('2026-11-11T03:00:00Z'), LA);
  assert.equal(days[0], 'Tue 2026-11-10 (today)');
});
