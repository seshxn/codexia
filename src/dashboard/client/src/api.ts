import type {
  OverviewData,
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
interface PaginationParams {
  limit?: number;
  offset?: number;
  all?: boolean;
}

async function fetchJson<T>(endpoint: string, params?: PaginationParams): Promise<T> {
  let url = `${API_BASE}${endpoint}`;
  
  if (params) {
    const queryParams = new URLSearchParams();
    if (params.limit !== undefined) queryParams.set('limit', params.limit.toString());
    if (params.offset !== undefined) queryParams.set('offset', params.offset.toString());
    if (params.all !== undefined) queryParams.set('all', params.all.toString());
    
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchOverview(): Promise<OverviewData> {
  return fetchJson<OverviewData>('/overview');
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
