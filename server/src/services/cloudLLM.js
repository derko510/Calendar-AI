// Cloud LLM service for production deployment

export class CloudLLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'groq'; // groq, openai, or anthropic
    this.apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    // Using Llama 3.1 70B - Much smarter for date/time parsing and reasoning
    this.model = process.env.LLM_MODEL || 'llama-3.1-70b-versatile'; // Groq model (70B is 8.75x larger than 8B)
  }

  async generate(prompt, options = {}) {
    try {
      if (this.provider === 'groq') {
        return await this.generateGroq(prompt, options);
      } else if (this.provider === 'openai') {
        return await this.generateOpenAI(prompt, options);
      } else {
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
      }
    } catch (error) {
      console.error('Cloud LLM error:', error);
      throw error;
    }
  }

  async generateGroq(prompt, options = {}) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async generateOpenAI(prompt, options = {}) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async isModelAvailable() {
    try {
      await this.generate('Hello');
      return true;
    } catch (error) {
      return false;
    }
  }
}