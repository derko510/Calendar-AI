import axios from 'axios';

class GoogleCalendarService {
  constructor() {
    this.accessToken = null;
    this.baseURL = 'https://www.googleapis.com/calendar/v3';
  }

  setAccessToken(token) {
    this.accessToken = token;
  }

  async getCalendarList() {
    try {
      const response = await axios.get(`${this.baseURL}/users/me/calendarList`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar list:', error);
      throw error;
    }
  }

  async getEvents(calendarId = 'primary', timeMin = null, timeMax = null, maxResults = 250) {
    try {
      const params = {
        calendarId,
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      };

      const queryString = Object.entries(params)
        .filter(([_, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      const response = await axios.get(`${this.baseURL}/calendars/${calendarId}/events?${queryString}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }

  async createEvent(calendarId = 'primary', eventData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/calendars/${calendarId}/events`,
        eventData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  async updateEvent(calendarId = 'primary', eventId, eventData) {
    try {
      const response = await axios.put(
        `${this.baseURL}/calendars/${calendarId}/events/${eventId}`,
        eventData,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  async deleteEvent(calendarId = 'primary', eventId) {
    try {
      await axios.delete(`${this.baseURL}/calendars/${calendarId}/events/${eventId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return true;
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }
}

export default new GoogleCalendarService();