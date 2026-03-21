import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DependencyEdge, FileInfo, ImportInfo, Symbol, SymbolKind } from '../../core/types.js';
import { getLanguageRegistry } from '../../core/language-providers/index.js';

export type KnowledgeGraphNodeKind =
  | 'repo'
  | 'directory'
  | 'file'
  | 'community'
  | 'process'
  | SymbolKind;

export type KnowledgeGraphEdgeKind =
  | 'contains'
  | 'defines'
  | 'imports'
  | 'uses'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'member_of'
  | 'step_in_process';

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  kind: KnowledgeGraphNodeKind;
  path: string;
  parentId?: string;
  depth: number;
  degree: number;
  line?: number;
  language?: string;
  exported?: boolean;
  metrics: {
    lines?: number;
    imports?: number;
    importedBy?: number;
    symbols?: number;
    exports?: number;
  };
  details?: {
    description?: string;
    cohesion?: number;
    memberCount?: number;
    processType?: 'entry' | 'pipeline' | 'cross-cutting';
    stepCount?: number;
    communities?: string[];
  };
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: KnowledgeGraphEdgeKind;
  weight: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    byKind: Record<KnowledgeGraphNodeKind, number>;
    byEdgeKind: Record<KnowledgeGraphEdgeKind, number>;
    topConnected: Array<{
      id: string;
      label: string;
      kind: KnowledgeGraphNodeKind;
      degree: number;
      path: string;
    }>;
  };
}

interface SymbolRange {
  symbol: Symbol;
  id: string;
  startLine: number;
  endLine: number;
}

const REPO_NODE_ID = 'repo:.';
const MAX_COMMUNITIES = 8;
const MAX_PROCESSES = 6;
const MAX_PROCESS_STEPS = 12;
const COMMUNITY_MIN_FILE_COUNT = 3;
const COMMUNITY_MIN_SYMBOL_COUNT = 6;

const CALL_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'typeof',
  'import',
  'new',
  'super',
  'console',
  'await',
]);

const directoryId = (relativeDir: string): string => `dir:${relativeDir || '.'}`;
const fileId = (relativePath: string): string => `file:${relativePath}`;
const communityId = (seed: string): string => `community:${seed || '.'}`;
const processId = (seed: string): string => `process:${seed}`;
const symbolId = (symbol: Symbol): string =>
  `symbol:${symbol.filePath}:${symbol.kind}:${symbol.name}:${symbol.line}:${symbol.column}`;

const normalizeRelativeDirectory = (relativePath: string): string => {
  const dir = path.posix.dirname(relativePath);
  return dir === '.' ? '' : dir;
};

const resolveImportPath = (
  fromPath: string,
  importSource: string,
  existingFiles: Set<string>
): string | null => {
  const provider = getLanguageRegistry().getForFile(fromPath);

  if (provider) {
    const resolved = provider.resolveImportPath(fromPath, importSource, existingFiles);
    if (resolved) {
      return resolved;
    }
  }

  if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
    return null;
  }

  let resolved = path.posix.join(path.posix.dirname(fromPath), importSource);
  if (existingFiles.has(resolved)) {
    return resolved;
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs', '.java'];

  for (const extension of extensions) {
    const withExtension = `${resolved}${extension}`;
    if (existingFiles.has(withExtension)) {
      return withExtension;
    }
  }

  for (const extension of extensions) {
    const indexPath = path.posix.join(resolved, `index${extension}`);
    if (existingFiles.has(indexPath)) {
      return indexPath;
    }
  }

  if (resolved.endsWith('.js')) {
    resolved = resolved.slice(0, -3);
    for (const extension of ['.ts', '.tsx']) {
      const tsVariant = `${resolved}${extension}`;
      if (existingFiles.has(tsVariant)) {
        return tsVariant;
      }
    }
  }

  return null;
};

const resolveTargetSymbolId = (
  name: string,
  localSymbols: Map<string, string>,
  importedSymbols: Map<string, string>,
  exportedSymbolsByName: Map<string, string[]>
): string | undefined => {
  if (importedSymbols.has(name)) {
    return importedSymbols.get(name);
  }

  if (localSymbols.has(name)) {
    return localSymbols.get(name);
  }

  const exportedMatches = exportedSymbolsByName.get(name) || [];
  if (exportedMatches.length === 1) {
    return exportedMatches[0];
  }

  return undefined;
};

