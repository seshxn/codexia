import { Command } from 'commander';
import chalk from 'chalk';
import { AuthManager } from '../auth/auth-manager.js';
import type { AuthStatusReport } from '../auth/types.js';

type AuthManagerLike = Pick<AuthManager, 'getStatus' | 'authenticateGitHub' | 'authenticateJira' | 'logout'>;

type AuthCommandDeps = {
  createManager?: () => AuthManagerLike;
  log?: (message?: unknown) => void;
  error?: (message?: unknown) => void;
};

type GlobalOptions = {
  json?: boolean;
  format?: string;
};

const createDefaultManager = (): AuthManagerLike => new AuthManager();

const getGlobalOptions = (command: Command): GlobalOptions => {
  const optsWithGlobals = typeof command.optsWithGlobals === 'function'
    ? command.optsWithGlobals()
    : undefined;

  return {
    ...(command.parent?.opts?.() || {}),
    ...(optsWithGlobals || {}),
  } as GlobalOptions;
};

const isJsonMode = (options: GlobalOptions): boolean => options.json === true || options.format === 'json';

const formatField = (label: string, field: { display: string; source: string }): string => `  ${label}: ${field.display} (${field.source})`;

const formatStatus = (status: AuthStatusReport): string => [
  '',
  chalk.bold('Auth Status'),
  chalk.gray('─'.repeat(40)),
  '',
  chalk.bold('GitHub'),
  formatField('Token', status.github.token),
  formatField('Client id', status.github.clientId),
  '',
  chalk.bold('Jira'),
  formatField('Base URL', status.jira.baseUrl),
  formatField('Email', status.jira.email),
  formatField('API token', status.jira.apiToken),
  formatField('Bearer token', status.jira.bearerToken),
  `  Mode: ${status.jira.mode}`,
  '',
].join('\n');

const formatDoctor = (status: AuthStatusReport): string => {
  const checks = [
    {
      label: 'GitHub',
      ready: status.github.token.isSet,
      guidance: status.github.clientId.isSet
        ? 'Run `codexia auth github` to complete browser/device auth.'
        : 'Set `CODEXIA_GITHUB_TOKEN` or run `codexia auth github`.',
    },
    {
      label: 'Jira',
      ready: status.jira.mode === 'basic' || status.jira.mode === 'bearer',
      guidance: 'Set Jira env vars or run `codexia auth jira`.',
    },
  ];

  return [
    '',
    chalk.bold('Auth Doctor'),
    chalk.gray('─'.repeat(40)),
    '',
    ...checks.map((check) => `${check.label}: ${check.ready ? chalk.green('ready') : chalk.yellow('needs setup')}`),
    '',
    ...checks.filter((check) => !check.ready).map((check) => `${check.label}: ${check.guidance}`),
    '',
  ].join('\n');
};

const runSafely = async (
  deps: Required<AuthCommandDeps>,
  command: Command,
  handler: (manager: AuthManagerLike, globalOptions: GlobalOptions) => Promise<void>,
): Promise<void> => {
  try {
    const manager = deps.createManager();
    const globalOptions = getGlobalOptions(command);
    await handler(manager, globalOptions);
  } catch (error) {
    deps.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

export const createAuthCommand = (deps: AuthCommandDeps = {}): Command => {
  const resolvedDeps: Required<AuthCommandDeps> = {
    createManager: deps.createManager || createDefaultManager,
    log: deps.log || console.log,
    error: deps.error || console.error,
  };

  const command = new Command('auth')
    .description('Inspect and manage local CLI authentication')
    .addHelpText('after', `
When to use:
  Use this to inspect, configure, or clear local auth for GitHub and Jira.

Depends on:
  A local keychain for stored credentials. Environment variables always win over stored values.

Examples:
  $ codexia auth status
  $ codexia auth doctor
  $ codexia auth github
  $ codexia auth jira
  $ codexia auth logout github
`);

  command
    .command('status')
    .description('Show local auth status with redacted secrets')
    .action(async (_options, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (manager, globalOptions) => {
        const status = await manager.getStatus();
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(status, null, 2));
          return;
        }

        resolvedDeps.log(formatStatus(status));
      });
    });

  command
    .command('doctor')
    .description('Check auth readiness and show the next setup step')
    .action(async (_options, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (manager, globalOptions) => {
        const status = await manager.getStatus();
        if (isJsonMode(globalOptions)) {
          resolvedDeps.log(JSON.stringify(status, null, 2));
          return;
        }

        resolvedDeps.log(formatDoctor(status));
      });
    });

  command
    .command('github')
    .description('Set up GitHub auth')
    .action(async (_options, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (manager) => {
        const result = await manager.authenticateGitHub({ interactive: true });
        resolvedDeps.log(`GitHub credentials are ready (${result.source}).`);
      });
    });

  command
    .command('jira')
    .description('Set up Jira auth')
    .action(async (_options, commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (manager) => {
        const result = await manager.authenticateJira({ interactive: true });
        resolvedDeps.log(`Jira credentials are ready (${result.source}).`);
      });
    });

  command
    .command('logout')
    .argument('[provider]', 'Provider to clear: github, jira, or all', 'all')
    .description('Remove stored credentials from the local keychain')
    .action(async (provider: 'github' | 'jira' | 'all', commandContext) => {
      await runSafely(resolvedDeps, commandContext, async (manager) => {
        const result = await manager.logout(provider);
        if (provider === 'github') {
          resolvedDeps.log(`Removed stored GitHub credentials (${result.github ? 'keychain' : 'skipped'}).`);
          return;
        }

        if (provider === 'jira') {
          resolvedDeps.log(`Removed stored Jira credentials (${result.jira ? 'keychain' : 'skipped'}).`);
          return;
        }

        resolvedDeps.log('Removed stored credentials from the keychain.');
      });
    });

  return command;
};

export const authCommand = createAuthCommand();
