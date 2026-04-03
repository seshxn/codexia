import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngineeringCommand } from './engineering.js';

const testState = vi.hoisted(() => ({
  service: {
    getConfig: vi.fn(),
    getTeams: vi.fn(),
    getOverview: vi.fn(),
    getTeamReport: vi.fn(),
    getRepoReport: vi.fn(),
  },
  createService: vi.fn(),
  authManager: {
    resolveGitHubCredentials: vi.fn(),
    authenticateGitHub: vi.fn(),
    resolveJiraCredentials: vi.fn(),
  },
  createAuthManager: vi.fn(),
}));

describe('engineeringCommand', () => {
  const createProgram = (includeJson = false): Command => {
    const program = new Command();
    if (includeJson) {
      program.option('--json', 'Output results as JSON');
    }

    const command = createEngineeringCommand({
      createService: testState.createService,
      createAuthManager: testState.createAuthManager,
      isInteractive: () => true,
      output: console,
      repoRoot: '/repo/codexia',
    });
    command.configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    });
    program.addCommand(command);
    return program;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    testState.createService.mockReturnValue(testState.service);
    testState.createAuthManager.mockReturnValue(testState.authManager);
    testState.authManager.resolveGitHubCredentials.mockResolvedValue({
      token: 'ghp_test_token',
      source: 'keychain',
    });
    testState.authManager.authenticateGitHub.mockResolvedValue({
      token: 'ghp_prompt_token',
      source: 'prompt',
    });
    testState.authManager.resolveJiraCredentials.mockResolvedValue({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
      bearerToken: null,
      mode: 'basic',
      source: 'keychain',
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('exposes explicit engineering analytics subcommands only', () => {
    const command = createEngineeringCommand({
      createService: testState.createService,
      createAuthManager: testState.createAuthManager,
      isInteractive: () => true,
      output: console,
      repoRoot: '/repo/codexia',
    });

    expect(command.commands.map((subcommand) => subcommand.name())).toEqual([
      'config',
      'teams',
      'overview',
      'team-report',
      'repo-report',
    ]);
    expect(command.helpInformation()).toContain('team-report');
    expect(command.helpInformation()).toContain('repo-report');
    expect(command.helpInformation()).not.toContain('Usage: overview');
  });

  it('does not run an overview by default when invoked without a subcommand', async () => {
    const program = createProgram(true);

    await program.parseAsync(['engineering'], { from: 'user' });

    expect(testState.service.getOverview).not.toHaveBeenCalled();
    expect(testState.service.getConfig).not.toHaveBeenCalled();
    expect(testState.service.getTeams).not.toHaveBeenCalled();
    expect(testState.service.getTeamReport).not.toHaveBeenCalled();
    expect(testState.service.getRepoReport).not.toHaveBeenCalled();
  });

  it('routes config to getConfig and prints JSON when requested', async () => {
    testState.service.getConfig.mockResolvedValue({
      enabled: true,
      teamConfig: {
        enabled: true,
        path: '/tmp/codexia.teams.yaml',
        message: 'Loaded 1 team mapping from codexia.teams.yaml.',
        teamsConfigured: 1,
      },
      providers: {
        github: {
          enabled: true,
          apiUrl: 'https://api.github.com',
          message: 'GitHub analytics is configured.',
        },
        jira: {
          enabled: true,
          baseUrl: 'https://example.atlassian.net',
          authMode: 'basic',
          message: 'Jira analytics is configured.',
        },
      },
    });

    const program = createProgram(true);

    await program.parseAsync(['--json', 'engineering', 'config'], { from: 'user' });

    expect(testState.createService).toHaveBeenCalledWith({
      repoRoot: '/repo/codexia',
      githubConfig: { env: process.env, token: 'ghp_test_token' },
      jiraConfig: {
        env: process.env,
        baseUrl: 'https://example.atlassian.net',
        email: 'jira@example.com',
        apiToken: 'jira-token',
        bearerToken: undefined,
      },
    });
    expect(testState.service.getConfig).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"enabled": true'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"teamConfig"'));
  });

  it('formats teams in human-readable output', async () => {
    testState.service.getTeams.mockResolvedValue([
      { name: 'Platform', repos: ['acme/api', 'acme/web'] },
      { name: 'Infrastructure', repos: ['acme/ops'] },
    ]);

    const program = createProgram(true);

    await program.parseAsync(['engineering', 'teams'], { from: 'user' });

    expect(testState.service.getTeams).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Platform'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('acme/api'));
  });

  it('passes the explicit lookback window to team reports', async () => {
    testState.service.getTeamReport.mockResolvedValue({
      team: { name: 'Platform', repos: ['acme/api'] },
      dora: {
        deploymentFrequency: { value: 1, source: 'test', confidence: 'high' },
        leadTimeHours: { value: 1, source: 'test', confidence: 'high' },
        changeFailureRate: { value: 1, source: 'test', confidence: 'high' },
        meanTimeToRestoreHours: { value: 1, source: 'test', confidence: 'high' },
      },
      pullRequestFunnel: { total: 1, merged: 1, open: 0, reviewed: 1, averageReviewLatencyHours: 2 },
      githubLinkageCoverage: { value: 90, source: 'test', confidence: 'high' },
      incidents: { total: 0, active: 0, failedChanges: 0 },
      prHealth: {},
      planning: {},
      reliability: {},
      throughput: {},
      peopleRisk: {},
      linkageQuality: {
        githubLinkageCoverage: { value: 90, source: 'test', confidence: 'high' },
        deploymentTraceabilityCoverage: { value: 80, source: 'test', confidence: 'high' },
        incidentLinkageCoverage: { value: 70, source: 'test', confidence: 'high' },
        incidentDeploymentCoverage: { value: 60, source: 'test', confidence: 'high' },
      },
      deploymentTimeline: [],
      recentIncidents: [],
      flow: {},
    });

    const program = createProgram(true);

    await program.parseAsync(['--json', 'engineering', 'team-report', 'Platform', '--lookback-days', '45'], {
      from: 'user',
    });

    expect(testState.service.getTeamReport).toHaveBeenCalledWith('Platform', 45);
  });

  it('passes repo reports through to the dashboard service', async () => {
    testState.service.getRepoReport.mockResolvedValue({
      team: { name: 'Platform', repos: ['acme/api'] },
      dora: {
        deploymentFrequency: { value: 1, source: 'test', confidence: 'high' },
        leadTimeHours: { value: 1, source: 'test', confidence: 'high' },
        changeFailureRate: { value: 1, source: 'test', confidence: 'high' },
        meanTimeToRestoreHours: { value: 1, source: 'test', confidence: 'high' },
      },
      pullRequestFunnel: { total: 1, merged: 1, open: 0, reviewed: 1, averageReviewLatencyHours: 2 },
      githubLinkageCoverage: { value: 90, source: 'test', confidence: 'high' },
      incidents: { total: 0, active: 0, failedChanges: 0 },
      prHealth: {},
      planning: {},
      reliability: {},
      throughput: {},
      peopleRisk: {},
      linkageQuality: {
        githubLinkageCoverage: { value: 90, source: 'test', confidence: 'high' },
        deploymentTraceabilityCoverage: { value: 80, source: 'test', confidence: 'high' },
        incidentLinkageCoverage: { value: 70, source: 'test', confidence: 'high' },
        incidentDeploymentCoverage: { value: 60, source: 'test', confidence: 'high' },
      },
      deploymentTimeline: [],
      recentIncidents: [],
      flow: {},
    });

    const program = createProgram(true);

    await program.parseAsync(['--json', 'engineering', 'repo-report', 'acme/api'], { from: 'user' });

    expect(testState.service.getRepoReport).toHaveBeenCalledWith('acme/api', 90);
  });

  it('prompts inline for GitHub auth when a remote report needs it', async () => {
    testState.authManager.resolveGitHubCredentials.mockResolvedValue({
      token: null,
      source: 'missing',
    });
    testState.service.getOverview.mockResolvedValue({
      generatedAt: '2026-04-03T00:00:00.000Z',
      teams: [],
      portfolioDora: {
        deploymentFrequency: { value: 0, source: 'test', confidence: 'high' },
        leadTimeHours: { value: 0, source: 'test', confidence: 'high' },
        changeFailureRate: { value: 0, source: 'test', confidence: 'high' },
        meanTimeToRestoreHours: { value: 0, source: 'test', confidence: 'high' },
      },
      activeIncidents: 0,
      failedChanges: 0,
      totalPullRequests: 0,
    });

    const program = createProgram(true);

    await program.parseAsync(['engineering', 'overview'], { from: 'user' });

    expect(testState.authManager.authenticateGitHub).toHaveBeenCalledWith({ interactive: true });
    expect(testState.createService).toHaveBeenCalledWith(expect.objectContaining({
      githubConfig: { env: process.env, token: 'ghp_prompt_token' },
    }));
  });
});
