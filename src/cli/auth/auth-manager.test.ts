import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from './auth-manager.js';

vi.mock('keytar', () => {
  const mock = {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  };

  return {
    default: mock,
  };
});

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));

type MemoryState = {
  githubToken?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
};

const createMemoryStore = (initial: MemoryState = {}) => {
  const state = new Map<string, string>();

  if (initial.githubToken) state.set('githubToken', initial.githubToken);
  if (initial.jiraBaseUrl) state.set('jiraBaseUrl', initial.jiraBaseUrl);
  if (initial.jiraEmail) state.set('jiraEmail', initial.jiraEmail);
  if (initial.jiraApiToken) state.set('jiraApiToken', initial.jiraApiToken);

  return {
    getGithubToken: vi.fn(async () => state.get('githubToken') ?? null),
    setGithubToken: vi.fn(async (value: string) => {
      state.set('githubToken', value);
    }),
    deleteGithubToken: vi.fn(async () => {
      state.delete('githubToken');
    }),
    getJiraCredentials: vi.fn(async () => ({
      baseUrl: state.get('jiraBaseUrl') ?? null,
      email: state.get('jiraEmail') ?? null,
      apiToken: state.get('jiraApiToken') ?? null,
    })),
    setJiraCredentials: vi.fn(async (value: { baseUrl: string; email: string; apiToken: string }) => {
      state.set('jiraBaseUrl', value.baseUrl);
      state.set('jiraEmail', value.email);
      state.set('jiraApiToken', value.apiToken);
    }),
    deleteJiraCredentials: vi.fn(async () => {
      state.delete('jiraBaseUrl');
      state.delete('jiraEmail');
      state.delete('jiraApiToken');
    }),
  };
};

const createEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...overrides,
} as NodeJS.ProcessEnv);

