import * as path from 'node:path';
import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

export class PhpProvider extends BaseLanguageProvider {
  id = 'php';
  name = 'PHP';
  extensions = ['.php'];
  filePatterns = ['**/*.php'];

  getLanguageName(_ext: string): string {
    return 'php';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');
    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const useMatch = /^use\s+([^;]+);/.exec(line);
      if (useMatch) {
        const source = useMatch[1].split(/\s+as\s+/)[0].trim().replace(/^\\/, '');
        imports.push({
          source,
          specifiers: [source.split('\\').pop() || source],
          isDefault: false,
          isNamespace: true,
          line: index + 1,
        });
        continue;
      }
      const includeMatch = /^(?:require|require_once|include|include_once)\s*(?:\(|)\s*['"]([^'"]+)['"]/.exec(line);
      if (includeMatch) {
        imports.push({
          source: includeMatch[1],
          specifiers: [],
          isDefault: true,
          isNamespace: false,
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
      const classMatch = /^(?:abstract\s+|final\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({ name: classMatch[1], kind: 'class', isDefault: true, line: index + 1 });
        continue;
      }
      const interfaceMatch = /^interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        exports.push({ name: interfaceMatch[1], kind: 'interface', isDefault: true, line: index + 1 });
        continue;
      }
      const traitMatch = /^trait\s+(\w+)/.exec(line);
      if (traitMatch) {
        exports.push({ name: traitMatch[1], kind: 'interface', isDefault: true, line: index + 1 });
        continue;
      }
      const funcMatch = /^function\s+(\w+)/.exec(line);
      if (funcMatch) {
        exports.push({ name: funcMatch[1], kind: 'function', isDefault: true, line: index + 1 });
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
      const classMatch = /^(?:abstract\s+|final\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        currentClass = classMatch[1];
        symbols.push({ name: currentClass, kind: 'class', filePath, line: index + 1, column: 0, exported: true, references: [] });
        continue;
      }
      const interfaceMatch = /^interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        symbols.push({ name: interfaceMatch[1], kind: 'interface', filePath, line: index + 1, column: 0, exported: true, references: [] });
        continue;
      }
      const traitMatch = /^trait\s+(\w+)/.exec(line);
      if (traitMatch) {
        symbols.push({ name: traitMatch[1], kind: 'interface', filePath, line: index + 1, column: 0, exported: true, references: [] });
        continue;
      }
      const methodMatch = /^(?:public|private|protected)?\s*function\s+(\w+)/.exec(line);
      if (methodMatch) {
        symbols.push({ name: methodMatch[1], kind: currentClass ? 'method' : 'function', filePath, line: index + 1, column: 0, exported: !line.startsWith('private '), parentSymbol: currentClass, references: [] });
        continue;
      }
      const propertyMatch = /^(?:public|private|protected)\s+(?:static\s+)?\$(\w+)/.exec(line);
      if (propertyMatch) {
        symbols.push({ name: propertyMatch[1], kind: 'property', filePath, line: index + 1, column: 0, exported: !line.startsWith('private '), parentSymbol: currentClass, references: [] });
      }
    }
    return symbols;
  }

  resolveImportPath(fromPath: string, importSource: string, existingFiles: Set<string>): string | null {
    if (importSource.startsWith('./') || importSource.startsWith('../')) {
      const resolved = path.join(path.dirname(fromPath), importSource).replace(/\\/g, '/');
      const candidates = [resolved, `${resolved}.php`, `${resolved}/index.php`];
      return candidates.find((candidate) => existingFiles.has(candidate)) || null;
    }

    const namespacePath = importSource.replace(/\\/g, '/');
    const candidates = [`${namespacePath}.php`, `src/${namespacePath}.php`, `app/${namespacePath}.php`];
    return candidates.find((candidate) => existingFiles.has(candidate)) || null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [/\bif\s*\(/g, /\belseif\s*\(/g, /\belse\b/g, /\bfor\s*\(/g, /\bforeach\s*\(/g, /\bwhile\s*\(/g, /\bswitch\s*\(/g, /\bcase\s+/g, /\bcatch\s*\(/g, /\?[^:]/g, /&&/g, /\|\|/g];
  }

  getCommentPatterns(): CommentPatterns {
    return { singleLine: /\/\/|#/, blockStart: /\/\*/, blockEnd: /\*\// };
  }

  getEntryPointPatterns(): RegExp[] {
    return [/Route::(get|post|put|delete|patch)/, /->get\s*\(/, /->post\s*\(/, /class\s+\w+Controller/, /function\s+handle\s*\(/];
  }
}
