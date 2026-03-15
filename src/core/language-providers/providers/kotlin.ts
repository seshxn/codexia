import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

export class KotlinProvider extends BaseLanguageProvider {
  id = 'kotlin';
  name = 'Kotlin';
  extensions = ['.kt', '.kts'];
  filePatterns = ['**/*.kt', '**/*.kts'];

  getLanguageName(_ext: string): string {
    return 'kotlin';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    return content.split('\n').flatMap((rawLine, index) => {
      const line = rawLine.trim();
      const match = /^import\s+([\w.*]+)(?:\s+as\s+(\w+))?/.exec(line);
      if (!match) {
        return [];
      }
      const source = match[1].replace(/\.\*$/, '');
      return [{
        source,
        specifiers: [match[2] || match[1].split('.').pop() || source],
        isDefault: false,
        isNamespace: match[1].endsWith('.*'),
        line: index + 1,
      }];
    });
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');
    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      const classMatch = /^(?:public\s+|internal\s+)?(?:data\s+|sealed\s+|abstract\s+|enum\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({ name: classMatch[1], kind: 'class', isDefault: !line.startsWith('private '), line: index + 1 });
        continue;
      }
      const interfaceMatch = /^(?:public\s+|internal\s+)?interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        exports.push({ name: interfaceMatch[1], kind: 'interface', isDefault: !line.startsWith('private '), line: index + 1 });
        continue;
      }
      const funcMatch = /^(?:public\s+|internal\s+)?fun\s+(\w+)/.exec(line);
      if (funcMatch) {
        exports.push({ name: funcMatch[1], kind: 'function', isDefault: !line.startsWith('private '), line: index + 1 });
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
      const classMatch = /^(?:public\s+|private\s+|internal\s+|protected\s+)?(?:data\s+|sealed\s+|abstract\s+|enum\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        currentClass = classMatch[1];
        symbols.push(this.createSymbol(classMatch[1], 'class', filePath, index + 1, !line.startsWith('private ')));
        continue;
      }
      const interfaceMatch = /^(?:public\s+|private\s+|internal\s+|protected\s+)?interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        symbols.push(this.createSymbol(interfaceMatch[1], 'interface', filePath, index + 1, !line.startsWith('private ')));
        continue;
      }
      const typeMatch = /^(?:public\s+|private\s+|internal\s+|protected\s+)?typealias\s+(\w+)/.exec(line);
      if (typeMatch) {
        symbols.push(this.createSymbol(typeMatch[1], 'type', filePath, index + 1, !line.startsWith('private ')));
        continue;
      }
      const funcMatch = /^(?:public\s+|private\s+|internal\s+|protected\s+)?fun\s+(\w+)/.exec(line);
      if (funcMatch) {
        symbols.push({ ...this.createSymbol(funcMatch[1], currentClass ? 'method' : 'function', filePath, index + 1, !line.startsWith('private ')), parentSymbol: currentClass });
        continue;
      }
      const propertyMatch = /^(?:public\s+|private\s+|internal\s+|protected\s+)?(?:lateinit\s+)?(?:val|var)\s+(\w+)/.exec(line);
      if (propertyMatch) {
        symbols.push({ ...this.createSymbol(propertyMatch[1], 'property', filePath, index + 1, !line.startsWith('private ')), parentSymbol: currentClass });
      }
    }

    return symbols;
  }

  resolveImportPath(_fromPath: string, importSource: string, existingFiles: Set<string>): string | null {
    const packagePath = importSource.replace(/\./g, '/');
    const candidates = [`${packagePath}.kt`, `${packagePath}.kts`, `src/main/kotlin/${packagePath}.kt`, `src/${packagePath}.kt`];
    return candidates.find((candidate) => existingFiles.has(candidate)) || null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [/\bif\s*\(/g, /\belse\b/g, /\bwhen\s*\(/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bcatch\s*\(/g, /\?[^:]/g, /&&/g, /\|\|/g];
  }

  getCommentPatterns(): CommentPatterns {
    return { singleLine: /\/\//, blockStart: /\/\*/, blockEnd: /\*\// };
  }

  getEntryPointPatterns(): RegExp[] {
    return [/fun\s+main\s*\(/, /@GetMapping/, /@PostMapping/, /@RequestMapping/, /routing\s*\{/];
  }

  private createSymbol(name: string, kind: Symbol['kind'], filePath: string, line: number, exported: boolean): Symbol {
    return { name, kind, filePath, line, column: 0, exported, references: [] };
  }
}
