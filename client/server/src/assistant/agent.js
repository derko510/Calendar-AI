// The tool-calling agent.
//
// Instead of pasting every event into the prompt, the model gets tools and runs in a short loop:
//   1. It calls search_events with filters (keywords, past/now/upcoming, a date range).
//   2. Our code runs the search and returns only the matching events.
//   3. It searches again or finishes by calling one of the "final" tools:
//      answer, create_events or delete_events.
// Code does the date math and filtering; the model only decides *what to look for* and *how to phrase it*.
// The model never changes the calendar: create/delete come back as proposals the user confirms in the browser.

import { describeNow, upcomingDays } from './time.js';
import { normalizeEvents, searchEvents, toModelView } from './events.js';
import { cleanCreateEvents, knownIds } from './contract.js';

const MAX_STEPS = 5;

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_events',
      description: 'Search the user\'s calendar. Returns matching events with id, title, when, status (past | now | upcoming) and location. Call this before answering any question about events.',
      parameters: {
        type: 'object',
        properties: {
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Words to match in the title, location or description; an event matches if it contains ANY of them. Add synonyms and short stems, e.g. ["dentist","dental"], ["doctor","dr.","physician","medical"], ["nyc","new york"]. Leave empty to match every event.'
          },
          status: {
            type: 'string',
            enum: ['past', 'now', 'upcoming'],
            description: 'past = already ended, now = in progress, upcoming = not started yet. Use upcoming for "next", past for "last" / "most recent", now for "right now".'
          },
          from: { type: 'string', description: 'Start of a time window, local time: YYYY-MM-DD or YYYY-MM-DDTHH:MM.' },
          to: { type: 'string', description: 'End of a time window, local time: YYYY-MM-DD (includes that whole day) or YYYY-MM-DDTHH:MM.' },
          order: { type: 'string', enum: ['asc', 'desc'], description: 'asc = soonest first (use for "next"), desc = most recent first (use for "last").' },
          limit: { type: 'integer', description: 'Max events to return, 1–25. Default 10.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'answer',
      description: 'Final step for questions. Give a short, friendly answer based only on events returned by search_events.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The answer. Include dates and times. If nothing matched, say so.' },
          eventIds: { type: 'array', items: { type: 'string' }, description: 'ids of the events the answer is about (at most 5). Empty if none.' }
        },
        required: ['text', 'eventIds']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_events',
      description: 'Final step when the user wants to add events. Proposes them; the user confirms before anything is saved.',
      parameters: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Short, clean title with spelling fixed; no date, time or words like "schedule".' },
                date: { type: 'string', description: 'YYYY-MM-DD, resolved from the day list in the instructions.' },
                startTime: { type: 'string', description: '24-hour HH:MM.' },
                endTime: { type: 'string', description: '24-hour HH:MM. Start + 1 hour unless the user said otherwise.' },
                location: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['title', 'date', 'startTime', 'endTime']
            }
          }
        },
        required: ['events']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_events',
      description: 'Final step when the user wants to remove events. Use ids from search_events results only. Proposes the deletion; the user confirms.',
      parameters: {
        type: 'object',
        properties: {
          eventIds: { type: 'array', items: { type: 'string' } }
        },
        required: ['eventIds']
      }
    }
  }
];

function systemPrompt(now, timeZone) {
  const { today, clock, year } = describeNow(now, timeZone);
  return `You are a calendar assistant. The current time is ${clock} on ${today} (time zone ${timeZone}).

Days ahead, for resolving "tomorrow", "Friday", "next Tuesday":
${upcomingDays(now, timeZone).join('\n')}
"Next <weekday>" means the first such day after today. If no year is given, use ${year} (or the next year if that date has passed).

Every reply must be exactly one tool call.
- Questions: call search_events first (as many times as you need), then finish with answer. Never invent events; only use what search_events returned. If a search finds nothing, try broader keywords or a wider window once, then say nothing was found.
- "Next" / "upcoming": status "upcoming", order "asc". "Last" / "most recent": status "past", order "desc". "Right now": status "now".
- A day or range ("tomorrow", "last weekend", "in October"): use from/to with local dates. Weeks start on Sunday.
- Class / school / lecture questions: search for course-like keywords ("lecture", "class", "cs", "exam", "course").
- Adding events: a message that states a plan with a day or time ("gym friday 6pm", "meeting with prof tmrw at 3") is a request to add it, even without the word "add". Call create_events directly: don't search first and don't ask for confirmation, because the app shows the user a Confirm button. A question about availability ("could I fit in lunch tomorrow?", "am I free at 3?") is a question, not a request to add.
- Removing events: search_events to find the ids, then delete_events with only the events the user meant.
The user may write with typos and slang ("tmrw", "nxt", "intervew"); read it the way a person would.`;
}

