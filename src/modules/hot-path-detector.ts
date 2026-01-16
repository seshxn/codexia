import * as path from 'node:path';
import type { FileInfo, DependencyNode, Symbol } from '../core/types.js';

// ============================================================================
// Hot Path Types
// ============================================================================

export interface HotPath {
  id: string;
  name: string;
  description: string;
  nodes: HotPathNode[];
  criticality: 'critical' | 'high' | 'medium';
  category: HotPathCategory;
}

export interface HotPathNode {
  path: string;
  symbol?: string;
  role: 'entry' | 'handler' | 'service' | 'data' | 'external';
  order: number;
}

export type HotPathCategory = 
  | 'api-endpoint'
  | 'data-pipeline'
  | 'authentication'
  | 'payment'
  | 'user-flow'
  | 'core-business'
  | 'custom';

export interface HotPathAnalysis {
  paths: HotPath[];
  affectedPaths: HotPath[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: HotPathSummary;
}

export interface HotPathSummary {
  totalPaths: number;
  criticalPaths: number;
  affectedCritical: number;
  coverage: number;  // % of codebase covered by hot paths
}

export interface PathDetectionConfig {
  entryPatterns: string[];
  exitPatterns: string[];
  criticalPatterns: string[];
  maxDepth: number;
}

// ============================================================================
// Hot Path Detector
// ============================================================================

export class HotPathDetector {
  private paths: HotPath[] = [];
  private config: PathDetectionConfig;

  constructor(_repoRoot: string, config?: Partial<PathDetectionConfig>) {
    this.config = {
      entryPatterns: [
        '**/routes/**',
        '**/controllers/**',
        '**/api/**',
        '**/handlers/**',
        '**/pages/api/**',  // Next.js
        '**/app/**/route.ts', // Next.js App Router
      ],
      exitPatterns: [
        '**/db/**',
        '**/database/**',
        '**/repositories/**',
        '**/external/**',
        '**/clients/**',
      ],
      criticalPatterns: [
        '**/auth/**',
        '**/payment/**',
        '**/security/**',
        '**/billing/**',
      ],
      maxDepth: 10,
      ...config,
    };
  }

  /**
   * Detect hot paths automatically from codebase structure
   */
  detectPaths(
    files: Map<string, FileInfo>,
    dependencies: Map<string, DependencyNode>
  ): HotPath[] {
    const detectedPaths: HotPath[] = [];

    // Find entry points
    const entryPoints = this.findEntryPoints(files);
    
    // For each entry point, trace the path to data/external layers
    for (const entry of entryPoints) {
      const traced = this.tracePath(entry, dependencies, files);
      if (traced.length > 1) {
        const isCritical = this.isCriticalPath(traced);
        
        detectedPaths.push({
          id: `auto-${detectedPaths.length + 1}`,
          name: this.generatePathName(entry, traced),
          description: `Auto-detected path from ${entry}`,
          nodes: traced.map((node, index) => ({
            path: node,
            role: this.determineRole(node, index, traced.length),
            order: index,
          })),
          criticality: isCritical ? 'critical' : 'medium',
          category: this.categorize(traced),
        });
      }
    }

    this.paths = detectedPaths;
    return detectedPaths;
  }

  /**
   * Load hot paths from architecture memory
   */
  loadFromArchitecture(criticalPaths: string[], entryPoints: string[]): void {
    // Convert simple path definitions to HotPath objects
    for (let i = 0; i < criticalPaths.length; i++) {
      const pathDef = criticalPaths[i];
      const parts = pathDef.split('->').map(p => p.trim());
      
      this.paths.push({
        id: `arch-${i + 1}`,
        name: `Critical Path ${i + 1}`,
        description: pathDef,
        nodes: parts.map((part, index) => ({
          path: part,
          role: index === 0 ? 'entry' : index === parts.length - 1 ? 'external' : 'handler',
          order: index,
        })),
        criticality: 'critical',
        category: 'core-business',
      });
    }

    // Add entry points as the start of potential paths
    for (const entry of entryPoints) {
      if (!this.paths.some(p => p.nodes[0]?.path === entry)) {
        this.paths.push({
          id: `entry-${entry}`,
          name: `Entry: ${path.basename(entry)}`,
          description: `Entry point at ${entry}`,
          nodes: [{ path: entry, role: 'entry', order: 0 }],
          criticality: 'high',
          category: 'api-endpoint',
        });
      }
    }
  }

