import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

export class SwiftProvider extends BaseLanguageProvider {
  id = 'swift';
  name = 'Swift';
  extensions = ['.swift'];
  filePatterns = ['**/*.swift'];

  getLanguageName(_ext: string): string {
    return 'swift';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    return content.split('\n').flatMap((rawLine, index) => {
      const match = /^import\s+(\w+)/.exec(rawLine.trim());
      if (!match) {
        return [];
      }
      return [{
        source: match[1],
        specifiers: [match[1]],
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
      const classMatch = /^(?:public\s+|open\s+)?(?:final\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({ name: classMatch[1], kind: 'class', isDefault: /^(public|open)\s/.test(line), line: index + 1 });
        continue;
      }
      const structMatch = /^(?:public\s+)?struct\s+(\w+)/.exec(line);
      if (structMatch) {
        exports.push({ name: structMatch[1], kind: 'class', isDefault: line.startsWith('public '), line: index + 1 });
        continue;
      }
      const protocolMatch = /^(?:public\s+)?protocol\s+(\w+)/.exec(line);
      if (protocolMatch) {
        exports.push({ name: protocolMatch[1], kind: 'interface', isDefault: line.startsWith('public '), line: index + 1 });
        continue;
      }
      const funcMatch = /^(?:public\s+|open\s+)?func\s+(\w+)/.exec(line);
      if (funcMatch) {
        exports.push({ name: funcMatch[1], kind: 'function', isDefault: /^(public|open)\s/.test(line), line: index + 1 });
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
      const typeMatch = /^(?:public\s+|open\s+|private\s+|internal\s+)?(?:final\s+)?(class|struct|enum|protocol)\s+(\w+)/.exec(line);
      if (typeMatch) {
        currentType = typeMatch[2];
        const kind = typeMatch[1] === 'protocol' ? 'interface' : (typeMatch[1] === 'enum' ? 'enum' : 'class');
        symbols.push({ name: currentType, kind, filePath, line: index + 1, column: 0, exported: /^(public|open)\s/.test(line), references: [] });
        continue;
      }

      const funcMatch = /^(?:public\s+|open\s+|private\s+|internal\s+)?func\s+(\w+)/.exec(line);
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], kind: currentType ? 'method' : 'function', filePath, line: index + 1, column: 0, exported: /^(public|open)\s/.test(line), parentSymbol: currentType, references: [] });
        continue;
      }

      const propertyMatch = /^(?:public\s+|open\s+|private\s+|internal\s+)?(?:let|var)\s+(\w+)/.exec(line);
      if (propertyMatch) {
        symbols.push({ name: propertyMatch[1], kind: 'property', filePath, line: index + 1, column: 0, exported: /^(public|open)\s/.test(line), parentSymbol: currentType, references: [] });
      }
    }

    return symbols;
  }

  resolveImportPath(_fromPath: string, importSource: string, existingFiles: Set<string>): string | null {
    const candidate = `${importSource}.swift`;
    if (existingFiles.has(candidate)) {
      return candidate;
    }
    return null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [/\bif\s+/g, /\bguard\s+/g, /\belse\b/g, /\bfor\s+/g, /\bwhile\s+/g, /\bswitch\s+/g, /\bcase\s+/g, /\bcatch\b/g, /\?[^:]/g, /&&/g, /\|\|/g];
  }

  getCommentPatterns(): CommentPatterns {
    return { singleLine: /\/\//, blockStart: /\/\*/, blockEnd: /\*\// };
  }

  getEntryPointPatterns(): RegExp[] {
    return [/@main\b/, /UIApplicationMain/, /@UIApplicationDelegateAdaptor/, /NavigationStack\s*\{/, /Route\s*\(/];
  }
}
