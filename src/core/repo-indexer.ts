import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import type { FileInfo, ImportInfo, ExportInfo, Symbol, SymbolKind } from './types.js';

export class RepoIndexer {
  private repoRoot: string;
  private files: Map<string, FileInfo> = new Map();
  private indexed: boolean = false;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Index the repository
   */
  async index(): Promise<void> {
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.mjs',
      '**/*.cjs',
    ];

    const ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
    ];

    const filePaths = await glob(patterns, {
      cwd: this.repoRoot,
      ignore: ignorePatterns,
      absolute: false,
    });

    for (const relativePath of filePaths) {
      const absolutePath = path.join(this.repoRoot, relativePath);
      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        const fileInfo = this.analyzeFile(relativePath, content);
        this.files.set(relativePath, fileInfo);
      } catch {
        // Skip files that can't be read
      }
    }

    this.indexed = true;
  }

  /**
   * Get all indexed files
   */
  getFiles(): Map<string, FileInfo> {
    return this.files;
  }

  /**
   * Get file info by path
   */
  getFile(filePath: string): FileInfo | undefined {
    return this.files.get(filePath);
  }

  /**
   * Check if repository has been indexed
   */
  isIndexed(): boolean {
    return this.indexed;
  }

  /**
   * Get statistics about the indexed repository
   */
  getStats(): { files: number; symbols: number; exports: number; avgFanOut: number } {
    let totalSymbols = 0;
    let totalExports = 0;
    let totalImports = 0;

    for (const file of this.files.values()) {
      totalSymbols += file.symbols.length;
      totalExports += file.exports.length;
      totalImports += file.imports.length;
    }

    const avgFanOut = this.files.size > 0 ? totalImports / this.files.size : 0;

    return {
      files: this.files.size,
      symbols: totalSymbols,
      exports: totalExports,
      avgFanOut: Math.round(avgFanOut * 10) / 10,
    };
  }

  private analyzeFile(relativePath: string, content: string): FileInfo {
    const lines = content.split('\n');
    const language = this.getLanguage(relativePath);
    const imports = this.extractImports(content);
    const exports = this.extractExports(content);
    const symbols = this.extractSymbols(content, relativePath);

    return {
      path: path.join(this.repoRoot, relativePath),
      relativePath,
      language,
      size: content.length,
      lines: lines.length,
      symbols,
      imports,
      exports,
    };
  }

  private getLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
    };
    return langMap[ext] || 'unknown';
  }

  private extractImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    const importRegex = /^import\s+(?:(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))(?:\s*,\s*)?)*\s*from\s*['"]([^'"]+)['"]/;
    const defaultImportRegex = /^import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      const match = trimmed.match(importRegex);
      if (match) {
        const specifiers: string[] = [];
        let isDefault = false;
        let isNamespace = false;

        if (match[1]) {
          // Named imports: { a, b, c }
          const named = match[1].replace(/[{}]/g, '').split(',').map(s => s.trim());
          specifiers.push(...named);
        }
        if (match[2]) {
          // Namespace import: * as name
          isNamespace = true;
          specifiers.push(match[2].replace('* as ', '').trim());
        }
        if (match[3]) {
          // Default import
          isDefault = true;
          specifiers.push(match[3]);
        }

        imports.push({
          source: match[4],
          specifiers,
          isDefault,
          isNamespace,
          line: index + 1,
        });
        return;
      }

      const defaultMatch = trimmed.match(defaultImportRegex);
      if (defaultMatch) {
        imports.push({
          source: defaultMatch[2],
          specifiers: [defaultMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: index + 1,
        });
      }
    });

    return imports;
  }

  private extractExports(content: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    const patterns: Array<{ regex: RegExp; kind: SymbolKind; isDefault: boolean }> = [
      { regex: /^export\s+default\s+class\s+(\w+)/, kind: 'class', isDefault: true },
      { regex: /^export\s+default\s+function\s+(\w+)/, kind: 'function', isDefault: true },
      { regex: /^export\s+class\s+(\w+)/, kind: 'class', isDefault: false },
      { regex: /^export\s+interface\s+(\w+)/, kind: 'interface', isDefault: false },
      { regex: /^export\s+type\s+(\w+)/, kind: 'type', isDefault: false },
      { regex: /^export\s+function\s+(\w+)/, kind: 'function', isDefault: false },
      { regex: /^export\s+const\s+(\w+)/, kind: 'variable', isDefault: false },
      { regex: /^export\s+let\s+(\w+)/, kind: 'variable', isDefault: false },
      { regex: /^export\s+enum\s+(\w+)/, kind: 'enum', isDefault: false },
    ];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      for (const { regex, kind, isDefault } of patterns) {
        const match = trimmed.match(regex);
        if (match) {
          exports.push({
            name: match[1],
            kind,
            isDefault,
            line: index + 1,
          });
          break;
        }
      }
    });

    return exports;
  }

  private extractSymbols(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    const patterns: Array<{ regex: RegExp; kind: SymbolKind }> = [
      { regex: /^(?:export\s+)?class\s+(\w+)/, kind: 'class' },
      { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
      { regex: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type' },
      { regex: /^(?:export\s+)?function\s+(\w+)/, kind: 'function' },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])*=>/, kind: 'function' },
      { regex: /^(?:export\s+)?const\s+(\w+)/, kind: 'variable' },
      { regex: /^(?:export\s+)?let\s+(\w+)/, kind: 'variable' },
      { regex: /^(?:export\s+)?enum\s+(\w+)/, kind: 'enum' },
      { regex: /^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/, kind: 'method' },
    ];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      for (const { regex, kind } of patterns) {
        const match = trimmed.match(regex);
        if (match && match[1] && !match[1].startsWith('_')) {
          const isExported = trimmed.startsWith('export');
          symbols.push({
            name: match[1],
            kind,
            filePath,
            line: index + 1,
            column: line.indexOf(match[1]) + 1,
            exported: isExported,
            references: [],
          });
          break;
        }
      }
    });

    return symbols;
  }
}
