import type { AIProvider, AIConfig } from './types.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OllamaProvider } from './providers/ollama.js';
import { GeminiProvider } from './providers/gemini.js';
import { BedrockProvider } from './providers/bedrock.js';

export const createProvider = (config: AIConfig): AIProvider => {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config);
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'bedrock':
      return new BedrockProvider(config);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
};
