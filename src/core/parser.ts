import Parser from 'tree-sitter';
import TypeScriptGrammars from 'tree-sitter-typescript';
import JavaScriptGrammar from 'tree-sitter-javascript';
import PythonGrammar from 'tree-sitter-python';
import GoGrammar from 'tree-sitter-go';
import RubyGrammar from 'tree-sitter-ruby';
import JavaGrammar from 'tree-sitter-java';
import RustGrammar from 'tree-sitter-rust';
import CSharpGrammar from 'tree-sitter-c-sharp';
import KotlinGrammar from 'tree-sitter-kotlin';
import type { ExportInfo, ImportInfo, Symbol, SymbolKind } from './types.js';

type SyntaxNode = Parser.SyntaxNode;

type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'ruby' | 'java' | 'rust' | 'csharp' | 'kotlin';

interface ParsedFile {
  language: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  symbols: Symbol[];
}

interface LanguageConfig {
  language: SupportedLanguage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grammar: any;
}

// Grammar modules have inconsistent type declarations across tree-sitter versions;
// cast through unknown to suppress import-type errors.
const tsGrammars = TypeScriptGrammars as unknown as { typescript: any; tsx: any };
const jsGrammar = JavaScriptGrammar as unknown as any;
const pyGrammar = PythonGrammar as unknown as any;
const goGrammar = GoGrammar as unknown as any;
const rubyGrammar = RubyGrammar as unknown as any;
const javaGrammar = JavaGrammar as unknown as any;
const rustGrammar = RustGrammar as unknown as any;
const csharpGrammar = CSharpGrammar as unknown as any;
const kotlinGrammar = KotlinGrammar as unknown as any;

const parserConfigForFile = (filePath: string): LanguageConfig | null => {
  const basename = filePath.replace(/\\/g, '/').split('/').pop() || filePath;
  if (/\.(ts|tsx)$/.test(filePath)) {
    return {
      language: 'typescript',
      grammar: /\.tsx$/.test(filePath) ? tsGrammars.tsx : tsGrammars.typescript,
    };
  }

  if (/\.(js|jsx|mjs|cjs)$/.test(filePath)) {
    return {
      language: 'javascript',
      grammar: jsGrammar,
    };
  }

  if (/\.py$/.test(filePath)) {
    return {
      language: 'python',
      grammar: pyGrammar,
    };
  }

  if (/\.go$/.test(filePath)) {
    return {
      language: 'go',
      grammar: goGrammar,
    };
  }

  if (/\.(rb|rake|gemspec)$/.test(filePath) || /^(Gemfile|Rakefile)$/.test(basename)) {
    return {
      language: 'ruby',
      grammar: rubyGrammar,
    };
  }

  if (/\.java$/.test(filePath)) {
    return {
      language: 'java',
      grammar: javaGrammar,
    };
  }

  if (/\.rs$/.test(filePath)) {
    return {
      language: 'rust',
      grammar: rustGrammar,
    };
  }

  if (/\.cs$/.test(filePath)) {
    return {
      language: 'csharp',
      grammar: csharpGrammar,
    };
  }

  if (/\.(kt|kts)$/.test(filePath)) {
    return {
      language: 'kotlin',
      grammar: kotlinGrammar,
    };
  }

  return null;
};

const lineNumber = (node: SyntaxNode): number => node.startPosition.row + 1;
const columnNumber = (node: SyntaxNode): number => node.startPosition.column + 1;
const uniqueBy = <T>(items: T[], keyFn: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const results: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(item);
  }
  return results;
};

