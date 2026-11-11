import axios from 'axios';
import { getAccessToken } from './auth';

class GoogleCalendarService {
  constructor() {
    this.baseURL = 'https://www.googleapis.com/calendar/v3';
  }

  // Kept for older callers: tokens now come from services/auth.js on every request
  setAccessToken(_token) {}

  // Every Calendar API call goes through here: fresh token each time, one retry after a forced refresh on 401
  async request(config) {
    const send = token => axios({
      ...config,
      headers: { ...config.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    try {
      return await send(await getAccessToken());
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
      return send(await getAccessToken({ force: true }));
    }
  }

  async getCalendarList() {
    try {
      const response = await this.request({ method: 'get', url: `${this.baseURL}/users/me/calendarList` });
      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar list:', error);
      throw error;
    }
  }

  // Follows nextPageToken until the window is fully loaded (or maxResults is reached),
  // so a busy calendar isn't silently cut off at Google's per-page limit
  async getEvents(calendarId = 'primary', timeMin = null, timeMax = null, maxResults = 2500) {
    try {
      const items = [];
      let pageToken;
      do {
        const params = {
          timeMin: timeMin || new Date().toISOString(),
          timeMax,
          maxResults: Math.min(2500, maxResults - items.length),
          singleEvents: true,
          orderBy: 'startTime',
          pageToken
        };
        const queryString = Object.entries(params)
          .filter(([, value]) => value !== null && value !== undefined)
          .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
          .join('&');

        const response = await this.request({
          method: 'get',
          url: `${this.baseURL}/calendars/${encodeURIComponent(calendarId)}/events?${queryString}`
        });
        items.push(...(response.data.items || []));
        pageToken = response.data.nextPageToken;
      } while (pageToken && items.length < maxResults);

      return items.map(e => ({ ...e, calendarId }));
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }

  async getAllCalendarEvents(timeMin = null, timeMax = null, maxResults = 2500) {
    // calendarList needs calendar.readonly; older tokens only have calendar.events
    let calendars;
    try {
      calendars = await this.getCalendarList();
    } catch {
      calendars = [{ id: 'primary', accessRole: 'owner' }];
    }
    const writableRoles = new Set(['owner', 'writer']);
    const results = await Promise.allSettled(
      calendars.map(cal => this.getEvents(cal.id, timeMin, timeMax, maxResults).then(evts =>
        evts.map(e => ({
          ...e,
          isWritable: writableRoles.has(cal.accessRole),
          calendarName: cal.summaryOverride || cal.summary || (cal.id === 'primary' ? 'Primary calendar' : cal.id)
        }))
      ))
    );
    const seen = new Set();
    return results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
  }

  async createEvent(calendarId = 'primary', eventData) {
    try {
      const response = await this.request({
        method: 'post',
        url: `${this.baseURL}/calendars/${encodeURIComponent(calendarId)}/events`,
        data: eventData
      });
      return response.data;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  async updateEvent(calendarId = 'primary', eventId, eventData) {
    try {
      const response = await this.request({
        method: 'put',
        url: `${this.baseURL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        data: eventData
      });
      return response.data;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  // PATCH sends only the changed fields, so an edit can't overwrite changes made elsewhere to other fields
  async patchEvent(calendarId = 'primary', eventId, changes) {
    try {
      const response = await this.request({
        method: 'patch',
        url: `${this.baseURL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        data: changes
      });
      return response.data;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  async deleteEvent(calendarId = 'primary', eventId) {
    try {
      await this.request({
        method: 'delete',
        url: `${this.baseURL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      });
      return true;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }
}

export default new GoogleCalendarService();
