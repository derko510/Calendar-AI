// LLM clients for the assistant, all behind one interface:
//   { provider, model, usage, answerMode, generate(prompt, opts), chat(messages, { tools, toolChoice, maxTokens }), switchToBackup() }
// chat() takes and returns OpenAI-style messages (role / content / tool_calls), so agent.js doesn't care which provider runs.
//   Groq:   OpenAI-compatible REST. Free tier; rate limits are per model, so the public tier chains several models.
//   Claude: official Anthropic SDK, always claude-haiku-5-5 (the cheapest Claude model; not configurable). Paid.
//
// Tiers (createLLM({ tier })):
//   owner  — Claude first; on rate limit / 5xx / timeout / network error the rest of the request runs on Groq.
//            LLM_PROVIDER=anthropic|groq forces one provider. With only one key, that one is used.
//   public — Groq only, GROQ_MODELS in order (next model on rate limit / 5xx / timeout). Never Claude.
//   none   — an explicit `model` picks exactly that provider (evals, check-env); otherwise like owner.
//
// Every request has a time budget (default 24 s, Vercel stops the function at 30 s). Each call gets a timeout
// sized to what is left, and running out surfaces as a clean { code: 'timeout' } error instead of a hang.
import Anthropic from '@anthropic-ai/sdk';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const WEB_BUDGET_MS = 24000; // whole request
const WEB_CALL_MS = 15000; // one model call, so a hung primary still leaves time for the backup
const MIN_CALL_MS = 1500; // less than this left: don't start another call

// Public-tier order, picked from eval results (see evals/README.md): accuracy first, then latency.
export const GROQ_DEFAULT_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

// GROQ_MODELS="a,b,c" sets the whole chain; GROQ_MODEL (older setting) puts one model first
export function groqModels() {
  const list = (process.env.GROQ_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.length) return [...new Set(list)];
  const first = (process.env.GROQ_MODEL || '').trim();
  return first ? [first, ...GROQ_DEFAULT_MODELS.filter(m => m !== first)] : [...GROQ_DEFAULT_MODELS];
}
export const groqModel = () => groqModels()[0];

// Models that think before answering. Their thinking must never become the answer.
export const isReasoningModel = model => /gpt-oss|qwen|deepseek|\br1\b|reason|think|magistral/i.test(model);
// Per-family request settings that keep the thinking short
function reasoningParams(model) {
  if (/gpt-oss/i.test(model)) return { reasoning_effort: 'low' };
  if (/qwen/i.test(model)) return { reasoning_effort: 'none', reasoning_format: 'hidden' };
  return {};
}

// <think>…</think> (and an unterminated <think> at the start) is reasoning, not answer text
export function stripThinking(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*<think>[\s\S]*$/i, '').trim();
}

// Pasted env values often carry a trailing newline, spaces or quotes, which Groq rejects as an invalid key
export const groqKey = () => {
  let key = (process.env.GROQ_API_KEY || '').trim();
  const quoted = key.length > 1 && (key[0] === '"' || key[0] === "'") && key.at(-1) === key[0];
  if (quoted) key = key.slice(1, -1).trim();
  return key;
};

// Safe to show: identifies which key is loaded without revealing it
export const groqKeyFingerprint = () => {
  const raw = process.env.GROQ_API_KEY;
  if (!raw) return null;
  const key = groqKey();
  return { start: key.slice(0, 8), end: key.slice(-4), length: key.length, hadExtraCharacters: raw !== key };
};

const hasClaudeKey = () => Boolean((process.env.ANTHROPIC_API_KEY || '').trim());

