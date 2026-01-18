// API response types
export interface OverviewData {
  name: string;
  totalFiles: number;
  totalSymbols: number;
  totalDependencies: number;
  languages: Record<string, number>;
  healthScore: number;
  lastIndexed: string;
}

export interface ComplexityData {
  files: Array<{
    file: string;
    metrics: {
      lines: number;
      functions: number;
      imports: number;
      exports: number;
      cyclomaticComplexity: number;
    };
    score: number;
  }>;
  averageScore: number;
  highComplexityCount: number;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'file' | 'package';
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgConnections: number;
  };
}

export interface Signal {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface SignalsData {
  signals: Signal[];
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

export interface HotPath {
  path: string;
  score: number;
  metrics: {
    changeFrequency: number;
    complexity: number;
    couplingFactor: number;
  };
}

export interface HotPathsData {
  hotPaths: HotPath[];
  threshold: number;
}

export interface TemporalData {
  recentChanges: Array<{
    file: string;
    changeCount: number;
    lastModified: string;
  }>;
  authorStats: Array<{
    author: string;
    commits: number;
    filesChanged: number;
  }>;
  activityByDay: Record<string, number>;
}

export interface LanguagesData {
  supported: string[];
  detected: Record<string, number>;
  coverage: number;
}
