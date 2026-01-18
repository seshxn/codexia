// ============================================================================
// AI Provider Types
// ============================================================================

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AIProvider {
  name: string;
  complete(prompt: string, options?: AICompletionOptions): Promise<string>;
  chat(messages: AIMessage[], options?: AICompletionOptions): Promise<string>;
}

export interface AIExplanation {
  summary: string;
  details?: string;
  recommendations?: string[];
  suggestions?: string[];
  riskAssessment?: string;
  description?: string;
}
