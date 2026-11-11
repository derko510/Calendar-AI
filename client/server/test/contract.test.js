import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCreateEvents, checkCreateEvents, knownIds } from '../src/assistant/contract.js';

test('cleanCreateEvents keeps a valid event and trims fields', () => {
  const out = cleanCreateEvents([{ title: '  Gym ', date: '2026-11-13', startTime: '18:00', endTime: '19:00', description: ' d ', location: ' LA ' }]);
  assert.deepEqual(out, [{ title: 'Gym', date: '2026-11-13', weekday: 'Fri', startTime: '18:00', endTime: '19:00', description: 'd', location: 'LA' }]);
});

test('cleanCreateEvents rejects bad dates, times, and missing titles', () => {
  const out = cleanCreateEvents([
    { title: 'a', date: '2026-13-01', startTime: '10:00' },
    { title: 'b', date: 'tomorrow', startTime: '10:00' },
    { title: 'c', date: '2026-11-13', startTime: '25:00' },
    { title: 'd', date: '2026-11-13', startTime: '9am' },
    { title: '', date: '2026-11-13', startTime: '10:00' },
    { date: '2026-11-13', startTime: '10:00' },
    null,
    { title: 'ok', date: '2026-11-13', startTime: '10:00' }
  ]);
  assert.deepEqual(out.map(e => e.title), ['ok']);
});

test('end times: equal is dropped, earlier means the next day, invalid rejects the event', () => {
  const mk = endTime => checkCreateEvents([{ title: 'a', date: '2026-11-13', startTime: '10:00', endTime }]);
  assert.equal(mk('10:00').events[0].endTime, '');
  assert.deepEqual(mk('09:00').events[0], { title: 'a', date: '2026-11-13', weekday: 'Fri', startTime: '10:00', endTime: '09:00', endDate: '2026-11-14', description: '', location: '' });
  assert.equal(mk(undefined).events[0].endTime, '');
  assert.equal(mk('10:01').events[0].endTime, '10:01');
  assert.equal('endDate' in mk('10:01').events[0], false);
  assert.match(mk('bad').errors[0], /endTime "bad"/);
});

test('overnight: "party Fri 10pm to 1am" keeps its end on Saturday', () => {
  const { events, errors } = checkCreateEvents([{ title: 'Party', date: '2026-11-13', weekday: 'Fri', startTime: '22:00', endTime: '01:00' }]);
  assert.deepEqual(errors, []);
  assert.equal(events[0].endDate, '2026-11-14');
  assert.equal(events[0].endTime, '01:00');
  // "until midnight"
  const midnight = checkCreateEvents([{ title: 'x', date: '2026-11-13', startTime: '22:00', endTime: '24:00' }]).events[0];
  assert.deepEqual([midnight.endTime, midnight.endDate], ['00:00', '2026-11-14']);
});

test('multi-day: explicit endDate is kept and checked', () => {
  const ok = checkCreateEvents([{ title: 'Conf', date: '2026-11-13', startTime: '09:00', endTime: '17:00', endDate: '2026-11-15' }]);
  assert.equal(ok.events[0].endDate, '2026-11-15');
  // a same-day endDate is the same as none
  assert.equal('endDate' in checkCreateEvents([{ title: 'x', date: '2026-11-13', startTime: '09:00', endTime: '17:00', endDate: '2026-11-13' }]).events[0], false);
  assert.match(checkCreateEvents([{ title: 'x', date: '2026-11-13', startTime: '09:00', endTime: '17:00', endDate: '2026-11-12' }]).errors[0], /before/);
  assert.match(checkCreateEvents([{ title: 'x', date: '2026-11-13', startTime: '09:00', endDate: '2026-11-14' }]).errors[0], /endTime is required/);
  assert.match(checkCreateEvents([{ title: 'x', date: '2026-11-13', startTime: '09:00', endTime: '10:00', endDate: '2027-01-30' }]).errors[0], /more than 31 days/);
});

test('times are normalised: H:MM and HH:MM:SS become HH:MM', () => {
  const e = checkCreateEvents([{ title: 'x', date: '2026-11-13', startTime: '9:05', endTime: '10:30:00' }]).events[0];
  assert.deepEqual([e.startTime, e.endTime], ['09:05', '10:30']);
});

test('weekday must match the date; the response carries the real weekday', () => {
  const bad = checkCreateEvents([{ title: 'Gym', date: '2026-11-13', weekday: 'Thu', startTime: '18:00' }]);
  assert.deepEqual(bad.events, []);
  assert.match(bad.errors[0], /2026-11-13 is a Fri, not "Thu"/);
  assert.equal(checkCreateEvents([{ title: 'Gym', date: '2026-11-13', weekday: 'friday', startTime: '18:00' }]).errors.length, 0);
  assert.equal(checkCreateEvents([{ title: 'Gym', date: '2026-11-13', startTime: '18:00' }]).events[0].weekday, 'Fri');
});

test('impossible dates are rejected', () => {
  assert.match(checkCreateEvents([{ title: 'x', date: '2026-02-30', startTime: '10:00' }]).errors[0], /real date/);
  assert.equal(checkCreateEvents([{ title: 'x', date: '2028-02-29', startTime: '10:00' }]).errors.length, 0);
});

test('a multi-event create with one bad event returns no events, only errors', () => {
  const r = checkCreateEvents([
    { title: 'Gym', date: '2026-11-16', weekday: 'Mon', startTime: '07:00' },
    { title: 'Gym', date: '2026-11-18', weekday: 'Tue', startTime: '07:00' },
    { title: 'Gym', date: '2026-11-20', weekday: 'Fri', startTime: '7am' }
  ]);
  assert.deepEqual(r.events, []);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /^Event 2: /);
  assert.match(r.errors[1], /^Event 3: startTime "7am"/);
  assert.match(checkCreateEvents([]).errors[0], /non-empty/);
  assert.match(checkCreateEvents('x').errors[0], /non-empty/);
});

test('cleanCreateEvents tolerates non-arrays', () => {
  assert.deepEqual(cleanCreateEvents(undefined), []);
  assert.deepEqual(cleanCreateEvents('x'), []);
});

test('knownIds filters unknown, dedupes, stringifies and caps', () => {
  const set = new Set(['a', 'b', '1', 'c']);
  assert.deepEqual(knownIds(['a', 'zzz', 'a', 'b', 1], set), ['a', 'b', '1']);
  assert.deepEqual(knownIds(['a', 'b', 'c'], set, 2), ['a', 'b']);
  assert.deepEqual(knownIds(null, set), []);
});
