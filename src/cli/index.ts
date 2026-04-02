#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanCommand } from './commands/scan.js';
import { impactCommand } from './commands/impact.js';
import { checkCommand } from './commands/check.js';
import { testsCommand } from './commands/tests.js';
import { prReportCommand } from './commands/pr-report.js';
import { signalsCommand } from './commands/signals.js';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';

// New commands
import { graphCommand } from './commands/graph.js';
import { complexityCommand } from './commands/complexity.js';
import { historyCommand } from './commands/history.js';
import { invariantsCommand } from './commands/invariants.js';
import { hotpathsCommand } from './commands/hotpaths.js';
import { changelogCommand } from './commands/changelog.js';
import { monorepoCommand } from './commands/monorepo.js';
import { mcpServerCommand } from './commands/mcp-server.js';
import { dashboardCommand } from './commands/dashboard.js';
import { analyzeCommand } from './commands/analyze.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';
import { listCommand } from './commands/list.js';
import { cleanCommand } from './commands/clean.js';
import { setupCommand } from './commands/setup.js';
import { serveCommand } from './commands/serve.js';

// Interactive wizard
import { runInteractiveWizard } from './interactive.js';

const loadEnvFiles = (): void => {
  if (process.env.CODEXIA_SKIP_ENV_FILE === 'true') {
    return;
  }

  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  const cwd = process.cwd();
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.join(cwd, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      process.loadEnvFile(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[codexia] Failed to load ${fileName}: ${message}`);
    }
  }
};

type PackageMetadata = {
  version: string;
};

const packageJsonPath = new URL('../../package.json', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageMetadata;

export const cliVersion = packageJson.version;

const resolveRealPath = (value: string): string => {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
};

export const shouldRunCli = (argv1: string | undefined, moduleUrl: string = import.meta.url): boolean => {
  if (argv1 === undefined) {
    return false;
  }

  return resolveRealPath(argv1) === resolveRealPath(fileURLToPath(moduleUrl));
};

export const createCliProgram = (): Command => {
  const program = new Command();

  program
    .name('codexia')
    .description('Engineering intelligence layer for repositories')
    .version(cliVersion)
    .option('--json', 'Output results as JSON')
    .option('--format <format>', 'Output format: text, json, or markdown', 'text')
    .option('-v, --verbose', 'Verbose output');

  // Core commands
  program.addCommand(initCommand);
  program.addCommand(scanCommand);
  program.addCommand(impactCommand);
  program.addCommand(checkCommand);
  program.addCommand(testsCommand);
  program.addCommand(signalsCommand);
  program.addCommand(prReportCommand);
  program.addCommand(watchCommand);

  // Advanced analysis commands
  program.addCommand(graphCommand);
  program.addCommand(complexityCommand);
  program.addCommand(historyCommand);
  program.addCommand(invariantsCommand);
  program.addCommand(hotpathsCommand);
  program.addCommand(changelogCommand);
  program.addCommand(monorepoCommand);
  program.addCommand(dashboardCommand);
  program.addCommand(analyzeCommand);
  program.addCommand(updateCommand);
  program.addCommand(statusCommand);
  program.addCommand(listCommand);
  program.addCommand(cleanCommand);
  program.addCommand(setupCommand);
  program.addCommand(serveCommand);
  program.addCommand(mcpServerCommand, { hidden: true });

  return program;
};

export const runCli = async (argv: string[] = process.argv): Promise<void> => {
  loadEnvFiles();
  const program = createCliProgram();

  try {
    if (argv.length <= 2) {
      await runInteractiveWizard();
    } else {
      await program.parseAsync(argv);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

const isDirectExecution = shouldRunCli(process.argv[1], import.meta.url);

if (isDirectExecution) {
  void runCli();
}
