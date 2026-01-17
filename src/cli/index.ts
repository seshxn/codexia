#!/usr/bin/env node
import { Command } from 'commander';
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

// Interactive wizard
import { runInteractiveWizard } from './interactive.js';

const program = new Command();

program
  .name('codexia')
  .description('Engineering intelligence layer for repositories')
  .version('0.1.0')
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
program.addCommand(mcpServerCommand);

// Wrap in async IIFE for ES module compatibility
(async () => {
  try {
    // If no arguments provided (just 'codexia'), launch interactive wizard
    if (process.argv.length <= 2) {
      await runInteractiveWizard();
    } else {
      await program.parseAsync(process.argv);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
