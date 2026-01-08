import type {
  Convention,
  ConventionViolation,
  ConventionMemory,
  FileInfo,
  GitDiff,
} from '../core/types.js';

export class ConventionChecker {
  private conventions: Convention[] = [];

  constructor() {
    this.loadDefaultConventions();
  }

  /**
   * Load conventions from memory
   */
  loadFromMemory(memory: ConventionMemory): void {
    // Convert memory conventions to checkable conventions
    for (const naming of memory.naming) {
      this.conventions.push({
        id: `naming-${naming.target}`,
        name: `${naming.target} naming`,
        description: `${naming.target} should match pattern ${naming.pattern}`,
        category: 'naming',
        severity: 'warning',
        check: {
          type: 'regex',
          pattern: naming.pattern,
          message: `${naming.target} does not match expected pattern`,
        },
      });
    }
  }

  /**
   * Check files for convention violations
   */
  check(diff: GitDiff, files: Map<string, FileInfo>): ConventionViolation[] {
    const violations: ConventionViolation[] = [];

    for (const file of diff.files) {
      const fileInfo = files.get(file.path);
      if (!fileInfo) continue;

      // Check file-level conventions
      violations.push(...this.checkFileConventions(file.path, fileInfo));

      // Check symbol-level conventions
      for (const symbol of fileInfo.symbols) {
        violations.push(...this.checkSymbolConventions(symbol, file.path));
      }
    }

    return violations;
  }

  /**
   * Check all conventions (not just diff)
   */
  checkAll(files: Map<string, FileInfo>): ConventionViolation[] {
    const violations: ConventionViolation[] = [];

    for (const [filePath, fileInfo] of files) {
      violations.push(...this.checkFileConventions(filePath, fileInfo));

      for (const symbol of fileInfo.symbols) {
        violations.push(...this.checkSymbolConventions(symbol, filePath));
      }
    }

    return violations;
  }

  private checkFileConventions(filePath: string, fileInfo: FileInfo): ConventionViolation[] {
    const violations: ConventionViolation[] = [];

    // Check: File size
    if (fileInfo.lines > 500) {
      violations.push({
        convention: this.getConvention('file-size')!,
        filePath,
        line: 1,
        column: 1,
        message: `File has ${fileInfo.lines} lines, exceeds recommended 500`,
        suggestion: 'Consider splitting into smaller modules',
      });
    }

    // Check: Too many exports
    if (fileInfo.exports.length > 10) {
      violations.push({
        convention: this.getConvention('export-count')!,
        filePath,
        line: 1,
        column: 1,
        message: `File has ${fileInfo.exports.length} exports, exceeds recommended 10`,
        suggestion: 'Consider grouping related exports or splitting the module',
      });
    }

    return violations;
  }

  private checkSymbolConventions(
    symbol: { name: string; kind: string; line: number },
    filePath: string
  ): ConventionViolation[] {
    const violations: ConventionViolation[] = [];

    // Check: Class naming (PascalCase)
    if (symbol.kind === 'class' && !/^[A-Z][a-zA-Z0-9]*$/.test(symbol.name)) {
      violations.push({
        convention: this.getConvention('class-naming')!,
        filePath,
        line: symbol.line,
        column: 1,
        message: `Class '${symbol.name}' should use PascalCase`,
        suggestion: `Rename to ${this.toPascalCase(symbol.name)}`,
      });
    }

    // Check: Interface naming (PascalCase, optionally prefixed with I)
    if (symbol.kind === 'interface' && !/^I?[A-Z][a-zA-Z0-9]*$/.test(symbol.name)) {
      violations.push({
        convention: this.getConvention('interface-naming')!,
        filePath,
        line: symbol.line,
        column: 1,
        message: `Interface '${symbol.name}' should use PascalCase`,
      });
    }

    // Check: Function naming (camelCase)
    if (symbol.kind === 'function' && !/^[a-z][a-zA-Z0-9]*$/.test(symbol.name)) {
      violations.push({
        convention: this.getConvention('function-naming')!,
        filePath,
        line: symbol.line,
        column: 1,
        message: `Function '${symbol.name}' should use camelCase`,
        suggestion: `Rename to ${this.toCamelCase(symbol.name)}`,
      });
    }

    // Check: Constant naming (SCREAMING_SNAKE_CASE for true constants)
    if (symbol.kind === 'variable' && symbol.name === symbol.name.toUpperCase() && symbol.name.length > 1) {
      // This is likely intentional constant naming - no violation
    }

    return violations;
  }

  private loadDefaultConventions(): void {
    this.conventions = [
      {
        id: 'file-size',
        name: 'File Size',
        description: 'Files should not exceed 500 lines',
        category: 'structure',
        severity: 'warning',
        check: { type: 'custom', message: 'File exceeds recommended size' },
      },
      {
        id: 'export-count',
        name: 'Export Count',
        description: 'Files should not have more than 10 exports',
        category: 'exports',
        severity: 'warning',
        check: { type: 'custom', message: 'Too many exports in file' },
      },
      {
        id: 'class-naming',
        name: 'Class Naming',
        description: 'Classes should use PascalCase',
        category: 'naming',
        severity: 'warning',
        check: { type: 'regex', pattern: '^[A-Z][a-zA-Z0-9]*$', message: 'Use PascalCase' },
      },
      {
        id: 'interface-naming',
        name: 'Interface Naming',
        description: 'Interfaces should use PascalCase',
        category: 'naming',
        severity: 'warning',
        check: { type: 'regex', pattern: '^I?[A-Z][a-zA-Z0-9]*$', message: 'Use PascalCase' },
      },
      {
        id: 'function-naming',
        name: 'Function Naming',
        description: 'Functions should use camelCase',
        category: 'naming',
        severity: 'warning',
        check: { type: 'regex', pattern: '^[a-z][a-zA-Z0-9]*$', message: 'Use camelCase' },
      },
    ];
  }

  private getConvention(id: string): Convention | undefined {
    return this.conventions.find(c => c.id === id);
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toLowerCase());
  }
}
