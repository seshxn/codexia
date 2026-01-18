import type { AIConfig } from './types.js';

/**
 * Load AI configuration from environment variables.
 * Returns null if AI is not configured - this signals graceful fallback.
 */
export function getAIConfig(): AIConfig | null {
  const provider = process.env.CODEXIA_AI_PROVIDER as AIConfig['provider'] | undefined;
  const apiKey = process.env.CODEXIA_AI_API_KEY;
  const baseUrl = process.env.CODEXIA_AI_BASE_URL;
  const model = process.env.CODEXIA_AI_MODEL;

  // For OpenAI/Anthropic, require API key
  // For Ollama, just require provider to be set (local, no key needed)
  if (!provider) {
    return null;
  }

  if (provider === 'ollama') {
    return {
      provider,
      baseUrl: baseUrl || 'http://localhost:11434',
      model: model || 'llama3',
    };
  }

  // OpenAI and Anthropic require API key
  if (!apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model: model || getDefaultModel(provider),
  };
}

function getDefaultModel(provider: AIConfig['provider']): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'ollama':
      return 'llama3';
    default:
      return 'gpt-4o';
  }
}

/**
 * Check if AI is enabled (has valid configuration)
 */
export function isAIEnabled(): boolean {
  return getAIConfig() !== null;
}
