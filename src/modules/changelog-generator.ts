import { simpleGit, SimpleGit } from 'simple-git';
import type { Symbol, FileInfo } from '../core/types.js';

// ============================================================================
// Changelog Types
// ============================================================================

export interface ChangelogEntry {
  version: string;
  date: Date;
  sections: ChangelogSection[];
  stats: ChangelogStats;
}

export interface ChangelogSection {
  type: ChangeType;
  title: string;
  items: ChangelogItem[];
}

export interface ChangelogItem {
  description: string;
  symbol?: string;
  file?: string;
  commit?: string;
  author?: string;
  breaking?: boolean;
  affectedModules?: number;
}

export type ChangeType = 
  | 'breaking'
  | 'feature'
  | 'fix'
  | 'deprecation'
  | 'performance'
  | 'refactor'
  | 'docs'
  | 'chore'
  | 'internal';

export interface ChangelogStats {
  commits: number;
  filesChanged: number;
  additions: number;
  deletions: number;
  contributors: string[];
  breakingChanges: number;
}

export interface ChangelogOptions {
  from: string;
  to: string;
  includeInternal?: boolean;
  groupBy?: 'type' | 'scope' | 'author';
  format?: 'markdown' | 'json' | 'plain';
}

// ============================================================================
// Changelog Generator
// ============================================================================

export class ChangelogGenerator {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * Generate changelog between two refs
   */
  async generate(options: ChangelogOptions): Promise<ChangelogEntry> {
    const { from, to } = options;

    // Get commits between refs
    const log = await this.git.log({
      from,
      to,
    });

    // Get diff stats
    const diffSummary = await this.git.diffSummary([from, to]);

    // Parse commits into changelog sections
    const sections = this.parseCommits([...log.all]);

    // Collect unique contributors
    const contributors = [...new Set(log.all.map(c => c.author_name))];

    // Count breaking changes
    const breakingChanges = sections
      .find(s => s.type === 'breaking')?.items.length || 0;

    return {
      version: to,
      date: new Date(),
      sections: options.includeInternal 
        ? sections 
        : sections.filter(s => s.type !== 'internal' && s.type !== 'chore'),
      stats: {
        commits: log.all.length,
        filesChanged: diffSummary.files.length,
        additions: diffSummary.insertions,
        deletions: diffSummary.deletions,
        contributors,
        breakingChanges,
      },
    };
  }

  /**
   * Generate semantic changelog with symbol-level analysis
   */
  async generateSemantic(
    options: ChangelogOptions,
    beforeFiles: Map<string, FileInfo>,
    afterFiles: Map<string, FileInfo>
  ): Promise<ChangelogEntry> {
    const basicChangelog = await this.generate(options);

    // Analyze API changes at symbol level
    const apiChanges = this.analyzeApiChanges(beforeFiles, afterFiles);
    
    // Enhance breaking changes section with detailed info
    const breakingSection = basicChangelog.sections.find(s => s.type === 'breaking');
    if (breakingSection) {
      for (const change of apiChanges.breaking) {
        breakingSection.items.push({
          description: change.description,
          symbol: change.symbol,
          file: change.file,
          breaking: true,
          affectedModules: change.affectedCount,
        });
      }
    } else if (apiChanges.breaking.length > 0) {
      basicChangelog.sections.unshift({
        type: 'breaking',
        title: 'Breaking Changes',
        items: apiChanges.breaking.map(c => ({
          description: c.description,
          symbol: c.symbol,
          file: c.file,
          breaking: true,
          affectedModules: c.affectedCount,
        })),
      });
    }

    // Add new features from symbol analysis
    const featureSection = basicChangelog.sections.find(s => s.type === 'feature');
    if (featureSection) {
      for (const addition of apiChanges.additions) {
        featureSection.items.push({
          description: addition.description,
          symbol: addition.symbol,
          file: addition.file,
        });
      }
    }

    // Update stats
    basicChangelog.stats.breakingChanges = apiChanges.breaking.length;

    return basicChangelog;
  }

