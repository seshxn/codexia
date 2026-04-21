import * as crypto from 'node:crypto';
import type { FileInfo, Symbol } from './types.js';
import type { DependencyGraphReader } from './graph-store-types.js';

export interface FileRecord {
  path: string;
  language: string;
  sha256: string;
  size: number;
  lines: number;
  last_parsed: string;
}

export interface FunctionRecord {
  id: string;
  name: string;
  file_path: string;
  class_name: string;
  line_start: number;
  line_end: number;
  params: string;
  return_type: string;
  is_test: boolean;
  is_exported: boolean;
}

export interface ClassRecord {
  id: string;
  name: string;
  file_path: string;
  line_start: number;
  line_end: number;
  is_exported: boolean;
}

export interface TypeRecord {
  id: string;
  name: string;
  file_path: string;
  kind: string;
  is_exported: boolean;
}

export interface ModuleRecord {
  path: string;
  is_external: boolean;
}

export interface BasicRelationshipRecord {
  from: string;
  to: string;
}

export interface CallsRecord extends BasicRelationshipRecord {
  line_number: number;
}

export interface ImportsFromRecord extends BasicRelationshipRecord {
  symbols: string;
  is_default: boolean;
}

export interface GraphBuildRecords {
  files: FileRecord[];
  functions: FunctionRecord[];
  classes: ClassRecord[];
  types: TypeRecord[];
  modules: ModuleRecord[];
  containsFunction: BasicRelationshipRecord[];
  containsClass: BasicRelationshipRecord[];
  containsType: BasicRelationshipRecord[];
  classContains: BasicRelationshipRecord[];
  calls: CallsRecord[];
  inherits: BasicRelationshipRecord[];
  implements: BasicRelationshipRecord[];
  importsFrom: ImportsFromRecord[];
  dependsOn: BasicRelationshipRecord[];
}

const emptyRecords = (): GraphBuildRecords => ({
  files: [],
  functions: [],
  classes: [],
  types: [],
  modules: [],
  containsFunction: [],
  containsClass: [],
  containsType: [],
  classContains: [],
  calls: [],
  inherits: [],
  implements: [],
  importsFrom: [],
  dependsOn: [],
});

export const symbolId = (symbol: Symbol): string =>
  `${symbol.filePath}:${symbol.name}:${symbol.kind}:${symbol.line}`;

const hashFile = (fileInfo: FileInfo): string =>
  crypto
    .createHash('sha256')
    .update([
      fileInfo.path,
      fileInfo.language,
      String(fileInfo.size),
      String(fileInfo.lines),
      ...fileInfo.symbols.map((symbol) => symbolId(symbol)),
    ].join('|'))
    .digest('hex');

const classKey = (symbol: Symbol): string => `${symbol.filePath}:${symbol.name}`;
const typeKey = (symbol: Symbol): string => `${symbol.filePath}:${symbol.name}`;
const lookupKey = (name: string, filePath: string): string => `${filePath}:${name}`;
const findByName = (symbols: Symbol[], name: string): Symbol | undefined =>
  symbols.find((symbol) => symbol.name === name);
const isExternalImport = (source: string): boolean => !source.startsWith('.') && !source.startsWith('/');
const isTestSymbol = (symbol: Symbol): boolean =>
  /(?:^test|test$|spec$|describe|it)/i.test(symbol.name) || /(?:test|spec)\./i.test(symbol.filePath);

