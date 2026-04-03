type FetchLike = typeof fetch;
type FetchInput = Parameters<FetchLike>[0];

export type RequestPolicyErrorKind = 'timeout' | 'cancelled' | 'rate-limit' | 'auth' | 'http';

export interface RequestPolicyOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

export class RequestPolicyError extends Error {
  readonly kind: RequestPolicyErrorKind;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: { kind: RequestPolicyErrorKind; status?: number; retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'RequestPolicyError';
    this.kind = options.kind;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 5_000;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const AUTH_STATUSES = new Set([401, 403]);

export async function requestWithPolicy(
  input: FetchInput,
  init: RequestInit = {},
  options: RequestPolicyOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  const controller = new AbortController();
  let abortKind: 'timeout' | 'cancelled' | undefined;
  const timeout = setTimeout(() => {
    abortKind = 'timeout';
    controller.abort();
  }, timeoutMs);

  const externalSignal = init.signal;
  const onExternalAbort = () => {
    if (!controller.signal.aborted) {
      abortKind = 'cancelled';
      controller.abort();
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeout);
      throw createCancelledError();
    }

    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (controller.signal.aborted) {
        throw createAbortError(abortKind, timeoutMs);
      }

      const response = await fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      if (AUTH_STATUSES.has(response.status)) {
        throw createAuthError(response);
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
        const delayMs = getRetryDelayMs(response, attempt, {
          baseDelayMs,
          maxDelayMs,
          random,
          now,
        });
        await sleep(delayMs, controller.signal);
        continue;
      }

      throw createFailureError(response, {
        retryAfterMs: getRetryAfterMs(response, now),
      });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw createAbortError(abortKind, timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  throw new RequestPolicyError('Request failed after retry attempts were exhausted.', {
    kind: 'http',
  });
}

function createCancelledError(): RequestPolicyError {
  return new RequestPolicyError('Request was cancelled.', {
    kind: 'cancelled',
  });
}

function createTimeoutError(timeoutMs: number): RequestPolicyError {
  return new RequestPolicyError(`Request timed out after ${timeoutMs}ms.`, {
    kind: 'timeout',
  });
}

function createAbortError(
  abortKind: 'timeout' | 'cancelled' | undefined,
  timeoutMs: number,
): RequestPolicyError {
  if (abortKind === 'timeout') {
    return createTimeoutError(timeoutMs);
  }

  return createCancelledError();
}

function createAuthError(response: Response): RequestPolicyError {
  const label = response.status === 401 ? 'Unauthorized' : 'Forbidden';
  return new RequestPolicyError(`Remote request failed with ${response.status} ${label}.`, {
    kind: 'auth',
    status: response.status,
  });
}

function createFailureError(
  response: Response,
  options: { retryAfterMs?: number },
): RequestPolicyError {
  if (response.status === 429) {
    const suffix = options.retryAfterMs ? ` Retry after ${options.retryAfterMs}ms.` : '';
    return new RequestPolicyError(`Remote request rate limited (${response.status}).${suffix}`, {
      kind: 'rate-limit',
      status: response.status,
      retryAfterMs: options.retryAfterMs,
    });
  }

  return new RequestPolicyError(`Remote request failed with ${response.status}.`, {
    kind: 'http',
    status: response.status,
  });
}

function getRetryDelayMs(
  response: Response,
  attempt: number,
  options: {
    baseDelayMs: number;
    maxDelayMs: number;
    random: () => number;
    now: () => number;
  },
): number {
  const retryAfterMs = getRetryAfterMs(response, options.now);
  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  const exponential = options.baseDelayMs * (2 ** attempt);
  const jitter = Math.floor(options.random() * 250);
  return Math.min(options.maxDelayMs, exponential + jitter);
}

function getRetryAfterMs(response: Response, now: () => number): number | undefined {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) {
    return undefined;
  }

  const asNumber = Number.parseInt(retryAfter, 10);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber * 1000;
  }

  const asDate = Date.parse(retryAfter);
  if (!Number.isNaN(asDate)) {
    const delay = asDate - now();
    if (delay > 0) {
      return delay;
    }
  }

  return undefined;
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error('AbortError'));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return sleepWithAbort(ms, signal);
}
