/**
 * Utility functions for graph data transformations
 */

import type { DependencyNode, DependencyEdge } from '../core/types.js';

export interface RawGraphNode {
  id: string;
}

export interface RawGraphEdge {
  from: string;
  to: string;
}

export interface RawGraphData {
  nodes: RawGraphNode[];
  edges: RawGraphEdge[];
}

export interface EngineGraphData {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface TransformedGraphNode {
  path: string;
  imports: string[];
  importedBy: string[];
  depth: number;
}

export interface TransformedGraphEdge {
  from: string;
  to: string;
  kind: 'static';
}

export interface TransformedGraphData {
  nodes: TransformedGraphNode[];
  edges: TransformedGraphEdge[];
  rootNodes: string[];
  leafNodes: string[];
}

/**
 * Transform engine's graph format to Visualizer's expected format
 * @param rawData - Graph data from engine (DependencyNode[] or RawGraphNode[])
 * @returns Transformed graph data with imports, importedBy, root and leaf nodes
 */
export function transformGraphData(rawData: RawGraphData | EngineGraphData): TransformedGraphData {
  const nodeMap = new Map<string, TransformedGraphNode>();
  
  // Initialize all nodes - handle both RawGraphNode (id) and DependencyNode (path)
  for (const node of rawData.nodes) {
    const nodeId = 'id' in node ? node.id : node.path;
    const nodeData: TransformedGraphNode = 'path' in node 
      ? { path: node.path, imports: [...node.imports], importedBy: [...node.importedBy], depth: node.depth }
      : { path: nodeId, imports: [], importedBy: [], depth: 0 };
    nodeMap.set(nodeId, nodeData);
  }
  
  // Build imports/importedBy from edges only if using RawGraphNode
  if (rawData.nodes.length > 0 && 'id' in rawData.nodes[0]) {
    for (const edge of rawData.edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (fromNode) fromNode.imports.push(edge.to);
      if (toNode) toNode.importedBy.push(edge.from);
    }
  }
  
  const nodes = Array.from(nodeMap.values());
  const rootNodes = nodes.filter(n => n.importedBy.length === 0).map(n => n.path);
  const leafNodes = nodes.filter(n => n.imports.length === 0).map(n => n.path);
  
  // Transform edges to include 'kind'
  const edges: TransformedGraphEdge[] = rawData.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: 'static' as const,
  }));
  
  return {
    nodes,
    edges,
    rootNodes,
    leafNodes,
  };
}
