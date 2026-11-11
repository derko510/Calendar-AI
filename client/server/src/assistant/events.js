// Turn raw Google Calendar events into one clean shape, and search them.
// All of the time logic ("next", "last", "right now", "tomorrow") lives here in code, not in the model.

import { zonedToUtc, isDateString, isTimeString, zonedParts, addDays } from './time.js';

const HOUR = 3600 * 1000;

// Google sends { start: { dateTime } } for timed events and { start: { date } } for all-day ones.
// All-day dates have no time zone, so they are pinned to midnight in the user's zone.
export function normalizeEvent(raw, timeZone) {
  const id = raw.id || raw.googleEventId;
  const allDay = !!(raw.start?.date && !raw.start?.dateTime) || !!raw.isAllDay;
  let start;
  let end;
  if (allDay) {
    const startDate = raw.start?.date || String(raw.startDatetime).slice(0, 10);
    const endDate = raw.end?.date || addDays(startDate, 1); // Google's all-day end date is exclusive
    start = zonedToUtc(startDate, '00:00', timeZone);
    end = zonedToUtc(endDate, '00:00', timeZone);
  } else {
    start = new Date(raw.start?.dateTime || raw.startDatetime);
    const rawEnd = raw.end?.dateTime || raw.endDatetime;
    end = rawEnd ? new Date(rawEnd) : new Date(start.getTime() + HOUR);
  }
  if (!id || Number.isNaN(start?.getTime())) return null;
  if (Number.isNaN(end.getTime()) || end < start) end = new Date(start.getTime() + HOUR);
  return {
    id,
    title: String(raw.summary || raw.title || 'Untitled').trim(),
    description: stripHtml(raw.description || ''),
    location: String(raw.location || '').trim(),
    start,
    end,
    allDay
  };
}

export function normalizeEvents(rawEvents = [], timeZone) {
  return rawEvents
    .map(e => normalizeEvent(e, timeZone))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

// PAST: already over. NOW: in progress. UPCOMING: hasn't started.
export function eventStatus(event, now) {
  if (event.end <= now) return 'past';
  if (event.start <= now) return 'now';
  return 'upcoming';
}

export function formatWhen(event, timeZone) {
  if (event.allDay) {
    const day = zonedParts(event.start, timeZone).date;
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    return `${label} (all day)`;
  }
  const opts = { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  const endTime = event.end.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return `${event.start.toLocaleString('en-US', opts)} – ${endTime}`;
}

// The view of an event the model sees: short, with status precomputed
export function toModelView(event, now, timeZone) {
  return {
    id: event.id,
    title: event.title,
    when: formatWhen(event, timeZone),
    status: eventStatus(event, now),
    ...(event.location && { location: event.location.slice(0, 120) })
  };
}

// Accepts "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" in the user's zone
export function parseLocalBoundary(value, timeZone) {
  if (typeof value !== 'string' || !value) return null;
  const [date, time] = value.trim().split(/[T ]/);
  if (!isDateString(date)) return null;
  if (time && !isTimeString(time.slice(0, 5))) return null;
  return zonedToUtc(date, time ? time.slice(0, 5) : '00:00', timeZone);
}

/**
 * Search with filters the model fills in. Everything here is deterministic and unit-tested.
 * keywords: any-match, case-insensitive, against title/location/description (the model supplies synonyms)
 * status:   'past' | 'now' | 'upcoming' relative to `now`
 * from/to:  local dates or date-times; an event matches if it overlaps [from, to)
 * order:    'asc' (soonest first) or 'desc' (most recent first)
 */
export function searchEvents(events, { keywords = [], status, from, to, order = 'asc', limit = 10 } = {}, { now, timeZone }) {
  const words = (Array.isArray(keywords) ? keywords : [keywords])
    .map(k => String(k).toLowerCase().trim())
    .filter(Boolean);
  const fromDate = parseLocalBoundary(from, timeZone);
  // A bare date for "to" means "through the end of that day"
  const toDate = typeof to === 'string' && isDateString(to.trim())
    ? zonedToUtc(addDays(to.trim(), 1), '00:00', timeZone)
    : parseLocalBoundary(to, timeZone);

  const matches = events.filter(event => {
    if (status && eventStatus(event, now) !== status) return false;
    if (fromDate && event.end <= fromDate) return false;
    if (toDate && event.start >= toDate) return false;
    if (words.length > 0) {
      const haystack = `${event.title} ${event.location} ${event.description}`.toLowerCase();
      if (!words.some(w => haystack.includes(w))) return false;
    }
    return true;
  });

  matches.sort((a, b) => (order === 'desc' ? b.start - a.start : a.start - b.start));
  const cap = Math.max(1, Math.min(Number(limit) || 10, 25));
  return { total: matches.length, events: matches.slice(0, cap) };
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}
