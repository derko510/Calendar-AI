import { pgTable, serial, varchar, text, timestamp, integer, boolean, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  googleId: varchar('google_id', { length: 255 }).unique().notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  accessToken: text('access_token'), // Google OAuth access token for API calls
  createdAt: timestamp('created_at').defaultNow(),
});

export const calendarEvents = pgTable('calendar_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  googleEventId: varchar('google_event_id', { length: 255 }).notNull(),
  title: varchar('title', { length: 500 }),
  description: text('description'),
  startDatetime: timestamp('start_datetime'),
  endDatetime: timestamp('end_datetime'),
  location: varchar('location', { length: 500 }),
  attendees: text('attendees').array(),
  recurrence: text('recurrence'),
  isAllDay: boolean('is_all_day').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  // Full-text search will be handled by PostgreSQL triggers
}, (table) => {
  return {
    // Composite unique constraint: same Google event can exist for different users
    userEventUnique: unique().on(table.userId, table.googleEventId)
  };
});