import axios from 'axios';

export class OllamaService {
  constructor() {
    this.baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  }

  async chat(messages, options = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/api/chat`, {
        model: this.model,
        messages: messages,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          ...options
        }
      });

      return response.data.message.content;
    } catch (error) {
      console.error('Ollama API error:', error.response?.data || error.message);
      throw new Error('Failed to get response from Ollama');
    }
  }

  async generate(prompt, options = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options.temperature || 0.7,
          ...options
        }
      });

      return response.data.response;
    } catch (error) {
      console.error('Ollama API error:', error.response?.data || error.message);
      throw new Error('Failed to get response from Ollama');
    }
  }

  async isModelAvailable() {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`);
      const models = response.data.models || [];
      return models.some(model => model.name === this.model);
    } catch (error) {
      console.error('Error checking Ollama models:', error.message);
      return false;
    }
  }

  async pullModel() {
    try {
      console.log(`Pulling model ${this.model}...`);
      const response = await axios.post(`${this.baseURL}/api/pull`, {
        name: this.model
      });
      console.log('Model pulled successfully');
      return true;
    } catch (error) {
      console.error('Error pulling model:', error.message);
      return false;
    }
  }
}