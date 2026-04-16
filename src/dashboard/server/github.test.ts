import { describe, expect, it, vi } from 'vitest';
import { GitHubAnalyticsService } from './github.js';

const okJson = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });

const daysAgo = (n: number): string => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe('GitHubAnalyticsService', () => {
  it('prefers injected GitHub config over env defaults', async () => {
    process.env.CODEXIA_GITHUB_TOKEN = 'env-token';
    process.env.CODEXIA_GITHUB_API_URL = 'https://env.github.local';

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const service = new GitHubAnalyticsService(
      {
        token: 'injected-token',
        apiUrl: 'https://github.local',
        cacheTtlMs: 1000,
      } as never,
      async (input, init) => {
        calls.push({ url: String(input), init });
        return okJson([]);
      },
    );

    await service.getDeployments('acme/api', 90);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://github.local/repos/acme/api/deployments?per_page=100');
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: 'Bearer injected-token',
    });
  });

  it('uses the current recommended GitHub REST headers', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input, init) => {
        calls.push({ url: String(input), init });
        return okJson([]);
      },
    );

    await service.getDeployments('acme/api', 90);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.github.com/repos/acme/api/deployments?per_page=100');
    expect(calls[0].init?.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ghp_test',
      'X-GitHub-Api-Version': '2026-03-10',
    });
  });

  it('paginates pull requests until no next page remains', async () => {
    const calls: string[] = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('/pulls?state=open')) {
          return okJson([]);
        }

        if (url.includes('/pulls?state=closed')) {
          return okJson(
            [
              {
                number: 1,
                state: 'closed',
                title: 'PLAT-12 Add deployment history',
                user: { login: 'sesh' },
                created_at: '2026-01-01T09:00:00Z',
                updated_at: '2026-01-01T12:00:00Z',
                merged_at: '2026-01-01T12:00:00Z',
                closed_at: '2026-01-01T12:00:00Z',
                draft: false,
                merged_by: { login: 'maintainer' },
                head: { ref: 'feature/plat-12', sha: 'abc123' },
                base: { ref: 'main' },
              },
            ],
            {
              link: '<https://api.github.com/resource?page=2>; rel="next"',
            },
          );
        }

        if (url.endsWith('/pulls/1')) {
          return okJson({
            additions: 120,
            deletions: 25,
            changed_files: 6,
            merged_by: { login: 'lead-one' },
          });
        }

        if (url.endsWith('/pulls/1/reviews?per_page=100')) {
          return okJson([
            {
              submitted_at: '2026-01-01T10:30:00Z',
            },
            {
              submitted_at: '2026-01-01T11:30:00Z',
            },
          ]);
        }

        if (url.includes('/resource?page=2')) {
          return okJson([
            {
              number: 2,
              state: 'closed',
              title: 'PLAT-13 Tighten alerts',
              user: { login: 'sesh' },
              created_at: '2026-01-02T09:00:00Z',
              updated_at: '2026-01-02T13:00:00Z',
              merged_at: '2026-01-02T13:00:00Z',
              closed_at: '2026-01-02T13:00:00Z',
              draft: false,
              merged_by: { login: 'maintainer' },
              head: { ref: 'feature/plat-13', sha: 'def456' },
              base: { ref: 'main' },
            },
          ]);
        }

        if (url.endsWith('/pulls/2')) {
          return okJson({
            additions: 40,
            deletions: 10,
            changed_files: 3,
            merged_by: { login: 'lead-two' },
          });
        }

        if (url.endsWith('/pulls/2/reviews?per_page=100')) {
          return okJson([]);
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    );

    const pulls = await service.getPullRequests('acme/api', 120);

    expect(pulls).toHaveLength(2);
    expect(calls).toHaveLength(7);
    expect(pulls.map((pull) => pull.issueKeys)).toEqual([['PLAT-12'], ['PLAT-13']]);
    expect(pulls[0]).toMatchObject({
      firstReviewAt: '2026-01-01T10:30:00Z',
      mergedBy: 'lead-one',
      additions: 120,
      deletions: 25,
      changedFiles: 6,
      reviewCount: 2,
    });
    expect(pulls[1].reviewCount).toBe(0);
    expect(pulls[1].mergedBy).toBe('lead-two');
  });

  it('includes open pull requests alongside recently updated closed pull requests', async () => {
    const calls: string[] = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/pulls?state=open')) {
          return okJson([
            {
              number: 3,
              state: 'open',
              title: 'PLAT-14 Active work',
              user: { login: 'sesh' },
              created_at: daysAgo(10),
              updated_at: daysAgo(5),
              draft: false,
              head: { ref: 'feature/plat-14', sha: 'ghi789' },
              base: { ref: 'main' },
            },
          ]);
        }

        if (url.includes('/pulls?state=closed')) {
          return okJson([
            {
              number: 4,
              state: 'closed',
              title: 'PLAT-15 Completed work',
              user: { login: 'sesh' },
              created_at: daysAgo(8),
              updated_at: daysAgo(3),
              merged_at: daysAgo(3),
              closed_at: daysAgo(3),
              draft: false,
              merged_by: { login: 'maintainer' },
              head: { ref: 'feature/plat-15', sha: 'jkl012' },
              base: { ref: 'main' },
            },
          ]);
        }

        if (url.endsWith('/pulls/3')) {
          return okJson({ additions: 20, deletions: 5, changed_files: 2 });
        }

        if (url.endsWith('/pulls/4')) {
          return okJson({ additions: 40, deletions: 10, changed_files: 3, merged_by: { login: 'lead-two' } });
        }

        if (url.endsWith('/pulls/3/reviews?per_page=100')) {
          return okJson([]);
        }

        if (url.endsWith('/pulls/4/reviews?per_page=100')) {
          return okJson([]);
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    );

    const pulls = await service.getPullRequests('acme/api', 90);

    expect(calls.some((url) => url.includes('/pulls?state=open'))).toBe(true);
    expect(calls.some((url) => url.includes('/pulls?state=closed'))).toBe(true);
    expect(pulls.map((pull) => ({ number: pull.number, state: pull.state }))).toEqual([
      { number: 3, state: 'open' },
      { number: 4, state: 'merged' },
    ]);
  });

  it('reuses identical pull request snapshot requests within the cache window', async () => {
    const calls: string[] = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/pulls?state=open')) {
          return okJson([
            {
              number: 5,
              state: 'open',
              title: 'PLAT-16 Cached work',
              user: { login: 'sesh' },
              created_at: daysAgo(7),
              updated_at: daysAgo(2),
              draft: false,
              head: { ref: 'feature/plat-16', sha: 'mno345' },
              base: { ref: 'main' },
            },
          ]);
        }

        if (url.includes('/pulls?state=closed')) {
          return okJson([]);
        }

        if (url.endsWith('/pulls/5')) {
          return okJson({ additions: 10, deletions: 2, changed_files: 1 });
        }

        if (url.endsWith('/pulls/5/reviews?per_page=100')) {
          return okJson([]);
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    );

    await Promise.all([
      service.getPullRequests('acme/api', 90),
      service.getPullRequests('acme/api', 90),
    ]);
    await service.getPullRequests('acme/api', 90);

    expect(calls).toHaveLength(4);
  });

  it('reuses identical deployment snapshot requests within the cache window', async () => {
    const calls: string[] = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/deployments?per_page=100')) {
          return okJson([
            {
              id: 7,
              sha: 'sha-7',
              environment: 'production',
              created_at: '2026-01-05T12:00:00Z',
              updated_at: '2026-01-05T12:10:00Z',
            },
          ]);
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    );

    await Promise.all([
      service.getDeployments('acme/api', 90),
      service.getDeployments('acme/api', 90),
    ]);
    await service.getDeployments('acme/api', 90);

    expect(calls).toHaveLength(1);
  });

  it('keeps a slow in-flight pull request snapshot reusable after the ttl window advances', async () => {
    const calls: string[] = [];
    let resolveOpenRequest!: (response: Response) => void;
    const openRequest = new Promise<Response>((resolve) => {
      resolveOpenRequest = resolve;
    });
    let now = 0;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    try {
      const service = new GitHubAnalyticsService(
        {
          CODEXIA_GITHUB_TOKEN: 'ghp_test',
        } as NodeJS.ProcessEnv,
        async (input) => {
          const url = String(input);
          calls.push(url);

          if (url.includes('/pulls?state=open')) {
            return openRequest;
          }

          if (url.includes('/pulls?state=closed')) {
            return okJson([]);
          }

          if (url.endsWith('/pulls/6')) {
            return okJson({
              additions: 10,
              deletions: 2,
              changed_files: 1,
            });
          }

          if (url.endsWith('/pulls/6/reviews?per_page=100')) {
            return okJson([]);
          }

          throw new Error(`Unexpected URL ${url}`);
        },
      );

      const first = service.getPullRequests('acme/api', 90);
      await Promise.resolve();
      now = 20_000;
      const second = service.getPullRequests('acme/api', 90);

      resolveOpenRequest(okJson([
        {
          number: 6,
          state: 'open',
          title: 'PLAT-16 Slow cached work',
          user: { login: 'sesh' },
          created_at: '2026-01-05T09:00:00Z',
          updated_at: '2026-01-05T12:00:00Z',
          draft: false,
          head: { ref: 'feature/plat-16', sha: 'mno345' },
          base: { ref: 'main' },
        },
      ]));

      const [firstPulls, secondPulls] = await Promise.all([first, second]);

      expect(firstPulls).toHaveLength(1);
      expect(secondPulls).toHaveLength(1);
      expect(calls.filter((url) => url.includes('/pulls?state=open'))).toHaveLength(1);
      expect(calls.filter((url) => url.includes('/pulls?state=closed'))).toHaveLength(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('throws a rate-limit error when GitHub returns 429', async () => {
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async () =>
        new Response(JSON.stringify({ message: 'slow down' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(service.getPullRequests('acme/api', 90)).rejects.toThrow(/rate limit/i);
  });

  it('treats 403 permission failures as request errors, not rate limits', async () => {
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async () =>
        new Response(JSON.stringify({ message: 'Resource not accessible by integration' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await expect(service.getPullRequests('acme/api', 90)).rejects.toThrow(/403/);
    await expect(service.getPullRequests('acme/api', 90)).rejects.not.toThrow(/rate limit/i);
  });

  it('treats 403 secondary rate limits as rate-limit errors', async () => {
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async () =>
        new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), {
          status: 403,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-remaining': '0',
          },
        }),
    );

    await expect(service.getPullRequests('acme/api', 90)).rejects.toThrow(/rate limit/i);
  });

  it('reuses cached pull-request responses for identical requests', async () => {
    const calls: string[] = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/pulls?state=open')) {
          return okJson([]);
        }

        if (url.includes('/pulls?state=closed')) {
          return okJson([
            {
              number: 7,
              id: 7,
              state: 'closed',
              title: 'PLAT-77 Cached call',
              user: { login: 'sesh' },
              created_at: daysAgo(9),
              updated_at: daysAgo(4),
              merged_at: daysAgo(4),
              closed_at: daysAgo(4),
              draft: false,
              merged_by: { login: 'maintainer' },
              head: { ref: 'feature/plat-77', sha: 'cached-sha' },
              base: { ref: 'main' },
            },
          ]);
        }

        if (url.endsWith('/pulls/7')) {
          return okJson({
            additions: 12,
            deletions: 1,
            changed_files: 2,
            merged_by: { login: 'maintainer' },
          });
        }

        if (url.endsWith('/pulls/7/reviews?per_page=100')) {
          return okJson([]);
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    );

    const first = await service.getPullRequests('acme/api', 90);
    const second = await service.getPullRequests('acme/api', 90);

    expect(second).toEqual(first);
    expect(calls).toHaveLength(4);
  });
});
