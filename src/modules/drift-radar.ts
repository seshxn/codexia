import type {
  ArchitectureMemory,
  CommitRecord,
  ConventionMemory,
  DependencyNode,
  FileInfo,
} from '../core/types.js';

export type DriftCategory = 'boundary' | 'naming' | 'structural' | 'dependency';
export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface DriftSignal {
  category: DriftCategory;
  severity: DriftSeverity;
  filePath: string;
  source: string;
  message: string;
}

export interface DriftRadarInput {
  files: Map<string, FileInfo>;
  architecture: ArchitectureMemory;
  dependencyNodes: Map<string, DependencyNode>;
  signals: DriftSignal[];
  recentCommits?: CommitRecord[];
  commitsWindow?: number;
  declaredNamingConventions?: ConventionMemory['naming'];
}

export interface DriftComponent {
  score: number;
  weightedPoints: number;
  violationCount: number;
}

export interface DriftLayerHeat {
  layer: string;
  score: number;
  files: number;
  violations: number;
}

export interface DriftVelocity {
  delta: number;
  slopePerCommit: number;
  direction: 'converging' | 'diverging' | 'stable';
}

export interface DriftTrajectoryPoint {
  commit: string;
  date: string;
  message: string;
  score: number;
}

export interface EmergentConventionCandidate {
  target: 'Files';
  pattern: string;
  confidence: number;
  evidenceCount: number;
  layer?: string;
}

export interface DriftRadarReport {
  generatedAt: string;
  composite: {
    score: number;
  };
  components: Record<DriftCategory, DriftComponent>;
  heatmap: {
    layers: DriftLayerHeat[];
  };
  trajectory: {
    points: DriftTrajectoryPoint[];
    velocity: DriftVelocity;
  };
  emergentConventions: EmergentConventionCandidate[];
}

const SEVERITY_POINTS: Record<DriftSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const WEIGHTS: Record<DriftCategory, number> = {
  boundary: 0.35,
  naming: 0.2,
  structural: 0.25,
  dependency: 0.2,
};

export class DriftRadar {
  analyze(input: DriftRadarInput): DriftRadarReport {
    const generatedAt = new Date().toISOString();
    const augmentedSignals = [
      ...input.signals,
      ...this.deriveDependencySignals(input.dependencyNodes),
      ...this.deriveStructuralSignals(input.files),
      ...this.deriveBoundarySignals(input.files, input.architecture),
    ];

    const components = this.computeComponents(augmentedSignals, input.files.size);
    const compositeScore = this.computeComposite(components);
    const heatmap = this.computeHeatmap(input.architecture, input.files, augmentedSignals);
    const trajectory = this.computeTrajectory(augmentedSignals, input.recentCommits || [], input.commitsWindow || 20);
    const emergentConventions = this.mineEmergentConventions(
      input.files,
      input.architecture,
      input.declaredNamingConventions || []
    );

    return {
      generatedAt,
      composite: { score: compositeScore },
      components,
      heatmap: { layers: heatmap },
      trajectory,
      emergentConventions,
    };
  }

  private computeComponents(signals: DriftSignal[], fileCount: number): Record<DriftCategory, DriftComponent> {
    const grouped: Record<DriftCategory, DriftSignal[]> = {
      boundary: [],
      naming: [],
      structural: [],
      dependency: [],
    };

    for (const signal of signals) {
      grouped[signal.category].push(signal);
    }

    const denominator = Math.max(fileCount, 1);

    return {
      boundary: this.buildComponent(grouped.boundary, denominator),
      naming: this.buildComponent(grouped.naming, denominator),
      structural: this.buildComponent(grouped.structural, denominator),
      dependency: this.buildComponent(grouped.dependency, denominator),
    };
  }

  private buildComponent(signals: DriftSignal[], denominator: number): DriftComponent {
    const weightedPoints = signals.reduce((sum, signal) => sum + SEVERITY_POINTS[signal.severity], 0);
    const score = this.normalizePoints(weightedPoints, denominator);

    return {
      score,
      weightedPoints,
      violationCount: signals.length,
    };
  }

  private computeComposite(components: Record<DriftCategory, DriftComponent>): number {
    const weighted =
      components.boundary.score * WEIGHTS.boundary +
      components.naming.score * WEIGHTS.naming +
      components.structural.score * WEIGHTS.structural +
      components.dependency.score * WEIGHTS.dependency;

    return clamp(Math.round(weighted), 0, 100);
  }