const findImportedSymbolId = (
  targetSymbols: Map<string, string>,
  targetExports: FileInfo['exports'],
  importInfo: ImportInfo,
  specifier: string
): string | undefined => {
  if (specifier === 'default' || importInfo.isDefault) {
    const defaultExport = targetExports.find((entry) => entry.isDefault);
    if (defaultExport && defaultExport.name !== 'default') {
      return targetSymbols.get(defaultExport.name);
    }

    const firstExportedSymbol = Array.from(targetSymbols.entries()).find(([name]) => name !== 'default');
    return firstExportedSymbol?.[1];
  }

  if (targetSymbols.has(specifier)) {
    return targetSymbols.get(specifier);
  }

  const aliasedExport = targetExports.find((entry) => entry.name === specifier);
  if (aliasedExport) {
    return targetSymbols.get(aliasedExport.name);
  }

  return undefined;
};

const createSymbolRanges = (symbols: Symbol[], totalLines: number): SymbolRange[] => {
  const sorted = [...symbols].sort((left, right) => left.line - right.line || left.name.localeCompare(right.name));

  return sorted.map((symbol, index) => ({
    symbol,
    id: symbolId(symbol),
    startLine: symbol.line,
    endLine: Math.max(symbol.line, (sorted[index + 1]?.line || totalLines + 1) - 1),
  }));
};

function findContainingSymbol(ranges: SymbolRange[], lineNumber: number): SymbolRange | null {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = ranges[mid];
    if (lineNumber < r.startLine) {
      hi = mid - 1;
    } else if (lineNumber > r.endLine) {
      lo = mid + 1;
    } else {
      return r;
    }
  }
  return null;
}

const inferCommunityDescription = (name: string): string => {
  const normalized = name.toLowerCase();
  if (normalized === 'src' || normalized.includes('core') || normalized.includes('lib')) {
    return 'Primary product and domain logic.';
  }
  if (normalized.includes('test')) {
    return 'Verification, regression, and confidence-building code.';
  }
  if (normalized.includes('doc')) {
    return 'Documentation and knowledge-sharing material.';
  }
  if (normalized.includes('example') || normalized.includes('demo')) {
    return 'Examples, samples, and onboarding surface area.';
  }
  if (normalized.includes('script') || normalized.includes('tool')) {
    return 'Tooling, automation, and developer workflow support.';
  }
  if (normalized.includes('config')) {
    return 'Configuration and environment wiring.';
  }
  return 'Subsystem inferred from repository structure and dependency density.';
};

const calculateCommunityCohesion = (
  memberFileIds: Set<string>,
  fileToOutgoingEdges: Map<string, KnowledgeGraphEdge[]>
): number => {
  let internalEdges = 0;
  let totalEdges = 0;
  for (const fileId of memberFileIds) {
    const outgoing = fileToOutgoingEdges.get(fileId) ?? [];
    for (const edge of outgoing) {
      totalEdges++;
      // `uses` edges target symbol IDs (e.g. `symbol:src/foo.ts:fn:name:1:0`);
      // resolve to the parent file ID before checking community membership.
      const targetFileId = edge.target.startsWith('file:')
        ? edge.target
        : `file:${edge.target.split(':')[1]}`;
      if (memberFileIds.has(targetFileId)) internalEdges++;
    }
  }
  return totalEdges === 0 ? 0 : Number((internalEdges / totalEdges).toFixed(2));
};

