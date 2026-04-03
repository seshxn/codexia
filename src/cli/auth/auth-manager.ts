import type {
  AuthActionOptions,
  AuthFieldStatus,
  AuthManagerOptions,
  AuthPrompts,
  AuthSource,
  AuthStatusReport,
  CredentialStore,
  GitHubDeviceFlowClient,
  GitHubResolvedCredentials,
  JiraResolvedCredentials,
} from './types.js';
import { createCredentialStore } from './credential-store.js';
import { createGitHubDeviceFlow } from './github-device-flow.js';
import { input as defaultInput } from '@inquirer/prompts';

const DEFAULT_GITHUB_CLIENT_ID_KEYS = [
  'CODEXIA_GITHUB_OAUTH_CLIENT_ID',
  'CODEXIA_GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_ID',
] as const;

const GITHUB_PAT_SETTINGS_URL = 'https://github.com/settings/tokens';

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const createFieldStatus = (
  value: string | null,
  source: AuthSource,
  options: { secret?: boolean } = {},
): AuthFieldStatus => ({
  source,
  isSet: value !== null,
  display: value === null ? 'missing' : options.secret ? 'set' : value,
});

const guidanceError = (message: string): Error => new Error(message);

export class AuthManager {
  private readonly env: NodeJS.ProcessEnv;
  private readonly credentialStore: CredentialStore;
  private readonly prompts: AuthPrompts;
  private readonly githubDeviceFlow: GitHubDeviceFlowClient;
  private readonly logger: (message?: unknown) => void;

  constructor(options: AuthManagerOptions = {}) {
    this.env = options.env ?? process.env;
    this.credentialStore = options.credentialStore ?? createCredentialStore();
    this.prompts = {
      input: options.prompts?.input ?? defaultInput,
    };
    this.githubDeviceFlow = options.githubDeviceFlow ?? createGitHubDeviceFlow();
    this.logger = options.logger ?? console.log;
  }

  async resolveGitHubCredentials(): Promise<GitHubResolvedCredentials> {
    const envToken = trimOrNull(this.env.CODEXIA_GITHUB_TOKEN);
    if (envToken) {
      return { token: envToken, source: 'env' };
    }

    try {
      const storedToken = await this.credentialStore.getGithubToken();
      if (storedToken) {
        return { token: storedToken, source: 'keychain' };
      }
    } catch (error) {
      throw this.toKeychainError('GitHub', error);
    }

    return { token: null, source: 'missing' };
  }

  async resolveJiraCredentials(): Promise<JiraResolvedCredentials> {
    const envBaseUrl = trimOrNull(this.env.CODEXIA_JIRA_BASE_URL);
    const envEmail = trimOrNull(this.env.CODEXIA_JIRA_EMAIL);
    const envApiToken = trimOrNull(this.env.CODEXIA_JIRA_API_TOKEN);
    const envBearerToken = trimOrNull(this.env.CODEXIA_JIRA_BEARER_TOKEN);

    if (envBaseUrl && envBearerToken) {
      return {
        baseUrl: envBaseUrl,
        email: envEmail,
        apiToken: envApiToken,
        bearerToken: envBearerToken,
        mode: 'bearer',
        source: 'env',
      };
    }

    if (envBaseUrl && envEmail && envApiToken) {
      return {
        baseUrl: envBaseUrl,
        email: envEmail,
        apiToken: envApiToken,
        bearerToken: envBearerToken,
        mode: 'basic',
        source: 'env',
      };
    }

    try {
      const stored = await this.credentialStore.getJiraCredentials();
      const baseUrl = envBaseUrl ?? trimOrNull(stored.baseUrl);
      const email = envEmail ?? trimOrNull(stored.email);
      const apiToken = envApiToken ?? trimOrNull(stored.apiToken);
      const bearerToken = envBearerToken;
      const mode = bearerToken && baseUrl
        ? 'bearer'
        : baseUrl && email && apiToken
          ? 'basic'
          : 'missing';

      return {
        baseUrl,
        email,
        apiToken,
        bearerToken,
        mode,
        source: this.getJiraSource(envBaseUrl, stored.baseUrl, envEmail, stored.email, envApiToken, stored.apiToken, envBearerToken),
      };
    } catch (error) {
      throw this.toKeychainError('Jira', error);
    }
  }

  async getStatus(): Promise<AuthStatusReport> {
    const github = await this.resolveGitHubCredentials();
    const jira = await this.resolveJiraCredentials();
    const envClientId = this.resolveGitHubClientId();

    return {
      github: {
        token: createFieldStatus(github.token, github.source, { secret: true }),
        clientId: createFieldStatus(envClientId.value, envClientId.source),
      },
      jira: {
        baseUrl: createFieldStatus(jira.baseUrl, this.resolveJiraFieldSource('CODEXIA_JIRA_BASE_URL', jira.baseUrl)),
        email: createFieldStatus(jira.email, this.resolveJiraFieldSource('CODEXIA_JIRA_EMAIL', jira.email)),
        apiToken: createFieldStatus(jira.apiToken, this.resolveJiraFieldSource('CODEXIA_JIRA_API_TOKEN', jira.apiToken), { secret: true }),
        bearerToken: createFieldStatus(jira.bearerToken, this.resolveJiraFieldSource('CODEXIA_JIRA_BEARER_TOKEN', jira.bearerToken), { secret: true }),
        mode: jira.mode,
      },
    };
  }

