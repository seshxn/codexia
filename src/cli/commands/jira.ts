import { Command } from 'commander';
import chalk from 'chalk';
import { Formatter } from '../formatter.js';
import { AuthManager } from '../auth/auth-manager.js';
import { JiraAnalyticsService, type JiraAnalyticsServiceOptions, type JiraBoardHistoryReport, type JiraBoardSummary, type JiraConfig, type JiraFlowReport, type JiraSprintReport, type JiraSprintSummary } from '../../dashboard/server/jira.js';

type JiraService = Pick<
  JiraAnalyticsService,
  'getConfig' | 'getBoards' | 'getSprints' | 'getSprintReport' | 'getBoardHistoryReport' | 'getFlowSnapshot'
>;

type JiraAuthManagerLike = Pick<AuthManager, 'resolveJiraCredentials' | 'authenticateJira'>;

type JiraCommandDeps = {
  createService?: (options?: JiraAnalyticsServiceOptions) => JiraService;
  createAuthManager?: () => JiraAuthManagerLike;
  isInteractive?: () => boolean;
  log?: (message?: unknown) => void;
  error?: (message?: unknown) => void;
};

type CommandOptions = {
  json?: boolean;
  format?: string;
  [key: string]: unknown;
};

const DEFAULT_SERVICE_FACTORY = (options?: JiraAnalyticsServiceOptions): JiraService => new JiraAnalyticsService(options);
const DEFAULT_AUTH_MANAGER_FACTORY = (): JiraAuthManagerLike => new AuthManager();

const normalizeList = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeIntegerList = (value: unknown): number[] => {
  return normalizeList(value)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));
};

const parseInteger = (value: unknown, label: string): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return parsed;
};

const isJsonMode = (options: CommandOptions): boolean => options.json === true || options.format === 'json';
const isInteractiveSession = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

const formatHeading = (title: string): string => [
  '',
  chalk.bold(title),
  chalk.gray('─'.repeat(Math.max(24, title.length))),
  '',
].join('\n');

const formatConfig = (config: JiraConfig): string => [
  formatHeading('Jira Configuration'),
  `Enabled: ${config.enabled ? chalk.green('yes') : chalk.yellow('no')}`,
  `Base URL: ${config.baseUrl || 'not set'}`,
  `Auth mode: ${config.authMode}`,
  `Message: ${config.message}`,
  '',
].join('\n');

const formatBoards = (
  result: { boards: JiraBoardSummary[]; total: number },
  projectKey?: string,
  limit?: number,
): string => {
  const lines = [
    formatHeading('Jira Boards'),
    projectKey ? `Project key: ${projectKey}` : undefined,
    limit !== undefined ? `Limit: ${limit}` : undefined,
    `Total: ${result.total}`,
    '',
  ].filter((line): line is string => Boolean(line));

  if (result.boards.length === 0) {
    lines.push(chalk.gray('No boards returned.'));
    lines.push('');
    return lines.join('\n');
  }

  result.boards.forEach((board, index) => {
    lines.push(`${index + 1}. ${chalk.cyan(board.name)} (${board.type})`);
    lines.push(`   ID: ${board.id}`);
    lines.push(`   Project: ${board.projectKey || 'n/a'}${board.projectName ? ` - ${board.projectName}` : ''}`);
  });

  lines.push('');
  return lines.join('\n');
};

const formatSprints = (
  result: { boardId: number; sprints: JiraSprintSummary[]; total: number },
  boardId: number,
  state: string,
  limit: number,
): string => {
  const lines = [
    formatHeading('Jira Sprints'),
    `Board: ${boardId}`,
    `State: ${state}`,
    `Limit: ${limit}`,
    `Total: ${result.total}`,
    '',
  ];

  if (result.sprints.length === 0) {
    lines.push(chalk.gray('No sprints returned.'));
    lines.push('');
    return lines.join('\n');
  }

  result.sprints.forEach((sprint, index) => {
    lines.push(`${index + 1}. ${chalk.cyan(sprint.name)} (${sprint.state})`);
    lines.push(`   ID: ${sprint.id}`);
    if (sprint.goal) {
      lines.push(`   Goal: ${sprint.goal}`);
    }
    if (sprint.startDate || sprint.endDate || sprint.completeDate) {
      lines.push(
        `   Dates: ${sprint.startDate || 'n/a'} → ${sprint.endDate || sprint.completeDate || 'n/a'}`,
      );
    }
  });

  lines.push('');
  return lines.join('\n');
};

