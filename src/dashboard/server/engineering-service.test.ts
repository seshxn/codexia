import { describe, expect, it, vi } from 'vitest';
import { EngineeringIntelligenceService, type TeamConfig } from './engineering.js';

describe('EngineeringIntelligenceService request reuse', () => {
  it('reuses pull requests when building deployments for the same report', async () => {
    const getPullRequests = vi.fn(async () => [
      {
        id: 'pr-1',
        repo: 'acme/api',
        number: 1,
        title: 'PLAT-1 Ship feature',
        author: 'alice',
        createdAt: '2026-01-01T09:00:00Z',
        mergedAt: '2026-01-02T10:00:00Z',
        closedAt: '2026-01-02T10:00:00Z',
        firstCommitAt: '2026-01-01T08:00:00Z',
        firstReviewAt: '2026-01-01T12:00:00Z',
        issueKeys: ['PLAT-1'],
        state: 'merged' as const,
        baseBranch: 'main',
        headBranch: 'feature/plat-1',
        isDraft: false,
        mergedBy: 'lead',
        headSha: 'head-sha',
        mergeCommitSha: 'merge-sha',
        additions: 10,
        deletions: 2,
        changedFiles: 1,
        reviewCount: 1,
      },
    ]);
    const getDeployments = vi.fn(async () => [
      {
        id: 'dep-1',
        repo: 'acme/api',
        environment: 'production',
        status: 'success' as const,
        createdAt: '2026-01-02T12:00:00Z',
        updatedAt: '2026-01-02T12:10:00Z',
        sha: 'merge-sha',
        source: 'github_deployment' as const,
        confidence: 'high' as const,
        linkedPullRequestIds: [],
      },
    ]);

    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/codexia',
      github: {
        getConfig: () => ({ enabled: true, apiUrl: 'https://api.github.com', message: 'configured' }),
        getPullRequests,
        getDeployments,
      } as never,
      jira: {
        getConfig: () => ({ enabled: false, baseUrl: null, authMode: 'none' as const, message: 'disabled' }),
      } as never,
      teamConfigLoader: {
        load: async () => ({
          enabled: true,
          path: 'test',
          message: 'ok',
          teams: [{
            name: 'Platform',
            repos: ['acme/api'],
          } satisfies TeamConfig],
        }),
      } as never,
    });

    await service.getTeamReport('Platform', 30);

    expect(getPullRequests).toHaveBeenCalledTimes(1);
    expect(getDeployments).toHaveBeenCalledTimes(1);
  });
});
