// Pure helpers that shape what the chat panel sends to /api/assistant/message.

export const MAX_API_EVENTS = 1500;
const MAX_DESCRIPTION = 300;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_TEXT = 500;

// A bare date ("2026-11-14") is local midnight, not UTC midnight
const toMillis = (value) => {
  if (!value) return null;
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
};

const eventStartMs = (event) => toMillis(event?.start?.dateTime || event?.start?.date || event?.startDatetime);

export const plainText = (value = '') => {
  const text = String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return text.split(/\s+/).filter(Boolean).join(' ');
};

const slimTime = (t) => {
  if (!t) return undefined;
  if (t.dateTime) return { dateTime: t.dateTime, ...(t.timeZone && { timeZone: t.timeZone }) };
  if (t.date) return { date: t.date };
  return undefined;
};

export function slimEvent(event) {
  return {
    id: event.id || event.googleEventId,
    summary: plainText(event.summary || event.title || '').slice(0, 200),
    description: plainText(event.description || '').slice(0, MAX_DESCRIPTION),
    location: plainText(event.location || '').slice(0, 200),
    start: slimTime(event.start),
    end: slimTime(event.end)
  };
}

// Slim projection, capped to the `max` events nearest to today (chronological order kept)
export function slimEventsForApi(list, max = MAX_API_EVENTS, now = Date.now()) {
  const usable = (Array.isArray(list) ? list : []).filter(e => e && (e.id || e.googleEventId) && (e.start?.dateTime || e.start?.date));
  let chosen = usable;
  if (usable.length > max) {
    const distance = (e) => Math.abs((eventStartMs(e) ?? 0) - now);
    chosen = [...usable].sort((a, b) => distance(a) - distance(b)).slice(0, max);
  }
  return chosen.map(slimEvent);
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// { from, to } covering the loaded events, used when the app doesn't pass its own range
export function computeRange(list) {
  let min = Infinity;
  let max = -Infinity;
  for (const e of Array.isArray(list) ? list : []) {
    const ms = eventStartMs(e);
    if (ms == null) continue;
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  return Number.isFinite(min) ? { from: ymd(min), to: ymd(max) } : undefined;
}

const validRange = (r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(r.to || '');

export const rangeForApi = (loadedRange, list) => (validRange(loadedRange) ? { from: loadedRange.from, to: loadedRange.to } : computeRange(list));

// The last turns before the new message. Skips the greeting and error bubbles.
export function buildHistory(messages) {
  return (messages || [])
    .filter(m => m && m.id !== 1 && !m.isError && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map(m => {
      const turn = { role: m.type === 'user' ? 'user' : 'assistant', text: m.content.trim().slice(0, MAX_HISTORY_TEXT) };
      if (turn.role === 'assistant') {
        const ids = (m.events || []).map(e => e.id || e.googleEventId).filter(Boolean).slice(0, 10);
        if (ids.length) turn.eventIds = ids;
      }
      return turn;
    });
}
