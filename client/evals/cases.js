// Eval cases. Each runs against fixtures/calendar.js with `now` (local time in TIME_ZONE, default DEFAULT_NOW).
//
// expect forms:
//   { intent: 'question', includes: [ids], excludes: [ids] }  eventIds must contain every include and no exclude
//   { intent: 'question', none: true }                         eventIds must be empty
//   { intent: 'question' }                                     only the intent is checked
//   { intent: 'create', events: [{ date, startTime, endTime?, title: /re/i, example }] }
//                                                              same count; each matched by date+start(+end)+title.
//                                                              `example` is a title the regex accepts (used by --self-test).
//   { intent: 'delete', ids: [ids] }                           exact set
//
// Optional per case:
//   answerMatches: RegExp | RegExp[]   the answer text must match each (dates/times actually stated).
//                                      answerExample is a text that matches (used by --self-test).
//                                      Core cases: reported as a separate "answer text" column so core pass
//                                      rates stay comparable with older runs. Extended cases: part of pass.
//   suite: 'extended'                  new cases, reported separately from the original 37 ("core")
//   fixture: 'main' | 'main-ext' | 'kolkata' | 'big'   (default 'main'; see fixtures/)
//   history: [{ role, text, eventIds? }], range: { from, to }   passed to the assistant like the browser does
//   create events may set endDate (overnight / multi-day)

import { BIG_GYM_NOVEMBER, BIG_DENTIST_NEXT, BIG_DENTIST_PAST } from './fixtures/extended.js';

export const CATEGORIES = ['next', 'last', 'now', 'keyword', 'range', 'none', 'typo', 'create', 'delete', 'intent',
  'history', 'multi', 'relative', 'ambiguous', 'injection', 'tz', 'multiday', 'big'];
export const SUITES = ['core', 'extended'];

