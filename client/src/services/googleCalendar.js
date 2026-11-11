import { getAccessToken } from './auth';
import { dedupeAcrossCalendars, isDefaultVisible } from '../utils/calendarData';

const API = 'https://www.googleapis.com/calendar/v3';
const WRITABLE_ROLES = new Set(['owner', 'writer']);

const query = (params = {}) => {
  const s = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return s ? `?${s}` : '';
};

/** An HTTP error from Google with a readable message: "<Google's reason> (HTTP 400)". */
export class GoogleApiError extends Error {
  constructor(status, data, statusText) {
    const g = data && typeof data === 'object' ? data.error : null;
    const reason = (g && (g.message || g.errors?.[0]?.message)) || (typeof data === 'string' && data.trim().slice(0, 200)) || statusText || 'Request failed';
    super(`${reason} (HTTP ${status})`);
    this.name = 'GoogleApiError';
    this.status = status;
    this.reason = g?.errors?.[0]?.reason || g?.status || null;
    this.response = { status, data }; // same shape callers used with axios
  }
}

// 403 because the token lacks calendar.readonly (older sign-ins only granted calendar.events)
const isInsufficientScope = (err) =>
  err?.status === 403 && /insufficient|scope/i.test(`${err.message} ${JSON.stringify(err.response?.data || '')}`);

const sendUpdatesParam = (options) =>
  (options?.sendUpdates === 'all' || options?.sendUpdates === 'none' || options?.sendUpdates === 'externalOnly') ? options.sendUpdates : undefined;

/** Calendar list entry → the fields the app uses. */
const normalizeCalendar = (cal) => ({
  id: cal.id,
  summary: cal.summaryOverride || cal.summary || (cal.primary ? 'Primary calendar' : cal.id),
  backgroundColor: cal.backgroundColor || null,
  accessRole: cal.accessRole || 'reader',
  writable: WRITABLE_ROLES.has(cal.accessRole),
  primary: !!cal.primary,
  selected: !!cal.selected,
  limited: !!cal.limited
});

// Each event carries what the UI needs about its calendar
const tagEvent = (event, cal) => ({
  ...event,
  calendarId: cal.id,
  calendarName: cal.summary,
  calendarColor: cal.backgroundColor,
  calendarPrimary: cal.primary,
  isWritable: cal.writable
});

class GoogleCalendarService {
  // Kept for older callers: tokens now come from services/auth.js on every request
  setAccessToken(_token) {}

  // Every Calendar API call goes through here: fresh token each time, one retry after a forced refresh on 401
  async request({ method = 'GET', path, params, body }) {
    const send = async (token) => {
      let res;
      try {
        res = await fetch(`${API}${path}${query(params)}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined && { 'Content-Type': 'application/json' })
          },
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
      } catch (err) {
        throw new Error(`Couldn’t reach Google Calendar — check your connection (${err?.message || 'network error'})`);
      }
      const text = await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!res.ok) throw new GoogleApiError(res.status, data, res.statusText);
      return data;
    };
    try {
      return await send(await getAccessToken());
    } catch (error) {
      if (error?.status !== 401) throw error;
      return send(await getAccessToken({ force: true }));
    }
  }

  /**
   * The user's calendars. Falls back to just the primary calendar only when the token lacks the
   * calendar-list scope; any other failure throws (so a refresh can't silently drop calendars).
   */
  async listCalendars() {
    try {
      const items = [];
      let pageToken;
      do {
        const data = await this.request({ path: '/users/me/calendarList', params: { maxResults: 250, pageToken } });
        items.push(...(data?.items || []));
        pageToken = data?.nextPageToken;
      } while (pageToken);
      return items.filter(c => !c.deleted).map(normalizeCalendar);
    } catch (error) {
      if (isInsufficientScope(error)) {
        return [normalizeCalendar({ id: 'primary', summary: 'Primary calendar', accessRole: 'owner', primary: true, selected: true, limited: true })];
      }
      throw error;
    }
  }

  // Kept for older callers
  async getCalendarList() {
    return this.listCalendars();
  }

  // Follows nextPageToken until the window is fully loaded (or maxResults is reached),
  // so a busy calendar isn't silently cut off at Google's per-page limit
  async getEvents(calendarId = 'primary', timeMin = null, timeMax = null, maxResults = 5000) {
    const items = [];
    let pageToken;
    do {
      const data = await this.request({
        path: `/calendars/${encodeURIComponent(calendarId)}/events`,
        params: {
          timeMin: timeMin || new Date().toISOString(),
          timeMax,
          maxResults: Math.min(2500, maxResults - items.length),
          singleEvents: true,
          orderBy: 'startTime',
          pageToken
        }
      });
      items.push(...(data?.items || []));
      pageToken = data?.nextPageToken;
    } while (pageToken && items.length < maxResults);
    return items.map(e => ({ ...e, calendarId }));
  }

  /**
   * Events of several calendars in [timeMin, timeMax).
   * Returns { events, failed: [{ calendar, error }] } when at least one calendar loaded;
   * throws when every calendar failed.
   */
  async getEventsForCalendars(calendars, timeMin, timeMax, maxResults = 5000) {
    if (!calendars.length) return { events: [], failed: [] };
    const results = await Promise.allSettled(
      calendars.map(cal => this.getEvents(cal.id, timeMin, timeMax, maxResults).then(list => list.map(e => tagEvent(e, cal))))
    );
    const events = [];
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') events.push(...r.value);
      else failed.push({ calendar: calendars[i], error: r.reason });
    });
    if (failed.length === calendars.length) throw failed[0].error;
    return { events, failed };
  }

  // Kept for older callers: visible calendars, de-duplicated. Throws instead of returning [] on failure.
  async getAllCalendarEvents(timeMin = null, timeMax = null, maxResults = 5000) {
    const calendars = (await this.listCalendars()).filter(isDefaultVisible);
    const { events } = await this.getEventsForCalendars(calendars, timeMin, timeMax, maxResults);
    return dedupeAcrossCalendars(events);
  }

  async createEvent(calendarId = 'primary', eventData, options = {}) {
    return this.request({
      method: 'POST',
      path: `/calendars/${encodeURIComponent(calendarId)}/events`,
      params: { sendUpdates: sendUpdatesParam(options) },
      body: eventData
    });
  }

  async updateEvent(calendarId = 'primary', eventId, eventData, options = {}) {
    return this.request({
      method: 'PUT',
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      params: { sendUpdates: sendUpdatesParam(options) },
      body: eventData
    });
  }

  // PATCH sends only the changed fields, so an edit can't overwrite changes made elsewhere to other fields.
  // Nested objects are merged by Google: send null to clear a field (see utils/eventForm.js).
  async patchEvent(calendarId = 'primary', eventId, changes, options = {}) {
    return this.request({
      method: 'PATCH',
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      params: { sendUpdates: sendUpdatesParam(options) },
      body: changes
    });
  }

  // RSVP: the full attendees list with only the signed-in guest's answer changed. No sendUpdates, so nobody is emailed.
  async respondToEvent(calendarId = 'primary', eventId, attendees) {
    return this.patchEvent(calendarId, eventId, { attendees });
  }

  async deleteEvent(calendarId = 'primary', eventId, options = {}) {
    try {
      await this.request({
        method: 'DELETE',
        path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        params: { sendUpdates: sendUpdatesParam(options) }
      });
    } catch (error) {
      if (error?.status !== 410) throw error; // 410 Gone: already deleted, which is what we wanted
    }
    return true;
  }
}

export default new GoogleCalendarService();