  /**
   * Parse commits into changelog sections
   */
  private parseCommits(
    commits: Array<{ hash: string; message: string; author_name: string; date: string }>
  ): ChangelogSection[] {
    const sections = new Map<ChangeType, ChangelogItem[]>();

    for (const commit of commits) {
      const parsed = this.parseCommitMessage(commit.message);
      
      if (!sections.has(parsed.type)) {
        sections.set(parsed.type, []);
      }

      sections.get(parsed.type)!.push({
        description: parsed.description,
        commit: commit.hash.slice(0, 7),
        author: commit.author_name,
        breaking: parsed.breaking,
      });
    }

    // Convert to array with proper ordering
    const typeOrder: ChangeType[] = [
      'breaking',
      'feature',
      'fix',
      'deprecation',
      'performance',
      'refactor',
      'docs',
      'chore',
      'internal',
    ];

    const result: ChangelogSection[] = [];
    
    for (const type of typeOrder) {
      const items = sections.get(type);
      if (items && items.length > 0) {
        result.push({
          type,
          title: this.getTypeTitle(type),
          items,
        });
      }
    }

    return result;
  }

  /**
   * Parse conventional commit message
   */
  private parseCommitMessage(message: string): {
    type: ChangeType;
    scope?: string;
    description: string;
    breaking: boolean;
  } {
    const conventionalRegex = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
    const match = message.match(conventionalRegex);

    if (match) {
      const [, type, scope, breaking, description] = match;
      return {
        type: this.mapCommitType(type),
        scope,
        description: description.trim(),
        breaking: !!breaking,
      };
    }

    // Fall back to heuristic parsing
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('breaking') || lowerMessage.includes('!:')) {
      return { type: 'breaking', description: message, breaking: true };
    }
    if (lowerMessage.startsWith('fix') || lowerMessage.includes('bug')) {
      return { type: 'fix', description: message, breaking: false };
    }
    if (lowerMessage.startsWith('feat') || lowerMessage.includes('add')) {
      return { type: 'feature', description: message, breaking: false };
    }
    if (lowerMessage.includes('refactor')) {
      return { type: 'refactor', description: message, breaking: false };
    }
    if (lowerMessage.includes('perf') || lowerMessage.includes('optim')) {
      return { type: 'performance', description: message, breaking: false };
    }
    if (lowerMessage.includes('doc')) {
      return { type: 'docs', description: message, breaking: false };
    }
    if (lowerMessage.includes('chore') || lowerMessage.includes('deps')) {
      return { type: 'chore', description: message, breaking: false };
    }

