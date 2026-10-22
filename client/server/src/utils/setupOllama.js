import { OllamaService } from '../services/ollamaService.js';

export async function setupOllama() {
  const ollama = new OllamaService();
  
  console.log('Checking Ollama setup...');
  
  try {
    // Check if model is available
    const isAvailable = await ollama.isModelAvailable();
    
    if (!isAvailable) {
      console.log(`Model ${ollama.model} not found. Pulling...`);
      await ollama.pullModel();
    } else {
      console.log(`Model ${ollama.model} is ready!`);
    }
    
    return true;
  } catch (error) {
    console.error('Ollama setup failed:', error.message);
    console.log('\nPlease make sure Ollama is installed and running:');
    console.log('1. Install Ollama: curl -fsSL https://ollama.ai/install.sh | sh');
    console.log('2. Start Ollama: ollama serve');
    console.log('3. Pull model: ollama pull llama3.2:3b');
    return false;
  }
}