import type {
  OverviewData,
  ComplexityData,
  GraphData,
  SignalsData,
  HotPathsData,
  TemporalData,
  LanguagesData,
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
