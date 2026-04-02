import type { AIProvider, AIMessage, AICompletionOptions, AIConfig } from '../types.js';
import { requestWithPolicy } from '../../shared/http/request-policy.js';

/**
 * OpenAI provider that uses the latest official Responses API by default.
 * Custom compatible base URLs keep the legacy Chat Completions fallback.
 */
export class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: AIConfig) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    this.defaultModel = config.model || 'gpt-5.4';
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 2048;
    const temperature = options?.temperature ?? 0.3;

    if (this.shouldUseResponsesApi()) {
      return this.chatWithResponses(messages, { model, maxTokens, temperature });
    }

    return this.chatWithChatCompletions(messages, { model, maxTokens, temperature });
  }

  private shouldUseResponsesApi(): boolean {
    return this.baseUrl === 'https://api.openai.com/v1';
  }

  private async chatWithResponses(
    messages: AIMessage[],
    options: { model: string; maxTokens: number; temperature: number },
  ): Promise<string> {
    const response = await requestWithPolicy(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        input: messages,
        max_output_tokens: options.maxTokens,
        temperature: options.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      output?: Array<{
        type?: string;
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    };

    return (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('');
  }

  private async chatWithChatCompletions(
    messages: AIMessage[],
    options: { model: string; maxTokens: number; temperature: number },
  ): Promise<string> {
    const response = await requestWithPolicy(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content || '';
  }
}
