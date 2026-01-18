import * as path from 'node:path';
import type { Symbol, SymbolKind, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

/**
 * TypeScript/JavaScript language provider
 */
export class TypeScriptProvider extends BaseLanguageProvider {
  id = 'typescript';
  name = 'TypeScript';
  extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  filePatterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs',
  ];

  getLanguageName(ext: string): string {
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      default:
        return 'typescript';
    }
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    // Process each line for imports
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Named imports: import { x, y } from 'module'
      const namedMatch = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/.exec(line);
      if (namedMatch) {
        const specifiers = namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
        imports.push({
          source: namedMatch[2],
          specifiers: specifiers.filter(s => s.length > 0),
          isDefault: false,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // Default import: import x from 'module'
      const defaultMatch = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/.exec(line);
      if (defaultMatch && !line.includes('{') && !line.includes('*')) {
        imports.push({
          source: defaultMatch[2],
          specifiers: [defaultMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // Namespace import: import * as x from 'module'
      const namespaceMatch = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/.exec(line);
      if (namespaceMatch) {
        imports.push({
          source: namespaceMatch[2],
          specifiers: [namespaceMatch[1]],
          isDefault: false,
          isNamespace: true,
          line: lineNum + 1,
        });
        continue;
      }

      // Side-effect import: import 'module'
      const sideEffectMatch = /^import\s+['"]([^'"]+)['"]/.exec(line.trim());
      if (sideEffectMatch) {
        imports.push({
          source: sideEffectMatch[1],
          specifiers: [],
          isDefault: false,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // require() calls
      const requireMatch = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(line);
      if (requireMatch) {
        imports.push({
          source: requireMatch[1],
          specifiers: [],
          isDefault: false,
          isNamespace: false,
          line: lineNum + 1,
        });
      }
    }

    return imports;
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // export default
      if (/export\s+default/.test(line)) {
        exports.push({
          name: 'default',
          kind: 'variable',
          isDefault: true,
          line: lineNum + 1,
        });
        continue;
      }

      // export class ClassName
      const classMatch = /export\s+(?:abstract\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({
          name: classMatch[1],
          kind: 'class',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // export interface InterfaceName
      const interfaceMatch = /export\s+interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        exports.push({
          name: interfaceMatch[1],
          kind: 'interface',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // export type TypeName
      const typeMatch = /export\s+type\s+(\w+)/.exec(line);
      if (typeMatch) {
        exports.push({
          name: typeMatch[1],
          kind: 'type',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // export function functionName
      const funcMatch = /export\s+(?:async\s+)?function\s+(\w+)/.exec(line);
      if (funcMatch) {
        exports.push({
          name: funcMatch[1],
          kind: 'function',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // export const/let/var variableName
      const varMatch = /export\s+(?:const|let|var)\s+(\w+)/.exec(line);
      if (varMatch) {
        exports.push({
          name: varMatch[1],
          kind: 'variable',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // export enum EnumName
      const enumMatch = /export\s+enum\s+(\w+)/.exec(line);
      if (enumMatch) {
        exports.push({
          name: enumMatch[1],
          kind: 'enum',
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

    const patterns: Array<{ regex: RegExp; kind: SymbolKind }> = [
      { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: 'class' },
      { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
      { regex: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type' },
      { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, kind: 'function' },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/, kind: 'function' },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function/, kind: 'function' },
      { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/, kind: 'variable' },
      { regex: /^(?:export\s+)?enum\s+(\w+)/, kind: 'enum' },
    ];

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      for (const { regex, kind } of patterns) {
        const match = regex.exec(line);
        if (match) {
          symbols.push({
            name: match[1],
            kind,
            filePath,
            line: lineNum + 1,
            column: 0,
            exported: line.startsWith('export'),
            references: [],
          });
          break;
        }
      }
    }

    return symbols;
  }

  resolveImportPath(
    fromPath: string,
    importSource: string,
    existingFiles: Set<string>
  ): string | null {
    // Skip external modules
    if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
      return null;
    }

    const dir = path.dirname(fromPath);
    let resolved = path.join(dir, importSource);
    
    // Normalize to forward slashes
    resolved = resolved.replace(/\\/g, '/');

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    
    // Try exact path first
    if (existingFiles.has(resolved)) {
      return resolved;
    }

    // Try with extensions
    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (existingFiles.has(withExt)) {
        return withExt;
      }
    }

    // Try as directory with index file
    for (const ext of extensions) {
      const indexPath = path.join(resolved, `index${ext}`).replace(/\\/g, '/');
      if (existingFiles.has(indexPath)) {
        return indexPath;
      }
    }

    // Handle .js extension mapping to .ts
    if (resolved.endsWith('.js')) {
      const tsPath = resolved.replace(/\.js$/, '.ts');
      if (existingFiles.has(tsPath)) {
        return tsPath;
      }
      const tsxPath = resolved.replace(/\.js$/, '.tsx');
      if (existingFiles.has(tsxPath)) {
        return tsxPath;
      }
    }

    return null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\belse\b/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bdo\s*\{/g,
      /\bswitch\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\?\?/g,         // Nullish coalescing
      /\?\./g,         // Optional chaining
      /\?[^:]/g,       // Ternary (not optional chain or nullish)
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
      /\.get\s*\(/,
      /\.post\s*\(/,
      /\.put\s*\(/,
      /\.delete\s*\(/,
      /\.patch\s*\(/,
      /app\.use\s*\(/,
      /router\./,
      /export\s+default\s+function\s+\w*Page/,
      /export\s+default\s+function\s+\w*Handler/,
      /getServerSideProps/,
      /getStaticProps/,
    ];
  }
}