const getTopProcessCandidates = (
  files: Map<string, FileInfo>,
  fileContents: Map<string, string>,
  importedByCount: Map<string, number>
): Array<{ filePath: string; score: number; reason: string }> => {
  const registry = getLanguageRegistry();
  const candidates: Array<{ filePath: string; score: number; reason: string }> = [];

  for (const [filePath, fileInfo] of files) {
    const provider = registry.getForFile(filePath);
    const content = fileContents.get(filePath) || '';
    const importCount = fileInfo.imports.length;
    const dependentCount = importedByCount.get(filePath) || 0;
    let score = 0;
    let reason = '';

    if (provider) {
      for (const pattern of provider.getEntryPointPatterns()) {
        if (pattern.test(content)) {
          score += 3;
          reason = 'matched entry-point pattern';
          break;
        }
      }
    }

    if (dependentCount === 0 && importCount > 0) {
      score += 2;
      reason ||= 'root-level dependency origin';
    }

    if (path.posix.basename(filePath).match(/^(index|main|app|server|cli|router)\./)) {
      score += 2;
      reason ||= 'entry filename heuristic';
    }

    if (filePath.startsWith('src/')) {
      score += 1;
    }

    if (score > 0) {
      candidates.push({
        filePath,
        score,
        reason: reason || 'topology heuristic',
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
    .slice(0, MAX_PROCESSES);
};

export const buildKnowledgeGraphData = async (
  repoRoot: string,
  files: Map<string, FileInfo>,
  dependencyEdges: DependencyEdge[]
): Promise<KnowledgeGraphData> => {
  const nodes = new Map<string, KnowledgeGraphNode>();
  const edges = new Map<string, KnowledgeGraphEdge>();
  const importedByCount = new Map<string, number>();
  const symbolIdsByFile = new Map<string, Map<string, string>>();
  const localSymbolIdsByFile = new Map<string, Map<string, string>>();
  const exportedSymbolIdsByName = new Map<string, string[]>();
  const importedSymbolBindingsByFile = new Map<string, Map<string, string>>();
  const existingFiles = new Set(files.keys());
  const fileContents = new Map<string, string>();
  const symbolRangesByFile = new Map<string, SymbolRange[]>();
  const childrenByParent = new Map<string, string[]>();
  const resolveImportCache = new Map<string, string | null>();

  const addChild = (parentId: string, childId: string): void => {
    const children = childrenByParent.get(parentId) || [];
    children.push(childId);
    childrenByParent.set(parentId, children);
  };

  const addNode = (node: Omit<KnowledgeGraphNode, 'degree'>): void => {
    if (nodes.has(node.id)) {
      return;
    }

    nodes.set(node.id, { ...node, degree: 0 });
    if (node.parentId) {
      addChild(node.parentId, node.id);
    }
  };

  const addEdge = (edge: KnowledgeGraphEdge): void => {
    if (edges.has(edge.id) || edge.source === edge.target) {
      return;
    }

    edges.set(edge.id, edge);
  };

  for (const [relativePath] of files) {
    const absolutePath = path.resolve(repoRoot, relativePath);
    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      fileContents.set(relativePath, content);
    } catch {
      fileContents.set(relativePath, '');
    }
  }

  for (const edge of dependencyEdges) {
    importedByCount.set(edge.to, (importedByCount.get(edge.to) || 0) + 1);
  }

  addNode({
    id: REPO_NODE_ID,
    label: path.basename(repoRoot),
    kind: 'repo',
    path: repoRoot,
    depth: 0,
    metrics: {
      symbols: Array.from(files.values()).reduce((total, file) => total + file.symbols.length, 0),
      imports: dependencyEdges.length,
      exports: Array.from(files.values()).reduce((total, file) => total + file.exports.length, 0),
      lines: Array.from(files.values()).reduce((total, file) => total + file.lines, 0),
    },
  });

  for (const [relativePath, fileInfo] of files) {
    const segments = relativePath.split('/');
    let currentDirectory = '';
    let parentId = REPO_NODE_ID;

    for (let index = 0; index < segments.length - 1; index++) {
      currentDirectory = currentDirectory ? `${currentDirectory}/${segments[index]}` : segments[index];
      const currentDirectoryId = directoryId(currentDirectory);
      const parentDirectory = index === 0 ? '' : currentDirectory.slice(0, currentDirectory.lastIndexOf('/'));

      addNode({
        id: currentDirectoryId,
        label: path.posix.basename(currentDirectory),
        kind: 'directory',
        path: currentDirectory,
        parentId: parentDirectory ? directoryId(parentDirectory) : REPO_NODE_ID,
        depth: index + 1,
        metrics: {},
      });

      addEdge({
        id: `contains:${parentId}->${currentDirectoryId}`,
        source: parentId,
        target: currentDirectoryId,
        kind: 'contains',
        weight: 1,
      });

      parentId = currentDirectoryId;
    }

    const fileNodeId = fileId(relativePath);
    const relativeDirectory = normalizeRelativeDirectory(relativePath);

    addNode({
      id: fileNodeId,
      label: path.posix.basename(relativePath),
      kind: 'file',
      path: relativePath,
      parentId: relativeDirectory ? directoryId(relativeDirectory) : REPO_NODE_ID,
      depth: segments.length,
      language: fileInfo.language,
      metrics: {
        lines: fileInfo.lines,
        imports: fileInfo.imports.length,
        importedBy: importedByCount.get(relativePath) || 0,
        symbols: fileInfo.symbols.length,
        exports: fileInfo.exports.length,
      },
    });

    addEdge({
      id: `contains:${relativeDirectory ? directoryId(relativeDirectory) : REPO_NODE_ID}->${fileNodeId}`,
      source: relativeDirectory ? directoryId(relativeDirectory) : REPO_NODE_ID,
      target: fileNodeId,
      kind: 'contains',
      weight: 1,
    });

    const fileSymbolIds = new Map<string, string>();
    const localSymbolIds = new Map<string, string>();

    for (const symbol of fileInfo.symbols) {
      const currentSymbolId = symbolId(symbol);
      fileSymbolIds.set(symbol.name, currentSymbolId);
      localSymbolIds.set(symbol.name, currentSymbolId);

      addNode({
        id: currentSymbolId,
        label: symbol.name,
        kind: symbol.kind,
        path: relativePath,
        parentId: fileNodeId,
        depth: segments.length + 1,
        line: symbol.line,
        language: fileInfo.language,
        exported: symbol.exported,
        metrics: {},
      });

      addEdge({
        id: `defines:${fileNodeId}->${currentSymbolId}`,
        source: fileNodeId,
        target: currentSymbolId,
        kind: 'defines',
        weight: 0.85,
      });

      if (symbol.exported) {
        const existing = exportedSymbolIdsByName.get(symbol.name) || [];
        existing.push(currentSymbolId);
        exportedSymbolIdsByName.set(symbol.name, existing);
      }
    }

    symbolIdsByFile.set(relativePath, fileSymbolIds);
    localSymbolIdsByFile.set(relativePath, localSymbolIds);
    symbolRangesByFile.set(relativePath, createSymbolRanges(fileInfo.symbols, fileInfo.lines));
  }

  for (const edge of dependencyEdges) {
    addEdge({
      id: `imports:${fileId(edge.from)}->${fileId(edge.to)}`,
      source: fileId(edge.from),
      target: fileId(edge.to),
      kind: 'imports',
      weight: edge.kind === 'dynamic' ? 0.9 : edge.kind === 'type-only' ? 0.65 : 1,
    });
  }

  for (const [relativePath, fileInfo] of files) {
    const bindings = new Map<string, string>();

    for (const importInfo of fileInfo.imports) {
      const cacheKey = `${relativePath}\0${importInfo.source}`;
      const cachedTarget = resolveImportCache.get(cacheKey);
      const resolvedTarget = cachedTarget !== undefined ? cachedTarget : (() => {
        const r = resolveImportPath(relativePath, importInfo.source, existingFiles);
        resolveImportCache.set(cacheKey, r);
        return r;
      })();
      if (!resolvedTarget) {
        continue;
      }

      const targetSymbols = symbolIdsByFile.get(resolvedTarget);
      const targetFile = files.get(resolvedTarget);
      if (!targetSymbols || !targetFile) {
        continue;
      }

      const specifiers = importInfo.specifiers.length > 0
        ? importInfo.specifiers
        : importInfo.isDefault
        ? ['default']
        : [];

      for (const specifier of specifiers) {
        const importedSymbolId = findImportedSymbolId(targetSymbols, targetFile.exports, importInfo, specifier);
        if (!importedSymbolId) {
          continue;
        }

        bindings.set(specifier, importedSymbolId);
        addEdge({
          id: `uses:${fileId(relativePath)}->${importedSymbolId}`,
          source: fileId(relativePath),
          target: importedSymbolId,
          kind: 'uses',
          weight: importInfo.isNamespace ? 0.45 : 0.8,
        });
      }
    }

    importedSymbolBindingsByFile.set(relativePath, bindings);
  }

  for (const [relativePath] of files) {
    const content = fileContents.get(relativePath) || '';
    const lines = content.split('\n');
    const ranges = symbolRangesByFile.get(relativePath) || [];
    const localSymbols = localSymbolIdsByFile.get(relativePath) || new Map<string, string>();
    const importedSymbols = importedSymbolBindingsByFile.get(relativePath) || new Map<string, string>();

    for (let index = 0; index < lines.length; index++) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      const lineNumber = index + 1;

      const classMatch = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/.exec(line);
      if (classMatch) {
        const sourceId = localSymbols.get(classMatch[1]);
        if (sourceId && classMatch[2]) {
          const targetId = resolveTargetSymbolId(classMatch[2], localSymbols, importedSymbols, exportedSymbolIdsByName);
          if (targetId) {
            addEdge({
              id: `extends:${sourceId}->${targetId}`,
              source: sourceId,
              target: targetId,
              kind: 'extends',
              weight: 0.9,
            });
          }
        }

        if (sourceId && classMatch[3]) {
          for (const contract of classMatch[3].split(',').map((item) => item.trim()).filter(Boolean)) {
            const targetId = resolveTargetSymbolId(contract, localSymbols, importedSymbols, exportedSymbolIdsByName);
            if (targetId) {
              addEdge({
                id: `implements:${sourceId}->${targetId}`,
                source: sourceId,
                target: targetId,
                kind: 'implements',
                weight: 0.8,
              });
            }
          }
        }
      }

      const interfaceMatch = /interface\s+(\w+)(?:\s+extends\s+([^{]+))?/.exec(line);
      if (interfaceMatch && interfaceMatch[2]) {
        const sourceId = localSymbols.get(interfaceMatch[1]);
        if (sourceId) {
          for (const contract of interfaceMatch[2].split(',').map((item) => item.trim()).filter(Boolean)) {
            const targetId = resolveTargetSymbolId(contract, localSymbols, importedSymbols, exportedSymbolIdsByName);
            if (targetId) {
              addEdge({
                id: `extends:${sourceId}->${targetId}`,
                source: sourceId,
                target: targetId,
                kind: 'extends',
                weight: 0.75,
              });
            }
          }
        }
      }

      const containingSymbol = findContainingSymbol(ranges, lineNumber);
      if (!containingSymbol) {
        continue;
      }

      const callMatches = rawLine.matchAll(/\b([A-Za-z_]\w*)\s*\(/g);
      for (const match of callMatches) {
        const callee = match[1];
        if (CALL_KEYWORDS.has(callee)) {
          continue;
        }

        const targetId = resolveTargetSymbolId(callee, localSymbols, importedSymbols, exportedSymbolIdsByName);
        if (!targetId) {
          continue;
        }

        addEdge({
          id: `calls:${containingSymbol.id}->${targetId}:${lineNumber}:${callee}`,
          source: containingSymbol.id,
          target: targetId,
          kind: 'calls',
          weight: 0.7,
        });
      }
    }
  }

  const collectDescendants = (nodeId: string): string[] => {
    const descendants: string[] = [];
    const children = childrenByParent.get(nodeId) || [];
    for (const childId of children) {
      descendants.push(childId, ...collectDescendants(childId));
    }
    return descendants;
  };

  const fileToOutgoingEdges = new Map<string, KnowledgeGraphEdge[]>();
  for (const edge of edges.values()) {
    if (edge.kind === 'imports' || edge.kind === 'uses') {
      const list = fileToOutgoingEdges.get(edge.source) ?? [];
      list.push(edge);
      fileToOutgoingEdges.set(edge.source, list);
    }
  }

  const directoryCandidates = [...nodes.values()]
    .filter((node) => node.kind === 'directory' && node.depth <= 2)
    .map((node) => {
      const descendants = collectDescendants(node.id).map((descendantId) => nodes.get(descendantId)).filter(Boolean) as KnowledgeGraphNode[];
      const fileNodes = descendants.filter((entry) => entry.kind === 'file');
      const symbolNodes = descendants.filter((entry) => !['repo', 'directory', 'file', 'community', 'process'].includes(entry.kind));
      return { node, fileNodes, symbolNodes };
    })
    .filter(({ fileNodes, symbolNodes }) => fileNodes.length >= COMMUNITY_MIN_FILE_COUNT || symbolNodes.length >= COMMUNITY_MIN_SYMBOL_COUNT)
    .sort((left, right) => right.symbolNodes.length - left.symbolNodes.length || right.fileNodes.length - left.fileNodes.length)
    .slice(0, MAX_COMMUNITIES);

  const fileToCommunity = new Map<string, string>();

  for (const candidate of directoryCandidates) {
    const memberFileIds = new Set(candidate.fileNodes.map((node) => node.id));
    const cohesion = calculateCommunityCohesion(memberFileIds, fileToOutgoingEdges);
    const currentCommunityId = communityId(candidate.node.path);

    addNode({
      id: currentCommunityId,
      label: `${candidate.node.label} cluster`,
      kind: 'community',
      path: candidate.node.path,
      depth: 1,
      metrics: {
        symbols: candidate.symbolNodes.length,
      },
      details: {
        description: inferCommunityDescription(candidate.node.label),
        cohesion,
        memberCount: candidate.fileNodes.length + candidate.symbolNodes.length,
      },
    });

    for (const memberNode of [...candidate.fileNodes, ...candidate.symbolNodes]) {
      addEdge({
        id: `member_of:${memberNode.id}->${currentCommunityId}`,
        source: memberNode.id,
        target: currentCommunityId,
        kind: 'member_of',
        weight: 0.5,
      });

      if (memberNode.kind === 'file' && !fileToCommunity.has(memberNode.path)) {
        fileToCommunity.set(memberNode.path, currentCommunityId);
      }
    }
  }

  const processCandidates = getTopProcessCandidates(files, fileContents, importedByCount);
  const dependencyMap = new Map<string, string[]>();
  for (const edge of dependencyEdges) {
    const existing = dependencyMap.get(edge.from) || [];
    existing.push(edge.to);
    dependencyMap.set(edge.from, existing);
  }

  for (const candidate of processCandidates) {
    const queue: Array<{ filePath: string; step: number }> = [{ filePath: candidate.filePath, step: 1 }];
    const visited = new Set<string>();
    const processSteps: Array<{ filePath: string; step: number }> = [];

    while (queue.length > 0 && processSteps.length < MAX_PROCESS_STEPS) {
      const current = queue.shift()!;
      if (visited.has(current.filePath)) {
        continue;
      }

      visited.add(current.filePath);
      processSteps.push(current);

      if (current.step >= 5) {
        continue;
      }

      for (const nextFile of dependencyMap.get(current.filePath) || []) {
        if (!visited.has(nextFile)) {
          queue.push({ filePath: nextFile, step: current.step + 1 });
        }
      }
    }

    if (processSteps.length < 2) {
      continue;
    }

    const communities = Array.from(
      new Set(processSteps.map((step) => fileToCommunity.get(step.filePath)).filter(Boolean) as string[])
    );

    const currentProcessId = processId(candidate.filePath);
    addNode({
      id: currentProcessId,
      label: `${path.posix.basename(candidate.filePath)} flow`,
      kind: 'process',
      path: candidate.filePath,
      depth: 1,
      metrics: {},
      details: {
        description: candidate.reason,
        processType: communities.length > 1 ? 'cross-cutting' : 'entry',
        stepCount: processSteps.length,
        communities,
      },
    });

    for (const step of processSteps) {
      addEdge({
        id: `step_in_process:${fileId(step.filePath)}->${currentProcessId}:${step.step}`,
        source: fileId(step.filePath),
        target: currentProcessId,
        kind: 'step_in_process',
        weight: Math.max(0.2, 1 - (step.step * 0.08)),
      });
    }
  }

  for (const edge of edges.values()) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source) {
      source.degree += 1;
    }
    if (target) {
      target.degree += 1;
    }
  }

  const byKind = {} as Record<KnowledgeGraphNodeKind, number>;
  for (const node of nodes.values()) {
    byKind[node.kind] = (byKind[node.kind] || 0) + 1;
  }

  const byEdgeKind = {
    contains: 0,
    defines: 0,
    imports: 0,
    uses: 0,
    calls: 0,
    extends: 0,
    implements: 0,
    member_of: 0,
    step_in_process: 0,
  } satisfies Record<KnowledgeGraphEdgeKind, number>;

  for (const edge of edges.values()) {
    byEdgeKind[edge.kind] += 1;
  }

  const nodeList = Array.from(nodes.values()).sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }

    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }

    return left.label.localeCompare(right.label);
  });

  const edgeList = Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id));

  return {
    nodes: nodeList,
    edges: edgeList,
    stats: {
      totalNodes: nodeList.length,
      totalEdges: edgeList.length,
      maxDepth: nodeList.reduce((maxDepth, node) => Math.max(maxDepth, node.depth), 0),
      byKind,
      byEdgeKind,
      topConnected: [...nodeList]
        .sort((left, right) => right.degree - left.degree)
        .slice(0, 10)
        .map((node) => ({
          id: node.id,
          label: node.label,
          kind: node.kind,
          degree: node.degree,
          path: node.path,
        })),
    },
  };
};
