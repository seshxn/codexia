import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { CodexiaEngine } from './engine.js';
import { Formatter } from './formatter.js';
import { Visualizer } from '../modules/visualizer.js';

interface CommandOption {
  name: string;
  value: string;
  description: string;
}

interface CommandCategory {
  name: string;
  value: string;
  description: string;
  commands: CommandOption[];
}

const categories: CommandCategory[] = [
  {
    name: '🔍 Analyze Repository',
    value: 'analyze',
    description: 'Scan, index, and analyze your codebase',
    commands: [
      { name: 'scan', value: 'scan', description: 'Scan and index the repository' },
      { name: 'graph', value: 'graph', description: 'Visualize dependency graph' },
      { name: 'complexity', value: 'complexity', description: 'Analyze code complexity' },
      { name: 'hotpaths', value: 'hotpaths', description: 'Find frequently changed files' },
      { name: 'history', value: 'history', description: 'Analyze git history patterns' },
    ],
  },
  {
    name: '📊 Generate Reports',
    value: 'reports',
    description: 'Create reports and changelogs',
    commands: [
      { name: 'impact', value: 'impact', description: 'Analyze change impact' },
      { name: 'pr-report', value: 'pr-report', description: 'Generate PR summary report' },
      { name: 'changelog', value: 'changelog', description: 'Generate changelog from commits' },
      { name: 'signals', value: 'signals', description: 'Show engineering signals' },
    ],
  },
  {
    name: '🛡️ Quality & Invariants',
    value: 'quality',
    description: 'Check code quality and architectural rules',
    commands: [
      { name: 'check', value: 'check', description: 'Run convention checks' },
      { name: 'invariants', value: 'invariants', description: 'Verify architectural invariants' },
    ],
  },
  {
    name: '🧪 Testing',
    value: 'testing',
    description: 'Test prioritization and suggestions',
    commands: [
      { name: 'tests', value: 'tests', description: 'Prioritize and suggest tests' },
    ],
  },
  {
    name: '⚙️ Setup & Tools',
    value: 'setup',
    description: 'Initialize and configure Codexia',
    commands: [
      { name: 'init', value: 'init', description: 'Initialize Codexia configuration' },
      { name: 'watch', value: 'watch', description: 'Watch for file changes' },
      { name: 'monorepo', value: 'monorepo', description: 'Analyze monorepo structure' },
      { name: 'mcp-server', value: 'mcp-server', description: 'Start MCP server for AI tools' },
    ],
  },
];

function printBanner(): void {
  console.log();
  console.log(chalk.cyan.bold('  🔮 Codexia'));
  console.log(chalk.dim('  Engineering Intelligence Layer'));
  console.log();
}

async function selectCategory(): Promise<string> {
  return select({
    message: 'What would you like to do?',
    choices: categories.map((cat) => ({
      name: `${cat.name} ${chalk.dim('- ' + cat.description)}`,
      value: cat.value,
    })),
  });
}

async function selectCommand(categoryValue: string): Promise<string> {
  const category = categories.find((c) => c.value === categoryValue);
  if (!category) throw new Error('Invalid category');

  return select({
    message: 'Choose a command:',
    choices: [
      ...category.commands.map((cmd) => ({
        name: `${chalk.green(cmd.name.padEnd(12))} ${chalk.dim(cmd.description)}`,
        value: cmd.value,
      })),
      { name: chalk.yellow('← Back'), value: 'back' },
    ],
  });
}

async function getCommandOptions(command: string): Promise<Record<string, unknown>> {
  const options: Record<string, unknown> = {};

  // Command-specific prompts
  switch (command) {
    case 'impact':
      options.staged = await confirm({
        message: 'Analyze staged changes only?',
        default: false,
      });
      break;

    case 'graph':
      options.file = await input({
        message: 'File to analyze (leave empty for full graph):',
        default: '',
      });
      break;

    case 'changelog':
      options.from = await input({
        message: 'From ref (tag/commit, leave empty for auto-detect):',
        default: '',
      });
      options.to = await input({
        message: 'To ref (leave empty for HEAD):',
        default: 'HEAD',
      });
      break;

    case 'history':
      options.file = await input({
        message: 'File to analyze (leave empty for full repo):',
        default: '',
      });
      break;

    case 'complexity':
      options.file = await input({
        message: 'File or directory (leave empty for full repo):',
        default: '',
      });
      break;
  }

  // Ask about output format for most commands
  const formatCommands = ['scan', 'impact', 'complexity', 'signals', 'tests', 'hotpaths', 'invariants'];
  if (formatCommands.includes(command)) {
    const wantsJson = await confirm({
      message: 'Output as JSON?',
      default: false,
    });
    if (wantsJson) {
      options.json = true;
    }
  }

  return options;
}

