import type { AIConfig } from './types.js';

export const getAIConfig = (): AIConfig | null => {
  const provider = process.env.CODEXIA_AI_PROVIDER as AIConfig['provider'] | undefined;
  const apiKey = process.env.CODEXIA_AI_API_KEY;
  const baseUrl = process.env.CODEXIA_AI_BASE_URL;
  const model = process.env.CODEXIA_AI_MODEL;
  const awsRegion = process.env.CODEXIA_AI_AWS_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const awsAccessKeyId = process.env.CODEXIA_AI_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.CODEXIA_AI_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const awsSessionToken = process.env.CODEXIA_AI_AWS_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN;

  // For OpenAI/Anthropic/Gemini require API key.
  // For Ollama and Bedrock use provider-specific auth.
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

  if (provider === 'bedrock') {
    if (!awsRegion || !awsAccessKeyId || !awsSecretAccessKey) {
      return null;
    }

    return {
      provider,
      baseUrl,
      model: model || getDefaultModel(provider),
      awsRegion,
      awsAccessKeyId,
      awsSecretAccessKey,
      awsSessionToken,
    };
  }

  // OpenAI, Anthropic and Gemini require API key
  if (!apiKey) {
    return null;
  }

  return {
    provider,
    apiKey,
    baseUrl,
    model: model || getDefaultModel(provider),
  };
};

const getDefaultModel = (provider: AIConfig['provider']): string => {
  switch (provider) {
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'ollama':
      return 'llama3';
    case 'gemini':
      return 'gemini-1.5-pro';
    case 'bedrock':
      return 'anthropic.claude-3-5-sonnet-20240620-v1:0';
    default:
      return 'gpt-4o';
  }
};

export const isAIEnabled = (): boolean => {
  return getAIConfig() !== null;
};
