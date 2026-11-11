import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCreateEvents, knownIds } from '../src/assistant/contract.js';

test('cleanCreateEvents keeps a valid event and trims fields', () => {
  const out = cleanCreateEvents([{ title: '  Gym ', date: '2026-11-13', startTime: '18:00', endTime: '19:00', description: ' d ', location: ' LA ' }]);
  assert.deepEqual(out, [{ title: 'Gym', date: '2026-11-13', startTime: '18:00', endTime: '19:00', description: 'd', location: 'LA' }]);
});

test('cleanCreateEvents rejects bad dates, times, and missing titles', () => {
  const out = cleanCreateEvents([
    { title: 'a', date: '2026-13-01', startTime: '10:00' },
    { title: 'b', date: 'tomorrow', startTime: '10:00' },
    { title: 'c', date: '2026-11-13', startTime: '25:00' },
    { title: 'd', date: '2026-11-13', startTime: '9am' },
    { title: '', date: '2026-11-13', startTime: '10:00' },
    { date: '2026-11-13', startTime: '10:00' },
    null,
    { title: 'ok', date: '2026-11-13', startTime: '10:00' }
  ]);
  assert.deepEqual(out.map(e => e.title), ['ok']);
});

test('cleanCreateEvents drops endTime <= startTime or invalid', () => {
  const mk = endTime => cleanCreateEvents([{ title: 'a', date: '2026-11-13', startTime: '10:00', endTime }])[0].endTime;
  assert.equal(mk('10:00'), '');
  assert.equal(mk('09:00'), '');
  assert.equal(mk('bad'), '');
  assert.equal(mk(undefined), '');
  assert.equal(mk('10:01'), '10:01');
});

test('cleanCreateEvents tolerates non-arrays', () => {
  assert.deepEqual(cleanCreateEvents(undefined), []);
  assert.deepEqual(cleanCreateEvents('x'), []);
});

test('knownIds filters unknown, dedupes, stringifies and caps', () => {
  const set = new Set(['a', 'b', '1', 'c']);
  assert.deepEqual(knownIds(['a', 'zzz', 'a', 'b', 1], set), ['a', 'b', '1']);
  assert.deepEqual(knownIds(['a', 'b', 'c'], set, 2), ['a', 'b']);
  assert.deepEqual(knownIds(null, set), []);
});