// Groq returns {"error":{"message":"..."}}; fall back to the raw body
async function errorText(response) {
  const body = await response.text();
  try {
    return JSON.parse(body).error?.message || body;
  } catch {
    return body;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Groq sends retry-after in seconds (sometimes fractional); fall back to exponential backoff
function retryDelayMs(response, attempt) {
  const header = Number(response.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header * 1000 + 250 : 1000 * 2 ** attempt;
}

// ---------- shared error shapes ----------
export const timeoutError = (provider) => Object.assign(new Error('The AI took too long to answer. Please try again.'), { code: 'timeout', provider });
// daily: the provider's per-day quota is used up (Groq says "tokens per day (TPD)" / "requests per day"), so retrying soon won't help
const rateLimited = (provider, providerMessage) => Object.assign(new Error('rate_limited'), {
  status: 429, provider, ...(providerMessage && { providerMessage }),
  daily: /per day|\bTPD\b|\bRPD\b/i.test(providerMessage || '')
});
const truncated = (provider) => Object.assign(new Error('The AI reply was cut off.'), { code: 'output_truncated', provider });

// One deadline shared by every call (and every provider) in a request. Infinity = no budget (evals).
export function createBudget(budgetMs = WEB_BUDGET_MS, callMs = WEB_CALL_MS) {
  const deadline = Number.isFinite(budgetMs) ? Date.now() + budgetMs : Infinity;
  return {
    remaining: () => deadline - Date.now(),
    // Timeout for the next call, or throws when there is no time left
    callTimeout(provider) {
      const left = deadline - Date.now();
      if (left < MIN_CALL_MS) throw timeoutError(provider);
      return Math.min(callMs, left);
    }
  };
}

const newUsage = () => ({ calls: 0, promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, retries: 0, retryWaitMs: 0, modelMs: 0 });

/**
 * One Groq model with usage tracking.
 * maxRetries / maxWaitMs: how long to sit out a 429 on the same model. The web path keeps these small
 * (a user is waiting, and the next model in the chain has its own limit); evals raise them.
 */
export function createGroqLLM({ model = groqModel(), maxRetries = 1, maxWaitMs = 4000, budget = createBudget(Infinity, 60000), fetchImpl } = {}) {
  const usage = newUsage();
  const doFetch = fetchImpl || ((...a) => fetch(...a));

  async function request(body) {
    if (!groqKey()) throw Object.assign(new Error('GROQ_API_KEY is not set on the server'), { code: 'not_configured', provider: 'groq' });
    for (let attempt = 0; ; attempt++) {
      const timeout = budget.callTimeout('groq');
      const started = Date.now();
      let response;
      try {
        response = await doFetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            ...body,
            ...(isReasoningModel(model) && { ...reasoningParams(model), max_tokens: (body.max_tokens || 600) + 1000 })
          }),
          signal: AbortSignal.timeout(timeout)
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw timeoutError('groq');
        throw Object.assign(new Error(`Could not reach Groq: ${err?.message || err}`), { code: 'network', provider: 'groq' });
      }
      // 429 = rate limited; 500/502/503 = transient provider trouble. Both are worth another try if time allows.
      if (response.status === 429 || [500, 502, 503].includes(response.status)) {
        const wait = retryDelayMs(response, attempt);
        if (attempt < maxRetries && wait <= maxWaitMs && wait < budget.remaining() - MIN_CALL_MS) {
          usage.retries += 1;
          usage.retryWaitMs += wait;
          await sleep(wait);
          continue;
        }
        if (response.status === 429) throw rateLimited('groq', await errorText(response).catch(() => ''));
      }
      if (!response.ok) {
        const text = await errorText(response);
        // Free-tier "request too large for tokens per minute" is a rate limit too, just reported as 413
        if (response.status === 413 && /rate limit|tokens per minute|TPM/i.test(text)) throw rateLimited('groq', text);
        throw Object.assign(new Error(`Groq API error ${response.status}: ${text}`), { status: response.status, provider: 'groq', providerMessage: text });
      }
      const data = await response.json();
      usage.modelMs += Date.now() - started;
      usage.calls += 1;
      usage.promptTokens += data.usage?.prompt_tokens || 0;
      usage.completionTokens += data.usage?.completion_tokens || 0;
      usage.servedModel = data.model || model;
      const choice = data.choices?.[0] || {};
      const message = { ...(choice.message || {}) };
      // Reasoning output never becomes the answer: drop the separate field and any inline <think> block
      delete message.reasoning;
      if (typeof message.content === 'string') message.content = stripThinking(message.content) || null;
      if (choice.finish_reason === 'length' && !message.tool_calls?.length) throw truncated('groq');
      return message;
    }
  }

  return {
    provider: 'groq',
    model,
    usage,
    answerMode: 'text',
    // Single prompt in, text out. json: true forces one valid JSON object.
    async generate(prompt, { temperature = 0.3, maxTokens = 500, json = false } = {}) {
      const message = await request({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        ...(json && { response_format: { type: 'json_object' } }),
      });
      return message.content ?? '';
    },
    // Chat with tools (OpenAI-compatible). Returns the assistant message, including any tool_calls.
    async chat(messages, { tools, toolChoice = 'auto', temperature = 0, maxTokens = 800 } = {}) {
      return request({
        messages: messages.map(toGroqMessage),
        temperature,
        max_tokens: maxTokens,
        ...(tools && { tools, tool_choice: toolChoice, parallel_tool_calls: false }),
      });
    },
    switchToBackup: () => false
  };
}

// Groq rejects unknown message fields; _anthropicContent is ours
function toGroqMessage(m) {
  if (!('_anthropicContent' in m)) return m;
  const rest = { ...m };
  delete rest._anthropicContent;
  return rest;
}

// ---------- Claude ----------

// Hardcoded on purpose: the cheapest Claude model, and the one the evals measured. No env var can switch it to a pricier model.
export const CLAUDE_MODEL = 'claude-haiku-5-5';
export const anthropicModel = () => CLAUDE_MODEL;
// low = least thinking, fewest tokens. The evals decide whether a higher level is worth it.
export const anthropicEffort = () => process.env.ANTHROPIC_EFFORT || 'low';

const forcedProvider = () => {
  const forced = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  return forced === 'anthropic' || forced === 'groq' ? forced : null;
};

// Owner tier: the providers in order, from the keys present and LLM_PROVIDER
function ownerChain() {
  const forced = forcedProvider();
  if (forced) return [forced];
  const chain = [];
  if (hasClaudeKey()) chain.push('anthropic');
  if (groqKey()) chain.push('groq');
  return chain.length ? chain : ['groq'];
}

// A label for /api/health and check-env, e.g. "owner: anthropic→groq · public: groq"
export function llmProvider() {
  return `owner: ${ownerChain().join('→')} · public: ${groqKey() ? 'groq' : 'unavailable'}`;
}

export function activeModel() {
  const groq = groqModels().join('→');
  const owner = ownerChain().map(p => (p === 'anthropic' ? anthropicModel() : groq)).join('→');
  return `owner: ${owner} · public: ${groqKey() ? groq : 'unavailable'}`;
}

// The Groq models of one tier, each next one taking over on rate limit / 5xx / timeout
function groqChain(options, budget) {
  const models = groqModels();
  const llms = models.map((model, i) => createGroqLLM({
    ...options,
    model,
    budget,
    // The next model has its own limit, so don't sit out a 429 unless this is the last model
    maxRetries: i < models.length - 1 ? 0 : (options.maxRetries ?? 1)
  }));
  return llms.reduceRight((backup, primary) => (backup ? createFallbackLLM(primary, backup, { manualSwitch: false }) : primary), null);
}

/**
 * options.tier: 'owner' | 'public' (see the top of this file)
 * options.model: one specific model (evals, check-env); claude-* → Claude, anything else → Groq
 * options.budgetMs / callMs: time budget (default 24 s / 15 s per call); evals pass Infinity
 */
export function createLLM(options = {}) {
  const { tier, model, budgetMs, callMs, ...rest } = options;
  const budget = createBudget(budgetMs ?? (model && !tier ? Infinity : WEB_BUDGET_MS), callMs ?? (model && !tier ? 60000 : WEB_CALL_MS));
  if (model && !tier) {
    return model.startsWith('claude') ? createAnthropicLLM({ ...rest, model, budget }) : createGroqLLM({ ...rest, model, budget });
  }
  if (tier === 'public') {
    if (!groqKey()) throw Object.assign(new Error('The assistant is unavailable right now.'), { code: 'assistant_unavailable' });
    return groqChain(rest, budget);
  }
  // owner, or no tier
  const make = p => (p === 'anthropic' ? createAnthropicLLM({ maxRetries: 1, ...rest, budget }) : groqChain(rest, budget));
  const [first, ...others] = ownerChain();
  return others.length ? createFallbackLLM(make(first), make(others[0]), { manualSwitch: false }) : make(first);
}

// Rate limit, provider 5xx, timeout, network trouble: worth handing to the backup. Never 400/401/403
// (a bad request or a bad key must stay visible, not be hidden behind another provider).
export function isSwitchableError(err) {
  if (!err) return false;
  if (err.message === 'rate_limited' || err.status === 429) return true;
  if (err.code === 'timeout' || err.code === 'network') return true;
  return Number(err.status) >= 500;
}

/**
 * Tries `primary`; when it fails with a switchable error, switches to `backup` for the rest of this request
 * (one chat message = one LLM object), so an agent loop never bounces between providers mid-conversation.
 * switchToBackup(): lets the agent move on after repeated malformed tool calls; only when manualSwitch is
 * true (a backup that is weaker than the primary is not worth switching to for that).
 */
export function createFallbackLLM(primary, backup, { manualSwitch = true } = {}) {
  let active = primary;
  const toBackup = (reason) => {
    if (active === backup) return false;
    active = backup;
    console.log(JSON.stringify({ llm: 'fallback', from: `${primary.provider}:${primary.model}`, to: `${backup.provider}:${backup.model}`, reason }));
    return true;
  };
  const call = method => async (...args) => {
    if (active === primary) {
      try {
        return await primary[method](...args);
      } catch (err) {
        // A nested chain may have switched internally; only move on when it has nothing left
        if (!isSwitchableError(err)) throw err;
        toBackup(err.code || err.status || err.message);
      }
    }
    return backup[method](...args);
  };
  return {
    provider: `${primary.provider}+${backup.provider}`,
    get model() { return active.model; },
    get answerMode() { return active.answerMode; },
    get fellBack() { return active === backup || Boolean(active.fellBack); },
    get servedBy() { return active.servedBy || `${active.provider}:${active.usage.servedModel || active.model}`; },
    get usage() {
      const sum = key => (primary.usage[key] || 0) + (backup.usage[key] || 0);
      return {
        calls: sum('calls'), promptTokens: sum('promptTokens'), completionTokens: sum('completionTokens'),
        cacheReadTokens: sum('cacheReadTokens'), retries: sum('retries'), retryWaitMs: sum('retryWaitMs'), modelMs: sum('modelMs'),
        fellBack: active === backup || Boolean(active.fellBack),
        servedModel: active.usage.servedModel || active.model
      };
    },
    switchToBackup() {
      if (active === primary) return manualSwitch ? toBackup('malformed tool calls') : Boolean(primary.switchToBackup?.());
      return Boolean(backup.switchToBackup?.());
    },
    generate: call('generate'),
    chat: call('chat')
  };
}

function toAnthropicTools(tools = []) {
  return tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
}

// Anthropic tool ids must match ^[a-zA-Z0-9_-]+$; Groq's usually do, but don't count on it
const toolId = id => String(id || 'tool').replace(/[^a-zA-Z0-9_-]/g, '_');

// OpenAI-style history → Anthropic { system, messages }.
// Assistant turns carry the exact Claude content (_anthropicContent) so thinking blocks go back unchanged, as the API requires.
// Turns from another provider (a Groq step before a mid-request fallback) are rebuilt from content + tool_calls.
// Consecutive turns with the same role are merged (tool results and a follow-up note are one user turn).
export function toAnthropicMessages(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const out = [];
  const push = (role, blocks) => {
    if (blocks.length === 0) return;
    const last = out.at(-1);
    if (last?.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      if (m._anthropicContent) {
        push('assistant', [...m._anthropicContent]);
      } else {
        const blocks = [];
        if (m.content) blocks.push({ type: 'text', text: String(m.content) });
        for (const c of m.tool_calls || []) {
          blocks.push({ type: 'tool_use', id: toolId(c.id), name: c.function.name, input: safeParse(c.function.arguments) });
        }
        push('assistant', blocks);
      }
    } else if (m.role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: toolId(m.tool_call_id), content: String(m.content) }]);
    } else if (m.content) {
      push('user', [{ type: 'text', text: String(m.content) }]);
    }
  }
  // Single plain user text stays a string (the common, cache-friendly shape)
  return { system, messages: out.map(m => (m.role === 'user' && m.content.length === 1 && m.content[0].type === 'text' ? { role: 'user', content: m.content[0].text } : m)) };
}

