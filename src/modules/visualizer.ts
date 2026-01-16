import type { DependencyNode, DependencyEdge } from '../core/types.js';

export type VisualizationFormat = 'ascii' | 'mermaid' | 'dot' | 'json';

export interface VisualizationOptions {
  format: VisualizationFormat;
  depth?: number;
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  showOrphans?: boolean;
  highlight?: string[];
  maxNodes?: number;
}

export interface GraphData {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  rootNodes: string[];
  leafNodes: string[];
}

export class Visualizer {
  /**
   * Generate visualization from dependency graph data
   */
  visualize(
    data: GraphData,
    options: VisualizationOptions = { format: 'ascii' }
  ): string {
    switch (options.format) {
      case 'ascii':
        return this.toAscii(data, options);
      case 'mermaid':
        return this.toMermaid(data, options);
      case 'dot':
        return this.toDot(data, options);
      case 'json':
        return JSON.stringify(data, null, 2);
      default:
        return this.toAscii(data, options);
    }
  }

  /**
   * Generate ASCII tree visualization
   */
  private toAscii(data: GraphData, options: VisualizationOptions): string {
    const lines: string[] = [];
    const visited = new Set<string>();
    const maxDepth = options.depth ?? 5;
    const highlighted = new Set(options.highlight ?? []);

    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                    DEPENDENCY GRAPH                        ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');

    // Build adjacency map for quick lookup
    const adjacency = new Map<string, string[]>();
    for (const edge of data.edges) {
      const existing = adjacency.get(edge.from) || [];
      existing.push(edge.to);
      adjacency.set(edge.from, existing);
    }

    // Start from root nodes (entry points)
    const roots = data.rootNodes.length > 0 
      ? data.rootNodes 
      : data.nodes.filter(n => n.importedBy.length === 0).map(n => n.path);

    for (const root of roots.slice(0, options.maxNodes ?? 20)) {
      this.buildAsciiTree(root, adjacency, visited, lines, '', true, maxDepth, 0, highlighted);
    }

    // Show orphan nodes if requested
    if (options.showOrphans) {
      const orphans = data.nodes.filter(n => 
        n.imports.length === 0 && n.importedBy.length === 0
      );
      if (orphans.length > 0) {
        lines.push('');
        lines.push('┌─ Orphan Modules ─────────────────────────────────────────┐');
        for (const orphan of orphans.slice(0, 10)) {
          lines.push(`│  ○ ${this.shortenPath(orphan.path)}`);
        }
        if (orphans.length > 10) {
          lines.push(`│  ... and ${orphans.length - 10} more`);
        }
        lines.push('└──────────────────────────────────────────────────────────┘');
      }
    }

    // Legend
    lines.push('');
    lines.push('Legend: ● root  ├── imports  ○ leaf  ★ highlighted');
    lines.push('');

    return lines.join('\n');
  }

  private buildAsciiTree(
    node: string,
    adjacency: Map<string, string[]>,
    visited: Set<string>,
    lines: string[],
    prefix: string,
    isLast: boolean,
    maxDepth: number,
    currentDepth: number,
    highlighted: Set<string>
  ): void {
    if (currentDepth > maxDepth) {
      lines.push(`${prefix}${isLast ? '└' : '├'}── ...`);
      return;
    }

    const connector = isLast ? '└── ' : '├── ';
    const icon = highlighted.has(node) ? '★ ' : (currentDepth === 0 ? '● ' : '');
    const shortPath = this.shortenPath(node);

    if (visited.has(node)) {
      lines.push(`${prefix}${connector}${icon}${shortPath} (circular)`);
      return;
    }

    visited.add(node);
    lines.push(`${prefix}${connector}${icon}${shortPath}`);

    const children = adjacency.get(node) || [];
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    for (let i = 0; i < children.length; i++) {
      this.buildAsciiTree(
        children[i],
        adjacency,
        visited,
        lines,
        childPrefix,
        i === children.length - 1,
        maxDepth,
        currentDepth + 1,
        highlighted
      );
    }
  }

