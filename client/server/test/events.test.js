import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEvent, normalizeEvents, eventStatus, formatWhen, toModelView, parseLocalBoundary, searchEvents } from '../src/assistant/events.js';

const TZ = 'UTC';
const LA = 'America/Los_Angeles';
const timed = (id, summary, start, end, extra = {}) => ({
  id, summary, start: { dateTime: start }, ...(end && { end: { dateTime: end } }), ...extra
});

test('all-day event: local midnight start, exclusive end', () => {
  const e = normalizeEvent({ id: 'a', summary: 'Holiday', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } }, LA);
  assert.equal(e.allDay, true);
  assert.equal(e.start.toISOString(), '2026-11-10T08:00:00.000Z');
  assert.equal(e.end.toISOString(), '2026-11-11T08:00:00.000Z');
});

test('all-day event without end defaults to the next day', () => {
  const e = normalizeEvent({ id: 'a', start: { date: '2026-11-10' } }, TZ);
  assert.equal(e.end.toISOString(), '2026-11-11T00:00:00.000Z');
  assert.equal(e.title, 'Untitled');
});

test('missing end becomes start + 1h; end before start is repaired', () => {
  const a = normalizeEvent(timed('a', 'X', '2026-11-10T10:00:00Z'), TZ);
  assert.equal(a.end.toISOString(), '2026-11-10T11:00:00.000Z');
  const b = normalizeEvent(timed('b', 'X', '2026-11-10T10:00:00Z', '2026-11-10T09:00:00Z'), TZ);
  assert.equal(b.end.toISOString(), '2026-11-10T11:00:00.000Z');
});

test('events without id or valid start are dropped; normalizeEvents sorts', () => {
  assert.equal(normalizeEvent({ summary: 'no id', start: { dateTime: '2026-11-10T10:00:00Z' } }, TZ), null);
  assert.equal(normalizeEvent({ id: 'x', summary: 'bad', start: { dateTime: 'nope' } }, TZ), null);
  const list = normalizeEvents([
    timed('late', 'L', '2026-11-12T10:00:00Z'),
    timed('early', 'E', '2026-11-10T10:00:00Z'),
    { summary: 'junk' }
  ], TZ);
  assert.deepEqual(list.map(e => e.id), ['early', 'late']);
});

test('HTML stripped from description', () => {
  const e = normalizeEvent(timed('a', 'X', '2026-11-10T10:00:00Z', null, { description: '<p>Bring <b>laptop</b>&nbsp;now</p>' }), TZ);
  assert.equal(e.description, 'Bring laptop now');
});

test('eventStatus boundaries', () => {
  const e = normalizeEvent(timed('a', 'X', '2026-11-10T10:00:00Z', '2026-11-10T11:00:00Z'), TZ);
  assert.equal(eventStatus(e, new Date('2026-11-10T09:59:59Z')), 'upcoming');
  assert.equal(eventStatus(e, new Date('2026-11-10T10:00:00Z')), 'now');
  assert.equal(eventStatus(e, new Date('2026-11-10T10:59:59Z')), 'now');
  assert.equal(eventStatus(e, new Date('2026-11-10T11:00:00Z')), 'past');
});

test('formatWhen and toModelView', () => {
  const e = normalizeEvent(timed('a', 'Dentist', '2026-11-10T17:00:00Z', '2026-11-10T18:00:00Z', { location: 'Main St' }), LA);
  const when = formatWhen(e, LA);
  assert.match(when, /Tue, Nov 10, 2026/);
  assert.match(when, /9:00\s?AM/);
  assert.match(when, /10:00\s?AM/);
  const view = toModelView(e, new Date('2026-11-01T00:00:00Z'), LA);
  assert.deepEqual(Object.keys(view).sort(), ['id', 'location', 'status', 'title', 'when']);
  assert.equal(view.status, 'upcoming');
  const allDay = normalizeEvent({ id: 'b', start: { date: '2026-11-10' } }, LA);
  assert.match(formatWhen(allDay, LA), /Tue, Nov 10, 2026 \(all day\)/);
  assert.equal('location' in toModelView(allDay, new Date(), LA), false);
});

