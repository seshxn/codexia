import type {
  GitDiff,
  ImpactResult,
  ChangedSymbol,
  AffectedModule,
  RiskScore,
  RiskFactor,
  ApiChange,
  BoundaryViolation,
  Symbol,
  FileInfo,
  ArchitectureMemory,
} from '../core/types.js';
import { DependencyGraph } from '../core/dependency-graph.js';

export class ImpactAnalyzer {
  private depGraph: DependencyGraph;
  private architecture: ArchitectureMemory | null = null;

  constructor(depGraph: DependencyGraph) {
    this.depGraph = depGraph;
  }

  /**
   * Set architecture memory for boundary checking
   */
  setArchitecture(architecture: ArchitectureMemory): void {
    this.architecture = architecture;
  }

  /**
   * Analyze impact of a diff
   */
  analyze(
    diff: GitDiff,
    files: Map<string, FileInfo>,
    _symbols: Map<string, Symbol[]>
  ): ImpactResult {
    const directlyChanged = this.findChangedSymbols(diff, files);
    const affectedModules = this.findAffectedModules(diff);
    const publicApiChanges = this.detectApiChanges(directlyChanged);
    const boundaryViolations = this.checkBoundaryViolations(diff, files);
    const riskScore = this.calculateRiskScore(
      directlyChanged,
      affectedModules,
      publicApiChanges,
      boundaryViolations
    );

    return {
      directlyChanged,
      affectedModules,
      riskScore,
      publicApiChanges,
      boundaryViolations,
    };
  }

  /**
   * Find symbols that were directly changed
   */
  private findChangedSymbols(diff: GitDiff, files: Map<string, FileInfo>): ChangedSymbol[] {
    const changed: ChangedSymbol[] = [];

    for (const file of diff.files) {
      const fileInfo = files.get(file.path);
      if (!fileInfo) continue;

      for (const symbol of fileInfo.symbols) {
        // Check if symbol's line was affected by the diff
        const wasChanged = file.hunks.some(hunk => 
          symbol.line >= hunk.newStart && 
          symbol.line <= hunk.newStart + hunk.newLines
        );

        if (wasChanged || file.status === 'added') {
          changed.push({
            symbol,
            changeType: file.status === 'added' ? 'added' : 
                       file.status === 'deleted' ? 'deleted' : 'modified',
          });
        }
      }
    }

    return changed;
  }

  /**
   * Find modules affected by the changes
   */
  private findAffectedModules(diff: GitDiff): AffectedModule[] {
    const affected: AffectedModule[] = [];
    const seen = new Set<string>();

    for (const file of diff.files) {
      const dependents = this.depGraph.getTransitiveDependents(file.path);
      
      for (const dep of dependents) {
        if (!seen.has(dep)) {
          seen.add(dep);
          affected.push({
            path: dep,
            reason: `Imports from ${file.path}`,
            distance: 1, // Simplified - would need proper distance calculation
            symbols: [],
          });
        }
      }
    }

    return affected;
  }

  /**
   * Detect public API changes
   */
  private detectApiChanges(changedSymbols: ChangedSymbol[]): ApiChange[] {
    const changes: ApiChange[] = [];

    for (const changed of changedSymbols) {
      if (changed.symbol.exported) {
        changes.push({
          symbol: changed.symbol.name,
          filePath: changed.symbol.filePath,
          changeType: changed.changeType === 'deleted' ? 'breaking' :
                     changed.changeType === 'added' ? 'addition' : 'non-breaking',
          description: `${changed.changeType} ${changed.symbol.kind} '${changed.symbol.name}'`,
        });
      }
    }

    return changes;
  }

