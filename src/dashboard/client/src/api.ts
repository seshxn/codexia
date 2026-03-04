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
const syncTokenFromUrl = (): string | null => {
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
};

const getAuthHeaders = (): HeadersInit => {
  const token = syncTokenFromUrl();
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

type QueryValue = string | number | boolean | undefined;

interface PaginationParams {
  [key: string]: QueryValue;
  limit?: number;
  offset?: number;
  all?: boolean;
}

const fetchJson = async <T,>(endpoint: string, params?: Record<string, QueryValue>): Promise<T> => {
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
};

export const fetchOverview = async (): Promise<OverviewData> => {
  return fetchJson<OverviewData>('/overview');
};

export const fetchRepoContext = async (): Promise<RepoContextData> => {
  return fetchJson<RepoContextData>('/repo/context');
};

export const fetchRecentRepos = async (): Promise<RepoRecentData> => {
  return fetchJson<RepoRecentData>('/repo/recent');
};

export const selectRepository = async (repoPath: string): Promise<RepoSwitchData> => {
  return fetchJson<RepoSwitchData>('/repo/select', { repoPath });
};

export const pickRepositoryPath = async (): Promise<RepoPickData> => {
  return fetchJson<RepoPickData>('/repo/pick');
};

export const fetchComplexity = async (): Promise<ComplexityData> => {
  return fetchJson<ComplexityData>('/complexity');
};

export const fetchGraph = async (): Promise<GraphData> => {
  return fetchJson<GraphData>('/graph');
};

export const fetchSignals = async (): Promise<SignalsData> => {
  return fetchJson<SignalsData>('/signals');
};

export const fetchHotPaths = async (): Promise<HotPathsData> => {
  return fetchJson<HotPathsData>('/hotpaths');
};

export const fetchTemporal = async (): Promise<TemporalData> => {
  return fetchJson<TemporalData>('/temporal');
};

export const fetchLanguages = async (): Promise<LanguagesData> => {
  return fetchJson<LanguagesData>('/languages');
};

export const fetchContributors = async (): Promise<ContributorsData> => {
  return fetchJson<ContributorsData>('/contributors');
};

export const fetchCommits = async (): Promise<CommitsData> => {
  return fetchJson<CommitsData>('/commits');
};

export const fetchBranches = async (): Promise<BranchesData> => {
  return fetchJson<BranchesData>('/branches');
};

export const fetchActivity = async (): Promise<ActivityData> => {
  return fetchJson<ActivityData>('/activity');
};

export const fetchOwnership = async (): Promise<OwnershipData> => {
  return fetchJson<OwnershipData>('/ownership');
};

export const fetchCodeHealth = async (params?: PaginationParams): Promise<CodeHealthData> => {
  return fetchJson<CodeHealthData>('/code-health', params);
};

export const fetchVelocity = async (params?: PaginationParams): Promise<VelocityData> => {
  return fetchJson<VelocityData>('/velocity', params);
};

export const fetchJiraConfig = async (): Promise<JiraConfigData> => {
  return fetchJson<JiraConfigData>('/jira/config');
};

export const fetchJiraBoards = async (params?: { projectKey?: string; limit?: number }): Promise<JiraBoardsData> => {
  return fetchJson<JiraBoardsData>('/jira/boards', params);
};

export const fetchJiraSprints = async (boardId: number, params?: { state?: string; limit?: number }): Promise<JiraSprintsData> => {
  return fetchJson<JiraSprintsData>('/jira/sprints', {
    boardId,
    state: params?.state,
    limit: params?.limit,
  });
};

export const fetchJiraSprintReport = async (boardId: number, sprintId: number): Promise<JiraSprintReportData> => {
  return fetchJson<JiraSprintReportData>('/jira/sprint-report', { boardId, sprintId });
};

export const fetchJiraBoardReport = async (boardId: number, maxSprints = 12): Promise<JiraBoardHistoryReportData> => {
  return fetchJson<JiraBoardHistoryReportData>('/jira/board-report', { boardId, maxSprints });
};
