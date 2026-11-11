import express from 'express';
import { runAssistant, ENGINES } from '../assistant/index.js';
import { createLLM } from '../services/llm.js';
import { requireUser } from '../auth/requireUser.js';

const router = express.Router();
const MAX_EVENTS = 2000;
export const MAX_MESSAGE = 4000;
const MAX_HISTORY = 6;
const MAX_HISTORY_TEXT = 500;
const MAX_HISTORY_IDS = 10;

// history: up to 6 earlier turns { role: 'user'|'assistant', text (≤ 500 chars), eventIds? }.
// Anything else is dropped rather than rejected, so an older or newer browser never breaks the chat.
export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(h => h && typeof h === 'object' && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-MAX_HISTORY)
    .map(h => ({
      role: h.role,
      text: h.text.trim().slice(0, MAX_HISTORY_TEXT),
      ...(Array.isArray(h.eventIds) && {
        eventIds: h.eventIds.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 256).slice(0, MAX_HISTORY_IDS)
      })
    }))
    .filter(h => h.text || h.eventIds?.length);
}

// range: { from, to } = the window of events the browser loaded (ISO dates or date-times)
export function sanitizeRange(range) {
  if (!range || typeof range !== 'object') return undefined;
  const ok = v => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(new Date(v.length === 10 ? `${v}T00:00:00Z` : v).getTime());
  return ok(range.from) && ok(range.to) && range.from <= range.to ? { from: range.from, to: range.to } : undefined;
}

// Counters only: never message text, event text, emails or keys
function logLine(fields) {
  console.log(JSON.stringify({ route: 'assistant', ...fields }));
}

// POST /api/assistant/message
// Body: { message, events (Google events the browser loaded; only id, summary, description, location, start, end are read),
//         timeZone, demo?, history?, range?, debug? }
// Returns: { success, intent, answer?, eventIds?, events?, trace? }
// Requires a signed-in session (see auth/requireUser.js), because every message spends an AI key.
// The tier decides the AI: owners get Claude (Groq as backup), everyone else Groq only.
router.post('/message', requireUser, async (req, res) => {
  const { message, events = [], timeZone, debug } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }
  if (message.length > MAX_MESSAGE) {
    return res.status(400).json({ success: false, message: `Message is too long (max ${MAX_MESSAGE} characters).` });
  }
  if (!Array.isArray(events) || events.length > MAX_EVENTS) {
    return res.status(400).json({ success: false, message: `events must be an array of at most ${MAX_EVENTS}` });
  }
  const history = sanitizeHistory(req.body?.history);
  const range = sanitizeRange(req.body?.range);

  const engine = ENGINES.includes(process.env.ASSISTANT_ENGINE) ? process.env.ASSISTANT_ENGINE : 'agent';
  const tier = req.user?.owner === true ? 'owner' : 'public';
  const started = Date.now();
  let llm;
  try {
    llm = createLLM({ tier });
    const { trace, stats, ...result } = await runAssistant(message.trim(), events, { engine, timeZone, llm, history, range });
    logLine({ ok: true, engine, tier, servedBy: llm.servedBy || `${llm.provider}:${llm.model}`, intent: result.intent, ms: Date.now() - started, steps: stats?.steps, malformed: stats?.malformed, historyTurns: history.length, ...llm.usage });
    res.json({ success: true, ...result, ...(debug && { trace, engine, usage: llm.usage }) });
  } catch (err) {
    logLine({ ok: false, engine, tier, servedBy: llm ? llm.servedBy || `${llm.provider}:${llm.model}` : null, error: err.code || err.status || 'error', ms: Date.now() - started, steps: err.stats?.steps, malformed: err.stats?.malformed, ...(llm?.usage || {}) });
    console.error('Assistant error:', String(err.message).slice(0, 300));
    if (err.code === 'assistant_unavailable') return res.status(503).json({ success: false, message: 'The assistant is unavailable right now. Please try again later.' });
    if (err.message === 'rate_limited' && err.daily) {
      return res.status(503).json({ success: false, error: 'daily_quota', message: 'The free assistant has used up today’s quota. It resets every day, so try again tomorrow.' });
    }
    if (err.message === 'rate_limited') return res.status(429).json({ success: false, message: 'rate_limited' });
    if (err.code === 'timeout') return res.status(504).json({ success: false, message: 'The assistant took too long to answer. Please try again.' });
    if (err.code === 'unusable_output') return res.status(422).json({ success: false, message: 'I could not understand that. Try rephrasing.' });
    res.status(500).json({ success: false, message: `AI error: ${String(err.message).slice(0, 300)}` });
  }
});

export default router;
