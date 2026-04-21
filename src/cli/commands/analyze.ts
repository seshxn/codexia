import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import { createLargeRepoFixture } from '../../core/fixtures/large-repo-fixture.js';
import { runIndexBenchmark } from '../../core/index-benchmark.js';

const parsePositiveInt = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
};

export const analyzeCommand = new Command('analyze')
  .description('Index the current repository for later status and update checks')
  .option('--fast', 'Compatibility flag; uses the standard analyze path')
  .option('-f, --force', 'Force a full re-index')
  .option('--benchmark', 'Run an opt-in indexing benchmark')
  .option('--fixture-files <count>', 'Generate a temporary benchmark fixture with this many files')
  .option('--fixture-fanout <count>', 'Imports per generated fixture file', '2')
  .option('--fixture-symbols <count>', 'Exported functions per generated fixture file', '2')
  .option('--benchmark-output <path>', 'Write benchmark JSON to this path')
  .addHelpText('after', `
When to use:
  Run this after cloning a repository or when you need a fresh local index.

Depends on:
  A repository checkout in the current directory.

Usually next:
  Run \`codexia status\` to confirm the index, or \`codexia update\` after code changes.

Notes:
  \`--fast\` does not change the analyze engine path; it only keeps the command-line shape stable.

Examples:
  $ codexia analyze
  $ codexia analyze --fast
  $ codexia analyze --force
  $ codexia analyze --benchmark --fixture-files 10000 --benchmark-output .codexia/codegraph/bench-10k.json
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      if (options.benchmark) {
        const originalCwd = process.cwd();
        let benchmarkRoot = originalCwd;
        let cleanupRoot: string | undefined;
        let changedFiles: string[] = [];
        let contextFile: string | undefined;

        try {
          if (options.fixtureFiles) {
            const files = parsePositiveInt(options.fixtureFiles, '--fixture-files');
            const fanout = parsePositiveInt(options.fixtureFanout, '--fixture-fanout');
            const symbolsPerFile = parsePositiveInt(options.fixtureSymbols, '--fixture-symbols');
            benchmarkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-benchmark-'));
            cleanupRoot = benchmarkRoot;
            await createLargeRepoFixture(benchmarkRoot, {
              files,
              fanout,
              symbolsPerFile,
              language: 'typescript',
            });
            contextFile = files > 1 ? 'src/module-0001.ts' : 'src/module-0000.ts';
            changedFiles = [contextFile];
          }

          const result = await runIndexBenchmark(benchmarkRoot, {
            query: 'module function',
            contextFile,
            changedFiles,
          });

          if (options.benchmarkOutput) {
            const outputPath = path.resolve(originalCwd, options.benchmarkOutput);
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
          }

          console.log(formatter.formatIndexBenchmark(result));
        } finally {
          if (cleanupRoot) {
            await fs.rm(cleanupRoot, { recursive: true, force: true });
          }
        }
        return;
      }

      const engine = new CodexiaEngine();
      const result = await engine.analyzeRepository({ force: Boolean(options.force) });

      if (options.fast && !globalOpts.json) {
        console.log('Fast mode selected: using the existing structural index pipeline.');
      }

      console.log(formatter.formatScan(result));
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
