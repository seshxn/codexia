import Parser from 'tree-sitter';
import TypeScriptGrammars from 'tree-sitter-typescript';
import JavaScriptGrammar from 'tree-sitter-javascript';
import PythonGrammar from 'tree-sitter-python';
import GoGrammar from 'tree-sitter-go';
import type { ExportInfo, ImportInfo, Symbol, SymbolKind } from './types.js';

type SyntaxNode = Parser.SyntaxNode;

type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go';

interface ParsedFile {
  language: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  symbols: Symbol[];
}

interface LanguageConfig {
  language: SupportedLanguage;
  grammar: unknown;
}

const tsGrammars = TypeScriptGrammars as unknown as { typescript: unknown; tsx: unknown };
const jsGrammar = JavaScriptGrammar as unknown;
const pyGrammar = PythonGrammar as unknown;
const goGrammar = GoGrammar as unknown;

const parserConfigForFile = (filePath: string): LanguageConfig | null => {
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
}