async function executeCommand(command: string, options: Record<string, unknown>): Promise<void> {
  const formatter = new Formatter(options.json as boolean);
  const engine = new CodexiaEngine();

  console.log();
  console.log(chalk.dim(`Running: codexia ${command}${options.json ? ' --json' : ''}`));
  console.log();

  try {
    switch (command) {
      case 'scan': {
        console.log('Scanning repository...');
        const result = await engine.scan();
        console.log(formatter.formatScan(result));
        break;
      }

      case 'impact': {
        const staged = (options.staged as boolean) || false;
        console.log(`Analyzing impact${staged ? ' (staged changes)' : ''}...`);
        const diff = staged ? await engine.getStagedDiff() : await engine.getDiff();
        const result = await engine.analyzeImpact({ staged });
        console.log(formatter.formatImpact(result, diff));
        break;
      }

      case 'signals': {
        console.log('Analyzing signals...');
        const result = await engine.analyzeSignals();
        console.log(formatter.formatSignals(result));
        break;
      }

      case 'check': {
        console.log('Running convention checks...');
        const result = await engine.checkConventions();
        console.log(formatter.formatConventions(result));
        break;
      }

      case 'tests': {
        console.log('Suggesting tests...');
        const result = await engine.suggestTests();
        console.log(formatter.formatTests(result));
        break;
      }

      case 'graph': {
        const file = (options.file as string) || undefined;
        console.log('Generating dependency graph...');
        await engine.initialize();
        const rawData = await engine.getGraphData(file);
        
        // Transform engine's format to Visualizer's expected format
        const nodeMap = new Map<string, { path: string; imports: string[]; importedBy: string[]; depth: number }>();
        
        // Initialize all nodes
        for (const node of rawData.nodes) {
          nodeMap.set(node.id, { path: node.id, imports: [], importedBy: [], depth: 0 });
        }
        
        // Build imports/importedBy from edges
        for (const edge of rawData.edges) {
          const fromNode = nodeMap.get(edge.from);
          const toNode = nodeMap.get(edge.to);
          if (fromNode) fromNode.imports.push(edge.to);
          if (toNode) toNode.importedBy.push(edge.from);
        }
        
        const nodes = Array.from(nodeMap.values());
        const rootNodes = nodes.filter(n => n.importedBy.length === 0).map(n => n.path);
        const leafNodes = nodes.filter(n => n.imports.length === 0).map(n => n.path);
        
        // Transform edges to include 'kind'
        const edges = rawData.edges.map((e: { from: string; to: string }) => ({
          from: e.from,
          to: e.to,
          kind: 'static' as const,
        }));
        
        const graphData = {
          nodes,
          edges,
          rootNodes,
          leafNodes,
        };
        
        const visualizer = new Visualizer();
        const output = visualizer.visualize(graphData, {
          format: 'ascii',
          depth: 5,
          direction: 'TB',
        });
        console.log(output);
        break;
      }

      case 'complexity': {
        const file = (options.file as string) || undefined;
        console.log('Analyzing complexity...');
        const result = await engine.analyzeComplexity(file);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatComplexityResult(result);
        }
        break;
      }

      case 'history': {
        const file = (options.file as string) || undefined;
        console.log('Analyzing history...');
        const result = await engine.analyzeHistory({ file });
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatHistoryResult(result);
        }
        break;
      }

      case 'invariants': {
        console.log('Checking invariants...');
        const result = await engine.checkInvariants();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatInvariantsResult(result);
        }
        break;
      }

      case 'hotpaths': {
        console.log('Finding hot paths...');
        const result = await engine.analyzeHotPaths();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatHotPathsResult(result);
        }
        break;
      }

      case 'changelog': {
        let from = (options.from as string) || undefined;
        const to = (options.to as string) || 'HEAD';
        console.log('Generating changelog...');
        
        // Auto-detect from ref if not provided
        if (!from) {
          const latestTag = await engine.getLatestTag();
          if (latestTag) {
            from = latestTag;
            console.log(chalk.dim(`Using latest tag: ${latestTag}`));
          } else {
            // Get the root commit as fallback
            const { simpleGit } = await import('simple-git');
            const git = simpleGit(process.cwd());
            try {
              const rootCommit = await git.raw(['rev-list', '--max-parents=0', 'HEAD']);
              from = rootCommit.trim();
              console.log(chalk.dim('No tags found, showing all commits'));
            } catch {
              from = 'HEAD~3';
              console.log(chalk.dim('Using last 3 commits'));
            }
          }
        }
        
        try {
          const result = await engine.generateChangelog({ from, to });
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            formatChangelogResult(result);
          }
        } catch (err) {
          // Fallback if the ref doesn't work
          console.log(chalk.yellow('Could not generate changelog. Try specifying a valid --from ref.'));
        }
        break;
      }

      case 'monorepo': {
        console.log('Analyzing monorepo...');
        const result = await engine.analyzeMonorepo();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatMonorepoResult(result);
        }
        break;
      }

      case 'pr-report': {
        console.log('Generating PR report...');
        const result = await engine.generatePrReport();
        console.log(formatter.formatPrReport(result));
        break;
      }

      case 'init': {
        console.log('Initializing Codexia...');
        // Create default invariants file
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const invariantsPath = path.join(process.cwd(), 'codexia.invariants.yaml');
        const defaultContent = `# Codexia Invariants Configuration
# Define architectural rules and boundaries

rules:
  - id: no-circular-imports
    description: Prevent circular dependencies
    severity: error
    pattern: circular-dependency

  - id: layer-boundaries
    description: Enforce layer separation
    severity: warning
    from: "src/core/**"
    cannotImport: "src/cli/**"
`;
        try {
          await fs.access(invariantsPath);
          console.log(chalk.yellow('⚠ codexia.invariants.yaml already exists'));
        } catch {
          await fs.writeFile(invariantsPath, defaultContent);
          console.log(chalk.green('✓ Created codexia.invariants.yaml'));
        }
        break;
      }

      case 'watch': {
        console.log(chalk.blue('👀') + ' Starting watch mode...');
        console.log(chalk.dim('   Directory: ' + process.cwd()));
        console.log(chalk.yellow('   Press Ctrl+C to stop\n'));
        // Watch command runs indefinitely, better to redirect to CLI
        console.log(chalk.dim('Tip: For watch mode, run `codexia watch` directly in terminal.'));
        break;
      }

      case 'mcp-server': {
        console.log('Starting MCP server...');
        console.log(chalk.dim('This will start an MCP server for AI tool integration.'));
        console.log(chalk.dim('Tip: For MCP server, run `codexia mcp-server` directly in terminal.'));
        break;
      }

      default:
        console.log(chalk.yellow(`Command '${command}' not yet implemented in interactive mode.`));
        console.log(chalk.dim(`Try running: codexia ${command}`));
    }
  } catch (error) {
    console.error(formatter.formatError(error as Error));
  }
}

