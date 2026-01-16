import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import ora from 'ora';
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
  icon: string;
  commands: CommandOption[];
}

const categories: CommandCategory[] = [
  {
    name: 'Analyze Repository',
    value: 'analyze',
    description: 'Scan, index, and analyze your codebase',
    icon: '🔍',
    commands: [
      { name: 'scan', value: 'scan', description: 'Scan and index the repository' },
      { name: 'graph', value: 'graph', description: 'Visualize dependency graph' },
      { name: 'complexity', value: 'complexity', description: 'Analyze code complexity' },
      { name: 'hotpaths', value: 'hotpaths', description: 'Find frequently changed files' },
      { name: 'history', value: 'history', description: 'Analyze git history patterns' },
    ],
  },
  {
    name: 'Generate Reports',
    value: 'reports',
    description: 'Create reports and changelogs',
    icon: '📊',
    commands: [
      { name: 'impact', value: 'impact', description: 'Analyze change impact' },
      { name: 'pr-report', value: 'pr-report', description: 'Generate PR summary report' },
      { name: 'changelog', value: 'changelog', description: 'Generate changelog from commits' },
      { name: 'signals', value: 'signals', description: 'Show engineering signals' },
    ],
  },
  {
    name: 'Quality & Invariants',
    value: 'quality',
    description: 'Check code quality and architectural rules',
    icon: '🛡️',
    commands: [
      { name: 'check', value: 'check', description: 'Run convention checks' },
      { name: 'invariants', value: 'invariants', description: 'Verify architectural invariants' },
    ],
  },
  {
    name: 'Testing',
    value: 'testing',
    description: 'Test prioritization and suggestions',
    icon: '🧪',
    commands: [
      { name: 'tests', value: 'tests', description: 'Prioritize and suggest tests' },
    ],
  },
  {
    name: 'Setup & Tools',
    value: 'setup',
    description: 'Initialize and configure Codexia',
    icon: '⚙️',
    commands: [
      { name: 'init', value: 'init', description: 'Initialize Codexia configuration' },
      { name: 'watch', value: 'watch', description: 'Watch for file changes' },
      { name: 'monorepo', value: 'monorepo', description: 'Analyze monorepo structure' },
      { name: 'mcp-server', value: 'mcp-server', description: 'Start MCP server for AI tools' },
    ],
  },
];

// Custom gradient for Codexia branding
const codexiaGradient = gradient(['#6366f1', '#8b5cf6', '#a855f7']);

function printBanner(): void {
  const logo = `
   ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗██╗ █████╗ 
  ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝██║██╔══██╗
  ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ██║███████║
  ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ██║██╔══██║
  ╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗██║██║  ██║
   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝`;

  console.log();
  console.log(codexiaGradient(logo));
  console.log();
  
  const tagline = boxen(
    chalk.white('🧠 Engineering Intelligence Layer'),
    {
      padding: { left: 2, right: 2, top: 0, bottom: 0 },
      borderStyle: 'round',
      borderColor: 'magenta',
      dimBorder: true,
    }
  );
  console.log(tagline);
  console.log();
}

async function selectCategory(): Promise<string> {
  return select({
    message: chalk.bold('What would you like to do?'),
    choices: categories.map((cat) => ({
      name: `${cat.icon}  ${chalk.bold(cat.name.padEnd(22))} ${chalk.gray('│')} ${chalk.dim(cat.description)}`,
      value: cat.value,
    })),
  });
}

