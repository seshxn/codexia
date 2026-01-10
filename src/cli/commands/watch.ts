import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

export const watchCommand = new Command('watch')
  .description('Watch for file changes and re-run analysis')
  .option('--signals', 'Run signals analysis on changes')
  .option('--impact', 'Run impact analysis on changes')
  .option('--check', 'Run convention check on changes')
  .addHelpText('after', `
Examples:
  $ codexia watch              Watch and scan on changes
  $ codexia watch --signals    Watch and run signal analysis
  $ codexia watch --impact     Watch and run impact analysis
  $ codexia watch --check      Watch and run convention checks
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);
    const cwd = process.cwd();

    console.log(chalk.blue('👀') + ' Watching for changes...');
    console.log(chalk.gray(`   Directory: ${cwd}`));
    console.log(chalk.gray('   Press Ctrl+C to stop\n'));

    const engine = new CodexiaEngine();
    let debounceTimer: NodeJS.Timeout | null = null;
    let isProcessing = false;

    const runAnalysis = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        const timestamp = new Date().toLocaleTimeString();
        console.log(chalk.gray(`[${timestamp}]`) + ' Change detected, analyzing...\n');

        if (options.signals) {
          const signals = await engine.analyzeSignals({});
          console.log(formatter.formatSignals(signals));
        } else if (options.impact) {
          const impact = await engine.analyzeImpact({});
          const diff = await engine.getDiff();
          console.log(formatter.formatImpact(impact, diff));
        } else if (options.check) {
          const violations = await engine.checkConventions({});
          console.log(formatter.formatConventions(violations));
        } else {
          const result = await engine.scan();
          console.log(formatter.formatScan(result));
        }

        console.log(chalk.gray('Watching for changes...\n'));
      } catch (error) {
        console.error(formatter.formatError(error as Error));
      } finally {
        isProcessing = false;
      }
    };

    // Initial run
    await runAnalysis();

    // Set up file watcher
    const watchDirs = ['src', 'lib', 'app', '.'].filter(dir => {
      try {
        return fs.statSync(path.join(cwd, dir)).isDirectory();
      } catch {
        return false;
      }
    });

    const watchers: fs.FSWatcher[] = [];

    for (const dir of watchDirs) {
      try {
        const watcher = fs.watch(
          path.join(cwd, dir),
          { recursive: true },
          (_eventType, filename) => {
            if (!filename) return;
            
            // Ignore certain files
            if (
              filename.includes('node_modules') ||
              filename.includes('.git') ||
              filename.includes('dist') ||
              filename.endsWith('.log')
            ) {
              return;
            }

            // Debounce
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(runAnalysis, 300);
          }
        );
        watchers.push(watcher);
      } catch {
        // Directory doesn't exist or can't be watched
      }
    }

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n' + chalk.yellow('Stopping watch mode...'));
      for (const watcher of watchers) {
        watcher.close();
      }
      process.exit(0);
    });
  });
