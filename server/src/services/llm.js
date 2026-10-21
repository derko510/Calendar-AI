// Text generation for the real-calendar routes: Groq when GROQ_API_KEY is set (production), local Ollama otherwise.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const llmProvider = () => (process.env.GROQ_API_KEY ? 'groq' : 'ollama');

export async function generate(prompt, { temperature = 0.3, maxTokens = 500 } = {}) {
  if (llmProvider() === 'groq') {
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
      }),
    });

    if (response.status === 429) throw new Error('rate_limited');
    if (!response.ok) throw new Error(`Groq API error ${response.status}: ${await response.text()}`);

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  const { OllamaService } = await import('./ollamaService.js');
  return new OllamaService().generate(prompt, { temperature, num_predict: maxTokens });
}
