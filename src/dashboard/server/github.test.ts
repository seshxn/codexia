import { describe, expect, it } from 'vitest';
import { GitHubAnalyticsService } from './github.js';

const okJson = (body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });

describe('GitHubAnalyticsService', () => {
  it('paginates pull requests until no next page remains', async () => {
    const calls: string[] = [];
    const service = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);
        if (calls.length === 1) {
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

    const pulls = await service.getPullRequests('acme/api', 90);

    expect(pulls).toHaveLength(2);
    expect(calls).toHaveLength(6);
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
});
