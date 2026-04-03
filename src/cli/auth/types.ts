export type AuthSource = 'env' | 'keychain' | 'prompt' | 'device-flow' | 'missing';

export interface AuthFieldStatus {
  source: AuthSource;
  isSet: boolean;
  display: string;
}

export interface GitHubAuthStatus {
  token: AuthFieldStatus;
  clientId: AuthFieldStatus;
}

export interface JiraAuthStatus {
  baseUrl: AuthFieldStatus;
  email: AuthFieldStatus;
  apiToken: AuthFieldStatus;
  bearerToken: AuthFieldStatus;
  mode: 'basic' | 'bearer' | 'missing';
}

export interface AuthStatusReport {
  github: GitHubAuthStatus;
  jira: JiraAuthStatus;
}

export interface GitHubResolvedCredentials {
  token: string | null;
  source: AuthSource;
}

export interface JiraResolvedCredentials {
  baseUrl: string | null;
  email: string | null;
  apiToken: string | null;
  bearerToken: string | null;
  mode: 'basic' | 'bearer' | 'missing';
  source: AuthSource;
}

export interface CredentialStore {
  getGithubToken(): Promise<string | null>;
  setGithubToken(token: string): Promise<void>;
  deleteGithubToken(): Promise<void>;
  getJiraCredentials(): Promise<{
    baseUrl: string | null;
    email: string | null;
    apiToken: string | null;
  }>;
  setJiraCredentials(credentials: {
    baseUrl: string;
    email: string;
    apiToken: string;
  }): Promise<void>;
  deleteJiraCredentials(): Promise<void>;
}

export interface AuthPrompts {
  input(options: {
    message: string;
    default?: string;
  }): Promise<string>;
}

export interface GitHubDeviceFlowResult {
  accessToken: string;
  verificationUri: string;
  userCode: string;
}

export interface GitHubDeviceFlowClient {
  authenticate(options: {
    clientId: string;
    scope?: string;
    logger?: (message?: unknown) => void;
  }): Promise<GitHubDeviceFlowResult>;
}

export interface AuthManagerOptions {
  env?: NodeJS.ProcessEnv;
  credentialStore?: CredentialStore;
  prompts?: Partial<AuthPrompts>;
  githubDeviceFlow?: GitHubDeviceFlowClient;
  logger?: (message?: unknown) => void;
}

export interface AuthActionOptions {
  interactive?: boolean;
}