function safeParse(text) {
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// Typed SDK errors → the signals the rest of the app understands
function mapAnthropicError(err) {
  if (err instanceof Anthropic.RateLimitError) return rateLimited('anthropic');
  if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError || err?.name === 'TimeoutError' || err?.name === 'AbortError') return timeoutError('anthropic');
  if (err instanceof Anthropic.APIConnectionError) return Object.assign(new Error(`Could not reach Claude: ${err.message}`), { code: 'network', provider: 'anthropic' });
  if (err instanceof Anthropic.APIError) {
    return Object.assign(new Error(`Claude API error ${err.status ?? ''}: ${err.message}`), { status: err.status, provider: 'anthropic', providerMessage: err.message });
  }
  return err;
}

// fetchImpl / apiKey exist for tests (a fake HTTP layer); the app leaves them unset
export function createAnthropicLLM({ model = anthropicModel(), maxRetries = 2, effort = anthropicEffort(), budget = createBudget(Infinity, 60000), fetchImpl, apiKey } = {}) {
  // The SDK retries 429 / 5xx / connection errors itself, with backoff
  // Keys that aren't scoped to one workspace must name the workspace on every request
  const workspaceId = (process.env.ANTHROPIC_WORKSPACE_ID || '').trim();
  let client;
  // Built on first use, so a tier that never calls Claude never constructs the client
  const getClient = () => (client ||= new Anthropic({
    maxRetries,
    ...(workspaceId && { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }),
    ...(fetchImpl && { fetch: fetchImpl }),
    ...(apiKey && { apiKey })
  }));
  const usage = newUsage();

  async function create(params) {
    const timeout = budget.callTimeout('anthropic');
    const started = Date.now();
    let response;
    try {
      // timeout bounds one attempt; the signal bounds all attempts together
      response = await getClient().messages.create(
        { model, output_config: { effort }, ...params },
        { timeout, signal: AbortSignal.timeout(Math.max(timeout, Math.min(budget.remaining(), 600000))) }
      );
    } catch (err) {
      throw mapAnthropicError(err);
    }
    usage.modelMs += Date.now() - started;
    // The model that actually answered, as reported by the API (not just the one requested)
    usage.servedModel = response.model;
    const u = response.usage || {};
    usage.calls += 1;
    usage.promptTokens += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    usage.cacheReadTokens += u.cache_read_input_tokens || 0;
    usage.completionTokens += u.output_tokens || 0;
    if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    if (response.stop_reason === 'max_tokens' && !response.content.some(b => b.type === 'tool_use')) throw truncated('anthropic');
    return response;
  }

  const textOf = (response) => response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

  return {
    provider: 'anthropic',
    model,
    usage,
    answerMode: 'tool',
    async generate(prompt, { maxTokens = 2000, json = false } = {}) {
      const response = await create({
        max_tokens: maxTokens + 2000, // headroom for adaptive thinking
        messages: [{ role: 'user', content: prompt }]
      });
      const text = textOf(response);
      if (!json) return text;
      // Claude may wrap JSON in prose or code fences; keep the outermost object
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      return start >= 0 && end > start ? text.slice(start, end + 1) : text;
    },
    async chat(messages, { tools, maxTokens = 1500 } = {}) {
      const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
      const response = await create({
        max_tokens: maxTokens + 2000,
        system,
        messages: anthropicMessages,
        ...(tools && {
          tools: toAnthropicTools(tools),
          // No forced tool use: the system prompt asks for one tool call per turn,
          // and agent.js treats a plain-text reply as an answer. One call per turn keeps the loop simple.
          tool_choice: { type: 'auto', disable_parallel_tool_use: true }
        }),
        // Caches the conversation prefix, so steps 2–5 of the agent loop reread it at a fraction of the price
        cache_control: { type: 'ephemeral' }
      });
      const toolCalls = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }));
      return {
        role: 'assistant',
        content: textOf(response) || null,
        ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
        _anthropicContent: response.content
      };
    },
    switchToBackup: () => false
  };
}