describe('AuthManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers environment variables over stored credentials and redacts secrets in status', async () => {
    const store = createMemoryStore({
      githubToken: 'stored-github-token',
      jiraBaseUrl: 'https://stored.atlassian.net',
      jiraEmail: 'stored@example.com',
      jiraApiToken: 'stored-jira-token',
    });

    const manager = new AuthManager({
      env: createEnv({
        CODEXIA_GITHUB_TOKEN: 'env-github-token',
        CODEXIA_JIRA_BASE_URL: 'https://env.atlassian.net',
        CODEXIA_JIRA_EMAIL: 'env@example.com',
        CODEXIA_JIRA_API_TOKEN: 'env-jira-token',
      }),
      credentialStore: store,
    });

    const status = await manager.getStatus();

    expect(status.github.token).toEqual({
      source: 'env',
      isSet: true,
      display: 'set',
    });
    expect(status.jira.baseUrl).toEqual({
      source: 'env',
      isSet: true,
      display: 'https://env.atlassian.net',
    });
    expect(status.jira.email).toEqual({
      source: 'env',
      isSet: true,
      display: 'env@example.com',
    });
    expect(status.jira.apiToken).toEqual({
      source: 'env',
      isSet: true,
      display: 'set',
    });
    expect(status.jira.mode).toBe('basic');
  });

  it('falls back to stored credentials when environment variables are absent', async () => {
    const store = createMemoryStore({
      githubToken: 'stored-github-token',
      jiraBaseUrl: 'https://stored.atlassian.net',
      jiraEmail: 'stored@example.com',
      jiraApiToken: 'stored-jira-token',
    });

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
    });

    await expect(manager.resolveGitHubCredentials()).resolves.toEqual({
      token: 'stored-github-token',
      source: 'keychain',
    });

    await expect(manager.resolveJiraCredentials()).resolves.toMatchObject({
      baseUrl: 'https://stored.atlassian.net',
      email: 'stored@example.com',
      apiToken: 'stored-jira-token',
      bearerToken: null,
      mode: 'basic',
    });
  });

  it('marks incomplete stored Jira config as missing', async () => {
    const store = createMemoryStore({
      jiraBaseUrl: 'https://stored.atlassian.net',
      jiraEmail: 'stored@example.com',
    });

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
    });

    const status = await manager.getStatus();

    expect(status.jira.mode).toBe('missing');
    expect(status.jira.baseUrl).toEqual({
      source: 'keychain',
      isSet: true,
      display: 'https://stored.atlassian.net',
    });
    expect(status.jira.email).toEqual({
      source: 'keychain',
      isSet: true,
      display: 'stored@example.com',
    });
    expect(status.jira.apiToken).toEqual({
      source: 'missing',
      isSet: false,
      display: 'missing',
    });
  });

  it('uses GitHub device flow when an OAuth client id is configured', async () => {
    const store = createMemoryStore();
    const deviceFlow = {
      authenticate: vi.fn(async () => ({
        accessToken: 'ghp_device_token',
        verificationUri: 'https://github.com/login/device',
        userCode: 'ABCD-EFGH',
      })),
    };

    const manager = new AuthManager({
      env: createEnv({
        CODEXIA_GITHUB_OAUTH_CLIENT_ID: 'client-123',
      }),
      credentialStore: store,
      githubDeviceFlow: deviceFlow,
      logger: vi.fn(),
    });

    await expect(manager.authenticateGitHub()).resolves.toEqual({
      token: 'ghp_device_token',
      source: 'device-flow',
    });

    expect(deviceFlow.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-123',
      }),
    );
    expect(store.setGithubToken).toHaveBeenCalledWith('ghp_device_token');
  });

  it('falls back to PAT guidance when GitHub device flow fails', async () => {
    const store = createMemoryStore();
    const input = vi.fn(async () => 'ghp_pat_token');
    const deviceFlow = {
      authenticate: vi.fn(async () => {
        throw new Error('device flow unavailable');
      }),
    };
    const logger = vi.fn();

    const manager = new AuthManager({
      env: createEnv({
        CODEXIA_GITHUB_OAUTH_CLIENT_ID: 'client-123',
      }),
      credentialStore: store,
      githubDeviceFlow: deviceFlow,
      prompts: { input },
      logger,
    });

    await expect(manager.authenticateGitHub()).resolves.toEqual({
      token: 'ghp_pat_token',
      source: 'prompt',
    });

    expect(deviceFlow.authenticate).toHaveBeenCalledTimes(1);
    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/personal access token/i),
      }),
    );
    expect(logger.mock.calls.flat().join('\n')).toContain('https://github.com/settings/tokens');
  });

  it('prompts for a GitHub personal access token when no OAuth client id is configured', async () => {
    const store = createMemoryStore();
    const input = vi.fn(async () => 'ghp_pat_token');
    const logger = vi.fn();

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
      prompts: { input },
      logger,
    });

    await expect(manager.authenticateGitHub()).resolves.toEqual({
      token: 'ghp_pat_token',
      source: 'prompt',
    });

    expect(input).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/personal access token/i),
      }),
    );
    expect(logger.mock.calls.flat().join('\n')).toContain('https://github.com/settings/tokens');
    expect(store.setGithubToken).toHaveBeenCalledWith('ghp_pat_token');
  });

  it('fails fast in non-interactive mode when GitHub credentials are missing', async () => {
    const store = createMemoryStore();
    const input = vi.fn();

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
      prompts: { input },
    });

    await expect(manager.authenticateGitHub({ interactive: false })).rejects.toThrow(/CODEXIA_GITHUB_TOKEN/i);
    await expect(manager.authenticateGitHub({ interactive: false })).rejects.toThrow(/codexia auth github/i);
    expect(input).not.toHaveBeenCalled();
  });

  it('prompts for Jira base URL, email, and API token only', async () => {
    const store = createMemoryStore();
    const input = vi
      .fn()
      .mockResolvedValueOnce('https://example.atlassian.net')
      .mockResolvedValueOnce('jira@example.com')
      .mockResolvedValueOnce('jira-token');

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
      prompts: { input },
    });

    await expect(manager.authenticateJira()).resolves.toEqual({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
      bearerToken: null,
      mode: 'basic',
      source: 'prompt',
    });

    expect(input).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: expect.stringMatching(/base url/i),
      }),
    );
    expect(input).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: expect.stringMatching(/email/i),
      }),
    );
    expect(input).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        message: expect.stringMatching(/api token/i),
      }),
    );
    expect(store.setJiraCredentials).toHaveBeenCalledWith({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
    });
  });

  it('fails fast in non-interactive mode when Jira credentials are missing', async () => {
    const store = createMemoryStore();
    const input = vi.fn();

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
      prompts: { input },
    });

    await expect(manager.authenticateJira({ interactive: false })).rejects.toThrow(/CODEXIA_JIRA_BASE_URL/i);
    await expect(manager.authenticateJira({ interactive: false })).rejects.toThrow(/codexia auth jira/i);
    expect(input).not.toHaveBeenCalled();
  });

  it('surfaces a helpful error when keychain access is unavailable', async () => {
    const store = {
      getGithubToken: vi.fn(async () => {
        throw new Error('Secret Service is unavailable');
      }),
      setGithubToken: vi.fn(),
      deleteGithubToken: vi.fn(),
      getJiraCredentials: vi.fn(),
      setJiraCredentials: vi.fn(),
      deleteJiraCredentials: vi.fn(),
    };

    const manager = new AuthManager({
      env: createEnv(),
      credentialStore: store,
    });

    await expect(manager.resolveGitHubCredentials()).rejects.toThrow(/keychain/i);
    await expect(manager.resolveGitHubCredentials()).rejects.toThrow(/CODEXIA_GITHUB_TOKEN/i);
  });

  it('removes stored credentials without altering environment-backed status', async () => {
    const store = createMemoryStore({
      githubToken: 'stored-github-token',
      jiraBaseUrl: 'https://stored.atlassian.net',
      jiraEmail: 'stored@example.com',
      jiraApiToken: 'stored-jira-token',
    });

    const manager = new AuthManager({
      env: createEnv({
        CODEXIA_GITHUB_TOKEN: 'env-github-token',
        CODEXIA_JIRA_BASE_URL: 'https://env.atlassian.net',
        CODEXIA_JIRA_EMAIL: 'env@example.com',
        CODEXIA_JIRA_API_TOKEN: 'env-jira-token',
      }),
      credentialStore: store,
    });

    await manager.logout();

    expect(store.deleteGithubToken).toHaveBeenCalledTimes(1);
    expect(store.deleteJiraCredentials).toHaveBeenCalledTimes(1);

    const status = await manager.getStatus();
    expect(status.github.token).toEqual({
      source: 'env',
      isSet: true,
      display: 'set',
    });
    expect(status.jira.apiToken).toEqual({
      source: 'env',
      isSet: true,
      display: 'set',
    });
  });
});
