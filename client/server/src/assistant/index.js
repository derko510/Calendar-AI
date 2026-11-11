import { runAgent } from './agent.js';
import { runPromptEngine } from './promptEngine.js';
import { safeTimeZone } from './time.js';

export const ENGINES = ['agent', 'prompt-v1', 'prompt-v0'];

// One entry point for the web route and the evals. `now` is injectable so tests can freeze time.
export async function runAssistant(message, events, { engine = 'agent', now = new Date(), timeZone, llm }) {
  const tz = safeTimeZone(timeZone);
  if (engine === 'agent') return runAgent(message, events, { now, timeZone: tz, llm });
  if (engine === 'prompt-v1') return runPromptEngine(message, events, { now, timeZone: tz, llm, variant: 'v1' });
  if (engine === 'prompt-v0') return runPromptEngine(message, events, { now, timeZone: tz, llm, variant: 'v0' });
  throw new Error(`Unknown engine "${engine}". Use one of: ${ENGINES.join(', ')}`);
}
