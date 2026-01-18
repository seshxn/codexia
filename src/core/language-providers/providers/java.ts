import type { Symbol, ImportInfo, ExportInfo } from '../../types.js';
import { BaseLanguageProvider, type CommentPatterns } from '../types.js';

/**
 * Java language provider
 */
export class JavaProvider extends BaseLanguageProvider {
  id = 'java';
  name = 'Java';
  extensions = ['.java'];
  filePatterns = ['**/*.java'];

  getLanguageName(_ext: string): string {
    return 'java';
  }

  extractImports(content: string, _filePath: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum].trim();

      // import package.Class;
      const importMatch = /^import\s+(?:static\s+)?([\w.]+(?:\.\*)?);/.exec(line);
      if (importMatch) {
        const source = importMatch[1];
        const isWildcard = source.endsWith('.*');
        const className = isWildcard ? '*' : source.split('.').pop() || source;
        
        imports.push({
          source: source.replace(/\.\*$/, ''),
          specifiers: [className],
          isDefault: false,
          isNamespace: isWildcard,
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

      // public class ClassName
      const classMatch = /^(?:public\s+)?(?:abstract\s+|final\s+)?class\s+(\w+)/.exec(line);
      if (classMatch) {
        exports.push({
          name: classMatch[1],
          kind: 'class',
          isDefault: line.includes('public'),
          line: lineNum + 1,
        });
        continue;
      }

      // public interface InterfaceName
      const interfaceMatch = /^(?:public\s+)?interface\s+(\w+)/.exec(line);
      if (interfaceMatch) {
        exports.push({
          name: interfaceMatch[1],
          kind: 'interface',
          isDefault: line.includes('public'),
          line: lineNum + 1,
        });
        continue;
      }

      // public enum EnumName
      const enumMatch = /^(?:public\s+)?enum\s+(\w+)/.exec(line);
      if (enumMatch) {
        exports.push({
          name: enumMatch[1],
          kind: 'enum',
          isDefault: line.includes('public'),
          line: lineNum + 1,
        });
        continue;
      }

      // @interface AnnotationName
      const annotationMatch = /^(?:public\s+)?@interface\s+(\w+)/.exec(line);
      if (annotationMatch) {
        exports.push({
          name: annotationMatch[1],
          kind: 'interface',
          isDefault: line.includes('public'),
          line: lineNum + 1,
        });
      }
    }

    return exports;
  }

  extractSymbols(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');
    let currentClass: string | null = null;
    let braceDepth = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmed = line.trim();

      // Track brace depth
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      // class ClassName
      const classMatch = /^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+|static\s+)*class\s+(\w+)/.exec(trimmed);
      if (classMatch) {
        currentClass = classMatch[1];
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.includes('public'),
          references: [],
        });
        continue;
      }

      // interface InterfaceName
      const interfaceMatch = /^(?:public\s+|private\s+|protected\s+)?interface\s+(\w+)/.exec(trimmed);
      if (interfaceMatch) {
        symbols.push({
          name: interfaceMatch[1],
          kind: 'interface',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.includes('public'),
          references: [],
        });
        continue;
      }

      // enum EnumName
      const enumMatch = /^(?:public\s+|private\s+|protected\s+)?enum\s+(\w+)/.exec(trimmed);
      if (enumMatch) {
        symbols.push({
          name: enumMatch[1],
          kind: 'enum',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.includes('public'),
          references: [],
        });
        continue;
      }

      // Method: public ReturnType methodName(params)
      const methodMatch = /^(?:public\s+|private\s+|protected\s+)?(?:static\s+|final\s+|abstract\s+|synchronized\s+)*(?:<[^>]+>\s+)?(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*\([^)]*\)/.exec(trimmed);
      if (methodMatch && braceDepth > 0) {
        // Skip constructors (name matches class name)
        if (methodMatch[2] !== currentClass) {
          symbols.push({
            name: methodMatch[2],
            kind: 'method',
            filePath,
            line: lineNum + 1,
            column: 0,
            exported: trimmed.includes('public'),
            references: [],
          });
        }
        continue;
      }

      // Field: private Type fieldName
      const fieldMatch = /^(?:public\s+|private\s+|protected\s+)?(?:static\s+|final\s+)*(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*[;=]/.exec(trimmed);
      if (fieldMatch && braceDepth > 0 && !trimmed.includes('(')) {
        symbols.push({
          name: fieldMatch[2],
          kind: 'property',
          filePath,
          line: lineNum + 1,
          column: 0,
          exported: trimmed.includes('public'),
          references: [],
        });
      }
    }

    return symbols;
  }

  resolveImportPath(
    _fromPath: string,
    importSource: string,
    existingFiles: Set<string>
  ): string | null {
    // Convert package name to path
    const packagePath = importSource.replace(/\./g, '/');
    
    // Try src/main/java (Maven/Gradle convention)
    const mavenPath = `src/main/java/${packagePath}.java`;
    if (existingFiles.has(mavenPath)) {
      return mavenPath;
    }

    // Try src/
    const srcPath = `src/${packagePath}.java`;
    if (existingFiles.has(srcPath)) {
      return srcPath;
    }

    // Try direct path
    if (existingFiles.has(`${packagePath}.java`)) {
      return `${packagePath}.java`;
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
      /\bfinally\b/g,
      /\?[^:]/g, // Ternary
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
      /public\s+static\s+void\s+main\s*\(/,
      /@GetMapping/,
      /@PostMapping/,
      /@PutMapping/,
      /@DeleteMapping/,
      /@PatchMapping/,
      /@RequestMapping/,
      /@RestController/,
      /@Controller/,
      /@SpringBootApplication/,
      /extends\s+HttpServlet/,
      /doGet\s*\(/,
      /doPost\s*\(/,
    ];
  }
}
