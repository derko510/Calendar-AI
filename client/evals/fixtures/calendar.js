// A frozen calendar for the evals, in the raw shape the Google Calendar API returns.
// "Now" is Tuesday 2026-11-10 at 5:27 PM in Los Angeles. DST ended on 2026-11-01, so events before
// that are UTC-7 and events after are UTC-8 — zonedToUtc handles both.
//
// The raw array is deliberately NOT chronological: personal events come first (in no particular order),
// then the class calendar, then "Busy" blocks. The v0 prompt kept this arrival order, which is how it
// came to answer "what's next" with past events.

import { zonedToUtc, addDays } from '../../server/src/assistant/time.js';

export const TIME_ZONE = 'America/Los_Angeles';
export const DEFAULT_NOW = '2026-11-10T17:27'; // local wall-clock time; a Tuesday

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const weekdayOf = (date) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

// Compact row → Google-shaped event. start/end are local "HH:MM"; no start = all-day; no end = +1 hour.
function ev(id, summary, date, start, end, extra = {}) {
  if (!start) {
    return { id, summary, ...extra, start: { date }, end: { date: addDays(date, 1) } };
  }
  const startUtc = zonedToUtc(date, start, TIME_ZONE);
  const endUtc = end ? zonedToUtc(date, end, TIME_ZONE) : new Date(startUtc.getTime() + 3600 * 1000);
  return {
    id,
    summary,
    ...extra,
    start: { dateTime: startUtc.toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: endUtc.toISOString(), timeZone: TIME_ZONE }
  };
}

// Every date in [from, to] that falls on one of `days`
function datesOn(from, to, days) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.includes(weekdayOf(d))) out.push(d);
  return out;
}

const personal = [
  // upcoming and past interleaved on purpose
  ev('moms-birthday', "Mom's birthday", '2026-11-14'),
  ev('dentist-2026-09-14', 'Dentist cleaning', '2026-09-14', '10:00', '11:00', { location: 'Bright Smile Dental' }),
  ev('northwind-interview', 'Interview Northwind', '2026-11-11', '15:00', '16:00'),
  ev('dental-checkup', 'Dental checkup', '2026-10-20', '15:00', '16:00', { location: 'Bright Smile Dental' }),
  ev('flight-nyc-nov', 'Flight to NYC', '2026-11-20', '08:15', '13:45', { location: 'SFO' }),
  ev('physical', 'Dr. Patel annual physical', '2026-10-02', '09:00', '10:00'),
  ev('orbital-interview', 'Interview with Orbital Labs', '2026-11-10', '13:30', '14:30', { location: 'https://app.coderpad.io/DEMO-1234' }),
  ev('haircut', 'Haircut', '2026-10-24', '12:00', '12:45'),
  ev('dentist-2026-11-15', 'Dentist cleaning', '2026-11-15', '10:00', '11:00', { location: 'Bright Smile Dental' }),
  ev('flight-nyc-aug', 'Flight to NYC', '2026-08-20', '06:00', '11:30', { location: 'SFO' }),
  ev('harbor-interview', 'Interview with Harbor Robotics', '2026-11-12', '13:30', '14:30'),
  ev('dinner-john-oct', 'Dinner with John', '2026-10-30', '19:00', '20:30'),
  ev('hike', 'Hike at Mission Peak', '2026-11-07', '09:00', '12:00'),
  ev('thanksgiving', 'Thanksgiving', '2026-11-26'),
  ev('brunch', 'Brunch with Sarah', '2026-11-08', '11:00', '12:30'),
  ev('free-2026-11-08', 'Free', '2026-11-08', '08:00', '08:30'),
  ev('dinner-john-nov', 'Dinner with John', '2026-11-17', '19:00', '20:30'),
  ev('acme-confirmation', 'Acme Corp: Confirmation', '2026-11-09', '14:00', '15:00'),
  ev('hi', 'Hi', '2026-11-10', '16:00', '17:00'),
  ev('robotics-seminar', 'Robotics seminar', '2026-11-12', '16:00', '18:00'),
  ev('study-session', 'Study session', '2026-11-10', '17:00', '18:30'),
  ev('tentative', 'Tentative', '2026-11-13', '09:00', '09:30'),
  ev('patel-followup', 'Dr. Patel follow-up', '2026-12-03', '09:30', '10:00'),
  ...datesOn('2026-10-19', '2026-11-20', ['Mon', 'Wed', 'Fri'])
    .map(d => ev(`gym-${d}`, 'Gym', d, '07:00', '08:00'))
];

// Class calendar. No lecture on Thanksgiving.
const classes = [
  ...datesOn('2026-09-01', '2026-12-10', ['Tue', 'Thu'])
    .filter(d => d !== '2026-11-26')
    .map(d => ev(`lecture-${d}`, 'CS 170 Lecture', d, '11:00', '12:30', { location: 'Soda Hall 306' })),
  ev('cs170-final', 'CS 170 Final Exam', '2026-12-17', '08:00', '11:00', { location: 'Soda Hall 306' })
];

// Free/busy blocks from a shared work calendar
const busy = [
  ev('busy-2026-11-11', 'Busy', '2026-11-11', '08:00', '08:30'),
  ev('busy-2026-10-28', 'Busy', '2026-10-28', '09:00', '10:00'),
  ev('busy-2026-11-10', 'Busy', '2026-11-10', '12:00', '12:30'),
  ev('busy-2026-11-04', 'Busy', '2026-11-04', '14:00', '15:00'),
  ev('busy-2026-11-16', 'Busy', '2026-11-16', '10:00', '10:30'),
  ev('busy-2026-11-19', 'Busy', '2026-11-19', '15:00', '16:00')
];

export const events = [...personal, ...classes, ...busy];

// Weekday sanity checks: the cases are written against these, so fail loudly if a date is off.
const expectWeekday = {
  '2026-11-07': 'Sat', '2026-11-08': 'Sun', '2026-11-09': 'Mon', '2026-11-10': 'Tue',
  '2026-11-11': 'Wed', '2026-11-12': 'Thu', '2026-11-13': 'Fri', '2026-11-14': 'Sat',
  '2026-11-15': 'Sun', '2026-11-17': 'Tue', '2026-11-20': 'Fri', '2026-11-26': 'Thu',
  '2026-12-03': 'Thu', '2026-12-17': 'Thu', '2026-09-01': 'Tue', '2026-10-19': 'Mon'
};
for (const [date, day] of Object.entries(expectWeekday)) {
  if (weekdayOf(date) !== day) throw new Error(`Fixture weekday check failed: ${date} is ${weekdayOf(date)}, expected ${day}`);
}
