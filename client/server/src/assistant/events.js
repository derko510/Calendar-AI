// Turn raw Google Calendar events into one clean shape, and search them.
// All of the time logic ("next", "last", "right now", "tomorrow") lives here in code, not in the model.
// The server only needs { id, summary, description, location, start, end } from each event.

import { zonedToUtc, isDateString, normalizeTime, zonedParts, addDays } from './time.js';

const HOUR = 3600 * 1000;

// Google sends { start: { dateTime } } for timed events and { start: { date } } for all-day ones.
// All-day dates have no time zone, so they are pinned to midnight in the user's zone.
export function normalizeEvent(raw, timeZone) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id || raw.googleEventId;
  const allDay = !!(raw.start?.date && !raw.start?.dateTime) || !!raw.isAllDay;
  let start;
  let end;
  if (allDay) {
    const startDate = raw.start?.date || String(raw.startDatetime).slice(0, 10);
    if (!isDateString(startDate)) return null;
    const rawEndDate = raw.end?.date;
    const endDate = isDateString(rawEndDate) && rawEndDate > startDate ? rawEndDate : addDays(startDate, 1); // Google's all-day end date is exclusive
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
    id: String(id),
    title: String(raw.summary || raw.title || 'Untitled').trim(),
    description: stripHtml(raw.description || ''),
    location: String(raw.location || '').trim(),
    start,
    end,
    allDay
  };
}

export function normalizeEvents(rawEvents = [], timeZone) {
  return (Array.isArray(rawEvents) ? rawEvents : [])
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

const dayLabel = (date, withYear = true) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
  timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(withYear && { year: 'numeric' })
});

