import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  Filter,
  Folder,
  FolderOpen,
  GitBranch,
  Info,
  Network,
  Search,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { fetchGraphFile } from '../api';
import type { GraphData, GraphFileData } from '../types';
import { KnowledgeGraphSigmaCanvas } from './KnowledgeGraphSigmaCanvas';

type GraphNode = GraphData['nodes'][number];
type GraphEdge = GraphData['edges'][number];
type NodeKind = GraphNode['kind'];
type EdgeKind = GraphEdge['kind'];
type SidebarTab = 'explorer' | 'filters';

interface KnowledgeGraphPanelProps {
  data: GraphData;
}

interface LayerInsight {
  id: string;
  label: string;
  fileCount: number;
  symbolCount: number;
  responsibility: string;
  evidence: string[];
}

interface TreeNode {
  id: string;
  label: string;
  kind: NodeKind;
  path: string;
  children: TreeNode[];
}

const NODE_KIND_ORDER: NodeKind[] = [
  'repo',
  'directory',
  'file',
  'community',
  'process',
  'class',
  'interface',
  'function',
  'method',
  'property',
  'variable',
  'type',
  'enum',
  'namespace',
];

const EDGE_KIND_ORDER: EdgeKind[] = [
  'contains',
  'defines',
  'imports',
  'uses',
  'calls',
  'extends',
  'implements',
  'member_of',
  'step_in_process',
];

const NODE_COLORS: Record<NodeKind, string> = {
  repo: '#f97316',
  directory: '#8b5cf6',
  file: '#38bdf8',
  community: '#ec4899',
  process: '#f97316',
  class: '#22c55e',
  interface: '#14b8a6',
  function: '#facc15',
  method: '#fb7185',
  property: '#f472b6',
  variable: '#f59e0b',
  type: '#a78bfa',
  enum: '#ef4444',
  namespace: '#94a3b8',
};

const EDGE_COLORS: Record<EdgeKind, string> = {
  contains: '#3f3f46',
  defines: '#14b8a6',
  imports: '#38bdf8',
  uses: '#f59e0b',
  calls: '#8b5cf6',
  extends: '#22c55e',
  implements: '#f43f5e',
  member_of: '#ec4899',
  step_in_process: '#f97316',
};

const formatKind = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());

const createSetFrom = <T extends string>(items: readonly T[]): Set<T> => new Set(items);


const buildExplorerTree = (nodes: GraphNode[]): TreeNode[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const treeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  const getTreeNode = (node: GraphNode): TreeNode => {
    const existing = treeMap.get(node.id);
    if (existing) {
      return existing;
    }

    const created: TreeNode = {
      id: node.id,
      label: node.label,
      kind: node.kind,
      path: node.path,
      children: [],
    };
    treeMap.set(node.id, created);
    return created;
  };

  const hierarchyNodes = nodes.filter((node) => node.kind !== 'community' && node.kind !== 'process');
  const sorted = [...hierarchyNodes].sort((left, right) => left.depth - right.depth || left.path.localeCompare(right.path));

  for (const node of sorted) {
    const treeNode = getTreeNode(node);
    if (!node.parentId || !nodeMap.has(node.parentId)) {
      roots.push(treeNode);
      continue;
    }

    const parent = nodeMap.get(node.parentId)!;
    const parentTreeNode = getTreeNode(parent);
    if (!parentTreeNode.children.some((child) => child.id === treeNode.id)) {
      parentTreeNode.children.push(treeNode);
    }
  }

  const sortChildren = (entries: TreeNode[]): void => {
    entries.sort((left, right) => {
      if (left.kind !== right.kind) {
        return NODE_KIND_ORDER.indexOf(left.kind) - NODE_KIND_ORDER.indexOf(right.kind);
      }
      return left.path.localeCompare(right.path);
    });
    for (const entry of entries) {
      sortChildren(entry.children);
    }
  };

  sortChildren(roots);
  return roots;
};

const filterExplorerTree = (entries: TreeNode[], query: string): TreeNode[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries;
  }

  const visit = (entry: TreeNode): TreeNode | null => {
    const filteredChildren = entry.children
      .map((child) => visit(child))
      .filter((child): child is TreeNode => Boolean(child));
    const matches = `${entry.label} ${entry.path} ${entry.kind}`.toLowerCase().includes(normalized);

    if (!matches && filteredChildren.length === 0) {
      return null;
    }

    return {
      ...entry,
      children: filteredChildren,
    };
  };

  return entries.map((entry) => visit(entry)).filter((entry): entry is TreeNode => Boolean(entry));
};

const getTreeIcon = (kind: NodeKind, expanded: boolean) => {
  if (kind === 'directory' || kind === 'repo') {
    return expanded ? FolderOpen : Folder;
  }

  if (kind === 'file') {
    return FileCode;
  }

  return Sparkles;
};

