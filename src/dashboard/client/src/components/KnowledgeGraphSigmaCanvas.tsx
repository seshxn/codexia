import { useEffect, useMemo, useRef, useState } from 'react';
import { Focus, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import Sigma from 'sigma';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import type { GraphData } from '../types';

const LOD_ZOOM_THRESHOLD = 2.5;

type GraphNode = GraphData['nodes'][number];
type GraphEdge = GraphData['edges'][number];
type NodeKind = GraphNode['kind'];
type EdgeKind = GraphEdge['kind'];

interface KnowledgeGraphSigmaCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  selectedNeighbors: Set<string>;
  matchedNodeIds: Set<string>;
  showLabels: boolean;
  hasSearch: boolean;
  onSelectNode: (nodeId: string | null) => void;
}

interface Point {
  x: number;
  y: number;
}

interface SigmaNodeAttributes {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  kind: NodeKind;
  degree: number;
  forceLabel?: boolean;
  hidden?: boolean;
  zIndex?: number;
}

interface SigmaEdgeAttributes {
  size: number;
  color: string;
  kind: EdgeKind;
  hidden?: boolean;
  zIndex?: number;
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

const NOVERLAP_SETTINGS = {
  maxIterations: 20,
  ratio: 1.1,
  margin: 10,
  expansion: 1.05,
};

const getNodeRadius = (node: GraphNode): number => {
  const baseRadius: Record<NodeKind, number> = {
    repo: 18,
    directory: 12,
    file: 9,
    community: 12,
    process: 11,
    class: 8,
    interface: 7.5,
    function: 6,
    method: 5.4,
    property: 5,
    variable: 5,
    type: 5.4,
    enum: 5.8,
    namespace: 5.8,
  };

  const degreeBoost = Math.min(node.degree, 18) * 0.18;
  const fileBoost = node.kind === 'file' ? Math.min(node.metrics.symbols || 0, 18) * 0.12 : 0;
  return baseRadius[node.kind] + degreeBoost + fileBoost;
};

const getOrbitRadius = (node: GraphNode, siblingCount: number): number => {
  if (node.kind === 'directory') {
    return 170 + Math.min(siblingCount, 16) * 12 + node.depth * 28;
  }

  if (node.kind === 'file') {
    return 56 + Math.min(siblingCount, 14) * 6 + node.depth * 4;
  }

  if (node.kind === 'community' || node.kind === 'process') {
    return 260 + Math.min(siblingCount, 12) * 18;
  }

  return 24 + Math.min(siblingCount, 18) * 2.4;
};

const buildInitialLayout = (nodes: GraphNode[]): Map<string, Point> => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const containsChildren = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    if (!node.parentId || !nodeMap.has(node.parentId)) {
      continue;
    }

    const existing = containsChildren.get(node.parentId) || [];
    existing.push(node);
    containsChildren.set(node.parentId, existing);
  }

  for (const entries of containsChildren.values()) {
    entries.sort((left, right) => {
      if (left.kind !== right.kind) {
        return NODE_KIND_ORDER.indexOf(left.kind) - NODE_KIND_ORDER.indexOf(right.kind);
      }
      return left.path.localeCompare(right.path);
    });
  }

  const positions = new Map<string, Point>();
  const roots = nodes
    .filter((node) => !node.parentId || !nodeMap.has(node.parentId))
    .sort((left, right) => left.depth - right.depth || left.label.localeCompare(right.label));

  roots.forEach((root, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(roots.length, 1);
    const point = roots.length === 1 ? { x: 0, y: 0 } : { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 };
    positions.set(root.id, point);
  });

  const placeChildren = (parentId: string): void => {
    const parent = nodeMap.get(parentId);
    const parentPosition = positions.get(parentId);
    const children = containsChildren.get(parentId);

    if (!parent || !parentPosition || !children || children.length === 0) {
      return;
    }

    children.forEach((child, index) => {
      const radius = getOrbitRadius(child, children.length) / 45;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const angle = index * goldenAngle + parent.depth * 0.55;
      const point = {
        x: parentPosition.x + Math.cos(angle) * radius,
        y: parentPosition.y + Math.sin(angle) * radius,
      };

      positions.set(child.id, point);
      placeChildren(child.id);
    });
  };

  for (const root of roots) {
    placeChildren(root.id);
  }

  return positions;
};

const rgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '');
  const safe = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildSigmaGraph = (nodes: GraphNode[], edges: GraphEdge[]): Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>> => {
  const graph = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>>({
    multi: true,
  });
  const positions = buildInitialLayout(nodes);

  for (const node of nodes) {
    const point = positions.get(node.id) || { x: 0, y: 0 };
    graph.addNode(node.id, {
      x: point.x,
      y: point.y,
      size: getNodeRadius(node),
      color: NODE_COLORS[node.kind],
      label: node.label,
      kind: node.kind,
      degree: node.degree,
    });
  }

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target) || graph.hasEdge(edge.id)) {
      continue;
    }

    const size =
      edge.kind === 'contains'
        ? 0.6
        : edge.kind === 'imports' || edge.kind === 'calls' || edge.kind === 'step_in_process'
        ? 1.4
        : 1.1;

    graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
      kind: edge.kind,
      size,
      color: rgba(EDGE_COLORS[edge.kind], edge.kind === 'contains' ? 0.15 : 0.36),
    });
  }

  return graph;
};

const getFA2Settings = (nodeCount: number) => {
  const isSmall = nodeCount < 500;
  const isMedium = nodeCount >= 500 && nodeCount < 2000;
  const isLarge = nodeCount >= 2000;

  return {
    gravity: isSmall ? 0.8 : isMedium ? 0.45 : 0.2,
    scalingRatio: isSmall ? 14 : isMedium ? 28 : 54,
    slowDown: isSmall ? 1 : isMedium ? 2 : 3,
    barnesHutOptimize: nodeCount > 200,
    barnesHutTheta: isLarge ? 0.8 : 0.6,
    strongGravityMode: false,
    outboundAttractionDistribution: true,
    linLogMode: false,
    adjustSizes: true,
    edgeWeightInfluence: 1,
  };
};

const getLayoutIterations = (nodeCount: number): number => {
  if (nodeCount > 3000) {
    return 40;
  }
  if (nodeCount > 1500) {
    return 60;
  }
  if (nodeCount > 700) {
    return 80;
  }
  return 120;
};

