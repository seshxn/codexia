import type { GitHubDeviceFlowClient, GitHubDeviceFlowResult } from './types.js';

type FetchLike = typeof fetch;

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval?: number;
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
}

const DEFAULT_SCOPE = 'repo read:org';

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export class GitHubDeviceFlow implements GitHubDeviceFlowClient {
  constructor(
    private readonly deps: {
      fetchImpl?: FetchLike;
      wait?: (ms: number) => Promise<void>;
    } = {},
  ) {}

  async authenticate(options: {
    clientId: string;
    scope?: string;
    logger?: (message?: unknown) => void;
  }): Promise<GitHubDeviceFlowResult> {
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const wait = this.deps.wait ?? sleep;
    const scope = options.scope ?? DEFAULT_SCOPE;

    const deviceResponse = await fetchImpl('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: options.clientId,
        scope,
      }),
    });

    if (!deviceResponse.ok) {
      throw new Error(`GitHub device flow failed to start (${deviceResponse.status}).`);
    }

    const device = await deviceResponse.json() as DeviceCodeResponse;
    options.logger?.(`Open ${device.verification_uri} and enter code ${device.user_code}.`);

    const deadline = Date.now() + device.expires_in * 1000;
    const interval = Math.max(1, device.interval ?? 5);

    while (Date.now() < deadline) {
      const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: options.clientId,
          device_code: device.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`GitHub device flow token exchange failed (${tokenResponse.status}).`);
      }

      const payload = await tokenResponse.json() as AccessTokenResponse;
      if (payload.access_token) {
        return {
          accessToken: payload.access_token,
          verificationUri: device.verification_uri,
          userCode: device.user_code,
        };
      }

      if (payload.error === 'authorization_pending') {
        await wait(interval * 1000);
        continue;
      }

      if (payload.error === 'slow_down') {
        await wait((interval + 5) * 1000);
        continue;
      }

      throw new Error(payload.error || 'GitHub device flow did not return an access token.');
    }

    throw new Error('GitHub device flow timed out.');
  }
}

export const createGitHubDeviceFlow = (): GitHubDeviceFlowClient => new GitHubDeviceFlow();
