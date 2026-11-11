// Fallback chains and tiers: owner = Claude first, Groq as backup; public = Groq models only, never Claude.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallbackLLM, llmProvider, activeModel, createLLM, createGroqLLM, createBudget, groqModels, isSwitchableError, stripThinking
} from '../src/services/llm.js';

function fakeLlm(name, behaviour, extra = {}) {
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
    },
    ...extra
  };
}

const rateLimited = () => { throw Object.assign(new Error('rate_limited'), { status: 429 }); };

test('primary answers → backup is never called', async () => {
  const groq = fakeLlm('groq', () => ({ content: 'from groq' }));
  const claude = fakeLlm('anthropic', () => ({ content: 'from claude' }));
  const llm = createFallbackLLM(groq, claude);
  assert.equal((await llm.chat([])).content, 'from groq');
  assert.equal(claude.calls.length, 0);
  assert.equal(llm.fellBack, false);
  assert.equal(llm.model, 'groq-model');
});

test('primary rate limited → same request goes to the backup, and stays there for later steps', async () => {
  const groq = fakeLlm('groq', rateLimited);
  const claude = fakeLlm('anthropic', n => ({ content: `claude ${n}` }));
  const llm = createFallbackLLM(groq, claude);
  assert.equal((await llm.chat(['step 1'])).content, 'claude 1');
  assert.equal((await llm.chat(['step 2'])).content, 'claude 2');
  assert.equal(groq.calls.length, 1, 'the primary is not retried mid-conversation');
  assert.deepEqual(claude.calls, [['step 1'], ['step 2']]);
  assert.equal(llm.fellBack, true);
  assert.equal(llm.model, 'anthropic-model');
  assert.equal(llm.usage.calls, 3);
  assert.equal(llm.usage.fellBack, true);
});

test('5xx, timeout and network errors switch; 400/401/403 are surfaced, not paid for on the backup', async () => {
  for (const err of [{ status: 500 }, { status: 503 }, { code: 'timeout' }, { code: 'network' }]) {
    const primary = fakeLlm('groq', () => { throw Object.assign(new Error('x'), err); });
    const backup = fakeLlm('anthropic', () => ({ content: 'ok' }));
    assert.equal((await createFallbackLLM(primary, backup).chat([])).content, 'ok', JSON.stringify(err));
  }
  for (const status of [400, 401, 403]) {
    const primary = fakeLlm('groq', () => { throw Object.assign(new Error(`Groq API error ${status}`), { status }); });
    const backup = fakeLlm('anthropic', () => ({ content: 'x' }));
    await assert.rejects(createFallbackLLM(primary, backup).chat([]), new RegExp(String(status)));
    assert.equal(backup.calls.length, 0);
  }
  assert.equal(isSwitchableError(null), false);
});

test('switchToBackup: moves to the backup when allowed, is a no-op otherwise', async () => {
  const groq = fakeLlm('groq', () => ({ content: 'groq' }));
  const claude = fakeLlm('anthropic', () => ({ content: 'claude' }));
  const llm = createFallbackLLM(groq, claude);
  assert.equal(llm.switchToBackup(), true);
  assert.equal((await llm.chat([])).content, 'claude');
  assert.equal(llm.switchToBackup(), false, 'already on the backup');
  assert.equal(llm.fellBack, true);

  const locked = createFallbackLLM(fakeLlm('groq', () => ({ content: 'a' })), fakeLlm('groq', () => ({ content: 'b' })), { manualSwitch: false });
  assert.equal(locked.switchToBackup(), false);
  assert.equal((await locked.chat([])).content, 'a');

  // a single Groq model has nothing to switch to
  assert.equal(createGroqLLM({ model: 'm' }).switchToBackup(), false);
});

// ---------- Groq client over a fake fetch ----------
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const groqReply = (message, extra = {}) => json({ model: 'm', choices: [{ message, finish_reason: 'stop', ...extra }], usage: { prompt_tokens: 10, completion_tokens: 5 } });

test('Groq "request too large for tokens per minute" (413) counts as a rate limit', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const fetchImpl = async () => json({ error: { message: 'Request too large for model on tokens per minute (TPM): Limit 6000' } }, 413);
  await assert.rejects(createGroqLLM({ maxRetries: 0, fetchImpl }).chat([{ role: 'user', content: 'hi' }]), { message: 'rate_limited' });
});

