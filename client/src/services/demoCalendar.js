// In-memory stand-in for services/googleCalendar.js used by /?demo.
// Same method names, return shapes and failure modes; nothing leaves the browser except chat questions.
import { addDays, format } from 'date-fns';
import { buildDemoEvents } from '../demo/sampleEvents';
import { getEventStart, getEventEnd } from '../utils/eventUtils';
import { dedupeAcrossCalendars, isDefaultVisible } from '../utils/calendarData';

const LATENCY_MS = 120;
const wait = () => new Promise(resolve => setTimeout(resolve, LATENCY_MS));
const clone = (value) => JSON.parse(JSON.stringify(value));
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const CALENDARS = [
  { id: 'primary', summary: 'Personal', backgroundColor: '#5873A0', accessRole: 'owner', primary: true, selected: true },
  { id: 'work@demo.example', summary: 'Work', backgroundColor: '#C4502B', accessRole: 'owner', selected: true },
  { id: 'jobs@demo.example', summary: 'Job search', backgroundColor: '#B58B2A', accessRole: 'owner', selected: true },
  { id: 'classes@demo.example', summary: 'Classes', backgroundColor: '#8D5E95', accessRole: 'owner', selected: true },
  { id: 'team@example.com', summary: 'Team calendar', backgroundColor: '#4E8A8F', accessRole: 'reader', selected: true },
  // Like Google's holiday calendar for someone who unticked it: listed, but not loaded by default
  { id: 'holidays@demo.example', summary: 'Holidays', backgroundColor: '#6E8F68', accessRole: 'reader', selected: false }
].map(cal => ({ ...cal, writable: cal.accessRole === 'owner' || cal.accessRole === 'writer', primary: !!cal.primary, limited: false }));

const calendarFor = (id) => CALENDARS.find(c => c.id === id);

// The sample data puts every personal event on 'primary' with a calendarName; give each its own calendar
const CALENDAR_BY_NAME = { Work: 'work@demo.example', 'Job search': 'jobs@demo.example', Classes: 'classes@demo.example' };

const nthWeekday = (year, month, weekday, n) => {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
};

const holidayEvents = (now) => {
  const out = [];
  for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 1; year++) {
    [
      ['New Year’s Day', new Date(year, 0, 1)],
      ['Martin Luther King Jr. Day', nthWeekday(year, 0, 1, 3)],
      ['Independence Day', new Date(year, 6, 4)],
      ['Labor Day', nthWeekday(year, 8, 1, 1)],
      ['Veterans Day', new Date(year, 10, 11)],
      ['Thanksgiving', nthWeekday(year, 10, 4, 4)],
      ['Christmas Day', new Date(year, 11, 25)]
    ].forEach(([summary, day]) => out.push({
      kind: 'calendar#event',
      id: `demoholiday${format(day, 'yyyyMMdd')}`,
      status: 'confirmed',
      summary,
      start: { date: format(day, 'yyyy-MM-dd') },
      end: { date: format(addDays(day, 1), 'yyyy-MM-dd') },
      transparency: 'transparent',
      calendarId: 'holidays@demo.example'
    }));
  }
  return out;
};

// Google's PATCH: nested objects merge, null clears a field, everything else replaces
const mergePatch = (target, patch) => {
  const out = { ...target };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null) delete out[key];
    else if (isPlainObject(value) && isPlainObject(out[key])) out[key] = mergePatch(out[key], value);
    else out[key] = clone(value);
  });
  return out;
};

const demoError = (status, message) => Object.assign(new Error(`${message} (HTTP ${status})`), { status, response: { status, data: { error: { code: status, message } } } });

// Reject what Google rejects, so the demo exercises the same paths as the real calendar
const validateTimes = (event) => {
  for (const key of ['start', 'end']) {
    const t = event[key];
    if (!t || (!t.date && !t.dateTime)) throw demoError(400, `Missing ${key} time.`);
    if (t.date && t.dateTime) throw demoError(400, 'Invalid start time.');
  }
  if (!!event.start.date !== !!event.end.date) throw demoError(400, 'Start and end times must either both be date or both be dateTime.');
  if (getEventEnd(event) < getEventStart(event)) throw demoError(400, 'The specified time range is empty.');
};

const DEMO_SELF = { email: 'you@example.com', displayName: 'You', self: true, responseStatus: 'needsAction' };

// Make sure two upcoming timed events can be answered in the demo (the sample data has only one).
// Invitations that already list guests get a self entry; if that is not enough, the first upcoming
// one-off events become invitations from a host.
const addDemoInvitations = (events, now) => {
  const upcoming = events
    .filter(e => e.start?.dateTime && !e.recurringEventId && getEventStart(e) > now)
    .sort((a, b) => getEventStart(a) - getEventStart(b));
  const answerable = (e) => !!e.attendees?.some(a => a.self) && !e.organizer?.self;
  let count = upcoming.filter(answerable).length;
  for (const e of upcoming) {
    if (count >= 2) break;
    if (Array.isArray(e.attendees) && !e.attendees.some(a => a.self) && !e.organizer?.self) {
      e.attendees = [...e.attendees, { ...DEMO_SELF }];
      count++;
    }
  }
  for (const e of upcoming) {
    if (count >= 2) break;
    if (!e.attendees) {
      e.attendees = [
        { email: 'host@example.com', displayName: 'Host', organizer: true, responseStatus: 'accepted' },
        { ...DEMO_SELF }
      ];
      e.organizer = { email: 'host@example.com' };
      count++;
    }
  }
  return events;
};