export function buildGraphRecords(
  files: Map<string, FileInfo>,
  dependencyGraph: DependencyGraphReader,
  scope: Set<string> = new Set(files.keys()),
  parsedAt: string = new Date().toISOString()
): GraphBuildRecords {
  const records = emptyRecords();
  const functionSymbols: Symbol[] = [];
  const classSymbols: Symbol[] = [];
  const typeSymbols: Symbol[] = [];
  const modulePaths = new Set<string>();

  for (const [filePath, fileInfo] of files) {
    if (!scope.has(filePath)) {
      continue;
    }

    records.files.push({
      path: filePath,
      language: fileInfo.language,
      sha256: hashFile(fileInfo),
      size: fileInfo.size,
      lines: fileInfo.lines,
      last_parsed: parsedAt,
    });

    for (const imp of fileInfo.imports) {
      modulePaths.add(imp.source);
    }

    for (const symbol of fileInfo.symbols) {
      if (symbol.kind === 'class') {
        classSymbols.push(symbol);
        records.classes.push({
          id: symbolId(symbol),
          name: symbol.name,
          file_path: symbol.filePath,
          line_start: symbol.line,
          line_end: symbol.endLine || symbol.line,
          is_exported: symbol.exported,
        });
        records.containsClass.push({ from: filePath, to: symbolId(symbol) });
        continue;
      }

      if (['function', 'method'].includes(symbol.kind)) {
        functionSymbols.push(symbol);
        records.functions.push({
          id: symbolId(symbol),
          name: symbol.name,
          file_path: symbol.filePath,
          class_name: symbol.parentSymbol || '',
          line_start: symbol.line,
          line_end: symbol.endLine || symbol.line,
          params: (symbol.parameters || []).join(','),
          return_type: symbol.returnType || '',
          is_test: isTestSymbol(symbol),
          is_exported: symbol.exported,
        });

        if (symbol.parentSymbol) {
          const parent = classSymbols.find((candidate) =>
            candidate.name === symbol.parentSymbol && candidate.filePath === symbol.filePath
          );
          if (parent) {
            records.classContains.push({ from: symbolId(parent), to: symbolId(symbol) });
          }
        } else {
          records.containsFunction.push({ from: filePath, to: symbolId(symbol) });
        }
        continue;
      }

      if (['interface', 'type', 'enum'].includes(symbol.kind)) {
        typeSymbols.push(symbol);
        records.types.push({
          id: symbolId(symbol),
          name: symbol.name,
          file_path: symbol.filePath,
          kind: symbol.kind,
          is_exported: symbol.exported,
        });
        records.containsType.push({ from: filePath, to: symbolId(symbol) });
      }
    }
  }

  records.modules.push(...Array.from(modulePaths).map((source) => ({
    path: source,
    is_external: isExternalImport(source),
  })));

  for (const [filePath, fileInfo] of files) {
    if (!scope.has(filePath)) {
      continue;
    }

    for (const imp of fileInfo.imports) {
      records.importsFrom.push({
        from: filePath,
        to: imp.source,
        symbols: imp.specifiers.join(','),
        is_default: imp.isDefault,
      });
    }

    for (const target of dependencyGraph.getDependencies(filePath)) {
      if (files.has(target)) {
        records.dependsOn.push({ from: filePath, to: target });
      }
    }
  }

  const classIndex = new Map(classSymbols.map((symbol) => [classKey(symbol), symbol]));
  const typeIndex = new Map(typeSymbols.map((symbol) => [typeKey(symbol), symbol]));
  const functionIndex = new Map<string, Symbol[]>();
  for (const symbol of functionSymbols) {
    const list = functionIndex.get(symbol.name) || [];
    list.push(symbol);
    functionIndex.set(symbol.name, list);
  }

  for (const classSymbol of classSymbols) {
    for (const base of classSymbol.extendsSymbols || []) {
      const target = classIndex.get(lookupKey(base, classSymbol.filePath)) || findByName(classSymbols, base);
      if (target) {
        records.inherits.push({ from: symbolId(classSymbol), to: symbolId(target) });
      }
    }

    for (const implemented of classSymbol.implementsSymbols || []) {
      const target = typeIndex.get(lookupKey(implemented, classSymbol.filePath)) || findByName(typeSymbols, implemented);
      if (target) {
        records.implements.push({ from: symbolId(classSymbol), to: symbolId(target) });
      }
    }
  }

  for (const functionSymbol of functionSymbols) {
    for (const ref of functionSymbol.references.filter((item) => item.kind === 'call' && item.target)) {
      const targetName = ref.target!.split('.').at(-1) || ref.target!;
      const candidates = functionIndex.get(targetName) || [];
      const preferred = candidates.find((candidate) => candidate.filePath === functionSymbol.filePath) || candidates[0];
      if (preferred && symbolId(preferred) !== symbolId(functionSymbol)) {
        records.calls.push({
          from: symbolId(functionSymbol),
          to: symbolId(preferred),
          line_number: ref.line,
        });
      }
    }
  }

  return records;
}

export const countGraphRelationships = (records: GraphBuildRecords): number =>
  records.containsFunction.length +
  records.containsClass.length +
  records.containsType.length +
  records.classContains.length +
  records.calls.length +
  records.inherits.length +
  records.implements.length +
  records.importsFrom.length +
  records.dependsOn.length;
