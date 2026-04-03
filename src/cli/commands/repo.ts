import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import { Formatter } from '../formatter.js';
import { createLocalRepoAnalytics, type LocalRepoAnalytics } from '../../dashboard/server/index.js';

type RepoGlobalOptions = {
  json?: boolean;
  format?: string;
};

type RepoCommandOptions = {
  repo?: string;
};

type RepoCommandDeps = {
  createAnalytics?: (repoRoot: string) => LocalRepoAnalytics;
  output?: Pick<Console, 'log' | 'error'>;
};

const getGlobalOptions = (command: Command): RepoGlobalOptions => {
  return ((command.parent?.parent?.opts() || {}) as RepoGlobalOptions);
};

const isJsonOutput = (options: RepoGlobalOptions): boolean => {
  return Boolean(options.json || options.format === 'json');
};

const getRepoRoot = (options: RepoCommandOptions): string => {
  return path.resolve(options.repo || process.cwd());
};

const printJson = (output: Pick<Console, 'log'>, value: unknown): void => {
  output.log(JSON.stringify(value, null, 2));
};

const renderLanguages = (report: any): void => {
  console.log(chalk.bold.cyan('\nRepository Languages\n'));
  const entries = Object.entries(report.counts || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length === 0) {
    console.log(chalk.dim('No language data available.'));
    console.log('');
    return;
  }

  console.log(`Total files: ${chalk.cyan(report.total ?? 0)}`);
  for (const [language, count] of entries) {
    const lines = report.lines?.[language] ?? 0;
    console.log(`${chalk.cyan(language)}  ${chalk.yellow(count)} files  ${chalk.dim(`${lines} lines`)}`);
  }
  console.log('');
};

const renderContributors = (report: any): void => {
  console.log(chalk.bold.cyan('\nRepository Contributors\n'));
  console.log(`Total contributors: ${chalk.cyan(report.totalContributors ?? 0)}`);
  console.log(`Active contributors: ${chalk.cyan(report.activeContributors ?? 0)}`);
  console.log(chalk.dim('─'.repeat(80)));

  for (const contributor of report.contributors || []) {
    const activity = contributor.isActive ? chalk.green('active') : chalk.dim('inactive');
    console.log(`${chalk.cyan(contributor.name)}  ${chalk.yellow(contributor.commits)} commits  ${activity}`);
  }
  console.log('');
};

const renderCommits = (report: any): void => {
  console.log(chalk.bold.cyan('\nRecent Commits\n'));
  console.log(`Total commits: ${chalk.cyan(report.totalCommits ?? 0)}`);
  console.log(chalk.dim('─'.repeat(80)));

  for (const commit of report.commits || []) {
    console.log(`${chalk.yellow(commit.hash)}  ${chalk.cyan(commit.author)}  ${chalk.dim(commit.relativeDate)}`);
    console.log(`  ${commit.message}`);
  }
  console.log('');
};

const renderBranches = (report: any): void => {
  console.log(chalk.bold.cyan('\nBranch Overview\n'));
  console.log(`Current branch: ${chalk.cyan(report.current || 'main')}`);
  console.log(`Total branches: ${chalk.cyan(report.totalBranches ?? 0)}`);
  console.log(`Stale branches: ${chalk.cyan(report.staleBranches ?? 0)}`);
  console.log(chalk.dim('─'.repeat(80)));

  for (const branch of report.branches || []) {
    const current = branch.isCurrent ? chalk.green('*') : ' ';
    const stale = branch.isStale ? chalk.red('stale') : chalk.green('fresh');
    console.log(`${current} ${chalk.cyan(branch.name)}  ${chalk.dim(branch.daysSinceActivity)} days  ${stale}`);
  }
  console.log('');
};

const renderActivity = (report: any): void => {
  console.log(chalk.bold.cyan('\nCommit Activity\n'));
  console.log(`Total commits: ${chalk.cyan(report.totalCommits ?? 0)}`);
  console.log(`Peak hour: ${chalk.cyan(report.peakHour || '09:00')}`);
  console.log(`Peak day: ${chalk.cyan(report.peakDay || 'Mon')}`);
  console.log(`Average per day: ${chalk.cyan(report.averagePerDay ?? '0')}`);
  console.log('');
};

