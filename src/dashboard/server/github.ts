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

export class GitHubAnalyticsService {
  private readonly token: string | null;
  private readonly apiUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(env: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch) {
    this.token = (env.CODEXIA_GITHUB_TOKEN || '').trim() || null;
    this.apiUrl = ((env.CODEXIA_GITHUB_API_URL || 'https://api.github.com').trim() || 'https://api.github.com').replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
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
      const detail = await this.getPullRequestDetail(owner, name, pull.number);
      const reviews = await this.getPullRequestReviews(owner, name, pull.number);
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
  }

  async getDeployments(
    repo: string,
    lookbackDays: number,
    selectors?: { environments?: string[] },
  ): Promise<GitHubDeployment[]> {
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
  }

  private async getDeploymentStatus(statusesUrl: string): Promise<{ status: GitHubDeployment['status']; updatedAt?: string }> {
    const response = await this.request(statusesUrl.startsWith('http') ? statusesUrl : `${this.apiUrl}${statusesUrl}`);
    const payload = await response.json() as GitHubDeploymentStatusResponse[];
    const latest = payload[0];

    return {
      status: this.mapDeploymentStatus(latest?.state),
      updatedAt: latest?.updated_at || latest?.created_at,
    };
  }

  private async getPullRequestDetail(owner: string, repo: string, number: number): Promise<GitHubPullDetailResponse> {
    const response = await this.request(`${this.apiUrl}/repos/${owner}/${repo}/pulls/${number}`);
    return response.json() as Promise<GitHubPullDetailResponse>;
  }

  private async getPullRequestReviews(owner: string, repo: string, number: number): Promise<GitHubReviewResponse[]> {
    const response = await this.request(`${this.apiUrl}/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`);
    return response.json() as Promise<GitHubReviewResponse[]>;
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
