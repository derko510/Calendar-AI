// The "single prompt" approach: paste every event into one prompt and ask for a JSON answer.
// Kept so the evals can compare it against the agent.
//   v0 — what originally shipped: today's date only, events in arrival order. ("Next event" returned past events.)
//   v1 — the first fix: current time included, events sorted and tagged PAST / NOW / UPCOMING.

import { describeNow } from './time.js';
import { normalizeEvents, eventStatus, formatWhen } from './events.js';
import { cleanCreateEvents, knownIds } from './contract.js';

export async function runPromptEngine(message, rawEvents, { now, timeZone, llm, variant = 'v1' }) {
  const { today, clock, year } = describeNow(now, timeZone);
  const all = normalizeEvents(rawEvents, timeZone);
  // v0 kept Google's arrival order (calendar by calendar), not chronological order
  const listed = variant === 'v0' ? arrivalOrder(rawEvents, all) : all;

  const eventLines = listed
    .map((e, i) => {
      const loc = e.location ? ` | ${e.location}` : '';
      return variant === 'v0'
        ? `[${i}] ${e.title} | ${formatWhen(e, timeZone)}${loc}`
        : `[${i}] ${eventStatus(e, now).toUpperCase()} | ${e.title} | ${formatWhen(e, timeZone)}${loc}`;
    })
    .join('\n');

  const header = variant === 'v0'
    ? `Today is ${today}. You are a calendar assistant. Read the user's message and decide what they want.

Calendar events (numbered):`
    : `Today is ${today}. The current time is ${clock}. You are a calendar assistant. Read the user's message and decide what they want.

Calendar events (numbered, in chronological order; each is tagged PAST, NOW (in progress) or UPCOMING relative to the current time):`;

  const nextRule = variant === 'v0'
    ? ''
    : `\n  "Next" / "coming up" means the earliest UPCOMING event; never answer with a PAST event. "Last" / "most recent" means the latest PAST event.`;

  const prompt = `${header}
${eventLines || '(none)'}

User message: ${message}

The message may contain typos and slang ("tomorow", "tmrw", "libary"). Interpret them the way a person would.

Respond with ONLY one JSON object in this shape:
{"intent":"create" | "delete" | "question",
 "events":[{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","description":"...","location":"..."}],
 "deleteIndexes":[0],
 "answer":"...",
 "answerIndexes":[0]}

- intent "create": the user wants to add one or more events. Fill "events".
  title: short and clean, spelling fixed, without the date, time, place, or words like "create"/"schedule".
  location: the place with spelling fixed, or "". description: "" unless extra details were given.
  Resolve relative dates ("tomorrow", "next friday") from today. Use ${year} if no year is given.
  24h times (7 pm = 19:00). endTime = startTime + 1 hour unless stated.
- intent "delete": the user wants to remove events. Put the numbers of the matching events from the list in "deleteIndexes".
- intent "question": anything else. Put a concise answer in "answer" using only the events above.${nextRule}
  If asked about "class", "school", "lecture" or "course", look for academic events (course names, instructor names).
  If nothing matches, say so briefly.
  Put the numbers of the events your answer is about (at most 3) in "answerIndexes", or [] if none.
Leave fields that don't apply to the intent empty.`;

  // Retry once only when the model answered with unusable JSON; provider errors go to the caller
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm.generate(prompt, { temperature: 0, maxTokens: 800, json: true });
    try {
      const result = toResult(JSON.parse(raw), listed);
      if (result) return { ...result, trace: [{ step: 'prompt', promptChars: prompt.length }] };
      lastError = new Error(`Unusable LLM output: ${raw}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw Object.assign(lastError || new Error('Unusable LLM output'), { code: 'unusable_output' });
}

function toResult(output, listed) {
  const ids = new Set(listed.map(e => e.id));
  const byIndex = (indexes, max) => knownIds(
    (Array.isArray(indexes) ? indexes : []).slice(0, max).map(i => listed[i]?.id).filter(Boolean),
    ids
  );
  if (output?.intent === 'create') {
    const events = cleanCreateEvents(output.events);
    return events.length > 0 ? { intent: 'create', events } : null;
  }
  if (output?.intent === 'delete') {
    const eventIds = byIndex(output.deleteIndexes, 50);
    return eventIds.length > 0 ? { intent: 'delete', eventIds } : null; // empty → retry
  }
  if (output?.intent === 'question' && output.answer) {
    return { intent: 'question', answer: String(output.answer).trim(), eventIds: byIndex(output.answerIndexes, 3) };
  }
  return null;
}

function arrivalOrder(rawEvents, normalized) {
  const byId = new Map(normalized.map(e => [e.id, e]));
  return rawEvents.map(r => byId.get(r.id || r.googleEventId)).filter(Boolean);
}
