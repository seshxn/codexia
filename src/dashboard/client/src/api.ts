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

async function fetchJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
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

export async function fetchCodeHealth(): Promise<CodeHealthData> {
  return fetchJson<CodeHealthData>('/code-health');
}

export async function fetchVelocity(): Promise<VelocityData> {
  return fetchJson<VelocityData>('/velocity');
}
