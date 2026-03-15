import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface DocsSectionResult {
  section: string;
  heading: string;
  source: string;
  content: string;
  availableSections: string[];
}

interface MarkdownHeading {
  level: number;
  title: string;
  slug: string;
  line: number;
}

export class DocsIndex {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async getSection(sectionName: string): Promise<DocsSectionResult> {
    const docsFiles = await this.listMarkdownFiles();
    const normalized = this.slugify(sectionName);
    const availableSections = new Set<string>();

    for (const filePath of docsFiles) {
      const absolutePath = path.join(this.repoRoot, filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      const headings = this.parseHeadings(content);
      for (const heading of headings) {
        availableSections.add(heading.slug);
      }
      availableSections.add(this.slugify(path.basename(filePath, path.extname(filePath))));

      const exactHeading = headings.find((heading) => heading.slug === normalized);
      if (exactHeading) {
        return {
          section: sectionName,
          heading: exactHeading.title,
          source: filePath,
          content: this.extractSection(content, headings, exactHeading),
          availableSections: Array.from(availableSections).sort(),
        };
      }

      if (this.slugify(path.basename(filePath, path.extname(filePath))) === normalized) {
        return {
          section: sectionName,
          heading: path.basename(filePath),
          source: filePath,
          content: content.trim(),
          availableSections: Array.from(availableSections).sort(),
        };
      }
    }

    throw new Error(`Documentation section "${sectionName}" was not found.`);
  }

  private async listMarkdownFiles(): Promise<string[]> {
    const docsDir = path.join(this.repoRoot, 'docs');
    const discovered: string[] = [];

    try {
      const entries = await fs.readdir(docsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          discovered.push(path.join('docs', entry.name));
        }
      }
    } catch {
      // Ignore missing docs directories.
    }

    try {
      await fs.access(path.join(this.repoRoot, 'README.md'));
      discovered.unshift('README.md');
    } catch {
      // Ignore missing README.
    }

    return discovered;
  }

  private parseHeadings(content: string): MarkdownHeading[] {
    const headings: MarkdownHeading[] = [];
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) {
        continue;
      }
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        slug: this.slugify(match[2]),
        line: index,
      });
    }
    return headings;
  }

  private extractSection(content: string, headings: MarkdownHeading[], target: MarkdownHeading): string {
    const lines = content.split(/\r?\n/);
    const start = target.line;
    let end = lines.length;
    for (const heading of headings) {
      if (heading.line <= target.line) {
        continue;
      }
      if (heading.level <= target.level) {
        end = heading.line;
        break;
      }
    }
    return lines.slice(start, end).join('\n').trim();
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[`*_]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
