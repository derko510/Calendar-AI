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

test('search: limit clamps to 1..25 and defaults to 10', () => {
  const many = normalizeEvents(Array.from({ length: 40 }, (_, i) =>
    timed(`m${i}`, `E${i}`, new Date(Date.UTC(2026, 11, 1, i)).toISOString())), TZ);
  assert.equal(searchEvents(many, { limit: 1000 }, ctx).events.length, 25);
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

test('search: invalid boundaries are ignored', () => {
  assert.equal(searchEvents(events, { from: 'soon', to: 'later' }, ctx).total, 6);
  assert.equal(searchEvents(events, { from: 5, to: {} }, ctx).total, 6);
});

test('search: window evaluated in the user time zone', () => {
  const tzEvents = normalizeEvents([timed('x', 'Late', '2026-11-11T05:00:00Z', '2026-11-11T06:00:00Z')], LA); // Nov 10 21:00 PST
  assert.equal(searchEvents(tzEvents, { from: '2026-11-10', to: '2026-11-10' }, { now: NOW, timeZone: LA }).total, 1);
  assert.equal(searchEvents(tzEvents, { from: '2026-11-11', to: '2026-11-11' }, { now: NOW, timeZone: LA }).total, 0);
});
