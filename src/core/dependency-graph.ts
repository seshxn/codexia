import * as path from 'node:path';
import type { DependencyNode, DependencyEdge } from './types.js';
import { getLanguageRegistry, type LanguageProviderRegistry } from './language-providers/index.js';

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private edges: DependencyEdge[] = [];
  private languageRegistry: LanguageProviderRegistry;
  private existingFiles: Set<string> = new Set();

  constructor(_repoRoot: string) {
    this.languageRegistry = getLanguageRegistry();
  }

  /**
   * Build dependency graph from file imports
   */
  buildFromImports(files: Map<string, { imports: Array<{ source: string }> }>): void {
    // Track all existing files for import resolution
    this.existingFiles = new Set(files.keys());

    // Initialize nodes
    for (const [filePath] of files) {
      this.nodes.set(filePath, {
        path: filePath,
        imports: [],
        importedBy: [],
        depth: 0,
      });
    }

    // Build edges
    for (const [filePath, fileInfo] of files) {
      const node = this.nodes.get(filePath)!;
      const provider = this.languageRegistry.getForFile(filePath);

      for (const imp of fileInfo.imports) {
        // Try to resolve using language provider, fallback to legacy method
        let resolvedPath: string | null = null;
        
        if (provider) {
          resolvedPath = provider.resolveImportPath(filePath, imp.source, this.existingFiles);
        }
        
        if (!resolvedPath) {
          resolvedPath = this.resolveImportLegacy(filePath, imp.source);
        }

        if (resolvedPath && this.nodes.has(resolvedPath)) {
          node.imports.push(resolvedPath);
          
          const targetNode = this.nodes.get(resolvedPath)!;
          targetNode.importedBy.push(filePath);

          this.edges.push({
            from: filePath,
            to: resolvedPath,
            kind: 'static',
          });
        }
      }
    }

    // Calculate depths
    this.calculateDepths();
  }

  /**
   * Get all modules that depend on a given module
   */
  getDependents(filePath: string): string[] {
    const node = this.nodes.get(filePath);
    return node ? node.importedBy : [];
  }

  /**
   * Get all modules that a given module depends on
   */
  getDependencies(filePath: string): string[] {
    const node = this.nodes.get(filePath);
    return node ? node.imports : [];
  }

  /**
   * Get transitive dependents (all modules affected by changes to a module)
   */
  getTransitiveDependents(filePath: string, maxDepth: number = 10): string[] {
    const result: Set<string> = new Set();
    const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.depth >= maxDepth) continue;

      const dependents = this.getDependents(current.path);
      for (const dep of dependents) {
        if (!result.has(dep)) {
          result.add(dep);
          queue.push({ path: dep, depth: current.depth + 1 });
        }
      }
    }

    return Array.from(result);
  }

  /**
   * Detect circular dependencies
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);

      const deps = this.getDependencies(node);
      for (const dep of deps) {
        if (!visited.has(dep)) {
          dfs(dep, [...path, node]);
        } else if (recursionStack.has(dep)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep);
          if (cycleStart !== -1) {
            cycles.push([...path.slice(cycleStart), node, dep]);
          } else {
            cycles.push([...path, node, dep]);
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const [nodePath] of this.nodes) {
      if (!visited.has(nodePath)) {
        dfs(nodePath, []);
      }
    }

    return cycles;
  }

  /**
   * Get the dependency graph as a serializable object
   */
  toObject(): { nodes: DependencyNode[]; edges: DependencyEdge[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
    };
  }

  /**
   * Get the count of files that import a given file (module-level import count).
   * 
   * Note: This currently counts module-level imports, not symbol-specific imports.
   * The symbolName parameter is reserved for future use when symbol-level tracking is implemented.
   *
   * @param _symbolName - Reserved for future use when symbol-level imports are tracked.
   * @param filePath - The path of the file whose import count is requested.
   */
  getImportCount(_symbolName: string, filePath: string): number {
    const node = this.nodes.get(filePath);
    if (!node) return 0;
    
    // For now, we count files that import the module.
    // A more sophisticated implementation would track specific symbol imports.
    return node.importedBy.length;
  }

  private resolveImportLegacy(fromPath: string, importSource: string): string | null {
    // Skip external modules
    if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
      return null;
    }

    const fromDir = path.dirname(fromPath);
    let resolved = path.join(fromDir, importSource).replace(/\\/g, '/');

    // Try common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js', '.py', '.rb', '.java', '.go', '.rs'];
    
    // Remove .js extension if present (common in ESM)
    if (resolved.endsWith('.js')) {
      resolved = resolved.slice(0, -3);
    }

    for (const ext of extensions) {
      const withExt = resolved + ext;
      if (this.nodes.has(withExt) || this.existingFiles.has(withExt)) {
        return withExt;
      }
    }

    // Check if it's already a valid path
    if (this.nodes.has(resolved) || this.existingFiles.has(resolved)) {
      return resolved;
    }

    return null;
  }

  private calculateDepths(): void {
    // Find entry points (files with no dependents)
    const entryPoints = Array.from(this.nodes.entries())
      .filter(([_, node]) => node.importedBy.length === 0)
      .map(([path]) => path);

    // BFS from entry points
    const queue: Array<{ path: string; depth: number }> = 
      entryPoints.map(p => ({ path: p, depth: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current.path)) continue;
      visited.add(current.path);

      const node = this.nodes.get(current.path)!;
      node.depth = current.depth;

      for (const dep of node.imports) {
        if (!visited.has(dep)) {
          queue.push({ path: dep, depth: current.depth + 1 });
        }
      }
    }
  }

  /**
   * Get all nodes in the dependency graph
   */
  getNodes(): Map<string, DependencyNode> {
    return this.nodes;
  }
}
