import { Command } from 'commander';
import chalk from 'chalk';
import { Formatter } from '../formatter.js';
import { AuthManager } from '../auth/auth-manager.js';
import { EngineeringIntelligenceService } from '../../dashboard/server/engineering.js';
import type { GitHubAnalyticsServiceOptions } from '../../dashboard/server/github.js';
import type { JiraAnalyticsServiceOptions } from '../../dashboard/server/jira.js';

type EngineeringService = Pick<
  EngineeringIntelligenceService,
  'getConfig' | 'getTeams' | 'getOverview' | 'getTeamReport' | 'getRepoReport'
>;

type EngineeringAuthManagerLike = Pick<
  AuthManager,
  'resolveGitHubCredentials' | 'authenticateGitHub' | 'resolveJiraCredentials'
>;

type EngineeringServiceFactoryOptions = {
  repoRoot: string;
  githubConfig?: GitHubAnalyticsServiceOptions;
  jiraConfig?: JiraAnalyticsServiceOptions;
};

type EngineeringCommandDeps = {
  createService?: (options: EngineeringServiceFactoryOptions) => EngineeringService;
  createAuthManager?: () => EngineeringAuthManagerLike;
  isInteractive?: () => boolean;
  repoRoot?: string;
  output?: Pick<Console, 'log' | 'error'>;
};

type EngineeringGlobalOptions = {
  json?: boolean;
  format?: string;
};

const getGlobalOptions = (command: Command): EngineeringGlobalOptions => {
  const rootCommand = command.parent?.parent ?? command.parent;
  return (rootCommand?.opts() || {}) as EngineeringGlobalOptions;
};

const isJsonOutput = (globalOpts: EngineeringGlobalOptions): boolean => {
  return Boolean(globalOpts.json || globalOpts.format === 'json');
};

const isInteractiveSession = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

const printJson = (output: Pick<Console, 'log'>, value: unknown): void => {
  output.log(JSON.stringify(value, null, 2));
};

const createDefaultEngineeringService = (options: EngineeringServiceFactoryOptions): EngineeringService =>
  new EngineeringIntelligenceService(options);

const createDefaultAuthManager = (): EngineeringAuthManagerLike => new AuthManager();

const formatMetricValue = (label: string, metric: { value: number; source: string; confidence: string }): string => {
  return `${label}: ${chalk.cyan(metric.value)} ${chalk.dim(`(${metric.source}, ${metric.confidence})`)}`;
};

const formatReportHeader = (output: Pick<Console, 'log'>, title: string, teamName: string, repos: string[]): void => {
  output.log(chalk.bold.cyan(`\n${title}\n`));
  output.log(`Team:  ${chalk.cyan(teamName)}`);
  output.log(`Repos: ${repos.length > 0 ? repos.map((repo) => chalk.cyan(repo)).join(', ') : chalk.dim('none')}`);
  output.log(chalk.dim('─'.repeat(80)));
};

const formatConfig = (output: Pick<Console, 'log'>, config: Awaited<ReturnType<EngineeringIntelligenceService['getConfig']>>): void => {
  output.log(chalk.bold.cyan('\nEngineering Configuration\n'));
  output.log(`Enabled:          ${config.enabled ? chalk.green('yes') : chalk.yellow('no')}`);
  output.log(`Team config:      ${config.teamConfig.enabled ? chalk.green('enabled') : chalk.yellow('disabled')}`);
  output.log(`Config source:    ${chalk.dim(config.teamConfig.path)}`);
  output.log(`Teams configured: ${chalk.cyan(config.teamConfig.teamsConfigured)}`);
  output.log(`Message:          ${config.teamConfig.message}`);
  output.log('');
  output.log(chalk.bold('Providers'));
  output.log(`  GitHub: ${config.providers.github.enabled ? chalk.green('enabled') : chalk.yellow('disabled')} ${chalk.dim(config.providers.github.message)}`);
  output.log(`  Jira:   ${config.providers.jira.enabled ? chalk.green('enabled') : chalk.yellow('disabled')} ${chalk.dim(config.providers.jira.message)}`);
  output.log('');
};

const formatTeams = (output: Pick<Console, 'log'>, teams: Array<{ name: string; repos: string[] }>): void => {
  output.log(chalk.bold.cyan('\nEngineering Teams\n'));

  if (teams.length === 0) {
    output.log(chalk.dim('No engineering teams are configured.'));
    output.log('');
    return;
  }

  for (const team of teams) {
    output.log(`${chalk.cyan(team.name)}  ${chalk.dim(team.repos.join(', '))}`);
  }
  output.log('');
};