test('Groq: thinking never becomes the answer; qwen gets thinking turned off; our private fields are not sent', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return groqReply({ role: 'assistant', content: '<think>let me see</think>Your dentist is on Sunday.', reasoning: 'long hidden thoughts' });
  };
  const llm = createGroqLLM({ model: 'qwen/qwen3.8-27b', fetchImpl });
  const reply = await llm.chat([{ role: 'assistant', content: 'x', _anthropicContent: [{ type: 'text', text: 'x' }] }, { role: 'user', content: 'hi' }]);
  assert.equal(reply.content, 'Your dentist is on Sunday.');
  assert.equal('reasoning' in reply, false);
  assert.equal(bodies[0].reasoning_effort, 'none');
  assert.equal(bodies[0].reasoning_format, 'hidden');
  assert.equal('_anthropicContent' in bodies[0].messages[0], false);
  assert.equal(stripThinking('<think>never closed'), '');

  const oss = createGroqLLM({ model: 'openai/gpt-oss-120b', fetchImpl });
  await oss.chat([{ role: 'user', content: 'hi' }]);
  assert.equal(bodies[1].reasoning_effort, 'low');
  assert.equal(bodies[1].max_tokens, 1800);
});

test('Groq: finish_reason "length" is a retryable output_truncated error, not a 400', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const fetchImpl = async () => groqReply({ role: 'assistant', content: 'half an ans' }, { finish_reason: 'length' });
  await assert.rejects(createGroqLLM({ model: 'm', fetchImpl }).chat([{ role: 'user', content: 'hi' }]), { code: 'output_truncated' });
});

test('Groq: a hung request times out within the budget as a clean error', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  const started = Date.now();
  const keepAlive = setTimeout(() => {}, 5000); // AbortSignal.timeout timers don't hold the event loop open on their own
  await assert.rejects(createGroqLLM({ model: 'm', fetchImpl: hang, budget: createBudget(5000, 60) }).chat([]), { code: 'timeout', message: /took too long/ });
  clearTimeout(keepAlive);
  assert.ok(Date.now() - started < 2000);
  // no time left in the budget: fail fast without calling
  let called = false;
  await assert.rejects(createGroqLLM({ model: 'm', fetchImpl: async () => { called = true; }, budget: createBudget(100) }).chat([]), { code: 'timeout' });
  assert.equal(called, false);
});

test('Groq: network failure is a switchable error', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(createGroqLLM({ model: 'm', fetchImpl }).chat([]), (err) => err.code === 'network' && isSwitchableError(err));
});

test('Groq: 429 waits are counted as retries, separately from model time', async () => {
  process.env.GROQ_API_KEY = 'gsk_test';
  let n = 0;
  const fetchImpl = async () => (++n === 1 ? json({ error: { message: 'slow down' } }, 429, { 'retry-after': '0.01' }) : groqReply({ content: 'ok' }));
  const llm = createGroqLLM({ model: 'm', fetchImpl, maxRetries: 2 });
  await llm.chat([]);
  assert.equal(llm.usage.retries, 1);
  assert.ok(llm.usage.retryWaitMs >= 250);
  assert.equal(llm.usage.calls, 1);
});

// ---------- tiers (global fetch stubbed: records which hosts would be called) ----------
const saved = {};
let realFetch;
let hosts;
beforeEach(() => {
  for (const k of ['GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'LLM_PROVIDER', 'GROQ_MODEL', 'GROQ_MODELS']) saved[k] = process.env[k];
  delete process.env.LLM_PROVIDER;
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_MODELS;
  realFetch = globalThis.fetch;
  hosts = [];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  globalThis.fetch = realFetch;
});

function stubFetch(handler) {
  globalThis.fetch = async (url, init) => {
    const href = String(url?.url || url);
    hosts.push(new URL(href).host);
    const body = init?.body ? JSON.parse(init.body) : {};
    return handler(new URL(href).host, body);
  };
}
const claudeReply = text => json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });

test('public tier: Groq models only; Claude is never called even when every Groq model returns 429 or 500', async () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  for (const status of [429, 500]) {
    hosts = [];
    const models = [];
    stubFetch((host, body) => {
      models.push(body.model);
      return json({ error: { message: 'nope' } }, status, { 'retry-after': '60' });
    });
    const llm = createLLM({ tier: 'public' });
    await assert.rejects(llm.chat([{ role: 'user', content: 'hi' }]));
    assert.ok(hosts.length >= 3, `tried ${hosts.length}`);
    assert.deepEqual([...new Set(hosts)], ['api.groq.com'], `status ${status}`);
    assert.deepEqual([...new Set(models)], groqModels(), 'walks the whole Groq chain');
  }
});

