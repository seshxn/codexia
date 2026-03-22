import { describe, expect, it } from 'vitest';
import { computeJiraFlowMetrics, type JiraFlowIssue } from './jira-flow.js';

describe('computeJiraFlowMetrics', () => {
  it('derives cycle time, throughput, blocked aging, reopen rate, and forecast reliability', () => {
    const issues: JiraFlowIssue[] = [
      {
        key: 'PLAT-1',
        projectKey: 'PLAT',
        issueType: 'Story',
        status: 'Done',
        createdAt: '2026-01-01T09:00:00Z',
        resolvedAt: '2026-01-05T09:00:00Z',
        labels: [],
        changelog: [
          { from: 'Backlog', to: 'Selected for Development', at: '2026-01-01T09:00:00Z' },
          { from: 'Selected for Development', to: 'In Progress', at: '2026-01-02T09:00:00Z' },
          { from: 'In Progress', to: 'Blocked', at: '2026-01-03T09:00:00Z' },
          { from: 'Blocked', to: 'In Progress', at: '2026-01-03T15:00:00Z' },
          { from: 'In Progress', to: 'Done', at: '2026-01-05T09:00:00Z' },
        ],
      },
      {
        key: 'PLAT-2',
        projectKey: 'PLAT',
        issueType: 'Bug',
        status: 'In Progress',
        createdAt: '2026-01-03T09:00:00Z',
        labels: ['unplanned'],
        changelog: [
          { from: 'Backlog', to: 'In Progress', at: '2026-01-03T10:00:00Z' },
          { from: 'In Progress', to: 'Done', at: '2026-01-04T10:00:00Z' },
          { from: 'Done', to: 'In Progress', at: '2026-01-04T12:00:00Z' },
        ],
      },
    ];

    const report = computeJiraFlowMetrics(issues, {
      lookbackDays: 30,
      now: '2026-01-05T12:00:00Z',
    });

    expect(report.summary.throughput).toBe(1);
    expect(report.summary.reopenRate).toBe(50);
    expect(report.summary.unplannedWorkRatio).toBe(50);
    expect(report.summary.blockedAgingHours).toBe(0);
    expect(report.issueTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ issueType: 'Story', throughput: 1 }),
        expect.objectContaining({ issueType: 'Bug', throughput: 0 }),
      ]),
    );
    expect(report.trends.forecastReliability).toBeGreaterThan(0);
    expect(report.queueVsActive.activeHours).toBeGreaterThan(0);
    expect(report.queueVsActive.queueHours).toBeGreaterThan(0);
  });
});