const formatSprintReport = (report: JiraSprintReport): string => [
  formatHeading('Sprint Report'),
  `Board: ${report.board.name} (${report.board.id})`,
  `Sprint: ${report.sprint.name} (${report.sprint.id})`,
  `State: ${report.sprint.state}`,
  `Health: ${report.health.status} (${report.health.score})`,
  `Issues: ${report.metrics.issues.total} total, ${report.metrics.issues.completedByEnd} completed`,
  `Points: ${report.metrics.points.committed} committed, ${report.metrics.points.completedByEnd} completed`,
  `Integrity: ${report.integrity.risk} (${report.integrity.score})`,
  `Summary: ${report.health.summary}`,
  report.integrity.flags.length > 0 ? `Flags: ${report.integrity.flags.join(', ')}` : undefined,
  '',
].filter((line): line is string => line !== undefined).join('\n');

const formatBoardHistory = (report: JiraBoardHistoryReport, maxSprints: number): string => {
  const lines = [
    formatHeading('Board History'),
    `Board: ${report.board.name} (${report.board.id})`,
    `Analyzed: ${report.summary.sprintsAnalyzed} of ${maxSprints}`,
    `Completion: ${report.summary.averageCompletionRate}% avg`,
    `Scope creep: ${report.summary.averageScopeCreepPct}% avg`,
    `Integrity: ${report.summary.averageIntegrityScore} avg`,
    '',
  ];

  if (report.sprints.length === 0) {
    lines.push(chalk.gray('No sprint history returned.'));
    lines.push('');
    return lines.join('\n');
  }

  report.sprints.forEach((sprint, index) => {
    lines.push(
      `${index + 1}. ${chalk.cyan(sprint.name)} (${sprint.state}) - completion ${sprint.completionRate}%`,
    );
    lines.push(`   Risk: ${sprint.integrityRisk} (${sprint.integrityScore})`);
  });

  lines.push('');
  return lines.join('\n');
};

const formatFlow = (report: JiraFlowReport): string => [
  formatHeading('Flow Snapshot'),
  `Generated: ${report.generatedAt}`,
  `Project keys: ${report.projectKeys.join(', ')}`,
  `Issues: ${report.issueCount}`,
  `Throughput: ${report.summary.throughput}`,
  `Unplanned: ${report.summary.unplannedWorkRatio}%`,
  `Reopen rate: ${report.summary.reopenRate}%`,
  `Blocked age: ${report.summary.blockedAgingHours}h`,
  `Queue hours: ${report.queueVsActive.queueHours}`,
  `Active hrs: ${report.queueVsActive.activeHours}`,
  `Forecast: ${report.trends.forecastReliability}%`,
  '',
].join('\n');

const runSafely = async (
  deps: Required<JiraCommandDeps>,
  command: Command,
  handler: (service: JiraService, globalOptions: CommandOptions) => Promise<void>,
  options: { allowPrompt: boolean } = { allowPrompt: false },
): Promise<void> => {
  try {
    const service = await createResolvedService(deps, options.allowPrompt);
    const globalOptions = (command.parent?.opts() || {}) as CommandOptions;
    await handler(service, globalOptions);
  } catch (error) {
    const formatter = new Formatter();
    deps.error(formatter.formatError(error as Error));
    process.exit(1);
  }
};

const createResolvedService = async (
  deps: Required<JiraCommandDeps>,
  allowPrompt: boolean,
): Promise<JiraService> => {
  const authManager = deps.createAuthManager();

  try {
    let credentials = await authManager.resolveJiraCredentials();

    if (credentials.mode === 'missing' && allowPrompt) {
      const authenticated = await authManager.authenticateJira({
        interactive: deps.isInteractive(),
      });
      credentials = {
        ...authenticated,
        source: authenticated.source,
      };
    }

    if (credentials.mode === 'missing' || !credentials.baseUrl) {
      return deps.createService({ env: process.env });
    }

    return deps.createService({
      env: process.env,
      baseUrl: credentials.baseUrl,
      email: credentials.mode === 'basic' ? credentials.email : undefined,
      apiToken: credentials.mode === 'basic' ? credentials.apiToken : undefined,
      bearerToken: credentials.mode === 'bearer' ? credentials.bearerToken : undefined,
    });
  } catch (error) {
    if (!allowPrompt) {
      return deps.createService({ env: process.env });
    }

    throw error;
  }
};

