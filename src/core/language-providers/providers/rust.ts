import * as path from 'node:path';
import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

/**
 * Rust language provider
 */
export class RustProvider extends BaseLanguageProvider {
  id = 'rust';
  name = 'Rust';
  extensions = ['.rs'];
  filePatterns = ['**/*.rs'];

  getLanguageName(_ext: string): string {
    return 'rust';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // use crate::module::item;
      const useMatch = /^(?:pub\s+)?use\s+([^;]+);/.exec(line);
      if (useMatch) {
        const usePath = useMatch[1];
        
        // Handle glob imports: use module::*
        if (usePath.includes('*')) {
          imports.push({
            source: usePath.replace(/::?\*$/, ''),
            specifiers: ['*'],
            isDefault: false,
            isNamespace: true,
            line: lineNum + 1,
          });
          continue;
        }

        // Handle grouped imports: use module::{a, b, c}
        const groupMatch = /^(.+)::\{([^}]+)\}/.exec(usePath);
        if (groupMatch) {
          const basePath = groupMatch[1];
          const items = groupMatch[2].split(',').map(s => {
            const parts = s.trim().split(/\s+as\s+/);
            return parts[0].trim();
          });
          imports.push({
            source: basePath,
            specifiers: items.filter(i => i.length > 0),
            isDefault: false,
            isNamespace: false,
            line: lineNum + 1,
          });
          continue;
        }

        // Handle aliased imports: use module::item as alias
        const aliasMatch = /^(.+)\s+as\s+(\w+)$/.exec(usePath);
        if (aliasMatch) {
          imports.push({
            source: aliasMatch[1],
            specifiers: [aliasMatch[2]],
            isDefault: false,
            isNamespace: false,
            line: lineNum + 1,
          });
          continue;
        }

        // Simple import
        const lastPart = usePath.split('::').pop() || usePath;
        imports.push({
          source: usePath,
          specifiers: [lastPart],
          isDefault: false,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // mod declaration (file-based module)
      const modMatch = /^(?:pub\s+)?mod\s+(\w+);/.exec(line);
      if (modMatch) {
        imports.push({
          source: modMatch[1],
          specifiers: [modMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: lineNum + 1,
        });
      }

      // extern crate
      const externMatch = /^extern\s+crate\s+(\w+)/.exec(line);
      if (externMatch) {
        imports.push({
          source: externMatch[1],
          specifiers: [externMatch[1]],
          isDefault: true,
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
      const line = lines[lineNum].trim();

      // pub fn function_name
      const funcMatch = /^pub(?:\([^)]+\))?\s+(?:async\s+)?fn\s+(\w+)/.exec(line);
      if (funcMatch) {
        exports.push({
          name: funcMatch[1],
          kind: 'function',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // pub struct StructName
      const structMatch = /^pub(?:\([^)]+\))?\s+struct\s+(\w+)/.exec(line);
      if (structMatch) {
        exports.push({
          name: structMatch[1],
          kind: 'class',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // pub enum EnumName
      const enumMatch = /^pub(?:\([^)]+\))?\s+enum\s+(\w+)/.exec(line);
      if (enumMatch) {
        exports.push({
          name: enumMatch[1],
          kind: 'enum',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // pub trait TraitName
      const traitMatch = /^pub(?:\([^)]+\))?\s+trait\s+(\w+)/.exec(line);
      if (traitMatch) {
        exports.push({
          name: traitMatch[1],
          kind: 'interface',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // pub type TypeAlias
      const typeMatch = /^pub(?:\([^)]+\))?\s+type\s+(\w+)/.exec(line);
      if (typeMatch) {
        exports.push({
          name: typeMatch[1],
          kind: 'type',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // pub const CONST_NAME
      const constMatch = /^pub(?:\([^)]+\))?\s+(?:const|static)\s+(\w+)/.exec(line);
      if (constMatch) {
        exports.push({
          name: constMatch[1],
          kind: 'variable',
          isDefault: false,
          line: lineNum + 1,
        });
        continue;
      }

      // pub mod module_name
      const modMatch = /^pub(?:\([^)]+\))?\s+mod\s+(\w+)/.exec(line);
      if (modMatch) {
        exports.push({
          name: modMatch[1],
          kind: 'namespace',
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
    let inImpl = false;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // impl block
      const implMatch = /^impl(?:<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/.exec(trimmed);
      if (implMatch) {
        inImpl = true;
        continue;
      }

      // fn function_name
      const funcMatch = /^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/.exec(trimmed);
      if (funcMatch) {
        symbols.push({
          name: funcMatch[1],
          kind: inImpl ? 'method' : 'function',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
        continue;
      }

      // struct StructName
      const structMatch = /^(?:pub(?:\([^)]+\))?\s+)?struct\s+(\w+)/.exec(trimmed);
      if (structMatch) {
        symbols.push({
          name: structMatch[1],
          kind: 'class',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
        continue;
      }

      // enum EnumName
      const enumMatch = /^(?:pub(?:\([^)]+\))?\s+)?enum\s+(\w+)/.exec(trimmed);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          kind: 'enum',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
        continue;
      }

      // trait TraitName
      const traitMatch = /^(?:pub(?:\([^)]+\))?\s+)?trait\s+(\w+)/.exec(trimmed);
      if (traitMatch) {
        symbols.push({
          name: traitMatch[1],
          kind: 'interface',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
        continue;
      }

      // type TypeAlias
      const typeMatch = /^(?:pub(?:\([^)]+\))?\s+)?type\s+(\w+)/.exec(trimmed);
      if (typeMatch) {
        symbols.push({
          name: typeMatch[1],
          kind: 'type',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
        continue;
      }

      // const/static
      const constMatch = /^(?:pub(?:\([^)]+\))?\s+)?(?:const|static)\s+(\w+)/.exec(trimmed);
      if (constMatch) {
        symbols.push({
          name: constMatch[1],
          kind: 'variable',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
        continue;
      }

      // mod module_name
      const modMatch = /^(?:pub(?:\([^)]+\))?\s+)?mod\s+(\w+)/.exec(trimmed);
      if (modMatch && !trimmed.endsWith(';')) {
        symbols.push({
          name: modMatch[1],
          kind: 'namespace',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.startsWith('pub'),
          references: [],
        });
      }

      // End of impl block (simple heuristic)
      if (trimmed === '}' && inImpl) {
        inImpl = false;
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
    
    // Handle crate:: prefix
    if (importSource.startsWith('crate::')) {
      const modulePath = importSource.replace('crate::', '').replace(/::/g, '/');
      
      // Try src/ directory
      const srcPath = `src/${modulePath}.rs`;
      if (existingFiles.has(srcPath)) {
        return srcPath;
      }
      
      // Try as directory with mod.rs
      const modPath = `src/${modulePath}/mod.rs`;
      if (existingFiles.has(modPath)) {
        return modPath;
      }
    }

    // Handle super:: prefix
    if (importSource.startsWith('super::')) {
      const parentDir = path.dirname(dir);
      const modulePath = importSource.replace('super::', '').replace(/::/g, '/');
      const resolved = path.join(parentDir, modulePath).replace(/\\/g, '/');
      
      if (existingFiles.has(resolved + '.rs')) {
        return resolved + '.rs';
      }
    }

    // Handle self:: prefix
    if (importSource.startsWith('self::')) {
      const modulePath = importSource.replace('self::', '').replace(/::/g, '/');
      const resolved = path.join(dir, modulePath).replace(/\\/g, '/');
      
      if (existingFiles.has(resolved + '.rs')) {
        return resolved + '.rs';
      }
    }

    // Handle mod declarations
    const modPath = path.join(dir, importSource + '.rs').replace(/\\/g, '/');
    if (existingFiles.has(modPath)) {
      return modPath;
    }

    // Try as directory with mod.rs
    const dirModPath = path.join(dir, importSource, 'mod.rs').replace(/\\/g, '/');
    if (existingFiles.has(dirModPath)) {
      return dirModPath;
    }

    return null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [
      /\bif\s+/g,
      /\belse\s+if\s+/g,
      /\belse\s*\{/g,
      /\bfor\s+/g,
      /\bwhile\s+/g,
      /\bloop\s*\{/g,
      /\bmatch\s+/g,
      /=>\s*\{/g,  // Match arms
      /\bif\s+let\s+/g,
      /\bwhile\s+let\s+/g,
      /\?/g,  // Error propagation
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
      /fn\s+main\s*\(/,
      /#\[tokio::main\]/,
      /#\[actix_web::main\]/,
      /HttpServer::new/,
      /\.route\s*\(/,
      /web::\w+\s*\(/,
      /#\[get\s*\(/,
      /#\[post\s*\(/,
      /#\[put\s*\(/,
      /#\[delete\s*\(/,
    ];
  }
}
