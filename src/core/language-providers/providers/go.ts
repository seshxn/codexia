import * as path from 'node:path';
import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

/**
 * Go language provider
 */
export class GoProvider extends BaseLanguageProvider {
  id = 'go';
  name = 'Go';
  extensions = ['.go'];
  filePatterns = ['**/*.go'];

  getLanguageName(_ext: string): string {
    return 'go';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    let inImportBlock = false;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // Single import: import "package"
      const singleMatch = /^import\s+(?:(\w+)\s+)?["']([^"']+)["']/.exec(line);
      if (singleMatch && !line.includes('(')) {
        const alias = singleMatch[1];
        const source = singleMatch[2];
        imports.push({
          source,
          specifiers: [alias || source.split('/').pop() || source],
          isDefault: true,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // Start of import block
      if (/^import\s*\(/.test(line)) {
        inImportBlock = true;
        continue;
      }

      // End of import block
      if (inImportBlock && line === ')') {
        inImportBlock = false;
        continue;
      }

      // Import within block
      if (inImportBlock) {
        const blockMatch = /^(?:(\w+)\s+)?["']([^"']+)["']/.exec(line);
        if (blockMatch) {
          const alias = blockMatch[1];
          const source = blockMatch[2];
          imports.push({
            source,
            specifiers: [alias || source.split('/').pop() || source],
            isDefault: true,
            isNamespace: alias === '.',
            line: lineNum + 1,
          });
        }
      }
    }

    return imports;
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // Exported function (starts with uppercase)
      const funcMatch = /^func\s+(\([^)]+\)\s+)?([A-Z]\w*)\s*\(/.exec(line);
      if (funcMatch) {
        exports.push({
          name: funcMatch[2],
          kind: 'function',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // Exported type
      const typeMatch = /^type\s+([A-Z]\w*)\s+/.exec(line);
      if (typeMatch) {
        const isInterface = line.includes('interface');
        exports.push({
          name: typeMatch[1],
          kind: isInterface ? 'interface' : 'type',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // Exported const/var
      const varMatch = /^(?:const|var)\s+([A-Z]\w*)\s*/.exec(line);
      if (varMatch) {
        exports.push({
          name: varMatch[1],
          kind: 'variable',
          isDefault: false,
          line: lineNum + 1,
        });
      }
    }

    return exports;
  }

  extractSymbols(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // package declaration
      const pkgMatch = /^package\s+(\w+)/.exec(trimmed);
      if (pkgMatch) {
        symbols.push({
          name: pkgMatch[1],
          kind: 'namespace',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: true,
          references: [],
        });
        continue;
      }

      // func (receiver) FunctionName()
      const methodMatch = /^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\(/.exec(trimmed);
      if (methodMatch) {
        symbols.push({
          name: methodMatch[3],
          kind: 'method',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: /^[A-Z]/.test(methodMatch[3]),
          references: [],
        });
        continue;
      }

      // func FunctionName()
      const funcMatch = /^func\s+(\w+)\s*\(/.exec(trimmed);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          kind: 'function',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: /^[A-Z]/.test(funcMatch[1]),
          references: [],
        });
        continue;
      }

      // type TypeName struct/interface
      const typeMatch = /^type\s+(\w+)\s+(struct|interface)/.exec(trimmed);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: typeMatch[2] === 'interface' ? 'interface' : 'class',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: /^[A-Z]/.test(typeMatch[1]),
          references: [],
        });
        continue;
      }

      // type TypeName = OtherType (type alias)
      const aliasMatch = /^type\s+(\w+)\s+=/.exec(trimmed);
      if (aliasMatch) {
        symbols.push({
          name: aliasMatch[1],
          kind: 'type',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: /^[A-Z]/.test(aliasMatch[1]),
          references: [],
        });
        continue;
      }

      // const/var declarations
      const varMatch = /^(?:const|var)\s+(\w+)/.exec(trimmed);
      if (varMatch) {
        symbols.push({
          name: varMatch[1],
          kind: 'variable',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: /^[A-Z]/.test(varMatch[1]),
          references: [],
        });
      }
    }

    return symbols;
  }

  resolveImportPath(
    fromPath: string,
    importSource: string,
    existingFiles: Set<string>
  ): string | null {
    // Go imports are typically absolute package paths
    // Check if it's a relative path (starts with . or /)
    if (importSource.startsWith('.') || importSource.startsWith('/')) {
      const dir = path.dirname(fromPath);
      const resolved = path.join(dir, importSource).replace(/\\/g, '/');
      
      // Go packages are directories - look for .go files
      for (const file of existingFiles) {
        if (file.startsWith(resolved + '/') && file.endsWith('.go')) {
          return file;
        }
      }
    }

    // Check for internal packages
    const internalPath = `internal/${importSource.split('/').pop()}`;
    for (const file of existingFiles) {
      if (file.includes(internalPath) && file.endsWith('.go')) {
        return file;
      }
    }

    return null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [
      /\bif\s+/g,
      /\belse\s+if\s+/g,
      /\belse\s*\{/g,
      /\bfor\s+/g,
      /\bswitch\s+/g,
      /\bcase\s+/g,
      /\bdefault\s*:/g,
      /\bselect\s*\{/g,
      /\bgo\s+/g,
      /\bdefer\s+/g,
      /&&/g,
      /\|\|/g,
    ];
  }

  getCommentPatterns(): CommentPatterns {
    return {
      singleLine: /\/\//,
      blockStart: /\/\*/,
      blockEnd: /\*\//,
    };
  }

  getEntryPointPatterns(): RegExp[] {
    return [
      /func\s+main\s*\(/,
      /func\s+init\s*\(/,
      /http\.HandleFunc/,
      /\.GET\s*\(/,
      /\.POST\s*\(/,
      /\.PUT\s*\(/,
      /\.DELETE\s*\(/,
      /r\.HandleFunc/,
      /mux\.Handle/,
      /gin\./,
      /echo\./,
    ];
  }
}
