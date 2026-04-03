import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepoCommand } from './repo.js';

const analyticsMock = {
  getLanguageStats: vi.fn(),
  getContributors: vi.fn(),
  getRecentCommits: vi.fn(),
  getBranches: vi.fn(),
  getCommitActivity: vi.fn(),
  getFileOwnership: vi.fn(),
  getCodeHealth: vi.fn(),
  getVelocityMetrics: vi.fn(),
};

vi.mock('../../dashboard/server/index.js', () => ({
  createLocalRepoAnalytics: vi.fn(),
}));

import { createLocalRepoAnalytics } from '../../dashboard/server/index.js';

describe('repo command', () => {
  beforeEach(() => {
    vi.mocked(createLocalRepoAnalytics).mockReturnValue(analyticsMock as never);
    for (const fn of Object.values(analyticsMock)) {
      fn.mockReset();
    }
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('exposes the repo analytics subcommands only', () => {
    const command = createRepoCommand();

    expect(command.commands.map((subcommand) => subcommand.name())).toEqual([
      'languages',
      'contributors',
      'commits',
      'branches',
      'activity',
      'ownership',
      'code-health',
      'velocity',
    ]);
    expect(command.helpInformation()).toContain('languages');
    expect(command.helpInformation()).toContain('velocity');
    expect(command.helpInformation()).not.toContain('Usage: overview');
  });

  it('does not load analytics when invoked without a subcommand', async () => {
    const program = new Command();
    program.option('--json', 'Output results as JSON');
    program.addCommand(createRepoCommand());

    await program.parseAsync(['repo'], { from: 'user' });

    expect(createLocalRepoAnalytics).not.toHaveBeenCalled();
  });

  it('routes languages through the dashboard analytics loader and prints json', async () => {
    analyticsMock.getLanguageStats.mockResolvedValue({
      counts: { ts: 4, js: 2 },
      lines: { ts: 1200, js: 300 },
      total: 6,
    });

    const program = new Command();
    program.option('--json', 'Output results as JSON');
    program.addCommand(createRepoCommand());

    await program.parseAsync(['--json', 'repo', '--repo', '/tmp/codexia-repo', 'languages'], { from: 'user' });

    expect(createLocalRepoAnalytics).toHaveBeenCalledWith('/tmp/codexia-repo');
    expect(analyticsMock.getLanguageStats).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"total": 6'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"ts": 4'));
  });

  it('routes contributors through the dashboard analytics loader and prints a readable summary', async () => {
    analyticsMock.getContributors.mockResolvedValue({
      contributors: [
        { rank: 1, name: 'Ada Lovelace', commits: 14, recentCommits: 3, isActive: true },
        { rank: 2, name: 'Grace Hopper', commits: 8, recentCommits: 0, isActive: false },
      ],
      totalContributors: 2,
      activeContributors: 1,
    });

    const program = new Command();
    program.addCommand(createRepoCommand());

    await program.parseAsync(['repo', 'contributors'], { from: 'user' });

    expect(analyticsMock.getContributors).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Contributors'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Ada Lovelace'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('active'));
  });
});
