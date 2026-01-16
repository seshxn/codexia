import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import { Visualizer } from '../../modules/visualizer.js';

export const graphCommand = new Command('graph')
  .description('Visualize dependency graph')
  .argument('[file]', 'File to show graph for (optional)')
  .option('-f, --format <format>', 'Output format: ascii, mermaid, dot, json', 'ascii')
  .option('-d, --depth <depth>', 'Maximum depth to traverse', '5')
  .option('--direction <dir>', 'Graph direction: TB, LR, BT, RL', 'TB')
  .option('--show-orphans', 'Include orphan modules')
  .option('--highlight <files>', 'Comma-separated files to highlight')
  .addHelpText('after', `
Examples:
  $ codexia graph                           Show full dependency graph
  $ codexia graph src/core/types.ts         Show graph for specific file
  $ codexia graph --format mermaid          Output as Mermaid diagram
  $ codexia graph --format dot > graph.dot  Export for Graphviz
  $ codexia graph --highlight src/api.ts    Highlight specific files
`)
  .action(async (file, options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      await engine.initialize();

      const graphData = await engine.getGraphData(file);
      const visualizer = new Visualizer();

      const output = visualizer.visualize(graphData, {
        format: options.format,
        depth: parseInt(options.depth),
        direction: options.direction,
        showOrphans: options.showOrphans,
        highlight: options.highlight?.split(','),
      });

      console.log(output);
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