const getFileTarget = (node: GraphNode | null): { path: string; line?: number } | null => {
  if (!node) {
    return null;
  }

  if (node.kind === 'file') {
    return { path: node.path };
  }

  if (node.kind === 'directory' || node.kind === 'repo' || node.kind === 'community' || node.kind === 'process') {
    return null;
  }

  return { path: node.path, line: node.line };
};

const describeLayer = (label: string): string => {
  const normalized = label.toLowerCase();
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
    return 'Configuration surface and environment wiring.';
  }
  return 'Domain or support layer inferred from repository topology.';
};

const getEdgeDescription = (kind: EdgeKind): string => {
  switch (kind) {
    case 'contains':
      return 'contains';
    case 'defines':
      return 'defines';
    case 'imports':
      return 'imports';
    case 'uses':
      return 'uses';
    case 'calls':
      return 'calls';
    case 'extends':
      return 'extends';
    case 'implements':
      return 'implements';
    case 'member_of':
      return 'belongs to';
    case 'step_in_process':
      return 'participates in';
    default:
      return kind;
  }
};

const buildSnippetLines = (snippet: GraphFileData): Array<{ number: number; text: string; focused: boolean }> =>
  snippet.snippet.split('\n').map((text, index) => {
    const lineNumber = snippet.startLine + index;
    return {
      number: lineNumber,
      text,
      focused: lineNumber === snippet.focusLine,
    };
  });

const snippetTitle = (snippet: GraphFileData): string => snippet.path.split('/').pop() || snippet.path;

const SnippetCard = ({
  title,
  subtitle,
  snippet,
}: {
  title: string;
  subtitle: string;
  snippet: GraphFileData;
}) => {
  const lines = buildSnippetLines(snippet);

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/70">
      <div className="flex items-center justify-between border-b border-neutral-800/80 px-3 py-2">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200">
          {snippet.language || 'code'}
        </div>
      </div>
      <div className="max-h-[280px] overflow-auto">
        <div className="min-w-full font-mono text-[12px] leading-5">
          {lines.map((line) => (
            <div
              key={line.number}
              className={`grid grid-cols-[52px_minmax(0,1fr)] gap-0 border-l-2 ${
                line.focused ? 'border-cyan-400 bg-cyan-500/8' : 'border-transparent'
              }`}
            >
              <div className="select-none border-r border-neutral-900 px-3 py-0.5 text-right text-neutral-600">
                {line.number}
              </div>
              <pre className="overflow-x-auto px-3 py-0.5 text-neutral-200">{line.text || ' '}</pre>
            </div>
          ))}
        </div>
      </div>
      {snippet.truncated && (
        <div className="border-t border-neutral-800/80 px-3 py-2 text-xs text-neutral-500">
          Showing lines {snippet.startLine}-{snippet.endLine} of {snippet.totalLines}
        </div>
      )}
    </div>
  );
};

