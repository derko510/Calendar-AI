import express from 'express';
import { runAssistant, ENGINES } from '../assistant/index.js';
import { createLLM } from '../services/llm.js';
import { requireUser } from '../auth/requireUser.js';

const router = express.Router();
const MAX_EVENTS = 2000;

// POST /api/assistant/message
// Body: { message, events (raw Google events the browser already loaded), timeZone, demo?, debug? }
// Returns: { success, intent, answer?, eventIds?, events?, trace? }
// Requires a signed-in session (see auth/requireUser.js), because every message spends the AI key.
router.post('/message', requireUser, async (req, res) => {
  const { message, events = [], timeZone, debug } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message is required' });
  }
  if (!Array.isArray(events) || events.length > MAX_EVENTS) {
    return res.status(400).json({ success: false, message: `events must be an array of at most ${MAX_EVENTS}` });
  }

  const engine = ENGINES.includes(process.env.ASSISTANT_ENGINE) ? process.env.ASSISTANT_ENGINE : 'agent';
  const llm = createLLM();
  const started = Date.now();
  try {
    const { trace, ...result } = await runAssistant(message.trim().slice(0, 1000), events, { engine, timeZone, llm });
    console.log(JSON.stringify({ route: 'assistant', engine, model: llm.model, intent: result.intent, ms: Date.now() - started, ...llm.usage }));
    res.json({ success: true, ...result, ...(debug && { trace, engine, usage: llm.usage }) });
  } catch (err) {
    console.error('Assistant error:', err.message);
    if (err.message === 'rate_limited') return res.status(429).json({ success: false, message: 'rate_limited' });
    if (err.code === 'unusable_output') return res.status(422).json({ success: false, message: 'I could not understand that. Try rephrasing.' });
    res.status(500).json({ success: false, message: `AI error: ${String(err.message).slice(0, 300)}` });
  }
});

export default router;
