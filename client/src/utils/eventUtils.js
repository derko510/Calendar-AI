// Shared event helpers: start/end parsing, day membership, overlap layout, join links.
// All math is in the browser's local time zone.
import { addDays, startOfDay, format, isSameDay } from 'date-fns';
import { findUrls, safeHref } from './linkify';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// "2026-11-14" means local midnight; new Date() would read it as UTC midnight (the previous evening in the Americas).
export const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const rawStart = (event) => {
  const s = event?.start;
  if (typeof s === 'string' || s instanceof Date) return s;
  return s?.dateTime || s?.date || event?.startDatetime || null;
};

export const isAllDayEvent = (event) => !!(event?.start?.date && !event?.start?.dateTime);

export const getEventStart = (event) => parseDateValue(rawStart(event));

export const getEventEnd = (event) => {
  const start = getEventStart(event);
  if (!start) return null;
  const e = event?.end;
  const end = parseDateValue(typeof e === 'string' || e instanceof Date ? e : e?.dateTime || e?.date);
  if (end && end >= start) return end;
  return new Date(start.getTime() + (isAllDayEvent(event) ? DAY : HOUR));
};

// All-day events and timed events that last a full day or more go in the all-day row, like Google.
export const isAllDayRowEvent = (event) => {
  if (isAllDayEvent(event)) return true;
  const start = getEventStart(event);
  const end = getEventEnd(event);
  return !!start && !!end && end - start >= DAY;
};

export const overlapsRange = (event, rangeStart, rangeEnd) => {
  const start = getEventStart(event);
  const end = getEventEnd(event);
  if (!start) return false;
  if (end.getTime() === start.getTime()) return start >= rangeStart && start < rangeEnd;
  return start < rangeEnd && end > rangeStart;
};

export const sortEvents = (a, b) => {
  const rowA = isAllDayRowEvent(a) ? 0 : 1;
  const rowB = isAllDayRowEvent(b) ? 0 : 1;
  if (rowA !== rowB) return rowA - rowB;
  const diff = getEventStart(a) - getEventStart(b);
  if (diff) return diff;
  return (getEventEnd(b) - getEventStart(b)) - (getEventEnd(a) - getEventStart(a));
};

export const getEventsForDay = (events, day) => {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return events.filter(e => overlapsRange(e, dayStart, dayEnd)).sort(sortEvents);
};

// Timed events for one day, clipped to that day (an event from 10 PM to 1 AM shows on both days).
export const getTimedSegmentsForDay = (events, day) => {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return events
    .filter(e => !isAllDayRowEvent(e) && overlapsRange(e, dayStart, dayEnd))
    .map(event => {
      const start = getEventStart(event);
      const end = getEventEnd(event);
      return {
        event,
        start: start < dayStart ? dayStart : start,
        end: end > dayEnd ? dayEnd : end,
        continuesBefore: start < dayStart,
        continuesAfter: end > dayEnd
      };
    });
};

/**
 * Side-by-side layout for overlapping timed segments.
 * Each segment gets { col, cols, span }: its column, the column count of its overlap cluster,
 * and how many columns it can stretch across to the right without hitting another event.
 * minMinutes keeps very short events from visually colliding with the next one.
 */