    return { type: 'internal', description: message, breaking: false };
  }

  /**
   * Map conventional commit type to ChangeType
   */
  private mapCommitType(type: string): ChangeType {
    const typeMap: Record<string, ChangeType> = {
      feat: 'feature',
      fix: 'fix',
      docs: 'docs',
      style: 'internal',
      refactor: 'refactor',
      perf: 'performance',
      test: 'internal',
      chore: 'chore',
      ci: 'internal',
      build: 'internal',
      revert: 'fix',
      deprecate: 'deprecation',
    };

    return typeMap[type.toLowerCase()] || 'internal';
  }

  /**
   * Get human-readable title for change type
   */
  private getTypeTitle(type: ChangeType): string {
    const titles: Record<ChangeType, string> = {
      breaking: '💥 Breaking Changes',
      feature: '✨ New Features',
      fix: '🐛 Bug Fixes',
      deprecation: '⚠️ Deprecations',
      performance: '⚡ Performance Improvements',
      refactor: '♻️ Refactoring',
      docs: '📚 Documentation',
      chore: '🔧 Maintenance',
      internal: '🏠 Internal Changes',
    };

    return titles[type];
  }

  /**
   * Analyze API changes at symbol level
   */
  private analyzeApiChanges(
    beforeFiles: Map<string, FileInfo>,
    afterFiles: Map<string, FileInfo>
  ): {
    breaking: Array<{ symbol: string; file: string; description: string; affectedCount: number }>;
    additions: Array<{ symbol: string; file: string; description: string }>;
    deprecations: Array<{ symbol: string; file: string; description: string }>;
  } {
    const breaking: Array<{ symbol: string; file: string; description: string; affectedCount: number }> = [];
    const additions: Array<{ symbol: string; file: string; description: string }> = [];
    const deprecations: Array<{ symbol: string; file: string; description: string }> = [];

    // Build maps of exported symbols
    const beforeExports = new Map<string, { symbol: Symbol; file: string }>();
    const afterExports = new Map<string, { symbol: Symbol; file: string }>();

    for (const [file, info] of beforeFiles) {
      for (const symbol of info.symbols.filter(s => s.exported)) {
        beforeExports.set(`${file}:${symbol.name}`, { symbol, file });
      }
    }

    for (const [file, info] of afterFiles) {
      for (const symbol of info.symbols.filter(s => s.exported)) {
        afterExports.set(`${file}:${symbol.name}`, { symbol, file });
      }
    }

    // Find removed exports (breaking)
    for (const [key, { symbol, file }] of beforeExports) {
      if (!afterExports.has(key)) {
        breaking.push({
          symbol: symbol.name,
          file,
          description: `Removed ${symbol.kind} '${symbol.name}'`,
          affectedCount: symbol.references?.length || 0,
        });
      }
    }

    // Find new exports (additions)
    for (const [key, { symbol, file }] of afterExports) {
      if (!beforeExports.has(key)) {
        additions.push({
          symbol: symbol.name,
          file,
          description: `Added ${symbol.kind} '${symbol.name}'`,
        });
      }
    }

    // Check for deprecation annotations
    for (const [key, { symbol, file }] of afterExports) {
      if (symbol.documentation?.includes('@deprecated')) {
        const before = beforeExports.get(key);
        if (!before?.symbol.documentation?.includes('@deprecated')) {
          deprecations.push({
            symbol: symbol.name,
            file,
            description: `Deprecated ${symbol.kind} '${symbol.name}'`,
          });
        }
      }
    }

    return { breaking, additions, deprecations };
  }

  /**
   * Format changelog as markdown
   */
  formatMarkdown(changelog: ChangelogEntry): string {
    const lines: string[] = [];

    lines.push(`# Changelog`);
    lines.push('');
    lines.push(`## ${changelog.version}`);
    lines.push('');
    lines.push(`*${changelog.date.toISOString().split('T')[0]}*`);
    lines.push('');

    // Stats summary
    lines.push(`> ${changelog.stats.commits} commits, ` +
               `${changelog.stats.filesChanged} files changed, ` +
               `+${changelog.stats.additions}/-${changelog.stats.deletions}`);
    lines.push(`> Contributors: ${changelog.stats.contributors.join(', ')}`);
    lines.push('');

    for (const section of changelog.sections) {
      lines.push(`### ${section.title}`);
      lines.push('');

      for (const item of section.items) {
        let line = `- ${item.description}`;
        
        if (item.symbol) {
          line += ` (\`${item.symbol}\`)`;
        }
        if (item.commit) {
          line += ` [${item.commit}]`;
        }
        if (item.affectedModules && item.affectedModules > 0) {
          line += ` *(affects ${item.affectedModules} modules)*`;
        }

        lines.push(line);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format changelog as plain text
   */
  formatPlain(changelog: ChangelogEntry): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push(`  CHANGELOG - ${changelog.version}`);
    lines.push(`  ${changelog.date.toISOString().split('T')[0]}`);
    lines.push('═'.repeat(60));
    lines.push('');

    lines.push(`Stats: ${changelog.stats.commits} commits | ` +
               `${changelog.stats.filesChanged} files | ` +
               `+${changelog.stats.additions}/-${changelog.stats.deletions}`);
    lines.push('');

    for (const section of changelog.sections) {
      lines.push(section.title);
      lines.push('─'.repeat(40));

      for (const item of section.items) {
        let line = `  • ${item.description}`;
        if (item.breaking) {
          line = `  ⚠ ${item.description} [BREAKING]`;
        }
        lines.push(line);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Generate changelog between two refs
 */
export async function generateChangelog(
  repoPath: string,
  options: ChangelogOptions
): Promise<string> {
  const generator = new ChangelogGenerator(repoPath);
  const changelog = await generator.generate(options);

  switch (options.format) {
    case 'json':
      return JSON.stringify(changelog, null, 2);
    case 'plain':
      return generator.formatPlain(changelog);
    case 'markdown':
    default:
      return generator.formatMarkdown(changelog);
  }
}
