// Text generation for the real-calendar routes.
// Provider: LLM_PROVIDER (gemini | groq | ollama) if set, otherwise Gemini when GEMINI_API_KEY is set,
// then Groq when GROQ_API_KEY is set, then local Ollama.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const PROVIDERS = ['gemini', 'groq', 'ollama'];

export const llmProvider = () => {
  const chosen = process.env.LLM_PROVIDER?.toLowerCase();
  if (PROVIDERS.includes(chosen)) return chosen;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  return 'ollama';
};

// Both APIs return {"error":{"message":"..."}}; fall back to the raw body
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
  const provider = llmProvider();

  if (provider === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // No maxOutputTokens: on thinking models it also caps reasoning tokens and can cut the answer off
        generationConfig: {
          temperature,
          ...(json && { responseMimeType: 'application/json' }),
        },
      }),
    });

    if (response.status === 429) throw new Error('rate_limited');
    if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${await errorText(response)}`);

    const data = await response.json();
    return (data.candidates?.[0]?.content?.parts || [])
      .filter(part => !part.thought)
      .map(part => part.text || '')
      .join('');
  }

  if (provider === 'groq') {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
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

  const { OllamaService } = await import('./ollamaService.js');
  return new OllamaService().generate(prompt, { temperature, num_predict: maxTokens, ...(json && { format: 'json' }) });
}
