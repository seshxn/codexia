/**
 * Utility functions for graph data transformations
 */

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
 * @param rawData - Raw graph data from engine with nodes and edges
 * @returns Transformed graph data with imports, importedBy, root and leaf nodes
 */
export function transformGraphData(rawData: RawGraphData): TransformedGraphData {
  const nodeMap = new Map<string, TransformedGraphNode>();
  
  // Initialize all nodes
  for (const node of rawData.nodes) {
    nodeMap.set(node.id, { path: node.id, imports: [], importedBy: [], depth: 0 });
  }
  
  // Build imports/importedBy from edges
  for (const edge of rawData.edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (fromNode) fromNode.imports.push(edge.to);
    if (toNode) toNode.importedBy.push(edge.from);
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