export const createJiraCommand = (deps: JiraCommandDeps = {}): Command => {
  const resolvedDeps: Required<JiraCommandDeps> = {
    createService: deps.createService || DEFAULT_SERVICE_FACTORY,
    createAuthManager: deps.createAuthManager || DEFAULT_AUTH_MANAGER_FACTORY,
    isInteractive: deps.isInteractive || isInteractiveSession,
    log: deps.log || console.log,
    error: deps.error || console.error,
  };

  const command = new Command('jira')
    .description('Inspect Jira analytics from the configured environment')
    .option('--json', 'Output results as JSON')
    .option('--format <format>', 'Output format: text, json, or markdown', 'text')
    .addHelpText('after', `
When to use:
  Use this when you want Jira analytics directly from the CLI without opening the dashboard.

Depends on:
  Jira auth from env vars or the codexia auth jira flow. Interactive terminals prompt the first time remote Jira analytics need credentials.

Examples:
  $ codexia jira config
  $ codexia jira boards PLAT
  $ codexia jira sprints 123 --state active,closed
  $ codexia jira sprint-report 123 456
  $ codexia jira board-history 123
  $ codexia jira flow --project-key PLAT --board-id 123
`);

  command
    .command('config')
    .description('Show the current Jira analytics configuration')
    .action(async (_options, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (service, globalOptions) => {
        const config = service.getConfig();
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(config, null, 2));
          return;
        }

        resolvedDeps.log(formatConfig(config));
      }, { allowPrompt: false });
    });

  command
    .command('boards')
    .argument('[project-key]', 'Optional Jira project key to filter boards')
    .option('-l, --limit <limit>', 'Maximum number of boards to return', '50')
    .description('List Jira boards')
    .action(async (projectKey: string | undefined, options: { limit?: string }, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (service, globalOptions) => {
        const limit = parseInteger(options.limit, 'limit');
        const result = await service.getBoards(projectKey, limit);
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(result, null, 2));
          return;
        }

        resolvedDeps.log(formatBoards(result, projectKey, limit));
      }, { allowPrompt: true });
    });

  command
    .command('sprints')
    .argument('<board-id>', 'Jira board ID')
    .option('-s, --state <state>', 'Sprint state filter', 'active,closed,future')
    .option('-l, --limit <limit>', 'Maximum number of sprints to return', '50')
    .description('List sprints for a board')
    .action(async (boardId: string, options: { state?: string; limit?: string }, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (service, globalOptions) => {
        const numericBoardId = parseInteger(boardId, 'board id');
        const limit = parseInteger(options.limit, 'limit');
        const state = options.state || 'active,closed,future';
        const result = await service.getSprints(numericBoardId, state, limit);
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(result, null, 2));
          return;
        }

        resolvedDeps.log(formatSprints(result, numericBoardId, state, limit));
      }, { allowPrompt: true });
    });

  command
    .command('sprint-report')
    .argument('<board-id>', 'Jira board ID')
    .argument('<sprint-id>', 'Jira sprint ID')
    .description('Show the report for a single sprint')
    .action(async (boardId: string, sprintId: string, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (service, globalOptions) => {
        const result = await service.getSprintReport(parseInteger(boardId, 'board id'), parseInteger(sprintId, 'sprint id'));
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(result, null, 2));
          return;
        }

        resolvedDeps.log(formatSprintReport(result));
      }, { allowPrompt: true });
    });

  command
    .command('board-history')
    .argument('<board-id>', 'Jira board ID')
    .option('-m, --max-sprints <count>', 'Maximum number of closed sprints to analyze', '12')
    .description('Summarize recent sprint history for a board')
    .action(async (boardId: string, options: { maxSprints?: string }, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (service, globalOptions) => {
        const numericBoardId = parseInteger(boardId, 'board id');
        const maxSprints = parseInteger(options.maxSprints, 'max sprints');
        const result = await service.getBoardHistoryReport(numericBoardId, maxSprints);
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(result, null, 2));
          return;
        }

        resolvedDeps.log(formatBoardHistory(result, maxSprints));
      }, { allowPrompt: true });
    });

  command
    .command('flow')
    .option('--project-key <key...>', 'Jira project key(s) to analyze')
    .option('--board-id <id...>', 'Jira board ID(s) to analyze')
    .option('--lookback-days <days>', 'Lookback window in days', '90')
    .description('Generate a Jira flow snapshot')
    .action(async (options: { projectKey?: unknown; boardId?: unknown; lookbackDays?: string }, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (service, globalOptions) => {
        const result = await service.getFlowSnapshot({
          projectKeys: normalizeList(options.projectKey),
          boardIds: normalizeIntegerList(options.boardId),
          lookbackDays: parseInteger(options.lookbackDays, 'lookback days'),
        });
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(result, null, 2));
          return;
        }

        resolvedDeps.log(formatFlow(result));
      }, { allowPrompt: true });
    });

  return command;
};

export const jiraCommand = createJiraCommand();
