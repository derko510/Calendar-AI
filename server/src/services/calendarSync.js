import { google } from 'googleapis';
import { db } from '../db/connection.js';
import { calendarEvents, users } from '../db/schema.js';
import { eq, and, gte, lte, or, ilike, desc } from 'drizzle-orm';

export class CalendarSyncService {
  constructor() {
    this.calendar = google.calendar('v3');
  }

  async syncUserCalendar(userId, accessToken) {
    try {
      console.log(`Starting sync for user ${userId}...`);
      
      // Set up OAuth2 client
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      // Get user's calendar events from Google
      const response = await this.calendar.events.list({
        auth: oauth2Client,
        calendarId: 'primary',
        timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
        timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
        maxResults: 2500,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      
      // Sync events to database
      for (const event of events) {
        await this.upsertEvent(userId, event);
      }

      console.log(`Synced ${events.length} events for user ${userId}`);
      return events.length;
    } catch (error) {
      console.error('Error syncing calendar:', error);
      throw error;
    }
  }

  async upsertEvent(userId, googleEvent) {
    try {
      const eventData = {
        userId,
        googleEventId: googleEvent.id,
        title: googleEvent.summary || 'No Title',
        description: googleEvent.description || null,
        startDatetime: this.parseDateTime(googleEvent.start),
        endDatetime: this.parseDateTime(googleEvent.end),
        location: googleEvent.location || null,
        attendees: googleEvent.attendees?.map(a => a.email) || [],
        recurrence: googleEvent.recurrence?.join(',') || null,
        isAllDay: !!(googleEvent.start?.date), // All-day events have date instead of dateTime
        updatedAt: new Date(),
      };

      // Check if event exists
      const existingEvent = await db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.googleEventId, googleEvent.id),
            eq(calendarEvents.userId, userId)
          )
        )
        .limit(1);

      if (existingEvent.length > 0) {
        // Update existing event
        await db
          .update(calendarEvents)
          .set(eventData)
          .where(
            and(
              eq(calendarEvents.googleEventId, googleEvent.id),
              eq(calendarEvents.userId, userId)
            )
          );
      } else {
        // Insert new event
        await db.insert(calendarEvents).values(eventData);
      }
    } catch (error) {
      console.error('Error upserting event:', error);
      throw error;
    }
  }

  parseDateTime(dateTimeObj) {
    if (!dateTimeObj) return null;
    
    // All-day events have 'date' field, timed events have 'dateTime' field
    const dateString = dateTimeObj.dateTime || dateTimeObj.date;
    return dateString ? new Date(dateString) : null;
  }

  async getUserEvents(userId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        searchTerm,
        limit = 100
      } = options;

      let query = db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.userId, userId));

      // Add date filters if provided
      if (startDate) {
        query = query.where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.startDatetime, startDate)
          )
        );
      }

      if (endDate) {
        query = query.where(
          and(
            eq(calendarEvents.userId, userId),
            lte(calendarEvents.startDatetime, endDate)
          )
        );
      }

      // Add search filter if provided
      if (searchTerm) {
        query = query.where(
          and(
            eq(calendarEvents.userId, userId),
            or(
              ilike(calendarEvents.title, `%${searchTerm}%`),
              ilike(calendarEvents.description, `%${searchTerm}%`),
              ilike(calendarEvents.location, `%${searchTerm}%`)
            )
          )
        );
      }

      const events = await query
        .orderBy(desc(calendarEvents.startDatetime))
        .limit(limit);

      return events;
    } catch (error) {
      console.error('Error fetching user events:', error);
      throw error;
    }
  }
}