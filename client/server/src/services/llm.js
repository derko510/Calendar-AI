// LLM clients for the assistant, all behind one interface:
//   { provider, model, usage, generate(prompt, opts), chat(messages, { tools }) }
// chat() takes and returns OpenAI-style messages (role / content / tool_calls), so agent.js doesn't care which provider runs.
//   Groq:   OpenAI-compatible REST, GROQ_MODEL (default openai/gpt-oss-20b). Free tier, so it goes first.
//   Claude: official Anthropic SDK, always claude-haiku-5-5 (the cheapest Claude model; not configurable). Paid, so it is the backup.
// With both keys set, every request starts on Groq and switches to Claude only when Groq is rate limited.
// LLM_PROVIDER=groq|anthropic forces a single provider.
import Anthropic from '@anthropic-ai/sdk';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// llama-3.1-8b-instant stopped being served to free accounts (404), so the default is gpt-oss-20b
export const groqModel = () => process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
// gpt-oss models reason before answering; keep that short
const isReasoningModel = model => /gpt-oss/.test(model);

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

/**
 * One Groq client with usage tracking.
 * maxRetries / maxWaitMs: the web route keeps these small (a user is waiting, Vercel stops at 30 s);
 * the eval runner raises them so a rate limit slows the run instead of failing cases.
 */
export function createGroqLLM({ model = groqModel(), maxRetries = 1, maxWaitMs = 4000 } = {}) {
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0 };

  async function request(body) {
    if (!groqKey()) throw new Error('GROQ_API_KEY is not set on the server');
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          ...body,
          ...(isReasoningModel(model) && { reasoning_effort: 'low', max_tokens: (body.max_tokens || 600) + 1000 })
        }),
      });
      // 429 = rate limited; 500/502/503 = transient provider trouble. Both are worth one more try.
      if (response.status === 429 || [500, 502, 503].includes(response.status)) {
        const wait = retryDelayMs(response, attempt);
        if (attempt < maxRetries && wait <= maxWaitMs) {
          await sleep(wait);
          continue;
        }
        if (response.status === 429) throw Object.assign(new Error('rate_limited'), { status: 429 });
      }
      if (!response.ok) {
        const text = await errorText(response);
        // Free-tier "request too large for tokens per minute" is a rate limit too, just reported as 413
        if (response.status === 413 && /rate limit|tokens per minute|TPM/i.test(text)) {
          throw Object.assign(new Error('rate_limited'), { status: 429, providerMessage: text });
        }
        throw Object.assign(new Error(`Groq API error ${response.status}: ${text}`), { status: response.status, providerMessage: text });
      }
      const data = await response.json();
      usage.calls += 1;
      usage.promptTokens += data.usage?.prompt_tokens || 0;
      usage.completionTokens += data.usage?.completion_tokens || 0;
      return data.choices?.[0]?.message ?? {};
    }
  }

  return {
    provider: 'groq',
    model,
    usage,
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
    async chat(messages, { tools, toolChoice = 'auto', temperature = 0, maxTokens = 600 } = {}) {
      return request({
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(tools && { tools, tool_choice: toolChoice, parallel_tool_calls: false }),
      });
    },
  };
}

// ---------- Claude ----------

// Hardcoded on purpose: the cheapest Claude model, and the one the evals measured. No env var can switch it to a pricier model.
export const CLAUDE_MODEL = 'claude-haiku-5-5';
export const anthropicModel = () => CLAUDE_MODEL;
// low = least thinking, fewest tokens. The evals decide whether a higher level is worth it.
export const anthropicEffort = () => process.env.ANTHROPIC_EFFORT || 'low';

// 'groq+anthropic' = Groq first, Claude when Groq is rate limited (both keys set)
export function llmProvider() {
  const forced = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (forced === 'anthropic' || forced === 'groq') return forced;
  const hasGroq = Boolean(groqKey());
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  if (hasGroq && hasClaude) return 'groq+anthropic';
  return hasClaude ? 'anthropic' : 'groq';
}

export function activeModel() {
  const provider = llmProvider();
  if (provider === 'anthropic') return anthropicModel();
  if (provider === 'groq') return groqModel();
  return `${groqModel()} → ${anthropicModel()}`;
}

