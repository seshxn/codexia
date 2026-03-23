import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from './openai.js';
import { getAIConfig } from '../config.js';
import type { AIConfig } from '../types.js';

describe('OpenAIProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.CODEXIA_AI_PROVIDER;
    delete process.env.CODEXIA_AI_API_KEY;
    delete process.env.CODEXIA_AI_MODEL;
    delete process.env.CODEXIA_AI_BASE_URL;
  });

  it('uses the Responses API for the default OpenAI base URL and aggregates output_text items', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        output: [
          { type: 'reasoning', id: 'rs_123' },
          {
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'output_text', text: 'Hello' },
              { type: 'output_text', text: ' world' },
            ],
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
    } satisfies AIConfig);

    const result = await provider.chat([{ role: 'user', content: 'Say hello' }]);
    const body = JSON.parse(String(calls[0].init?.body));

    expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
    expect(body).toMatchObject({
      model: 'gpt-5.4',
      input: [{ role: 'user', content: 'Say hello' }],
      max_output_tokens: 2048,
      temperature: 0.3,
    });
    expect(result).toBe('Hello world');
  });

  it('falls back to chat completions for custom compatible base URLs', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'Legacy response',
            },
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://example.com/v1',
    } satisfies AIConfig);

    const result = await provider.complete('Say hello');
    const body = JSON.parse(String(calls[0].init?.body));

    expect(calls[0].url).toBe('https://example.com/v1/chat/completions');
    expect(body).toMatchObject({
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_tokens: 2048,
      temperature: 0.3,
    });
    expect(result).toBe('Legacy response');
  });
});

describe('getAIConfig', () => {
  afterEach(() => {
    delete process.env.CODEXIA_AI_PROVIDER;
    delete process.env.CODEXIA_AI_API_KEY;
    delete process.env.CODEXIA_AI_MODEL;
    delete process.env.CODEXIA_AI_BASE_URL;
  });

  it('defaults OpenAI to gpt-5.4 when no model override is provided', () => {
    process.env.CODEXIA_AI_PROVIDER = 'openai';
    process.env.CODEXIA_AI_API_KEY = 'test-key';

    const config = getAIConfig();

    expect(config).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.4',
    });
  });
});