  private computeHeatmap(
    architecture: ArchitectureMemory,
    files: Map<string, FileInfo>,
    signals: DriftSignal[]
  ): DriftLayerHeat[] {
    return architecture.layers.map((layer) => {
      const layerFiles = Array.from(files.keys()).filter((filePath) =>
        layer.paths.some((pattern) => this.matchesPattern(filePath, pattern))
      );
      const layerFileSet = new Set(layerFiles);
      const layerSignals = signals.filter((signal) => layerFileSet.has(signal.filePath));
      const weightedPoints = layerSignals.reduce((sum, signal) => sum + SEVERITY_POINTS[signal.severity], 0);

      return {
        layer: layer.name,
        score: this.normalizePoints(weightedPoints, Math.max(layerFiles.length, 1)),
        files: layerFiles.length,
        violations: layerSignals.length,
      };
    });
  }

  private computeTrajectory(
    signals: DriftSignal[],
    commits: CommitRecord[],
    commitsWindow: number
  ): { points: DriftTrajectoryPoint[]; velocity: DriftVelocity } {
    const fileRisk = new Map<string, number>();

    for (const signal of signals) {
      const current = fileRisk.get(signal.filePath) || 0;
      fileRisk.set(signal.filePath, current + SEVERITY_POINTS[signal.severity]);
    }

    const sorted = [...commits]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-Math.max(1, commitsWindow));

    const points: DriftTrajectoryPoint[] = sorted.map((commit) => {
      const changed = commit.changes.length > 0 ? commit.changes.map((change) => change.path) : commit.files;
      const riskScores = changed.map((filePath) => this.normalizePoints(fileRisk.get(filePath) || 0, 1));
      const score = riskScores.length > 0
        ? Math.round(riskScores.reduce((sum, value) => sum + value, 0) / riskScores.length)
        : 0;

      return {
        commit: commit.hash.slice(0, 12),
        date: commit.date.toISOString(),
        message: commit.message,
        score,
      };
    });

