import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const monorepoCommand = new Command('monorepo')
  .description('Analyze monorepo structure and cross-package dependencies')
  .option('--detect', 'Detect monorepo type and packages')
  .option('--graph', 'Show package dependency graph')
  .option('--impact <package>', 'Show impact on other packages')
  .option('--shared', 'Analyze shared dependencies')
  .option('--cycles', 'Detect circular dependencies between packages')
  .option('--scope <packages>', 'Limit analysis to specific packages (comma-separated)')
  .addHelpText('after', `
Examples:
  $ codexia monorepo --detect              Detect packages and structure
  $ codexia monorepo --graph               Show package dependency graph
  $ codexia monorepo --impact @org/core    Impact of changing core package
  $ codexia monorepo --shared              Analyze shared dependencies
  $ codexia monorepo --cycles              Find circular package dependencies
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();
      await engine.initialize();

      const scope = options.scope?.split(',');
      const showAll = !options.detect && !options.graph && !options.impact && !options.shared && !options.cycles;

      const analysis = await engine.analyzeMonorepo({
        scope,
        includeGraph: options.graph || showAll,
        includeShared: options.shared || showAll,
        includeCycles: options.cycles || showAll,
        impactPackage: options.impact,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(analysis, null, 2));
        return;
      }

      console.log(chalk.bold.cyan('\n📦 Monorepo Analysis\n'));
      console.log(chalk.dim('─'.repeat(80)));

      // Detection
      if (options.detect || showAll) {
        console.log(chalk.bold('\n🔍 Monorepo Detection:\n'));
        console.log(`  Type:     ${chalk.yellow(analysis.type || 'Not detected')}`);
        console.log(`  Root:     ${chalk.dim(analysis.root)}`);
        console.log(`  Packages: ${chalk.yellow(analysis.packages.length)}`);
        
        console.log(chalk.dim('\n  Packages found:'));
        for (const pkg of analysis.packages) {
          const versionStr = pkg.version ? chalk.dim(` v${pkg.version}`) : '';
          const privateStr = pkg.private ? chalk.dim(' (private)') : '';
          console.log(`    ${chalk.green('●')} ${chalk.cyan(pkg.name)}${versionStr}${privateStr}`);
          console.log(chalk.dim(`      ${pkg.path}`));
        }
      }

      // Dependency graph
      if (options.graph || showAll) {
        console.log(chalk.bold('\n🔗 Package Dependencies:\n'));
        
        for (const pkg of analysis.packages) {
          const deps = analysis.dependencies[pkg.name] || [];
          const dependents = analysis.dependents[pkg.name] || [];
          
          console.log(`  ${chalk.cyan(pkg.name)}`);
          if (deps.length > 0) {
            console.log(chalk.dim(`    depends on: ${deps.map((d: string) => chalk.yellow(d)).join(', ')}`));
          }
          if (dependents.length > 0) {
            console.log(chalk.dim(`    used by:    ${dependents.map((d: string) => chalk.green(d)).join(', ')}`));
          }
          if (deps.length === 0 && dependents.length === 0) {
            console.log(chalk.dim('    (no internal dependencies)'));
          }
        }

        // ASCII graph
        if (analysis.graph) {
          console.log(chalk.bold('\n  Dependency Graph:'));
          console.log(chalk.dim(analysis.graph));
        }
      }

      // Shared dependencies
      if (options.shared || showAll) {
        console.log(chalk.bold('\n📚 Shared Dependencies:\n'));
        
        if (analysis.sharedDeps?.length) {
          const sorted = [...analysis.sharedDeps].sort((a: any, b: any) => b.usedBy.length - a.usedBy.length);
          
          for (const dep of sorted.slice(0, 15)) {
            const versionMismatch = dep.versions.length > 1;
            const icon = versionMismatch ? chalk.yellow('⚠') : chalk.green('●');
            console.log(`  ${icon} ${chalk.cyan(dep.name)}`);
            console.log(chalk.dim(`    Used by ${dep.usedBy.length} packages: ${dep.usedBy.join(', ')}`));
            if (versionMismatch) {
              console.log(chalk.yellow(`    ⚠ Version mismatch: ${dep.versions.join(', ')}`));
            }
          }
        } else {
          console.log(chalk.dim('  No shared dependencies found.'));
        }
      }

      // Circular dependencies
      if (options.cycles || showAll) {
        console.log(chalk.bold('\n🔄 Circular Dependencies:\n'));
        
        if (analysis.cycles?.length) {
          for (const cycle of analysis.cycles) {
            console.log(`  ${chalk.red('⚠')} ${cycle.map((c: string) => chalk.cyan(c)).join(' → ')} → ${chalk.cyan(cycle[0])}`);
          }
          console.log(chalk.yellow(`\n  Found ${analysis.cycles.length} circular dependency chains.`));
        } else {
          console.log(chalk.green('  ✓ No circular dependencies detected.'));
        }
      }

      // Impact analysis
      if (options.impact) {
        console.log(chalk.bold(`\n💥 Impact of ${options.impact}:\n`));
        
        if (analysis.impact) {
          console.log(`  Direct dependents:   ${chalk.yellow(analysis.impact.direct.length)}`);
          for (const pkg of analysis.impact.direct) {
            console.log(`    ${chalk.green('●')} ${pkg}`);
          }

          console.log(`  Transitive:          ${chalk.yellow(analysis.impact.transitive.length)}`);
          for (const pkg of analysis.impact.transitive) {
            console.log(`    ${chalk.dim('○')} ${pkg}`);
          }

          console.log(`\n  Total blast radius:  ${chalk.red(analysis.impact.direct.length + analysis.impact.transitive.length)} packages`);
          
          if (analysis.impact.buildOrder) {
            console.log(chalk.bold('\n  Suggested build order:'));
            for (let i = 0; i < analysis.impact.buildOrder.length; i++) {
              console.log(`    ${i + 1}. ${analysis.impact.buildOrder[i]}`);
            }
          }
        } else {
          console.log(chalk.dim(`  Package "${options.impact}" not found.`));
        }
      }

      // Summary
      console.log(chalk.dim('\n─'.repeat(80)));
      console.log(chalk.bold('\n📊 Summary:\n'));
      console.log(`  Monorepo type:          ${chalk.yellow(analysis.type || 'Unknown')}`);
      console.log(`  Total packages:         ${chalk.yellow(analysis.packages.length)}`);
      console.log(`  Internal dependencies:  ${chalk.yellow(analysis.summary.internalDeps)}`);
      console.log(`  Shared external deps:   ${chalk.yellow(analysis.summary.sharedDeps)}`);
      console.log(`  Circular dependencies:  ${analysis.cycles?.length ? chalk.red(analysis.cycles.length) : chalk.green('0')}`);

      if (analysis.recommendations?.length) {
        console.log(chalk.bold('\n💡 Recommendations:\n'));
        for (const rec of analysis.recommendations) {
          console.log(`  ${chalk.yellow('•')} ${rec}`);
        }
      }

      console.log();
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
