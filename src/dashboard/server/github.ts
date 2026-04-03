export interface GitHubConfigStatus {
  enabled: boolean;
  apiUrl: string | null;
  message: string;
}

export interface GitHubPullRequest {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  updatedAt?: string;
  mergedAt?: string;
  closedAt?: string;
  firstCommitAt?: string;
  firstReviewAt?: string;
  issueKeys: string[];
  state: 'open' | 'closed' | 'merged';
  baseBranch: string;
  headBranch: string;
  isDraft: boolean;
  mergedBy?: string;
  headSha?: string;
  mergeCommitSha?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  reviewCount?: number;
}

export interface GitHubDeployment {
  id: string;
  repo: string;
  environment: string;
  status: 'success' | 'failure' | 'in_progress' | 'queued' | 'unknown';
  createdAt: string;
  updatedAt?: string;
  sha?: string;
  source: 'github_deployment' | 'workflow_run' | 'merge_heuristic';
  confidence: 'high' | 'medium' | 'low';
  linkedPullRequestIds: string[];
}

type FetchLike = typeof fetch;

export interface GitHubAnalyticsServiceOptions {
  env?: NodeJS.ProcessEnv;
  token?: string | null;
  apiUrl?: string | null;
  cacheTtlMs?: number | string | null;
}

interface GitHubPullResponse {
  number: number;
  id?: number;
  state: string;
  title: string;
  draft?: boolean;
  created_at: string;
  updated_at?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  user?: {
    login?: string;
  };
  merged_by?: {
    login?: string;
  };
  head?: {
    ref?: string;
    sha?: string;
  };
  base?: {
    ref?: string;
  };
}

interface GitHubPullDetailResponse {
  additions?: number;
  deletions?: number;
  changed_files?: number;
  merge_commit_sha?: string;
  merged_by?: {
    login?: string;
  };
}

interface GitHubReviewResponse {
  submitted_at?: string;
}

interface GitHubDeploymentResponse {
  id: number;
  sha?: string;
  environment?: string;
  created_at: string;
  updated_at?: string;
  statuses_url?: string;
}

interface GitHubDeploymentStatusResponse {
  state?: string;
  created_at?: string;
  updated_at?: string;
}

const ISSUE_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
const GITHUB_API_VERSION = '2026-03-10';

const hasGitHubOptionKeys = (value: NodeJS.ProcessEnv | GitHubAnalyticsServiceOptions): value is GitHubAnalyticsServiceOptions =>
  Object.prototype.hasOwnProperty.call(value, 'env')
  || Object.prototype.hasOwnProperty.call(value, 'token')
  || Object.prototype.hasOwnProperty.call(value, 'apiUrl')
  || Object.prototype.hasOwnProperty.call(value, 'cacheTtlMs');

export class GitHubAnalyticsService {
  private readonly token: string | null;
  private readonly apiUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly cacheTtlMs: number;
  private readonly responseCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(input: NodeJS.ProcessEnv | GitHubAnalyticsServiceOptions = process.env, fetchImpl: FetchLike = fetch) {
    const hasOptions = hasGitHubOptionKeys(input);
    const env = hasOptions ? (input.env || process.env) : input;
    const token = hasOptions ? input.token : env.CODEXIA_GITHUB_TOKEN;
    const apiUrl = hasOptions ? input.apiUrl : env.CODEXIA_GITHUB_API_URL;
    const cacheTtlMs = hasOptions ? input.cacheTtlMs : env.CODEXIA_GITHUB_CACHE_TTL_MS;

    this.token = (typeof token === 'string' ? token : '').trim() || null;
    this.apiUrl = ((typeof apiUrl === 'string' ? apiUrl : String(apiUrl ?? 'https://api.github.com')).trim() || 'https://api.github.com').replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    const parsedCacheTtlMs = Number.parseInt(String(cacheTtlMs ?? '30000').trim() || '30000', 10);
    this.cacheTtlMs = Number.isFinite(parsedCacheTtlMs) ? Math.min(300000, Math.max(1000, parsedCacheTtlMs)) : 30000;
  }

