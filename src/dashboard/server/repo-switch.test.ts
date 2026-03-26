import { describe, expect, it } from 'vitest';
import { RepoSwitchJobManager } from './repo-switch.js';

describe('RepoSwitchJobManager', () => {
  it('tracks successful job progress through completion', async () => {
    const jobs = new RepoSwitchJobManager();

    const { jobId } = jobs.start('/repos/large-repo', async (job) => {
      job.update({
        phase: 'validating',
        progress: 10,
        message: 'Checking repository path',
      });
      job.update({
        phase: 'indexing',
        progress: 55,
        message: 'Indexing repository',
      });

      return {
        repoRoot: '/repos/large-repo',
        repoName: 'large-repo',
      };
    });

    const snapshot = await jobs.waitFor(jobId);
    expect(snapshot).toMatchObject({
      jobId,
      repoPath: '/repos/large-repo',
      status: 'completed',
      phase: 'completed',
      progress: 100,
      repoRoot: '/repos/large-repo',
      repoName: 'large-repo',
    });
    expect(snapshot?.message).toMatch(/ready/i);
  });

  it('records job failures without losing the failure message', async () => {
    const jobs = new RepoSwitchJobManager();

    const { jobId } = jobs.start('/repos/missing-repo', async (job) => {
      job.update({
        phase: 'validating',
        progress: 10,
        message: 'Checking repository path',
      });
      throw new Error('Repository path does not exist.');
    });

    const snapshot = await jobs.waitFor(jobId);
    expect(snapshot).toMatchObject({
      jobId,
      repoPath: '/repos/missing-repo',
      status: 'failed',
      phase: 'failed',
      progress: 10,
      error: 'Repository path does not exist.',
    });
  });
});
