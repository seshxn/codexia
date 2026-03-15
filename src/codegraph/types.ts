export interface CodeGraphStats {
  files: number;
  symbols: number;
  exports: number;
  avgFanOut: number;
}

export interface RepoRegistryEntry {
  repoRoot: string;
  repoName: string;
  registeredAt: string;
  lastAnalyzedAt?: string;
  lastUpdatedAt?: string;
  stats?: CodeGraphStats;
}

export interface RepoStatus {
  repoRoot: string;
  repoName: string;
  analyzed: boolean;
  lastAnalyzedAt?: string;
  lastUpdatedAt?: string;
  sessionsRecorded: number;
  stats?: CodeGraphStats;
  isStale: boolean;
}

export interface SessionToolCall {
  tool: string;
  timestamp: string;
  paramsSummary: string;
  filesRead: string[];
  filesEdited: string[];
}

export interface SessionRecord {
  id: string;
  taskDescription: string;
  startedAt: string;
  endedAt?: string;
  outcome: 'success' | 'failure' | 'abandoned';
  headStart?: string;
  headEnd?: string;
  toolCalls: SessionToolCall[];
  filesRead: Array<{
    path: string;
    order: number;
  }>;
  filesEdited: Array<{
    path: string;
    linesChanged: number;
  }>;
}

export interface PlanStep {
  file: string;
  confidence: number;
  reason: string;
}

export interface IntentLocation {
  file: string;
  confidence: number;
  reason: string;
}