  getConfig(): GitHubConfigStatus {
    if (!this.token) {
      return {
        enabled: false,
        apiUrl: this.apiUrl,
        message: 'Set CODEXIA_GITHUB_TOKEN to enable GitHub engineering intelligence.',
      };
    }

    return {
      enabled: true,
      apiUrl: this.apiUrl,
      message: 'GitHub analytics is configured.',
    };
  }

  async getPullRequests(repo: string, lookbackDays: number): Promise<GitHubPullRequest[]> {
    return this.getCached(`pulls:${repo}:${lookbackDays}`, async () => {
      this.ensureConfigured();
      const [owner, name] = this.parseRepo(repo);
      const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

      const [openPulls, closedPulls] = await Promise.all([
        this.paginate<GitHubPullResponse>(`/repos/${owner}/${name}/pulls?state=open&sort=updated&direction=desc&per_page=100`),
        this.paginate<GitHubPullResponse>(`/repos/${owner}/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=100`),
      ]);

      const filtered = [...openPulls, ...closedPulls]
        .filter((pull) => {
          const updatedAt = Date.parse(pull.updated_at || pull.created_at);
          return Number.isFinite(updatedAt) && updatedAt >= since;
        })
        .filter((pull, index, all) => all.findIndex((candidate) => candidate.number === pull.number) === index);

      return Promise.all(filtered.map(async (pull) => {
        const merged = Boolean(pull.merged_at);
        const [detail, reviews] = await Promise.all([
          this.getPullRequestDetail(owner, name, pull.number),
          this.getPullRequestReviews(owner, name, pull.number),
        ]);
        const firstReviewAt = reviews
          .map((review) => review.submitted_at)
          .filter((value): value is string => typeof value === 'string')
          .sort((a, b) => Date.parse(a) - Date.parse(b))[0];

        return {
          id: `pr-${pull.id || pull.number}`,
          repo,
          number: pull.number,
          title: pull.title,
          author: pull.user?.login || 'unknown',
          createdAt: pull.created_at,
          updatedAt: pull.updated_at,
          mergedAt: pull.merged_at || undefined,
          closedAt: pull.closed_at || undefined,
          issueKeys: this.extractIssueKeys([pull.title, pull.head?.ref]),
          state: merged ? 'merged' : pull.state === 'open' ? 'open' : 'closed',
          baseBranch: pull.base?.ref || 'main',
          headBranch: pull.head?.ref || '',
          headSha: pull.head?.sha || undefined,
          firstCommitAt: pull.created_at,
          firstReviewAt,
          isDraft: Boolean(pull.draft),
          mergedBy: detail.merged_by?.login || pull.merged_by?.login,
          mergeCommitSha: detail.merge_commit_sha || undefined,
          additions: detail.additions ?? 0,
          deletions: detail.deletions ?? 0,
          changedFiles: detail.changed_files ?? 0,
          reviewCount: reviews.length,
        };
      }));
    });
  }

  async getDeployments(
    repo: string,
    lookbackDays: number,
    selectors?: { environments?: string[] },
  ): Promise<GitHubDeployment[]> {
    const environmentsKey = (selectors?.environments || []).slice().sort().join(',');
    return this.getCached(`deployments:${repo}:${lookbackDays}:${environmentsKey}`, async () => {
      this.ensureConfigured();
      const [owner, name] = this.parseRepo(repo);
      const since = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
      const deployments = await this.paginate<GitHubDeploymentResponse>(`/repos/${owner}/${name}/deployments?per_page=100`);
      const allowedEnvironments = new Set((selectors?.environments || []).map((value) => value.toLowerCase()));

      const filtered = deployments.filter((deployment) => {
        const createdAt = Date.parse(deployment.created_at);
        if (!Number.isFinite(createdAt) || createdAt < since) {
          return false;
        }

        if (allowedEnvironments.size === 0) {
          return true;
        }

        return allowedEnvironments.has((deployment.environment || '').toLowerCase());
      });

      const snapshots: GitHubDeployment[] = [];
      for (const deployment of filtered) {
        const status = deployment.statuses_url
          ? await this.getDeploymentStatus(deployment.statuses_url)
          : { status: 'unknown' as const, updatedAt: deployment.updated_at };

        snapshots.push({
          id: `dep-${deployment.id}`,
          repo,
          environment: deployment.environment || 'unknown',
          status: status.status,
          createdAt: deployment.created_at,
          updatedAt: status.updatedAt || deployment.updated_at,
          sha: deployment.sha,
          source: 'github_deployment',
          confidence: 'high',
          linkedPullRequestIds: [],
        });
      }

      return snapshots;
    });
  }