const splitCommaSeparated = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export class TreeSitterParser {
  parseFile(filePath: string, content: string): ParsedFile | null {
    const config = parserConfigForFile(filePath);
    if (!config) {
      return null;
    }

    const parser = new Parser();
    parser.setLanguage(config.grammar);
    const tree = parser.parse(content);
    const root = tree.rootNode;

    switch (config.language) {
      case 'typescript':
      case 'javascript':
        return this.parseTypeScriptLike(config.language, filePath, root, content);
      case 'python':
        return this.parsePython(filePath, root);
      case 'go':
        return this.parseGo(filePath, root);
      case 'ruby':
        return this.parseRuby(filePath, root);
      case 'java':
        return this.parseJava(filePath, root);
      case 'rust':
        return this.parseRust(filePath, root);
      case 'csharp':
        return this.parseCSharp(filePath, root);
      case 'kotlin':
        return this.parseKotlin(filePath, root);
      default:
        return null;
    }
  }

  private parseTypeScriptLike(
    language: SupportedLanguage,
    filePath: string,
    root: SyntaxNode,
    content: string
  ): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, inClass: boolean = false): void => {
      switch (node.type) {
        case 'import_statement': {
          const sourceNode = node.namedChildren.find((child) => child.type === 'string');
          const clause = node.namedChildren.find((child) => child.type === 'import_clause');
          const source = sourceNode?.text.replace(/^['"]|['"]$/g, '') || '';
          const specifiers = clause
            ? clause.descendantsOfType(['identifier', 'property_identifier', 'namespace_import']).map((child) => child.text)
            : [];
          imports.push({
            source,
            specifiers: uniqueBy(specifiers, (value) => value),
            isDefault: Boolean(clause?.firstNamedChild && clause.firstNamedChild.type === 'identifier'),
            isNamespace: clause?.text.includes('* as ') || false,
            line: lineNumber(node),
          });
          break;
        }
        case 'class_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const heritage = node.namedChildren.find((child) => child.type === 'class_heritage')?.text || '';
            const extendsMatch = heritage.match(/extends\s+([A-Za-z0-9_$.]+)/);
            const implementsMatch = heritage.match(/implements\s+(.+)$/);
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, this.isExportedNode(node), {
              extendsSymbols: extendsMatch ? [extendsMatch[1]] : [],
              implementsSymbols: implementsMatch ? splitCommaSeparated(implementsMatch[1]) : [],
            }));
          }
          const body = node.childForFieldName('body');
          if (body) {
            for (const child of body.namedChildren) {
              visit(child, true);
            }
          }
          break;
        }
        case 'method_definition': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const parentClass = node.parent?.parent?.childForFieldName('name')?.text;
            const params = this.extractTsParameters(node.childForFieldName('parameters'));
            const refs = this.extractCallReferences(filePath, node, ['call_expression']);
            symbols.push(this.createSymbol(nameNode.text, 'method', filePath, node, false, {
              parentSymbol: parentClass,
              parameters: params,
              references: refs,
            }));
          }
          break;
        }
        case 'interface_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'interface', filePath, node, this.isExportedNode(node)));
          }
          break;
        }
        case 'type_alias_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'type', filePath, node, this.isExportedNode(node)));
          }
          break;
        }
        case 'enum_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'enum', filePath, node, this.isExportedNode(node)));
          }
          break;
        }
        case 'function_declaration': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'function', filePath, node, this.isExportedNode(node), {
              parameters: this.extractTsParameters(node.childForFieldName('parameters')),
              references: this.extractCallReferences(filePath, node, ['call_expression']),
            }));
          }
          break;
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          for (const declarator of node.namedChildren.filter((child) => child.type === 'variable_declarator')) {
            const nameNode = declarator.childForFieldName('name');
            const valueNode = declarator.childForFieldName('value');
            if (!nameNode) {
              continue;
            }
            const kind: SymbolKind =
              valueNode && ['arrow_function', 'function_expression'].includes(valueNode.type) ? 'function' : 'variable';
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, declarator, this.isExportedNode(node), {
              parameters: kind === 'function' ? this.extractTsParameters(valueNode?.childForFieldName?.('parameters') || valueNode?.namedChildren.find((child) => child.type === 'formal_parameters') || null) : undefined,
              references: kind === 'function' && valueNode ? this.extractCallReferences(filePath, valueNode, ['call_expression']) : [],
            }));
          }
          break;
        }
        case 'export_statement': {
          const declaration = node.namedChildren[0];
          if (declaration) {
            const before = symbols.length;
            visit(declaration, inClass);
            const after = symbols.slice(before);
            for (const symbol of after) {
              symbol.exported = true;
              exports.push({
                name: symbol.name,
                kind: symbol.kind,
                isDefault: node.text.startsWith('export default'),
                line: symbol.line,
              });
            }
          }
          return;
        }
        default:
          break;
      }

      if (!(node.type === 'class_declaration' || node.type === 'export_statement')) {
        for (const child of node.namedChildren) {
          if (inClass && child.type === 'method_definition') {
            visit(child, true);
            continue;
          }
          if (!['class_body'].includes(node.type)) {
            visit(child, inClass);
          }
        }
      }
    };

    visit(root);

    // Handle re-exports and export lists not covered by declaration nodes.
    for (const node of root.descendantsOfType(['export_clause', 'export_specifier'])) {
      if (node.type === 'export_specifier') {
        const exportName = node.childForFieldName('name')?.text || node.text;
        if (exportName) {
          exports.push({
            name: exportName,
            kind: 'variable',
            isDefault: false,
            line: lineNumber(node),
          });
        }
      }
    }

    // Side-effect imports and CommonJS require() remain unsupported in AST mode.
    if (language === 'javascript' && content.includes('require(') && imports.length === 0) {
      const regex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      for (const match of content.matchAll(regex)) {
        imports.push({
          source: match[1],
          specifiers: [],
          isDefault: false,
          isNamespace: false,
          line: content.slice(0, match.index || 0).split('\n').length,
        });
      }
    }

    return {
      language,
      imports: uniqueBy(imports, (item) => `${item.source}:${item.line}:${item.specifiers.join(',')}`),
      exports: uniqueBy(exports, (item) => `${item.name}:${item.line}:${item.kind}`),
      symbols: uniqueBy(symbols, (item) => `${item.filePath}:${item.name}:${item.kind}:${item.line}`),
    };
  }

  private parsePython(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, inClass: boolean = false): void => {
      switch (node.type) {
        case 'import_statement': {
          const modules = node.namedChildren.map((child) => child.text);
          for (const moduleName of modules) {
            imports.push({
              source: moduleName,
              specifiers: [moduleName.split('.').at(-1) || moduleName],
              isDefault: false,
              isNamespace: false,
              line: lineNumber(node),
            });
          }
          break;
        }
        case 'import_from_statement': {
          const moduleName = node.childForFieldName('module_name')?.text || '';
          const imported = node.namedChildren
            .filter((child) => child.type === 'dotted_name')
            .slice(1)
            .map((child) => child.text);
          imports.push({
            source: moduleName,
            specifiers: imported,
            isDefault: false,
            isNamespace: false,
            line: lineNumber(node),
          });
          break;
        }
        case 'class_definition': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const bases = splitCommaSeparated((node.childForFieldName('superclasses')?.text || '').replace(/^\(|\)$/g, ''));
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, !nameNode.text.startsWith('_'), {
              extendsSymbols: bases,
            }));
            exports.push({
              name: nameNode.text,
              kind: 'class',
              isDefault: false,
              line: lineNumber(node),
            });
          }
          const body = node.childForFieldName('body');
          if (body) {
            for (const child of body.namedChildren) {
              visit(child, true);
            }
          }
          return;
        }
        case 'function_definition': {
          const nameNode = node.childForFieldName('name');
          if (nameNode) {
            const kind: SymbolKind = inClass ? 'method' : 'function';
            const exported = !nameNode.text.startsWith('_');
            const params = this.extractPythonParameters(node.childForFieldName('parameters'));
            const refs = this.extractCallReferences(filePath, node, ['call']);
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, node, exported, {
              parentSymbol: inClass ? node.parent?.parent?.childForFieldName('name')?.text : undefined,
              parameters: params,
              references: refs,
            }));
            if (!inClass && exported) {
              exports.push({
                name: nameNode.text,
                kind,
                isDefault: false,
                line: lineNumber(node),
              });
            }
          }
          break;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child, inClass);
      }
    };

    visit(root);

    return {
      language: 'python',
      imports: uniqueBy(imports, (item) => `${item.source}:${item.line}:${item.specifiers.join(',')}`),
      exports: uniqueBy(exports, (item) => `${item.name}:${item.line}:${item.kind}`),
      symbols: uniqueBy(symbols, (item) => `${item.filePath}:${item.name}:${item.kind}:${item.line}`),
    };
  }

  private parseGo(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode): void => {
      switch (node.type) {
        case 'import_declaration': {
          const specs = node.descendantsOfType(['import_spec', 'interpreted_string_literal']);
          const importSpecs = specs.filter((child) => child.type === 'import_spec');
          if (importSpecs.length > 0) {
            for (const spec of importSpecs) {
              const parts = spec.namedChildren.map((child) => child.text.replace(/^"|"$/g, ''));
              const source = parts.at(-1) || '';
              const alias = parts.length > 1 ? parts[0] : source.split('/').at(-1) || source;
              imports.push({
                source,
                specifiers: alias ? [alias] : [],
                isDefault: false,
                isNamespace: false,
                line: lineNumber(spec),
              });
            }
          } else {
            for (const literal of node.descendantsOfType('interpreted_string_literal')) {
              const source = literal.text.replace(/^"|"$/g, '');
              imports.push({
                source,
                specifiers: [source.split('/').at(-1) || source],
                isDefault: false,
                isNamespace: false,
                line: lineNumber(literal),
              });
            }
          }
          break;
        }
        case 'type_spec': {
          const nameNode = node.childForFieldName('name') || node.namedChildren[0];
          const typeNode = node.childForFieldName('type') || node.namedChildren[1];
          if (nameNode) {
            const kind: SymbolKind = typeNode?.type === 'interface_type' ? 'interface' : 'type';
            const exported = this.isGoExported(nameNode.text);
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, node, exported));
            if (exported) {
              exports.push({
                name: nameNode.text,
                kind,
                isDefault: false,
                line: lineNumber(node),
              });
            }
          }
          break;
        }
        case 'function_declaration':
        case 'method_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'field_identifier' || child.type === 'identifier');
          if (nameNode) {
            const kind: SymbolKind = node.type === 'method_declaration' ? 'method' : 'function';
            const exported = this.isGoExported(nameNode.text);
            const receiver = node.type === 'method_declaration' ? this.extractGoReceiver(node.childForFieldName('receiver') || node.namedChildren[0] || null) : undefined;
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, node, exported, {
              parentSymbol: receiver,
              parameters: this.extractGoParameters(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'parameter_list') || null),
              references: this.extractCallReferences(filePath, node, ['call_expression']),
            }));
            if (exported && kind === 'function') {
              exports.push({
                name: nameNode.text,
                kind,
                isDefault: false,
                line: lineNumber(node),
              });
            }
          }
          break;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child);
      }
    };

    visit(root);

    return {
      language: 'go',
      imports: uniqueBy(imports, (item) => `${item.source}:${item.line}:${item.specifiers.join(',')}`),
      exports: uniqueBy(exports, (item) => `${item.name}:${item.line}:${item.kind}`),
      symbols: uniqueBy(symbols, (item) => `${item.filePath}:${item.name}:${item.kind}:${item.line}`),
    };
  }

  private parseRuby(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, currentContainer?: string): void => {
      switch (node.type) {
        case 'call': {
          const methodName = node.childForFieldName('method')?.text || node.namedChildren.find((child) => child.type === 'identifier')?.text || '';
          const args = this.extractRubyCallArguments(node);
          if (['require', 'require_relative', 'load'].includes(methodName) && args.length > 0) {
            imports.push({
              source: args[0],
              specifiers: args[0] ? [args[0].split('/').at(-1) || args[0]] : [],
              isDefault: methodName !== 'load',
              isNamespace: false,
              line: lineNumber(node),
            });
          }
          break;
        }
        case 'module': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'constant');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'namespace', filePath, node, true));
            exports.push({ name: nameNode.text, kind: 'namespace', isDefault: false, line: lineNumber(node) });
          }
          const body = node.childForFieldName('body') || node.namedChildren.find((child) => child.type === 'body_statement');
          if (body) {
            for (const child of body.namedChildren) {
              visit(child, nameNode?.text);
            }
          }
          return;
        }
        case 'class': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'constant');
          if (nameNode) {
            const superclass = node.childForFieldName('superclass')?.text.replace(/^<\s*/, '').trim();
            const body = node.childForFieldName('body') || node.namedChildren.find((child) => child.type === 'body_statement');
            const mixins = body
              ? body.namedChildren
                .filter((child) => child.type === 'call')
                .flatMap((child) => {
                  const method = child.childForFieldName('method')?.text;
                  return ['include', 'extend', 'prepend'].includes(method || '') ? this.extractRubyCallArguments(child) : [];
                })
              : [];
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, true, {
              extendsSymbols: superclass ? [superclass] : [],
              implementsSymbols: mixins,
            }));
            exports.push({ name: nameNode.text, kind: 'class', isDefault: false, line: lineNumber(node) });
            if (body) {
              for (const child of body.namedChildren) {
                visit(child, nameNode.text);
              }
            }
          }
          return;
        }
        case 'method': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            const params = this.extractRubyParameters(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'method_parameters') || null);
            const refs = this.extractRubyCallReferences(filePath, node);
            const kind: SymbolKind = currentContainer ? 'method' : 'function';
            const exported = !nameNode.text.startsWith('_');
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, node, exported, {
              parentSymbol: currentContainer,
              parameters: params,
              references: refs,
            }));
            if (!currentContainer && exported) {
              exports.push({ name: nameNode.text, kind, isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child, currentContainer);
      }
    };

    visit(root);
    return this.finalizeParsedFile('ruby', imports, exports, symbols);
  }

  private parseJava(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, currentClass?: string): void => {
      switch (node.type) {
        case 'import_declaration': {
          const source = node.namedChildren[0]?.text || '';
          if (source) {
            imports.push({
              source,
              specifiers: [source.split('.').at(-1) || source],
              isDefault: false,
              isNamespace: source.endsWith('.*'),
              line: lineNumber(node),
            });
          }
          break;
        }
        case 'class_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => ['identifier', 'type_identifier'].includes(child.type));
          if (nameNode) {
            const exported = this.hasModifier(node, 'public');
            const baseClass = node.childForFieldName('superclass')?.text.replace(/^extends\s+/, '').trim();
            const implemented = splitCommaSeparated((node.childForFieldName('interfaces')?.text || node.namedChildren.find((child) => child.type === 'super_interfaces')?.text || '').replace(/^implements\s+/, ''));
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, exported, {
              extendsSymbols: baseClass ? [baseClass] : [],
              implementsSymbols: implemented,
            }));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'class', isDefault: false, line: lineNumber(node) });
            }
            const body = node.childForFieldName('body') || node.namedChildren.find((child) => child.type === 'class_body');
            if (body) {
              for (const child of body.namedChildren) {
                visit(child, nameNode.text);
              }
            }
          }
          return;
        }
        case 'interface_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => ['identifier', 'type_identifier'].includes(child.type));
          if (nameNode) {
            const exported = this.hasModifier(node, 'public');
            symbols.push(this.createSymbol(nameNode.text, 'interface', filePath, node, exported));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'interface', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'enum_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => ['identifier', 'type_identifier'].includes(child.type));
          if (nameNode) {
            const exported = this.hasModifier(node, 'public');
            symbols.push(this.createSymbol(nameNode.text, 'enum', filePath, node, exported));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'enum', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'method_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, currentClass ? 'method' : 'function', filePath, node, this.hasModifier(node, 'public'), {
              parentSymbol: currentClass,
              parameters: this.extractNamedParameterNodes(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'formal_parameters') || null, ['formal_parameter', 'spread_parameter', 'receiver_parameter']),
              references: this.extractJavaCallReferences(filePath, node),
            }));
          }
          break;
        }
        case 'constructor_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'method', filePath, node, this.hasModifier(node, 'public'), {
              parentSymbol: currentClass,
              parameters: this.extractNamedParameterNodes(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'formal_parameters') || null, ['formal_parameter']),
              references: this.extractJavaCallReferences(filePath, node),
            }));
          }
          break;
        }
        case 'field_declaration': {
          const variableNode = node.descendantsOfType('variable_declarator')[0];
          const nameNode = variableNode?.childForFieldName('name') || variableNode?.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'property', filePath, node, this.hasModifier(node, 'public'), {
              parentSymbol: currentClass,
            }));
          }
          break;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child, currentClass);
      }
    };

    visit(root);
    return this.finalizeParsedFile('java', imports, exports, symbols);
  }

  private parseRust(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, currentImplType?: string, implementedTrait?: string): void => {
      switch (node.type) {
        case 'use_declaration': {
          const source = node.namedChildren[0]?.text || '';
          if (source) {
            imports.push({
              source,
              specifiers: [source.split('::').at(-1) || source],
              isDefault: false,
              isNamespace: source.endsWith('::*'),
              line: lineNumber(node),
            });
          }
          break;
        }
        case 'struct_item': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'type_identifier');
          if (nameNode) {
            const exported = node.text.startsWith('pub ');
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, exported));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'class', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'enum_item': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'type_identifier');
          if (nameNode) {
            const exported = node.text.startsWith('pub ');
            symbols.push(this.createSymbol(nameNode.text, 'enum', filePath, node, exported));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'enum', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'trait_item': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'type_identifier');
          if (nameNode) {
            const exported = node.text.startsWith('pub ');
            symbols.push(this.createSymbol(nameNode.text, 'interface', filePath, node, exported));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'interface', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'type_item': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'type_identifier');
          if (nameNode) {
            const exported = node.text.startsWith('pub ');
            symbols.push(this.createSymbol(nameNode.text, 'type', filePath, node, exported));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'type', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'function_item': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            const exported = node.text.startsWith('pub ');
            const kind: SymbolKind = currentImplType ? 'method' : 'function';
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, node, exported, {
              parentSymbol: currentImplType,
              implementsSymbols: implementedTrait ? [implementedTrait] : [],
              parameters: this.extractRustParameters(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'parameters') || null),
              references: this.extractRustCallReferences(filePath, node),
            }));
            if (!currentImplType && exported) {
              exports.push({ name: nameNode.text, kind, isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'impl_item': {
          const typeIdentifiers = node.namedChildren.filter((child) => child.type === 'type_identifier');
          const traitName = typeIdentifiers.length > 1 ? typeIdentifiers[0].text : undefined;
          const targetType = typeIdentifiers.length > 1 ? typeIdentifiers[1].text : typeIdentifiers[0]?.text;
          const body = node.namedChildren.find((child) => child.type === 'declaration_list');
          if (body) {
            for (const child of body.namedChildren) {
              visit(child, targetType, traitName);
            }
          }
          return;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child, currentImplType, implementedTrait);
      }
    };

    visit(root);
    return this.finalizeParsedFile('rust', imports, exports, symbols);
  }

  private parseCSharp(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, currentClass?: string): void => {
      switch (node.type) {
        case 'using_directive': {
          const source = node.namedChildren[0]?.text || '';
          if (source) {
            imports.push({
              source,
              specifiers: [source.split('.').at(-1) || source],
              isDefault: false,
              isNamespace: true,
              line: lineNumber(node),
            });
          }
          break;
        }
        case 'class_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            const baseTypes = splitCommaSeparated((node.childForFieldName('bases')?.text || node.namedChildren.find((child) => child.type === 'base_list')?.text || '').replace(/^:\s*/, ''));
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, this.hasModifier(node, 'public'), {
              extendsSymbols: baseTypes.length > 0 ? [baseTypes[0]] : [],
              implementsSymbols: baseTypes.slice(1),
            }));
            if (this.hasModifier(node, 'public')) {
              exports.push({ name: nameNode.text, kind: 'class', isDefault: false, line: lineNumber(node) });
            }
            const body = node.namedChildren.find((child) => child.type === 'declaration_list');
            if (body) {
              for (const child of body.namedChildren) {
                visit(child, nameNode.text);
              }
            }
          }
          return;
        }
        case 'interface_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'interface', filePath, node, this.hasModifier(node, 'public')));
            if (this.hasModifier(node, 'public')) {
              exports.push({ name: nameNode.text, kind: 'interface', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'enum_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'enum', filePath, node, this.hasModifier(node, 'public')));
            if (this.hasModifier(node, 'public')) {
              exports.push({ name: nameNode.text, kind: 'enum', isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        case 'method_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, currentClass ? 'method' : 'function', filePath, node, this.hasModifier(node, 'public'), {
              parentSymbol: currentClass,
              parameters: this.extractNamedParameterNodes(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'parameter_list') || null, ['parameter']),
              references: this.extractCSharpCallReferences(filePath, node),
            }));
          }
          break;
        }
        case 'constructor_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'method', filePath, node, this.hasModifier(node, 'public'), {
              parentSymbol: currentClass,
              parameters: this.extractNamedParameterNodes(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'parameter_list') || null, ['parameter']),
              references: this.extractCSharpCallReferences(filePath, node),
            }));
          }
          break;
        }
        case 'property_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => child.type === 'identifier');
          if (nameNode) {
            symbols.push(this.createSymbol(nameNode.text, 'property', filePath, node, this.hasModifier(node, 'public'), {
              parentSymbol: currentClass,
            }));
          }
          break;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child, currentClass);
      }
    };

    visit(root);
    return this.finalizeParsedFile('csharp', imports, exports, symbols);
  }

  private parseKotlin(filePath: string, root: SyntaxNode): ParsedFile {
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const symbols: Symbol[] = [];

    const visit = (node: SyntaxNode, currentClass?: string): void => {
      switch (node.type) {
        case 'import_header': {
          const source = node.namedChildren[0]?.text || '';
          if (source) {
            imports.push({
              source,
              specifiers: [source.split('.').at(-1) || source],
              isDefault: false,
              isNamespace: source.endsWith('.*'),
              line: lineNumber(node),
            });
          }
          break;
        }
        case 'class_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => ['type_identifier', 'simple_identifier'].includes(child.type));
          if (nameNode) {
            const delegation = node.namedChildren.filter((child) => child.type === 'delegation_specifier');
            const extendsSymbols = delegation
              .map((child) => child.namedChildren.find((part) => part.type === 'constructor_invocation'))
              .filter((child): child is SyntaxNode => child !== undefined)
              .map((child) => child.namedChildren.find((part) => part.type === 'user_type')?.text || child.text.replace(/\(\s*\)$/, '').trim())
              .filter(Boolean);
            const implementsSymbols = delegation
              .filter((child) => !child.namedChildren.some((part) => part.type === 'constructor_invocation'))
              .map((child) => child.namedChildren.find((part) => part.type === 'user_type')?.text || child.text.trim())
              .filter(Boolean);
            const exported = !this.isPrivateLikeNode(node);
            symbols.push(this.createSymbol(nameNode.text, 'class', filePath, node, exported, {
              extendsSymbols,
              implementsSymbols,
            }));
            if (exported) {
              exports.push({ name: nameNode.text, kind: 'class', isDefault: false, line: lineNumber(node) });
            }
            const body = node.namedChildren.find((child) => child.type === 'class_body');
            if (body) {
              for (const child of body.namedChildren) {
                visit(child, nameNode.text);
              }
            }
          }
          return;
        }
        case 'function_declaration': {
          const nameNode = node.childForFieldName('name') || node.namedChildren.find((child) => ['simple_identifier', 'identifier'].includes(child.type));
          if (nameNode) {
            const exported = !this.isPrivateLikeNode(node);
            const kind: SymbolKind = currentClass ? 'method' : 'function';
            symbols.push(this.createSymbol(nameNode.text, kind, filePath, node, exported, {
              parentSymbol: currentClass,
              parameters: this.extractKotlinParameters(node.childForFieldName('parameters') || node.namedChildren.find((child) => child.type === 'function_value_parameters') || null),
              references: this.extractKotlinCallReferences(filePath, node),
            }));
            if (!currentClass && exported) {
              exports.push({ name: nameNode.text, kind, isDefault: false, line: lineNumber(node) });
            }
          }
          break;
        }
        default:
          break;
      }

      for (const child of node.namedChildren) {
        visit(child, currentClass);
      }
    };

    visit(root);
    return this.finalizeParsedFile('kotlin', imports, exports, symbols);
  }

  private finalizeParsedFile(language: string, imports: ImportInfo[], exports: ExportInfo[], symbols: Symbol[]): ParsedFile {
    return {
      language,
      imports: uniqueBy(imports, (item) => `${item.source}:${item.line}:${item.specifiers.join(',')}`),
      exports: uniqueBy(exports, (item) => `${item.name}:${item.line}:${item.kind}`),
      symbols: uniqueBy(symbols, (item) => `${item.filePath}:${item.name}:${item.kind}:${item.line}`),
    };
  }

  private createSymbol(
    name: string,
    kind: SymbolKind,
    filePath: string,
    node: SyntaxNode,
    exported: boolean,
    metadata: Partial<Symbol> = {}
  ): Symbol {
    return {
      name,
      kind,
      filePath,
      line: lineNumber(node),
      column: columnNumber(node),
      endLine: node.endPosition.row + 1,
      exported,
      parentSymbol: metadata.parentSymbol,
      parameters: metadata.parameters,
      returnType: metadata.returnType,
      extendsSymbols: metadata.extendsSymbols,
      implementsSymbols: metadata.implementsSymbols,
      references: metadata.references || [],
    };
  }

  private isExportedNode(node: SyntaxNode): boolean {
    return node.parent?.type === 'export_statement' || node.text.startsWith('export ');
  }

  private isGoExported(name: string): boolean {
    return /^[A-Z]/.test(name);
  }

  private extractTsParameters(node: SyntaxNode | null): string[] {
    if (!node) {
      return [];
    }
    return node.namedChildren
      .map((child) => child.childForFieldName('name')?.text || child.text)
      .map((value) => value.replace(/\s*:.+$/, '').trim())
      .filter(Boolean);
  }

  private extractPythonParameters(node: SyntaxNode | null): string[] {
    if (!node) {
      return [];
    }
    return node.namedChildren
      .map((child) => child.text.trim())
      .filter((value) => value.length > 0 && value !== 'self');
  }

  private extractGoParameters(node: SyntaxNode | null): string[] {
    if (!node) {
      return [];
    }
    return node.namedChildren
      .filter((child) => child.type === 'parameter_declaration')
      .flatMap((child) =>
        child.namedChildren
          .filter((part) => ['identifier', 'variadic_parameter_declaration'].includes(part.type))
          .map((part) => part.text.replace(/^\.\.\./, ''))
      )
      .filter(Boolean);
  }

  private extractGoReceiver(node: SyntaxNode | null): string | undefined {
    if (!node) {
      return undefined;
    }
    const text = node.text.replace(/[()*]/g, ' ').trim();
    const parts = text.split(/\s+/).filter(Boolean);
    return parts.at(-1);
  }

  private extractRubyParameters(node: SyntaxNode | null): string[] {
    if (!node) {
      return [];
    }
    return node.namedChildren.map((child) => child.text.replace(/^[:*]+/, '').trim()).filter(Boolean);
  }

  private extractRustParameters(node: SyntaxNode | null): string[] {
    if (!node) {
      return [];
    }
    return node.namedChildren
      .filter((child) => child.type === 'parameter')
      .map((child) => child.childForFieldName('pattern')?.text || child.namedChildren[0]?.text || child.text)
      .map((text) => text.replace(/^mut\s+/, '').trim())
      .filter((value) => value && value !== 'self' && value !== '&self');
  }

  private extractKotlinParameters(node: SyntaxNode | null): string[] {
    if (!node) {
      return [];
    }
    return node.namedChildren
      .filter((child) => ['function_value_parameter', 'parameter'].includes(child.type))
      .map((child) => child.namedChildren.find((part) => ['simple_identifier', 'identifier'].includes(part.type))?.text || child.text)
      .filter(Boolean);
  }

  private extractNamedParameterNodes(node: SyntaxNode | null, parameterTypes: string[]): string[] {
    if (!node) {
      return [];
    }
    return node.descendantsOfType(parameterTypes)
      .map((child) => child.childForFieldName('name')?.text || child.namedChildren.find((part) => ['identifier', 'simple_identifier'].includes(part.type))?.text || '')
      .filter(Boolean);
  }

  private extractCallReferences(filePath: string, node: SyntaxNode, callTypes: string[]): Symbol['references'] {
    const refs = node
      .descendantsOfType(callTypes)
      .map((callNode) => {
        const fnNode = callNode.childForFieldName('function');
        const target = fnNode?.text;
        if (!target) {
          return null;
        }
        return {
          filePath,
          line: lineNumber(callNode),
          column: columnNumber(callNode),
          kind: 'call' as const,
          target,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    return uniqueBy(refs, (ref) => `${ref.target}:${ref.line}:${ref.column}`);
  }

  private extractRubyCallArguments(node: SyntaxNode): string[] {
    const argsNode = node.childForFieldName('arguments') || node.namedChildren.find((child) => child.type === 'argument_list');
    if (!argsNode) {
      return [];
    }
    return argsNode.namedChildren
      .map((child) => child.text.replace(/^['"]|['"]$/g, '').trim())
      .filter(Boolean);
  }

  private extractRubyCallReferences(filePath: string, node: SyntaxNode): Symbol['references'] {
    const refs = node.descendantsOfType(['call']).map((callNode) => {
      const method = callNode.childForFieldName('method')?.text || callNode.namedChildren.find((child) => child.type === 'identifier')?.text;
      if (!method || ['require', 'require_relative', 'load', 'include', 'extend', 'prepend'].includes(method)) {
        return null;
      }
      const receiver = callNode.childForFieldName('receiver')?.text;
      return {
        filePath,
        line: lineNumber(callNode),
        column: columnNumber(callNode),
        kind: 'call' as const,
        target: receiver ? `${receiver}.${method}` : method,
      };
    }).filter((value): value is NonNullable<typeof value> => value !== null);

    return uniqueBy(refs, (ref) => `${ref.target}:${ref.line}:${ref.column}`);
  }

  private extractJavaCallReferences(filePath: string, node: SyntaxNode): Symbol['references'] {
    const refs = node.descendantsOfType(['method_invocation']).map((callNode) => {
      const method = callNode.childForFieldName('name')?.text || callNode.namedChildren.at(-1)?.text;
      if (!method) {
        return null;
      }
      const object = callNode.childForFieldName('object')?.text;
      return {
        filePath,
        line: lineNumber(callNode),
        column: columnNumber(callNode),
        kind: 'call' as const,
        target: object ? `${object}.${method}` : method,
      };
    }).filter((value): value is NonNullable<typeof value> => value !== null);

    return uniqueBy(refs, (ref) => `${ref.target}:${ref.line}:${ref.column}`);
  }

  private extractRustCallReferences(filePath: string, node: SyntaxNode): Symbol['references'] {
    const refs = node.descendantsOfType(['call_expression', 'method_call_expression']).map((callNode) => {
      const target = callNode.childForFieldName('function')?.text || callNode.childForFieldName('name')?.text || callNode.text.split('(')[0];
      if (!target) {
        return null;
      }
      return {
        filePath,
        line: lineNumber(callNode),
        column: columnNumber(callNode),
        kind: 'call' as const,
        target,
      };
    }).filter((value): value is NonNullable<typeof value> => value !== null);

    return uniqueBy(refs, (ref) => `${ref.target}:${ref.line}:${ref.column}`);
  }

  private extractCSharpCallReferences(filePath: string, node: SyntaxNode): Symbol['references'] {
    const refs = node.descendantsOfType(['invocation_expression']).map((callNode) => {
      const expression = callNode.namedChildren[0]?.text;
      if (!expression) {
        return null;
      }
      return {
        filePath,
        line: lineNumber(callNode),
        column: columnNumber(callNode),
        kind: 'call' as const,
        target: expression,
      };
    }).filter((value): value is NonNullable<typeof value> => value !== null);

    return uniqueBy(refs, (ref) => `${ref.target}:${ref.line}:${ref.column}`);
  }

  private extractKotlinCallReferences(filePath: string, node: SyntaxNode): Symbol['references'] {
    const refs = node.descendantsOfType(['call_expression']).map((callNode) => {
      const callee = callNode.namedChildren[0]?.text;
      if (!callee) {
        return null;
      }
      return {
        filePath,
        line: lineNumber(callNode),
        column: columnNumber(callNode),
        kind: 'call' as const,
        target: callee,
      };
    }).filter((value): value is NonNullable<typeof value> => value !== null);

    return uniqueBy(refs, (ref) => `${ref.target}:${ref.line}:${ref.column}`);
  }

  private hasModifier(node: SyntaxNode, modifier: string): boolean {
    return node.namedChildren.some((child) => child.type === 'modifier' && child.text === modifier)
      || node.namedChildren.some((child) => child.type === 'modifiers' && child.text.includes(modifier));
  }

  private isPrivateLikeNode(node: SyntaxNode): boolean {
    return node.text.startsWith('private ') || node.text.startsWith('internal ');
  }
}
