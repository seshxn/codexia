import * as path from 'node:path';
import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

/**
 * Ruby language provider
 */
export class RubyProvider extends BaseLanguageProvider {
  id = 'ruby';
  name = 'Ruby';
  extensions = ['.rb', '.rake', '.gemspec'];
  filePatterns = ['**/*.rb', '**/*.rake', '**/*.gemspec', '**/Rakefile', '**/Gemfile'];

  getLanguageName(_ext: string): string {
    return 'ruby';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // require 'module'
      const requireMatch = /^require\s+['"]([^'"]+)['"]/.exec(line);
      if (requireMatch) {
        imports.push({
          source: requireMatch[1],
          specifiers: [requireMatch[1].split('/').pop() || requireMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // require_relative 'path'
      const requireRelativeMatch = /^require_relative\s+['"]([^'"]+)['"]/.exec(line);
      if (requireRelativeMatch) {
        imports.push({
          source: requireRelativeMatch[1],
          specifiers: [requireRelativeMatch[1].split('/').pop() || requireRelativeMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // load 'file'
      const loadMatch = /^load\s+['"]([^'"]+)['"]/.exec(line);
      if (loadMatch) {
        imports.push({
          source: loadMatch[1],
          specifiers: [],
          isDefault: false,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // include ModuleName
      const includeMatch = /^include\s+(\w+(?:::\w+)*)/.exec(line);
      if (includeMatch) {
        imports.push({
          source: includeMatch[1],
          specifiers: [includeMatch[1]],
          isDefault: false,
          isNamespace: true,
          line: lineNum + 1,
        });
        continue;
      }

      // extend ModuleName
      const extendMatch = /^extend\s+(\w+(?:::\w+)*)/.exec(line);
      if (extendMatch) {
        imports.push({
          source: extendMatch[1],
          specifiers: [extendMatch[1]],
          isDefault: false,
          isNamespace: true,
          line: lineNum + 1,
        });
      }
    }

    return imports;
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    // Track nesting level
    let nestingLevel = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // Track nesting
      if (/^(?:class|module|def|if|unless|case|while|until|for|begin|do)\b/.test(trimmed)) {
        nestingLevel++;
      }
      if (/^end\b/.test(trimmed)) {
        nestingLevel = Math.max(0, nestingLevel - 1);
      }

      // Only export top-level definitions (inside one class/module is OK)
      if (nestingLevel > 2) continue;

      // class ClassName
      const classMatch = /^class\s+(\w+(?:::\w+)*)/.exec(trimmed);
      if (classMatch) {
        exports.push({
          name: classMatch[1],
          kind: 'class',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // module ModuleName
      const moduleMatch = /^module\s+(\w+(?:::\w+)*)/.exec(trimmed);
      if (moduleMatch) {
        exports.push({
          name: moduleMatch[1],
          kind: 'namespace',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // def method_name (top-level or module method)
      if (nestingLevel <= 1) {
        const defMatch = /^def\s+(?:self\.)?(\w+[?!=]?)/.exec(trimmed);
        if (defMatch) {
          exports.push({
            name: defMatch[1],
            kind: 'function',
            isDefault: false,
            line: lineNum + 1,
          });
        }
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
      const indent = line.length - line.trimStart().length;

      // class ClassName
      const classMatch = /^class\s+(\w+(?:::\w+)*)/.exec(trimmed);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath,
          line: lineNum + 1,
          column: indent,
          exported: true,
          references: [],
        });
        continue;
      }

      // module ModuleName
      const moduleMatch = /^module\s+(\w+(?:::\w+)*)/.exec(trimmed);
      if (moduleMatch) {
        symbols.push({
          name: moduleMatch[1],
          kind: 'namespace',
          filePath,
          line: lineNum + 1,
          column: indent,
          exported: true,
          references: [],
        });
        continue;
      }

      // def method_name
      const defMatch = /^def\s+(self\.)?(\w+[?!=]?)/.exec(trimmed);
      if (defMatch) {
        symbols.push({
          name: defMatch[2],
          kind: indent > 0 ? 'method' : 'function',
          filePath,
          line: lineNum + 1,
          column: indent,
          exported: !defMatch[2].startsWith('_'),
          references: [],
        });
        continue;
      }

      // CONSTANT = value
      const constMatch = /^([A-Z][A-Z0-9_]*)\s*=/.exec(trimmed);
      if (constMatch) {
        symbols.push({
          name: constMatch[1],
          kind: 'variable',
          filePath,
          line: lineNum + 1,
          column: indent,
          exported: true,
          references: [],
        });
      }

      // attr_accessor, attr_reader, attr_writer
      const attrMatch = /^attr_(?:accessor|reader|writer)\s+(.+)$/.exec(trimmed);
      if (attrMatch) {
        const attrs = attrMatch[1].split(',').map(a => a.trim().replace(/^:/, ''));
        for (const attr of attrs) {
          if (attr.length > 0) {
            symbols.push({
              name: attr,
              kind: 'property',
              filePath,
              line: lineNum + 1,
              column: indent,
              exported: true,
              references: [],
            });
          }
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
    const dir = path.dirname(fromPath);
    
    // Handle require_relative
    const relativePath = path.join(dir, importSource).replace(/\\/g, '/');
    
    // Try with .rb extension
    if (existingFiles.has(relativePath + '.rb')) {
      return relativePath + '.rb';
    }
    
    if (existingFiles.has(relativePath)) {
      return relativePath;
    }

    // Try lib/ directory for require
    const libPath = path.join('lib', importSource.replace(/-/g, '/')).replace(/\\/g, '/');
    if (existingFiles.has(libPath + '.rb')) {
      return libPath + '.rb';
    }

    return null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [
      /\bif\b/g,
      /\belsif\b/g,
      /\belse\b/g,
      /\bunless\b/g,
      /\bcase\b/g,
      /\bwhen\b/g,
      /\bwhile\b/g,
      /\buntil\b/g,
      /\bfor\b/g,
      /\brescue\b/g,
      /\bensure\b/g,
      /\bretry\b/g,
      /\b\?\s*:/g, // Ternary
      /&&/g,
      /\|\|/g,
      /\band\b/g,
      /\bor\b/g,
    ];
  }

  getCommentPatterns(): CommentPatterns {
    return {
      singleLine: /#/,
      blockStart: /^=begin/,
      blockEnd: /^=end/,
    };
  }

  getEntryPointPatterns(): RegExp[] {
    return [
      /get\s+['"][^'"]+['"]/,
      /post\s+['"][^'"]+['"]/,
      /put\s+['"][^'"]+['"]/,
      /delete\s+['"][^'"]+['"]/,
      /patch\s+['"][^'"]+['"]/,
      /resources?\s+:/,
      /Rails\.application\.routes/,
      /class\s+\w+Controller/,
      /def\s+index\b/,
      /def\s+show\b/,
      /def\s+create\b/,
    ];
  }
}
