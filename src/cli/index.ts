import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { impactCommand } from './commands/impact.js';
import { checkCommand } from './commands/check.js';
import { testsCommand } from './commands/tests.js';
import { prReportCommand } from './commands/pr-report.js';
import { signalsCommand } from './commands/signals.js';
import { initCommand } from './commands/init.js';
import { watchCommand } from './commands/watch.js';

const program = new Command();

program
  .name('codexia')
  .description('Engineering intelligence layer for repositories')
  .version('0.1.0')
  .option('--json', 'Output results as JSON')
  .option('--format <format>', 'Output format: text, json, or markdown', 'text')
  .option('-v, --verbose', 'Verbose output');

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(impactCommand);
program.addCommand(checkCommand);
program.addCommand(testsCommand);
program.addCommand(signalsCommand);
program.addCommand(prReportCommand);
program.addCommand(watchCommand);

// Wrap in async IIFE for ES module compatibility
(async () => {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
