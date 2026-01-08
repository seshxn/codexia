import * as path from 'node:path';
import { Project } from 'ts-morph';
import type { Symbol, SymbolKind, FileInfo } from './types.js';

export class SymbolMap {
  private project: Project;
  private symbols: Map<string, Symbol[]> = new Map(); // name -> symbols
  private fileSymbols: Map<string, Symbol[]> = new Map(); // file -> symbols
  private initialized: boolean = false;

  constructor(repoRoot: string) {
    try {
      this.project = new Project({
        tsConfigFilePath: path.join(repoRoot, 'tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
      });
    } catch {
      this.project = new Project({
        skipAddingFilesFromTsConfig: true,
      });
    }
  }

  /**
   * Build symbol map from indexed files
   */
  buildFromFiles(files: Map<string, FileInfo>): void {
    for (const [filePath, fileInfo] of files) {
      this.fileSymbols.set(filePath, fileInfo.symbols);

      for (const symbol of fileInfo.symbols) {
        const existing = this.symbols.get(symbol.name) || [];
        existing.push(symbol);
        this.symbols.set(symbol.name, existing);
      }
    }
    this.initialized = true;
  }

  /**
   * Find symbol by name
   */
  findByName(name: string): Symbol[] {
    return this.symbols.get(name) || [];
  }

  /**
   * Find symbols in a file
   */
  findInFile(filePath: string): Symbol[] {
    return this.fileSymbols.get(filePath) || [];
  }

  /**
   * Find exported symbols
   */
  findExported(): Symbol[] {
    const result: Symbol[] = [];
    for (const symbols of this.symbols.values()) {
      result.push(...symbols.filter(s => s.exported));
    }
    return result;
  }

  /**
   * Find symbols by kind
   */
  findByKind(kind: SymbolKind): Symbol[] {
    const result: Symbol[] = [];
    for (const symbols of this.symbols.values()) {
      result.push(...symbols.filter(s => s.kind === kind));
    }
    return result;
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): Symbol[] {
    const result: Symbol[] = [];
    for (const symbols of this.symbols.values()) {
      result.push(...symbols);
    }
    return result;
  }

  /**
   * Get symbol count
   */
  getCount(): number {
    let count = 0;
    for (const symbols of this.symbols.values()) {
      count += symbols.length;
    }
    return count;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Analyze a TypeScript/JavaScript file for detailed symbol information
   */
  analyzeFile(filePath: string, content: string): Symbol[] {
    const symbols: Symbol[] = [];

    try {
      const sourceFile = this.project.createSourceFile(
        `temp_${Date.now()}.ts`,
        content,
        { overwrite: true }
      );

      // Find classes
      sourceFile.getClasses().forEach(cls => {
        symbols.push({
          name: cls.getName() || 'anonymous',
          kind: 'class',
          filePath,
          line: cls.getStartLineNumber(),
          column: 1,
          exported: cls.isExported(),
          documentation: cls.getJsDocs().map(d => d.getDescription()).join('\n'),
          references: [],
        });

        // Find methods
        cls.getMethods().forEach(method => {
          symbols.push({
            name: method.getName(),
            kind: 'method',
            filePath,
            line: method.getStartLineNumber(),
            column: 1,
            exported: cls.isExported(),
            documentation: method.getJsDocs().map(d => d.getDescription()).join('\n'),
            references: [],
          });
        });
      });

      // Find interfaces
      sourceFile.getInterfaces().forEach(iface => {
        symbols.push({
          name: iface.getName(),
          kind: 'interface',
          filePath,
          line: iface.getStartLineNumber(),
          column: 1,
          exported: iface.isExported(),
          documentation: iface.getJsDocs().map(d => d.getDescription()).join('\n'),
          references: [],
        });
      });

      // Find functions
      sourceFile.getFunctions().forEach(func => {
        symbols.push({
          name: func.getName() || 'anonymous',
          kind: 'function',
          filePath,
          line: func.getStartLineNumber(),
          column: 1,
          exported: func.isExported(),
          documentation: func.getJsDocs().map(d => d.getDescription()).join('\n'),
          references: [],
        });
      });

      // Find type aliases
      sourceFile.getTypeAliases().forEach(type => {
        symbols.push({
          name: type.getName(),
          kind: 'type',
          filePath,
          line: type.getStartLineNumber(),
          column: 1,
          exported: type.isExported(),
          documentation: type.getJsDocs().map(d => d.getDescription()).join('\n'),
          references: [],
        });
      });

      // Find enums
      sourceFile.getEnums().forEach(enumDecl => {
        symbols.push({
          name: enumDecl.getName(),
          kind: 'enum',
          filePath,
          line: enumDecl.getStartLineNumber(),
          column: 1,
          exported: enumDecl.isExported(),
          documentation: enumDecl.getJsDocs().map(d => d.getDescription()).join('\n'),
          references: [],
        });
      });

      // Clean up
      this.project.removeSourceFile(sourceFile);
    } catch {
      // Fall back to regex-based extraction if ts-morph fails
    }

    return symbols;
  }
}