  async authenticateGitHub(options: AuthActionOptions = {}): Promise<{ token: string; source: Exclude<AuthSource, 'missing'> }> {
    const resolved = await this.resolveGitHubCredentials();
    if (resolved.token) {
      return { token: resolved.token, source: resolved.source as Exclude<AuthSource, 'missing'> };
    }

    if (options.interactive === false) {
      throw guidanceError(
        'GitHub credentials are missing. Set CODEXIA_GITHUB_TOKEN or run `codexia auth github`.',
      );
    }

    const clientId = this.resolveGitHubClientId().value;
    if (clientId) {
      try {
        const deviceResult = await this.githubDeviceFlow.authenticate({
          clientId,
          scope: 'repo read:org',
          logger: this.logger,
        });
        await this.credentialStore.setGithubToken(deviceResult.accessToken);
        return { token: deviceResult.accessToken, source: 'device-flow' };
      } catch (error) {
        this.logger(`GitHub device flow failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.logger(`Create a GitHub personal access token at ${GITHUB_PAT_SETTINGS_URL}.`);
    const token = trimOrNull(await this.prompts.input({
      message: 'GitHub personal access token:',
    }));

    if (!token) {
      throw guidanceError(
        'GitHub credentials are missing. Set CODEXIA_GITHUB_TOKEN or run `codexia auth github`.',
      );
    }

    await this.credentialStore.setGithubToken(token);
    return { token, source: 'prompt' };
  }

  async authenticateJira(options: AuthActionOptions = {}): Promise<{
    baseUrl: string;
    email: string;
    apiToken: string;
    bearerToken: string | null;
    mode: 'basic' | 'bearer' | 'missing';
    source: Exclude<AuthSource, 'missing'>;
  }> {
    const resolved = await this.resolveJiraCredentials();

    if (resolved.mode !== 'missing' && resolved.baseUrl && (resolved.mode === 'bearer' || (resolved.email && resolved.apiToken))) {
      return {
        baseUrl: resolved.baseUrl,
        email: resolved.email ?? '',
        apiToken: resolved.apiToken ?? '',
        bearerToken: resolved.bearerToken,
        mode: resolved.mode,
        source: (resolved.source === 'missing' ? 'keychain' : resolved.source) as Exclude<AuthSource, 'missing'>,
      };
    }

    if (options.interactive === false) {
      throw guidanceError(
        'Jira credentials are missing. Set CODEXIA_JIRA_BASE_URL and CODEXIA_JIRA_EMAIL + CODEXIA_JIRA_API_TOKEN, or run `codexia auth jira`.',
      );
    }

    const baseUrl = trimOrNull(await this.prompts.input({
      message: 'Jira base URL:',
      default: resolved.baseUrl ?? undefined,
    }));
    const email = trimOrNull(await this.prompts.input({
      message: 'Jira email:',
      default: resolved.email ?? undefined,
    }));
    const apiToken = trimOrNull(await this.prompts.input({
      message: 'Jira API token:',
      default: resolved.apiToken ?? undefined,
    }));

    if (!baseUrl || !email || !apiToken) {
      throw guidanceError(
        'Jira credentials are missing. Set CODEXIA_JIRA_BASE_URL and CODEXIA_JIRA_EMAIL + CODEXIA_JIRA_API_TOKEN, or run `codexia auth jira`.',
      );
    }

    await this.credentialStore.setJiraCredentials({ baseUrl, email, apiToken });
    return {
      baseUrl,
      email,
      apiToken,
      bearerToken: null,
      mode: 'basic',
      source: 'prompt',
    };
  }

  async logout(provider?: 'github' | 'jira' | 'all'): Promise<{ github: boolean; jira: boolean }> {
    const target = provider ?? 'all';
    const result = { github: false, jira: false };

    if (target === 'github' || target === 'all') {
      await this.credentialStore.deleteGithubToken();
      result.github = true;
    }

    if (target === 'jira' || target === 'all') {
      await this.credentialStore.deleteJiraCredentials();
      result.jira = true;
    }

    return result;
  }

  private resolveGitHubClientId(): { value: string | null; source: AuthSource } {
    for (const key of DEFAULT_GITHUB_CLIENT_ID_KEYS) {
      const value = trimOrNull(this.env[key]);
      if (value) {
        return { value, source: 'env' };
      }
    }

    return { value: null, source: 'missing' };
  }

  private resolveJiraFieldSource(envKey: keyof NodeJS.ProcessEnv, value: string | null): AuthSource {
    if (trimOrNull(this.env[envKey]) && value) {
      return 'env';
    }

    return value ? 'keychain' : 'missing';
  }

  private getJiraSource(
    envBaseUrl: string | null,
    storedBaseUrl: string | null,
    envEmail: string | null,
    storedEmail: string | null,
    envApiToken: string | null,
    storedApiToken: string | null,
    envBearerToken: string | null,
  ): AuthSource {
    if (envBaseUrl || envEmail || envApiToken || envBearerToken) {
      return 'env';
    }

    if (storedBaseUrl || storedEmail || storedApiToken) {
      return 'keychain';
    }

    return 'missing';
  }

  private toKeychainError(provider: 'GitHub' | 'Jira', error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    const guidance = provider === 'GitHub'
      ? 'Set CODEXIA_GITHUB_TOKEN or run `codexia auth github`.'
      : 'Set CODEXIA_JIRA_BASE_URL and CODEXIA_JIRA_EMAIL + CODEXIA_JIRA_API_TOKEN, or run `codexia auth jira`.';
    return new Error(
      `${provider} keychain storage is unavailable. ${message} ${guidance} Fix the local keychain backend to keep using stored credentials.`,
    );
  }
}