test('parseLocalBoundary', () => {
  assert.equal(parseLocalBoundary('2026-11-10', LA).toISOString(), '2026-11-10T08:00:00.000Z');
  assert.equal(parseLocalBoundary('2026-11-10T14:30', LA).toISOString(), '2026-11-10T22:30:00.000Z');
  assert.equal(parseLocalBoundary('garbage', LA), null);
  assert.equal(parseLocalBoundary('2026-11-10T25:00', LA), null);
  assert.equal(parseLocalBoundary('', LA), null);
  assert.equal(parseLocalBoundary(undefined, LA), null);
});

const NOW = new Date('2026-11-10T12:00:00Z');
const events = normalizeEvents([
  timed('1', 'Dentist checkup', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', { location: 'Smile Clinic' }),
  timed('2', 'Team Standup', '2026-11-10T11:30:00Z', '2026-11-10T12:30:00Z', { description: 'Weekly <b>sync</b>' }),
  timed('3', 'Lunch', '2026-11-10T18:00:00Z', '2026-11-10T19:00:00Z', { location: 'Cafe NYC' }),
  timed('4', 'Dinner', '2026-11-11T02:00:00Z', '2026-11-11T03:00:00Z'),
  timed('5', 'Conference', '2026-11-09T20:00:00Z', '2026-11-10T04:00:00Z'),
  timed('6', 'Dental cleaning', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')
], TZ);
const ctx = { now: NOW, timeZone: TZ };
const ids = r => r.events.map(e => e.id);

test('search: keywords any-match, case-insensitive, across title/location/description', () => {
  assert.deepEqual(ids(searchEvents(events, { keywords: ['DENTIST', 'dental'] }, ctx)), ['1', '6']);
  assert.deepEqual(ids(searchEvents(events, { keywords: ['nyc'] }, ctx)), ['3']);
  assert.deepEqual(ids(searchEvents(events, { keywords: ['sync'] }, ctx)), ['2']);
  assert.deepEqual(ids(searchEvents(events, { keywords: 'smile' }, ctx)), ['1']);
  assert.equal(searchEvents(events, { keywords: ['zzz'] }, ctx).total, 0);
  assert.equal(searchEvents(events, { keywords: ['', '  '] }, ctx).total, 6);
  assert.equal(searchEvents(events, {}, ctx).total, 6);
});

test('search: status filter', () => {
  assert.deepEqual(ids(searchEvents(events, { status: 'past' }, ctx)), ['1', '5']);
  assert.deepEqual(ids(searchEvents(events, { status: 'now' }, ctx)), ['2']);
  assert.deepEqual(ids(searchEvents(events, { status: 'upcoming' }, ctx)), ['3', '4', '6']);
});

test('search: order asc/desc and total reflects pre-limit count', () => {
  assert.deepEqual(ids(searchEvents(events, { order: 'desc' }, ctx)), ['6', '4', '3', '2', '5', '1']);
  const r = searchEvents(events, { limit: 2 }, ctx);
  assert.equal(r.total, 6);
  assert.deepEqual(ids(r), ['1', '5']);
});

test('search: limit clamps to 1..50 and defaults to 10', () => {
  const many = normalizeEvents(Array.from({ length: 40 }, (_, i) =>
    timed(`m${i}`, `E${i}`, new Date(Date.UTC(2026, 11, 1, i)).toISOString())), TZ);
  assert.equal(searchEvents(many, { limit: 1000 }, ctx).events.length, 40);
  assert.equal(searchEvents(many, { limit: 30 }, ctx).events.length, 30);
  assert.equal(searchEvents(many, { limit: 0 }, ctx).events.length, 10);
  assert.equal(searchEvents(many, { limit: -5 }, ctx).events.length, 1);
  assert.equal(searchEvents(many, { limit: 'abc' }, ctx).events.length, 10);
  assert.equal(searchEvents(many, {}, ctx).events.length, 10);
  assert.equal(searchEvents(many, { limit: 3 }, ctx).events.length, 3);
});

test('search: bare-date "to" includes the whole day', () => {
  // Conference overlaps Nov 10, Standup 11:30, Lunch 18:00; Dinner starts 02:00 on Nov 11
  assert.deepEqual(ids(searchEvents(events, { from: '2026-11-10', to: '2026-11-10' }, ctx)), ['5', '2', '3']);
  assert.ok(ids(searchEvents(events, { from: '2026-11-10', to: '2026-11-11' }, ctx)).includes('4'));
  // with a time, "to" is exact
  assert.equal(ids(searchEvents(events, { from: '2026-11-10', to: '2026-11-10T17:00' }, ctx)).includes('3'), false);
});

test('search: overlap semantics for from/to', () => {
  // Conference runs Nov 9 20:00 -> Nov 10 04:00; a window starting Nov 10 00:00 still includes it
  assert.ok(ids(searchEvents(events, { from: '2026-11-10' }, ctx)).includes('5'));
  // an event ending exactly at "from" is excluded
  assert.equal(ids(searchEvents(events, { from: '2026-11-10T04:00' }, ctx)).includes('5'), false);
  // an event starting exactly at "to" is excluded (to as date-time)
  assert.equal(ids(searchEvents(events, { to: '2026-11-10T11:30' }, ctx)).includes('2'), false);
  assert.ok(ids(searchEvents(events, { to: '2026-11-10T11:31' }, ctx)).includes('2'));
});

test('search: unparseable boundaries are a tool error naming the formats (not the whole calendar)', () => {
  for (const from of ['tomorrow', '11/11/2026', 'soon', 5]) {
    const r = searchEvents(events, { from }, ctx);
    assert.equal(r.events, undefined, String(from));
    assert.match(r.error, /YYYY-MM-DD or YYYY-MM-DDTHH:MM/);
  }
  assert.match(searchEvents(events, { to: '2026-11-10T25:00' }, ctx).error, /to "2026-11-10T25:00"/);
  // empty / null boundaries are simply absent
  assert.equal(searchEvents(events, { from: '', to: null }, ctx).total, 6);
});

test('search: H:MM and seconds are accepted in the time part', () => {
  assert.deepEqual(ids(searchEvents(events, { from: '2026-11-10T9:00', to: '2026-11-10T12:00' }, ctx)), ['2']);
  assert.deepEqual(ids(searchEvents(events, { from: '2026-11-10T03:00:00', to: '2026-11-10T12:00:00' }, ctx)), ['5', '2']);
});

test('search: unknown status is an error; all/any mean no filter', () => {
  assert.match(searchEvents(events, { status: 'future' }, ctx).error, /past, now, upcoming/);
  assert.equal(searchEvents(events, { status: 'all' }, ctx).total, 6);
  assert.equal(searchEvents(events, { status: 'ANY' }, ctx).total, 6);
  assert.equal(searchEvents(events, { status: 'Upcoming' }, ctx).total, 3);
});

test('search: 0 results under a status filter reports the other statuses', () => {
  const r = searchEvents(events, { keywords: ['standup'], status: 'upcoming' }, ctx);
  assert.equal(r.total, 0);
  assert.deepEqual(r.otherStatuses, { now: 1 });
  assert.equal(searchEvents(events, { keywords: ['zzz'], status: 'upcoming' }, ctx).otherStatuses, undefined);
});

test('search: a phrase matches when all its words appear, in any order', () => {
  const list = normalizeEvents([
    timed('o', 'Interview with Orbital Labs', '2026-11-10T13:30:00Z'),
    timed('n', 'Interview Northwind', '2026-11-11T15:00:00Z'),
    timed('d', 'Dinner with John', '2026-11-12T19:00:00Z')
  ], TZ);
  assert.deepEqual(ids(searchEvents(list, { keywords: ['Orbital Labs interview'] }, ctx)), ['o']);
  assert.deepEqual(ids(searchEvents(list, { keywords: ['dinner w/ john'] }, ctx)), ['d']);
  assert.deepEqual(ids(searchEvents(list, { keywords: ['Orbital Labs interview', 'northwind'] }, ctx)), ['o', 'n']);
});

test('search: events matching more distinct keywords rank first', () => {
  const list = normalizeEvents([
    ...Array.from({ length: 6 }, (_, i) => timed(`l${i}`, 'CS 170 Lecture', `2026-11-1${i}T11:00:00Z`)),
    timed('final', 'CS 170 Final Exam', '2026-12-17T08:00:00Z')
  ], TZ);
  const r = searchEvents(list, { keywords: ['CS 170', 'final'], limit: 5, status: 'upcoming' }, ctx);
  assert.equal(r.events[0].id, 'final');
  assert.equal(r.total, 6); // l0 (Nov 10 11:00 UTC) is already past at NOW
});

test('search: synonyms of one thing count once, so "last dentist" stays date-ordered', () => {
  const list = normalizeEvents([
    timed('sep', 'Dentist cleaning', '2026-09-14T10:00:00Z', null, { location: 'Bright Smile Dental' }),
    timed('oct', 'Dental checkup', '2026-10-20T15:00:00Z', null, { location: 'Bright Smile Dental' })
  ], TZ);
  assert.deepEqual(ids(searchEvents(list, { keywords: ['dentist', 'dental'], status: 'past', order: 'desc' }, ctx)), ['oct', 'sep']);
});

test('search: code-side synonyms, stems and short-word tokens', () => {
  const list = normalizeEvents([
    timed('dr', 'Dr. Patel annual physical', '2026-10-02T09:00:00Z'),
    timed('drinks', 'Drinks with Sam', '2026-10-03T19:00:00Z'),
    timed('fl', 'Flight to NYC', '2026-11-20T08:00:00Z', null, { location: 'SFO' }),
    timed('bd', "Mom's birthday", '2026-11-14T00:00:00Z'),
    timed('lec', 'CS170 Lecture', '2026-11-12T11:00:00Z'),
    timed('dent', 'Dental checkup', '2026-10-20T15:00:00Z')
  ], TZ);
  const find = k => ids(searchEvents(list, { keywords: k }, ctx)).sort();
  assert.deepEqual(find(['doctor']), ['dr']); // "dr" is a whole token, so "Drinks" doesn't match
  assert.deepEqual(find(['new york']), ['fl']);
  assert.deepEqual(find(['flying']), ['fl']);
  assert.deepEqual(find(['moms bday']), ['bd']);
  assert.deepEqual(find(["mom's birthday"]), ['bd']);
  assert.deepEqual(find(['class']), ['lec']);
  assert.deepEqual(find(['cs 170']), ['lec']);
  assert.deepEqual(find(['dentist appointment']), ['dent']);
  assert.deepEqual(find(['lectures']), ['lec']);
});

test('search: a zero-length event at midnight belongs to its own day', () => {
  const list = normalizeEvents([timed('z', 'Reminder', '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')], TZ);
  assert.deepEqual(ids(searchEvents(list, { from: '2026-11-10', to: '2026-11-10' }, ctx)), ['z']);
  assert.deepEqual(ids(searchEvents(list, { from: '2026-11-09', to: '2026-11-09' }, ctx)), []);
});

test('formatWhen shows the end date for multi-day events', () => {
  const trip = normalizeEvent({ id: 't', start: { date: '2026-11-20' }, end: { date: '2026-11-24' } }, LA);
  assert.equal(formatWhen(trip, LA), 'Fri, Nov 20 – Mon, Nov 23, 2026 (all day)');
  const newYear = normalizeEvent({ id: 'y', start: { date: '2026-12-30' }, end: { date: '2027-01-02' } }, LA);
  assert.equal(formatWhen(newYear, LA), 'Wed, Dec 30, 2026 – Fri, Jan 1, 2027 (all day)');
  const party = normalizeEvent(timed('p', 'Party', '2026-11-14T06:00:00Z', '2026-11-14T09:00:00Z'), LA); // Fri 10 PM → Sat 1 AM
  assert.match(formatWhen(party, LA), /^Fri, Nov 13, 2026, 10:00\sPM – Sat, Nov 14, 1:00\sAM$/);
  const single = normalizeEvent(timed('s', 'S', '2026-11-14T18:00:00Z', '2026-11-14T19:00:00Z'), LA);
  assert.doesNotMatch(formatWhen(single, LA), /Sat.*Sat/);
});

test('search: window evaluated in the user time zone', () => {
  const tzEvents = normalizeEvents([timed('x', 'Late', '2026-11-11T05:00:00Z', '2026-11-11T06:00:00Z')], LA); // Nov 10 21:00 PST
  assert.equal(searchEvents(tzEvents, { from: '2026-11-10', to: '2026-11-10' }, { now: NOW, timeZone: LA }).total, 1);
  assert.equal(searchEvents(tzEvents, { from: '2026-11-11', to: '2026-11-11' }, { now: NOW, timeZone: LA }).total, 0);
});
