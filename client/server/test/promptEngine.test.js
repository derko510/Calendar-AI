import test from 'node:test';
import assert from 'node:assert/strict';
import { runPromptEngine } from '../src/assistant/promptEngine.js';

const NOW = new Date('2026-11-10T17:27:00Z');
const TZ = 'UTC';
// Deliberately out of chronological order (arrival order)
const raw = [
  { id: 'up', summary: 'Future thing', start: { dateTime: '2026-11-20T10:00:00Z' }, end: { dateTime: '2026-11-20T11:00:00Z' } },
  { id: 'past', summary: 'Old thing', start: { dateTime: '2026-11-01T10:00:00Z' }, end: { dateTime: '2026-11-01T11:00:00Z' } },
  { id: 'now', summary: 'Current thing', start: { dateTime: '2026-11-10T17:00:00Z' }, end: { dateTime: '2026-11-10T18:00:00Z' } }
];

function fakeLlm(...outputs) {
  const prompts = [];
  const q = [...outputs];
  return { prompts, async generate(prompt) { prompts.push(prompt); return q.shift(); } };
}
const run = (llm, variant, events = raw) => runPromptEngine('what is next', events, { now: NOW, timeZone: TZ, llm, variant });
const answer = JSON.stringify({ intent: 'question', answer: 'Future thing', answerIndexes: [2, 0, 99] });

test('v1 prompt has current time and ordered PAST/NOW/UPCOMING tags', async () => {
  const llm = fakeLlm(answer);
  await run(llm, 'v1');
  const p = llm.prompts[0];
  assert.match(p, /current time/i);
  const iPast = p.indexOf('PAST |'), iNow = p.indexOf('NOW |'), iUp = p.indexOf('UPCOMING |');
  assert.ok(iPast > -1 && iNow > iPast && iUp > iNow, 'chronological order');
  assert.match(p, /\[0\] PAST \| Old thing/);
  assert.match(p, /\[1\] NOW \| Current thing/);
  assert.match(p, /\[2\] UPCOMING \| Future thing/);
});

test('v0 prompt has no current time or status tags and keeps arrival order', async () => {
  const llm = fakeLlm(answer);
  await run(llm, 'v0');
  const p = llm.prompts[0];
  assert.doesNotMatch(p, /current time/i);
  assert.doesNotMatch(p, /PAST|UPCOMING/);
  assert.doesNotMatch(p, /\bNOW\b/);
  assert.match(p, /\[0\] Future thing/);
  assert.match(p, /\[1\] Old thing/);
});

test('answerIndexes map to ids (v1 sorted list), unknown indexes dropped', async () => {
  const r = await run(fakeLlm(answer), 'v1');
  assert.equal(r.intent, 'question');
  assert.equal(r.answer, 'Future thing');
  assert.deepEqual(r.eventIds, ['up', 'past']);
});

test('v0 indexes map against arrival order', async () => {
  const r = await run(fakeLlm(JSON.stringify({ intent: 'question', answer: 'x', answerIndexes: [0] })), 'v0');
  assert.deepEqual(r.eventIds, ['up']);
});

test('delete intent maps deleteIndexes', async () => {
  const r = await run(fakeLlm(JSON.stringify({ intent: 'delete', deleteIndexes: [0, 5] })), 'v1');
  assert.equal(r.intent, 'delete');
  assert.deepEqual(r.eventIds, ['past']);
});

test('create intent is cleaned', async () => {
  const r = await run(fakeLlm(JSON.stringify({ intent: 'create', events: [{ title: 'Gym', date: '2026-11-13', startTime: '18:00', endTime: '19:00' }] })), 'v1');
  assert.equal(r.intent, 'create');
  assert.equal(r.events[0].title, 'Gym');
});

test('bad JSON once then good: retries', async () => {
  const llm = fakeLlm('not json', answer);
  const r = await run(llm, 'v1');
  assert.equal(r.intent, 'question');
  assert.equal(llm.prompts.length, 2);
});

test('bad JSON twice throws unusable_output', async () => {
  const llm = fakeLlm('nope', '{also nope');
  await assert.rejects(run(llm, 'v1'), err => err.code === 'unusable_output');
  assert.equal(llm.prompts.length, 2);
});

test('valid JSON but unusable shape twice throws unusable_output', async () => {
  await assert.rejects(run(fakeLlm('{"intent":"create","events":[]}', '{"intent":"question"}'), 'v1'), err => err.code === 'unusable_output');
});

test('provider errors are not swallowed', async () => {
  const llm = { async generate() { throw new Error('rate limited'); } };
  await assert.rejects(run(llm, 'v1'), /rate limited/);
});