// "Fri, Nov 13, 2026, 10:00 PM – 11:00 PM"; the end date is shown whenever the event ends on another day
export function formatWhen(event, timeZone) {
  if (event.allDay) {
    const first = zonedParts(event.start, timeZone).date;
    // The end is exclusive midnight, so the last day is the day before it
    const last = zonedParts(new Date(event.end.getTime() - 1), timeZone).date;
    if (last > first) return `${dayLabel(first, first.slice(0, 4) !== last.slice(0, 4))} – ${dayLabel(last)} (all day)`;
    return `${dayLabel(first)} (all day)`;
  }
  const opts = { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  const sameDay = zonedParts(event.start, timeZone).date === zonedParts(event.end, timeZone).date;
  const end = sameDay
    ? event.end.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    : event.end.toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${event.start.toLocaleString('en-US', opts)} – ${end}`;
}

// The view of an event the model sees: short, with status precomputed. `alias` swaps the long Google id for e1, e2…
export function toModelView(event, now, timeZone, alias = id => id) {
  return {
    id: alias(event.id),
    title: event.title,
    when: formatWhen(event, timeZone),
    status: eventStatus(event, now),
    ...(event.location && { location: event.location.slice(0, 120) })
  };
}

const BOUNDARY = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?(Z|[+-]\d{2}:?\d{2})?$/i;

// Accepts "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" (also H:MM and :SS) in the user's zone; an explicit Z/offset is honoured.
// endOfDay: a bare date means the end of that day (for "to"). Returns null when unparseable.
export function parseLocalBoundary(value, timeZone, { endOfDay = false } = {}) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(BOUNDARY);
  if (!m || !isDateString(m[1])) return null;
  if (!m[2]) return m[3] ? null : zonedToUtc(endOfDay ? addDays(m[1], 1) : m[1], '00:00', timeZone);
  const time = normalizeTime(m[2]);
  if (!time) return null;
  if (m[3]) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return zonedToUtc(m[1], time, timeZone);
}

// ---------- keyword matching ----------
// A keyword is a word or phrase; a phrase matches when all of its words appear (in any order).
// An event matches when ANY keyword matches; events matching more distinct keywords rank first.
// Words are matched as whole tokens when short (≤ 3 letters: "dr", "nyc", "cs") and as substrings otherwise.

// Filler that would stop a phrase from matching ("dentist appointment" → "dentist")
const FILLER = new Set(['a', 'an', 'the', 'my', 'with', 'w', 'at', 'on', 'for', 'to', 'of', 'and', 'in', 'appointment', 'appointments', 'appt', 'appts', 'event', 'events']);

// Small, directional synonym map so matching doesn't depend on the model listing every variant
export const SYNONYMS = {
  dentist: ['dental', 'orthodontist'],
  dental: ['dentist'],
  doctor: ['dr', 'physician', 'physical', 'medical'],
  dr: ['doctor'],
  physician: ['doctor', 'dr'],
  checkup: ['physical', 'check up'],
  nyc: ['new york'],
  'new york': ['nyc'],
  flight: ['fly', 'flying'],
  fly: ['flight'],
  flying: ['flight'],
  class: ['lecture', 'course'],
  lecture: ['class'],
  course: ['class', 'lecture'],
  birthday: ['bday'],
  bday: ['birthday'],
  gym: ['workout'],
  workout: ['gym'],
  haircut: ['barber'],
  barber: ['haircut'],
  exam: ['final', 'midterm'],
  midterm: ['exam'],
  meeting: ['mtg'],
  mtg: ['meeting']
};

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function phraseWords(phrase) {
  const words = normalizeText(phrase).split(' ').filter(Boolean);
  const meaningful = words.filter(w => !FILLER.has(w));
  return meaningful.length ? meaningful : words;
}

// keyword → { alternatives: [[option, …] per word slot], vocab }; an option is a list of words that must all match
function compileKeyword(keyword) {
  const words = phraseWords(keyword);
  if (words.length === 0) return null;
  const whole = words.join(' ');
  const expand = w => [[w], ...(SYNONYMS[w] || []).map(s => s.split(' '))];
  const alternatives = [words.map(expand)];
  if (words.length > 1) for (const s of SYNONYMS[whole] || []) alternatives.push([[s.split(' ')]]);
  const vocab = new Set([whole, ...(SYNONYMS[whole] || []), ...words.flatMap(w => [w, ...(SYNONYMS[w] || [])])]);
  return { key: whole, alternatives, vocab };
}

function wordMatches(word, doc, plural = true) {
  if (word.length <= 3 ? doc.tokens.has(word) : doc.text.includes(word)) return true;
  // "lectures" → "lecture", "moms" → "mom"
  return plural && word.length >= 4 && word.endsWith('s') && wordMatches(word.slice(0, -1), doc, false);
}

// "cs170" ↔ "CS 170": letters+digits are also compared with spaces removed
const compactMatches = (words, doc) => {
  const compact = words.join('');
  return compact.length >= 4 && /\d/.test(compact) && /\p{L}/u.test(compact) && doc.compact.includes(compact);
};

const optionMatches = (option, doc) => option.every(w => wordMatches(w, doc)) || compactMatches(option, doc);

const keywordMatches = (kw, doc) => compactMatches(kw.key.split(' '), doc)
  || kw.alternatives.some(slots => slots.every(options => options.some(o => optionMatches(o, doc))));

// Keywords that share vocabulary ("dentist" + "dental", "nyc" + "new york") count as one concept when ranking
function groupConcepts(compiled) {
  const groups = [];
  for (const kw of compiled) {
    const group = groups.find(g => g.some(other => [...kw.vocab].some(v => other.vocab.has(v))));
    if (group) group.push(kw);
    else groups.push([kw]);
  }
  return groups;
}

function docOf(event) {
  const text = normalizeText(`${event.title} ${event.location} ${event.description}`);
  return { text, tokens: new Set(text.split(' ')), compact: text.replace(/ /g, '') };
}

// ---------- search ----------
const STATUSES = ['past', 'now', 'upcoming'];
const ANY_STATUS = ['', 'all', 'any'];
export const MAX_LIMIT = 50;

/**
 * Search with filters the model fills in. Everything here is deterministic and unit-tested.
 * keywords: words/phrases (see above), case-insensitive, against title/location/description
 * status:   'past' | 'now' | 'upcoming' relative to `now` ('all' / 'any' = no filter)
 * from/to:  local dates or date-times; an event matches if it overlaps [from, to)
 * order:    'asc' (soonest first) or 'desc' (most recent first), after ranking by keywords matched
 * Returns { total, events } or { error } for arguments the model must fix. With 0 results under a status
 * filter, `otherStatuses` counts the matches in the other statuses so the model can recover.
 */
export function searchEvents(events, args = {}, { now, timeZone }) {
  const { keywords = [], status, from, to, order = 'asc', limit = 10 } = args || {};
  const statusKey = typeof status === 'string' ? status.trim().toLowerCase() : status == null ? '' : status;
  if (!ANY_STATUS.includes(statusKey) && !STATUSES.includes(statusKey)) {
    return { error: `status must be one of past, now, upcoming (or omit it). Got "${status}".` };
  }
  const has = v => v !== undefined && v !== null && v !== '';
  const fromDate = has(from) ? parseLocalBoundary(from, timeZone) : null;
  const toDate = has(to) ? parseLocalBoundary(to, timeZone, { endOfDay: true }) : null;
  const badBoundary = [['from', from, fromDate], ['to', to, toDate]].filter(([, raw, parsed]) => has(raw) && !parsed);
  if (badBoundary.length) {
    return { error: `${badBoundary.map(([k, raw]) => `${k} "${raw}"`).join(' and ')} not understood. Use local YYYY-MM-DD or YYYY-MM-DDTHH:MM, e.g. 2026-11-13 or 2026-11-13T18:00.` };
  }

  const compiled = (Array.isArray(keywords) ? keywords : [keywords]).map(k => compileKeyword(k)).filter(Boolean);
  const concepts = groupConcepts(compiled);

  const scored = [];
  for (const event of events) {
    if (fromDate && !(event.end > fromDate || (event.end.getTime() === event.start.getTime() && event.start >= fromDate))) continue;
    if (toDate && event.start >= toDate) continue;
    let score = 0;
    if (concepts.length) {
      const doc = docOf(event);
      score = concepts.filter(group => group.some(kw => keywordMatches(kw, doc))).length;
      if (score === 0) continue;
    }
    scored.push({ event, score });
  }

  const statusOf = e => eventStatus(e, now);
  const matches = statusKey && STATUSES.includes(statusKey) ? scored.filter(s => statusOf(s.event) === statusKey) : scored;
  const dir = order === 'desc' ? -1 : 1;
  matches.sort((a, b) => (b.score - a.score) || dir * (a.event.start - b.event.start));
  const parsedLimit = Number(limit);
  const cap = Math.max(1, Math.min(Number.isFinite(parsedLimit) && parsedLimit !== 0 ? Math.trunc(parsedLimit) : 10, MAX_LIMIT));
  const result = { total: matches.length, events: matches.slice(0, cap).map(s => s.event) };

  if (matches.length === 0 && STATUSES.includes(statusKey) && scored.length > 0) {
    const counts = {};
    for (const s of scored) counts[statusOf(s.event)] = (counts[statusOf(s.event)] || 0) + 1;
    result.otherStatuses = counts;
  }
  return result;
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}
