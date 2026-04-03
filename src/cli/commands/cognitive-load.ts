import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

type CognitiveLoadCommandOptions = {
  path?: string;
  limit?: string;
  maxTemporalFiles?: string;
};

type GlobalCommandOptions = {
  json?: boolean;
};

type CognitiveLoadEngine = {
  getCognitiveLoadMap: (options: {
    path?: string;
    limit?: number;
    maxTemporalFiles?: number;
  }) => Promise<unknown>;
};

type CognitiveLoadCommandDeps = {
  createEngine?: () => CognitiveLoadEngine;
  output?: Pick<Console, 'log' | 'error'>;
};

const parseInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatCognitiveLoadSummary = (report: Awaited<ReturnType<CodexiaEngine['getCognitiveLoadMap']>>): string => {
  const lines: string[] = [
    '',
    'Cognitive Load Map',
    '',
    `Files analyzed: ${report.summary.filesAnalyzed}`,
    `Modules analyzed: ${report.summary.modulesAnalyzed}`,
    `Average score: ${report.summary.averageScore}`,
    `High-load files: ${report.summary.highLoadFiles}`,
  ];

  if (report.files.length > 0) {
    lines.push('', 'Top files:');
    for (const file of report.files.slice(0, 5)) {
      lines.push(`  ${file.path} (${file.score})`);
    }
  }

  if (report.modules.length > 0) {
    lines.push('', 'Top modules:');
    for (const module of report.modules.slice(0, 5)) {
      lines.push(`  ${module.module} (${module.score})`);
    }
  }

  if (report.documentationGaps.length > 0) {
    lines.push('', 'Documentation gaps:');
    for (const gap of report.documentationGaps.slice(0, 5)) {
      lines.push(`  ${gap.path} (${gap.gapScore})`);
    }
  }

  lines.push('');
  return lines.join('\n');
};

export async function runCognitiveLoadCommand(
  options: CognitiveLoadCommandOptions = {},
  globalOpts: GlobalCommandOptions = {},
  deps: CognitiveLoadCommandDeps = {}
): Promise<unknown> {
  const formatter = new Formatter(Boolean(globalOpts.json));
  const output = deps.output || console;

  try {
    const engine = deps.createEngine?.() || new CodexiaEngine();
    const report = await engine.getCognitiveLoadMap({
      path: options.path,
      limit: parseInteger(options.limit),
      maxTemporalFiles: parseInteger(options.maxTemporalFiles),
    });

    if (globalOpts.json) {
      output.log(JSON.stringify(report, null, 2));
      return report;
    }

    output.log(formatCognitiveLoadSummary(report as Awaited<ReturnType<CodexiaEngine['getCognitiveLoadMap']>>));
    return report;
  } catch (error) {
    output.error(formatter.formatError(error as Error));
    process.exit(1);
  }
}

export const cognitiveLoadCommand = new Command('cognitive-load')
  .description('Map local cognitive load hotspots in the current repository')
  .option('--path <path>', 'Restrict analysis to matching paths')
  .option('--limit <n>', 'Limit the number of files returned')
  .option('--max-temporal-files <n>', 'Limit files used for temporal analysis')
  .addHelpText('after', `
Examples:
  $ codexia cognitive-load
  $ codexia cognitive-load --path src/payments
  $ codexia cognitive-load --limit 20
`)
  .action(async (options: CognitiveLoadCommandOptions, command) => {
    const globalOpts = command.parent?.opts() || {};
    await runCognitiveLoadCommand(options, globalOpts);
  });
