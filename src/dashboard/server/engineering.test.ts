import { describe, expect, it } from 'vitest';
import {
  computeDoraMetrics,
  buildTeamReport,
  type EngineeringIncident,
  type EngineeringPullRequest,
  type EngineeringDeployment,
  type EngineeringWorkItem,
  type TeamConfig,
} from './engineering.js';

describe('engineering intelligence aggregation', () => {
  const pullRequests: EngineeringPullRequest[] = [
    {
      id: 'pr-1',
      repo: 'acme/api',
      number: 1,
      title: 'PLAT-100 Ship payments',
      author: 'alice',
      createdAt: '2026-01-01T09:00:00Z',
      mergedAt: '2026-01-02T10:00:00Z',
      closedAt: '2026-01-02T10:00:00Z',
      firstCommitAt: '2026-01-01T08:00:00Z',
      firstReviewAt: '2026-01-01T14:00:00Z',
      issueKeys: ['PLAT-100'],
      state: 'merged',
      baseBranch: 'main',
      headBranch: 'feature/plat-100',
      isDraft: false,
      mergedBy: 'lead-one',
      additions: 120,
      deletions: 30,
      changedFiles: 7,
      reviewCount: 2,
    },
    {
      id: 'pr-2',
      repo: 'acme/api',
      number: 2,
      title: 'PLAT-101 Ship alerts',
      author: 'bob',
      createdAt: '2026-01-03T09:00:00Z',
      mergedAt: '2026-01-04T10:00:00Z',
      closedAt: '2026-01-04T10:00:00Z',
      firstCommitAt: '2026-01-03T07:00:00Z',
      firstReviewAt: '2026-01-03T15:00:00Z',
      issueKeys: ['PLAT-101'],
      state: 'merged',
      baseBranch: 'main',
      headBranch: 'feature/plat-101',
      isDraft: false,
      mergedBy: 'lead-one',
      additions: 640,
      deletions: 90,
      changedFiles: 23,
      reviewCount: 3,
    },
    {
      id: 'pr-3',
      repo: 'acme/api',
      number: 3,
      title: 'HOTFIX-1 hotfix restore checkout',
      author: 'alice',
      createdAt: '2025-12-20T09:00:00Z',
      firstCommitAt: '2025-12-20T08:00:00Z',
      issueKeys: [],
      state: 'open',
      baseBranch: 'main',
      headBranch: 'hotfix/restore-checkout',
      isDraft: false,
      additions: 40,
      deletions: 5,
      changedFiles: 3,
      reviewCount: 0,
    },
  ];

  const deployments: EngineeringDeployment[] = [
    {
      id: 'dep-1',
      repo: 'acme/api',
      environment: 'production',
      status: 'success',
      createdAt: '2026-01-02T12:00:00Z',
      updatedAt: '2026-01-02T12:10:00Z',
      sha: 'sha-1',
      source: 'github_deployment',
      confidence: 'high',
      linkedPullRequestIds: ['pr-1'],
    },
    {
      id: 'dep-2',
      repo: 'acme/api',
      environment: 'production',
      status: 'success',
      createdAt: '2026-01-04T12:00:00Z',
      updatedAt: '2026-01-04T12:10:00Z',
      sha: 'sha-2',
      source: 'github_deployment',
      confidence: 'high',
      linkedPullRequestIds: ['pr-2'],
    },
    {
      id: 'dep-3',
      repo: 'acme/api',
      environment: 'production',
      status: 'success',
      createdAt: '2026-01-04T22:30:00Z',
      updatedAt: '2026-01-04T22:45:00Z',
      sha: 'sha-3',
      source: 'merge_heuristic',
      confidence: 'low',
      linkedPullRequestIds: [],
    },
  ];

  const incidents: EngineeringIncident[] = [
    {
      id: 'OPS-1',
      key: 'OPS-1',
      summary: 'Payments outage',
      createdAt: '2026-01-02T14:00:00Z',
      resolvedAt: '2026-01-02T18:00:00Z',
      severity: 'high',
      issueKeys: ['PLAT-100'],
      labels: ['sev1', 'production'],
      linkedDeploymentIds: ['dep-1'],
      source: 'jira_incident',
      confidence: 'high',
    },
  ];

  const workItems: EngineeringWorkItem[] = [
    {
      id: 'PLAT-100',
      key: 'PLAT-100',
      title: 'Ship payments',
      projectKey: 'PLAT',
      type: 'Story',
      status: 'Done',
      createdAt: '2025-12-29T10:00:00Z',
      startedAt: '2025-12-30T09:00:00Z',
      completedAt: '2026-01-02T10:00:00Z',
      cycleTimeHours: 73,
      leadTimeHours: 96,
      issueKeys: ['PLAT-100'],
      blockedHours: 4,
      reopened: false,
    },
    {
      id: 'PLAT-101',
      key: 'PLAT-101',
      title: 'Ship alerts',
      projectKey: 'PLAT',
      type: 'Story',
      status: 'Done',
      createdAt: '2026-01-01T10:00:00Z',
      startedAt: '2026-01-02T09:00:00Z',
      completedAt: '2026-01-04T10:00:00Z',
      cycleTimeHours: 49,
      leadTimeHours: 72,
      issueKeys: ['PLAT-101'],
      blockedHours: 0,
      reopened: false,
    },
  ];

  it('computes DORA metrics from pull requests, deployments, and incidents', () => {
    const dora = computeDoraMetrics({
      pullRequests,
      deployments,
      incidents,
      lookbackDays: 90,
      now: '2026-01-05T00:00:00Z',
    });

    expect(dora.deploymentFrequency.value).toBe(3);
    expect(dora.leadTimeHours.value).toBe(29);
    expect(dora.changeFailureRate.value).toBeCloseTo(33.3, 1);
    expect(dora.meanTimeToRestoreHours.value).toBe(4);
    expect(dora.deploymentFrequency.source).toBe('github_deployments');
    expect(dora.changeFailureRate.confidence).toBe('high');
  });

  it('builds a team report with flow coverage and PR funnel metrics', () => {
    const team: TeamConfig = {
      name: 'Platform',
      repos: ['acme/api'],
      jira: { projectKeys: ['PLAT'] },
      deployments: { environments: ['production'], branches: ['main'] },
      incidents: { projectKeys: ['OPS'], issueTypes: ['Incident'] },
    };

    const report = buildTeamReport({
      team,
      pullRequests,
      deployments,
      incidents,
      workItems,
      lookbackDays: 90,
      now: '2026-01-05T00:00:00Z',
    });

    expect(report.team.name).toBe('Platform');
    expect(report.pullRequestFunnel.merged).toBe(2);
    expect(report.pullRequestFunnel.reviewed).toBe(2);
    expect(report.githubLinkageCoverage.value).toBe(100);
    expect(report.incidents.active).toBe(0);
    expect(report.prHealth.staleOpen).toBe(1);
    expect(report.prHealth.hotfixRate).toBeCloseTo(33.3, 1);
    expect(report.prHealth.largePrRate).toBeCloseTo(33.3, 1);
    expect(report.prHealth.averagePickupTimeHours).toBe(5.5);
    expect(report.planning.flowEfficiencyPct).toBeGreaterThan(0);
    expect(report.planning.carryoverRate).toBe(0);
    expect(report.reliability.severityDistribution.high).toBe(1);
    expect(report.reliability.incidentLinkageCoverage.value).toBe(100);
    expect(report.linkageQuality.deploymentTraceabilityCoverage.value).toBeCloseTo(66.7, 1);
    expect(report.peopleRisk.topAuthorShare.value).toBeCloseTo(66.7, 1);
    expect(report.peopleRisk.afterHoursDeploymentRate.value).toBeCloseTo(66.7, 1);
    expect(report.flow.issueTypes[0]).toMatchObject({
      issueType: 'Story',
      throughput: 2,
    });
  });
});
