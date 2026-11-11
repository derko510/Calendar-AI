import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, TOOLS } from '../src/assistant/agent.js';

const NOW = new Date('2026-11-10T17:27:00Z');
const TZ = 'America/Los_Angeles';
const raw = [
  { id: 'e1', summary: 'Dentist', start: { dateTime: '2026-11-01T17:00:00Z' }, end: { dateTime: '2026-11-01T18:00:00Z' } },
  { id: 'e2', summary: 'Standup', start: { dateTime: '2026-11-12T17:00:00Z' }, end: { dateTime: '2026-11-12T18:00:00Z' } },
  { id: 'e3', summary: 'Dinner', start: { dateTime: '2026-11-13T03:00:00Z' }, end: { dateTime: '2026-11-13T04:00:00Z' } }
];

let n = 0;
const call = (name, args) => ({
  content: null,
  tool_calls: [{ id: `c${++n}`, function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }]
});

function fakeLlm(replies) {
  const calls = [];
  const queue = [...replies];
  return {
    calls,
    async chat(messages, opts) {
      calls.push({ messages: structuredClone(messages), tools: opts.tools, toolChoice: opts.toolChoice });
      if (queue.length === 0) throw new Error('script exhausted');
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    }
  };
}
const run = (llm, msg = 'hi', events = raw, extra = {}) => runAgent(msg, events, { now: NOW, timeZone: TZ, llm, ...extra });
const toolMessages = llm => llm.calls.at(-1).messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));

test('search then answer: eventIds limited to events shown by search', async () => {
  const llm = fakeLlm([
    call('search_events', { keywords: ['dentist'], status: 'past', order: 'desc' }),
    call('answer', { text: 'Your last dentist visit was Nov 1.', eventIds: ['e1', 'e2'] }) // e2 never shown
  ]);
  const r = await run(llm, 'when was my last dentist visit');
  assert.equal(r.intent, 'question');
  assert.equal(r.answer, 'Your last dentist visit was Nov 1.');
  assert.deepEqual(r.eventIds, ['e1']);
  const result = toolMessages(llm)[0];
  assert.equal(result.total, 1);
  assert.equal(result.events[0].id, 'e1');
  assert.equal(result.events[0].status, 'past');
  assert.equal(llm.calls[0].toolChoice, 'required');
});

test('answer eventIds capped at 5', async () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, summary: 'M', start: { dateTime: `2026-11-1${i}T10:00:00Z` } }));
  const llm = fakeLlm([
    call('search_events', {}),
    call('answer', { text: 'many', eventIds: many.map(e => e.id) })
  ]);
  const r = await run(llm, 'x', many);
  assert.equal(r.eventIds.length, 5);
});

test('create_events returns create intent with cleaned events', async () => {
  const llm = fakeLlm([call('create_events', { events: [
    { title: ' Gym ', date: '2026-11-13', startTime: '18:00', endTime: '17:00' },
    { title: 'bad', date: 'friday', startTime: '18:00' }
  ] })]);
  const r = await run(llm);
  assert.equal(r.intent, 'create');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].title, 'Gym');
  assert.equal(r.events[0].endTime, '');
});

test('invalid create args: error fed back, then valid retry works', async () => {
  const llm = fakeLlm([
    call('create_events', { events: [{ title: 'x', date: 'friday', startTime: '6pm' }] }),
    call('create_events', { events: [{ title: 'x', date: '2026-11-13', startTime: '18:00', endTime: '19:00' }] })
  ]);
  const r = await run(llm);
  assert.equal(r.intent, 'create');
  assert.equal(llm.calls.length, 2);
  const fed = llm.calls[1].messages.filter(m => m.role === 'tool');
  assert.equal(fed.length, 1);
  assert.match(JSON.parse(fed[0].content).error, /title, date/);
});

test('delete only accepts ids the model found by searching', async () => {
  const llm = fakeLlm([
    call('delete_events', { eventIds: ['e2'] }),            // real id, but never searched → rejected
    call('search_events', { keywords: ['standup'] }),
    call('delete_events', { eventIds: ['e2', 'nope', 'e2'] })
  ]);
  const r = await run(llm);
  assert.equal(r.intent, 'delete');
  assert.deepEqual(r.eventIds, ['e2']);
  assert.match(JSON.parse(llm.calls[1].messages.at(-1).content).error, /search_events first/);
});

test('plain-text reply becomes a question answer', async () => {
  const llm = fakeLlm([{ content: '  Hello there  ' }]);
  const r = await run(llm);
  assert.deepEqual({ intent: r.intent, answer: r.answer, eventIds: r.eventIds }, { intent: 'question', answer: 'Hello there', eventIds: [] });
});