  /**
   * Add a custom hot path definition
   */
  addPath(hotPath: HotPath): void {
    this.paths.push(hotPath);
  }

  /**
   * Analyze which hot paths are affected by changes
   */
  analyzeImpact(changedFiles: string[]): HotPathAnalysis {
    const affectedPaths: HotPath[] = [];
    const changedSet = new Set(changedFiles);

    for (const hotPath of this.paths) {
      const isAffected = hotPath.nodes.some(node => {
        // Direct match
        if (changedSet.has(node.path)) return true;
        
        // Pattern match (for glob-style paths)
        return changedFiles.some(changed => 
          this.matchesPattern(changed, node.path)
        );
      });

      if (isAffected) {
        affectedPaths.push(hotPath);
      }
    }

    // Calculate risk level
    const affectedCritical = affectedPaths.filter(p => p.criticality === 'critical').length;
    const affectedHigh = affectedPaths.filter(p => p.criticality === 'high').length;
    
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (affectedCritical > 0) riskLevel = 'critical';
    else if (affectedHigh > 1) riskLevel = 'high';
    else if (affectedPaths.length > 0) riskLevel = 'medium';

    return {
      paths: this.paths,
      affectedPaths,
      riskLevel,
      summary: {
        totalPaths: this.paths.length,
        criticalPaths: this.paths.filter(p => p.criticality === 'critical').length,
        affectedCritical,
        coverage: this.calculateCoverage(changedFiles),
      },
    };
  }

  /**
   * Get all registered hot paths
   */
  getPaths(): HotPath[] {
    return [...this.paths];
  }

  /**
   * Find symbols on hot paths
   */
  getHotSymbols(files: Map<string, FileInfo>): Symbol[] {
    const hotSymbols: Symbol[] = [];
    const hotFiles = new Set(this.paths.flatMap(p => p.nodes.map(n => n.path)));

    for (const [filePath, fileInfo] of files) {
      if (hotFiles.has(filePath) || 
          [...hotFiles].some(h => this.matchesPattern(filePath, h))) {
        hotSymbols.push(...fileInfo.symbols.filter(s => s.exported));
      }
    }

    return hotSymbols;
  }

  /**
   * Find entry points in the codebase
   */
  private findEntryPoints(files: Map<string, FileInfo>): string[] {
    const entries: string[] = [];

    for (const [filePath, fileInfo] of files) {
      // Check if file matches entry patterns
      const isEntry = this.config.entryPatterns.some(pattern => 
        this.matchesPattern(filePath, pattern)
      );

      if (isEntry) {
        entries.push(filePath);
        continue;
      }

      // Check for HTTP handler exports
      const hasHttpHandlers = fileInfo.exports.some(exp => 
        /^(get|post|put|patch|delete|handler|action)$/i.test(exp.name) ||
        /Handler$|Controller$|Route$/.test(exp.name)
      );

      if (hasHttpHandlers) {
        entries.push(filePath);
      }
    }

    return entries;
  }

  /**
   * Trace a path from entry point to data layer
   */
  private tracePath(
    entryPoint: string,
    dependencies: Map<string, DependencyNode>,
    files: Map<string, FileInfo>,
    visited: Set<string> = new Set(),
    depth: number = 0
  ): string[] {
    if (depth > this.config.maxDepth) return [entryPoint];
    if (visited.has(entryPoint)) return [entryPoint];
    
    visited.add(entryPoint);
    
    const node = dependencies.get(entryPoint);
    if (!node) return [entryPoint];

    // Check if we've reached an exit point (data/external layer)
    const isExit = this.config.exitPatterns.some(pattern =>
      this.matchesPattern(entryPoint, pattern)
    );

    if (isExit) return [entryPoint];

    // Follow dependencies
    for (const dep of node.imports) {
      const subPath = this.tracePath(dep, dependencies, files, visited, depth + 1);
      if (subPath.length > 1 || this.isExitPoint(subPath[0])) {
        return [entryPoint, ...subPath];
      }
    }

    return [entryPoint];
  }

