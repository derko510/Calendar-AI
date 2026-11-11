// Groq first, Claude only when Groq is rate limited.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFallbackLLM, llmProvider, createLLM, createGroqLLM } from '../src/services/llm.js';

function fakeLlm(name, behaviour) {
  const calls = [];
  return {
    provider: name,
    model: `${name}-model`,
    usage: { calls: 0, promptTokens: 0, completionTokens: 0 },
    calls,
    async chat(messages) {
      calls.push(messages);
      this.usage.calls += 1;
      return behaviour(calls.length);
    },
    async generate() {
      calls.push('generate');
      return behaviour(calls.length);
    }
  };
}

const rateLimited = () => { throw Object.assign(new Error('rate_limited'), { status: 429 }); };

test('Groq answers → Claude is never called', async () => {
  const groq = fakeLlm('groq', () => ({ content: 'from groq' }));
  const claude = fakeLlm('anthropic', () => ({ content: 'from claude' }));
  const llm = createFallbackLLM(groq, claude);
  assert.equal((await llm.chat([])).content, 'from groq');
  assert.equal(claude.calls.length, 0);
  assert.equal(llm.fellBack, false);
  assert.equal(llm.model, 'groq-model');
});

test('Groq rate limited → same request goes to Claude, and stays there for later steps', async () => {
  const groq = fakeLlm('groq', rateLimited);
  const claude = fakeLlm('anthropic', n => ({ content: `claude ${n}` }));
  const llm = createFallbackLLM(groq, claude);
  assert.equal((await llm.chat(['step 1'])).content, 'claude 1');
  assert.equal((await llm.chat(['step 2'])).content, 'claude 2');
  assert.equal(groq.calls.length, 1, 'Groq is not retried mid-conversation');
  assert.deepEqual(claude.calls, [['step 1'], ['step 2']]);
  assert.equal(llm.fellBack, true);
  assert.equal(llm.model, 'anthropic-model');
  assert.equal(llm.usage.calls, 3);
  assert.equal(llm.usage.fellBack, true);
});

test('other Groq errors are surfaced, not silently paid for on Claude', async () => {
  const groq = fakeLlm('groq', () => { throw Object.assign(new Error('Groq API error 401: Invalid API Key'), { status: 401 }); });
  const claude = fakeLlm('anthropic', () => ({ content: 'x' }));
  await assert.rejects(createFallbackLLM(groq, claude).chat([]), /401/);
  assert.equal(claude.calls.length, 0);
});

test('Groq "request too large for tokens per minute" (413) counts as a rate limit', async () => {
  const realFetch = globalThis.fetch;
  process.env.GROQ_API_KEY = 'gsk_test';
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: 'Request too large for model on tokens per minute (TPM): Limit 6000' } }),
    { status: 413, headers: { 'content-type': 'application/json' } }
  );
  try {
    await assert.rejects(createGroqLLM({ maxRetries: 0 }).chat([{ role: 'user', content: 'hi' }]), { message: 'rate_limited' });
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  }
});

const saved = {};
beforeEach(() => {
  for (const k of ['GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER']) saved[k] = process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
});

test('provider selection: both keys → Groq first with Claude backup', () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  delete process.env.LLM_PROVIDER;
  assert.equal(llmProvider(), 'groq+anthropic');
  assert.equal(createLLM().provider, 'groq+anthropic');

  process.env.LLM_PROVIDER = 'anthropic';
  assert.equal(llmProvider(), 'anthropic');

  delete process.env.LLM_PROVIDER;
  delete process.env.GROQ_API_KEY;
  assert.equal(llmProvider(), 'anthropic');

  process.env.GROQ_API_KEY = 'gsk_x';
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(llmProvider(), 'groq');
});

test('an explicit model picks that provider only (eval runner --model)', () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  assert.equal(createLLM({ model: 'claude-haiku-5-5' }).provider, 'anthropic');
  assert.equal(createLLM({ model: 'openai/gpt-oss-20b' }).provider, 'groq');
});
