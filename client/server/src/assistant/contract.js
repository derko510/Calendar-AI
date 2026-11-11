// The one result shape every engine returns, and the checks that keep model output honest.
//   { intent: 'question', answer, eventIds }
//   { intent: 'create', events: [{ title, date, startTime, endTime, description, location }] }
//   { intent: 'delete', eventIds }

import { isDateString, isTimeString } from './time.js';

export function cleanCreateEvents(list) {
  return (Array.isArray(list) ? list : [])
    .filter(e => e?.title && isDateString(e.date) && isTimeString(e.startTime))
    .map(e => ({
      title: String(e.title).trim(),
      date: e.date,
      startTime: e.startTime,
      endTime: isTimeString(e.endTime) && e.endTime > e.startTime ? e.endTime : '',
      description: String(e.description || '').trim(),
      location: String(e.location || '').trim()
    }));
}

// Only ids that exist in the user's calendar survive, so a hallucinated id can never reach Google
export function knownIds(ids, knownIdSet, max = 50) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(id => knownIdSet.has(id)).slice(0, max);
}