  /**
   * Generate Mermaid diagram
   */
  private toMermaid(data: GraphData, options: VisualizationOptions): string {
    const direction = options.direction ?? 'TB';
    const highlighted = new Set(options.highlight ?? []);
    const lines: string[] = [];

    lines.push(`flowchart ${direction}`);
    lines.push('');

    // Define node styles
    lines.push('  %% Node definitions');
    const nodeIds = new Map<string, string>();
    let nodeCounter = 0;

    for (const node of data.nodes.slice(0, options.maxNodes ?? 50)) {
      const id = `N${nodeCounter++}`;
      nodeIds.set(node.path, id);
      const label = this.shortenPath(node.path);
      
      if (highlighted.has(node.path)) {
        lines.push(`  ${id}[["${label}"]]`);
      } else if (node.importedBy.length === 0) {
        lines.push(`  ${id}(("${label}"))`);
      } else if (node.imports.length === 0) {
        lines.push(`  ${id}["${label}"]`);
      } else {
        lines.push(`  ${id}("${label}")`);
      }
    }

    lines.push('');
    lines.push('  %% Edges');

    // Add edges
    for (const edge of data.edges) {
      const fromId = nodeIds.get(edge.from);
      const toId = nodeIds.get(edge.to);
      if (fromId && toId) {
        const style = edge.kind === 'type-only' ? '-.->' : '-->';
        lines.push(`  ${fromId} ${style} ${toId}`);
      }
    }

    lines.push('');
    lines.push('  %% Styles');
    lines.push('  classDef highlighted fill:#f9f,stroke:#333,stroke-width:4px');
    lines.push('  classDef entry fill:#9f9,stroke:#333,stroke-width:2px');
    lines.push('  classDef leaf fill:#99f,stroke:#333,stroke-width:1px');

    // Apply styles to highlighted nodes
    const highlightedIds = [...highlighted]
      .map(h => nodeIds.get(h))
      .filter(Boolean);
    if (highlightedIds.length > 0) {
      lines.push(`  class ${highlightedIds.join(',')} highlighted`);
    }

    return lines.join('\n');
  }

