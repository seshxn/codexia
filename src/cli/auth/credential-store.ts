import keytar from 'keytar';
import type { CredentialStore } from './types.js';

const SERVICE_NAME = 'codexia';
const GITHUB_TOKEN_ACCOUNT = 'auth.github.token';
const JIRA_BASE_URL_ACCOUNT = 'auth.jira.base-url';
const JIRA_EMAIL_ACCOUNT = 'auth.jira.email';
const JIRA_API_TOKEN_ACCOUNT = 'auth.jira.api-token';

const wrapError = (action: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Keychain storage is unavailable while trying to ${action}. ${message}`);
};

const readPassword = async (account: string): Promise<string | null> => {
  try {
    return await keytar.getPassword(SERVICE_NAME, account);
  } catch (error) {
    throw wrapError(`read ${account}`, error);
  }
};

const writePassword = async (account: string, value: string): Promise<void> => {
  try {
    await keytar.setPassword(SERVICE_NAME, account, value);
  } catch (error) {
    throw wrapError(`write ${account}`, error);
  }
};

const deletePassword = async (account: string): Promise<void> => {
  try {
    await keytar.deletePassword(SERVICE_NAME, account);
  } catch (error) {
    throw wrapError(`delete ${account}`, error);
  }
};

export class KeytarCredentialStore implements CredentialStore {
  async getGithubToken(): Promise<string | null> {
    return readPassword(GITHUB_TOKEN_ACCOUNT);
  }

  async setGithubToken(token: string): Promise<void> {
    await writePassword(GITHUB_TOKEN_ACCOUNT, token);
  }

  async deleteGithubToken(): Promise<void> {
    await deletePassword(GITHUB_TOKEN_ACCOUNT);
  }

  async getJiraCredentials(): Promise<{
    baseUrl: string | null;
    email: string | null;
    apiToken: string | null;
  }> {
    const [baseUrl, email, apiToken] = await Promise.all([
      readPassword(JIRA_BASE_URL_ACCOUNT),
      readPassword(JIRA_EMAIL_ACCOUNT),
      readPassword(JIRA_API_TOKEN_ACCOUNT),
    ]);

    return {
      baseUrl,
      email,
      apiToken,
    };
  }

  async setJiraCredentials(credentials: {
    baseUrl: string;
    email: string;
    apiToken: string;
  }): Promise<void> {
    await Promise.all([
      writePassword(JIRA_BASE_URL_ACCOUNT, credentials.baseUrl),
      writePassword(JIRA_EMAIL_ACCOUNT, credentials.email),
      writePassword(JIRA_API_TOKEN_ACCOUNT, credentials.apiToken),
    ]);
  }

  async deleteJiraCredentials(): Promise<void> {
    await Promise.all([
      deletePassword(JIRA_BASE_URL_ACCOUNT),
      deletePassword(JIRA_EMAIL_ACCOUNT),
      deletePassword(JIRA_API_TOKEN_ACCOUNT),
    ]);
  }
}

export const createCredentialStore = (): CredentialStore => new KeytarCredentialStore();
