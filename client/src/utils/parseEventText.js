// Offline fallback for turning "gym Friday at 6pm" into an event when the AI parser is unreachable.
// Returns { title, date: 'YYYY-MM-DD', startTime: 'HH:MM', endTime: '', description: '', location: '' } or null.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (n) => String(n).padStart(2, '0');
const toDateString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const findDate = (text, now) => {
  const lower = text.toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let m = lower.match(/\b(today|tonight|tonite|tday)\b/);
  if (m) return { date: today, match: m[0] };

  // Also catches common typos/shorthand: tomorow, tommorow, tomorw, tmrw, tmr, 2morrow
  m = lower.match(/\b(?:tom+or+ow+|tom+or+w|tmrw?|2mor+ow)\b/);
  if (m) return { date: new Date(today.getTime() + 864e5), match: m[0] };

  const monthPattern = MONTHS.map(name => `${name.slice(0, 3)}(?:${name.slice(3)})?`).join('|');
  m = lower.match(new RegExp(`\\b(?:on\\s+)?(${monthPattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (m) {
    const month = MONTHS.findIndex(name => name.startsWith(m[1].slice(0, 3)));
    const date = new Date(m[3] ? Number(m[3]) : today.getFullYear(), month, Number(m[2]));
    if (!m[3] && date < today) date.setFullYear(date.getFullYear() + 1);
    return { date, match: m[0] };
  }

  m = lower.match(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
    const date = new Date(year, Number(m[1]) - 1, Number(m[2]));
    if (!m[3] && date < today) date.setFullYear(date.getFullYear() + 1);
    return { date, match: m[0] };
  }

  m = lower.match(new RegExp(`\\b(?:on\\s+)?(next\\s+|this\\s+)?(${WEEKDAYS.join('|')})\\b`));
  if (m) {
    const target = WEEKDAYS.indexOf(m[2]);
    let diff = (target - today.getDay() + 7) % 7;
    if (m[1]?.trim() === 'next' && diff === 0) diff = 7;
    return { date: new Date(today.getTime() + diff * 864e5), match: m[0] };
  }

  return null;
};

const findTime = (text) => {
  const lower = text.toLowerCase();
  let m = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/);
  if (m) {
    let hours = Number(m[1]) % 12;
    if (m[3].startsWith('p')) hours += 12;
    return { time: `${pad(hours)}:${m[2] || '00'}`, match: m[0] };
  }
  m = lower.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { time: `${pad(m[1])}:${m[2]}`, match: m[0] };
  m = lower.match(/\b(noon|midnight)\b/);
  if (m) return { time: m[1] === 'noon' ? '12:00' : '00:00', match: m[0] };
  return null;
};

export const parseEventText = (text, now = new Date()) => {
  const dateHit = findDate(text, now);
  const timeHit = findTime(text);
  if (!dateHit && !timeHit) return null;

  const quoted = text.match(/["“']([^"”']{2,})["”']/);
  let title = quoted ? quoted[1] : text;
  let rest = quoted ? text.replace(quoted[0], ' ') : text;
  for (const hit of [dateHit, timeHit]) {
    if (hit) rest = rest.replace(new RegExp(hit.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  }

  // Location: "at/in/@ Capitalized Place" (times and dates are already stripped), or "location: ..."
  let location = '';
  const locHit = rest.match(/\b(?:location|place|where)\s*:\s*([^,]+)/i)
    || rest.match(/(?:\s|^)(?:at|in|@)\s+((?:the\s+)?[A-Z0-9][\w'&.-]*(?:\s+(?:[A-Z0-9][\w'&.-]*|of|on|the|&))*)/);
  if (locHit) {
    location = locHit[1].replace(/\s+(of|on|the|&)\s*$/i, '').trim();
    rest = rest.replace(locHit[0], ' ');
  } else {
    // Lowercase place at the end of the message: "homework at library hayward"
    const tailHit = rest.match(/\s(?:at|in|@)\s+(?!(?:the\s+)?(?:morning|afternoon|evening|night)\b)([a-z][\w'&.-]*(?:\s+[\w'&.-]+){0,4})\s*$/i);
    if (tailHit) {
      location = tailHit[1].replace(/\b\w/g, c => c.toUpperCase());
      rest = rest.replace(tailHit[0], ' ');
    }
  }

  if (!quoted) {
    title = rest;
    title = title
      .replace(/\b(please|can you|could you|create|add|schedule|book|make|set up|new event|an? event|calendar event|to my calendar|on my calendar|for me|titled|called|named)\b/gi, ' ')
      .replace(/\b(at|on|for)\s*$/i, ' ')
      .replace(/^\s*(at|on|for)\b/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!title) title = 'New event';

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    date: toDateString(dateHit ? dateHit.date : now),
    startTime: timeHit ? timeHit.time : '09:00',
    endTime: '',
    description: '',
    location
  };
};
