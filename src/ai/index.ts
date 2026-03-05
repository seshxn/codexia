// AI Module - Graceful AI integration for Codexia
// If AI is not configured, all functions silently return without errors

export * from './types.js';
export * from './config.js';
export * from './provider.js';
export * from './explainer.js';

import { getAIConfig, isAIEnabled } from './config.js';
import { createProvider } from './provider.js';
import { AIExplainer } from './explainer.js';
import type { AIProvider } from './types.js';

let cachedProvider: AIProvider | null = null;
let cachedExplainer: AIExplainer | null = null;

export const getAIProvider = (): AIProvider | null => {
  if (cachedProvider) return cachedProvider;
  
  const config = getAIConfig();
  if (!config) return null;
  
  cachedProvider = createProvider(config);
  return cachedProvider;
};

export const getAIExplainer = (): AIExplainer | null => {
  if (cachedExplainer) return cachedExplainer;
  
  const provider = getAIProvider();
  if (!provider) return null;
  
  cachedExplainer = new AIExplainer(provider);
  return cachedExplainer;
};

export const resetAI = (): void => {
  cachedProvider = null;
  cachedExplainer = null;
};

// Re-export for convenience
export { isAIEnabled };
