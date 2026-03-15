import type { DependencyNode, DependencyEdge } from '../core/types.js';

export type VisualizationFormat = 'ascii' | 'mermaid' | 'dot' | 'json' | 'html';

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
      case 'html':
        return this.toHtml(data, options);
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
   * Generate self-contained interactive HTML visualization
   */
  private toHtml(data: GraphData, options: VisualizationOptions): string {
    const maxNodes = options.maxNodes ?? 150;
    const highlighted = new Set(options.highlight ?? []);
    const nodes = data.nodes.slice(0, maxNodes).map((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(data.nodes.length, 1);
      const radius = 220 + (index % 7) * 18;
      return {
        id: node.path,
        label: this.shortenPath(node.path, 48),
        path: node.path,
        imports: node.imports.length,
        importedBy: node.importedBy.length,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        highlighted: highlighted.has(node.path),
        kind: node.importedBy.length === 0 ? 'entry' : (node.imports.length === 0 ? 'leaf' : 'module'),
      };
    });
    const nodeSet = new Set(nodes.map((node) => node.id));
    const edges = data.edges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to));
    const payload = JSON.stringify({ nodes, edges });

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Codexia Graph</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f4ea;
      --panel: rgba(255, 252, 245, 0.92);
      --line: #c5b9a1;
      --text: #1f2a2a;
      --muted: #6a726f;
      --entry: #0f766e;
      --leaf: #c2410c;
      --module: #1d4ed8;
      --highlight: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
      background:
        radial-gradient(circle at top, rgba(251, 191, 36, 0.18), transparent 32%),
        radial-gradient(circle at 80% 20%, rgba(14, 116, 144, 0.14), transparent 26%),
        linear-gradient(180deg, #fffdf8 0%, var(--bg) 100%);
      color: var(--text);
      min-height: 100vh;
      display: grid;
      grid-template-columns: 320px 1fr;
    }
    aside {
      border-right: 1px solid rgba(31, 42, 42, 0.08);
      background: var(--panel);
      backdrop-filter: blur(18px);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    h1 {
      margin: 0;
      font-size: 1.35rem;
      letter-spacing: -0.02em;
    }
    p { margin: 0; color: var(--muted); line-height: 1.45; }
    .control-group { display: grid; gap: 8px; }
    input[type="search"] {
      width: 100%;
      border: 1px solid rgba(31, 42, 42, 0.14);
      background: rgba(255,255,255,0.86);
      border-radius: 12px;
      padding: 12px 14px;
      font: inherit;
    }
    label.toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.95rem;
    }
    .legend {
      display: grid;
      gap: 10px;
      font-size: 0.92rem;
    }
    .swatch {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      margin-right: 8px;
    }
    .details {
      margin-top: auto;
      border: 1px solid rgba(31, 42, 42, 0.08);
      border-radius: 16px;
      background: rgba(255,255,255,0.82);
      padding: 14px;
      min-height: 140px;
    }
    main { position: relative; overflow: hidden; }
    svg { width: 100%; height: 100vh; display: block; }
    .edge { stroke: rgba(31, 42, 42, 0.14); stroke-width: 1.25; }
    .edge.type-only { stroke-dasharray: 5 4; }
    .edge.hidden, .node.hidden, .label.hidden { display: none; }
    .node { cursor: pointer; transition: transform 120ms ease; }
    .node circle { stroke: rgba(255,255,255,0.95); stroke-width: 2.5; }
    .node text {
      font-size: 11px;
      fill: var(--text);
      paint-order: stroke;
      stroke: rgba(255,255,255,0.9);
      stroke-width: 4px;
      stroke-linejoin: round;
    }
    .node.selected circle { stroke: var(--highlight); stroke-width: 4; }
    .node.dimmed { opacity: 0.2; }
    .edge.dimmed { opacity: 0.08; }
    .badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 8px;
      background: rgba(31, 42, 42, 0.08);
      font-size: 0.82rem;
      margin-right: 6px;
    }
  </style>