test('empty reply with no tool call is nudged and retried', async () => {
  const llm = fakeLlm([{ content: '' }, call('answer', { text: 'ok', eventIds: [] })]);
  const r = await run(llm);
  assert.equal(r.answer, 'ok');
  assert.equal(llm.calls[1].messages.at(-1).role, 'user');
});

test('invalid JSON arguments and unknown tools are reported back to the model', async () => {
  const llm = fakeLlm([
    call('search_events', '{not json'),
    call('bogus', {}),
    call('answer', { text: 'done', eventIds: [] })
  ]);
  const r = await run(llm);
  assert.equal(r.answer, 'done');
  const tools = llm.calls[2].messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content).error);
  assert.match(tools[0], /not valid JSON/);
  assert.match(tools[1], /Unknown tool bogus/);
});

test('answer with empty text is rejected and retried', async () => {
  const llm = fakeLlm([call('answer', { text: '  ', eventIds: [] }), call('answer', { text: 'fine', eventIds: [] })]);
  assert.equal((await run(llm)).answer, 'fine');
});

test('loop limit: last step has no search_events; fallback if never finishing', async () => {
  const llm = fakeLlm(Array.from({ length: 5 }, () => call('search_events', { keywords: ['x'] })));
  const r = await run(llm);
  assert.equal(r.intent, 'question');
  assert.match(r.answer, /could not work that out/);
  assert.deepEqual(r.eventIds, []);
  assert.equal(llm.calls.length, 5);
  for (let i = 0; i < 4; i++) assert.ok(llm.calls[i].tools.some(t => t.function.name === 'search_events'), `step ${i}`);
  const last = llm.calls[4].tools.map(t => t.function.name);
  assert.equal(last.includes('search_events'), false);
  assert.deepEqual([...last].sort(), ['answer', 'create_events', 'delete_events']);
  assert.equal(TOOLS.length, 4); // the shared TOOLS list is not mutated
});

test('loop limit honours maxSteps', async () => {
  const llm = fakeLlm([call('search_events', {}), call('search_events', {})]);
  await run(llm, 'x', raw, { maxSteps: 2 });
  assert.equal(llm.calls.length, 2);
  assert.equal(llm.calls[1].tools.some(t => t.function.name === 'search_events'), false);
});

test('Groq 400 tool_use_failed is retried', async () => {
  const err = Object.assign(new Error('x'), { status: 400, providerMessage: 'tool_use_failed' });
  const llm = fakeLlm([err, call('answer', { text: 'recovered', eventIds: [] })]);
  const r = await run(llm);
  assert.equal(r.answer, 'recovered');
  assert.match(llm.calls[1].messages.at(-1).content, /malformed/);
});

test('other errors propagate', async () => {
  const other400 = Object.assign(new Error('boom'), { status: 400, providerMessage: 'bad request' });
  await assert.rejects(run(fakeLlm([other400])), /boom/);
  const e500 = Object.assign(new Error('server down'), { status: 500, providerMessage: 'tool_use_failed' });
  await assert.rejects(run(fakeLlm([e500])), /server down/);
  await assert.rejects(run(fakeLlm([new Error('plain')])), /plain/);
});

test('system prompt includes current time and time zone', async () => {
  const llm = fakeLlm([call('answer', { text: 'ok', eventIds: [] })]);
  await run(llm, 'hello');
  const [sys, user] = llm.calls[0].messages;
  assert.equal(sys.role, 'system');
  assert.match(sys.content, /9:27\s?AM/);
  assert.match(sys.content, /Tuesday, 2026-11-10/);
  assert.match(sys.content, /America\/Los_Angeles/);
  assert.match(sys.content, /Tue 2026-11-10 \(today\)/);
  assert.equal(user.content, 'hello');
});

test("Groq's 'tool call validation failed' (garbled tool name) is retried like other malformed calls", async () => {
  let n = 0;
  const llm = {
    async chat() {
      n += 1;
      if (n === 1) {
        throw Object.assign(new Error('Groq API error 400'), {
          status: 400,
          providerMessage: "Tool call validation failed: tool call validation failed: attempted to call tool 'answer<|channel|>commentary' which was not in request.tools"
        });
      }
      return { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'answer', arguments: JSON.stringify({ text: 'ok', eventIds: [] }) } }] };
    }
  };
  const r = await runAgent('hi', [], { now: new Date('2026-11-11T01:27:00Z'), timeZone: 'America/Los_Angeles', llm });
  assert.equal(r.answer, 'ok');
  assert.equal(n, 2);
});
