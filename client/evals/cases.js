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

export const CATEGORIES = ['next', 'last', 'now', 'keyword', 'range', 'none', 'typo', 'create', 'delete', 'intent'];

export const cases = [
  // --- next ---
  { id: 'next-anything', category: 'next', message: "What's next on my calendar?",
    expect: { intent: 'question', includes: ['gym-2026-11-11'], excludes: ['orbital-interview', 'hi', 'study-session'] } },
  { id: 'next-interview', category: 'next', message: 'whats my next interview',
    expect: { intent: 'question', includes: ['northwind-interview'], excludes: ['orbital-interview'] } },
  { id: 'next-dentist', category: 'next', message: 'When is my next dentist appointment?',
    expect: { intent: 'question', includes: ['dentist-2026-11-15'], excludes: ['dentist-2026-09-14', 'dental-checkup'] } },
  { id: 'next-class', category: 'next', message: 'When is my next class?',
    expect: { intent: 'question', includes: ['lecture-2026-11-12'], excludes: ['lecture-2026-11-10'] } },
  { id: 'next-dinner-john', category: 'next', message: 'When is my next dinner with John?',
    expect: { intent: 'question', includes: ['dinner-john-nov'], excludes: ['dinner-john-oct'] } },
  { id: 'next-while-in-progress', category: 'next', now: '2026-11-12T14:00', message: "what's next",
    expect: { intent: 'question', includes: ['long-horizon-talk'], excludes: ['harbor-interview', 'lecture-2026-11-12'] } },
  { id: 'next-dentist-same-day', category: 'next', now: '2026-11-15T09:30', message: 'When is my next dentist appointment?',
    expect: { intent: 'question', includes: ['dentist-2026-11-15'], excludes: ['dental-checkup'] } },

  // --- last ---
  { id: 'last-interview', category: 'last', message: 'When was my last interview?',
    expect: { intent: 'question', includes: ['orbital-interview'], excludes: ['northwind-interview', 'harbor-interview'] } },
  { id: 'last-dentist', category: 'last', message: 'When was my last dentist appointment?',
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
    expect: { intent: 'question', includes: ['flight-nyc-nov'], excludes: ['flight-nyc-aug'] } },
  { id: 'keyword-mom-birthday', category: 'keyword', message: "When is my mom's birthday?",
    expect: { intent: 'question', includes: ['moms-birthday'] } },
  { id: 'keyword-cs170-final', category: 'keyword', message: 'When is my CS 170 final?',
    expect: { intent: 'question', includes: ['cs170-final'] } },
  { id: 'keyword-orbital-time', category: 'keyword', message: 'What time is the Orbital Labs interview?',
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
    expect: { intent: 'delete', ids: ['gym-2026-11-11', 'gym-2026-11-13'] } }
];
