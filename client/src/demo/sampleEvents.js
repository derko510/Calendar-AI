// A realistic sample calendar for /?demo, built relative to today so it never goes stale.
// Shapes match what the Google Calendar API returns with singleEvents=true
// (recurring series are expanded into instances that share a recurringEventId).
import { addDays, startOfDay, format, startOfWeek } from 'date-fns';

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Offset from the local zone in "+HH:MM" form, so dateTime strings look like Google's.
const withOffset = (d) => {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${localISO(d)}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
};

export const DEMO_RANGE_DAYS = 63;

export function buildDemoEvents(now = new Date()) {
  const today = startOfDay(now);
  const events = [];
  let seq = 0;

  const at = (dayOffset, hour, minute = 0) => {
    const d = addDays(today, dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const timed = (start, end, fields = {}) => {
    const id = fields.id || `demo${(++seq).toString(36)}${format(start, 'MMdd')}`;
    events.push({
      kind: 'calendar#event',
      id,
      status: 'confirmed',
      summary: fields.summary,
      description: fields.description,
      location: fields.location,
      start: { dateTime: withOffset(start), timeZone: tz() },
      end: { dateTime: withOffset(end), timeZone: tz() },
      calendarId: fields.calendarId || 'primary',
      calendarName: fields.calendarName || 'Personal',
      isWritable: fields.isWritable ?? true,
      ...Object.fromEntries(Object.entries(fields).filter(([k]) => !['id', 'summary', 'description', 'location', 'calendarId', 'calendarName', 'isWritable'].includes(k)))
    });
  };

  const allDay = (dayOffset, days, fields = {}) => {
    const id = fields.id || `demo${(++seq).toString(36)}ad`;
    events.push({
      kind: 'calendar#event',
      id,
      status: 'confirmed',
      summary: fields.summary,
      description: fields.description,
      location: fields.location,
      start: { date: format(addDays(today, dayOffset), 'yyyy-MM-dd') },
      end: { date: format(addDays(today, dayOffset + days), 'yyyy-MM-dd') },
      calendarId: fields.calendarId || 'primary',
      calendarName: fields.calendarName || 'Personal',
      isWritable: fields.isWritable ?? true,
      transparency: 'transparent'
    });
  };

  const meet = (code) => ({
    hangoutLink: `https://meet.google.com/${code}`,
    conferenceData: {
      conferenceSolution: { name: 'Google Meet' },
      entryPoints: [{ entryPointType: 'video', uri: `https://meet.google.com/${code}`, label: `meet.google.com/${code}` }]
    }
  });

  // ---- Recurring series (expanded into instances) ----
  const series = (id, weekdays, hour, minute, minutes, fields) => {
    for (let offset = -DEMO_RANGE_DAYS; offset <= DEMO_RANGE_DAYS; offset++) {
      const day = addDays(today, offset);
      if (!weekdays.includes(day.getDay())) continue;
      const start = at(offset, hour, minute);
      const end = new Date(start.getTime() + minutes * 60000);
      timed(start, end, {
        ...fields,
        id: `${id}_${format(day, 'yyyyMMdd')}`,
        recurringEventId: id
      });
    }
  };

  series('demogym', [1, 3, 5], 7, 0, 60, {
    summary: 'Gym — strength',
    location: 'Equinox, 1 Park Ave'
  });
  series('demospanish', [2, 4], 18, 30, 75, {
    summary: 'Spanish B1 class',
    location: 'Instituto Cervantes, 211 E 49th St, New York',
    description: 'Homework and slides: https://classroom.google.com/c/NjQ5MTI3ODk0',
    calendarName: 'Classes'
  });
  series('demostandup', [1, 2, 3, 4, 5], 9, 30, 15, {
    summary: 'Daily standup',
    location: 'https://zoom.us/j/93120487731?pwd=c3RhbmR1cA',
    calendarName: 'Work'
  });
  series('demo1on1', [4], 11, 0, 30, {
    summary: '1:1 with Priya',
    description: 'Running notes: https://docs.google.com/document/d/1x9DemoOneOnOneNotes/edit',
    calendarName: 'Work',
    ...meet('kfq-ywpr-hdn')
  });
  series('demoyoga', [0], 10, 0, 60, {
    summary: 'Yoga flow',
    location: 'Sky Ting Yoga, 17 Allen St'
  });

  // ---- In progress right now (so the "now" line and "what's happening" questions have something) ----
  const nowStart = new Date(now.getTime() - 30 * 60000);
  nowStart.setSeconds(0, 0);
  timed(nowStart, new Date(nowStart.getTime() + 75 * 60000), {
    id: 'demonowfocus',
    summary: 'Focus block: portfolio site',
    description: 'Ship the projects page. Repo: https://github.com/example/portfolio — design in https://www.figma.com/file/DemoPortfolio'
  });

  // ---- Interviews ----
  timed(at(-24, 14), at(-24, 14, 30), {
    summary: 'Recruiter screen — Figma',
    description: 'Phone screen with Dana (recruiting).\nJob posting: https://www.figma.com/careers/',
    ...meet('xbd-pqrs-tuv'),
    calendarName: 'Job search'
  });
  timed(at(-10, 13), at(-10, 14), {
    summary: 'Technical interview — Stripe (Backend)',
    location: 'https://zoom.us/j/81234567890',
    description: 'Live coding round. Pad: https://app.coderpad.io/DEMO7Q2X\nPrep notes: https://docs.google.com/document/d/1DemoStripePrep/edit',
    calendarName: 'Job search'
  });
  timed(at(2, 15), at(2, 16), {
    summary: 'Technical interview — Ramp (Full-stack)',
    location: 'https://zoom.us/j/98765432109?pwd=UmFtcEludGVydmlldw',
    description: '<p>Hi! Here is everything for your interview.</p><p><b>Coding pad:</b> <a href="https://app.coderpad.io/RAMP4K9Z">open CoderPad</a></p><p>Questions? Reply to this invite.</p>',
    calendarName: 'Job search',
    attendees: [
      { email: 'you@example.com', self: true, responseStatus: 'accepted' },
      { email: 'jordan@ramp.example', displayName: 'Jordan Lee', responseStatus: 'accepted' },
      { email: 'recruiting@ramp.example', displayName: 'Ramp Recruiting', responseStatus: 'needsAction' }
    ]
  });
  timed(at(5, 10), at(5, 10, 45), {
    summary: 'System design interview — Datadog',
    description: 'Whiteboard: https://excalidraw.com/#room=demo-datadog\nInterviewer: Sam Ortiz',
    ...meet('sys-dsgn-ddg'),
    calendarName: 'Job search'
  });
  timed(at(12, 9, 30), at(12, 15), {
    summary: 'Onsite loop — Notion (4 rounds, lunch included)',
    location: 'Notion, 2300 Harrison St, San Francisco',
    description: 'Schedule: https://notion.example.com/onsite-schedule\nCheck in at the front desk 15 min early.',
    calendarName: 'Job search'
  });
  timed(at(19, 16), at(19, 16, 30), {
    summary: 'Hiring manager chat — Linear',
    location: 'https://meet.google.com/lin-hmgr-chat',
    calendarName: 'Job search'
  });

  // ---- Overlapping events (three-way overlap tomorrow at lunch) ----
  timed(at(1, 12), at(1, 13), { summary: 'Lunch with Sam', location: 'Joe’s Pizza, 7 Carmine St, New York' });
  timed(at(1, 12, 30), at(1, 13, 15), { summary: 'Product sync', ...meet('prd-sync-abc'), calendarName: 'Work' });
  timed(at(1, 12, 45), at(1, 13, 30), { summary: 'Dentist cleaning — Dr. Patel', location: 'Bright Smiles Dental, 55 W 14th St' });

  // ---- Past appointments (good for "when was my last ..." questions) ----
  timed(at(-35, 8, 30), at(-35, 9, 15), { summary: 'Dentist checkup — Dr. Patel', location: 'Bright Smiles Dental, 55 W 14th St' });
  timed(at(-52, 17), at(-52, 18), { summary: 'Haircut', location: 'Fellow Barber, 5 Bond St' });
  timed(at(-6, 19), at(-6, 21, 30), { summary: 'Dinner with Mom & Dad', location: 'Via Carota, 51 Grove St' });
  timed(at(-3, 20), at(-3, 23), { summary: 'Concert: Japanese Breakfast', location: 'Brooklyn Steel, 319 Frost St' });
  timed(at(-17, 9), at(-17, 9, 20), { summary: 'Doctor — annual physical', location: 'One Medical, 2 Astor Pl' });

  // ---- Long title, short events, late-night event that crosses midnight ----
  timed(at(3, 14), at(3, 15, 30), {
    summary: 'Quarterly planning review with the platform infrastructure team and stakeholders from finance and design',
    ...meet('qtr-plan-rev'),
    description: 'Deck: https://docs.google.com/presentation/d/1DemoQuarterlyDeck/edit\nPre-read: https://www.notion.so/Demo-Q-planning',
    calendarName: 'Work'
  });
  timed(at(0, 16, 45), at(0, 17), { summary: 'Call pharmacy', description: 'Refill — Rx #4471' });
  timed(at(4, 22), at(5, 1), { summary: 'Late flight JFK → SFO', location: 'JFK Terminal 4', description: 'Confirmation ABC123 — https://www.delta.com/mytrips' });
  timed(at(-1, 18), at(-1, 19), {
    summary: 'Team happy hour',
    location: 'The Wren, 344 Bowery',
    calendarName: 'Work',
    isWritable: false,
    calendarId: 'team@example.com',
    organizer: { email: 'team@example.com', displayName: 'Team calendar' }
  });

  // ---- All-day and multi-day ----
  allDay(0, 1, { summary: 'Rent due' });
  allDay(6, 1, { summary: 'Mom’s birthday 🎂', description: 'Gift idea list: https://www.notion.so/Demo-Gift-Ideas' });
  allDay(15, 3, { summary: 'React Summit (conference)', location: 'Amsterdam', description: 'Tickets: https://reactsummit.com/' });
  allDay(-20, 5, { summary: 'Trip to Lisbon ✈️', location: 'Lisbon, Portugal', description: 'Hotel: https://www.booking.com/ — Itinerary: https://docs.google.com/document/d/1DemoLisbon' });
  allDay(9, 1, { summary: 'Out of office', calendarName: 'Work' });
  allDay(9, 1, { summary: 'Submit expense report', calendarName: 'Work' });
  allDay(9, 1, { summary: 'Laundry day' });
  allDay(9, 1, { summary: 'Library books due' });
  allDay(-40, 1, { summary: 'Passport renewal appointment' });

  // A crowded day for the month view "+N more"
  const busy = 8;
  [[8, 0, 'Coffee with Alex'], [10, 0, 'Design review'], [11, 30, 'Lunch & learn'], [14, 0, 'Interview prep'], [16, 0, 'Pick up dry cleaning'], [19, 0, 'Book club']]
    .forEach(([h, m, title]) => timed(at(busy, h, m), at(busy, h + 1, m), { summary: title }));

  // Weekend of the current week: a farmer's market
  const saturday = addDays(startOfWeek(today), 6);
  const satOffset = Math.round((saturday - today) / 86400000);
  timed(at(satOffset, 9), at(satOffset, 10, 30), { summary: 'Union Square Greenmarket', location: 'Union Square, New York' });

  return events;
}
