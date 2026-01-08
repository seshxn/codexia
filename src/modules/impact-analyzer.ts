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
} from '../core/types.js';
import { DependencyGraph } from '../core/dependency-graph.js';

export class ImpactAnalyzer {
  private depGraph: DependencyGraph;

  constructor(depGraph: DependencyGraph) {
    this.depGraph = depGraph;
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
    _files: Map<string, FileInfo>
  ): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];

    // Simple heuristic: check for imports across layer boundaries
    // In a full implementation, this would use the architecture memory

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

    return violations;
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
