import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';

const TEMPLATES = {
  architecture: `# Architecture

## Layers

- **CLI**: Command-line interface layer
  - paths: \`src/cli/**\`
  - depends on: Core, Modules

- **Core**: Core domain logic and types
  - paths: \`src/core/**\`
  - depends on: (none)

- **Modules**: Feature modules
  - paths: \`src/modules/**\`
  - depends on: Core

## Boundaries

- **Modules** cannot import **CLI**: Modules should be independent of CLI
- **Core** cannot import **Modules**: Core should have no external dependencies
- **Core** cannot import **CLI**: Core should have no external dependencies

## Entry Points

- \`src/cli/index.ts\`
- \`src/core/index.ts\`

## Critical Paths

- User authentication flow
- Data persistence layer
`,

  conventions: `# Conventions

## Naming Conventions

- Classes: \`PascalCase\`
- Functions: \`camelCase\`
- Constants: \`SCREAMING_SNAKE_CASE\`
- Private fields: \`_prefixed\` or \`#private\`
- Interfaces: \`IPrefixed\` or plain \`PascalCase\`
- Type aliases: \`PascalCase\`

## File Structure

- One class/component per file
- Test files adjacent to source: \`*.test.ts\` or \`*.spec.ts\`
- Index files for public exports

## Code Patterns

- Use async/await over raw Promises
- Prefer const over let
- Use TypeScript strict mode
- Export types from dedicated type files
`,

  invariants: `# Invariants

These are rules that must NEVER be violated.

### No direct database access from CLI

The CLI layer must never directly access the database. All data access should go through the service layer.

### All public APIs must be typed

All exported functions and classes must have explicit TypeScript types. No \`any\` types in public APIs.

### Tests required for critical paths

All code in critical paths must have corresponding unit tests with >80% coverage.
`,

  adrTemplate: `# ADR-001: [Title]

**Status:** Proposed
**Date:** ${new Date().toISOString().split('T')[0]}

## Context

[Describe the context and problem statement]

## Decision

[Describe the decision that was made]

## Consequences

- [Positive consequence 1]
- [Positive consequence 2]
- [Negative consequence that was accepted]
`,
};

export const initCommand = new Command('init')
  .description('Initialize Codexia project memory (.codexia directory)')
  .option('-f, --force', 'Overwrite existing files')
  .addHelpText('after', `
Examples:
  $ codexia init          Create .codexia directory with templates
  $ codexia init --force  Overwrite existing .codexia files
`)
  .action(async (options) => {
    const cwd = process.cwd();
    const codexiaDir = path.join(cwd, '.codexia');
    const adrsDir = path.join(codexiaDir, 'adrs');

    try {
      // Check if directory exists
      try {
        await fs.access(codexiaDir);
        if (!options.force) {
          console.log(chalk.yellow('⚠') + ' .codexia directory already exists. Use --force to overwrite.');
          return;
        }
      } catch {
        // Directory doesn't exist, continue
      }

      // Create directories
      await fs.mkdir(codexiaDir, { recursive: true });
      await fs.mkdir(adrsDir, { recursive: true });

      // Write template files
      const files = [
        { path: path.join(codexiaDir, '.gitignore'), content: '# Auto-generated cache (contains local paths)\nindex-cache.json\n' },
        { path: path.join(codexiaDir, 'architecture.md'), content: TEMPLATES.architecture },
        { path: path.join(codexiaDir, 'conventions.md'), content: TEMPLATES.conventions },
        { path: path.join(codexiaDir, 'invariants.md'), content: TEMPLATES.invariants },
        { path: path.join(adrsDir, 'template.md'), content: TEMPLATES.adrTemplate },
      ];

      for (const file of files) {
        let backupPath: string | null = null;
        if (options.force) {
          try {
            await fs.access(file.path);
            const ext = path.extname(file.path);
            const base = file.path.slice(0, file.path.length - ext.length);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            backupPath = `${base}.${timestamp}.bak${ext}`;
            await fs.rename(file.path, backupPath);
            console.log(
              chalk.yellow('⚠') +
                ` Existing ${path.relative(cwd, file.path)} backed up to ${path.relative(cwd, backupPath)}`
            );
          } catch {
            // File does not exist or cannot be accessed; no backup created
          }
        }
        await fs.writeFile(file.path, file.content, 'utf-8');
        console.log(chalk.green('✓') + ` Created ${path.relative(cwd, file.path)}`);
      }

      console.log('');
      console.log(chalk.green('✓') + ' Codexia initialized successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Edit .codexia/architecture.md to define your project layers');
      console.log('  2. Edit .codexia/conventions.md to set naming conventions');
      console.log('  3. Run ' + chalk.cyan('codexia scan') + ' to index your repository');
      console.log('');
    } catch (error) {
      console.error(chalk.red('✗') + ` Failed to initialize: ${(error as Error).message}`);
      process.exit(1);
    }
  });