export const KnowledgeGraphSigmaCanvas = ({
  nodes,
  edges,
  selectedNodeId,
  selectedNeighbors,
  matchedNodeIds,
  showLabels,
  hasSearch,
  onSelectNode,
}: KnowledgeGraphSigmaCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>> | null>(null);
  const graphRef = useRef<Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>> | null>(null);
  const layoutTimerRef = useRef<number | null>(null);
  const selectionRef = useRef<string | null>(selectedNodeId);
  const matchedRef = useRef<Set<string>>(matchedNodeIds);
  const neighborsRef = useRef<Set<string>>(selectedNeighbors);
  const showLabelsRef = useRef<boolean>(showLabels);
  const hasSearchRef = useRef<boolean>(hasSearch);
  const cameraRatioRef = useRef(1);
  const [cameraRatio, setCameraRatio] = useState(1);
  const [isLayoutRunning, setIsLayoutRunning] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const hoveredNode = useMemo(() => nodes.find((node) => node.id === hoveredNodeId) || null, [hoveredNodeId, nodes]);

  const runLayoutPass = (graph: Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>>, iterations?: number) => {
    if (layoutTimerRef.current) {
      clearTimeout(layoutTimerRef.current);
      layoutTimerRef.current = null;
    }

    setIsLayoutRunning(true);
    layoutTimerRef.current = window.setTimeout(() => {
      try {
        const settings = {
          ...forceAtlas2.inferSettings(graph),
          ...getFA2Settings(graph.order),
        };
        forceAtlas2.assign(graph, {
          iterations: iterations ?? getLayoutIterations(graph.order),
          settings,
        });
        noverlap.assign(graph, NOVERLAP_SETTINGS);
        sigmaRef.current?.refresh();
      } catch (error) {
        console.error('Knowledge graph layout failed; keeping initial positions.', error);
      } finally {
        layoutTimerRef.current = null;
        setIsLayoutRunning(false);
      }
    }, 16);
  };

  useEffect(() => {
    selectionRef.current = selectedNodeId;
    matchedRef.current = matchedNodeIds;
    neighborsRef.current = selectedNeighbors;
    showLabelsRef.current = showLabels;
    hasSearchRef.current = hasSearch;
    sigmaRef.current?.refresh();
  }, [hasSearch, matchedNodeIds, selectedNeighbors, selectedNodeId, showLabels]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const sigma = new Sigma<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>>(
      new Graph<SigmaNodeAttributes, SigmaEdgeAttributes, Record<string, never>>({
        multi: true,
      }),
      containerRef.current,
      {
      renderLabels: true,
      labelFont: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      labelSize: 11,
      labelWeight: '500',
      labelColor: { color: '#e5e7eb' },
      labelRenderedSizeThreshold: 9999,
      defaultNodeColor: '#6b7280',
      defaultEdgeColor: '#2a2a3a',
      allowInvalidContainer: true,
      minCameraRatio: 0.02,
      maxCameraRatio: 8,
      hideEdgesOnMove: true,
      zIndex: true,
      nodeReducer: (node, data) => {
        const selected = selectionRef.current;
        const matched = matchedRef.current;
        const neighbors = neighborsRef.current;
        const labelsEnabled = showLabelsRef.current;
        const searchActive = hasSearchRef.current;
        const isSelected = selected === node;
        const isMatched = matched.has(node);
        const isNeighbor = neighbors.has(node);
        const isHub = data.kind === 'repo' || data.kind === 'directory' || data.kind === 'community' || data.kind === 'process' || data.degree >= 9;

        const next = { ...data };
        if (selected) {
          if (isSelected) {
            next.size = data.size * 1.8;
            next.color = data.color;
            next.zIndex = 4;
          } else if (isNeighbor) {
            next.size = data.size * 1.2;
            next.color = data.color;
            next.zIndex = 2;
          } else {
            next.size = data.size * 0.55;
            next.color = rgba(data.color, 0.22);
            next.zIndex = 0;
          }
        } else if (searchActive) {
          if (isMatched) {
            next.size = data.size * 1.35;
            next.color = data.color;
            next.zIndex = 3;
          } else {
            next.size = data.size * 0.55;
            next.color = rgba(data.color, 0.18);
            next.zIndex = 0;
          }
        }

        next.forceLabel = labelsEnabled && (isSelected || isMatched || isNeighbor || isHub);

        if (cameraRatioRef.current > LOD_ZOOM_THRESHOLD) {
          const isFileOrSymbol = ['file', 'function', 'method', 'class', 'interface',
                                   'property', 'variable', 'type', 'enum', 'namespace'].includes(data.kind);
          if (isFileOrSymbol) {
            return { ...next, hidden: true };
          }
        }

        return next;
      },
      edgeReducer: (edge, data) => {
        const selected = selectionRef.current;
        const matched = matchedRef.current;
        const searchActive = hasSearchRef.current;
        const graph = graphRef.current;
        const next = { ...data };
        const edgeKind = data.kind as EdgeKind;

        if (!graph) {
          return next;
        }

        const [source, target] = graph.extremities(edge);
        const touchesSelection = Boolean(selected && (source === selected || target === selected));
        const searchDimmed = searchActive && !matched.has(source) && !matched.has(target);

        if (selected) {
          if (touchesSelection) {
            next.size = Math.max(2.2, data.size * 2.2);
            next.color = rgba(EDGE_COLORS[edgeKind], 0.92);
            next.zIndex = 2;
          } else {
            next.size = 0.25;
            next.color = rgba(EDGE_COLORS[edgeKind], 0.08);
            next.zIndex = 0;
          }
        } else if (searchDimmed) {
          next.size = 0.25;
          next.color = rgba(EDGE_COLORS[edgeKind], 0.08);
          next.zIndex = 0;
        }

        if (cameraRatioRef.current > LOD_ZOOM_THRESHOLD) {
          const lodKinds = ['file', 'function', 'method', 'class', 'interface',
                            'property', 'variable', 'type', 'enum', 'namespace'];
          const sourceAttrs = graph.getNodeAttributes(source);
          const targetAttrs = graph.getNodeAttributes(target);
          if (lodKinds.includes(sourceAttrs.kind) || lodKinds.includes(targetAttrs.kind)) {
            return { ...next, hidden: true };
          }
        }

        return next;
      },
      }
    );

    sigmaRef.current = sigma;

    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        sigma.refresh();
        rafId = null;
      });
    });
    resizeObserver.observe(containerRef.current);

    const camera = sigma.getCamera();
    camera.setState({ x: 0, y: 0, ratio: 1 });
    camera.on('updated', () => {
      const ratio = Number(camera.getState().ratio.toFixed(2));
      cameraRatioRef.current = ratio;
      setCameraRatio(ratio);
      sigma.refresh();
    });

    sigma.on('clickNode', ({ node }) => {
      onSelectNode(node);
    });

    sigma.on('clickStage', () => {
      onSelectNode(null);
    });

    sigma.on('enterNode', ({ node }) => {
      setHoveredNodeId(node);
      if (containerRef.current) {
        containerRef.current.style.cursor = 'pointer';
      }
    });

    sigma.on('leaveNode', () => {
      setHoveredNodeId(null);
      if (containerRef.current) {
        containerRef.current.style.cursor = 'grab';
      }
    });

    return () => {
      if (layoutTimerRef.current) {
        clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = null;
      }
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      sigma.kill();
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [onSelectNode]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) {
      return;
    }

    if (layoutTimerRef.current) {
      clearTimeout(layoutTimerRef.current);
      layoutTimerRef.current = null;
    }

    const graph = buildSigmaGraph(nodes, edges);
    graphRef.current = graph;  // set before setGraph so reducers see a valid ref
    sigma.setGraph(graph);
    sigma.refresh();

    if (graph.order > 0) {
      sigma.getCamera().animatedReset({ duration: 500 });
      runLayoutPass(graph);
    }
  }, [edges, nodes]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph || !selectedNodeId || !graph.hasNode(selectedNodeId)) {
      return;
    }

    const attributes = graph.getNodeAttributes(selectedNodeId);
    sigma.getCamera().animate(
      { x: attributes.x, y: attributes.y, ratio: 0.22 },
      { duration: 350 }
    );
    sigma.refresh();
  }, [selectedNodeId]);

  const zoomIn = () => {
    sigmaRef.current?.getCamera().animatedZoom({ duration: 200 });
  };

  const zoomOut = () => {
    sigmaRef.current?.getCamera().animatedUnzoom({ duration: 200 });
  };

  const resetView = () => {
    sigmaRef.current?.getCamera().animatedReset({ duration: 300 });
  };

  const focusSelection = () => {
    const sigma = sigmaRef.current;
    const graph = graphRef.current;
    if (!sigma || !graph || !selectedNodeId || !graph.hasNode(selectedNodeId)) {
      return;
    }

    const attributes = graph.getNodeAttributes(selectedNodeId);
    sigma.getCamera().animate(
      { x: attributes.x, y: attributes.y, ratio: 0.18 },
      { duration: 300 }
    );
  };

  const toggleLayout = () => {
    const graph = graphRef.current;
    if (!graph || graph.order === 0) {
      return;
    }

    if (isLayoutRunning) {
      if (layoutTimerRef.current) {
        clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = null;
      }
      return;
    }

    runLayoutPass(graph, Math.max(24, Math.floor(getLayoutIterations(graph.order) / 2)));
  };

  return (
    <div className="relative h-[980px] w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.1),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.08),transparent_28%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
      </div>

      <div ref={containerRef} className="relative h-full w-full cursor-grab active:cursor-grabbing" />

      {hoveredNode && !selectedNodeId && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-xl border border-neutral-700 bg-neutral-950/95 px-3 py-1.5 text-sm text-white shadow-2xl backdrop-blur-sm">
          {hoveredNode.label}
        </div>
      )}

      <div className="absolute right-4 top-4 flex items-center gap-2">
        <div className="rounded-full border border-neutral-800 bg-neutral-950/90 px-3 py-1.5 text-xs text-neutral-400">
          {cameraRatio}x
        </div>
        <button
          onClick={toggleLayout}
          className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-2 text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          title={isLayoutRunning ? 'Layout running' : 'Refine layout'}
        >
          <Play className={`h-4 w-4 ${isLayoutRunning ? 'animate-pulse' : ''}`} />
        </button>
      </div>

      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          onClick={zoomOut}
          className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-2 text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={zoomIn}
          className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-2 text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={resetView}
          className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-2 text-neutral-300 transition hover:border-neutral-700 hover:text-white"
          title="Reset view"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        {selectedNodeId && (
          <button
            onClick={focusSelection}
            className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-2 text-sky-200 transition hover:border-sky-400 hover:text-white"
            title="Focus selection"
          >
            <Focus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