const formatOverview = (output: Pick<Console, 'log'>, overview: Awaited<ReturnType<EngineeringIntelligenceService['getOverview']>>): void => {
  output.log(chalk.bold.cyan('\nEngineering Overview\n'));
  output.log(`Generated at: ${chalk.dim(overview.generatedAt)}`);
  output.log(`Teams:        ${chalk.cyan(overview.teams.length)}`);
  output.log(`Active incidents: ${chalk.cyan(overview.activeIncidents)}`);
  output.log(`Failed changes:   ${chalk.cyan(overview.failedChanges)}`);
  output.log(`Pull requests:    ${chalk.cyan(overview.totalPullRequests)}`);
  output.log('');
  output.log(chalk.bold('Portfolio DORA'));
  output.log(`  ${formatMetricValue('Deployment frequency', overview.portfolioDora.deploymentFrequency)}`);
  output.log(`  ${formatMetricValue('Lead time (hours)', overview.portfolioDora.leadTimeHours)}`);
  output.log(`  ${formatMetricValue('Change failure rate', overview.portfolioDora.changeFailureRate)}`);
  output.log(`  ${formatMetricValue('MTTR (hours)', overview.portfolioDora.meanTimeToRestoreHours)}`);
  output.log('');
  for (const team of overview.teams) {
    output.log(`${chalk.cyan(team.team.name)}  ${chalk.dim(team.team.repos.join(', '))}`);
    output.log(`  DORA deployment frequency: ${chalk.cyan(team.dora.deploymentFrequency.value)}`);
    output.log(`  Incidents: ${chalk.cyan(team.incidents.total)} total, ${chalk.cyan(team.incidents.active)} active`);
    output.log(`  GitHub linkage coverage: ${chalk.cyan(team.githubLinkageCoverage.value)}%`);
  }
  output.log('');
};

const formatTeamReport = (
  output: Pick<Console, 'log'>,
  label: string,
  report: Awaited<ReturnType<EngineeringIntelligenceService['getTeamReport']>>,
): void => {
  formatReportHeader(output, label, report.team.name, report.team.repos);

  output.log(chalk.bold('DORA'));
  output.log(`  ${formatMetricValue('Deployment frequency', report.dora.deploymentFrequency)}`);
  output.log(`  ${formatMetricValue('Lead time (hours)', report.dora.leadTimeHours)}`);
  output.log(`  ${formatMetricValue('Change failure rate', report.dora.changeFailureRate)}`);
  output.log(`  ${formatMetricValue('MTTR (hours)', report.dora.meanTimeToRestoreHours)}`);
  output.log('');

  output.log(chalk.bold('Pull Request Funnel'));
  output.log(`  Total:    ${chalk.cyan(report.pullRequestFunnel.total)}`);
  output.log(`  Merged:   ${chalk.cyan(report.pullRequestFunnel.merged)}`);
  output.log(`  Open:     ${chalk.cyan(report.pullRequestFunnel.open)}`);
  output.log(`  Reviewed: ${chalk.cyan(report.pullRequestFunnel.reviewed)}`);
  output.log(`  Avg review latency: ${chalk.cyan(report.pullRequestFunnel.averageReviewLatencyHours)} hours`);
  output.log('');

  output.log(chalk.bold('Incidents'));
  output.log(`  Total: ${chalk.cyan(report.incidents.total)}`);
  output.log(`  Active: ${chalk.cyan(report.incidents.active)}`);
  output.log(`  Failed changes: ${chalk.cyan(report.incidents.failedChanges)}`);
  output.log('');

  output.log(chalk.bold('Linkage Quality'));
  output.log(`  GitHub linkage coverage: ${chalk.cyan(report.githubLinkageCoverage.value)}%`);
  output.log(`  Deployment traceability: ${chalk.cyan(report.linkageQuality.deploymentTraceabilityCoverage.value)}%`);
  output.log(`  Incident linkage coverage: ${chalk.cyan(report.linkageQuality.incidentLinkageCoverage.value)}%`);
  output.log('');
};

const parseLookbackDays = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? '90'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
};

const addJsonAwareOutput = async (
  output: Pick<Console, 'log'>,
  command: Command,
  loader: () => Promise<unknown>,
  renderer: (value: any) => void,
): Promise<void> => {
  const globalOpts = getGlobalOptions(command);
  const value = await loader();
  if (isJsonOutput(globalOpts)) {
    printJson(output, value);
    return;
  }

  renderer(value);
};

const createFormatter = (command: Command): Formatter => {
  return new Formatter(isJsonOutput(getGlobalOptions(command)));
};

const createEngineeringService = async (
  deps: Required<EngineeringCommandDeps>,
  options: { allowPrompt: boolean },
): Promise<EngineeringService> => {
  const authManager = deps.createAuthManager();
  const repoRoot = deps.repoRoot;

  try {
    let githubCredentials = await authManager.resolveGitHubCredentials();
    if (!githubCredentials.token && options.allowPrompt) {
      const authenticated = await authManager.authenticateGitHub({
        interactive: deps.isInteractive(),
      });
      githubCredentials = {
        token: authenticated.token,
        source: authenticated.source,
      };
    }

    const jiraCredentials = await authManager.resolveJiraCredentials();
    const githubConfig = githubCredentials.token
      ? { env: process.env, token: githubCredentials.token }
      : { env: process.env };
    const jiraConfig = jiraCredentials.mode === 'missing' || !jiraCredentials.baseUrl
      ? undefined
      : {
          env: process.env,
          baseUrl: jiraCredentials.baseUrl,
          email: jiraCredentials.mode === 'basic' ? jiraCredentials.email : undefined,
          apiToken: jiraCredentials.mode === 'basic' ? jiraCredentials.apiToken : undefined,
          bearerToken: jiraCredentials.mode === 'bearer' ? jiraCredentials.bearerToken : undefined,
        };

    return deps.createService({
      repoRoot,
      githubConfig,
      jiraConfig,
    });
  } catch (error) {
    if (!options.allowPrompt) {
      return deps.createService({
        repoRoot,
        githubConfig: { env: process.env },
      });
    }

    throw error;
  }
};

