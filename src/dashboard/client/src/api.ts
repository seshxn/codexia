import type {
  OverviewData,
  RepoContextData,
  RepoRecentData,
  RepoSwitchData,
  RepoPickData,
  ComplexityData,
  GraphData,
  SignalsData,
  HotPathsData,
  TemporalData,
  LanguagesData,
  ContributorsData,
  CommitsData,
  BranchesData,
  ActivityData,
  OwnershipData,
  CodeHealthData,
  VelocityData,
  JiraConfigData,
  JiraBoardsData,
  JiraSprintsData,
  JiraSprintReportData,
  JiraBoardHistoryReportData,
} from './types';

const API_BASE = '/api';
const TOKEN_STORAGE_KEY = 'codexia_dashboard_token';
function syncTokenFromUrl(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return token;
  }

  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function getAuthHeaders(): HeadersInit {
  const token = syncTokenFromUrl();
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

type QueryValue = string | number | boolean | undefined;

interface PaginationParams {
  [key: string]: QueryValue;
  limit?: number;
  offset?: number;
  all?: boolean;
}

async function fetchJson<T>(endpoint: string, params?: Record<string, QueryValue>): Promise<T> {
  let url = `${API_BASE}${endpoint}`;
  
  if (params) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      queryParams.set(key, String(value));
    }
    
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const fallback = `API error: ${response.status} ${response.statusText}`;
    let message = fallback;
    try {
      const errorPayload = await response.json() as { error?: string };
      message = errorPayload.error || fallback;
    } catch {
      message = fallback;
    }
    throw new Error(message);
  }
  return response.json();
}

export async function fetchOverview(): Promise<OverviewData> {
  return fetchJson<OverviewData>('/overview');
}

export async function fetchRepoContext(): Promise<RepoContextData> {
  return fetchJson<RepoContextData>('/repo/context');
}

export async function fetchRecentRepos(): Promise<RepoRecentData> {
  return fetchJson<RepoRecentData>('/repo/recent');
}

export async function selectRepository(repoPath: string): Promise<RepoSwitchData> {
  return fetchJson<RepoSwitchData>('/repo/select', { repoPath });
}

export async function pickRepositoryPath(): Promise<RepoPickData> {
  return fetchJson<RepoPickData>('/repo/pick');
}

export async function fetchComplexity(): Promise<ComplexityData> {
  return fetchJson<ComplexityData>('/complexity');
}

export async function fetchGraph(): Promise<GraphData> {
  return fetchJson<GraphData>('/graph');
}

export async function fetchSignals(): Promise<SignalsData> {
  return fetchJson<SignalsData>('/signals');
}

export async function fetchHotPaths(): Promise<HotPathsData> {
  return fetchJson<HotPathsData>('/hotpaths');
}

export async function fetchTemporal(): Promise<TemporalData> {
  return fetchJson<TemporalData>('/temporal');
}

export async function fetchLanguages(): Promise<LanguagesData> {
  return fetchJson<LanguagesData>('/languages');
}

export async function fetchContributors(): Promise<ContributorsData> {
  return fetchJson<ContributorsData>('/contributors');
}

export async function fetchCommits(): Promise<CommitsData> {
  return fetchJson<CommitsData>('/commits');
}

export async function fetchBranches(): Promise<BranchesData> {
  return fetchJson<BranchesData>('/branches');
}

export async function fetchActivity(): Promise<ActivityData> {
  return fetchJson<ActivityData>('/activity');
}

export async function fetchOwnership(): Promise<OwnershipData> {
  return fetchJson<OwnershipData>('/ownership');
}

export async function fetchCodeHealth(params?: PaginationParams): Promise<CodeHealthData> {
  return fetchJson<CodeHealthData>('/code-health', params);
}

export async function fetchVelocity(params?: PaginationParams): Promise<VelocityData> {
  return fetchJson<VelocityData>('/velocity', params);
}

export async function fetchJiraConfig(): Promise<JiraConfigData> {
  return fetchJson<JiraConfigData>('/jira/config');
}

export async function fetchJiraBoards(params?: { projectKey?: string; limit?: number }): Promise<JiraBoardsData> {
  return fetchJson<JiraBoardsData>('/jira/boards', params);
}

export async function fetchJiraSprints(boardId: number, params?: { state?: string; limit?: number }): Promise<JiraSprintsData> {
  return fetchJson<JiraSprintsData>('/jira/sprints', {
    boardId,
    state: params?.state,
    limit: params?.limit,
  });
}

export async function fetchJiraSprintReport(boardId: number, sprintId: number): Promise<JiraSprintReportData> {
  return fetchJson<JiraSprintReportData>('/jira/sprint-report', { boardId, sprintId });
}

export async function fetchJiraBoardReport(boardId: number, maxSprints = 12): Promise<JiraBoardHistoryReportData> {
  return fetchJson<JiraBoardHistoryReportData>('/jira/board-report', { boardId, maxSprints });
}
