import { Command } from 'commander';
import { CodexiaEngine } from '../engine.js';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const changelogCommand = new Command('changelog')
  .description('Generate semantic changelog from git history')
  .option('--from <ref>', 'Starting ref (tag, commit, branch)')
  .option('--to <ref>', 'Ending ref (defaults to HEAD)', 'HEAD')
  .option('--format <fmt>', 'Output format: markdown, plain, json', 'markdown')
  .option('--include-api', 'Include API change analysis')
  .option('--include-breaking', 'Highlight breaking changes')
  .option('-o, --output <file>', 'Write to file instead of stdout')
  .option('--group-by <type>', 'Group by: type, scope, component', 'type')
  .addHelpText('after', `
Examples:
  $ codexia changelog --from v1.0.0              Since tag
  $ codexia changelog --from HEAD~20             Last 20 commits
  $ codexia changelog --from v1.0.0 --to v2.0.0  Between versions
  $ codexia changelog --include-api              Include API changes
  $ codexia changelog -o CHANGELOG.md            Write to file
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json || options.format === 'json');

    try {
      const engine = new CodexiaEngine();
      await engine.initialize();

      if (!options.from) {
        // Try to find the latest tag
        const latestTag = await engine.getLatestTag();
        if (latestTag) {
          options.from = latestTag;
          console.error(chalk.dim(`Using latest tag: ${latestTag}`));
        } else {
          options.from = 'HEAD~50';
          console.error(chalk.dim('No tags found, using last 50 commits'));
        }
      }

      const changelog = await engine.generateChangelog({
        from: options.from,
        to: options.to,
        includeApiChanges: options.includeApi,
        includeBreaking: options.includeBreaking,
        groupBy: options.groupBy,
      });

      let output: string;

      if (options.format === 'json' || globalOpts.json) {
        output = JSON.stringify(changelog, null, 2);
      } else if (options.format === 'plain') {
        output = formatPlainChangelog(changelog);
      } else {
        output = formatMarkdownChangelog(changelog, options);
      }

      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, output);
        console.log(chalk.green(`✓ Changelog written to ${options.output}`));
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });

interface ChangelogData {
  version?: string;
  from: string;
  to: string;
  date: string;
  summary: {
    totalCommits: number;
    features: number;
    fixes: number;
    breaking: number;
    contributors: string[];
  };
  sections: Array<{
    type: string;
    title: string;
    items: Array<{
      message: string;
      scope?: string;
      hash: string;
      author: string;
      breaking?: boolean;
      pr?: string;
    }>;
  }>;
  apiChanges?: {
    breaking: Array<{ symbol: string; file: string; change: string }>;
    additions: Array<{ symbol: string; file: string }>;
    deprecations: Array<{ symbol: string; file: string; replacement?: string }>;
  };
}

function formatMarkdownChangelog(data: ChangelogData, options: any): string {
  const lines: string[] = [];
  
  // Header
  const title = data.version ? `## ${data.version}` : `## Changelog`;
  lines.push(title);
  lines.push('');
  lines.push(`*${data.date}* | ${data.summary.totalCommits} commits | ${data.summary.contributors.length} contributors`);
  lines.push('');

  // Breaking changes first
  if (options.includeBreaking && data.summary.breaking > 0) {
    lines.push('### ⚠️ Breaking Changes');
    lines.push('');
    for (const section of data.sections) {
      const breaking = section.items.filter(i => i.breaking);
      for (const item of breaking) {
        lines.push(`- **${section.type}${item.scope ? `(${item.scope})` : ''}**: ${item.message}`);
      }
    }
    lines.push('');
  }

  // API changes
  if (options.includeApi && data.apiChanges) {
    if (data.apiChanges.breaking.length > 0) {
      lines.push('### 🔴 API Breaking Changes');
      lines.push('');
      for (const change of data.apiChanges.breaking) {
        lines.push(`- \`${change.symbol}\` in ${change.file}: ${change.change}`);
      }
      lines.push('');
    }

    if (data.apiChanges.additions.length > 0) {
      lines.push('### 🟢 New API');
      lines.push('');
      for (const item of data.apiChanges.additions) {
        lines.push(`- \`${item.symbol}\` in ${item.file}`);
      }
      lines.push('');
    }

    if (data.apiChanges.deprecations.length > 0) {
      lines.push('### 🟡 Deprecations');
      lines.push('');
      for (const item of data.apiChanges.deprecations) {
        let line = `- \`${item.symbol}\` in ${item.file}`;
        if (item.replacement) {
          line += ` → use \`${item.replacement}\``;
        }
        lines.push(line);
      }
      lines.push('');
    }
  }

  // Regular sections
  const typeMap: Record<string, string> = {
    feat: '### ✨ Features',
    fix: '### 🐛 Bug Fixes',
    perf: '### ⚡ Performance',
    refactor: '### ♻️ Refactoring',
    docs: '### 📚 Documentation',
    test: '### 🧪 Tests',
    build: '### 🏗️ Build',
    ci: '### 🔧 CI/CD',
    chore: '### 🧹 Chores',
    style: '### 💄 Style',
  };

  for (const section of data.sections) {
    const nonBreaking = section.items.filter(i => !i.breaking);
    if (nonBreaking.length === 0) continue;

    lines.push(typeMap[section.type] || `### ${section.title}`);
    lines.push('');
    
    for (const item of nonBreaking) {
      let line = '- ';
      if (item.scope) {
        line += `**${item.scope}**: `;
      }
      line += item.message;
      if (item.pr) {
        line += ` (${item.pr})`;
      }
      lines.push(line);
    }
    lines.push('');
  }

  // Contributors
  if (data.summary.contributors.length > 0) {
    lines.push('### 👥 Contributors');
    lines.push('');
    lines.push(data.summary.contributors.map(c => `@${c}`).join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

function formatPlainChangelog(data: ChangelogData): string {
  const lines: string[] = [];
  
  lines.push(`CHANGELOG ${data.from} → ${data.to}`);
  lines.push(`Date: ${data.date}`);
  lines.push(`Commits: ${data.summary.totalCommits}`);
  lines.push('');

  for (const section of data.sections) {
    lines.push(`[${section.type.toUpperCase()}]`);
    for (const item of section.items) {
      const breaking = item.breaking ? '[BREAKING] ' : '';
      const scope = item.scope ? `(${item.scope}) ` : '';
      lines.push(`  ${breaking}${scope}${item.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
