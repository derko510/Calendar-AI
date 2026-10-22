import { OllamaService } from './ollamaService.js';
import { CloudLLMService } from './cloudLLM.js';

export class SimpleChatService {
  constructor() {
    // Use cloud LLM in production, Ollama in development
    if (process.env.NODE_ENV === 'production') {
      this.llm = new CloudLLMService();
    } else {
      this.llm = new OllamaService();
    }
  }

  async processMessage(userMessage) {
    try {
      console.log('Processing message:', userMessage);
      
      // Create a simple prompt for calendar assistant
      const prompt = `You are a helpful calendar assistant. The user said: "${userMessage}"

If they're asking about calendar events, politely explain that you don't have access to their calendar data yet, but you're happy to help with general calendar questions or advice.

If they're asking general questions, answer helpfully.

Keep your response friendly and conversational. Don't mention technical details about databases or RAG systems.`;

      const response = await this.llm.generate(prompt, { 
        temperature: 0.7,
        max_tokens: 200 
      });

      return {
        success: true,
        message: response.trim()
      };
    } catch (error) {
      console.error('Error in simple chat service:', error);
      
      // Fallback responses if LLM fails
      if (error.message.includes('Ollama') || error.message.includes('API')) {
        return {
          success: true,
          message: "I'm having trouble connecting to my AI service. Please try again in a moment."
        };
      }
      
      return {
        success: false,
        message: "Sorry, I'm having trouble processing your message right now. Please try again."
      };
    }
  }

  async healthCheck() {
    try {
      const isAvailable = await this.llm.isModelAvailable();
      return {
        llm: isAvailable,
        provider: process.env.NODE_ENV === 'production' ? 'cloud' : 'ollama',
        model: this.llm.model || 'unknown'
      };
    } catch (error) {
      return {
        llm: false,
        error: error.message
      };
    }
  }
}