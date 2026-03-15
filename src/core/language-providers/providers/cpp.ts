import * as path from 'node:path';
import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

export class CppProvider extends BaseLanguageProvider {
  id = 'cpp';
  name = 'C/C++';
  extensions = ['.c', '.cc', '.cpp', '.cxx', '.h', '.hpp', '.hh', '.hxx'];
  filePatterns = ['**/*.c', '**/*.cc', '**/*.cpp', '**/*.cxx', '**/*.h', '**/*.hpp', '**/*.hh', '**/*.hxx'];

  getLanguageName(ext: string): string {
    return ['.c', '.h'].includes(ext) ? 'c' : 'cpp';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    return content.split('\n').flatMap((rawLine, index) => {
      const match = /^#include\s+[<"]([^>"]+)[>"]/.exec(rawLine.trim());
      if (!match) {
        return [];
      }
      return [{
        source: match[1],
        specifiers: [path.basename(match[1], path.extname(match[1]))],
        isDefault: true,
        isNamespace: false,
        line: index + 1,
      }];
    });
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');
    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const classMatch = /^(?:template<[^>]+>\s*)?(?:class|struct)\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({ name: classMatch[1], kind: 'class', isDefault: true, line: index + 1 });
        continue;
      }
      const enumMatch = /^enum(?:\s+class)?\s+(\w+)/.exec(line);
      if (enumMatch) {
        exports.push({ name: enumMatch[1], kind: 'enum', isDefault: true, line: index + 1 });
        continue;
      }
      const funcMatch = /^(?:inline\s+|static\s+|constexpr\s+|virtual\s+|extern\s+)*(?:[\w:<>*&]+\s+)+(\w+)\s*\([^;]*\)\s*(?:\{|$)/.exec(line);
      if (funcMatch && !line.startsWith('if') && !line.startsWith('for') && !line.startsWith('while') && !line.startsWith('switch')) {
        exports.push({ name: funcMatch[1], kind: 'function', isDefault: true, line: index + 1 });
      }
    }
    return exports;
  }

  extractSymbols(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');
    let currentType: string | undefined;

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const classMatch = /^(?:template<[^>]+>\s*)?(class|struct)\s+(\w+)/.exec(line);
      if (classMatch) {
        currentType = classMatch[2];
        symbols.push({ name: currentType, kind: 'class', filePath, line: index + 1, column: 0, exported: true, references: [] });
        continue;
      }
      const enumMatch = /^enum(?:\s+class)?\s+(\w+)/.exec(line);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], kind: 'enum', filePath, line: index + 1, column: 0, exported: true, references: [] });
        continue;
      }
      const funcMatch = /^(?:inline\s+|static\s+|constexpr\s+|virtual\s+|extern\s+)*(?:[\w:<>*&]+\s+)+(\w+)\s*\([^;]*\)\s*(?:\{|$)/.exec(line);
      if (funcMatch && !line.startsWith('if') && !line.startsWith('for') && !line.startsWith('while') && !line.startsWith('switch')) {
        symbols.push({ name: funcMatch[1], kind: currentType ? 'method' : 'function', filePath, line: index + 1, column: 0, exported: true, parentSymbol: currentType, references: [] });
        continue;
      }
      const propertyMatch = /^(?:static\s+)?[\w:<>*&]+\s+(\w+)\s*;/.exec(line);
      if (propertyMatch && currentType) {
        symbols.push({ name: propertyMatch[1], kind: 'property', filePath, line: index + 1, column: 0, exported: true, parentSymbol: currentType, references: [] });
      }
    }
    return symbols;
  }

  resolveImportPath(fromPath: string, importSource: string, existingFiles: Set<string>): string | null {
    if (importSource.startsWith('/')) {
      return existingFiles.has(importSource) ? importSource : null;
    }
    const resolved = path.join(path.dirname(fromPath), importSource).replace(/\\/g, '/');
    const candidates = [resolved, `${resolved}.h`, `${resolved}.hpp`, `${resolved}.hh`, `${resolved}.hxx`, `${resolved}.c`, `${resolved}.cpp`, `${resolved}.cc`];
    return candidates.find((candidate) => existingFiles.has(candidate)) || null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [/\bif\s*\(/g, /\belse\s+if\s*\(/g, /\belse\b/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bswitch\s*\(/g, /\bcase\s+/g, /\bcatch\s*\(/g, /\?[^:]/g, /&&/g, /\|\|/g];
  }

  getCommentPatterns(): CommentPatterns {
    return { singleLine: /\/\//, blockStart: /\/\*/, blockEnd: /\*\// };
  }

  getEntryPointPatterns(): RegExp[] {
    return [/\bmain\s*\(/, /\bWinMain\s*\(/, /\bTEST(_F|_P)?\s*\(/, /\bBOOST_AUTO_TEST_CASE\s*\(/];
  }
}
