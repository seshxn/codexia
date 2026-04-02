import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { getAIConfig } from '../config.js';
import type { AIConfig } from '../types.js';

describe('OpenAIProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it('retries once on 429 responses', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init });

      if (calls.length === 1) {
        return new Response('rate limited', { status: 429 });
      }

      return new Response(JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Recovered' }],
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

    const result = await provider.complete('Say hello');

    expect(calls).toHaveLength(2);
    expect(result).toBe('Recovered');
  });

  it('does not retry auth failures', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response('nope', { status: 401 });
    }) as typeof fetch;

    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
    } satisfies AIConfig);

    await expect(provider.chat([
      { role: 'system', content: 'sys-1' },
      { role: 'user', content: 'Say hello' },
      { role: 'system', content: 'sys-2' },
    ])).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });

    expect(calls).toHaveLength(1);
  });

  it('propagates timeout failures from the shared transport policy', async () => {
    vi.useFakeTimers();

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn((input, init) => {
      calls.push({ url: String(input), init });

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted.'), {
            name: 'AbortError',
          }));
        }, { once: true });
      });
    }) as typeof fetch;

    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
    } satisfies AIConfig);

    const promise = provider.complete('Say hello');
    const rejection = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(15_000);
    await vi.runAllTimersAsync();

    await expect(rejection).resolves.toMatchObject({
      kind: 'timeout',
      message: 'Request timed out after 15000ms.',
    });
    expect(calls).toHaveLength(1);
  });
});

describe('AnthropicProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries on 429, normalizes baseUrl, and combines system messages', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init });

      if (calls.length === 1) {
        return new Response('rate limited', { status: 429 });
      }

      return new Response(JSON.stringify({
        content: [
          { type: 'text', text: 'Anthropic OK' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const provider = new AnthropicProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com/',
    } satisfies AIConfig);

    const result = await provider.chat([
      { role: 'system', content: 'sys-1' },
      { role: 'user', content: 'Hello' },
      { role: 'system', content: 'sys-2' },
      { role: 'assistant', content: 'Ack' },
    ]);
    const body = JSON.parse(String(calls[0].init?.body));

    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(body).toMatchObject({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Ack' },
      ],
      system: 'sys-1\n\nsys-2',
    });
    expect(calls).toHaveLength(2);
    expect(result).toBe('Anthropic OK');
  });
});

describe('GeminiProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not retry auth failures, normalizes baseUrl, and combines system messages', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response('forbidden', { status: 401 });
    }) as typeof fetch;

    const provider = new GeminiProvider({
      provider: 'gemini',
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/',
    } satisfies AIConfig);

    await expect(provider.chat([
      { role: 'system', content: 'sys-1' },
      { role: 'user', content: 'Say hello' },
      { role: 'system', content: 'sys-2' },
    ])).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });

    const body = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=test-key',
    );
    expect(body).toMatchObject({
      contents: [
        { role: 'user', parts: [{ text: 'Say hello' }] },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
      systemInstruction: {
        parts: [{ text: 'sys-1\n\nsys-2' }],
      },
    });
    expect(calls).toHaveLength(1);
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
