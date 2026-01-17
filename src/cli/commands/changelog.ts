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
          // Get the root commit as fallback
          const { simpleGit } = await import('simple-git');
          const git = simpleGit(process.cwd());
          try {
            const rootCommit = await git.raw(['rev-list', '--max-parents=0', 'HEAD']);
            options.from = rootCommit.trim();
            console.error(chalk.dim('No tags found, showing all commits'));
          } catch {
            options.from = 'HEAD~5';
            console.error(chalk.dim('Using last 5 commits'));
          }
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

function formatMarkdownChangelog(data: any, options: any): string {
  const lines: string[] = [];
  
  // Handle both ChangelogEntry (from generator) and ChangelogData formats
  const stats = data.stats || data.summary || {};
  const totalCommits = stats.commits || stats.totalCommits || 0;
  const contributors = stats.contributors || [];
  const breakingCount = stats.breakingChanges || stats.breaking || 0;
  
  // Header
  const title = data.version ? `## ${data.version}` : `## Changelog`;
  lines.push(title);
  lines.push('');
  
  // Safe date handling
  let dateStr: string;
  if (data.date instanceof Date) {
    dateStr = data.date.toISOString().split('T')[0];
  } else if (typeof data.date === 'string' && data.date.trim() !== '') {
    dateStr = data.date;
  } else {
    dateStr = new Date().toISOString().split('T')[0];
  }
  
  lines.push(`*${dateStr}* | ${totalCommits} commits | ${contributors.length} contributors`);
  lines.push('');

  // Breaking changes first
  if (options.includeBreaking && breakingCount > 0) {
    lines.push('### ⚠️ Breaking Changes');
    lines.push('');
    for (const section of data.sections) {
      const breaking = section.items.filter((i: any) => i.breaking);
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
    const nonBreaking = section.items.filter((i: any) => !i.breaking);
    if (nonBreaking.length === 0) continue;

    lines.push(typeMap[section.type] || `### ${section.title}`);
    lines.push('');
    
    for (const item of nonBreaking) {
      let line = '- ';
      if (item.scope) {
        line += `**${item.scope}**: `;
      }
      line += item.message || item.description || 'Unknown change';
      if (item.pr) {
        line += ` (${item.pr})`;
      }
      lines.push(line);
    }
    lines.push('');
  }

  // Contributors
  if (contributors.length > 0) {
    lines.push('### 👥 Contributors');
    lines.push('');
    lines.push(contributors.map((c: string) => `@${c}`).join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

function formatPlainChangelog(data: any): string {
  const lines: string[] = [];
  
  const stats = data.stats || data.summary || {};
  const totalCommits = stats.commits || stats.totalCommits || 0;
  const from = data.from || '';
  const to = data.to || data.version || 'HEAD';
  
  // Safe date handling
  let dateStr: string;
  if (data.date instanceof Date) {
    dateStr = data.date.toISOString().split('T')[0];
  } else if (typeof data.date === 'string' && data.date.trim() !== '') {
    dateStr = data.date;
  } else {
    dateStr = new Date().toISOString().split('T')[0];
  }
  
  lines.push(`CHANGELOG ${from} → ${to}`);
  lines.push(`Date: ${dateStr}`);
  lines.push(`Commits: ${totalCommits}`);
  lines.push('');

  for (const section of data.sections) {
    lines.push(`[${(section.type || 'other').toUpperCase()}]`);
    for (const item of section.items) {
      const breaking = item.breaking ? '[BREAKING] ' : '';
      const scope = item.scope ? `(${item.scope}) ` : '';
      lines.push(`  ${breaking}${scope}${item.message || item.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