  /**
   * Generate DOT (Graphviz) format
   */
  private toDot(data: GraphData, options: VisualizationOptions): string {
    const direction = options.direction === 'LR' ? 'LR' : 'TB';
    const highlighted = new Set(options.highlight ?? []);
    const lines: string[] = [];

    lines.push('digraph DependencyGraph {');
    lines.push(`  rankdir=${direction};`);
    lines.push('  node [shape=box, style=rounded];');
    lines.push('  edge [color=gray];');
    lines.push('');

    // Node definitions with styles
    const nodeIds = new Map<string, string>();
    let nodeCounter = 0;

    for (const node of data.nodes.slice(0, options.maxNodes ?? 100)) {
      const id = `n${nodeCounter++}`;
      nodeIds.set(node.path, id);
      const label = this.shortenPath(node.path);

      let style = '';
      if (highlighted.has(node.path)) {
        style = ', style="filled,rounded", fillcolor="#ffccff", penwidth=3';
      } else if (node.importedBy.length === 0) {
        style = ', style="filled,rounded", fillcolor="#ccffcc"';
      } else if (node.imports.length === 0) {
        style = ', style="filled,rounded", fillcolor="#ccccff"';
      }

      lines.push(`  ${id} [label="${label}"${style}];`);
    }

    lines.push('');

    // Edges
    for (const edge of data.edges) {
      const fromId = nodeIds.get(edge.from);
      const toId = nodeIds.get(edge.to);
      if (fromId && toId) {
        const style = edge.kind === 'type-only' ? ', style=dashed' : '';
        lines.push(`  ${fromId} -> ${toId}${style};`);
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generate impact blast radius visualization
   */
  visualizeImpact(
    changedFiles: string[],
    affectedModules: Array<{ path: string; distance: number }>,
    format: VisualizationFormat = 'ascii'
  ): string {
    if (format === 'ascii') {
      return this.impactToAscii(changedFiles, affectedModules);
    } else if (format === 'mermaid') {
      return this.impactToMermaid(changedFiles, affectedModules);
    }
    return this.impactToAscii(changedFiles, affectedModules);
  }

  private impactToAscii(
    changedFiles: string[],
    affectedModules: Array<{ path: string; distance: number }>
  ): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                    IMPACT BLAST RADIUS                     ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');

    // Group by distance
    const byDistance = new Map<number, string[]>();
    for (const mod of affectedModules) {
      const existing = byDistance.get(mod.distance) || [];
      existing.push(mod.path);
      byDistance.set(mod.distance, existing);
    }

    // Changed files (center of blast)
    lines.push('  ╭─────────────────────────────────────────────────────────╮');
    lines.push('  │  💥 CHANGED (Ground Zero)                              │');
    for (const file of changedFiles) {
      lines.push(`  │     ★ ${this.shortenPath(file).padEnd(47)}│`);
    }
    lines.push('  ╰─────────────────────────────────────────────────────────╯');

    // Affected modules by distance (ripple effect)
    const maxDistance = Math.max(...Array.from(byDistance.keys()), 0);
    for (let d = 1; d <= Math.min(maxDistance, 5); d++) {
      const modules = byDistance.get(d) || [];
      if (modules.length === 0) continue;

      const ripple = '~'.repeat(d);
      lines.push(`      ${ripple}╭${'─'.repeat(53 - d)}╮`);
      lines.push(`      ${ripple}│  📡 DISTANCE ${d} (${modules.length} affected)${' '.repeat(30 - String(modules.length).length)}│`);
      
      for (const mod of modules.slice(0, 5)) {
        lines.push(`      ${ripple}│     → ${this.shortenPath(mod).padEnd(43 - d)}│`);
      }
      if (modules.length > 5) {
        lines.push(`      ${ripple}│     ... and ${modules.length - 5} more${' '.repeat(33 - String(modules.length - 5).length)}│`);
      }
      lines.push(`      ${ripple}╰${'─'.repeat(53 - d)}╯`);
    }

    lines.push('');
    lines.push(`  Total impact: ${affectedModules.length} modules affected`);
    lines.push('');

    return lines.join('\n');
  }

  private impactToMermaid(
    changedFiles: string[],
    affectedModules: Array<{ path: string; distance: number }>
  ): string {
    const lines: string[] = [];
    lines.push('flowchart LR');
    lines.push('');

    // Subgraphs by distance
    lines.push('  subgraph changed["💥 Changed"]');
    for (let i = 0; i < changedFiles.length; i++) {
      lines.push(`    C${i}["${this.shortenPath(changedFiles[i])}"]`);
    }
    lines.push('  end');
    lines.push('');

    const byDistance = new Map<number, string[]>();
    for (const mod of affectedModules) {
      const existing = byDistance.get(mod.distance) || [];
      existing.push(mod.path);
      byDistance.set(mod.distance, existing);
    }

    let nodeId = 0;
    const nodeMap = new Map<string, string>();

    for (const [distance, modules] of byDistance) {
      lines.push(`  subgraph d${distance}["Distance ${distance}"]`);
      for (const mod of modules.slice(0, 10)) {
        const id = `A${nodeId++}`;
        nodeMap.set(mod, id);
        lines.push(`    ${id}("${this.shortenPath(mod)}")`);
      }
      lines.push('  end');
      lines.push('');
    }

    // Connect changed to distance 1
    const d1Modules = byDistance.get(1) || [];
    for (let i = 0; i < changedFiles.length; i++) {
      for (const mod of d1Modules.slice(0, 5)) {
        const targetId = nodeMap.get(mod);
        if (targetId) {
          lines.push(`  C${i} --> ${targetId}`);
        }
      }
    }

    lines.push('');
    lines.push('  style changed fill:#ff6b6b,stroke:#333');

    return lines.join('\n');
  }

  /**
   * Shorten file path for display
   */
  private shortenPath(filePath: string, maxLength: number = 40): string {
    if (filePath.length <= maxLength) return filePath;
    
    const parts = filePath.split('/');
    if (parts.length <= 2) return filePath;

    // Try to keep first and last parts
    const first = parts[0];
    const last = parts[parts.length - 1];
    
    if (first.length + last.length + 5 <= maxLength) {
      return `${first}/.../${last}`;
    }
    
    return '...' + filePath.slice(-(maxLength - 3));
  }
}