  /**
   * Check for architectural boundary violations
   */
  private checkBoundaryViolations(
    diff: GitDiff,
    files: Map<string, FileInfo>
  ): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];

    // Use architecture memory if available
    if (this.architecture) {
      for (const file of diff.files) {
        const fileInfo = files.get(file.path);
        if (!fileInfo) continue;

        const fromLayer = this.findLayerForPath(file.path);
        if (!fromLayer) continue;

        // Check imports against allowed dependencies
        for (const imp of fileInfo.imports) {
          const toLayer = this.findLayerForPath(imp.source);
          if (!toLayer) continue;

          // Check if this dependency is allowed
          if (fromLayer.name !== toLayer.name) {
            const isAllowed = fromLayer.allowedDependencies.some(dep => 
              dep.toLowerCase() === toLayer.name.toLowerCase()
            );

            // Also check explicit boundaries
            const boundary = this.architecture.boundaries.find(b =>
              b.from.toLowerCase() === fromLayer.name.toLowerCase() &&
              b.to.toLowerCase() === toLayer.name.toLowerCase()
            );

            if (!isAllowed && (!boundary || !boundary.allowed)) {
              violations.push({
                from: file.path,
                to: imp.source,
                rule: boundary?.reason || 
                  `${fromLayer.name} should not depend on ${toLayer.name}`,
                severity: 'error',
              });
            }
          }
        }
      }
    } else {
      // Fallback: simple heuristic if no architecture memory
      for (const file of diff.files) {
        // Example: CLI shouldn't import directly from modules internals
        if (file.path.includes('/cli/') && file.path.includes('/modules/')) {
          violations.push({
            from: file.path,
            to: 'modules internal',
            rule: 'CLI should not directly access module internals',
            severity: 'warning',
          });
        }
      }
    }

    return violations;
  }

  /**
   * Find which architecture layer a file path belongs to
   */
  private findLayerForPath(filePath: string): ArchitectureMemory['layers'][0] | null {
    if (!this.architecture) return null;

    for (const layer of this.architecture.layers) {
      for (const pattern of layer.paths) {
        // Simple pattern matching (supports ** and *)
        // Use placeholder to handle ** before * to avoid incorrect replacement
        let regexPattern = pattern
          .replace(/\\/g, '/')  // Normalize backslashes
          .replace(/\*\*/g, '__DOUBLESTAR__')  // Placeholder for **
          .replace(/\*/g, '[^/]*')  // Single * matches anything except /
          .replace(/__DOUBLESTAR__/g, '.*')  // ** matches anything including /
          .replace(/\//g, '[\\\\/]');  // / matches forward or backslash
        
        const regex = new RegExp('^' + regexPattern + '$');
        if (regex.test(filePath)) {
          return layer;
        }
      }
    }

    return null;
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(
    changedSymbols: ChangedSymbol[],
    affectedModules: AffectedModule[],
    apiChanges: ApiChange[],
    boundaryViolations: BoundaryViolation[]
  ): RiskScore {
    const factors: RiskFactor[] = [];

    // Factor: Number of changed symbols
    const symbolScore = Math.min(changedSymbols.length * 5, 30);
    factors.push({
      name: 'Changed Symbols',
      score: symbolScore,
      weight: 0.3,
      reason: `${changedSymbols.length} symbol(s) directly modified`,
    });

    // Factor: Affected modules
    const moduleScore = Math.min(affectedModules.length * 10, 30);
    factors.push({
      name: 'Affected Modules',
      score: moduleScore,
      weight: 0.3,
      reason: `${affectedModules.length} module(s) potentially affected`,
    });

    // Factor: API changes
    const breakingChanges = apiChanges.filter(c => c.changeType === 'breaking').length;
    const apiScore = breakingChanges * 20;
    factors.push({
      name: 'API Changes',
      score: Math.min(apiScore, 30),
      weight: 0.25,
      reason: `${breakingChanges} breaking change(s) detected`,
    });

    // Factor: Boundary violations
    const violationScore = boundaryViolations.length * 15;
    factors.push({
      name: 'Boundary Violations',
      score: Math.min(violationScore, 20),
      weight: 0.15,
      reason: `${boundaryViolations.length} boundary violation(s)`,
    });

    // Calculate weighted average
    const overall = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    return {
      overall: Math.round(overall),
      factors,
    };
  }
}
