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

export function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isTimeString(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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