  /**
   * Check if file matches exit patterns
   */
  private isExitPoint(filePath: string): boolean {
    return this.config.exitPatterns.some(pattern =>
      this.matchesPattern(filePath, pattern)
    );
  }

  /**
   * Check if path contains critical files
   */
  private isCriticalPath(pathNodes: string[]): boolean {
    return pathNodes.some(node =>
      this.config.criticalPatterns.some(pattern =>
        this.matchesPattern(node, pattern)
      )
    );
  }

  /**
   * Determine the role of a node in a path
   */
  private determineRole(
    filePath: string,
    index: number,
    totalLength: number
  ): HotPathNode['role'] {
    if (index === 0) return 'entry';
    if (index === totalLength - 1) {
      if (this.isExitPoint(filePath)) return 'external';
      return 'data';
    }
    
    if (filePath.includes('service')) return 'service';
    return 'handler';
  }

  /**
   * Generate a name for an auto-detected path
   */
  private generatePathName(entry: string, nodes: string[]): string {
    const entryName = path.basename(entry, path.extname(entry));
    const exitName = nodes.length > 1 
      ? path.basename(nodes[nodes.length - 1], path.extname(nodes[nodes.length - 1]))
      : 'unknown';
    
    return `${entryName} → ${exitName}`;
  }

  /**
   * Categorize a path based on its nodes
   */
  private categorize(nodes: string[]): HotPathCategory {
    const pathStr = nodes.join(' ').toLowerCase();
    
    if (pathStr.includes('auth') || pathStr.includes('login') || pathStr.includes('session')) {
      return 'authentication';
    }
    if (pathStr.includes('payment') || pathStr.includes('billing') || pathStr.includes('stripe')) {
      return 'payment';
    }
    if (pathStr.includes('api') || pathStr.includes('route') || pathStr.includes('endpoint')) {
      return 'api-endpoint';
    }
    if (pathStr.includes('pipeline') || pathStr.includes('job') || pathStr.includes('queue')) {
      return 'data-pipeline';
    }
    
    return 'core-business';
  }

  /**
   * Calculate coverage of hot paths
   */
  private calculateCoverage(allFiles: string[]): number {
    const hotFiles = new Set(this.paths.flatMap(p => p.nodes.map(n => n.path)));
    const covered = allFiles.filter(f => 
      hotFiles.has(f) || [...hotFiles].some(h => this.matchesPattern(f, h))
    );
    
    return allFiles.length > 0 
      ? Math.round((covered.length / allFiles.length) * 100) 
      : 0;
  }

  /**
   * Pattern matching helper
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Direct match
    if (filePath === pattern) return true;
    
    // Glob pattern
    const regex = pattern
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLESTAR}}/g, '.*')
      .replace(/\//g, '\\/');
    
    return new RegExp(regex).test(filePath);
  }

  /**
   * Format hot paths for display
   */
  formatPaths(format: 'ascii' | 'json' = 'ascii'): string {
    if (format === 'json') {
      return JSON.stringify(this.paths, null, 2);
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════╗');
    lines.push('║                      HOT PATHS                             ║');
    lines.push('╚════════════════════════════════════════════════════════════╝');
    lines.push('');

    for (const hotPath of this.paths) {
      const icon = hotPath.criticality === 'critical' ? '🔥' :
                   hotPath.criticality === 'high' ? '⚠️' : '📍';
      
      lines.push(`${icon} ${hotPath.name} [${hotPath.criticality.toUpperCase()}]`);
      lines.push(`   ${hotPath.description}`);
      lines.push('');
      
      for (let i = 0; i < hotPath.nodes.length; i++) {
        const node = hotPath.nodes[i];
        const connector = i === hotPath.nodes.length - 1 ? '└──' : '├──';
        const roleIcon = this.getRoleIcon(node.role);
        lines.push(`   ${connector} ${roleIcon} ${node.path}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private getRoleIcon(role: HotPathNode['role']): string {
    switch (role) {
      case 'entry': return '🚪';
      case 'handler': return '⚙️';
      case 'service': return '🔧';
      case 'data': return '💾';
      case 'external': return '🌐';
      default: return '•';
    }
  }
}
