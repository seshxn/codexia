import * as path from 'node:path';
import type {
  TestSuggestion,
  GitDiff,
  FileInfo,
  Symbol,
} from '../core/types.js';

export class TestSuggester {
  private testPatterns: string[] = [
    '.test.ts',
    '.spec.ts',
    '.test.tsx',
    '.spec.tsx',
    '.test.js',
    '.spec.js',
  ];

  /**
   * Suggest tests for changed code
   */
  suggest(
    diff: GitDiff,
    files: Map<string, FileInfo>,
    existingTests: Set<string>
  ): TestSuggestion[] {
    const suggestions: TestSuggestion[] = [];

    for (const file of diff.files) {
      // Skip test files themselves
      if (this.isTestFile(file.path)) continue;

      // Skip non-code files
      if (!this.isCodeFile(file.path)) continue;

      const fileInfo = files.get(file.path);
      if (!fileInfo) continue;

      // Check if test file exists
      const expectedTestFile = this.getExpectedTestFile(file.path);
      const hasTestFile = existingTests.has(expectedTestFile);

      if (!hasTestFile) {
        // Suggest creating a test file
        suggestions.push({
          targetFile: file.path,
          targetSymbol: '*',
          testFile: expectedTestFile,
          testType: 'unit',
          reason: `No test file found for ${file.path}`,
          priority: 'high',
          template: this.generateTestTemplate(fileInfo),
        });
      }

      // Suggest tests for specific changed symbols
      for (const symbol of fileInfo.symbols) {
        if (symbol.exported && this.shouldHaveTest(symbol)) {
          suggestions.push({
            targetFile: file.path,
            targetSymbol: symbol.name,
            testFile: expectedTestFile,
            testType: this.getTestType(symbol),
            reason: `${symbol.kind} '${symbol.name}' was ${file.status === 'added' ? 'added' : 'modified'}`,
            priority: this.getPriority(symbol, file.status),
          });
        }
      }
    }

    return this.deduplicateAndPrioritize(suggestions);
  }

  /**
   * Find existing test files
   */
  findExistingTests(files: Map<string, FileInfo>): Set<string> {
    const testFiles = new Set<string>();

    for (const [filePath] of files) {
      if (this.isTestFile(filePath)) {
        testFiles.add(filePath);
      }
    }

    return testFiles;
  }

  private isTestFile(filePath: string): boolean {
    return this.testPatterns.some(pattern => filePath.includes(pattern));
  }

  private isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  }

  private getExpectedTestFile(filePath: string): string {
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    return `${base}.test${ext}`;
  }

  private shouldHaveTest(symbol: Symbol): boolean {
    // Functions and classes should generally have tests
    return ['function', 'class', 'method'].includes(symbol.kind);
  }

  private getTestType(symbol: Symbol): 'unit' | 'integration' | 'e2e' {
    // Simple heuristic
    if (symbol.kind === 'class') {
      return symbol.name.includes('Service') || symbol.name.includes('Controller')
        ? 'integration'
        : 'unit';
    }
    return 'unit';
  }

  private getPriority(symbol: Symbol, fileStatus: string): 'high' | 'medium' | 'low' {
    if (fileStatus === 'added') return 'high';
    if (symbol.kind === 'class') return 'high';
    if (symbol.exported) return 'medium';
    return 'low';
  }

  private generateTestTemplate(fileInfo: FileInfo): string {
    const imports = fileInfo.exports
      .filter(e => ['function', 'class'].includes(e.kind))
      .map(e => e.name);

    const relativePath = fileInfo.relativePath.replace(/\.tsx?$/, '');

    let template = `import { ${imports.join(', ')} } from './${path.basename(relativePath)}';\n\n`;
    template += `describe('${path.basename(fileInfo.relativePath)}', () => {\n`;

    for (const exp of fileInfo.exports) {
      if (exp.kind === 'function') {
        template += `  describe('${exp.name}', () => {\n`;
        template += `    it('should work correctly', () => {\n`;
        template += `      // TODO: Add test\n`;
        template += `    });\n`;
        template += `  });\n\n`;
      } else if (exp.kind === 'class') {
        template += `  describe('${exp.name}', () => {\n`;
        template += `    it('should instantiate correctly', () => {\n`;
        template += `      // TODO: Add test\n`;
        template += `    });\n`;
        template += `  });\n\n`;
      }
    }

    template += `});\n`;

    return template;
  }

  private deduplicateAndPrioritize(suggestions: TestSuggestion[]): TestSuggestion[] {
    const seen = new Map<string, TestSuggestion>();

    for (const suggestion of suggestions) {
      const key = `${suggestion.targetFile}:${suggestion.targetSymbol}`;
      const existing = seen.get(key);

      if (!existing || this.priorityValue(suggestion.priority) > this.priorityValue(existing.priority)) {
        seen.set(key, suggestion);
      }
    }

    return Array.from(seen.values())
      .sort((a, b) => this.priorityValue(b.priority) - this.priorityValue(a.priority));
  }

  private priorityValue(priority: 'high' | 'medium' | 'low'): number {
    return { high: 3, medium: 2, low: 1 }[priority];
  }
}