</head>
<body>
  <aside>
    <div class="control-group">
      <h1>Codexia Graph</h1>
      <p>Interactive dependency graph with local search, node inspection, and edge filtering.</p>
    </div>
    <div class="control-group">
      <input id="search" type="search" placeholder="Filter files..." />
      <label class="toggle"><input id="toggle-static" type="checkbox" checked /> Static edges</label>
      <label class="toggle"><input id="toggle-dynamic" type="checkbox" checked /> Dynamic edges</label>
      <label class="toggle"><input id="toggle-type-only" type="checkbox" checked /> Type-only edges</label>
    </div>
    <div class="legend">
      <div><span class="swatch" style="background: var(--entry)"></span>Entry modules</div>
      <div><span class="swatch" style="background: var(--module)"></span>Internal modules</div>
      <div><span class="swatch" style="background: var(--leaf)"></span>Leaf modules</div>
      <div><span class="swatch" style="background: var(--highlight)"></span>Highlighted focus</div>
    </div>
    <div class="details" id="details">
      <strong>Select a node</strong>
      <p>Click a file node to inspect import fan-out and inbound dependency count.</p>
    </div>
  </aside>
  <main>
    <svg viewBox="-520 -420 1040 840" role="img" aria-label="Interactive dependency graph"></svg>
  </main>
  <script>
    const data = ${payload};
    const svg = document.querySelector('svg');
    const details = document.getElementById('details');
    const search = document.getElementById('search');
    const toggles = {
      static: document.getElementById('toggle-static'),
      dynamic: document.getElementById('toggle-dynamic'),
      'type-only': document.getElementById('toggle-type-only'),
    };

    const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.append(edgeGroup, nodeGroup);

    const nodeIndex = new Map(data.nodes.map((node) => [node.id, node]));
    const edgeElements = [];
    const nodeElements = [];

    for (const edge of data.edges) {
      const source = nodeIndex.get(edge.from);
      const target = nodeIndex.get(edge.to);
      if (!source || !target) continue;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', source.x);
      line.setAttribute('y1', source.y);
      line.setAttribute('x2', target.x);
      line.setAttribute('y2', target.y);
      line.setAttribute('class', 'edge ' + edge.kind);
      line.dataset.kind = edge.kind;
      line.dataset.from = edge.from;
      line.dataset.to = edge.to;
      edgeGroup.appendChild(line);
      edgeElements.push(line);
    }

    for (const node of data.nodes) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'node');
      group.dataset.path = node.path;
      group.dataset.kind = node.kind;
      group.setAttribute('transform', 'translate(' + node.x + ' ' + node.y + ')');

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', node.highlighted ? '11' : '8');
      circle.setAttribute('fill', node.highlighted ? 'var(--highlight)' : (node.kind === 'entry' ? 'var(--entry)' : (node.kind === 'leaf' ? 'var(--leaf)' : 'var(--module)')));

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', '12');
      label.setAttribute('y', '4');
      label.textContent = node.label;

      group.append(circle, label);
      group.addEventListener('click', () => selectNode(node.id));
      nodeGroup.appendChild(group);
      nodeElements.push(group);
    }

    function updateVisibility() {
      const term = search.value.trim().toLowerCase();
      const enabledKinds = new Set(Object.entries(toggles).filter(([, input]) => input.checked).map(([kind]) => kind));
      const visibleNodes = new Set();

      for (const element of nodeElements) {
        const matches = term.length === 0 || element.dataset.path.toLowerCase().includes(term);
        element.classList.toggle('hidden', !matches);
        if (matches) visibleNodes.add(element.dataset.path);
      }

      for (const edge of edgeElements) {
        const visible = enabledKinds.has(edge.dataset.kind) && visibleNodes.has(edge.dataset.from) && visibleNodes.has(edge.dataset.to);
        edge.classList.toggle('hidden', !visible);
      }
    }

    function selectNode(nodeId) {
      for (const element of nodeElements) {
        const active = element.dataset.path === nodeId;
        element.classList.toggle('selected', active);
        element.classList.toggle('dimmed', !active);
      }
      for (const edge of edgeElements) {
        const active = edge.dataset.from === nodeId || edge.dataset.to === nodeId;
        edge.classList.toggle('dimmed', !active);
      }

      const node = nodeIndex.get(nodeId);
      details.innerHTML = [
        '<strong>' + node.path + '</strong>',
        '<p><span class="badge">imports ' + node.imports + '</span><span class="badge">imported by ' + node.importedBy + '</span></p>',
        '<p>' + (node.kind === 'entry' ? 'Entry module with no inbound dependencies.' : (node.kind === 'leaf' ? 'Leaf module with no further imports.' : 'Intermediate module participating in the dependency graph.')) + '</p>',
      ].join('');
    }

    search.addEventListener('input', updateVisibility);
    Object.values(toggles).forEach((input) => input.addEventListener('change', updateVisibility));
    updateVisibility();
  </script>
</body>
</html>`;
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
