// Convert between Google event objects and the quick-create / edit form.
import { addDays, addMinutes } from 'date-fns';
import { getEventStart, getEventEnd, isAllDayEvent, toDateInput, toTimeInput, parseDateValue } from './eventUtils';
import { toEditableText } from './linkify';

const looksLikeHtml = (text) => /<\/?[a-z][^>]*>/i.test(String(text || ''));

export const formValuesFromRange = (start, end, allDay = false) => ({
  title: '',
  startDate: toDateInput(start),
  startTime: toTimeInput(start),
  endDate: toDateInput(allDay ? addDays(end, -1) : end),
  endTime: toTimeInput(end),
  allDay,
  location: '',
  description: ''
});

export const formValuesFromEvent = (event) => {
  const start = getEventStart(event);
  const end = getEventEnd(event);
  const allDay = isAllDayEvent(event);
  return {
    ...formValuesFromRange(start, end, allDay),
    title: event.summary || '',
    location: event.location || '',
    // HTML descriptions are edited as plain text (links are kept as their visible text + URL-detection)
    description: looksLikeHtml(event.description) ? toEditableText(event.description) : event.description || '',
    descriptionWasHtml: looksLikeHtml(event.description)
  };
};

const combine = (date, time) => parseDateValue(`${date}T${time || '00:00'}:00`);

const localDateTime = (date, time) => `${date}T${time}:00`;

/** Returns { error } or { start, end } in Google's format. */
export const buildTimes = (values) => {
  if (!values.startDate) return { error: 'Pick a start date.' };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (values.allDay) {
    const endDate = values.endDate || values.startDate;
    if (endDate < values.startDate) return { error: 'End date is before the start date.' };
    return {
      start: { date: values.startDate },
      end: { date: toDateInput(addDays(parseDateValue(endDate), 1)) } // Google's all-day end is exclusive
    };
  }
  if (!values.startTime || !values.endTime) return { error: 'Pick a start and end time.' };
  const endDate = values.endDate || values.startDate;
  let start = combine(values.startDate, values.startTime);
  let end = combine(endDate, values.endTime);
  if (!start || !end) return { error: 'That date or time is not valid.' };
  // "11 PM – 12:30 AM" on the same date means the next day
  if (end <= start && endDate === values.startDate) end = addDays(end, 1);
  if (end <= start) return { error: 'End time must be after the start time.' };
  return {
    start: { dateTime: localDateTime(values.startDate, values.startTime), timeZone: tz },
    end: { dateTime: localDateTime(toDateInput(end), toTimeInput(end)), timeZone: tz }
  };
};

/** Full event body for create. */
export const buildEventPayload = (values) => {
  const times = buildTimes(values);
  if (times.error) return times;
  return {
    payload: {
      summary: values.title.trim() || '(No title)',
      location: values.location.trim() || undefined,
      description: values.description.trim() || undefined,
      start: times.start,
      end: times.end
    }
  };
};

// PATCH merges nested objects, so switching all-day <-> timed must clear the other form explicitly;
// otherwise Google ends up with both `date` and `dateTime` set and rejects the update (400).
const clearOtherForm = (time) => (time.date
  ? { date: time.date, dateTime: null, timeZone: null }
  : { dateTime: time.dateTime, timeZone: time.timeZone, date: null });

/** Only the fields that changed, for an update (PATCH). */
export const buildEventChanges = (event, values) => {
  const times = buildTimes(values);
  if (times.error) return times;
  const original = formValuesFromEvent(event);
  const changes = {};
  if (values.title.trim() !== original.title.trim()) changes.summary = values.title.trim() || '(No title)';
  if (values.location.trim() !== original.location.trim()) changes.location = values.location.trim();
  if (values.description.trim() !== original.description.trim()) changes.description = values.description.trim();
  const timeKeys = ['startDate', 'startTime', 'endDate', 'endTime', 'allDay'];
  if (timeKeys.some(k => values[k] !== original[k])) {
    changes.start = clearOtherForm(times.start);
    changes.end = clearOtherForm(times.end);
  }
  return { changes };
};

export const defaultNewRange = (day = new Date()) => {
  // Next half hour today, or 9 AM on another day
  const now = new Date();
  let start;
  if (toDateInput(day) === toDateInput(now)) {
    start = new Date(now);
    start.setSeconds(0, 0);
    start = addMinutes(start, 30 - (start.getMinutes() % 30));
  } else {
    start = new Date(day);
    start.setHours(9, 0, 0, 0);
  }
  return { start, end: addMinutes(start, 60) };
};