    return {
      points,
      velocity: this.computeVelocity(points),
    };
  }

  private computeVelocity(points: DriftTrajectoryPoint[]): DriftVelocity {
    if (points.length < 2) {
      return {
        delta: 0,
        slopePerCommit: 0,
        direction: 'stable',
      };
    }

    const first = points[0].score;
    const last = points[points.length - 1].score;
    const delta = round(last - first, 2);
    const slopePerCommit = round(delta / (points.length - 1), 2);
    const threshold = 5;

    let direction: DriftVelocity['direction'] = 'stable';
    if (delta > threshold) {
      direction = 'diverging';
    } else if (delta < -threshold) {
      direction = 'converging';
    }

    return {
      delta,
      slopePerCommit,
      direction,
    };
  }

  private mineEmergentConventions(
    files: Map<string, FileInfo>,
    architecture: ArchitectureMemory,
    declaredNaming: ConventionMemory['naming']
  ): EmergentConventionCandidate[] {
    const candidates: EmergentConventionCandidate[] = [];

    for (const layer of architecture.layers) {
      const layerFiles = Array.from(files.keys()).filter((filePath) =>
        layer.paths.some((pattern) => this.matchesPattern(filePath, pattern))
      );

      const candidate = this.buildFileNamingCandidate(layerFiles, declaredNaming, layer.name);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    // Fallback to repository-level detection when layer-level confidence is too low
    if (candidates.length === 0) {
      const repoCandidate = this.buildFileNamingCandidate(Array.from(files.keys()), declaredNaming, undefined);
      if (repoCandidate) {
        candidates.push(repoCandidate);
      }
    }

    return candidates;
  }

  private buildFileNamingCandidate(
    filePaths: string[],
    declaredNaming: ConventionMemory['naming'],
    layer?: string
  ): EmergentConventionCandidate | null {
    if (filePaths.length < 3) {
      return null;
    }

    const styles = filePaths.map((filePath) => detectFileStyle(filePath));
    const counts = new Map<string, number>();

    for (const style of styles) {
      counts.set(style, (counts.get(style) || 0) + 1);
    }

    const dominant = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!dominant) {
      return null;
    }

    const [style, count] = dominant;
    const confidence = count / filePaths.length;

    if (style === 'mixed' || confidence < 0.7) {
      return null;
    }

    const declaredText = declaredNaming.map((rule) => `${rule.target} ${rule.pattern}`.toLowerCase()).join(' ');
    const alreadyDeclared = declaredText.includes('file') && declaredText.includes(style.split('-')[0]);

    if (alreadyDeclared) {
      return null;
    }

    return {
      target: 'Files',
      pattern: `${style} file naming`,
      confidence: round(confidence, 2),
      evidenceCount: count,
      layer,
    };
  }

  private deriveDependencySignals(dependencyNodes: Map<string, DependencyNode>): DriftSignal[] {
    const signals: DriftSignal[] = [];

    for (const [filePath, node] of dependencyNodes) {
      if (node.imports.length > 12) {
        signals.push({
          category: 'dependency',
          severity: 'medium',
          filePath,
          source: 'dependency-graph',
          message: `High fan-out (${node.imports.length} imports)`,
        });
      }

      if (node.importedBy.length > 20) {
        signals.push({
          category: 'dependency',
          severity: 'medium',
          filePath,
          source: 'dependency-graph',
          message: `High fan-in (${node.importedBy.length} dependents)`,
        });
      }

      for (const importedPath of node.imports) {
        const importedNode = dependencyNodes.get(importedPath);
        if (importedNode?.imports.includes(filePath)) {
          signals.push({
            category: 'dependency',
            severity: 'high',
            filePath,
            source: 'dependency-graph',
            message: `Cycle detected between ${filePath} and ${importedPath}`,
          });
        }
      }
    }

    return dedupeSignals(signals);
  }

  private deriveStructuralSignals(files: Map<string, FileInfo>): DriftSignal[] {
    const signals: DriftSignal[] = [];

    for (const [filePath, file] of files) {
      if (file.lines > 500) {
        signals.push({
          category: 'structural',
          severity: 'high',
          filePath,
          source: 'structure',
          message: `Large file (${file.lines} lines)`,
        });
      }

      if (file.exports.length > 10) {
        signals.push({
          category: 'structural',
          severity: 'medium',
          filePath,
          source: 'structure',
          message: `High export count (${file.exports.length})`,
        });
      }
    }

    return signals;
  }

  private deriveBoundarySignals(files: Map<string, FileInfo>, architecture: ArchitectureMemory): DriftSignal[] {
    const signals: DriftSignal[] = [];

    for (const boundary of architecture.boundaries) {
      if (boundary.allowed) {
        continue;
      }

      const fromLayer = architecture.layers.find((layer) => layer.name === boundary.from);
      const toLayer = architecture.layers.find((layer) => layer.name === boundary.to);
      if (!fromLayer || !toLayer) {
        continue;
      }

      const fromFiles = Array.from(files.entries()).filter(([filePath]) =>
        fromLayer.paths.some((pattern) => this.matchesPattern(filePath, pattern))
      );

      for (const [filePath, file] of fromFiles) {
        const violatesBoundary = file.imports.some((imp) =>
          toLayer.paths.some((pattern) => this.matchesPattern(normalizeImportPath(filePath, imp.source), pattern))
        );

        if (violatesBoundary) {
          signals.push({
            category: 'boundary',
            severity: 'high',
            filePath,
            source: 'architecture',
            message: `${boundary.from} should not depend on ${boundary.to}`,
          });
        }
      }
    }

    return signals;
  }

  private normalizePoints(weightedPoints: number, denominator: number): number {
    // 5 points per file maps near 100, then clamp.
    return clamp(Math.round((weightedPoints / Math.max(1, denominator)) * 20), 0, 100);
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLESTAR}}/g, '.*')
      .replace(/\//g, '\\/');

    return new RegExp(`^${regex}$`).test(filePath) || new RegExp(regex).test(filePath);
  }
}

function detectFileStyle(filePath: string): string {
  const base = filePath.split('/').pop() || filePath;
  const name = base.replace(/\.[^.]+$/, '');

  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name)) return 'kebab-case';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name)) return 'snake_case';

  return 'mixed';
}

function normalizeImportPath(filePath: string, source: string): string {
  if (!source.startsWith('.')) {
    return source;
  }

  const fromParts = filePath.split('/');
  fromParts.pop();

  const sourceParts = source.split('/');
  for (const part of sourceParts) {
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..') {
      fromParts.pop();
      continue;
    }
    fromParts.push(part);
  }

  return fromParts.join('/').replace(/\.js$/, '.ts');
}

function dedupeSignals(signals: DriftSignal[]): DriftSignal[] {
  const seen = new Set<string>();
  const unique: DriftSignal[] = [];

  for (const signal of signals) {
    const key = `${signal.category}|${signal.filePath}|${signal.source}|${signal.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(signal);
  }

  return unique;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
