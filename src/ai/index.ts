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

/**
 * Get the AI provider (singleton, lazy-initialized)
 * Returns null if AI is not configured
 */
export function getAIProvider(): AIProvider | null {
  if (cachedProvider) return cachedProvider;
  
  const config = getAIConfig();
  if (!config) return null;
  
  cachedProvider = createProvider(config);
  return cachedProvider;
}

/**
 * Get the AI explainer (singleton, lazy-initialized)
 * Returns null if AI is not configured
 */
export function getAIExplainer(): AIExplainer | null {
  if (cachedExplainer) return cachedExplainer;
  
  const provider = getAIProvider();
  if (!provider) return null;
  
  cachedExplainer = new AIExplainer(provider);
  return cachedExplainer;
}

/**
 * Reset cached provider/explainer (useful for testing)
 */
export function resetAI(): void {
  cachedProvider = null;
  cachedExplainer = null;
}

// Re-export for convenience
export { isAIEnabled };
