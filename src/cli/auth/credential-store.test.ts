import { afterEach, describe, expect, it, vi } from 'vitest';

describe('credential-store', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unmock('keytar');
  });

  it('does not require keytar at import time', async () => {
    vi.doMock('keytar', () => {
      throw new Error('libsecret-1.so.0: cannot open shared object file');
    });

    const module = await import('./credential-store.js');
    const store = module.createCredentialStore();

    await expect(store.getGithubToken()).rejects.toThrow(/Keychain storage is unavailable/i);
  });
});
