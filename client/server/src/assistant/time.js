// Time-zone helpers built on Intl only (no date library).
// The server runs in UTC, but every "today", "tomorrow" or "5 PM" a user says is in *their* time zone.

export function safeTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Wall-clock parts of an instant in a time zone
export function zonedParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'long'
    }).formatToParts(date).map(p => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second)
  };
}

// How far the zone's wall clock is ahead of UTC at that instant, in ms
function offsetMs(ms, timeZone) {
  const p = zonedParts(new Date(ms), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// "2026-11-13" + "18:00" in America/Los_Angeles → the UTC instant. Checks the offset twice so DST edges land right.
export function zonedToUtc(dateStr, timeStr = '00:00', timeZone = 'UTC') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return new Date(second);
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

// A real calendar date: "2026-02-30" has the right shape but is rejected (round-trip check)
export function isDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isTimeString(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// "9:00", "09:00", "09:00:00" → "09:00"; anything else → null
export function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  const time = `${m[1].padStart(2, '0')}:${m[2]}`;
  return isTimeString(time) ? time : null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "2026-11-13" → "Fri"
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// "Fri", "friday", "FRI." → "Fri"; unknown → null
export function parseWeekday(value) {
  const key = String(value || '').trim().slice(0, 3).toLowerCase();
  return WEEKDAYS.find(w => w.toLowerCase() === key) || null;
}

// "Tuesday, 2026-11-10, 5:27 PM"
export function describeNow(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const clock = now.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  return { today: `${p.weekday}, ${p.date}`, clock, date: p.date, weekday: p.weekday, year: String(p.year) };
}

// The next 14 days with weekday names, so the model never has to compute "next Friday" itself
export function upcomingDays(now, timeZone, count = 14) {
  const { date } = zonedParts(now, timeZone);
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(date, i);
    const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
    return `${weekday} ${day}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`;
  });
}

// The date guide for the system prompt: four Sunday-start weeks (last, this, next, the one after) with every
// date spelled out, plus precomputed ranges, so the model never does calendar arithmetic itself.
export function dateGuide(now, timeZone) {
  const today = zonedParts(now, timeZone).date;
  const dow = WEEKDAYS.indexOf(weekdayOf(today));
  const sunday = addDays(today, -dow);
  const label = { [addDays(today, -1)]: ' (yesterday)', [today]: ' (today)', [addDays(today, 1)]: ' (tomorrow)' };
  const week = (offset) => Array.from({ length: 7 }, (_, i) => {
    const day = addDays(sunday, offset * 7 + i);
    return `${WEEKDAYS[i]} ${day}${label[day] || ''}`;
  }).join(', ');
  // On a Sunday "this weekend" is yesterday + today; otherwise the coming Saturday + Sunday
  const weekendStart = dow === 0 ? addDays(today, -1) : addDays(sunday, 6);
  const span = (from, to) => `${from} to ${to}`;
  const ranges = {
    yesterday: addDays(today, -1),
    today,
    tomorrow: addDays(today, 1),
    'this week': span(sunday, addDays(sunday, 6)),
    'next week': span(addDays(sunday, 7), addDays(sunday, 13)),
    'last week': span(addDays(sunday, -7), addDays(sunday, -1)),
    'this weekend': span(weekendStart, addDays(weekendStart, 1)),
    'last weekend': span(addDays(weekendStart, -7), addDays(weekendStart, -6))
  };
  return {
    ranges,
    lines: [
      `Last week: ${week(-1)}`,
      `This week: ${week(0)}`,
      `Next week: ${week(1)}`,
      `Week after: ${week(2)}`,
      `Ranges: ${Object.entries(ranges).filter(([k]) => k !== 'today' && k !== 'tomorrow').map(([k, v]) => `${k} ${v}`).join('; ')}.`
    ]
  };
}