const ExplorerTreeItem = ({
  entry,
  depth,
  expandedPaths,
  selectedNodeId,
  matchedNodeIds,
  onToggle,
  onSelect,
}: {
  entry: TreeNode;
  depth: number;
  expandedPaths: Set<string>;
  selectedNodeId: string | null;
  matchedNodeIds: Set<string>;
  onToggle: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
}) => {
  const expanded = expandedPaths.has(entry.id);
  const hasChildren = entry.children.length > 0;
  const selected = selectedNodeId === entry.id;
  const matched = matchedNodeIds.has(entry.id);
  const Icon = getTreeIcon(entry.kind, expanded);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-xl pr-2 transition ${
          selected ? 'bg-white text-black' : matched ? 'bg-sky-500/10 text-white' : 'text-neutral-300 hover:bg-neutral-900/70'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          onClick={() => hasChildren && onToggle(entry.id)}
          className={`flex h-7 w-6 items-center justify-center rounded-md ${
            hasChildren ? 'text-neutral-500 hover:text-white' : 'cursor-default text-transparent'
          }`}
          disabled={!hasChildren}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span />}
        </button>
        <button
          onClick={() => onSelect(entry.id)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1.5 text-left"
        >
          <Icon
            className="h-4 w-4 shrink-0"
            style={{ color: selected ? '#000000' : NODE_COLORS[entry.kind] }}
          />
          <span className="truncate text-sm">{entry.label}</span>
        </button>
      </div>

      {expanded &&
        entry.children.map((child) => (
          <ExplorerTreeItem
            key={child.id}
            entry={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            selectedNodeId={selectedNodeId}
            matchedNodeIds={matchedNodeIds}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

interface GraphPanelState {
  sidebarTab: SidebarTab;
  searchInput: string;
  searchTerm: string;
  selectedNodeId: string | null;
  expandedPaths: Set<string>;
  visibleKinds: Set<NodeKind>;
  visibleEdgeKinds: Set<EdgeKind>;
  neighborhoodOnly: boolean;
  hopLimit: number;
  showLabels: boolean;
  primarySnippet: GraphFileData | null;
  relatedSnippets: GraphFileData[];
  snippetLoading: boolean;
  snippetError: string | null;
}

type GraphPanelAction =
  | { type: 'SELECT_NODE'; id: string | null }
  | { type: 'SET_SEARCH_INPUT'; value: string }
  | { type: 'SET_SEARCH_TERM'; value: string }
  | { type: 'TOGGLE_KIND'; kind: NodeKind }
  | { type: 'TOGGLE_EDGE_KIND'; kind: EdgeKind }
  | { type: 'SET_SIDEBAR_TAB'; tab: SidebarTab }
  | { type: 'SET_HOP_LIMIT'; limit: number }
  | { type: 'TOGGLE_NEIGHBORHOOD_ONLY' }
  | { type: 'TOGGLE_LABELS' }
  | { type: 'SET_EXPANDED_PATHS'; paths: Set<string> }
  | { type: 'SET_SNIPPET'; primary: GraphFileData | null; related: GraphFileData[] }
  | { type: 'SET_SNIPPET_LOADING'; loading: boolean }
  | { type: 'SET_SNIPPET_ERROR'; error: string | null };

const initialState: GraphPanelState = {
  sidebarTab: 'explorer',
  searchInput: '',
  searchTerm: '',
  selectedNodeId: null,
  expandedPaths: new Set(['repo:.']),
  visibleKinds: createSetFrom(NODE_KIND_ORDER),
  visibleEdgeKinds: createSetFrom(EDGE_KIND_ORDER),
  neighborhoodOnly: false,
  hopLimit: 2,
  showLabels: true,
  primarySnippet: null,
  relatedSnippets: [],
  snippetLoading: false,
  snippetError: null,
};

function graphPanelReducer(state: GraphPanelState, action: GraphPanelAction): GraphPanelState {
  switch (action.type) {
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.id };
    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value };
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.value };
    case 'TOGGLE_KIND': {
      const next = new Set(state.visibleKinds);
      if (next.has(action.kind)) next.delete(action.kind);
      else next.add(action.kind);
      return { ...state, visibleKinds: next.size === 0 ? new Set<NodeKind>([action.kind]) : next };
    }
    case 'TOGGLE_EDGE_KIND': {
      const next = new Set(state.visibleEdgeKinds);
      if (next.has(action.kind)) next.delete(action.kind);
      else next.add(action.kind);
      return { ...state, visibleEdgeKinds: next.size === 0 ? new Set<EdgeKind>([action.kind]) : next };
    }
    case 'SET_SIDEBAR_TAB':
      return { ...state, sidebarTab: action.tab };
    case 'SET_HOP_LIMIT':
      return { ...state, hopLimit: action.limit };
    case 'TOGGLE_NEIGHBORHOOD_ONLY':
      return { ...state, neighborhoodOnly: !state.neighborhoodOnly };
    case 'TOGGLE_LABELS':
      return { ...state, showLabels: !state.showLabels };
    case 'SET_EXPANDED_PATHS':
      return { ...state, expandedPaths: action.paths };
    case 'SET_SNIPPET':
      return { ...state, primarySnippet: action.primary, relatedSnippets: action.related };
    case 'SET_SNIPPET_LOADING':
      return { ...state, snippetLoading: action.loading };
    case 'SET_SNIPPET_ERROR':
      return { ...state, snippetError: action.error };
    default:
      return state;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const KnowledgeGraphPanel = ({ data }: KnowledgeGraphPanelProps) => {
  const [state, dispatch] = useReducer(graphPanelReducer, initialState);
  const {
    sidebarTab,
    searchInput,
    searchTerm,
    selectedNodeId,
    expandedPaths,
    visibleKinds,
    visibleEdgeKinds,
    neighborhoodOnly,
    hopLimit,
    showLabels,
    primarySnippet,
    relatedSnippets,
    snippetLoading,
    snippetError,
  } = state;

  const snippetAbortRef = useRef<AbortController | null>(null);

  const nodeMap = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);

  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (!hasAutoSelected.current && !selectedNodeId && data.stats.topConnected.length > 0) {
      hasAutoSelected.current = true;
      dispatch({ type: 'SELECT_NODE', id: data.stats.topConnected[0].id });
    }
  }, [data.stats.topConnected]);

  const explorerTree = useMemo(() => buildExplorerTree(data.nodes), [data.nodes]);

  useEffect(() => {
    const next = new Set<string>(['repo:.']);
    for (const root of explorerTree) {
      next.add(root.id);
    }
    dispatch({ type: 'SET_EXPANDED_PATHS', paths: next });
  }, [explorerTree]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const nextAncestors = new Set<string>();
    let current = nodeMap.get(selectedNodeId) || null;
    while (current?.parentId) {
      nextAncestors.add(current.parentId);
      current = nodeMap.get(current.parentId) || null;
    }

    const next = new Set(expandedPaths);
    next.add(selectedNodeId);
    for (const ancestorId of nextAncestors) {
      next.add(ancestorId);
    }
    dispatch({ type: 'SET_EXPANDED_PATHS', paths: next });
  // expandedPaths intentionally excluded — we only want to fire when selectedNodeId or nodeMap changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeMap, selectedNodeId]);

  // Debounce search input → search term (200ms)
  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: 'SET_SEARCH_TERM', value: searchInput }), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const adjacency = useMemo(() => {
    const graph = new Map<string, Set<string>>();

    for (const edge of data.edges) {
      if (!graph.has(edge.source)) {
        graph.set(edge.source, new Set());
      }
      if (!graph.has(edge.target)) {
        graph.set(edge.target, new Set());
      }

      graph.get(edge.source)!.add(edge.target);
      graph.get(edge.target)!.add(edge.source);
    }

    return graph;
  }, [data.edges]);

  const matchedNodeIds = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return new Set<string>();
    }

    return new Set(
      data.nodes
        .filter((node) => `${node.label} ${node.path} ${node.kind}`.toLowerCase().includes(normalizedSearch))
        .map((node) => node.id)
    );
  }, [data.nodes, searchTerm]);

  const neighborhoodNodeIds = useMemo(() => {
    if (!selectedNodeId || !neighborhoodOnly) {
      return null;
    }

    const visited = new Set<string>([selectedNodeId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: selectedNodeId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= hopLimit) {
        continue;
      }

      const neighbors = adjacency.get(current.id);
      if (!neighbors) {
        continue;
      }

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }

        visited.add(neighborId);
        queue.push({ id: neighborId, depth: current.depth + 1 });
      }
    }

    return visited;
  }, [adjacency, hopLimit, neighborhoodOnly, selectedNodeId]);

  const visibleNodes = useMemo(() => {
    return data.nodes.filter((node) => {
      if (!visibleKinds.has(node.kind)) {
        return false;
      }

      if (neighborhoodNodeIds && !neighborhoodNodeIds.has(node.id)) {
        return false;
      }

      return true;
    });
  }, [data.nodes, neighborhoodNodeIds, visibleKinds]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const visibleEdges = useMemo(() => {
    return data.edges.filter((edge) => {
      if (!visibleEdgeKinds.has(edge.kind)) {
        return false;
      }

      return visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target);
    });
  }, [data.edges, visibleEdgeKinds, visibleNodeIds]);

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;

  const selectedNeighbors = useMemo(() => {
    if (!selectedNodeId) {
      return new Set<string>();
    }

    const neighbors = adjacency.get(selectedNodeId);
    return new Set(neighbors ? Array.from(neighbors) : []);
  }, [adjacency, selectedNodeId]);

  const selectedFileTarget = useMemo(() => getFileTarget(selectedNode), [selectedNode]);

  const relatedFileTargets = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    const unique = new Map<string, { path: string; line?: number }>();
    for (const neighborId of Array.from(selectedNeighbors)) {
      const neighbor = nodeMap.get(neighborId);
      const target = getFileTarget(neighbor || null);
      if (!neighbor || !target || target.path === selectedFileTarget?.path) {
        continue;
      }

      unique.set(target.path, {
        path: target.path,
        line: target.line,
      });

      if (unique.size >= 2) {
        break;
      }
    }

    return Array.from(unique.values());
  }, [nodeMap, selectedFileTarget?.path, selectedNeighbors, selectedNode]);

  useEffect(() => {
    snippetAbortRef.current?.abort();
    const controller = new AbortController();
    snippetAbortRef.current = controller;

    const loadSnippets = async () => {
      if (!selectedFileTarget) {
        dispatch({ type: 'SET_SNIPPET', primary: null, related: [] });
        dispatch({ type: 'SET_SNIPPET_ERROR', error: null });
        return;
      }

      dispatch({ type: 'SET_SNIPPET_LOADING', loading: true });
      dispatch({ type: 'SET_SNIPPET_ERROR', error: null });

      try {
        const [primary, ...related] = await Promise.all([
          fetchGraphFile({
            path: selectedFileTarget.path,
            line: selectedFileTarget.line,
            context: selectedFileTarget.line ? 24 : 34,
          }, controller.signal),
          ...relatedFileTargets.map((target) =>
            fetchGraphFile({
              path: target.path,
              line: target.line,
              context: 18,
            }, controller.signal)
          ),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        dispatch({ type: 'SET_SNIPPET', primary, related });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }

        dispatch({ type: 'SET_SNIPPET', primary: null, related: [] });
        dispatch({ type: 'SET_SNIPPET_ERROR', error: error instanceof Error ? error.message : 'Failed to load code snippet.' });
      } finally {
        if (!controller.signal.aborted) {
          dispatch({ type: 'SET_SNIPPET_LOADING', loading: false });
        }
      }
    };

    void loadSnippets();

    return () => {
      snippetAbortRef.current?.abort();
    };
  }, [relatedFileTargets, selectedFileTarget]);

  const relatedEdges = useMemo(() => {
    if (!selectedNodeId) {
      return [];
    }

    return data.edges
      .filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId)
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 10);
  }, [data.edges, selectedNodeId]);

  const topDirectoryInsights = useMemo<LayerInsight[]>(() => {
    const communityNodes = data.nodes.filter((node) => node.kind === 'community');
    if (communityNodes.length > 0) {
      return communityNodes
        .map((node) => ({
          id: node.id,
          label: node.label,
          fileCount: node.details?.memberCount || 0,
          symbolCount: node.metrics.symbols || 0,
          responsibility: node.details?.description || 'Inferred community.',
          evidence: data.edges
            .filter((edge) => edge.kind === 'member_of' && edge.target === node.id)
            .map((edge) => data.nodes.find((candidate) => candidate.id === edge.source))
            .filter((candidate): candidate is GraphNode => Boolean(candidate))
            .filter((candidate) => candidate.kind === 'file')
            .sort((left, right) => right.degree - left.degree)
            .slice(0, 3)
            .map((candidate) => candidate.label),
        }))
        .slice(0, 6);
    }

    const childrenByParent = new Map<string, GraphNode[]>();
    for (const node of data.nodes) {
      if (!node.parentId) {
        continue;
      }
      const existing = childrenByParent.get(node.parentId) || [];
      existing.push(node);
      childrenByParent.set(node.parentId, existing);
    }

    const gatherDescendants = (nodeId: string): GraphNode[] => {
      const directChildren = childrenByParent.get(nodeId) || [];
      const descendants: GraphNode[] = [];
      for (const child of directChildren) {
        descendants.push(child, ...gatherDescendants(child.id));
      }
      return descendants;
    };

    return data.nodes
      .filter((node) => node.kind === 'directory' && node.depth <= 2)
      .map((node) => {
        const descendants = gatherDescendants(node.id);
        const files = descendants.filter((entry) => entry.kind === 'file');
        const symbolCount = descendants.filter((entry) => !['repo', 'directory', 'file'].includes(entry.kind)).length;
        const evidence = files
          .sort((left, right) => right.degree - left.degree)
          .slice(0, 3)
          .map((file) => file.label);

        return {
          id: node.id,
          label: node.label,
          fileCount: files.length,
          symbolCount,
          responsibility: describeLayer(node.label),
          evidence,
        };
      })
      .sort((left, right) => right.fileCount - left.fileCount || right.symbolCount - left.symbolCount)
      .slice(0, 6);
  }, [data.edges, data.nodes]);

  const processNodes = useMemo(() => {
    return data.nodes
      .filter((node) => node.kind === 'process')
      .sort((left, right) => (right.details?.stepCount || 0) - (left.details?.stepCount || 0))
      .slice(0, 6);
  }, [data.nodes]);

  const topExplorerFiles = useMemo(() => {
    return data.nodes
      .filter((node) => node.kind === 'file')
      .sort((left, right) => right.degree - left.degree)
      .slice(0, 8);
  }, [data.nodes]);

  const topExplorerSymbols = useMemo(() => {
    return data.nodes
      .filter((node) => !['repo', 'directory', 'file', 'community', 'process'].includes(node.kind))
      .sort((left, right) => right.degree - left.degree)
      .slice(0, 8);
  }, [data.nodes]);

  const matchedNodes = useMemo(() => {
    if (!searchTerm.trim()) {
      return [];
    }

    return visibleNodes
      .filter((node) => matchedNodeIds.has(node.id))
      .sort((left, right) => right.degree - left.degree)
      .slice(0, 10);
  }, [matchedNodeIds, searchTerm, visibleNodes]);

  const filteredExplorerTree = useMemo(() => filterExplorerTree(explorerTree, searchTerm), [explorerTree, searchTerm]);

  const selectedSummary = useMemo(() => {
    if (!selectedNode) {
      return 'Select a node to inspect structure, dependencies, execution flow, and source evidence.';
    }

    if (selectedNode.kind === 'file') {
      const cognitive = typeof selectedNode.metrics.cognitiveLoad === 'number'
        ? ` Cognitive load score: ${selectedNode.metrics.cognitiveLoad.toFixed(1)}.`
        : '';
      return `${selectedNode.label} imports ${selectedNode.metrics.imports || 0} modules, is imported by ${selectedNode.metrics.importedBy || 0}, and hosts ${selectedNode.metrics.symbols || 0} indexed symbols.${cognitive}`;
    }

    if (selectedNode.kind === 'directory') {
      return `${selectedNode.label} acts as a structural cluster in the repository. Its descendants define a likely subsystem boundary.`;
    }

    if (selectedNode.kind === 'community') {
      return selectedNode.details?.description || `${selectedNode.label} groups related files and symbols into a reusable architectural cluster.`;
    }

    if (selectedNode.kind === 'process') {
      return `${selectedNode.label} traces a likely execution flow through ${selectedNode.details?.stepCount || 0} files and ${selectedNode.details?.communities?.length || 0} communities.`;
    }

    if (selectedNode.kind === 'repo') {
      return `${selectedNode.label} is the graph root. Files, symbols, communities, and process flows all anchor here.`;
    }

    return `${selectedNode.label} is a ${formatKind(selectedNode.kind).toLowerCase()} defined in ${selectedNode.path}${selectedNode.line ? ` around line ${selectedNode.line}` : ''}.`;
  }, [selectedNode]);

  const processCommunities = useMemo(() => {
    return new Map(
      processNodes.map((processNode) => [
        processNode.id,
        (processNode.details?.communities || [])
          .map((communityId) => nodeMap.get(communityId)?.label)
          .filter((label): label is string => Boolean(label)),
      ])
    );
  }, [nodeMap, processNodes]);

  // ─── Callbacks ─────────────────────────────────────────────────────────────

  const handleSelectNode = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_NODE', id });
  }, []);

  const handleToggleKind = useCallback((kind: NodeKind) => {
    dispatch({ type: 'TOGGLE_KIND', kind });
  }, []);

  const handleToggleEdgeKind = useCallback((kind: EdgeKind) => {
    dispatch({ type: 'TOGGLE_EDGE_KIND', kind });
  }, []);

  // handleToggleExpandedNode needs access to current expandedPaths; use a ref so the
  // callback stays stable (no expandedPaths in deps) while always reading the latest set.
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  const handleToggleExpandedNode = useCallback((nodeId: string) => {
    const current = expandedPathsRef.current;
    const next = new Set(current);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    dispatch({ type: 'SET_EXPANDED_PATHS', paths: next });
  }, []);

  const handleSetSidebarTab = useCallback((tab: SidebarTab) => {
    dispatch({ type: 'SET_SIDEBAR_TAB', tab });
  }, []);

  const handleToggleNeighborhoodOnly = useCallback(() => {
    dispatch({ type: 'TOGGLE_NEIGHBORHOOD_ONLY' });
  }, []);

  const handleToggleLabels = useCallback(() => {
    dispatch({ type: 'TOGGLE_LABELS' });
  }, []);

  const hasSearch = searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-neutral-800/80 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.12),transparent_30%),linear-gradient(180deg,rgba(8,8,12,0.98),rgba(6,6,10,0.96))]">
        <div className="flex flex-col gap-4 border-b border-neutral-800/70 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              Graph Workspace
            </div>
            <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              {data.stats.totalNodes} nodes
            </div>
            <div className="rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              {data.stats.totalEdges} edges
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 xl:max-w-2xl xl:flex-row xl:items-center xl:justify-end">
            <div className="relative min-w-[280px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={searchInput}
                onChange={(event) => dispatch({ type: 'SET_SEARCH_INPUT', value: event.target.value })}
                placeholder="Search nodes, files, folders, or symbols"
                className="w-full rounded-xl border border-neutral-800 bg-black/50 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleNeighborhoodOnly}
                disabled={!selectedNode}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  neighborhoodOnly
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-neutral-800 bg-black/40 text-neutral-300 hover:border-neutral-700 hover:text-white'
                } ${!selectedNode ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                Focus depth
              </button>
              <button
                onClick={handleToggleLabels}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  showLabels
                    ? 'border-violet-500/60 bg-violet-500/15 text-violet-100'
                    : 'border-neutral-800 bg-black/40 text-neutral-300 hover:border-neutral-700 hover:text-white'
                }`}
              >
                Labels
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
          <aside className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-950/85">
              <div className="grid grid-cols-2 border-b border-neutral-800/80">
                <button
                  onClick={() => handleSetSidebarTab('explorer')}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm transition ${
                    sidebarTab === 'explorer' ? 'bg-white text-black' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                  }`}
                >
                  <Folder className="h-4 w-4" />
                  Explorer
                </button>
                <button
                  onClick={() => handleSetSidebarTab('filters')}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm transition ${
                    sidebarTab === 'filters' ? 'bg-white text-black' : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </button>
              </div>

              <div className="p-4">
                {sidebarTab === 'explorer' ? (
                  <div className="space-y-5">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Repository tree</p>
                        <span className="text-xs text-neutral-600">{filteredExplorerTree.length} roots</span>
                      </div>
                      <div className="max-h-[420px] space-y-1 overflow-auto rounded-2xl border border-neutral-800 bg-black/25 p-2">
                        {filteredExplorerTree.length > 0 ? (
                          filteredExplorerTree.map((entry) => (
                            <ExplorerTreeItem
                              key={entry.id}
                              entry={entry}
                              depth={0}
                              expandedPaths={expandedPaths}
                              selectedNodeId={selectedNodeId}
                              matchedNodeIds={matchedNodeIds}
                              onToggle={handleToggleExpandedNode}
                              onSelect={handleSelectNode}
                            />
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/20 p-4 text-sm text-neutral-500">
                            No nodes match the current search.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">Hub files</p>
                      <div className="space-y-2">
                        {topExplorerFiles.map((node) => (
                          <button
                            key={node.id}
                            onClick={() => handleSelectNode(node.id)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition ${
                              selectedNodeId === node.id
                                ? 'border-sky-500/50 bg-sky-500/10'
                                : 'border-neutral-800 bg-black/30 hover:border-neutral-700'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-white">{node.label}</p>
                              <p className="truncate text-xs text-neutral-500">{node.path}</p>
                            </div>
                            <span className="ml-3 rounded-full bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
                              {node.degree}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">Symbol hotspots</p>
                      <div className="flex flex-wrap gap-2">
                        {topExplorerSymbols.map((node) => (
                          <button
                            key={node.id}
                            onClick={() => handleSelectNode(node.id)}
                            className="rounded-full border border-neutral-800 bg-black/30 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-700 hover:text-white"
                          >
                            {node.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">Node types</p>
                      <div className="space-y-2">
                        {NODE_KIND_ORDER.filter((kind) => data.stats.byKind[kind]).map((kind) => (
                          <button
                            key={kind}
                            onClick={() => handleToggleKind(kind)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition ${
                              visibleKinds.has(kind)
                                ? 'text-white'
                                : 'border-neutral-800 bg-black/30 text-neutral-500'
                            }`}
                            style={{
                              backgroundColor: visibleKinds.has(kind) ? `${NODE_COLORS[kind]}18` : 'rgba(0,0,0,0.2)',
                              borderColor: visibleKinds.has(kind) ? `${NODE_COLORS[kind]}55` : undefined,
                            }}
                          >
                            <span>{formatKind(kind)}</span>
                            <span className="text-xs">{data.stats.byKind[kind]}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">Relationships</p>
                      <div className="space-y-2">
                        {EDGE_KIND_ORDER.map((kind) => (
                          <button
                            key={kind}
                            onClick={() => handleToggleEdgeKind(kind)}
                            className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left transition ${
                              visibleEdgeKinds.has(kind)
                                ? 'text-white'
                                : 'border-neutral-800 bg-black/30 text-neutral-500'
                            }`}
                            style={{
                              backgroundColor: visibleEdgeKinds.has(kind) ? `${EDGE_COLORS[kind]}18` : 'rgba(0,0,0,0.2)',
                              borderColor: visibleEdgeKinds.has(kind) ? `${EDGE_COLORS[kind]}55` : undefined,
                            }}
                          >
                            <span>{formatKind(kind)}</span>
                            <span className="text-xs">{data.stats.byEdgeKind[kind] || 0}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">Focus depth</p>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4].map((value) => (
                          <button
                            key={value}
                            onClick={() => {
                              dispatch({ type: 'SET_HOP_LIMIT', limit: value });
                              if (!neighborhoodOnly) dispatch({ type: 'TOGGLE_NEIGHBORHOOD_ONLY' });
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              neighborhoodOnly && hopLimit === value
                                ? 'border-sky-500/50 bg-sky-500/12 text-sky-100'
                                : 'border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700'
                            }`}
                          >
                            {value} hop{value > 1 ? 's' : ''}
                          </button>
                        ))}
                        <button
                          onClick={() => { if (neighborhoodOnly) dispatch({ type: 'TOGGLE_NEIGHBORHOOD_ONLY' }); }}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            !neighborhoodOnly
                              ? 'border-violet-500/50 bg-violet-500/12 text-violet-100'
                              : 'border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700'
                          }`}
                        >
                          All
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-neutral-500">Color legend</p>
                      <div className="grid grid-cols-2 gap-2">
                        {NODE_KIND_ORDER.filter((kind) => data.stats.byKind[kind]).map((kind) => (
                          <div key={kind} className="flex items-center gap-2 text-xs text-neutral-400">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS[kind] }} />
                            <span>{formatKind(kind)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-2xl border border-neutral-800 bg-black/25 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Cognitive load heat</p>
                        <div className="mt-2 h-2 rounded-full bg-[linear-gradient(90deg,#22c55e_0%,#f59e0b_50%,#ef4444_100%)]" />
                        <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500">
                          <span>Low</span>
                          <span>High</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-950/85">
              <div className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Code Inspector</p>
                  <p className="text-xs text-neutral-500">Selected node context and neighboring evidence</p>
                </div>
                <Code2 className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="space-y-3 p-4">
                {snippetLoading ? (
                  <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4 text-sm text-neutral-500">
                    Loading source context...
                  </div>
                ) : snippetError ? (
                  <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
                    {snippetError}
                  </div>
                ) : primarySnippet ? (
                  <>
                    <SnippetCard title={snippetTitle(primarySnippet)} subtitle={primarySnippet.path} snippet={primarySnippet} />
                    {relatedSnippets.map((snippet) => (
                      <SnippetCard key={`${snippet.path}:${snippet.startLine}`} title={snippetTitle(snippet)} subtitle={snippet.path} snippet={snippet} />
                    ))}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/30 p-4 text-sm text-neutral-500">
                    Pick a file or symbol node to inspect its source.
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="overflow-hidden rounded-3xl border border-neutral-800/80 bg-black">
            <div className="relative flex items-center justify-between border-b border-neutral-800/70 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">Graph Canvas</p>
                <p className="text-sm text-neutral-500">Sigma renderer with ForceAtlas layout, GitNexus-style focus, and graph-driven filtering.</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full border border-neutral-800 bg-neutral-950/90 px-3 py-1.5 text-xs text-neutral-400">
                  {visibleNodes.length} visible nodes
                </div>
              </div>
            </div>

            {matchedNodes.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-neutral-800/60 px-5 py-3">
                {matchedNodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleSelectNode(node.id)}
                    className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white"
                  >
                    {node.label}
                  </button>
                ))}
              </div>
            )}

            <KnowledgeGraphSigmaCanvas
              nodes={visibleNodes}
              edges={visibleEdges}
              selectedNodeId={selectedNodeId}
              selectedNeighbors={selectedNeighbors}
              matchedNodeIds={matchedNodeIds}
              showLabels={showLabels}
              hasSearch={hasSearch}
              onSelectNode={handleSelectNode}
            />
          </section>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-950/85">
              <div className="flex items-center justify-between border-b border-neutral-800/80 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Nexus Notes</p>
                  <p className="text-xs text-neutral-500">Graph-derived repository interpretation</p>
                </div>
                <Network className="h-4 w-4 text-violet-300" />
              </div>
              <div className="space-y-5 p-4">
                <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-emerald-200">
                    <Sparkles className="h-3 w-3" />
                    Graph Ready
                  </div>
                  <p className="text-sm leading-6 text-neutral-300">
                    The repository is anchored around <span className="font-medium text-white">{topDirectoryInsights.slice(0, 3).map((item) => item.label).join(', ') || 'its root structure'}</span>. Highest-connectivity nodes indicate where dependency traffic, call paths, and symbol ownership concentrate first.
                  </p>
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-sky-300" />
                    <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Architectural layers</p>
                  </div>
                  <div className="space-y-3">
                    {topDirectoryInsights.map((layer) => (
                      <div key={layer.id} className="rounded-2xl border border-neutral-800 bg-black/30 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            onClick={() => handleSelectNode(layer.id)}
                            className="text-left text-sm font-medium text-white transition hover:text-sky-300"
                          >
                            {layer.label}
                          </button>
                          <span className="rounded-full bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">
                            {layer.fileCount} members
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">{layer.responsibility}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {layer.evidence.map((item) => (
                            <span key={item} className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[11px] text-sky-200">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {processNodes.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-orange-300" />
                      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Execution flows</p>
                    </div>
                    <div className="space-y-3">
                      {processNodes.map((processNode) => (
                        <button
                          key={processNode.id}
                          onClick={() => handleSelectNode(processNode.id)}
                          className={`w-full rounded-2xl border p-3 text-left transition ${
                            selectedNodeId === processNode.id
                              ? 'border-orange-500/50 bg-orange-500/10'
                              : 'border-neutral-800 bg-black/30 hover:border-neutral-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">{processNode.label}</p>
                              <p className="text-xs text-neutral-500">{processNode.details?.description || 'Inferred flow from dependency topology.'}</p>
                            </div>
                            <span className="rounded-full bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300">
                              {processNode.details?.stepCount || 0} steps
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[11px] text-orange-200">
                              {formatKind(processNode.details?.processType || 'entry')}
                            </span>
                            {(processCommunities.get(processNode.id) || []).map((community) => (
                              <span key={community} className="rounded-full border border-pink-500/25 bg-pink-500/10 px-2 py-1 text-[11px] text-pink-200">
                                {community}
                              </span>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4 text-amber-300" />
                    <p className="text-sm font-medium text-white">Selection brief</p>
                  </div>
                  <p className="text-sm leading-6 text-neutral-300">{selectedSummary}</p>
                  {selectedNode && (
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Kind</p>
                        <p className="mt-2 text-white">{formatKind(selectedNode.kind)}</p>
                      </div>
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Degree</p>
                        <p className="mt-2 text-white">{selectedNode.degree}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-black/30 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Network className="h-4 w-4 text-cyan-300" />
                    <p className="text-sm font-medium text-white">Relationship feed</p>
                  </div>
                  <div className="space-y-2">
                    {selectedNode && relatedEdges.length > 0 ? (
                      relatedEdges.map((edge) => {
                        const otherNode = nodeMap.get(edge.source === selectedNode.id ? edge.target : edge.source);
                        if (!otherNode) {
                          return null;
                        }

                        return (
                          <button
                            key={edge.id}
                            onClick={() => handleSelectNode(otherNode.id)}
                            className="flex w-full items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-left transition hover:border-neutral-700"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-white">{otherNode.label}</p>
                              <p className="truncate text-xs text-neutral-500">
                                {getEdgeDescription(edge.kind)} {formatKind(otherNode.kind).toLowerCase()}
                              </p>
                            </div>
                            <span
                              className="rounded-full px-2 py-1 text-[11px]"
                              style={{
                                color: EDGE_COLORS[edge.kind],
                                backgroundColor: `${EDGE_COLORS[edge.kind]}18`,
                              }}
                            >
                              {formatKind(edge.kind)}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-500">
                        Select a node to inspect its highest-signal edges.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
