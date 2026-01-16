import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const invariantsCommand = new Command('invariants')
  .description('Check architectural invariants')
  .option('-c, --config <file>', 'Invariants config file', 'codexia.invariants.yaml')
  .option('--init', 'Generate example invariants config')
  .option('--strict', 'Fail on any violation')
  .option('--fix', 'Attempt to auto-fix violations where possible')
  .option('--watch', 'Watch for changes and re-check')
  .addHelpText('after', `
Examples:
  $ codexia invariants                     Check all invariants
  $ codexia invariants --init              Generate example config
  $ codexia invariants --strict            Fail on violations
  $ codexia invariants -c rules.yaml       Use custom config file
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const engine = new CodexiaEngine();

      // Generate example config
      if (options.init) {
        const exampleConfig = generateExampleConfig();
        console.log(exampleConfig);
        console.log(chalk.dim(`\n# Save this to ${options.config} and customize for your project`));
        return;
      }

      await engine.initialize();

      const results = await engine.checkInvariants({
        configFile: options.config,
        fix: options.fix,
      });

      if (globalOpts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(chalk.bold.cyan('\n🛡️  Invariant Check Report\n'));
      console.log(chalk.dim('─'.repeat(80)));

      // Group by rule
      const byRule = new Map<string, typeof results.violations>();
      for (const v of results.violations) {
        const existing = byRule.get(v.rule) || [];
        existing.push(v);
        byRule.set(v.rule, existing);
      }

      if (results.violations.length === 0) {
        console.log(chalk.green('\n✅ All invariants satisfied!\n'));
        console.log(`  Rules checked: ${chalk.yellow(results.rulesChecked)}`);
        console.log(`  Files scanned: ${chalk.yellow(results.filesScanned)}`);
        console.log();
        return;
      }

      // Show violations grouped by rule
      for (const [rule, violations] of byRule) {
        const ruleConfig = results.rules?.find((r: any) => r.name === rule);
        const severityColor = ruleConfig?.severity === 'error' ? chalk.red :
                             ruleConfig?.severity === 'warning' ? chalk.yellow :
                             chalk.dim;

        console.log(`\n${severityColor('●')} ${chalk.bold(rule)}`);
        if (ruleConfig?.description) {
          console.log(chalk.dim(`  ${ruleConfig.description}`));
        }
        console.log();

        for (const v of violations) {
          const icon = v.severity === 'error' ? chalk.red('✗') :
                      v.severity === 'warning' ? chalk.yellow('⚠') :
                      chalk.dim('○');
          console.log(`  ${icon} ${chalk.cyan(v.file)}${v.line ? `:${v.line}` : ''}`);
          console.log(`    ${v.message}`);
          if (v.suggestion) {
            console.log(chalk.dim(`    💡 ${v.suggestion}`));
          }
          if (v.fixed && options.fix) {
            console.log(chalk.green(`    ✓ Auto-fixed`));
          }
        }
      }

      // Summary
      console.log(chalk.dim('\n─'.repeat(80)));
      console.log(chalk.bold('\n📊 Summary:\n'));
      
      const errors = results.violations.filter((v: any) => v.severity === 'error').length;
      const warnings = results.violations.filter((v: any) => v.severity === 'warning').length;
      const fixed = results.violations.filter((v: any) => v.fixed).length;

      console.log(`  Rules checked:  ${chalk.yellow(results.rulesChecked)}`);
      console.log(`  Files scanned:  ${chalk.yellow(results.filesScanned)}`);
      console.log(`  Errors:         ${chalk.red(errors)}`);
      console.log(`  Warnings:       ${chalk.yellow(warnings)}`);
      if (options.fix) {
        console.log(`  Auto-fixed:     ${chalk.green(fixed)}`);
      }

      console.log();

      if (options.strict && errors > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });

function generateExampleConfig(): string {
  return `# Codexia Architectural Invariants
# Define rules to enforce codebase conventions

rules:
  # Layer boundary rules
  - name: no-ui-in-core
    description: "Core modules should not import from UI layer"
    type: no-import
    from: "src/core/**"
    target: "src/ui/**"
    severity: error

  - name: no-direct-db-access
    description: "Only data layer can access database"
    type: no-import
    from: "src/!(data)/**"
    target: "src/data/db/**"
    severity: error

  # Required dependencies
  - name: controllers-use-services
    description: "Controllers must use services, not repositories directly"
    type: require-import
    from: "src/controllers/**"
    target: "src/services/**"
    severity: warning

  # Naming conventions
  - name: test-file-naming
    description: "Test files must end with .test.ts or .spec.ts"
    type: naming-pattern
    pattern: "src/**/*.test.ts|src/**/*.spec.ts"
    exclude: "src/**/*.ts"
    severity: warning

  # Dependency limits
  - name: max-dependencies
    description: "No file should have more than 15 imports"
    type: max-dependencies
    max: 15
    scope: "src/**"
    severity: warning

  # Annotation requirements
  - name: public-api-docs
    description: "Public API must have JSDoc comments"
    type: annotation-required
    scope: "src/api/**"
    annotation: "@public"
    exports: true
    severity: error

  # Custom layer boundaries
  - name: clean-architecture
    description: "Enforce clean architecture layers"
    type: layer-boundary
    layers:
      - name: domain
        pattern: "src/domain/**"
      - name: application
        pattern: "src/application/**"
        canImport: [domain]
      - name: infrastructure
        pattern: "src/infrastructure/**"
        canImport: [domain, application]
      - name: presentation
        pattern: "src/ui/**"
        canImport: [application]
    severity: error
`;
}
