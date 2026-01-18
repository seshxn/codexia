import * as path from 'node:path';
import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

/**
 * Python language provider
 */
export class PythonProvider extends BaseLanguageProvider {
  id = 'python';
  name = 'Python';
  extensions = ['.py', '.pyi', '.pyw'];
  filePatterns = ['**/*.py', '**/*.pyi', '**/*.pyw'];

  getLanguageName(_ext: string): string {
    return 'python';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // from module import x, y, z
      const fromMatch = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(line);
      if (fromMatch) {
        const source = fromMatch[1];
        const importPart = fromMatch[2];
        
        // Handle parenthesized imports
        let specifiersStr = importPart;
        if (importPart.startsWith('(')) {
          // Multi-line import - collect until closing paren
          let fullImport = importPart;
          let nextLine = lineNum + 1;
          while (!fullImport.includes(')') && nextLine < lines.length) {
            fullImport += ' ' + lines[nextLine].trim();
            nextLine++;
          }
          specifiersStr = fullImport.replace(/[()]/g, '');
        }

        const specifiers = specifiersStr
          .split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(s => s.length > 0 && s !== '*');

        imports.push({
          source,
          specifiers,
          isDefault: false,
          isNamespace: importPart.trim() === '*',
          line: lineNum + 1,
        });
        continue;
      }

      // import module
      const importMatch = /^import\s+([\w.]+)(?:\s+as\s+\w+)?$/.exec(line);
      if (importMatch) {
        imports.push({
          source: importMatch[1],
          specifiers: [importMatch[1].split('.').pop() || importMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: lineNum + 1,
        });
        continue;
      }

      // import module1, module2
      const multiImportMatch = /^import\s+(.+)$/.exec(line);
      if (multiImportMatch && !line.includes('from')) {
        const modules = multiImportMatch[1].split(',').map(m => m.trim().split(/\s+as\s+/)[0].trim());
        for (const mod of modules) {
          if (mod.length > 0) {
            imports.push({
              source: mod,
              specifiers: [mod.split('.').pop() || mod],
              isDefault: true,
              isNamespace: false,
              line: lineNum + 1,
            });
          }
        }
      }
    }

    return imports;
  }

  extractExports(content: string, _filePath: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    // In Python, all module-level definitions are effectively exports
    // __all__ defines explicit exports
    let allExports: string[] | null = null;
    
    // Check for __all__
    const allMatch = /__all__\s*=\s*\[([^\]]+)\]/.exec(content);
    if (allMatch) {
      allExports = allMatch[1]
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0);
    }

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // Skip if indented (method/nested function)
      if (line.length > 0 && line[0] === ' ' || line[0] === '\t') {
        continue;
      }

      // class ClassName
      const classMatch = /^class\s+(\w+)/.exec(trimmed);
      if (classMatch) {
        const name = classMatch[1];
        if (!name.startsWith('_') || (allExports && allExports.includes(name))) {
          exports.push({
            name,
            kind: 'class',
            isDefault: false,
            line: lineNum + 1,
          });
        }
        continue;
      }

      // def function_name
      const funcMatch = /^(?:async\s+)?def\s+(\w+)/.exec(trimmed);
      if (funcMatch) {
        const name = funcMatch[1];
        if (!name.startsWith('_') || (allExports && allExports.includes(name))) {
          exports.push({
            name,
            kind: 'function',
            isDefault: false,
            line: lineNum + 1,
          });
        }
        continue;
      }

      // CONSTANT = value (uppercase names are typically constants)
      const constMatch = /^([A-Z][A-Z0-9_]*)\s*=/.exec(trimmed);
      if (constMatch) {
        exports.push({
          name: constMatch[1],
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
      
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }

      const indent = line.length - line.trimStart().length;

      // class ClassName
      const classMatch = /^class\s+(\w+)/.exec(trimmed);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath,
          line: lineNum + 1,
          column: indent,
          exported: !classMatch[1].startsWith('_'),
          references: [],
        });
        continue;
      }

      // def function_name (top-level or method)
      const funcMatch = /^(?:async\s+)?def\s+(\w+)/.exec(trimmed);
      if (funcMatch) {
        const isMethod = indent > 0;
        symbols.push({
          name: funcMatch[1],
          kind: isMethod ? 'method' : 'function',
          filePath,
          line: lineNum + 1,
          column: indent,
          exported: !funcMatch[1].startsWith('_'),
          references: [],
        });
        continue;
      }

      // Top-level variable assignment
      if (indent === 0) {
        const varMatch = /^(\w+)\s*=/.exec(trimmed);
        if (varMatch && !trimmed.includes('(') && !varMatch[1].startsWith('_')) {
          symbols.push({
            name: varMatch[1],
            kind: 'variable',
            filePath,
            line: lineNum + 1,
            column: 0,
            exported: true,
            references: [],
          });
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
    // Handle relative imports (e.g., .module, ..module)
    if (importSource.startsWith('.')) {
      const dir = path.dirname(fromPath);
      const levels = importSource.match(/^\.+/)?.[0].length || 1;
      let basePath = dir;
      
      for (let i = 1; i < levels; i++) {
        basePath = path.dirname(basePath);
      }
      
      const modulePath = importSource.replace(/^\.+/, '').replace(/\./g, '/');
      const resolved = path.join(basePath, modulePath).replace(/\\/g, '/');
      
      // Try as file
      if (existingFiles.has(resolved + '.py')) {
        return resolved + '.py';
      }
      
      // Try as package
      if (existingFiles.has(path.join(resolved, '__init__.py').replace(/\\/g, '/'))) {
        return path.join(resolved, '__init__.py').replace(/\\/g, '/');
      }
    }

    // For absolute imports, try to find in the project
    const modulePath = importSource.replace(/\./g, '/');
    
    if (existingFiles.has(modulePath + '.py')) {
      return modulePath + '.py';
    }
    
    if (existingFiles.has(path.join(modulePath, '__init__.py').replace(/\\/g, '/'))) {
      return path.join(modulePath, '__init__.py').replace(/\\/g, '/');
    }

    return null;
  }

  getControlFlowPatterns(): RegExp[] {
    return [
      /\bif\s+/g,
      /\belif\s+/g,
      /\belse\s*:/g,
      /\bfor\s+/g,
      /\bwhile\s+/g,
      /\btry\s*:/g,
      /\bexcept\s*/g,
      /\bfinally\s*:/g,
      /\bwith\s+/g,
      /\band\b/g,
      /\bor\b/g,
      /\bif\s+.+\s+else\s+/g, // Ternary expression
      /\bfor\s+.+\s+in\s+/g,  // List comprehension
    ];
  }

  getCommentPatterns(): CommentPatterns {
    return {
      singleLine: /#/,
      blockStart: /'''/,
      blockEnd: /'''/,
    };
  }

  getEntryPointPatterns(): RegExp[] {
    return [
      /@app\.route\s*\(/,
      /@router\./,
      /@api_view\s*\(/,
      /def\s+\w+_view\s*\(/,
      /class\s+\w+View\s*\(/,
      /class\s+\w+APIView\s*\(/,
      /if\s+__name__\s*==\s*['"]__main__['"]/,
      /@click\.command/,
      /def\s+main\s*\(/,
    ];
  }
}
