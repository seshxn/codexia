import type { AIProvider, AIMessage, AICompletionOptions, AIConfig } from '../types.js';
import { requestWithPolicy } from '../../shared/http/request-policy.js';

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * Google Gemini provider
 */
export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: AIConfig) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    this.defaultModel = config.model || 'gemini-1.5-pro';
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<string> {
    const model = options?.model || this.defaultModel;
    const maxTokens = options?.maxTokens || 2048;
    const temperature = options?.temperature ?? 0.3;

    const systemMessage = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const chatMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    const body: Record<string, unknown> = {
      contents: chatMessages,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage }] };
    }

    const endpoint = `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const response = await requestWithPolicy(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as GeminiGenerateContentResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    return text || '';
  }
}
