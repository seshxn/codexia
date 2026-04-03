import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createJiraCommand } from './jira.js';

const testState = vi.hoisted(() => {
  const service = {
    getConfig: vi.fn(),
    getBoards: vi.fn(),
    getSprints: vi.fn(),
    getSprintReport: vi.fn(),
    getBoardHistoryReport: vi.fn(),
    getFlowSnapshot: vi.fn(),
  };

  return {
    service,
    createService: vi.fn(() => service),
    createAuthManager: vi.fn(),
    authManager: {
      resolveJiraCredentials: vi.fn(),
      authenticateJira: vi.fn(),
    },
    log: vi.fn(),
    error: vi.fn(),
  };
});

vi.mock('chalk', () => {
  const passthrough = vi.fn((value: string) => value);
  passthrough.bold = passthrough;
  passthrough.cyan = passthrough;
  passthrough.green = passthrough;
  passthrough.yellow = passthrough;
  passthrough.red = passthrough;
  passthrough.gray = passthrough;
  passthrough.dim = passthrough;
  passthrough.white = passthrough;
  return {
    default: passthrough,
  };
});

describe('jira command', () => {
  const buildCommand = () =>
    createJiraCommand({
      createService: testState.createService,
      createAuthManager: testState.createAuthManager,
      isInteractive: () => true,
      log: testState.log,
      error: testState.error,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    testState.createAuthManager.mockReturnValue(testState.authManager);
    testState.authManager.resolveJiraCredentials.mockResolvedValue({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
      bearerToken: null,
      mode: 'basic',
      source: 'keychain',
    });
    testState.authManager.authenticateJira.mockResolvedValue({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
      bearerToken: null,
      mode: 'basic',
      source: 'prompt',
    });
  });

  it('registers the Jira analytics subcommands', () => {
    const command = buildCommand();

    expect(command.name()).toBe('jira');
    expect(command.commands.map((subcommand) => subcommand.name())).toEqual([
      'config',
      'boards',
      'sprints',
      'sprint-report',
      'board-history',
      'flow',
    ]);
  });

  it('prints Jira configuration details', async () => {
    testState.service.getConfig.mockReturnValue({
      enabled: true,
      baseUrl: 'https://example.atlassian.net',
      authMode: 'basic',
      message: 'Jira analytics is configured.',
    });

    await buildCommand().parseAsync(['node', 'codexia', 'config']);

    expect(testState.authManager.resolveJiraCredentials).toHaveBeenCalledTimes(1);
    expect(testState.service.getConfig).toHaveBeenCalledTimes(1);
    expect(testState.log).toHaveBeenCalledTimes(1);
    expect(testState.log.mock.calls[0][0]).toContain('Jira Configuration');
    expect(testState.log.mock.calls[0][0]).toContain('Enabled: yes');
    expect(testState.log.mock.calls[0][0]).toContain('Auth mode: basic');
  });

  it('requests boards with parsed options and prints JSON when requested', async () => {
    testState.service.getBoards.mockResolvedValue({
      boards: [
        {
          id: 42,
          name: 'Platform',
          type: 'scrum',
          projectKey: 'PLAT',
          projectName: 'Platform Team',
        },
      ],
      total: 1,
    });

    await buildCommand().parseAsync(['node', 'codexia', '--json', 'boards', 'PLAT', '--limit', '2']);

    expect(testState.authManager.resolveJiraCredentials).toHaveBeenCalledTimes(1);
    expect(testState.authManager.authenticateJira).not.toHaveBeenCalled();
    expect(testState.createService).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
    }));
    expect(testState.service.getBoards).toHaveBeenCalledWith('PLAT', 2);
    expect(JSON.parse(testState.log.mock.calls[0][0])).toEqual({
      boards: [
        {
          id: 42,
          name: 'Platform',
          type: 'scrum',
          projectKey: 'PLAT',
          projectName: 'Platform Team',
        },
      ],
      total: 1,
    });
  });

  it('requests sprints with state and limit options', async () => {
    testState.service.getSprints.mockResolvedValue({
      boardId: 123,
      sprints: [
        {
          id: 7,
          name: 'Sprint 7',
          state: 'active',
          goal: 'Ship the flow dashboard',
        },
      ],
      total: 1,
    });

    await buildCommand().parseAsync([
      'node',
      'codexia',
      '--json',
      'sprints',
      '123',
      '--state',
      'active,closed',
      '--limit',
      '5',
    ]);

    expect(testState.service.getSprints).toHaveBeenCalledWith(123, 'active,closed', 5);
    expect(JSON.parse(testState.log.mock.calls[0][0])).toEqual({
      boardId: 123,
      sprints: [
        {
          id: 7,
          name: 'Sprint 7',
          state: 'active',
          goal: 'Ship the flow dashboard',
        },
      ],
      total: 1,
    });
  });

  it('prints sprint report details for a specific sprint', async () => {
    testState.service.getSprintReport.mockResolvedValue({
      board: { id: 123, name: 'Platform' },
      sprint: { id: 7, name: 'Sprint 7', state: 'closed' },
      metrics: {
        issues: {
          total: 10,
          committed: 8,
          completedByEnd: 7,
          completionRate: 87.5,
          addedAfterStart: 1,
          removedDuringSprint: 0,
          carryover: 2,
        },
        points: {
          committed: 34,
          completedByEnd: 30,
          completionRate: 88.2,
          addedAfterStart: 5,
          removedDuringSprint: 0,
          absoluteChangeDuringSprint: 5,
          netChangeDuringSprint: 5,
          changedIssueCount: 2,
          changeEventCount: 3,
          currentScope: 39,
          remaining: 9,
        },
      },
      health: {
        status: 'on_track',
        score: 92,
        elapsedPct: 80,
        completionPct: 88,
        paceDelta: 8,
        remainingDays: 2,
        requiredPointsPerDay: 4.5,
        summary: 'Sprint is on track.',
      },
      integrity: {
        risk: 'low',
        score: 94,
        flags: [],
        indicators: {
          scopeCreepPct: 12,
          pointChurnPct: 15,
          carryoverPct: 5,
          removedPct: 0,
        },
      },
    });

    await buildCommand().parseAsync(['node', 'codexia', 'sprint-report', '123', '7']);

    expect(testState.service.getSprintReport).toHaveBeenCalledWith(123, 7);
    expect(testState.log.mock.calls[0][0]).toContain('Sprint Report');
    expect(testState.log.mock.calls[0][0]).toContain('Board: Platform (123)');
    expect(testState.log.mock.calls[0][0]).toContain('Sprint: Sprint 7 (7)');
    expect(testState.log.mock.calls[0][0]).toContain('Health: on_track');
  });

  it('requests board history with the configured sprint window', async () => {
    testState.service.getBoardHistoryReport.mockResolvedValue({
      board: { id: 123, name: 'Platform' },
      summary: {
        sprintsAnalyzed: 2,
        averageCompletionRate: 82.5,
        averageScopeCreepPct: 10.1,
        averagePointChurnPct: 7.4,
        averageIntegrityScore: 89.2,
        onTrackLikeSprints: 1,
        riskDistribution: { low: 2, medium: 0, high: 0 },
      },
      sprints: [
        {
          id: 7,
          name: 'Sprint 7',
          state: 'closed',
          completionRate: 80,
          committedPoints: 30,
          completedPoints: 24,
          scopeCreepPct: 8,
          pointChurnPct: 4,
          carryoverPct: 20,
          integrityRisk: 'low',
          integrityScore: 90,
          healthStatus: 'on_track',
          flags: [],
        },
      ],
    });

    await buildCommand().parseAsync(['node', 'codexia', '--json', 'board-history', '123', '--max-sprints', '8']);

    expect(testState.service.getBoardHistoryReport).toHaveBeenCalledWith(123, 8);
    expect(JSON.parse(testState.log.mock.calls[0][0])).toEqual({
      board: { id: 123, name: 'Platform' },
      summary: {
        sprintsAnalyzed: 2,
        averageCompletionRate: 82.5,
        averageScopeCreepPct: 10.1,
        averagePointChurnPct: 7.4,
        averageIntegrityScore: 89.2,
        onTrackLikeSprints: 1,
        riskDistribution: { low: 2, medium: 0, high: 0 },
      },
      sprints: [
        {
          id: 7,
          name: 'Sprint 7',
          state: 'closed',
          completionRate: 80,
          committedPoints: 30,
          completedPoints: 24,
          scopeCreepPct: 8,
          pointChurnPct: 4,
          carryoverPct: 20,
          integrityRisk: 'low',
          integrityScore: 90,
          healthStatus: 'on_track',
          flags: [],
        },
      ],
    });
  });

  it('requests flow analytics with parsed project keys and board IDs', async () => {
    testState.service.getFlowSnapshot.mockResolvedValue({
      generatedAt: '2026-04-03T00:00:00.000Z',
      projectKeys: ['PLAT', 'CORE'],
      issueCount: 12,
      summary: {
        throughput: 10,
        unplannedWorkRatio: 20,
        reopenRate: 5,
        blockedAgingHours: 4.5,
      },
      queueVsActive: {
        queueHours: 40,
        activeHours: 60,
      },
      issueTypes: [
        {
          issueType: 'Story',
          throughput: 8,
          medianCycleTimeHours: 12,
          medianLeadTimeHours: 18,
        },
      ],
      trends: {
        forecastReliability: 83.3,
      },
      workItems: [],
    });

    await buildCommand().parseAsync([
      'node',
      'codexia',
      'flow',
      '--project-key',
      'PLAT',
      '--project-key',
      'CORE',
      '--board-id',
      '12',
      '--lookback-days',
      '30',
    ]);

    expect(testState.service.getFlowSnapshot).toHaveBeenCalledWith({
      projectKeys: ['PLAT', 'CORE'],
      boardIds: [12],
      lookbackDays: 30,
    });
    expect(testState.log.mock.calls[0][0]).toContain('Flow Snapshot');
    expect(testState.log.mock.calls[0][0]).toContain('Project keys: PLAT, CORE');
    expect(testState.log.mock.calls[0][0]).toContain('Issues: 12');
  });

  it('prompts inline for Jira auth when analytics are requested without stored credentials', async () => {
    testState.authManager.resolveJiraCredentials.mockResolvedValue({
      baseUrl: null,
      email: null,
      apiToken: null,
      bearerToken: null,
      mode: 'missing',
      source: 'missing',
    });
    testState.service.getBoards.mockResolvedValue({ boards: [], total: 0 });

    await buildCommand().parseAsync(['node', 'codexia', 'boards']);

    expect(testState.authManager.authenticateJira).toHaveBeenCalledWith({ interactive: true });
    expect(testState.createService).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
    }));
  });
});
