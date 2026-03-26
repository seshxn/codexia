import { randomUUID } from 'node:crypto';

export type RepoSwitchJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type RepoSwitchJobPhase =
  | 'queued'
  | 'validating'
  | 'indexing'
  | 'graph'
  | 'semantic'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface RepoSwitchJobSnapshot {
  jobId: string;
  repoPath: string;
  status: RepoSwitchJobStatus;
  phase: RepoSwitchJobPhase;
  progress: number;
  message: string;
  repoRoot?: string;
  repoName?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface RepoSwitchJobUpdate {
  status?: RepoSwitchJobStatus;
  phase?: RepoSwitchJobPhase;
  progress?: number;
  message?: string;
}

export interface RepoSwitchJobResult {
  repoRoot: string;
  repoName: string;
}

export interface RepoSwitchJobHandle {
  update: (update: RepoSwitchJobUpdate) => void;
}

export class RepoSwitchJobManager {
  private readonly jobs = new Map<string, RepoSwitchJobSnapshot>();
  private readonly completions = new Map<string, Promise<void>>();
  private readonly ttlMs: number;

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  start(
    repoPath: string,
    runner: (job: RepoSwitchJobHandle) => Promise<RepoSwitchJobResult>,
  ): { jobId: string; completion: Promise<void> } {
    const jobId = randomUUID();
    const startedAt = new Date().toISOString();
    this.jobs.set(jobId, {
      jobId,
      repoPath,
      status: 'queued',
      phase: 'queued',
      progress: 0,
      message: 'Queued repository switch.',
      startedAt,
    });

    const handle: RepoSwitchJobHandle = {
      update: (update) => {
        const existing = this.jobs.get(jobId);
        if (!existing || existing.status === 'completed' || existing.status === 'failed') {
          return;
        }

        this.jobs.set(jobId, {
          ...existing,
          status: update.status || 'running',
          phase: update.phase || existing.phase,
          progress: update.progress ?? existing.progress,
          message: update.message || existing.message,
        });
      },
    };

    const completion = (async () => {
      try {
        handle.update({
          status: 'running',
          phase: 'validating',
          progress: 5,
          message: 'Validating repository.',
        });
        const result = await runner(handle);
        const completedAt = new Date().toISOString();
        const existing = this.jobs.get(jobId);
        if (!existing) {
          return;
        }
        this.jobs.set(jobId, {
          ...existing,
          status: 'completed',
          phase: 'completed',
          progress: 100,
          message: `Repository ${result.repoName} is ready.`,
          repoRoot: result.repoRoot,
          repoName: result.repoName,
          completedAt,
        });
      } catch (error) {
        const completedAt = new Date().toISOString();
        const existing = this.jobs.get(jobId);
        if (!existing) {
          return;
        }
        this.jobs.set(jobId, {
          ...existing,
          status: 'failed',
          phase: 'failed',
          message: 'Repository switch failed.',
          error: error instanceof Error ? error.message : 'Unknown repository switch failure.',
          completedAt,
        });
      } finally {
        setTimeout(() => {
          this.jobs.delete(jobId);
          this.completions.delete(jobId);
        }, this.ttlMs).unref?.();
      }
    })();

    this.completions.set(jobId, completion);
    return { jobId, completion };
  }

  get(jobId: string): RepoSwitchJobSnapshot | null {
    return this.jobs.get(jobId) || null;
  }

  async waitFor(jobId: string): Promise<RepoSwitchJobSnapshot | null> {
    const completion = this.completions.get(jobId);
    if (completion) {
      await completion;
    }
    return this.get(jobId);
  }
}