async function selectCommand(categoryValue: string): Promise<string> {
  const category = categories.find((c) => c.value === categoryValue);
  if (!category) throw new Error('Invalid category');

  console.log();
  console.log(chalk.dim(`  ${category.icon} ${category.name}`));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  return select({
    message: chalk.bold('Choose a command:'),
    choices: [
      ...category.commands.map((cmd) => ({
        name: `  ${chalk.cyan('▸')} ${chalk.white.bold(cmd.name.padEnd(14))} ${chalk.dim(cmd.description)}`,
        value: cmd.value,
      })),
      { name: `  ${chalk.yellow('◀')} ${chalk.yellow('Back to categories')}`, value: 'back' },
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

function createSpinner(text: string) {
  return ora({
    text,
    spinner: 'dots',
    color: 'magenta',
  });
}

async function executeCommand(command: string, options: Record<string, unknown>): Promise<void> {
  const formatter = new Formatter(options.json as boolean);
  const engine = new CodexiaEngine();

  console.log();
  console.log(
    boxen(
      chalk.dim(`codexia ${command}${options.json ? ' --json' : ''}`),
      {
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'gray',
        dimBorder: true,
      }
    )
  );
  console.log();

  try {
    switch (command) {
      case 'scan': {
        const spinner = createSpinner('Scanning repository...').start();
        const result = await engine.scan();
        spinner.succeed(chalk.green('Scan complete'));
        console.log();
        console.log(formatter.formatScan(result));
        break;
      }

      case 'impact': {
        const staged = (options.staged as boolean) || false;
        const spinner = createSpinner(`Analyzing impact${staged ? ' (staged changes)' : ''}...`).start();
        const diff = staged ? await engine.getStagedDiff() : await engine.getDiff();
        const result = await engine.analyzeImpact({ staged });
        spinner.succeed(chalk.green('Impact analysis complete'));
        console.log();
        console.log(formatter.formatImpact(result, diff));
        break;
      }

      case 'signals': {
        const spinner = createSpinner('Analyzing signals...').start();
        const result = await engine.analyzeSignals();
        spinner.succeed(chalk.green('Signal analysis complete'));
        console.log();
        console.log(formatter.formatSignals(result));
        break;
      }

      case 'check': {
        const spinner = createSpinner('Running convention checks...').start();
        const result = await engine.checkConventions();
        spinner.succeed(chalk.green('Convention check complete'));
        console.log();
        console.log(formatter.formatConventions(result));
        break;
      }

      case 'tests': {
        const spinner = createSpinner('Suggesting tests...').start();
        const result = await engine.suggestTests();
        spinner.succeed(chalk.green('Test suggestions ready'));
        console.log();
        console.log(formatter.formatTests(result));
        break;
      }

      case 'graph': {
        const file = (options.file as string) || undefined;
        const spinner = createSpinner('Generating dependency graph...').start();
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
        
        spinner.succeed(chalk.green('Graph generated'));
        console.log();
        
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
        const spinner = createSpinner('Analyzing complexity...').start();
        const result = await engine.analyzeComplexity(file);
        spinner.succeed(chalk.green('Complexity analysis complete'));
        console.log();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatComplexityResult(result);
        }
        break;
      }

      case 'history': {
        const file = (options.file as string) || undefined;
        const spinner = createSpinner('Analyzing git history...').start();
        const result = await engine.analyzeHistory({ file });
        spinner.succeed(chalk.green('History analysis complete'));
        console.log();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatHistoryResult(result);
        }
        break;
      }

      case 'invariants': {
        const spinner = createSpinner('Checking architectural invariants...').start();
        const result = await engine.checkInvariants();
        spinner.succeed(chalk.green('Invariants check complete'));
        console.log();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatInvariantsResult(result);
        }
        break;
      }

      case 'hotpaths': {
        const spinner = createSpinner('Finding hot paths...').start();
        const result = await engine.analyzeHotPaths();
        spinner.succeed(chalk.green('Hot path analysis complete'));
        console.log();
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
        const spinner = createSpinner('Generating changelog...').start();
        
        // Auto-detect from ref if not provided
        if (!from) {
          const latestTag = await engine.getLatestTag();
          if (latestTag) {
            from = latestTag;
            spinner.text = `Using latest tag: ${latestTag}`;
          } else {
            // Get the root commit as fallback
            const { simpleGit } = await import('simple-git');
            const git = simpleGit(process.cwd());
            try {
              const rootCommit = await git.raw(['rev-list', '--max-parents=0', 'HEAD']);
              from = rootCommit.trim();
              spinner.text = 'Generating changelog from all commits...';
            } catch {
              from = 'HEAD~3';
              spinner.text = 'Using last 3 commits...';
            }
          }
        }
        
        try {
          const result = await engine.generateChangelog({ from, to });
          spinner.succeed(chalk.green('Changelog generated'));
          console.log();
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            formatChangelogResult(result);
          }
        } catch {
          spinner.fail(chalk.red('Could not generate changelog'));
          console.log(chalk.yellow('Try specifying a valid --from ref.'));
        }
        break;
      }

      case 'monorepo': {
        const spinner = createSpinner('Analyzing monorepo structure...').start();
        const result = await engine.analyzeMonorepo();
        spinner.succeed(chalk.green('Monorepo analysis complete'));
        console.log();
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          formatMonorepoResult(result);
        }
        break;
      }

      case 'pr-report': {
        const spinner = createSpinner('Generating PR report...').start();
        const result = await engine.generatePrReport();
        spinner.succeed(chalk.green('PR report generated'));
        console.log();
        console.log(formatter.formatPrReport(result));
        break;
      }

      case 'init': {
        const spinner = createSpinner('Initializing Codexia...').start();
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
          spinner.warn(chalk.yellow('codexia.invariants.yaml already exists'));
        } catch {
          await fs.writeFile(invariantsPath, defaultContent);
          spinner.succeed(chalk.green('Created codexia.invariants.yaml'));
        }
        break;
      }

      case 'watch': {
        console.log();
        console.log(
          boxen(
            `${chalk.blue('👀')} ${chalk.bold('Watch Mode')}\n\n` +
            `${chalk.dim('Directory:')} ${process.cwd()}\n` +
            `${chalk.dim('Status:')} ${chalk.yellow('Interactive mode cannot run watch')}\n\n` +
            `${chalk.dim('Run directly:')} ${chalk.cyan('codexia watch')}`,
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            }
          )
        );
        break;
      }

      case 'mcp-server': {
        console.log();
        console.log(
          boxen(
            `${chalk.magenta('🔌')} ${chalk.bold('MCP Server')}\n\n` +
            `${chalk.dim('For AI tool integration (Claude, etc.)')}\n\n` +
            `${chalk.dim('Run directly:')} ${chalk.cyan('codexia mcp-server')}`,
            {
              padding: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            }
          )
        );
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
  const maintainability = result.summary.averageMaintainability;
  const maintColor = maintainability >= 70 ? 'green' : maintainability >= 50 ? 'yellow' : 'red';
  
  console.log(
    boxen(
      `${chalk.bold('📊 Complexity Analysis')}\n\n` +
      `  Files analyzed        ${chalk.cyan(result.summary.totalFiles)}\n` +
      `  Avg maintainability   ${chalk[maintColor](maintainability.toFixed(1))}\n` +
      `  Needs attention       ${chalk.yellow(result.summary.filesNeedingAttention)}\n` +
      `  Critical files        ${chalk.red(result.summary.criticalFiles)}`,
      {
        padding: { left: 1, right: 3, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );
  
  if (result.recommendations.length > 0) {
    console.log();
    console.log(chalk.bold('  💡 Recommendations'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const rec of result.recommendations) {
      console.log(`   ${chalk.yellow('▸')} ${rec}`);
    }
  }
  console.log();
}

function formatHistoryResult(result: any): void {
  console.log(
    boxen(
      `${chalk.bold('📜 History Analysis')}\n\n` +
      `  Files analyzed   ${chalk.cyan(result.summary.filesAnalyzed)}\n` +
      `  Hotspots         ${chalk.yellow(result.summary.hotspotCount)}\n` +
      `  Risk files       ${chalk.red(result.summary.riskFileCount)}\n` +
      `  Stale files      ${chalk.gray(result.summary.staleFileCount)}`,
      {
        padding: { left: 1, right: 3, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'yellow',
      }
    )
  );
  console.log();
}

function formatInvariantsResult(result: any): void {
  const statusIcon = result.passed ? chalk.green('✓') : chalk.red('✗');
  const statusText = result.passed ? chalk.green('All invariants passed') : chalk.red('Violations found');
  const borderColor = result.passed ? 'green' : 'red';
  
  console.log(
    boxen(
      `${chalk.bold('🛡️  Architectural Invariants')}\n\n` +
      `  Status          ${statusIcon} ${statusText}\n` +
      `  Rules checked   ${chalk.cyan(result.rulesChecked)}\n` +
      `  Rules passed    ${chalk.green(result.passedRules)}\n` +
      `  Violations      ${result.violations.length > 0 ? chalk.red(result.violations.length) : chalk.green(0)}`,
      {
        padding: { left: 1, right: 3, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor,
      }
    )
  );

  if (result.violations.length > 0) {
    console.log();
    console.log(chalk.bold('  ⚠️  Violations'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const v of result.violations.slice(0, 10)) {
      const icon = v.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
      console.log(`   ${icon} ${v.message}`);
      console.log(chalk.dim(`      ${v.file}:${v.line || 0}`));
    }
    if (result.violations.length > 10) {
      console.log(chalk.gray(`   ... and ${result.violations.length - 10} more`));
    }
  }
  console.log();
}

function formatHotPathsResult(result: any): void {
  console.log(
    boxen(
      `${chalk.bold('🔥 Hot Paths Analysis')}\n\n` +
      `  Total paths    ${chalk.cyan(result.summary.totalPaths)}\n` +
      `  Critical       ${chalk.red(result.summary.criticalPaths)}\n` +
      `  High           ${chalk.yellow(result.summary.highPaths)}\n` +
      `  Medium         ${chalk.blue(result.summary.mediumPaths)}`,
      {
        padding: { left: 1, right: 3, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'red',
      }
    )
  );
  console.log();
}

function formatChangelogResult(result: any): void {
  let statsLine = '';
  if (result.stats) {
    statsLine = `  ${chalk.cyan(result.stats.commits)} commits  ${chalk.green('+' + result.stats.additions)}  ${chalk.red('-' + result.stats.deletions)}`;
    if (result.stats.contributors.length > 0) {
      statsLine += `\n  Contributors: ${chalk.dim(result.stats.contributors.join(', '))}`;
    }
  }
  
  console.log(
    boxen(
      `${chalk.bold('📝 Generated Changelog')}\n\n${statsLine}`,
      {
        padding: { left: 1, right: 3, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'green',
      }
    )
  );
  
  if (result.sections && result.sections.length > 0) {
    for (const section of result.sections) {
      if (section.items.length > 0) {
        console.log();
        console.log(chalk.bold(`  ${section.title || section.type}`));
        console.log(chalk.dim('  ' + '─'.repeat(40)));
        for (const item of section.items.slice(0, 10)) {
          const breaking = item.breaking ? chalk.red(' [BREAKING]') : '';
          console.log(`   ${chalk.gray('•')} ${item.description || item.message}${breaking}`);
        }
        if (section.items.length > 10) {
          console.log(chalk.gray(`   ... and ${section.items.length - 10} more`));
        }
      }
    }
  } else if (result.entries && result.entries.length > 0) {
    console.log();
    for (const entry of result.entries.slice(0, 20)) {
      console.log(`   ${chalk.gray('•')} ${entry.message || entry.description}`);
    }
  } else {
    console.log(chalk.gray('\n  No changelog entries found'));
  }
  console.log();
}

function formatMonorepoResult(result: any): void {
  if (!result.type) {
    console.log(
      boxen(
        `${chalk.bold('📦 Monorepo Analysis')}\n\n` +
        `  ${chalk.yellow('This does not appear to be a monorepo')}`,
        {
          padding: { left: 1, right: 3, top: 0, bottom: 0 },
          borderStyle: 'round',
          borderColor: 'yellow',
        }
      )
    );
    console.log();
    return;
  }
  
  console.log(
    boxen(
      `${chalk.bold('📦 Monorepo Analysis')}\n\n` +
      `  Type             ${chalk.cyan(result.type)}\n` +
      `  Packages         ${chalk.cyan(result.packages?.length || 0)}\n` +
      `  Internal deps    ${chalk.cyan(result.summary?.internalDeps || 0)}\n` +
      `  Shared deps      ${chalk.cyan(result.summary?.sharedDeps || 0)}`,
      {
        padding: { left: 1, right: 3, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'blue',
      }
    )
  );

  if (result.packages && result.packages.length > 0) {
    console.log();
    console.log(chalk.bold('  📁 Packages'));
    console.log(chalk.dim('  ' + '─'.repeat(40)));
    for (const pkg of result.packages.slice(0, 10)) {
      console.log(`   ${chalk.cyan('▸')} ${pkg.name || pkg}`);
    }
    if (result.packages.length > 10) {
      console.log(chalk.gray(`   ... and ${result.packages.length - 10} more`));
    }
  }
  console.log();
}

export async function runInteractiveWizard(): Promise<void> {
  printBanner();

  let running = true;

  while (running) {
    try {
      const category = await selectCategory();
      const command = await selectCommand(category);

      if (command === 'back') {
        console.log();
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

  console.log();
  console.log(
    boxen(
      `${chalk.dim('Thanks for using')} ${codexiaGradient('Codexia')} ${chalk.dim('👋')}\n\n` +
      `${chalk.dim('Run')} ${chalk.cyan('codexia --help')} ${chalk.dim('for all commands')}`,
      {
        padding: { left: 2, right: 2, top: 0, bottom: 0 },
        borderStyle: 'round',
        borderColor: 'magenta',
        dimBorder: true,
      }
    )
  );
  console.log();
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