export const createEngineeringCommand = (deps: EngineeringCommandDeps = {}): Command => {
  const resolvedDeps: Required<EngineeringCommandDeps> = {
    createService: deps.createService || createDefaultEngineeringService,
    createAuthManager: deps.createAuthManager || createDefaultAuthManager,
    isInteractive: deps.isInteractive || isInteractiveSession,
    repoRoot: deps.repoRoot || process.cwd(),
    output: deps.output || console,
  };

  const command = new Command('engineering')
    .description('Surface engineering analytics from the dashboard service')
    .addHelpText('after', `
When to use:
  Inspect engineering configuration, team mappings, portfolio metrics, or focused team/repo reports.

Depends on:
  The dashboard engineering service plus GitHub and optional Jira auth. Interactive terminals prompt for GitHub when a remote report needs credentials.

Examples:
  $ codexia engineering config
  $ codexia engineering teams
  $ codexia engineering overview --lookback-days 30
  $ codexia engineering team-report Platform --lookback-days 45
  $ codexia engineering repo-report acme/api
`)
    .action((_options, subcommand) => {
      subcommand.outputHelp();
    });

  command
    .command('config')
    .description('Show engineering configuration status')
    .action(async (_options, subcommand) => {
      const formatter = createFormatter(subcommand);

      try {
        const service = await createEngineeringService(resolvedDeps, { allowPrompt: false });
        await addJsonAwareOutput(resolvedDeps.output, subcommand, async () => service.getConfig(), (value) => formatConfig(resolvedDeps.output, value));
      } catch (error) {
        resolvedDeps.output.error(formatter.formatError(error as Error));
        process.exit(1);
      }
    });

  command
    .command('teams')
    .description('List configured engineering teams')
    .action(async (_options, subcommand) => {
      const formatter = createFormatter(subcommand);

      try {
        const service = await createEngineeringService(resolvedDeps, { allowPrompt: false });
        await addJsonAwareOutput(resolvedDeps.output, subcommand, async () => service.getTeams(), (value) => formatTeams(resolvedDeps.output, value));
      } catch (error) {
        resolvedDeps.output.error(formatter.formatError(error as Error));
        process.exit(1);
      }
    });

  command
    .command('overview')
    .description('Show a portfolio engineering overview')
    .option('--lookback-days <days>', 'Lookback window in days', '90')
    .action(async (options, subcommand) => {
      const formatter = createFormatter(subcommand);

      try {
        const lookbackDays = parseLookbackDays(options.lookbackDays);
        const service = await createEngineeringService(resolvedDeps, { allowPrompt: true });
        await addJsonAwareOutput(resolvedDeps.output, subcommand, async () => service.getOverview(lookbackDays), (value) => formatOverview(resolvedDeps.output, value));
      } catch (error) {
        resolvedDeps.output.error(formatter.formatError(error as Error));
        process.exit(1);
      }
    });

  command
    .command('team-report')
    .description('Show a report for a configured engineering team')
    .argument('<team>', 'Team name')
    .option('--lookback-days <days>', 'Lookback window in days', '90')
    .action(async (team, options, subcommand) => {
      const formatter = createFormatter(subcommand);

      try {
        const lookbackDays = parseLookbackDays(options.lookbackDays);
        const service = await createEngineeringService(resolvedDeps, { allowPrompt: true });
        await addJsonAwareOutput(
          resolvedDeps.output,
          subcommand,
          async () => service.getTeamReport(team, lookbackDays),
          (report) => formatTeamReport(resolvedDeps.output, 'Team Report', report),
        );
      } catch (error) {
        resolvedDeps.output.error(formatter.formatError(error as Error));
        process.exit(1);
      }
    });

  command
    .command('repo-report')
    .description('Show a report for a repo mapped to an engineering team')
    .argument('<repo>', 'Repository slug')
    .option('--lookback-days <days>', 'Lookback window in days', '90')
    .action(async (repo, options, subcommand) => {
      const formatter = createFormatter(subcommand);

      try {
        const lookbackDays = parseLookbackDays(options.lookbackDays);
        const service = await createEngineeringService(resolvedDeps, { allowPrompt: true });
        await addJsonAwareOutput(
          resolvedDeps.output,
          subcommand,
          async () => service.getRepoReport(repo, lookbackDays),
          (report) => formatTeamReport(resolvedDeps.output, 'Repo Report', report),
        );
      } catch (error) {
        resolvedDeps.output.error(formatter.formatError(error as Error));
        process.exit(1);
      }
    });

  return command;
};

export const engineeringCommand = createEngineeringCommand();