class DemoCalendarService {
  constructor() {
    this.events = null;
    this.counter = 0;
  }

  // No-op: the real service needs a token, the demo does not
  setAccessToken() {}

  ensureLoaded() {
    if (!this.events) {
      const now = new Date();
      const sample = buildDemoEvents(now).map(e => {
        const { calendarName, isWritable: _w, ...rest } = e;
        const calendarId = (rest.calendarId || 'primary') === 'primary' && CALENDAR_BY_NAME[calendarName] ? CALENDAR_BY_NAME[calendarName] : rest.calendarId || 'primary';
        return { ...rest, calendarId };
      });
      this.events = [
        ...addDemoInvitations(sample, now),
        ...holidayEvents(now)
      ];
    }
    return this.events;
  }

  async listCalendars() {
    await wait();
    return clone(CALENDARS);
  }

  async getCalendarList() {
    return this.listCalendars();
  }

  async getEvents(calendarId = 'primary', timeMin = null, timeMax = null, maxResults = 5000) {
    await wait();
    const min = timeMin ? new Date(timeMin) : new Date();
    const max = timeMax ? new Date(timeMax) : null;
    return this.ensureLoaded()
      .filter(e => (e.calendarId || 'primary') === calendarId)
      .filter(e => getEventEnd(e) > min && (!max || getEventStart(e) < max))
      .sort((a, b) => getEventStart(a) - getEventStart(b))
      .slice(0, maxResults)
      .map(clone);
  }

  async getEventsForCalendars(calendars, timeMin, timeMax, maxResults = 5000) {
    if (!calendars.length) return { events: [], failed: [] };
    const lists = await Promise.all(calendars.map(cal => this.getEvents(cal.id, timeMin, timeMax, maxResults)
      .then(list => list.map(e => ({ ...e, calendarId: cal.id, calendarName: cal.summary, calendarColor: cal.backgroundColor, calendarPrimary: cal.primary, isWritable: cal.writable })))));
    return { events: lists.flat(), failed: [] };
  }

  async getAllCalendarEvents(timeMin = null, timeMax = null, maxResults = 5000) {
    const { events } = await this.getEventsForCalendars(CALENDARS.filter(isDefaultVisible), timeMin, timeMax, maxResults);
    return dedupeAcrossCalendars(events);
  }

  assertWritable(calendarId) {
    if (!calendarFor(calendarId)?.writable) throw demoError(403, 'You need to have writer access to this calendar.');
  }

  async createEvent(calendarId = 'primary', eventData, _options = {}) {
    await wait();
    this.assertWritable(calendarId);
    const event = {
      kind: 'calendar#event',
      status: 'confirmed',
      ...clone(eventData),
      id: `demonew${Date.now().toString(36)}${(++this.counter).toString(36)}`,
      calendarId,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    validateTimes(event);
    this.ensureLoaded().push(event);
    return clone(event);
  }

  // PUT semantics, like the real service: eventData is the full new event
  async updateEvent(calendarId = 'primary', eventId, eventData, _options = {}) {
    await wait();
    const list = this.ensureLoaded();
    const index = list.findIndex(e => e.id === eventId && (e.calendarId || 'primary') === calendarId);
    if (index === -1) throw demoError(404, 'Not Found');
    this.assertWritable(calendarId);
    const { calendarName: _n, calendarColor: _c, calendarPrimary: _p, isWritable: _w, ...body } = clone(eventData);
    const updated = { ...body, id: eventId, calendarId, updated: new Date().toISOString() };
    validateTimes(updated);
    list[index] = updated;
    return clone(updated);
  }

  // PATCH semantics, like Google: nested objects (start, end) are merged and null clears a field
  async patchEvent(calendarId = 'primary', eventId, changes, options = {}) {
    const current = this.ensureLoaded().find(e => e.id === eventId && (e.calendarId || 'primary') === calendarId);
    if (!current) throw demoError(404, 'Not Found');
    return this.updateEvent(calendarId, eventId, mergePatch(clone(current), changes), options);
  }

  // RSVP: replaces the event's attendees array, like the real service's PATCH
  async respondToEvent(calendarId = 'primary', eventId, attendees) {
    await wait();
    const list = this.ensureLoaded();
    const index = list.findIndex(e => e.id === eventId && (e.calendarId || 'primary') === calendarId);
    if (index === -1) throw demoError(404, 'Not Found');
    list[index] = { ...clone(list[index]), attendees: clone(attendees), updated: new Date().toISOString() };
    return clone(list[index]);
  }

  async deleteEvent(calendarId = 'primary', eventId, _options = {}) {
    await wait();
    const list = this.ensureLoaded();
    const event = list.find(e => e.id === eventId && (e.calendarId || 'primary') === calendarId);
    if (!event) throw demoError(404, 'Not Found');
    this.assertWritable(calendarId);
    this.events = list.filter(e => e !== event);
    return true;
  }
}

export default new DemoCalendarService();
