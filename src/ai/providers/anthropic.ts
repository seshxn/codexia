import type { AIProvider, AIMessage, AICompletionOptions, AIConfig } from '../types.js';
import { requestWithPolicy } from '../../shared/http/request-policy.js';

/**
 * Anthropic Claude provider
 */
export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: AIConfig) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
    this.defaultModel = config.model || 'claude-3-5-sonnet-20241022';
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 2048;
    const temperature = options?.temperature ?? 0.3;

    const systemMessages = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const chatMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages,
    };

    if (systemMessages) {
      body.system = systemMessages;
    }

    const response = await requestWithPolicy(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const textBlock = data.content.find(c => c.type === 'text');
    return textBlock?.text || '';
  }
}