export async function runAgent(message, rawEvents, { now, timeZone, llm, maxSteps = MAX_STEPS }) {
  const events = normalizeEvents(rawEvents, timeZone);
  const seen = new Set(); // ids the model has actually been shown
  const trace = [];
  const messages = [
    { role: 'system', content: systemPrompt(now, timeZone) },
    { role: 'user', content: message }
  ];

  for (let step = 0; step < maxSteps; step++) {
    // The last step forbids searching so the loop always ends with a final tool
    const lastStep = step === maxSteps - 1;
    const tools = lastStep ? TOOLS.filter(t => t.function.name !== 'search_events') : TOOLS;

    let reply;
    try {
      reply = await llm.chat(messages, { tools, toolChoice: 'required' });
    } catch (err) {
      // Groq returns 400 tool_use_failed when the model writes a malformed tool call; let it try again
      if (err.status === 400 && /tool_use_failed|failed to call a function|tool call validation failed/i.test(err.providerMessage || '')) {
        trace.push({ step, error: 'malformed tool call' });
        messages.push({ role: 'user', content: 'Your last tool call was malformed. Call exactly one tool with valid JSON arguments.' });
        continue;
      }
      throw err;
    }

    const call = reply.tool_calls?.[0];
    if (!call) {
      // Model answered in plain text despite the rules; accept it as an answer with no cards
      if (reply.content) return { intent: 'question', answer: reply.content.trim(), eventIds: [], trace };
      messages.push({ role: 'user', content: 'Call one of the tools.' });
      continue;
    }

    const name = call.function?.name;
    let args;
    try {
      args = JSON.parse(call.function?.arguments || '{}');
    } catch {
      args = null;
    }
    // _anthropicContent (Claude only) keeps the exact reply, thinking blocks included, for the next request
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: [call], ...(reply._anthropicContent && { _anthropicContent: reply._anthropicContent }) });
    const respond = (content) => messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(content) });

    if (!args || typeof args !== 'object') {
      trace.push({ step, tool: name, error: 'invalid JSON arguments' });
      respond({ error: 'Arguments were not valid JSON. Try again.' });
      continue;
    }

    if (name === 'search_events') {
      const { total, events: found } = searchEvents(events, args, { now, timeZone });
      found.forEach(e => seen.add(e.id));
      trace.push({ step, tool: name, args, total, returned: found.map(e => e.title) });
      respond({ total, events: found.map(e => toModelView(e, now, timeZone)) });
      continue;
    }

    if (name === 'answer') {
      const text = String(args.text || '').trim();
      if (!text) {
        respond({ error: 'text is required.' });
        continue;
      }
      // Cards may only point at events the model was shown, so they always match the answer
      const eventIds = knownIds(args.eventIds, seen, 5);
      trace.push({ step, tool: name, eventIds });
      return { intent: 'question', answer: text, eventIds, trace };
    }

    if (name === 'create_events') {
      const created = cleanCreateEvents(args.events);
      if (created.length === 0) {
        trace.push({ step, tool: name, error: 'no valid events' });
        respond({ error: 'Each event needs title, date (YYYY-MM-DD) and startTime (HH:MM, 24-hour).' });
        continue;
      }
      trace.push({ step, tool: name, events: created });
      return { intent: 'create', events: created, trace };
    }

    if (name === 'delete_events') {
      // Only events the model actually found by searching can be proposed for deletion,
      // so a guessed id can't target an event it never looked at
      const eventIds = knownIds(args.eventIds, seen);
      if (eventIds.length === 0) {
        trace.push({ step, tool: name, error: 'ids not from search results' });
        respond({ error: 'Use search_events first and pass ids from its results.' });
        continue;
      }
      trace.push({ step, tool: name, eventIds });
      return { intent: 'delete', eventIds, trace };
    }

    trace.push({ step, tool: name, error: 'unknown tool' });
    respond({ error: `Unknown tool ${name}.` });
  }

  return {
    intent: 'question',
    answer: 'Sorry, I could not work that out. Try asking in a different way.',
    eventIds: [],
    trace
  };
}
