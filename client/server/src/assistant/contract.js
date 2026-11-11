// The one result shape every engine returns, and the checks that keep model output honest.
//   { intent: 'question', answer, eventIds }
//   { intent: 'create', events: [{ title, date, weekday, startTime, endTime, endDate?, description, location }] }
//   { intent: 'delete', eventIds }
// endDate (YYYY-MM-DD) appears only when the event ends on a later day than `date` (overnight or multi-day).

import { isDateString, normalizeTime, weekdayOf, parseWeekday, addDays } from './time.js';

const MAX_CREATE = 50;
const MAX_SPAN_DAYS = 31;

/**
 * Validates every proposed event. Returns { events, errors }: when `errors` is non-empty the caller should
 * reject the whole call (the agent feeds the errors back to the model) rather than keep a partial list.
 */
export function checkCreateEvents(list) {
  const errors = [];
  const events = [];
  if (!Array.isArray(list) || list.length === 0) return { events, errors: ['events must be a non-empty array.'] };
  if (list.length > MAX_CREATE) return { events, errors: [`At most ${MAX_CREATE} events per call.`] };

  list.forEach((e, i) => {
    const where = list.length > 1 ? `Event ${i + 1}: ` : '';
    const fail = (msg) => errors.push(`${where}${msg}`);
    if (!e || typeof e !== 'object') return fail('must be an object.');
    const title = String(e.title || '').trim();
    if (!title) return fail('title is required.');
    if (!isDateString(e.date)) return fail(`date "${e.date ?? ''}" must be a real date as YYYY-MM-DD.`);
    const startTime = normalizeTime(e.startTime);
    if (!startTime) return fail(`startTime "${e.startTime ?? ''}" must be 24-hour HH:MM.`);

    const weekday = weekdayOf(e.date);
    if (e.weekday !== undefined && e.weekday !== null && e.weekday !== '') {
      const given = parseWeekday(e.weekday);
      if (given !== weekday) return fail(`${e.date} is a ${weekday}, not "${e.weekday}". Take the date from the date list.`);
    }

    let endTime = '';
    let endDate = '';
    const rawEnd = typeof e.endTime === 'string' ? e.endTime.trim() : '';
    if (rawEnd) {
      // "24:00" (until midnight) is 00:00 the next day
      endTime = /^24:00(:00)?$/.test(rawEnd) ? '00:00' : normalizeTime(rawEnd);
      if (!endTime) return fail(`endTime "${rawEnd}" must be 24-hour HH:MM.`);
      if (/^24:00/.test(rawEnd)) endDate = addDays(e.date, 1);
    }
    const rawEndDate = typeof e.endDate === 'string' ? e.endDate.trim() : '';
    if (rawEndDate && rawEndDate !== e.date) {
      if (!isDateString(rawEndDate)) return fail(`endDate "${rawEndDate}" must be YYYY-MM-DD.`);
      if (rawEndDate < e.date) return fail(`endDate ${rawEndDate} is before date ${e.date}.`);
      if (rawEndDate > addDays(e.date, MAX_SPAN_DAYS)) return fail(`endDate is more than ${MAX_SPAN_DAYS} days after date.`);
      if (!endTime) return fail('endTime is required when endDate is set.');
      endDate = rawEndDate;
    }
    if (endTime && !endDate) {
      if (endTime === startTime) endTime = ''; // zero length: let the app use its default length
      else if (endTime < startTime) endDate = addDays(e.date, 1); // "10pm to 1am" ends the next day
    }

    events.push({
      title,
      date: e.date,
      weekday,
      startTime,
      endTime,
      ...(endDate && { endDate }),
      description: String(e.description || '').trim(),
      location: String(e.location || '').trim()
    });
  });
  return { events: errors.length ? [] : events, errors };
}

// Lenient version for the single-prompt engines: keeps the valid events and drops the rest
export function cleanCreateEvents(list) {
  return (Array.isArray(list) ? list : []).flatMap(e => checkCreateEvents([e]).events);
}

// Only ids that exist in the user's calendar survive, so a hallucinated id can never reach Google
export function knownIds(ids, knownIdSet, max = 50) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(id => knownIdSet.has(id)).slice(0, max);
}
