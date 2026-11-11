// In-memory stand-in for services/googleCalendar.js used by /?demo.
// Same method names and return shapes; nothing leaves the browser except chat questions.
import { buildDemoEvents } from '../demo/sampleEvents';
import { getEventStart, getEventEnd } from '../utils/eventUtils';

const LATENCY_MS = 120;
const wait = () => new Promise(resolve => setTimeout(resolve, LATENCY_MS));
const clone = (value) => JSON.parse(JSON.stringify(value));

class DemoCalendarService {
  constructor() {
    this.events = null;
    this.counter = 0;
  }

  // No-op: the real service needs a token, the demo does not
  setAccessToken() {}

  ensureLoaded() {
    if (!this.events) this.events = buildDemoEvents(new Date());
    return this.events;
  }

  async getCalendarList() {
    await wait();
    return [
      { id: 'primary', summary: 'Personal', accessRole: 'owner' },
      { id: 'team@example.com', summary: 'Team calendar', accessRole: 'reader' }
    ];
  }

  async getEvents(calendarId = 'primary', timeMin = null, timeMax = null, maxResults = 250) {
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

  async getAllCalendarEvents(timeMin = null, timeMax = null, maxResults = 250) {
    const lists = await Promise.all(['primary', 'team@example.com'].map(id => this.getEvents(id, timeMin, timeMax, maxResults)));
    return lists.flat();
  }

  async createEvent(calendarId = 'primary', eventData) {
    await wait();
    const event = {
      kind: 'calendar#event',
      status: 'confirmed',
      ...clone(eventData),
      id: `demonew${Date.now().toString(36)}${(++this.counter).toString(36)}`,
      calendarId,
      calendarName: 'Personal',
      isWritable: true,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    this.ensureLoaded().push(event);
    return clone(event);
  }

  // PUT semantics, like the real service: eventData is the full new event
  async updateEvent(calendarId = 'primary', eventId, eventData) {
    await wait();
    const list = this.ensureLoaded();
    const index = list.findIndex(e => e.id === eventId);
    if (index === -1) throw new Error('404 Not Found');
    if (list[index].isWritable === false) throw new Error('403 Forbidden');
    const updated = { ...clone(eventData), id: eventId, calendarId, calendarName: list[index].calendarName, isWritable: true, updated: new Date().toISOString() };
    list[index] = updated;
    return clone(updated);
  }

  // PATCH semantics: only the given fields change
  async patchEvent(calendarId = 'primary', eventId, changes) {
    const current = this.ensureLoaded().find(e => e.id === eventId);
    if (!current) throw new Error('404 Not Found');
    return this.updateEvent(calendarId, eventId, { ...clone(current), ...changes });
  }

  async deleteEvent(_calendarId, eventId) {
    await wait();
    const list = this.ensureLoaded();
    const event = list.find(e => e.id === eventId);
    if (!event) throw new Error('404 Not Found');
    if (event.isWritable === false) throw new Error('403 Forbidden');
    this.events = list.filter(e => e.id !== eventId);
    return true;
  }
}

export default new DemoCalendarService();
