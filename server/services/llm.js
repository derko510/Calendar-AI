// Text generation for the real-calendar routes. Groq only: needs GROQ_API_KEY (model via GROQ_MODEL).

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const groqModel = () => process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

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
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set on the server');

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: groqModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
      ...(json && { response_format: { type: 'json_object' } }),
    }),
  });

  if (response.status === 429) throw new Error('rate_limited');
  if (!response.ok) throw new Error(`Groq API error ${response.status}: ${await errorText(response)}`);

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