test('public tier: the next Groq model takes over on a rate limit', async () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  stubFetch((host, body) => (body.model === groqModels()[0] ? json({ error: { message: 'limit' } }, 429) : groqReply({ content: `hi from ${body.model}` })));
  const llm = createLLM({ tier: 'public' });
  assert.equal((await llm.chat([{ role: 'user', content: 'hi' }])).content, `hi from ${groqModels()[1]}`);
  assert.equal(llm.fellBack, true);
  assert.equal(llm.answerMode, 'text');
});

test('public tier without a Groq key: a clean "unavailable" error, never Claude', () => {
  delete process.env.GROQ_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  assert.throws(() => createLLM({ tier: 'public' }), { code: 'assistant_unavailable' });
});

test('owner tier: Claude first; a Claude rate limit hands the rest of the request to Groq', async () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  stubFetch((host) => (host === 'api.anthropic.com'
    ? json({ type: 'error', error: { type: 'rate_limit_error', message: 'slow' } }, 429, { 'x-should-retry': 'false' })
    : groqReply({ content: 'groq here' })));
  const llm = createLLM({ tier: 'owner' });
  assert.equal(llm.answerMode, 'tool');
  assert.equal((await llm.chat([{ role: 'user', content: 'hi' }])).content, 'groq here');
  assert.equal(hosts[0], 'api.anthropic.com');
  assert.equal(hosts.at(-1), 'api.groq.com');
  await llm.chat([{ role: 'user', content: 'again' }]);
  assert.equal(hosts.filter(h => h === 'api.anthropic.com').length, 1, 'stays on Groq for the rest of the request');
});

test('owner tier: Claude answering means Groq is never called', async () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  stubFetch(() => claudeReply('claude here'));
  const llm = createLLM({ tier: 'owner' });
  assert.equal((await llm.chat([{ role: 'user', content: 'hi' }])).content, 'claude here');
  assert.deepEqual(hosts, ['api.anthropic.com']);
  assert.equal(llm.servedBy, 'anthropic:claude-haiku-5-5');
});

test('owner tier with one key, and LLM_PROVIDER forcing one provider', () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(createLLM({ tier: 'owner' }).provider.startsWith('groq'), true);
  assert.equal(llmProvider(), 'owner: groq · public: groq');

  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  delete process.env.GROQ_API_KEY;
  assert.equal(createLLM({ tier: 'owner' }).provider, 'anthropic');
  assert.equal(llmProvider(), 'owner: anthropic · public: unavailable');

  process.env.GROQ_API_KEY = 'gsk_x';
  assert.equal(llmProvider(), 'owner: anthropic→groq · public: groq');
  assert.equal(createLLM().provider.startsWith('anthropic+'), true, 'no tier behaves like owner');
  assert.match(activeModel(), /^owner: claude-haiku-5-5→openai\/gpt-oss-120b/);

  process.env.LLM_PROVIDER = 'groq';
  assert.equal(llmProvider(), 'owner: groq · public: groq');
  assert.equal(createLLM({ tier: 'owner' }).provider.includes('anthropic'), false);
  process.env.LLM_PROVIDER = 'anthropic';
  assert.equal(createLLM({ tier: 'owner' }).provider, 'anthropic');
  // LLM_PROVIDER never gives the public tier Claude
  assert.equal(createLLM({ tier: 'public' }).provider.includes('anthropic'), false);
});

test('an explicit model picks that provider only (eval runner --model)', () => {
  process.env.GROQ_API_KEY = 'gsk_x';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-x';
  assert.equal(createLLM({ model: 'claude-haiku-5-5' }).provider, 'anthropic');
  assert.equal(createLLM({ model: 'openai/gpt-oss-20b' }).provider, 'groq');
  assert.equal(createLLM({ model: 'openai/gpt-oss-20b' }).model, 'openai/gpt-oss-20b');
});

test('Groq model chain: default, GROQ_MODEL first, GROQ_MODELS exact', () => {
  assert.equal(groqModels()[0], 'openai/gpt-oss-120b');
  process.env.GROQ_MODEL = 'openai/gpt-oss-20b';
  assert.equal(groqModels()[0], 'openai/gpt-oss-20b');
  assert.equal(new Set(groqModels()).size, groqModels().length);
  process.env.GROQ_MODELS = 'a, b';
  assert.deepEqual(groqModels(), ['a', 'b']);
});