  private async getDeploymentStatus(statusesUrl: string): Promise<{ status: GitHubDeployment['status']; updatedAt?: string }> {
    return this.getCached(`deployment-status:${statusesUrl}`, async () => {
      const response = await this.request(statusesUrl.startsWith('http') ? statusesUrl : `${this.apiUrl}${statusesUrl}`);
      const payload = await response.json() as GitHubDeploymentStatusResponse[];
      const latest = payload[0];

      return {
        status: this.mapDeploymentStatus(latest?.state),
        updatedAt: latest?.updated_at || latest?.created_at,
      };
    });
  }

  private async getPullRequestDetail(owner: string, repo: string, number: number): Promise<GitHubPullDetailResponse> {
    return this.getCached(`pull-detail:${owner}/${repo}:${number}`, async () => {
      const response = await this.request(`${this.apiUrl}/repos/${owner}/${repo}/pulls/${number}`);
      return response.json() as Promise<GitHubPullDetailResponse>;
    });
  }

  private async getPullRequestReviews(owner: string, repo: string, number: number): Promise<GitHubReviewResponse[]> {
    return this.getCached(`pull-reviews:${owner}/${repo}:${number}`, async () => {
      const response = await this.request(`${this.apiUrl}/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`);
      return response.json() as Promise<GitHubReviewResponse[]>;
    });
  }

  private async paginate<T>(url: string): Promise<T[]> {
    const records: T[] = [];
    let nextUrl: string | null = url.startsWith('http') ? url : `${this.apiUrl}${url}`;

    while (nextUrl) {
      const response = await this.request(nextUrl);
      const payload = await response.json() as T[];
      records.push(...payload);
      nextUrl = this.parseNextLink(response.headers.get('link'));
    }

    return records;
  }

  private async request(url: string): Promise<Response> {
    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      if (this.isRateLimitResponse(response, error)) {
        throw new Error('GitHub API rate limit reached.');
      }
      throw new Error(`GitHub API request failed with ${response.status}: ${error}`);
    }

    return response;
  }

  private isRateLimitResponse(response: Response, errorText: string): boolean {
    if (response.status === 429) {
      return true;
    }

    if (response.status !== 403) {
      return false;
    }

    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      return true;
    }

    return /rate limit/i.test(errorText);
  }

  private parseRepo(repo: string): [string, string] {
    const parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid GitHub repo slug: ${repo}`);
    }

    return [parts[0], parts[1]];
  }

  private ensureConfigured(): void {
    if (!this.token) {
      throw new Error('GitHub is not configured: missing CODEXIA_GITHUB_TOKEN.');
    }
  }

  private async getCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.responseCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const task = loader().then((value) => {
      this.responseCache.set(key, {
        expiresAt: now + this.cacheTtlMs,
        value,
      });
      this.inFlight.delete(key);
      return value;
    }).catch((error) => {
      this.inFlight.delete(key);
      throw error;
    });

    this.inFlight.set(key, task);
    return task;
  }

  private extractIssueKeys(values: Array<string | undefined>): string[] {
    const result = new Set<string>();
    for (const value of values) {
      if (!value) {
        continue;
      }

      for (const match of value.matchAll(ISSUE_KEY_PATTERN)) {
        result.add(match[1]);
      }
    }

    return [...result];
  }

  private parseNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }

    const parts = linkHeader.split(',');
    for (const part of parts) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match && match[2] === 'next') {
        return match[1];
      }
    }

    return null;
  }

  private mapDeploymentStatus(state?: string): GitHubDeployment['status'] {
    const normalized = (state || '').toLowerCase();
    if (normalized === 'success') {
      return 'success';
    }
    if (normalized === 'failure' || normalized === 'error') {
      return 'failure';
    }
    if (normalized === 'queued' || normalized === 'pending') {
      return 'queued';
    }
    if (normalized === 'in_progress') {
      return 'in_progress';
    }
    return 'unknown';
  }
}
