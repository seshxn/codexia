import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubAnalyticsService } from './github.js';
import { EngineeringIntelligenceService, type TeamConfig } from './engineering.js';

describe('EngineeringIntelligenceService request reuse', () => {
  it('builds default GitHub and Jira services from injected config', async () => {
    const originalBearerToken = process.env.CODEXIA_JIRA_BEARER_TOKEN;
    process.env.CODEXIA_JIRA_BEARER_TOKEN = '';
    try {
      const service = new EngineeringIntelligenceService({
        repoRoot: '/tmp/codexia',
        githubConfig: {
          token: 'ghp_test',
          apiUrl: 'https://github.example.com',
          cacheTtlMs: 1000,
        },
        jiraConfig: {
          baseUrl: 'https://jira.example.com',
          email: 'user@example.com',
          apiToken: 'secret',
        },
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

      const config = await service.getConfig();

      expect(config.providers.github).toEqual({
        enabled: true,
        apiUrl: 'https://github.example.com',
        message: 'GitHub analytics is configured.',
      });
      expect(config.providers.jira).toEqual({
        enabled: true,
        baseUrl: 'https://jira.example.com',
        authMode: 'basic',
        message: 'Jira analytics is configured.',
      });
    } finally {
      if (originalBearerToken === undefined) {
        delete process.env.CODEXIA_JIRA_BEARER_TOKEN;
      } else {
        process.env.CODEXIA_JIRA_BEARER_TOKEN = originalBearerToken;
      }
    }
  });

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

describe('EngineeringIntelligenceService single-repo fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('loads pull requests once when building a team report', async () => {
    let pullRequestCalls = 0;
    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: {
        getConfig: github.getConfig,
        getPullRequests: async () => {
          pullRequestCalls += 1;
          return github.getPullRequests();
        },
        getDeployments: github.getDeployments,
      } as any,
      teamConfigLoader: emptyTeamConfigLoader as any,
      fallbackRepoSlug: 'acme/api',
    });

    await service.getTeamReport('my-service', 90);

    expect(pullRequestCalls).toBe(1);
  });

  it('reuses identical repo and lookback requests inside a team report path', async () => {
    const calls: string[] = [];
    const githubService = new GitHubAnalyticsService(
      {
        CODEXIA_GITHUB_TOKEN: 'ghp_test',
      } as NodeJS.ProcessEnv,
      async (input) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/pulls?state=open')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/pulls?state=closed')) {
          return new Response(JSON.stringify([
            {
              number: 1,
              state: 'closed',
              title: 'PLAT-100 Ship payments',
              user: { login: 'alice' },
              created_at: '2026-01-01T09:00:00Z',
              updated_at: '2026-01-02T10:00:00Z',
              merged_at: '2026-01-02T10:00:00Z',
              closed_at: '2026-01-02T10:00:00Z',
              draft: false,
              merged_by: { login: 'lead-one' },
              head: { ref: 'feature/plat-100', sha: 'sha-1' },
              base: { ref: 'main' },
            },
          ]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.endsWith('/pulls/1')) {
          return new Response(JSON.stringify({
            additions: 120,
            deletions: 30,
            changed_files: 7,
            merge_commit_sha: 'merge-sha-1',
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.endsWith('/pulls/1/reviews?per_page=100')) {
          return new Response(JSON.stringify([
            { submitted_at: '2026-01-01T14:00:00Z' },
          ]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/deployments?per_page=100')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    );

    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: githubService,
      teamConfigLoader: {
        load: async () => ({
          enabled: true,
          path: '/tmp/codexia.teams.yaml',
          message: 'Loaded 1 team mapping.',
          teams: [{ name: 'Platform', repos: ['acme/api', 'acme/api'] }],
        }),
      } as any,
    });

    const report = await service.getTeamReport('Platform', 90);

    expect(report.team.repos).toEqual(['acme/api']);
    expect(report.pullRequestFunnel.total).toBe(1);
    expect(calls.filter((url) => url.includes('/pulls?state=open'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/pulls?state=closed'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/deployments?per_page=100'))).toHaveLength(1);
  });

  it('keeps sparse-flow incidents and uses consistent deployment linkage', async () => {
    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: {
        getConfig: github.getConfig,
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
            mergeCommitSha: 'merge-sha-1',
          },
        ],
        getDeployments: async () => [
          {
            id: 'dep-7',
            repo: 'acme/api',
            environment: 'production',
            status: 'success' as const,
            createdAt: '2026-01-02T12:00:00Z',
            updatedAt: '2026-01-02T12:10:00Z',
            sha: 'merge-sha-1',
            source: 'github_deployment' as const,
            confidence: 'high' as const,
            linkedPullRequestIds: ['pr-1'],
          },
        ],
      } as any,
      jira: {
        getConfig: () => ({
          enabled: true,
          baseUrl: 'https://jira.example.com',
          authMode: 'basic' as const,
          message: 'Jira analytics is configured.',
        }),
        getFlowSnapshot: async () => ({
          workItems: [],
        }),
        getIncidentSnapshot: async () => ([
          {
            id: 'OPS-9',
            key: 'OPS-9',
            summary: 'Checkout outage',
            createdAt: '2026-01-02T14:00:00Z',
            resolvedAt: '2026-01-02T18:00:00Z',
            severity: 'high' as const,
            issueKeys: ['PLAT-100'],
            labels: ['sev1'],
            source: 'jira_incident' as const,
            confidence: 'high' as const,
          },
        ]),
      } as any,
      teamConfigLoader: {
        load: async () => ({
          enabled: true,
          path: '/tmp/codexia.teams.yaml',
          message: 'Loaded 1 team mapping.',
          teams: [{
            name: 'Platform',
            repos: ['acme/api'],
            jira: { projectKeys: ['PLAT'] },
            deployments: { environments: ['production'], branches: ['main'] },
            incidents: { projectKeys: ['OPS'], issueTypes: ['Incident'] },
          }],
        }),
      } as any,
    });

    const report = await service.getTeamReport('Platform', 90);

    expect(report.incidents.total).toBe(1);
    expect(report.recentIncidents).toHaveLength(1);
    expect(report.incidents.failedChanges).toBe(1);
    expect(report.deploymentTimeline[0].linkedIncidentCount).toBe(1);
    expect(report.linkageQuality.incidentDeploymentCoverage.value).toBe(100);
  });

  it('links GitHub deployments back to merged pull requests by sha for lead-time metrics', async () => {
    const service = new EngineeringIntelligenceService({
      repoRoot: '/tmp/my-service',
      github: {
        getConfig: github.getConfig,
        getPullRequests: async () => [
          {
            id: 'pr-1',
            repo: 'acme/api',
            number: 1,
            title: 'PLAT-100 Ship payments',
            author: 'alice',
            createdAt: '2026-01-01T08:00:00Z',
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
            mergeCommitSha: 'merge-sha-1',
          },
        ],
        getDeployments: async () => [
          {
            id: 'dep-1',
            repo: 'acme/api',
            environment: 'production',
            status: 'success' as const,
            createdAt: '2026-01-02T12:00:00Z',
            updatedAt: '2026-01-02T12:10:00Z',
            sha: 'merge-sha-1',
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
