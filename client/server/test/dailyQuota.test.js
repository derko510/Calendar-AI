// An exhausted daily quota is reported as such (503 with a clear message), not as "try again in a minute".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroqLLM } from '../src/services/llm.js';

async function groqFailure(status, message) {
  const realFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'gsk_test';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message } }), {
    status, headers: { 'content-type': 'application/json' }
  });
  try {
    await createGroqLLM({ maxRetries: 0 }).chat([{ role: 'user', content: 'hi' }]);
    assert.fail('expected an error');
  } catch (err) {
    return err;
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  }
}

test('Groq tokens-per-day 429 is marked daily', async () => {
  const err = await groqFailure(429, 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199500. Please try again in 7m12s.');
  assert.equal(err.message, 'rate_limited');
  assert.equal(err.daily, true);
});

test('Groq tokens-per-minute 429 is a short limit, not daily', async () => {
  const err = await groqFailure(429, 'Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7900. Please try again in 1.2s.');
  assert.equal(err.message, 'rate_limited');
  assert.equal(err.daily, false);
});

test('words that merely contain the letters TPD are not mistaken for a daily limit', async () => {
  const err = await groqFailure(429, 'Too many requests (OUTPDATED client)');
  assert.equal(err.daily, false);
});
