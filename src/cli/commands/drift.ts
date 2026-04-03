import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';

type DriftCommandOptions = {
  commits?: string;
};

type GlobalCommandOptions = {
  json?: boolean;
};

type DriftEngine = {
  analyzeDrift: (options: { commits: number }) => Promise<unknown>;
};

type DriftCommandDeps = {
  createEngine?: () => DriftEngine;
  output?: Pick<Console, 'log' | 'error'>;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDriftSummary = (report: Awaited<ReturnType<CodexiaEngine['analyzeDrift']>>): string => {
  const lines: string[] = [
    '',
    'Drift Radar',
    '',
    `Composite score: ${report.composite.score}`,
    `Trajectory direction: ${report.trajectory.velocity.direction}`,
    `Trajectory delta: ${report.trajectory.velocity.delta}`,
    '',
    'Components:',
    `  Boundary:   ${report.components.boundary.score} (${report.components.boundary.violationCount} signals)`,
    `  Naming:     ${report.components.naming.score} (${report.components.naming.violationCount} signals)`,
    `  Structural: ${report.components.structural.score} (${report.components.structural.violationCount} signals)`,
    `  Dependency: ${report.components.dependency.score} (${report.components.dependency.violationCount} signals)`,
  ];

  if (report.heatmap.layers.length > 0) {
    lines.push('', 'Layer heatmap:');
    for (const layer of report.heatmap.layers) {
      lines.push(`  ${layer.layer}: ${layer.score} (${layer.violations} violations across ${layer.files} files)`);
    }
  }

  if (report.emergentConventions.length > 0) {
    lines.push('', 'Emergent conventions:');
    for (const candidate of report.emergentConventions) {
      lines.push(`  ${candidate.pattern} (${candidate.confidence.toFixed(2)} confidence)`);
    }
  }

  lines.push('');
  return lines.join('\n');
};

export async function runDriftCommand(
  options: DriftCommandOptions = {},
  globalOpts: GlobalCommandOptions = {},
  deps: DriftCommandDeps = {}
): Promise<unknown> {
  const formatter = new Formatter(Boolean(globalOpts.json));
  const output = deps.output || console;

  try {
    const engine = deps.createEngine?.() || new CodexiaEngine();
    const report = await engine.analyzeDrift({ commits: parseInteger(options.commits, 20) });

    if (globalOpts.json) {
      output.log(JSON.stringify(report, null, 2));
      return report;
    }

    output.log(formatDriftSummary(report as Awaited<ReturnType<CodexiaEngine['analyzeDrift']>>));
    return report;
  } catch (error) {
    output.error(formatter.formatError(error as Error));
    process.exit(1);
  }
}

export const driftCommand = new Command('drift')
  .description('Analyze architectural drift in the current repository')
  .option('--commits <n>', 'Number of recent commits to inspect', '20')
  .addHelpText('after', `
Examples:
  $ codexia drift
  $ codexia drift --commits 10
`)
  .action(async (options: DriftCommandOptions, command) => {
    const globalOpts = command.parent?.opts() || {};
    await runDriftCommand(options, globalOpts);
  });