// Helper formatters for commands without dedicated formatter methods
function formatComplexityResult(result: any): void {
  console.log();
  console.log(chalk.bold('Complexity Analysis'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(`  Files analyzed: ${chalk.cyan(result.summary.totalFiles)}`);
  console.log(`  Avg maintainability: ${chalk.cyan(result.summary.averageMaintainability.toFixed(1))}`);
  console.log(`  Files needing attention: ${chalk.yellow(result.summary.filesNeedingAttention)}`);
  console.log(`  Critical files: ${chalk.red(result.summary.criticalFiles)}`);
  console.log();
  
  if (result.recommendations.length > 0) {
    console.log(chalk.bold('Recommendations'));
    for (const rec of result.recommendations) {
      console.log(`  ${chalk.yellow('→')} ${rec}`);
    }
    console.log();
  }
}

function formatHistoryResult(result: any): void {
  console.log();
  console.log(chalk.bold('History Analysis'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(`  Files analyzed: ${chalk.cyan(result.summary.filesAnalyzed)}`);
  console.log(`  Hotspots: ${chalk.yellow(result.summary.hotspotCount)}`);
  console.log(`  Risk files: ${chalk.red(result.summary.riskFileCount)}`);
  console.log(`  Stale files: ${chalk.gray(result.summary.staleFileCount)}`);
  console.log();
}

function formatInvariantsResult(result: any): void {
  console.log();
  if (result.passed) {
    console.log(chalk.green('✓') + ' All invariants passed');
  } else {
    console.log(chalk.red('✗') + ' Invariant violations found');
  }
  console.log();
  console.log(`  Rules checked: ${chalk.cyan(result.rulesChecked)}`);
  console.log(`  Rules passed: ${chalk.green(result.passedRules)}`);
  console.log(`  Violations: ${result.violations.length > 0 ? chalk.red(result.violations.length) : chalk.green(0)}`);
  console.log();

  if (result.violations.length > 0) {
    console.log(chalk.bold('Violations'));
    for (const v of result.violations.slice(0, 10)) {
      const icon = v.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
      console.log(`  ${icon} ${v.message}`);
      console.log(chalk.gray(`    ${v.file}:${v.line || 0}`));
    }
    if (result.violations.length > 10) {
      console.log(chalk.gray(`  ... and ${result.violations.length - 10} more`));
    }
    console.log();
  }
}

function formatHotPathsResult(result: any): void {
  console.log();
  console.log(chalk.bold('Hot Paths Analysis'));
  console.log(chalk.gray('═'.repeat(50)));
  console.log(`  Total paths: ${chalk.cyan(result.summary.totalPaths)}`);
  console.log(`  Critical: ${chalk.red(result.summary.criticalPaths)}`);
  console.log(`  High: ${chalk.yellow(result.summary.highPaths)}`);
  console.log(`  Medium: ${chalk.blue(result.summary.mediumPaths)}`);
  console.log();
}

function formatChangelogResult(result: any): void {
  console.log();
  console.log(chalk.bold('Generated Changelog'));
  console.log(chalk.gray('═'.repeat(50)));
  
  // Handle the actual ChangelogEntry structure
  if (result.stats) {
    console.log(`  ${chalk.cyan(result.stats.commits)} commits | ${chalk.green('+' + result.stats.additions)} ${chalk.red('-' + result.stats.deletions)}`);
    if (result.stats.contributors.length > 0) {
      console.log(`  Contributors: ${result.stats.contributors.join(', ')}`);
    }
    console.log();
  }
  
  if (result.sections && result.sections.length > 0) {
    for (const section of result.sections) {
      if (section.items.length > 0) {
        console.log(chalk.bold(`  ${section.title || section.type}`));
        for (const item of section.items.slice(0, 10)) {
          const breaking = item.breaking ? chalk.red(' [BREAKING]') : '';
          console.log(`    ${chalk.gray('•')} ${item.description || item.message}${breaking}`);
        }
        if (section.items.length > 10) {
          console.log(chalk.gray(`    ... and ${section.items.length - 10} more`));
        }
        console.log();
      }
    }
  } else if (result.entries && result.entries.length > 0) {
    // Fallback for older format
    for (const entry of result.entries.slice(0, 20)) {
      console.log(`  ${chalk.gray('•')} ${entry.message || entry.description}`);
    }
  } else {
    console.log(chalk.gray('  No changelog entries found'));
  }
  console.log();
}

function formatMonorepoResult(result: any): void {
  console.log();
  console.log(chalk.bold('Monorepo Analysis'));
  console.log(chalk.gray('═'.repeat(50)));
  
  if (!result.type) {
    console.log(chalk.yellow('  This does not appear to be a monorepo'));
    console.log();
    return;
  }
  
  console.log(`  Type: ${chalk.cyan(result.type)}`);
  console.log(`  Packages: ${chalk.cyan(result.packages?.length || 0)}`);
  console.log(`  Internal deps: ${chalk.cyan(result.summary?.internalDeps || 0)}`);
  console.log(`  Shared deps: ${chalk.cyan(result.summary?.sharedDeps || 0)}`);
  console.log();

  if (result.packages && result.packages.length > 0) {
    console.log(chalk.bold('Packages'));
    for (const pkg of result.packages.slice(0, 10)) {
      console.log(`  ${chalk.gray('•')} ${pkg.name || pkg}`);
    }
    if (result.packages.length > 10) {
      console.log(chalk.gray(`  ... and ${result.packages.length - 10} more`));
    }
    console.log();
  }
}

export async function runInteractiveWizard(): Promise<void> {
  printBanner();

  let running = true;

  while (running) {
    try {
      const category = await selectCategory();
      const command = await selectCommand(category);

      if (command === 'back') {
        continue;
      }

      const options = await getCommandOptions(command);
      await executeCommand(command, options);

      console.log();
      const again = await confirm({
        message: 'Run another command?',
        default: true,
      });

      if (!again) {
        running = false;
      }

      console.log();
    } catch (error) {
      // User pressed Ctrl+C or escaped
      if ((error as Error).name === 'ExitPromptError') {
        running = false;
      } else {
        throw error;
      }
    }
  }

  console.log(chalk.dim('Goodbye! 👋'));
}

// Quick command for direct access without category selection
export async function runQuickCommand(): Promise<void> {
  printBanner();

  const allCommands = categories.flatMap((cat) =>
    cat.commands.map((cmd) => ({
      name: `${chalk.green(cmd.name.padEnd(12))} ${chalk.dim(cmd.description)}`,
      value: cmd.value,
    }))
  );

  try {
    const command = await select({
      message: 'Choose a command:',
      choices: allCommands,
    });

    const options = await getCommandOptions(command);
    await executeCommand(command, options);
  } catch (error) {
    if ((error as Error).name !== 'ExitPromptError') {
      throw error;
    }
  }
}
