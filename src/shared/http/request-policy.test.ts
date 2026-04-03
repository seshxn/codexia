import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestPolicyError, requestWithPolicy } from './request-policy.js';

type FetchInput = Parameters<typeof fetch>[0];

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });

describe('requestWithPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries on 429 and respects Retry-After', async () => {
    const sleepCalls: number[] = [];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('slow down', {
        status: 429,
        headers: {
          'retry-after': '2',
        },
      }))
      .mockResolvedValueOnce(okJson({ ok: true }));

    const response = await requestWithPolicy(
      'https://example.com/resource',
      {},
      {
        fetchImpl: fetchImpl as typeof fetch,
        retries: 1,
        sleep: async (ms) => {
          sleepCalls.push(ms);
        },
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([2000]);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('retries on 502, 503, and 504 with jittered backoff', async () => {
    const sleepCalls: number[] = [];
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('service unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('gateway timeout', { status: 504 }))
      .mockResolvedValueOnce(okJson({ ok: true }));

    const response = await requestWithPolicy(
      'https://example.com/resource',
      {},
      {
        fetchImpl: fetchImpl as typeof fetch,
        retries: 3,
        baseDelayMs: 100,
        random: () => 0.5,
        sleep: async (ms) => {
          sleepCalls.push(ms);
        },
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleepCalls).toEqual([225, 325, 525]);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it.each([401, 403])('fails fast on %i without retry', async (status) => {
    const sleepCalls: number[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('denied', {
        status,
      }),
    );

    await expect(
      requestWithPolicy(
        'https://example.com/resource',
        {},
        {
          fetchImpl: fetchImpl as typeof fetch,
          retries: 3,
          sleep: async (ms) => {
            sleepCalls.push(ms);
          },
        },
      ),
    ).rejects.toMatchObject({
      kind: 'auth',
      status,
    } satisfies Partial<RequestPolicyError>);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toEqual([]);
  });

  it('normalizes a pre-aborted external signal as cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();

    await expect(
      requestWithPolicy(
        'https://example.com/resource',
        { signal: controller.signal },
        {
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      kind: 'cancelled',
      message: 'Request was cancelled.',
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('normalizes an in-flight external abort as cancellation', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const fetchImpl = vi.fn((_input: FetchInput, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        }, { once: true });
      }));

    const promise = requestWithPolicy(
      'https://example.com/resource',
      { signal: controller.signal },
      {
        fetchImpl: fetchImpl as typeof fetch,
        retries: 0,
      },
    );
    const rejection = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(50);
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(rejection).resolves.toMatchObject({
      kind: 'cancelled',
      message: 'Request was cancelled.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('aborts during retry wait when the caller aborts', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('slow down', {
      status: 503,
      headers: {
        'retry-after': '10',
      },
    }));

    const promise = requestWithPolicy(
      'https://example.com/resource',
      { signal: controller.signal },
      {
        fetchImpl: fetchImpl as typeof fetch,
        retries: 2,
      },
    );
    const rejection = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.runAllTimersAsync();

    await expect(rejection).resolves.toMatchObject({
      kind: 'cancelled',
      message: 'Request was cancelled.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('times out during retry wait without starting another attempt', async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('slow down', {
      status: 503,
      headers: {
        'retry-after': '10',
      },
    }));

    const promise = requestWithPolicy(
      'https://example.com/resource',
      {},
      {
        fetchImpl: fetchImpl as typeof fetch,
        retries: 2,
        timeoutMs: 1000,
      },
    );
    const rejection = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.runAllTimersAsync();

    await expect(rejection).resolves.toMatchObject({
      kind: 'timeout',
      message: 'Request timed out after 1000ms.',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
