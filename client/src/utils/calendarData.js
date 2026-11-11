// Pure helpers for the loaded event list: identity, merging fetched windows, cross-calendar de-duplication.
import { getEventStart, getEventEnd } from './eventUtils';

/** The same Google event id can live on several calendars (an invite copied to each guest's calendar). */
export const eventKey = (event) => `${event?.calendarId || 'primary'}\u0000${event?.id}`;

export const overlapsWindow = (event, from, to) => {
  const start = getEventStart(event);
  if (!start) return false;
  const end = getEventEnd(event);
  if (end.getTime() === start.getTime()) return start >= from && start < to;
  return start < to && end > from;
};

/**
 * Merge a fetch of [from, to) into the current list.
 * - Events outside the window are kept as they are.
 * - Inside the window, events of calendars where `replaces(calendarId)` is true are replaced by the
 *   fetched ones (so deletions made elsewhere disappear); other calendars (failed fetches) keep theirs.
 * Fetched events win over existing ones with the same calendarId + id.
 */
export const mergeEvents = (prev, fetched, from, to, replaces) => {
  const out = new Map();
  for (const e of prev) {
    if (overlapsWindow(e, from, to) && replaces(e.calendarId || 'primary')) continue;
    out.set(eventKey(e), e);
  }
  for (const e of fetched) out.set(eventKey(e), e);
  return [...out.values()];
};

// Higher is better: a copy you can edit, then the copy on your primary calendar, then the organiser's copy
const copyScore = (e) =>
  (e.isWritable !== false ? 4 : 0) + (e.calendarPrimary || e.calendarId === 'primary' ? 2 : 0) + (e.organizer?.self ? 1 : 0);

/** One copy per event id across calendars, preferring the writable / primary copy. */
export const dedupeAcrossCalendars = (events) => {
  const best = new Map();
  for (const e of events) {
    const current = best.get(e.id);
    if (!current || copyScore(e) > copyScore(current)) best.set(e.id, e);
  }
  return best.size === events.length ? events : events.filter(e => best.get(e.id) === e);
};

/** Calendars shown by default: the ones Google marks selected (and always the primary). */
export const isDefaultVisible = (calendar) => !!(calendar.primary || calendar.selected);