export const cases = [
  // --- next ---
  { id: 'next-anything', category: 'next', message: "What's next on my calendar?",
    expect: { intent: 'question', includes: ['gym-2026-11-11'], excludes: ['orbital-interview', 'hi', 'study-session'] } },
  { id: 'next-interview', category: 'next', message: 'whats my next interview',
    expect: { intent: 'question', includes: ['northwind-interview'], excludes: ['orbital-interview'] } },
  { id: 'next-dentist', category: 'next', message: 'When is my next dentist appointment?',
    answerMatches: [/Nov(ember)?\.? 15\b|11\/15/i, /\b10(:00)?\s*(am|a\.m\.|–|-|to\b)/i], answerExample: 'Sunday, November 15 at 10:00 AM.',
    expect: { intent: 'question', includes: ['dentist-2026-11-15'], excludes: ['dentist-2026-09-14', 'dental-checkup'] } },
  { id: 'next-class', category: 'next', message: 'When is my next class?',
    expect: { intent: 'question', includes: ['lecture-2026-11-12'], excludes: ['lecture-2026-11-10'] } },
  { id: 'next-dinner-john', category: 'next', message: 'When is my next dinner with John?',
    answerMatches: [/Nov(ember)?\.? 17\b|11\/17/i, /\b7(:00)?\s*(pm|p\.m\.|–|-|to\b)/i], answerExample: 'Tue, Nov 17 at 7:00 PM.',
    expect: { intent: 'question', includes: ['dinner-john-nov'], excludes: ['dinner-john-oct'] } },
  { id: 'next-while-in-progress', category: 'next', now: '2026-11-12T14:00', message: "what's next",
    expect: { intent: 'question', includes: ['robotics-seminar'], excludes: ['harbor-interview', 'lecture-2026-11-12'] } },
  { id: 'next-dentist-same-day', category: 'next', now: '2026-11-15T09:30', message: 'When is my next dentist appointment?',
    expect: { intent: 'question', includes: ['dentist-2026-11-15'], excludes: ['dental-checkup'] } },

  // --- last ---
  { id: 'last-interview', category: 'last', message: 'When was my last interview?',
    expect: { intent: 'question', includes: ['orbital-interview'], excludes: ['northwind-interview', 'harbor-interview'] } },
  { id: 'last-dentist', category: 'last', message: 'When was my last dentist appointment?',
    answerMatches: /Oct(ober)?\.? 20\b|10\/20/i, answerExample: 'October 20 at 3 PM.',
    expect: { intent: 'question', includes: ['dental-checkup'], excludes: ['dentist-2026-11-15'] } },
  { id: 'last-haircut', category: 'last', message: 'When was my last haircut?',
    expect: { intent: 'question', includes: ['haircut'] } },
  { id: 'last-dentist-same-day', category: 'last', now: '2026-11-15T12:00', message: 'When was my last dentist appointment?',
    expect: { intent: 'question', includes: ['dentist-2026-11-15'], excludes: ['dentist-2026-09-14'] } },

  // --- now ---
  { id: 'now-right-now', category: 'now', message: 'What am I doing right now?',
    expect: { intent: 'question', includes: ['study-session'], excludes: ['hi', 'gym-2026-11-11'] } },

  // --- keyword (synonyms the calendar doesn't use literally) ---
  { id: 'keyword-doctor', category: 'keyword', message: 'When did I last see the doctor?',
    expect: { intent: 'question', includes: ['physical'], excludes: ['patel-followup'] } },
  { id: 'keyword-new-york', category: 'keyword', message: 'When am I flying to New York?',
    answerMatches: /Nov(ember)?\.? 20\b|11\/20/i, answerExample: 'Friday, November 20 at 8:15 AM.',
    expect: { intent: 'question', includes: ['flight-nyc-nov'], excludes: ['flight-nyc-aug'] } },
  { id: 'keyword-mom-birthday', category: 'keyword', message: "When is my mom's birthday?",
    expect: { intent: 'question', includes: ['moms-birthday'] } },
  { id: 'keyword-cs170-final', category: 'keyword', message: 'When is my CS 170 final?',
    answerMatches: /Dec(ember)?\.? 17\b|12\/17/i, answerExample: 'Thursday, December 17, 8-11 AM.',
    expect: { intent: 'question', includes: ['cs170-final'] } },
  { id: 'keyword-orbital-time', category: 'keyword', message: 'What time is the Orbital Labs interview?',
    answerMatches: /1:30/, answerExample: 'It was today at 1:30 PM.',
    expect: { intent: 'question', includes: ['orbital-interview'] } },

  // --- range ---
  { id: 'range-tomorrow', category: 'range', message: 'What do I have tomorrow?',
    expect: { intent: 'question', includes: ['northwind-interview', 'gym-2026-11-11'], excludes: ['study-session'] } },
  { id: 'range-last-weekend', category: 'range', message: 'What did I do last weekend?',
    expect: { intent: 'question', includes: ['hike', 'brunch'], excludes: ['acme-confirmation'] } },
  { id: 'range-friday', category: 'range', message: "What's on Friday?",
    expect: { intent: 'question', includes: ['tentative', 'gym-2026-11-13'], excludes: ['flight-nyc-nov'] } },
  { id: 'range-thanksgiving', category: 'range', message: 'Do I have anything on Thanksgiving?',
    expect: { intent: 'question', includes: ['thanksgiving'] } },
  { id: 'range-earlier-today', category: 'range', message: 'What did I have earlier today?',
    expect: { intent: 'question', includes: ['orbital-interview', 'hi'], excludes: ['gym-2026-11-11'] } },

  // --- none ---
  { id: 'none-mars', category: 'none', message: 'When did I go to Mars?',
    expect: { intent: 'question', none: true } },
  { id: 'none-yoga', category: 'none', message: 'When is my next yoga class?',
    expect: { intent: 'question', none: true } },

  // --- typo ---
  { id: 'typo-next-interview', category: 'typo', message: 'wen is my nxt intervew',
    expect: { intent: 'question', includes: ['northwind-interview'], excludes: ['orbital-interview'] } },
  { id: 'typo-last-dentist', category: 'typo', message: 'wehn was my lst dentst apointment',
    expect: { intent: 'question', includes: ['dental-checkup'], excludes: ['dentist-2026-11-15'] } },

  // --- intent (questions that must not turn into create/delete) ---
  { id: 'intent-free-saturday', category: 'intent', message: 'Am I free Saturday afternoon?',
    expect: { intent: 'question' } },
  { id: 'intent-fit-lunch', category: 'intent', message: 'Could I fit in lunch with Amy tomorrow?',
    expect: { intent: 'question' } },

  // --- create ---
  { id: 'create-gym-friday', category: 'create', message: 'Schedule gym at 6 PM Friday',
    expect: { intent: 'create', events: [{ date: '2026-11-13', startTime: '18:00', title: /gym/i, example: 'Gym' }] } },
  { id: 'create-dentist-tomorrow', category: 'create', message: 'add dentist tomorrow at 9am',
    expect: { intent: 'create', events: [{ date: '2026-11-11', startTime: '09:00', title: /dentist|dental/i, example: 'Dentist' }] } },
  { id: 'create-lunch-amy', category: 'create', message: 'lunch with Amy next Tuesday 12:30 to 1:30',
    expect: { intent: 'create', events: [{ date: '2026-11-17', startTime: '12:30', endTime: '13:30', title: /lunch|amy/i, example: 'Lunch with Amy' }] } },
  { id: 'create-dinner-dec5', category: 'create', message: 'create a calendar event dinner on dec 5 at 7pm',
    expect: { intent: 'create', events: [{ date: '2026-12-05', startTime: '19:00', title: /dinner/i, example: 'Dinner' }] } },
  { id: 'create-prof-tmrw', category: 'create', message: 'meeting with prof tmrw at 3',
    expect: { intent: 'create', events: [{ date: '2026-11-11', startTime: '15:00', title: /prof|meeting/i, example: 'Meeting with Professor' }] } },
  { id: 'create-study-saturday', category: 'create', message: 'Study for CS 170 on Saturday 2-4pm',
    expect: { intent: 'create', events: [{ date: '2026-11-14', startTime: '14:00', endTime: '16:00', title: /study|cs ?170/i, example: 'Study for CS 170' }] } },

  // --- delete ---
  { id: 'delete-dinner-next-week', category: 'delete', message: 'delete my dinner with John next week',
    expect: { intent: 'delete', ids: ['dinner-john-nov'] } },
  { id: 'delete-northwind', category: 'delete', message: 'cancel the interview with Northwind',
    expect: { intent: 'delete', ids: ['northwind-interview'] } },
  { id: 'delete-gym-this-week', category: 'delete', message: 'remove my upcoming gym sessions this week',
    expect: { intent: 'delete', ids: ['gym-2026-11-11', 'gym-2026-11-13'] } },

  // ===================== extended suite (not part of the original 37) =====================
  // --- history (the browser sends earlier turns) ---
  { id: 'ext-history-delete-it', suite: 'extended', category: 'history', message: 'delete it',
    history: [
      { role: 'user', text: 'when is my next dentist appt' },
      { role: 'assistant', text: 'Your next dentist appointment is Sun, Nov 15 at 10:00 AM (Dentist cleaning at Bright Smile Dental).', eventIds: ['dentist-2026-11-15'] }
    ],
    expect: { intent: 'delete', ids: ['dentist-2026-11-15'] } },
  { id: 'ext-history-what-time', suite: 'extended', category: 'history', message: 'what time does it start?',
    history: [
      { role: 'user', text: 'do I have dinner with John coming up?' },
      { role: 'assistant', text: 'Yes, on Tue, Nov 17.', eventIds: ['dinner-john-nov'] }
    ],
    answerMatches: /\b7(:00)?\s*(pm|p\.m\.|–|-|to\b)/i, answerExample: 'It starts at 7:00 PM.',
    expect: { intent: 'question', includes: ['dinner-john-nov'] } },

  // --- multi-event, overnight and long creates ---
  { id: 'ext-multi-gym', suite: 'extended', category: 'multi', message: 'gym mon wed fri next week 7am',
    expect: { intent: 'create', events: [
      { date: '2026-11-16', startTime: '07:00', title: /gym/i, example: 'Gym' },
      { date: '2026-11-18', startTime: '07:00', title: /gym/i, example: 'Gym' },
      { date: '2026-11-20', startTime: '07:00', title: /gym/i, example: 'Gym' }
    ] } },
  { id: 'ext-overnight-party', suite: 'extended', category: 'multi', message: 'party Fri 10pm to 1am',
    expect: { intent: 'create', events: [{ date: '2026-11-13', startTime: '22:00', endTime: '01:00', endDate: '2026-11-14', title: /party/i, example: 'Party' }] } },
  { id: 'ext-long-study', suite: 'extended', category: 'multi', message: 'study Sat 9am-5pm',
    expect: { intent: 'create', events: [{ date: '2026-11-14', startTime: '09:00', endTime: '17:00', title: /study/i, example: 'Study' }] } },

  // --- relative ranges ---
  { id: 'ext-yesterday', suite: 'extended', category: 'relative', message: 'what did I do yesterday?',
    expect: { intent: 'question', includes: ['acme-confirmation', 'gym-2026-11-09'], excludes: ['hi', 'brunch'] } },
  { id: 'ext-this-week-interviews', suite: 'extended', category: 'relative', message: 'any interviews this week?',
    expect: { intent: 'question', includes: ['northwind-interview', 'harbor-interview'] } },
  { id: 'ext-next-week-flight', suite: 'extended', category: 'relative', message: "when's my flight next week?",
    answerMatches: /Nov(ember)?\.? 20\b|11\/20|Fri/i, answerExample: 'Friday, Nov 20 at 8:15 AM.',
    expect: { intent: 'question', includes: ['flight-nyc-nov'], excludes: ['flight-nyc-aug'] } },
  { id: 'ext-this-weekend', suite: 'extended', category: 'relative', message: 'what am I doing this weekend?',
    expect: { intent: 'question', includes: ['moms-birthday', 'dentist-2026-11-15'], excludes: ['hike', 'brunch'] } },
  { id: 'ext-last-week-gym', suite: 'extended', category: 'relative', message: 'did I go to the gym last week?',
    expect: { intent: 'question', includes: ['gym-2026-11-02', 'gym-2026-11-04', 'gym-2026-11-06'], excludes: ['gym-2026-11-09', 'gym-2026-10-30'] } },

  // --- ambiguous delete: two upcoming interviews; asking which one is the right move ---
  { id: 'ext-ambiguous-cancel', suite: 'extended', category: 'ambiguous', message: 'cancel my interview',
    answerMatches: /\?/, answerExample: 'You have two upcoming interviews, Northwind and Harbor Robotics. Which one?',
    expect: { intent: 'question' } },

  // --- prompt injection in an event title / description ---
  { id: 'ext-injection-friday', suite: 'extended', category: 'injection', fixture: 'main-ext', message: "What's on Friday?",
    expect: { intent: 'question', includes: ['tentative', 'gym-2026-11-13'] } },

  // --- non-US time zone, "now" just after local midnight (still the previous day in UTC) ---
  { id: 'ext-kolkata-tomorrow', suite: 'extended', category: 'tz', fixture: 'kolkata', message: 'what do I have tomorrow?',
    expect: { intent: 'question', includes: ['gym-kol', 'dinner-kol'], excludes: ['standup-kol', 'call-kol'] } },
  { id: 'ext-kolkata-today', suite: 'extended', category: 'tz', fixture: 'kolkata', message: "what's on today?",
    expect: { intent: 'question', includes: ['standup-kol', 'lunch-kol'], excludes: ['call-kol', 'gym-kol'] } },
  { id: 'ext-kolkata-create', suite: 'extended', category: 'tz', fixture: 'kolkata', message: 'call mom tomorrow at 9pm',
    expect: { intent: 'create', events: [{ date: '2026-11-12', startTime: '21:00', title: /mom/i, example: 'Call Mom' }] } },

  // --- multi-day events ---
  { id: 'ext-trip-end', suite: 'extended', category: 'multiday', fixture: 'main-ext', message: 'when does my NYC trip end?',
    answerMatches: /Nov(ember)?\.? 23\b|11\/23|Monday/i, answerExample: 'It ends on Monday, Nov 23.',
    expect: { intent: 'question', includes: ['nyc-trip'] } },
  { id: 'ext-hackathon-end', suite: 'extended', category: 'multiday', fixture: 'main-ext', message: 'when does the hackathon end?',
    answerMatches: [/Dec(ember)?\.? 6\b|12\/6|Sun/i, /5(:00)?\s*(pm|p\.m\.)/i], answerExample: 'Sunday, Dec 6 at 5:00 PM.',
    expect: { intent: 'question', includes: ['hackathon'] } },

  // --- ~300 events with opaque ids; more matches than one default search returns ---
  { id: 'ext-big-delete-gym-november', suite: 'extended', category: 'big', fixture: 'big', message: 'delete all gym sessions in November',
    expect: { intent: 'delete', ids: BIG_GYM_NOVEMBER } },
  { id: 'ext-big-next-dentist', suite: 'extended', category: 'big', fixture: 'big', message: 'When is my next dentist appointment?',
    answerMatches: /Dec(ember)?\.? 8\b|12\/8/i, answerExample: 'Tuesday, December 8 at 10 AM.',
    expect: { intent: 'question', includes: [BIG_DENTIST_NEXT], excludes: [BIG_DENTIST_PAST] } },

  // --- the browser only loaded a window of events: "nothing found" names it ---
  { id: 'ext-range-window-none', suite: 'extended', category: 'none', message: 'when was my last eye exam?',
    range: { from: '2026-08-01', to: '2026-12-31' },
    answerMatches: /Aug(ust)?|2026-08-01|8\/1/i, answerExample: 'I found no eye exam between August 1 and December 31, 2026.',
    expect: { intent: 'question', none: true } }
];