const renderOwnership = (report: any): void => {
  console.log(chalk.bold.cyan('\nCode Ownership\n'));
  console.log(`Total files: ${chalk.cyan(report.totalFiles ?? 0)}`);
  console.log(`High-risk files: ${chalk.cyan(report.totalHighRiskFiles ?? 0)}`);
  console.log(`Average bus factor: ${chalk.cyan(report.averageBusFactor ?? '0')}`);
  console.log(chalk.dim('─'.repeat(80)));

  for (const file of report.files || []) {
    console.log(`${chalk.cyan(file.file)}  ${chalk.yellow(file.ownership)}%  owner: ${file.primaryOwner}`);
  }
  console.log('');
};

const renderCodeHealth = (report: any): void => {
  console.log(chalk.bold.cyan('\nCode Health\n'));
  console.log(`Maintainability: ${chalk.cyan(report.maintainability?.average ?? 0)} (${report.maintainability?.grade ?? 'N/A'})`);
  console.log(`Technical debt: ${chalk.cyan(report.technicalDebt?.score ?? 0)} (${report.technicalDebt?.grade ?? 'N/A'})`);
  console.log(`Files: ${chalk.cyan(report.codebase?.totalFiles ?? 0)}`);
  console.log(`Lines: ${chalk.cyan(report.codebase?.totalLines ?? 0)}`);
  console.log('');
};

const renderVelocity = (report: any): void => {
  console.log(chalk.bold.cyan('\nVelocity\n'));
  console.log(`30-day commits: ${chalk.cyan(report.summary?.totalCommits30d ?? 0)}`);
  console.log(`Per week: ${chalk.cyan(report.summary?.avgCommitsPerWeek ?? 0)}`);
  console.log(`Trend: ${chalk.cyan(report.summary?.velocityTrend ?? '0%')}`);
  console.log(`Active contributors: ${chalk.cyan(report.summary?.activeContributors ?? 0)}`);
  console.log('');
};

const runRepoAnalytics = async <T>(
  subcommand: Command,
  options: RepoCommandOptions,
  deps: RepoCommandDeps,
  loader: (analytics: LocalRepoAnalytics) => Promise<T>,
  renderer: (report: T) => void,
): Promise<void> => {
  const globalOpts = getGlobalOptions(subcommand);
  const formatter = new Formatter(isJsonOutput(globalOpts));
  const output = deps.output || console;

  try {
    const createAnalytics = deps.createAnalytics || createLocalRepoAnalytics;
    const analytics = createAnalytics(getRepoRoot(options));
    const report = await loader(analytics);

    if (isJsonOutput(globalOpts)) {
      printJson(output, report);
      return;
    }

    renderer(report);
  } catch (error) {
    output.error(formatter.formatError(error as Error));
    process.exit(1);
  }
};

export const createRepoCommand = (deps: RepoCommandDeps = {}): Command => {
  const command = new Command('repo')
    .description('Surface local repository analytics from the dashboard loaders')
    .option('-r, --repo <path>', 'Repository path to analyze (defaults to current directory)')
    .addHelpText('after', `
When to use:
  Inspect local repository health, history, ownership, and velocity from the CLI.

Depends on:
  The current checkout or a repository path passed with --repo.

Examples:
  $ codexia repo languages
  $ codexia repo contributors --repo .
  $ codexia repo code-health
`)
    .action((_options, subcommand) => {
      subcommand.outputHelp();
    });

  command.command('languages').description('Show language breakdown').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getLanguageStats(), renderLanguages);
  });

  command.command('contributors').description('Show contributor statistics').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getContributors(), renderContributors);
  });

  command.command('commits').description('Show recent commits').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getRecentCommits(), renderCommits);
  });

  command.command('branches').description('Show branch activity').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getBranches(), renderBranches);
  });

  command.command('activity').description('Show commit activity over time').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getCommitActivity(), renderActivity);
  });

  command.command('ownership').description('Show code ownership and bus factor').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getFileOwnership(), renderOwnership);
  });

  command.command('code-health').description('Show code health metrics').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getCodeHealth(), renderCodeHealth);
  });

  command.command('velocity').description('Show velocity metrics').action(async (_options, subcommand) => {
    await runRepoAnalytics(subcommand, subcommand.parent?.opts() as RepoCommandOptions || {}, deps, (analytics) => analytics.getVelocityMetrics(), renderVelocity);
  });

  return command;
};

export const repoCommand = createRepoCommand();
