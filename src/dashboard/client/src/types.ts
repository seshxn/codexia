// API response types
export interface OverviewData {
  name: string;
  repoRoot?: string;
  totalFiles: number;
  totalSymbols: number;
  totalDependencies: number;
  languages: Record<string, number>;
  healthScore: number;
  lastIndexed: string;
}

export interface RepoContextData {
  repoRoot: string;
  repoName: string;
}

export interface RepoRecentData {
  repos: Array<{
    path: string;
    name: string;
    current: boolean;
  }>;
}

export interface RepoSwitchData extends RepoContextData {
  message: string;
}

export interface RepoPickData {
  cancelled: boolean;
  repoPath?: string;
  repoName?: string;
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

// Git-related types
export interface Contributor {
  rank: number;
  name: string;
  email: string;
  avatar: string;
  commits: number;
  additions: number;
  deletions: number;
  firstCommit: string;
  lastCommit: string;
  recentCommits: number;
  isActive: boolean;
}

export interface ContributorsData {
  contributors: Contributor[];
  totalContributors: number;
  activeContributors: number;
}

export interface Commit {
  hash: string;
  fullHash: string;
  message: string;
  author: string;
  email: string;
  avatar: string;
  date: string;
  relativeDate: string;
}

export interface CommitsData {
  commits: Commit[];
}

export interface Branch {
  name: string;
  isCurrent: boolean;
  lastActivity: string;
  lastCommitMessage: string;
  lastCommitAuthor: string;
  daysSinceActivity: number;
  isStale: boolean;
}

export interface BranchesData {
  current: string;
  branches: Branch[];
  totalBranches: number;
  staleBranches: number;
}

export interface ActivityData {
  activityByDate: Array<{ date: string; count: number }>;
  activityByHour: Array<{ hour: number; label: string; count: number }>;
  activityByDayOfWeek: Array<{ day: string; index: number; count: number }>;
  totalCommits: number;
  peakHour: string;
  peakDay: string;
  averagePerDay: string;
}

export interface FileOwnership {
  file: string;
  primaryOwner: string;
  ownerEmail: string;
  ownership: number;
  contributors: number;
  lastModified: string;
  busFactor: number;
}

export interface OwnershipData {
  files: FileOwnership[];
  highRiskFiles: FileOwnership[];
  ownersByFiles: Array<{
    name: string;
    email: string;
    filesOwned: number;
    avgOwnership: number;
  }>;
  averageBusFactor: string;
  totalFiles?: number;
  totalHighRiskFiles?: number;
}

// Code Health Types
export interface CodeHealthData {
  maintainability: {
    average: number;
    grade: string;
  };
  complexity: {
    distribution: {
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
    averageScore: string;
  };
  technicalDebt: {
    score: number;
    grade: string;
    indicators: {
      highComplexity: number;
      lowCohesion: number;
      highCoupling: number;
      errors: number;
      warnings: number;
    };
  };
  codebase: {
    totalFiles: number;
    totalLines: number;
    avgLinesPerFile: number;
  };
  filesNeedingAttention: Array<{
    file: string;
    score: number;
    maintainability: number;
    lines: number;
    reason: string;
  }>;
}

// Velocity Types
export interface VelocityData {
  summary: {
    totalCommits30d: number;
    avgCommitsPerWeek: number;
    velocityTrend: string;
    activeContributors: number;
    totalContributors: number;
  };
  weeklyTrend: Array<{
    week: string;
    commits: number;
  }>;
  dailyActivity: Array<{
    date: string;
    count: number;
  }>;
  topContributors: Array<{
    email: string;
    commits: number;
    lastWeek: number;
  }>;
}

// Jira analytics types
export interface JiraConfigData {
  enabled: boolean;
  baseUrl: string | null;
  authMode: 'none' | 'basic' | 'bearer';
  message: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  projectKey: string | null;
  projectName: string | null;
}

export interface JiraBoardsData {
  boards: JiraBoard[];
  total: number;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

export interface JiraSprintsData {
  boardId: number;
  sprints: JiraSprint[];
  total: number;
}

export interface JiraSprintReportData {
  board: {
    id: number;
    name: string;
  };
  sprint: JiraSprint;
  metrics: {
    issues: {
      total: number;
      committed: number;
      completedByEnd: number;
      completionRate: number;
      addedAfterStart: number;
      removedDuringSprint: number;
      carryover: number;
    };
    points: {
      committed: number;
      completedByEnd: number;
      completionRate: number;
      addedAfterStart: number;
      removedDuringSprint: number;
      absoluteChangeDuringSprint: number;
      netChangeDuringSprint: number;
      changedIssueCount: number;
      changeEventCount: number;
      currentScope: number;
      remaining: number;
    };
  };
  health: {
    status: 'on_track' | 'at_risk' | 'off_track' | 'completed' | 'unknown';
    score: number;
    elapsedPct: number;
    completionPct: number;
    paceDelta: number;
    remainingDays: number;
    requiredPointsPerDay: number;
    summary: string;
  };
  integrity: {
    risk: 'low' | 'medium' | 'high';
    score: number;
    flags: string[];
    indicators: {
      scopeCreepPct: number;
      pointChurnPct: number;
      carryoverPct: number;
      removedPct: number;
    };
  };
}

export interface JiraBoardHistoryReportData {
  board: {
    id: number;
    name: string;
  };
  summary: {
    sprintsAnalyzed: number;
    averageCompletionRate: number;
    averageScopeCreepPct: number;
    averagePointChurnPct: number;
    averageIntegrityScore: number;
    onTrackLikeSprints: number;
    riskDistribution: {
      low: number;
      medium: number;
      high: number;
    };
  };
  sprints: Array<{
    id: number;
    name: string;
    state: string;
    startDate?: string;
    endDate?: string;
    completeDate?: string;
    goal?: string;
    completionRate: number;
    committedPoints: number;
    completedPoints: number;
    scopeCreepPct: number;
    pointChurnPct: number;
    carryoverPct: number;
    integrityRisk: 'low' | 'medium' | 'high';
    integrityScore: number;
    healthStatus: 'on_track' | 'at_risk' | 'off_track' | 'completed' | 'unknown';
    flags: string[];
  }>;
}

export interface JiraAiInsightsData {
  scope: 'sprint' | 'board';
  provider: string;
  generatedAt: string;
  overview: string;
  positives: string[];
  risks: string[];
  integrityFindings: string[];
  recommendations: string[];
  questions: string[];
  raw: string;
}
