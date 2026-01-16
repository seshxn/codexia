import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import type { FileInfo } from '../core/types.js';
import { RepoIndexer } from '../core/repo-indexer.js';
import { DependencyGraph } from '../core/dependency-graph.js';

// ============================================================================
// Monorepo Types
// ============================================================================

export interface MonorepoConfig {
  type: MonorepoType;
  rootPath: string;
  packages: PackageInfo[];
  workspaceConfig?: WorkspaceConfig;
}

export type MonorepoType = 
  | 'npm-workspaces'
  | 'yarn-workspaces'
  | 'pnpm-workspaces'
  | 'lerna'
  | 'nx'
  | 'turborepo'
  | 'rush'
  | 'unknown'
  | 'single';

export interface PackageInfo {
  name: string;
  path: string;
  relativePath: string;
  version?: string;
  private?: boolean;
  dependencies: string[];
  devDependencies: string[];
  peerDependencies: string[];
  localDependencies: string[];  // Dependencies that are other packages in the monorepo
}

export interface WorkspaceConfig {
  packages: string[];
  nohoist?: string[];
}

export interface CrossPackageEdge {
  from: string;      // Package name
  to: string;        // Package name
  type: 'dependency' | 'devDependency' | 'peerDependency' | 'import';
  files?: Array<{ from: string; to: string }>;  // Specific file-level imports
}

export interface MonorepoAnalysis {
  config: MonorepoConfig;
  crossPackageDependencies: CrossPackageEdge[];
  sharedDependencies: SharedDependency[];
  packageStats: PackageStats[];
  issues: MonorepoIssue[];
}

export interface SharedDependency {
  name: string;
  versions: Array<{ package: string; version: string }>;
  hasVersionMismatch: boolean;
}

export interface PackageStats {
  name: string;
  files: number;
  symbols: number;
  exports: number;
  localDeps: number;
  externalDeps: number;
}

export interface MonorepoIssue {
  type: 'version-mismatch' | 'circular-dep' | 'missing-peer' | 'orphan-package';
  severity: 'error' | 'warning' | 'info';
  message: string;
  packages: string[];
  suggestion?: string;
}

// ============================================================================
// Monorepo Detector
// ============================================================================

export class MonorepoDetector {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Detect if this is a monorepo and its type
   */
  async detect(): Promise<MonorepoConfig> {
    const type = await this.detectType();
    const packages = await this.discoverPackages(type);
    const workspaceConfig = await this.loadWorkspaceConfig(type);

    return {
      type,
      rootPath: this.repoRoot,
      packages,
      workspaceConfig,
    };
  }

  /**
   * Detect monorepo type
   */
  private async detectType(): Promise<MonorepoType> {
    // Check for various monorepo configurations
    const checks: Array<{ file: string; type: MonorepoType }> = [
      { file: 'pnpm-workspace.yaml', type: 'pnpm-workspaces' },
      { file: 'lerna.json', type: 'lerna' },
      { file: 'nx.json', type: 'nx' },
      { file: 'turbo.json', type: 'turborepo' },
      { file: 'rush.json', type: 'rush' },
    ];

    for (const { file, type } of checks) {
      try {
        await fs.access(path.join(this.repoRoot, file));
        return type;
      } catch {
        // File doesn't exist, continue
      }
    }

    // Check package.json for workspaces
    try {
      const pkgJson = await this.readPackageJson(this.repoRoot);
      if (pkgJson.workspaces) {
        // Check for yarn.lock vs package-lock.json
        try {
          await fs.access(path.join(this.repoRoot, 'yarn.lock'));
          return 'yarn-workspaces';
        } catch {
          return 'npm-workspaces';
        }
      }
    } catch {
      // No package.json
    }

    // Check for packages directory
    try {
      await fs.access(path.join(this.repoRoot, 'packages'));
      return 'unknown';
    } catch {
      return 'single';
    }
  }

