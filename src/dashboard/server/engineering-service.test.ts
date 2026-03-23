import { describe, expect, it } from 'vitest';
import { EngineeringIntelligenceService } from './engineering.js';

describe('EngineeringIntelligenceService single-repo fallback', () => {
  const github = {
    getConfig: () => ({
      enabled: true,
      apiUrl: 'https://api.github.com',
      message: 'GitHub analytics is configured.',
    }),
    getPullRequests: async () => [
      {
        id: 'pr-1',
        repo: 'acme/api',
        number: 1,
        title: 'PLAT-100 Ship payments',
        author: 'alice',
        createdAt: '2026-01-01T09:00:00Z',
        updatedAt: '2026-01-02T10:00:00Z',
        mergedAt: '2026-01-02T10:00:00Z',
        closedAt: '2026-01-02T10:00:00Z',
        firstCommitAt: '2026-01-01T08:00:00Z',
        firstReviewAt: '2026-01-01T14:00:00Z',
        issueKeys: ['PLAT-100'],
        state: 'merged' as const,
        baseBranch: 'main',
        headBranch: 'feature/plat-100',
        isDraft: false,
        mergedBy: 'lead-one',
        additions: 120,
        deletions: 30,
        changedFiles: 7,
        reviewCount: 2,
      },
    ],
    getDeployments: async () => [],
  };

  const emptyTeamConfigLoader = {
    load: async () => ({
      enabled: false,
      path: '/tmp/codexia.teams.yaml',
      message: 'Set CODEXIA_DASHBOARD_TEAMS_JSON or create codexia.teams.yaml to enable multi-team engineering intelligence.',
      teams: [],
    }),
  };

  it('enables engineering stats from the current repo when no team config exists', async () => {
    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: github as any,
      teamConfigLoader: emptyTeamConfigLoader as any,
      fallbackRepoSlug: 'acme/api',
    });

    const config = await service.getConfig();
    const teams = await service.getTeams();
    const overview = await service.getOverview(90);

    expect(config.enabled).toBe(true);
    expect(config.teamConfig.enabled).toBe(true);
    expect(config.teamConfig.teamsConfigured).toBe(1);
    expect(config.teamConfig.message).toContain('current repository');
    expect(teams).toEqual([{ name: 'my-service', repos: ['acme/api'] }]);
    expect(overview.teams).toHaveLength(1);
    expect(overview.teams[0].team).toEqual({ name: 'my-service', repos: ['acme/api'] });
    expect(overview.totalPullRequests).toBe(1);
  });

  it('returns reports for the synthetic single-repo team', async () => {
    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: github as any,
      teamConfigLoader: emptyTeamConfigLoader as any,
      fallbackRepoSlug: 'acme/api',
    });

    const teamReport = await service.getTeamReport('my-service', 90);
    const repoReport = await service.getRepoReport('acme/api', 90);

    expect(teamReport.team).toEqual({ name: 'my-service', repos: ['acme/api'] });
    expect(teamReport.pullRequestFunnel.total).toBe(1);
    expect(repoReport.team).toEqual({ name: 'my-service', repos: ['acme/api'] });
    expect(repoReport.dora.deploymentFrequency.value).toBe(1);
  });

  it('links GitHub deployments back to merged pull requests by sha for lead-time metrics', async () => {
    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: {
        getConfig: github.getConfig,
        getPullRequests: async () => [
          {
            id: 'pr-9',
            repo: 'acme/api',
            number: 9,
            title: 'PLAT-109 Ship checkout',
            author: 'alice',
            createdAt: '2026-01-01T09:00:00Z',
            updatedAt: '2026-01-02T10:00:00Z',
            mergedAt: '2026-01-02T10:00:00Z',
            closedAt: '2026-01-02T10:00:00Z',
            firstCommitAt: '2026-01-01T08:00:00Z',
            firstReviewAt: '2026-01-01T14:00:00Z',
            issueKeys: ['PLAT-109'],
            state: 'merged' as const,
            baseBranch: 'main',
            headBranch: 'feature/plat-109',
            isDraft: false,
            mergedBy: 'lead-one',
            additions: 120,
            deletions: 30,
            changedFiles: 7,
            reviewCount: 2,
            mergeCommitSha: 'merge-sha-9',
          },
        ],
        getDeployments: async () => [
          {
            id: 'dep-9',
            repo: 'acme/api',
            environment: 'production',
            status: 'success' as const,
            createdAt: '2026-01-02T12:00:00Z',
            updatedAt: '2026-01-02T12:10:00Z',
            sha: 'merge-sha-9',
            source: 'github_deployment' as const,
            confidence: 'high' as const,
            linkedPullRequestIds: [],
          },
        ],
      } as any,
      teamConfigLoader: {
        load: async () => ({
          enabled: true,
          path: '/tmp/codexia.teams.yaml',
          message: 'Loaded 1 team mapping.',
          teams: [{ name: 'Platform', repos: ['acme/api'] }],
        }),
      } as any,
    });

    const report = await service.getTeamReport('Platform', 90);

    expect(report.dora.leadTimeHours.value).toBe(28);
    expect(report.linkageQuality.deploymentTraceabilityCoverage.value).toBe(100);
  });
});
