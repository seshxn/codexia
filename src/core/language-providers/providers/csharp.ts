import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

export class CSharpProvider extends BaseLanguageProvider {
  id = 'csharp';
  name = 'C#';
  extensions = ['.cs'];
  filePatterns = ['**/*.cs'];

  getLanguageName(_ext: string): string {
    return 'csharp';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const usingMatch = /^using\s+(?:static\s+)?([\w.]+)\s*;/.exec(line);
      if (usingMatch) {
        const source = usingMatch[1];
        imports.push({
          source,
          specifiers: [source.split('.').pop() || source],
          isDefault: false,
          isNamespace: true,
          line: index + 1,
        });
      }
    }

    return imports;
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const classMatch = /^(?:public\s+)?(?:abstract\s+|sealed\s+|partial\s+)*class\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({ name: classMatch[1], kind: 'class', isDefault: line.includes('public'), line: index + 1 });
        continue;
      }
      const interfaceMatch = /^(?:public\s+)?interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        exports.push({ name: interfaceMatch[1], kind: 'interface', isDefault: line.includes('public'), line: index + 1 });
        continue;
      }
      const enumMatch = /^(?:public\s+)?enum\s+(\w+)/.exec(line);
      if (enumMatch) {
        exports.push({ name: enumMatch[1], kind: 'enum', isDefault: line.includes('public'), line: index + 1 });
      }
    }

    return exports;
  }

  extractSymbols(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');
    let currentClass: string | undefined;

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const classMatch = /^(?:public\s+|private\s+|protected\s+|internal\s+)?(?:abstract\s+|sealed\s+|partial\s+)*class\s+(\w+)/.exec(line);
      if (classMatch) {
        currentClass = classMatch[1];
        symbols.push(this.createSymbol(classMatch[1], 'class', filePath, index + 1, line.includes('public')));
        continue;
      }

      const interfaceMatch = /^(?:public\s+|private\s+|protected\s+|internal\s+)?interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        symbols.push(this.createSymbol(interfaceMatch[1], 'interface', filePath, index + 1, line.includes('public')));
        continue;
      }

      const enumMatch = /^(?:public\s+|private\s+|protected\s+|internal\s+)?enum\s+(\w+)/.exec(line);
      if (enumMatch) {
        symbols.push(this.createSymbol(enumMatch[1], 'enum', filePath, index + 1, line.includes('public')));
        continue;
      }

      const methodMatch = /^(?:public|private|protected|internal)\s+(?:static\s+|virtual\s+|override\s+|async\s+|sealed\s+|abstract\s+)*(?:[\w<>\[\],?]+\s+)+(\w+)\s*\([^;]*\)\s*(?:\{|=>)/.exec(line);
      if (methodMatch) {
        const name = methodMatch[1];
        if (name !== currentClass) {
          symbols.push({
            ...this.createSymbol(name, currentClass ? 'method' : 'function', filePath, index + 1, line.includes('public')),
            parentSymbol: currentClass,
          });
        }
        continue;
      }

      const propertyMatch = /^(?:public|private|protected|internal)\s+(?:static\s+)?[\w<>\[\],?]+\s+(\w+)\s*\{\s*(?:get|set)/.exec(line);
      if (propertyMatch) {
        symbols.push({
          ...this.createSymbol(propertyMatch[1], 'property', filePath, index + 1, line.includes('public')),
          parentSymbol: currentClass,
        });
      }
    }

    return symbols;
  }

  resolveImportPath(_fromPath: string, importSource: string, existingFiles: Set<string>): string | null {
    const namespacePath = importSource.replace(/\./g, '/');
    const candidates = [
      `${namespacePath}.cs`,
      `src/${namespacePath}.cs`,
    ];
    return candidates.find((candidate) => existingFiles.has(candidate)) || null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [/\bif\s*\(/g, /\belse\s+if\s*\(/g, /\belse\b/g, /\bfor\s*\(/g, /\bforeach\s*\(/g, /\bwhile\s*\(/g, /\bswitch\s*\(/g, /\bcase\s+/g, /\bcatch\s*\(/g, /\?[^:]/g, /&&/g, /\|\|/g];
  }

  getCommentPatterns(): CommentPatterns {
    return { singleLine: /\/\//, blockStart: /\/\*/, blockEnd: /\*\// };
  }

  getEntryPointPatterns(): RegExp[] {
    return [/static\s+void\s+Main\s*\(/, /\[ApiController\]/, /\[HttpGet/, /\[HttpPost/, /\[HttpPut/, /\[HttpDelete/, /MapGet\s*\(/, /MapPost\s*\(/];
  }

  private createSymbol(name: string, kind: Symbol['kind'], filePath: string, line: number, exported: boolean): Symbol {
    return { name, kind, filePath, line, column: 0, exported, references: [] };
  }
}
