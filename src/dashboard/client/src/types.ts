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
    kind: 'repo' | 'directory' | 'file' | 'community' | 'process' | 'class' | 'interface' | 'function' | 'method' | 'property' | 'variable' | 'type' | 'enum' | 'namespace';
    path: string;
    parentId?: string;
    depth: number;
    degree: number;
    line?: number;
    language?: string;
    exported?: boolean;
    metrics: {
      lines?: number;
      imports?: number;
      importedBy?: number;
      symbols?: number;
      exports?: number;
      cognitiveLoad?: number;
    };
    details?: {
      description?: string;
      cohesion?: number;
      memberCount?: number;
      processType?: 'entry' | 'pipeline' | 'cross-cutting';
      stepCount?: number;
      communities?: string[];
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    kind: 'contains' | 'defines' | 'imports' | 'uses' | 'calls' | 'extends' | 'implements' | 'member_of' | 'step_in_process';
    weight: number;
  }>;
  stats: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    byKind: Record<string, number>;
    byEdgeKind: Record<string, number>;
    topConnected: Array<{
      id: string;
      label: string;
      kind: GraphData['nodes'][number]['kind'];
      degree: number;
      path: string;
    }>;
  };
}

export interface GraphFileData {
  path: string;
  language?: string;
  focusLine?: number;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  snippet: string;
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

export interface CognitiveLoadData {
  generatedAt: string;
  summary: {
    filesAnalyzed: number;
    modulesAnalyzed: number;
    averageScore: number;
    highLoadFiles: number;
    topFiles: string[];
    topModules: string[];
    totalFiles: number;
    visibleFiles: number;
  };
  files: Array<{
    path: string;
    module: string;
    score: number;
    contextSwitchCost: number;
    documentationScore: number;
    complexityScore: number;
    modificationFrequency: number;
    onboardingWeight: number;
    dimensions: Record<string, number>;
  }>;
  modules: Array<{
    module: string;
    score: number;
    fileCount: number;
    avgContextSwitchCost: number;
    onboardingDifficulty: number;
    topRiskFiles: string[];
  }>;
  functions: Array<{
    path: string;
    name: string;
    kind: string;
    line: number;
    score: number;
    contextSwitchCost: number;
    dimensions: Record<string, number>;
  }>;
  implicitCoupling: Array<{
    from: string;
    to: string;
    coChangeRatio: number;
    coChangeCount: number;
    score: number;
    directDependency: boolean;
  }>;
  documentationGaps: Array<{
    path: string;
    complexityBurden: number;
    documentationScore: number;
    cognitiveLoadScore: number;
    gapScore: number;
  }>;
  onboardingDifficulty: Array<{
    path: string;
    difficultyScore: number;
    modificationFrequency: number;
    cognitiveLoadScore: number;
    ownershipRisk: number;
    contextSwitchCost: number;
  }>;
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

export interface ConfidenceMetricData {
  value: number;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface EngineeringConfigData {
  enabled: boolean;
  teamConfig: {
    enabled: boolean;
    path: string;
    message: string;
    teamsConfigured: number;
  };
  providers: {
    github: {
      enabled: boolean;
      apiUrl: string | null;
      message: string;
    };
    jira: {
      enabled: boolean;
      baseUrl: string | null;
      authMode: 'none' | 'basic' | 'bearer';
      message: string;
    };
  };
}

export interface EngineeringTeamSummary {
  name: string;
  repos: string[];
}

export interface EngineeringTeamsData {
  teams: EngineeringTeamSummary[];
  total: number;
}

export interface FlowIssueTypeData {
  issueType: string;
  throughput: number;
  medianCycleTimeHours: number;
  medianLeadTimeHours: number;
}

export interface FlowMetricsData {
  summary: {
    throughput: number;
    unplannedWorkRatio: number;
    reopenRate: number;
    blockedAgingHours: number;
  };
  queueVsActive: {
    queueHours: number;
    activeHours: number;
  };
  issueTypes: FlowIssueTypeData[];
  trends: {
    forecastReliability: number;
  };
}

export interface TeamReportData {
  team: {
    name: string;
    repos: string[];
  };
  dora: {
    deploymentFrequency: ConfidenceMetricData;
    leadTimeHours: ConfidenceMetricData;
    changeFailureRate: ConfidenceMetricData;
    meanTimeToRestoreHours: ConfidenceMetricData;
  };
  pullRequestFunnel: {
    total: number;
    merged: number;
    open: number;
    reviewed: number;
    averageReviewLatencyHours: number;
  };
  githubLinkageCoverage: ConfidenceMetricData;
  incidents: {
    total: number;
    active: number;
    failedChanges: number;
  };
  prHealth: {
    averagePickupTimeHours: number;
    averageMergeTimeHours: number;
    averageReviewRounds: number;
    averagePrSize: number;
    largePrRate: number;
    staleOpen: number;
    hotfixRate: number;
    mergeRate: number;
  };
  planning: {
    flowEfficiencyPct: number;
    carryoverRate: number;
    averageWipAgeHours: number;
    blockedWorkRate: number;
    forecastReliability: number;
  };
  reliability: {
    severityDistribution: Record<'low' | 'medium' | 'high' | 'critical', number>;
    repeatIncidentRate: number;
    incidentLinkageCoverage: ConfidenceMetricData;
  };
  throughput: {
    completedWorkItems: number;
    deployments: number;
    deployedRepos: number;
    workItemsByType: Array<{
      issueType: string;
      throughput: number;
    }>;
  };
  peopleRisk: {
    topAuthorShare: ConfidenceMetricData;
    topMergerShare: ConfidenceMetricData;
    afterHoursDeploymentRate: ConfidenceMetricData;
  };
  linkageQuality: {
    githubLinkageCoverage: ConfidenceMetricData;
    deploymentTraceabilityCoverage: ConfidenceMetricData;
    incidentLinkageCoverage: ConfidenceMetricData;
    incidentDeploymentCoverage: ConfidenceMetricData;
  };
  deploymentTimeline: Array<{
    id: string;
    repo: string;
    environment: string;
    createdAt: string;
    status: 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown';
    source: 'github_deployment' | 'workflow_run' | 'merge_heuristic';
    confidence: 'high' | 'medium' | 'low';
    linkedIncidentCount: number;
  }>;
  recentIncidents: Array<{
    id: string;
    key: string;
    summary: string;
    createdAt: string;
    resolvedAt?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    issueKeys: string[];
    labels: string[];
    source: 'jira_incident' | 'heuristic';
    confidence: 'high' | 'medium' | 'low';
  }>;
  flow: FlowMetricsData;
}

export interface EngineeringOverviewData {
  generatedAt: string;
  teams: Array<{
    team: {
      name: string;
      repos: string[];
    };
    dora: TeamReportData['dora'];
    incidents: TeamReportData['incidents'];
    githubLinkageCoverage: ConfidenceMetricData;
  }>;
  portfolioDora: TeamReportData['dora'];
  activeIncidents: number;
  failedChanges: number;
  totalPullRequests: number;
}

export interface JiraFlowReportData extends FlowMetricsData {
  generatedAt: string;
  projectKeys: string[];
  issueCount: number;
  workItems: Array<{
    id: string;
    key: string;
    title: string;
    projectKey: string;
    type: string;
    status: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    cycleTimeHours: number;
    leadTimeHours: number;
    blockedHours: number;
    reopened: boolean;
  }>;
}
