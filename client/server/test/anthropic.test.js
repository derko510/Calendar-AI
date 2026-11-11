// The Claude adapter, tested against a fake HTTP layer (no key, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicLLM } from '../src/services/llm.js';
import { runAgent } from '../src/assistant/agent.js';

// Replies with the queued Claude responses in order and records every request body
function fakeClaude(responses) {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const next = responses.shift();
    const status = next?.status || 200;
    const body = next?.body || {
      id: `msg_${bodies.length}`, type: 'message', role: 'assistant', model: 'claude-haiku-5-5',
      content: next.content, stop_reason: next.stop_reason || 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: next.cacheRead || 0 }
    };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, bodies };
}

const llmWith = (responses) => {
  const fake = fakeClaude(responses);
  return { llm: createAnthropicLLM({ fetchImpl: fake.fetchImpl, apiKey: 'test', maxRetries: 0 }), bodies: fake.bodies };
};

const EVENTS = [
  { id: 'd1', summary: 'Dental checkup', start: { dateTime: '2026-10-20T22:00:00Z' }, end: { dateTime: '2026-10-20T23:00:00Z' } },
  { id: 'd2', summary: 'Dentist cleaning', start: { dateTime: '2026-11-15T18:00:00Z' }, end: { dateTime: '2026-11-15T19:00:00Z' } }
];
const NOW = new Date('2026-11-11T01:27:00Z'); // Tue Nov 10, 5:27 PM in Los Angeles

test('agent loop over Claude: search, then answer; request shapes are right', async () => {
  const thinking = { type: 'thinking', thinking: '', signature: 'sig123' };
  const { llm, bodies } = llmWith([
    { content: [thinking, { type: 'tool_use', id: 'tu_1', name: 'search_events', input: { keywords: ['dentist', 'dental'], status: 'past', order: 'desc', limit: 1 } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 'tu_2', name: 'answer', input: { text: 'Oct 20 at 3 PM.', eventIds: ['d1'] } }], stop_reason: 'tool_use', cacheRead: 80 }
  ]);
  const result = await runAgent('When was my last dentist appointment?', EVENTS, { now: NOW, timeZone: 'America/Los_Angeles', llm });

  assert.deepEqual({ intent: result.intent, answer: result.answer, eventIds: result.eventIds }, { intent: 'question', answer: 'Oct 20 at 3 PM.', eventIds: ['d1'] });

  const [first, second] = bodies;
  assert.equal(first.model, 'claude-haiku-5-5');
  assert.equal(first.output_config.effort, 'low');
  assert.match(first.system, /current time is 5:27 PM/);
  assert.equal(first.messages[0].role, 'user');
  assert.deepEqual(first.tool_choice, { type: 'auto', disable_parallel_tool_use: true });
  assert.deepEqual(first.tools.map(t => t.name), ['search_events', 'answer', 'create_events', 'delete_events']);
  assert.ok(first.tools[0].input_schema.properties.keywords);
  assert.deepEqual(first.cache_control, { type: 'ephemeral' });
  assert.equal('temperature' in first, false, 'Haiku 5.5 rejects non-default sampling params');

  // Second request replays the assistant turn exactly (thinking block included), then a tool_result
  const assistant = second.messages[1];
  assert.equal(assistant.role, 'assistant');
  assert.deepEqual(assistant.content[0], thinking);
  const toolResult = second.messages[2].content[0];
  assert.equal(toolResult.type, 'tool_result');
  assert.equal(toolResult.tool_use_id, 'tu_1');
  const found = JSON.parse(toolResult.content);
  assert.equal(found.events[0].id, 'd1');
  assert.equal(found.events[0].status, 'past');

  assert.equal(llm.usage.calls, 2);
  assert.equal(llm.usage.cacheReadTokens, 80);
});

test('generate() pulls the JSON object out of surrounding prose', async () => {
  const { llm } = llmWith([{ content: [{ type: 'text', text: 'Sure!\n```json\n{"intent":"question","answer":"hi"}\n```' }] }]);
  assert.deepEqual(JSON.parse(await llm.generate('x', { json: true })), { intent: 'question', answer: 'hi' });
});

test('rate limit and API errors map to the app\'s error signals', async () => {
  const limited = llmWith([{ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } }]);
  await assert.rejects(limited.llm.chat([{ role: 'user', content: 'hi' }]), { message: 'rate_limited', status: 429 });

  const bad = llmWith([{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad tool' } } }]);
  await assert.rejects(bad.llm.chat([{ role: 'user', content: 'hi' }]), (err) => err.status === 400 && /Claude API error 400/.test(err.message));
});

test('a refusal is surfaced as an error, not an empty answer', async () => {
  const { llm } = llmWith([{ content: [], stop_reason: 'refusal' }]);
  await assert.rejects(llm.chat([{ role: 'user', content: 'hi' }]), /declined/);
});

test('Claude model is hardcoded to Haiku 5.5; ANTHROPIC_MODEL cannot change it', async () => {
  const { anthropicModel, CLAUDE_MODEL } = await import('../src/services/llm.js');
  process.env.ANTHROPIC_MODEL = 'claude-opus-5-5';
  try {
    assert.equal(CLAUDE_MODEL, 'claude-haiku-5-5');
    assert.equal(anthropicModel(), 'claude-haiku-5-5');
    const { llm, bodies } = llmWith([{ content: [{ type: 'text', text: 'ok' }] }]);
    await llm.chat([{ role: 'user', content: 'hi' }]);
    assert.equal(bodies[0].model, 'claude-haiku-5-5');
    assert.equal(llm.usage.servedModel, 'claude-haiku-5-5', 'records the model the API says answered');
  } finally {
    delete process.env.ANTHROPIC_MODEL;
  }
});