// options.model picks one provider explicitly (the eval runner's --model): claude-* → Claude, anything else → Groq
export function createLLM(options = {}) {
  if (options.model) {
    return options.model.startsWith('claude') ? createAnthropicLLM(options) : createGroqLLM(options);
  }
  const provider = llmProvider();
  if (provider === 'anthropic') return createAnthropicLLM(options);
  if (provider === 'groq') return createGroqLLM(options);
  // A user is waiting: don't sit out Groq's rate limit, hand the request to Claude right away
  return createFallbackLLM(createGroqLLM({ ...options, maxRetries: 0 }), createAnthropicLLM(options));
}

/**
 * Tries `primary`; when it reports a rate limit, switches to `backup` for the rest of this request
 * (one chat message = one LLM object), so an agent loop never bounces between providers mid-conversation.
 * Any other primary error (bad key, bad request) is surfaced, not hidden behind the backup.
 */
export function createFallbackLLM(primary, backup) {
  let active = primary;
  const switchOnRateLimit = method => async (...args) => {
    if (active === primary) {
      try {
        return await primary[method](...args);
      } catch (err) {
        if (err.message !== 'rate_limited') throw err;
        active = backup;
        console.log(JSON.stringify({ llm: 'fallback', from: primary.provider, to: backup.provider }));
      }
    }
    return backup[method](...args);
  };
  return {
    provider: `${primary.provider}+${backup.provider}`,
    get model() { return active.model; },
    get fellBack() { return active === backup; },
    get usage() {
      const sum = key => (primary.usage[key] || 0) + (backup.usage[key] || 0);
      return {
        calls: sum('calls'), promptTokens: sum('promptTokens'), completionTokens: sum('completionTokens'),
        cacheReadTokens: sum('cacheReadTokens'), fellBack: active === backup,
        servedModel: active.usage.servedModel || active.model
      };
    },
    generate: switchOnRateLimit('generate'),
    chat: switchOnRateLimit('chat')
  };
}

function toAnthropicTools(tools = []) {
  return tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
}

// OpenAI-style history → Anthropic { system, messages }.
// Assistant turns carry the exact Claude content (_anthropicContent) so thinking blocks go back unchanged, as the API requires.
function toAnthropicMessages(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      if (m._anthropicContent) {
        out.push({ role: 'assistant', content: m._anthropicContent });
      } else {
        const blocks = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const c of m.tool_calls || []) {
          blocks.push({ type: 'tool_use', id: c.id, name: c.function.name, input: safeParse(c.function.arguments) });
        }
        out.push({ role: 'assistant', content: blocks });
      }
    } else if (m.role === 'tool') {
      out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content) }] });
    } else {
      out.push({ role: 'user', content: String(m.content) });
    }
  }
  return { system, messages: out };
}

function safeParse(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
}

// Typed SDK errors → the two signals the rest of the app understands
function mapAnthropicError(err) {
  if (err instanceof Anthropic.RateLimitError) return Object.assign(new Error('rate_limited'), { status: 429 });
  if (err instanceof Anthropic.APIError) {
    return Object.assign(new Error(`Claude API error ${err.status ?? ''}: ${err.message}`), { status: err.status, providerMessage: err.message });
  }
  return err;
}

// fetchImpl / apiKey exist for tests (a fake HTTP layer); the app leaves them unset
export function createAnthropicLLM({ model = anthropicModel(), maxRetries = 2, timeoutMs = 25000, effort = anthropicEffort(), fetchImpl, apiKey } = {}) {
  // The SDK retries 429 / 5xx / connection errors itself, with backoff
  // Keys that aren't scoped to one workspace must name the workspace on every request
  const workspaceId = (process.env.ANTHROPIC_WORKSPACE_ID || '').trim();
  const client = new Anthropic({
    maxRetries,
    timeout: timeoutMs,
    ...(workspaceId && { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }),
    ...(fetchImpl && { fetch: fetchImpl }),
    ...(apiKey && { apiKey })
  });
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0, cacheReadTokens: 0 };

  async function create(params) {
    let response;
    try {
      response = await client.messages.create({ model, output_config: { effort }, ...params });
    } catch (err) {
      throw mapAnthropicError(err);
    }
    // The model that actually answered, as reported by the API (not just the one requested)
    usage.servedModel = response.model;
    const u = response.usage || {};
    usage.calls += 1;
    usage.promptTokens += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    usage.cacheReadTokens += u.cache_read_input_tokens || 0;
    usage.completionTokens += u.output_tokens || 0;
    if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    return response;
  }

  const textOf = (response) => response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();

  return {
    provider: 'anthropic',
    model,
    usage,
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
    }
  };
}