  /**
   * Discover packages in the monorepo
   */
  private async discoverPackages(type: MonorepoType): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];
    let packagePatterns: string[] = [];

    switch (type) {
      case 'pnpm-workspaces':
        packagePatterns = await this.getPnpmWorkspaces();
        break;
      case 'yarn-workspaces':
      case 'npm-workspaces':
        packagePatterns = await this.getNpmWorkspaces();
        break;
      case 'lerna':
        packagePatterns = await this.getLernaPackages();
        break;
      case 'nx':
        packagePatterns = ['apps/*', 'libs/*', 'packages/*'];
        break;
      case 'turborepo':
        packagePatterns = await this.getNpmWorkspaces();
        break;
      case 'unknown':
        packagePatterns = ['packages/*'];
        break;
      case 'single':
        // Single package, return root as the only package
        const rootPkg = await this.readPackageJson(this.repoRoot);
        packages.push({
          name: (rootPkg.name as string) || 'root',
          path: this.repoRoot,
          relativePath: '.',
          version: rootPkg.version as string | undefined,
          private: rootPkg.private as boolean | undefined,
          dependencies: Object.keys((rootPkg.dependencies as Record<string, string>) || {}),
          devDependencies: Object.keys((rootPkg.devDependencies as Record<string, string>) || {}),
          peerDependencies: Object.keys((rootPkg.peerDependencies as Record<string, string>) || {}),
          localDependencies: [],
        });
        return packages;
    }

    // Find all package directories
    for (const pattern of packagePatterns) {
      const matches = await glob(pattern, {
        cwd: this.repoRoot,
        absolute: false,
      });

      for (const match of matches) {
        const pkgPath = path.join(this.repoRoot, match);
        try {
          const pkgJson = await this.readPackageJson(pkgPath);
          packages.push({
            name: (pkgJson.name as string) || match,
            path: pkgPath,
            relativePath: match,
            version: pkgJson.version as string | undefined,
            private: pkgJson.private as boolean | undefined,
            dependencies: Object.keys((pkgJson.dependencies as Record<string, string>) || {}),
            devDependencies: Object.keys((pkgJson.devDependencies as Record<string, string>) || {}),
            peerDependencies: Object.keys((pkgJson.peerDependencies as Record<string, string>) || {}),
            localDependencies: [],
          });
        } catch {
          // Not a valid package
        }
      }
    }

    // Identify local dependencies
    const packageNames = new Set(packages.map(p => p.name));
    for (const pkg of packages) {
      pkg.localDependencies = [
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      ].filter(dep => packageNames.has(dep));
    }

    return packages;
  }

  /**
   * Load workspace configuration
   */
  private async loadWorkspaceConfig(type: MonorepoType): Promise<WorkspaceConfig | undefined> {
    if (type === 'yarn-workspaces' || type === 'npm-workspaces') {
      const pkgJson = await this.readPackageJson(this.repoRoot);
      const workspaces = pkgJson.workspaces as string[] | { packages?: string[]; nohoist?: string[] } | undefined;
      
      if (Array.isArray(workspaces)) {
        return { packages: workspaces };
      } else if (workspaces && typeof workspaces === 'object') {
        return {
          packages: workspaces.packages || [],
          nohoist: workspaces.nohoist,
        };
      }
    }

    return undefined;
  }

  /**
   * Get pnpm workspace patterns
   */
  private async getPnpmWorkspaces(): Promise<string[]> {
    try {
      const content = await fs.readFile(
        path.join(this.repoRoot, 'pnpm-workspace.yaml'),
        'utf-8'
      );
      // Simple YAML parsing for packages array
      const match = content.match(/packages:\s*\n((?:\s+-\s*.+\n?)+)/);
      if (match) {
        return match[1]
          .split('\n')
          .map(line => line.replace(/^\s*-\s*['"]?/, '').replace(/['"]?\s*$/, ''))
          .filter(Boolean);
      }
    } catch {
      // Fall back to defaults
    }
    return ['packages/*'];
  }

  /**
   * Get npm/yarn workspace patterns
   */
  private async getNpmWorkspaces(): Promise<string[]> {
    try {
      const pkgJson = await this.readPackageJson(this.repoRoot);
      const workspaces = pkgJson.workspaces as string[] | { packages?: string[] } | undefined;
      
      if (Array.isArray(workspaces)) {
        return workspaces;
      } else if (workspaces && typeof workspaces === 'object' && 'packages' in workspaces && Array.isArray(workspaces.packages)) {
        return workspaces.packages;
      }
    } catch {
      // Fall back to defaults
    }
    return ['packages/*'];
  }

  /**
   * Get lerna package patterns
   */
  private async getLernaPackages(): Promise<string[]> {
    try {
      const content = await fs.readFile(
        path.join(this.repoRoot, 'lerna.json'),
        'utf-8'
      );
      const config = JSON.parse(content);
      return config.packages || ['packages/*'];
    } catch {
      return ['packages/*'];
    }
  }

  /**
   * Read and parse package.json
   */
  private async readPackageJson(pkgPath: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(
      path.join(pkgPath, 'package.json'),
      'utf-8'
    );
    return JSON.parse(content);
  }
}

// ============================================================================
// Monorepo Analyzer
// ============================================================================

export class MonorepoAnalyzer {
  private config: MonorepoConfig;
  private packageIndexers: Map<string, RepoIndexer> = new Map();
  private packageGraphs: Map<string, DependencyGraph> = new Map();

  constructor(config: MonorepoConfig) {
    this.config = config;
  }

  /**
   * Analyze the monorepo
   */
  async analyze(): Promise<MonorepoAnalysis> {
    // Index each package
    for (const pkg of this.config.packages) {
      const indexer = new RepoIndexer(pkg.path);
      await indexer.index();
      this.packageIndexers.set(pkg.name, indexer);

      const graph = new DependencyGraph(pkg.path);
      graph.buildFromImports(indexer.getFiles());
      this.packageGraphs.set(pkg.name, graph);
    }

    const crossPackageDependencies = this.findCrossPackageDependencies();
    const sharedDependencies = await this.findSharedDependencies();
    const packageStats = this.calculatePackageStats();
    const issues = this.findIssues(crossPackageDependencies, sharedDependencies);

    return {
      config: this.config,
      crossPackageDependencies,
      sharedDependencies,
      packageStats,
      issues,
    };
  }

  /**
   * Find cross-package dependencies
   */
  private findCrossPackageDependencies(): CrossPackageEdge[] {
    const edges: CrossPackageEdge[] = [];

    for (const pkg of this.config.packages) {
      // From package.json dependencies
      for (const dep of pkg.localDependencies) {
        edges.push({
          from: pkg.name,
          to: dep,
          type: pkg.dependencies.includes(dep) ? 'dependency' :
                pkg.devDependencies.includes(dep) ? 'devDependency' : 'peerDependency',
        });
      }
    }

    return edges;
  }

  /**
   * Find shared external dependencies
   */
  private async findSharedDependencies(): Promise<SharedDependency[]> {
    const depVersions = new Map<string, Array<{ package: string; version: string }>>();

    for (const pkg of this.config.packages) {
      // Read actual versions from package.json
      try {
        const pkgJson = await this.readPackageJson(pkg.path);
        const allDeps = {
          ...(pkgJson.dependencies as Record<string, string> || {}),
          ...(pkgJson.devDependencies as Record<string, string> || {}),
        };

        for (const dep of pkg.dependencies) {
          if (!this.config.packages.some(p => p.name === dep)) {
            const existing = depVersions.get(dep) || [];
            const version = allDeps[dep] || '*';
            existing.push({ package: pkg.name, version });
            depVersions.set(dep, existing);
          }
        }
      } catch {
        // If we can't read package.json, skip this package
      }
    }

    return Array.from(depVersions.entries())
      .filter(([, versions]) => versions.length > 1)
      .map(([name, versions]) => ({
        name,
        versions,
        hasVersionMismatch: new Set(versions.map(v => v.version)).size > 1,
      }));
  }

  /**
   * Read and parse package.json from a directory
   */
  private async readPackageJson(pkgPath: string): Promise<Record<string, unknown>> {
    const content = await fs.readFile(
      path.join(pkgPath, 'package.json'),
      'utf-8'
    );
    return JSON.parse(content);
  }

  /**
   * Calculate stats for each package
   */
  private calculatePackageStats(): PackageStats[] {
    const stats: PackageStats[] = [];

    for (const pkg of this.config.packages) {
      const indexer = this.packageIndexers.get(pkg.name);
      if (!indexer) continue;

      const files = indexer.getFiles();
      let symbols = 0;
      let exports = 0;

      for (const [, fileInfo] of files) {
        symbols += fileInfo.symbols.length;
        exports += fileInfo.exports.length;
      }

      stats.push({
        name: pkg.name,
        files: files.size,
        symbols,
        exports,
        localDeps: pkg.localDependencies.length,
        externalDeps: pkg.dependencies.length - pkg.localDependencies.length,
      });
    }

    return stats;
  }

  /**
   * Find issues in monorepo structure
   */
  private findIssues(
    crossDeps: CrossPackageEdge[],
    sharedDeps: SharedDependency[]
  ): MonorepoIssue[] {
    const issues: MonorepoIssue[] = [];

    // Check for version mismatches
    for (const dep of sharedDeps) {
      if (dep.hasVersionMismatch) {
        issues.push({
          type: 'version-mismatch',
          severity: 'warning',
          message: `Dependency '${dep.name}' has different versions across packages`,
          packages: dep.versions.map(v => v.package),
          suggestion: `Align versions or use workspace protocol`,
        });
      }
    }

    // Check for circular dependencies between packages
    const circularDeps = this.detectCircularPackageDeps(crossDeps);
    for (const cycle of circularDeps) {
      issues.push({
        type: 'circular-dep',
        severity: 'error',
        message: `Circular dependency detected: ${cycle.join(' → ')}`,
        packages: cycle,
        suggestion: `Extract shared code into a separate package`,
      });
    }

    // Check for orphan packages (no local dependents)
    const hasDependent = new Set(crossDeps.map(e => e.to));
    for (const pkg of this.config.packages) {
      if (!hasDependent.has(pkg.name) && pkg.localDependencies.length === 0 && !pkg.private) {
        issues.push({
          type: 'orphan-package',
          severity: 'info',
          message: `Package '${pkg.name}' has no local dependencies or dependents`,
          packages: [pkg.name],
          suggestion: `Consider if this package should be in a separate repository`,
        });
      }
    }

    return issues;
  }

  /**
   * Detect circular dependencies between packages
   */
  private detectCircularPackageDeps(edges: CrossPackageEdge[]): string[][] {
    const cycles: string[][] = [];
    const adj = new Map<string, string[]>();

    for (const edge of edges) {
      const existing = adj.get(edge.from) || [];
      existing.push(edge.to);
      adj.set(edge.from, existing);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, pathNodes: string[]): void => {
      visited.add(node);
      recStack.add(node);

      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...pathNodes, node]);
        } else if (recStack.has(neighbor)) {
          const cycleStart = pathNodes.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...pathNodes.slice(cycleStart), node, neighbor]);
          } else {
            cycles.push([...pathNodes, node, neighbor]);
          }
        }
      }

      recStack.delete(node);
    };

    for (const pkg of this.config.packages) {
      if (!visited.has(pkg.name)) {
        dfs(pkg.name, []);
      }
    }

    return cycles;
  }

  /**
   * Get files for a specific package
   */
  getPackageFiles(packageName: string): Map<string, FileInfo> | undefined {
    return this.packageIndexers.get(packageName)?.getFiles();
  }
}

/**
 * Detect and analyze monorepo
 */
export async function analyzeMonorepo(repoRoot: string): Promise<MonorepoAnalysis> {
  const detector = new MonorepoDetector(repoRoot);
  const config = await detector.detect();
  
  const analyzer = new MonorepoAnalyzer(config);
  return analyzer.analyze();
}