export const layoutSegments = (segments, minMinutes = 20) => {
  const items = segments
    .map(s => ({ ...s, visualEnd: Math.max(s.end.getTime(), s.start.getTime() + minMinutes * 60000) }))
    .sort((a, b) => a.start - b.start || (b.visualEnd - b.start) - (a.visualEnd - a.start));

  const result = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const columns = []; // last visualEnd per column
    cluster.forEach(item => {
      let col = columns.findIndex(end => end <= item.start.getTime());
      if (col === -1) { col = columns.length; columns.push(0); }
      columns[col] = item.visualEnd;
      item.col = col;
    });
    const cols = columns.length;
    cluster.forEach(item => {
      let span = 1;
      for (let c = item.col + 1; c < cols; c++) {
        const blocked = cluster.some(o => o !== item && o.col === c && o.start.getTime() < item.visualEnd && o.visualEnd > item.start.getTime());
        if (blocked) break;
        span++;
      }
      result.push({ ...item, cols, span });
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  items.forEach(item => {
    if (item.start.getTime() >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.visualEnd);
  });
  flush();
  return result;
};

const TIME_FMT = (d) => (d.getMinutes() === 0 ? format(d, 'h a') : format(d, 'h:mm a'));
export const formatTime = TIME_FMT;

// Compact label for blocks: "9:30" or "9:30 AM"
export const formatShortTime = (d) => format(d, d.getMinutes() === 0 ? 'h a' : 'h:mm a');

// "Tuesday, November 10 · 2 – 3 PM", "Nov 12 – 14 (all day)", etc.
export const formatEventRange = (event) => {
  const start = getEventStart(event);
  const end = getEventEnd(event);
  if (!start) return '';
  if (isAllDayEvent(event)) {
    const lastDay = addDays(end, -1);
    if (lastDay <= start) return `${format(start, 'EEEE, MMMM d')} · All day`;
    const sameMonth = start.getMonth() === lastDay.getMonth();
    return `${format(start, 'EEE, MMM d')} – ${format(lastDay, sameMonth ? 'EEE d' : 'EEE, MMM d')} · All day`;
  }
  if (isSameDay(start, end) || (end - start < DAY && end.getHours() === 0 && end.getMinutes() === 0 && isSameDay(start, addDays(end, -1)))) {
    const samePeriod = format(start, 'a') === format(end, 'a');
    const startLabel = samePeriod ? format(start, start.getMinutes() ? 'h:mm' : 'h') : TIME_FMT(start);
    return `${format(start, 'EEEE, MMMM d')} · ${startLabel} – ${TIME_FMT(end)}`;
  }
  return `${format(start, 'EEE, MMM d, h:mm a')} – ${format(end, 'EEE, MMM d, h:mm a')}`;
};

export const getEventTitle = (event) => (event?.summary || event?.title || '').trim() || '(No title)';

export const isEventNow = (event, now = new Date()) => {
  const start = getEventStart(event);
  const end = getEventEnd(event);
  return !!start && start <= now && end > now;
};

const PROVIDERS = [
  [/(^|\.)meet\.google\.com$/i, 'Google Meet'],
  [/(^|\.)zoom\.us$/i, 'Zoom'],
  [/(^|\.)teams\.(microsoft|live)\.com$/i, 'Microsoft Teams'],
  [/(^|\.)webex\.com$/i, 'Webex'],
  [/(^|\.)coderpad\.io$/i, 'CoderPad'],
  [/(^|\.)hackerrank\.com$/i, 'HackerRank'],
  [/(^|\.)codesignal\.com$/i, 'CodeSignal'],
  [/(^|\.)whereby\.com$/i, 'Whereby'],
  [/(^|\.)chime\.aws$/i, 'Amazon Chime'],
  [/(^|\.)(gotomeeting|goto)\.com$/i, 'GoTo Meeting'],
  [/(^|\.)bluejeans\.com$/i, 'BlueJeans'],
  [/(^|\.)skype\.com$/i, 'Skype'],
  [/(^|\.)slack\.com$/i, 'Slack huddle', /\/huddle/i]
];

export const getProvider = (url) => {
  try {
    const u = new URL(url);
    const match = PROVIDERS.find(([host, , path]) => host.test(u.hostname) && (!path || path.test(u.pathname)));
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const conferenceName = (event) => event?.conferenceData?.conferenceSolution?.name;

/**
 * Every "join" entry point on an event, most important first, de-duplicated:
 * hangoutLink, conferenceData video entry points, then known meeting/interview URLs in location or description.
 * Returns [{ url, label }].
 */
export const getJoinLinks = (event) => {
  if (!event) return [];
  const out = [];
  const seen = new Set();
  const add = (url, provider) => {
    const href = safeHref(url);
    if (!href) return;
    const key = href.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = provider || getProvider(href) || 'video call';
    out.push({ url: href, label: name === 'CoderPad' || name === 'HackerRank' || name === 'CodeSignal' ? `Open ${name}` : `Join ${name}` });
  };
  if (event.hangoutLink) add(event.hangoutLink, 'Google Meet');
  (event.conferenceData?.entryPoints || [])
    .filter(ep => ep.entryPointType === 'video')
    .forEach(ep => add(ep.uri, getProvider(ep.uri) || conferenceName(event)));
  [event.location, event.description].forEach(text => {
    findUrls(text || '').forEach(url => { if (getProvider(url)) add(url); });
  });
  return out;
};

export const googleMapsUrl = (location) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

// Local wall-clock strings for <input type="date"> / <input type="time">
export const toDateInput = (d) => format(d, 'yyyy-MM-dd');
export const toTimeInput = (d) => format(d, 'HH:mm');
