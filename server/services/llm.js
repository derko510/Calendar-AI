// Text generation for the real-calendar routes. Groq only: needs GROQ_API_KEY (model via GROQ_MODEL).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Llama models were dropped from Groq's free tier; gpt-oss-20b is free and supports JSON mode
export const groqModel = () => process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';

// gpt-oss models reason before answering, and those tokens count toward max_tokens
const isReasoningModel = (model) => model.startsWith('openai/gpt-oss');

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

// json: true forces the model to return a single valid JSON object
export async function generate(prompt, { temperature = 0.3, maxTokens = 500, json = false } = {}) {
  if (!groqKey()) throw new Error('GROQ_API_KEY is not set on the server');
  const model = groqModel();
  const reasoning = isReasoningModel(model);

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: reasoning ? maxTokens + 1024 : maxTokens,
      ...(reasoning && { reasoning_effort: 'low' }),
      ...(json && { response_format: { type: 'json_object' } }),
    }),
  });

  if (response.status === 429) throw new Error('rate_limited');
  if (!response.ok) throw new Error(`Groq API error ${response.status}: ${await errorText(response)}`);

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
