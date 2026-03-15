import { simpleGit, SimpleGit } from 'simple-git';
import type { 
  GitDiff, 
  DiffFile, 
  DiffStats, 
  DiffHunk,
  FileHistory, 
  CommitInfo, 
  AuthorStats,
  CommitRecord,
  CommitFileChange,
} from './types.js';

export class GitAnalyzer {
  private git: SimpleGit;
  private repoRoot: string;

  constructor(repoPath: string) {
    this.repoRoot = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * Get the repository root path
   */
  getRepoRoot(): string {
    return this.repoRoot;
  }

  /**
   * Check if this is a valid git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a git ref exists
   */
  async hasRef(ref: string): Promise<boolean> {
    try {
      await this.git.revparse([ref]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'HEAD';
  }

  /**
   * Get the current HEAD commit hash.
   */
  async getHeadCommit(): Promise<string | undefined> {
    try {
      const hash = await this.git.revparse(['HEAD']);
      return hash.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get diff between two refs
   */
  async getDiff(base: string = 'HEAD', head: string = ''): Promise<GitDiff> {
    const diffSummary = await this.git.diffSummary([base, head].filter(Boolean));
    
    // Get raw diff output for hunk parsing
    const rawDiff = await this.git.diff([base, head].filter(Boolean));
    const fileHunks = this.parseDiffHunks(rawDiff);
    
    const files: DiffFile[] = diffSummary.files.map(file => {
      const filePath = 'file' in file ? (file as { file: string }).file : '';
      return {
        path: filePath,
        status: this.getFileStatus(file),
        additions: 'insertions' in file ? (file as { insertions: number }).insertions : 0,
        deletions: 'deletions' in file ? (file as { deletions: number }).deletions : 0,
        hunks: fileHunks.get(filePath) || [],
      };
    });

    const stats: DiffStats = {
      files: diffSummary.files.length,
      additions: diffSummary.insertions,
      deletions: diffSummary.deletions,
    };

    return { files, stats, base, head: head || 'working tree' };
  }

  /**
   * Get diff for staged changes
   */
  async getStagedDiff(): Promise<GitDiff> {
    const diffSummary = await this.git.diffSummary(['--staged']);
    
    // Get raw diff output for hunk parsing
    const rawDiff = await this.git.diff(['--staged']);
    const fileHunks = this.parseDiffHunks(rawDiff);
    
    const files: DiffFile[] = diffSummary.files.map(file => {
      const filePath = 'file' in file ? (file as { file: string }).file : '';
      return {
        path: filePath,
        status: this.getFileStatus(file),
        additions: 'insertions' in file ? (file as { insertions: number }).insertions : 0,
        deletions: 'deletions' in file ? (file as { deletions: number }).deletions : 0,
        hunks: fileHunks.get(filePath) || [],
      };
    });

    const stats: DiffStats = {
      files: diffSummary.files.length,
      additions: diffSummary.insertions,
      deletions: diffSummary.deletions,
    };

    return { files, stats, base: 'HEAD', head: 'staged' };
  }

  /**
   * Get file history
   */
  async getFileHistory(filePath: string, maxCommits: number = 50): Promise<FileHistory> {
    const log = await this.git.log({
      file: filePath,
      maxCount: maxCommits,
    });

    const commits: CommitInfo[] = log.all.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      author: commit.author_name,
      date: new Date(commit.date),
      files: [filePath],
    }));

    const authorMap = new Map<string, AuthorStats>();
    for (const commit of log.all) {
      const key = commit.author_email;
      const existing = authorMap.get(key);
      if (existing) {
        existing.commits++;
      } else {
        authorMap.set(key, {
          name: commit.author_name,
          email: commit.author_email,
          commits: 1,
          additions: 0,
          deletions: 0,
        });
      }
    }

    const lastCommit = commits[0];
    const firstCommit = commits[commits.length - 1];
    const daysBetween = lastCommit && firstCommit
      ? (lastCommit.date.getTime() - firstCommit.date.getTime()) / (1000 * 60 * 60 * 24)
      : 1;
    const changeFrequency = commits.length / Math.max(daysBetween, 1);

    return {
      path: filePath,
      commits,
      authors: Array.from(authorMap.values()),
      changeFrequency,
      lastModified: lastCommit?.date || new Date(),
    };
  }

  /**
   * Get commits that touched the same files
   */
  async findRelatedCommits(filePaths: string[], maxCommits: number = 20): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];
    const seen = new Set<string>();

    for (const filePath of filePaths) {
      try {
        const log = await this.git.log({
          file: filePath,
          maxCount: Math.ceil(maxCommits / filePaths.length),
        });

        for (const commit of log.all) {
          if (!seen.has(commit.hash)) {
            seen.add(commit.hash);
            commits.push({
              hash: commit.hash,
              message: commit.message,
              author: commit.author_name,
              date: new Date(commit.date),
              files: [filePath],
            });
          }
        }
      } catch {
        // Skip files with no history
      }
    }

    return commits
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, maxCommits);
  }

  /**
   * Get list of changed files in working directory
   */
  async getChangedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
    ];
  }

  /**
   * Get list of staged files
   */
  async getStagedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return status.staged;
  }

  /**
   * Get all files changed by a commit.
   */
  async getFilesForCommit(commitSha: string): Promise<string[]> {
    try {
      const output = await this.git.show([commitSha, '--name-only', '--pretty=format:']);
      return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get the subject line for a commit.
   */
  async getCommitMessage(commitSha: string): Promise<string | undefined> {
    try {
      const output = await this.git.show([commitSha, '--format=%s', '--no-patch']);
      return output.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Find files that tend to change with a given file by scanning recent commits.
   */
  async getCoChangedFiles(filePath: string, maxCommits: number = 50): Promise<Array<{
    path: string;
    coChangeCount: number;
    coChangeRatio: number;
  }>> {
    try {
      const log = await this.git.log({
        file: filePath,
        maxCount: maxCommits,
      });

      if (log.all.length === 0) {
        return [];
      }

      const counts = new Map<string, number>();
      for (const commit of log.all) {
        const files = await this.getFilesForCommit(commit.hash);
        for (const file of files) {
          if (file === filePath) {
            continue;
          }

          counts.set(file, (counts.get(file) || 0) + 1);
        }
      }

      return Array.from(counts.entries())
        .map(([path, coChangeCount]) => ({
          path,
          coChangeCount,
          coChangeRatio: coChangeCount / log.all.length,
        }))
        .sort((a, b) => b.coChangeRatio - a.coChangeRatio || b.coChangeCount - a.coChangeCount);
    } catch {
      return [];
    }
  }

  /**
   * Return recent commits with file and hunk metadata.
   */
  async getRecentCommits(maxCount: number = 200): Promise<CommitRecord[]> {
    const log = await this.git.log({ maxCount });
    const commits: CommitRecord[] = [];

    for (const commit of log.all) {
      const files = await this.getFilesForCommit(commit.hash);
      const body = await this.getCommitBody(commit.hash);
      const changes = await this.getCommitChanges(commit.hash);
      const revertsSha = body.match(/This reverts commit\s+([a-f0-9]{7,40})/i)?.[1];
      const parentLine = await this.git.show([commit.hash, '--format=%P', '--no-patch']);
      const parents = parentLine.trim().split(/\s+/).filter(Boolean);

      commits.push({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: new Date(commit.date),
        files,
        isMerge: parents.length > 1,
        isRevert: /^revert\b/i.test(commit.message) || Boolean(revertsSha),
        revertsSha,
        changes,
      });
    }

    return commits;
  }

  /**
   * Get line-level changes for a specific commit.
   */
  async getCommitChanges(commitSha: string): Promise<CommitFileChange[]> {
    try {
      const diffSummary = await this.git.diffSummary([`${commitSha}^!`]);
      const rawDiff = await this.git.show([commitSha, '--format=', '--unified=0']);
      const fileHunks = this.parseDiffHunks(rawDiff);

      return diffSummary.files.map((file) => {
        const filePath = 'file' in file ? (file as { file: string }).file : '';
        return {
          path: filePath,
          additions: 'insertions' in file ? (file as { insertions: number }).insertions : 0,
          deletions: 'deletions' in file ? (file as { deletions: number }).deletions : 0,
          hunks: fileHunks.get(filePath) || [],
        };
      });
    } catch {
      return [];
    }
  }

  private async getCommitBody(commitSha: string): Promise<string> {
    try {
      return await this.git.show([commitSha, '--format=%B', '--no-patch']);
    } catch {
      return '';
    }
  }

  private getFileStatus(file: unknown): 'added' | 'modified' | 'deleted' | 'renamed' {
    const fileObj = file as { file?: string };
    if (!fileObj.file) return 'modified';
    
    // Simple heuristic based on insertions/deletions
    const f = file as { insertions?: number; deletions?: number; binary?: boolean };
    if (f.binary) return 'modified';
    if (f.insertions && !f.deletions) return 'added';
    if (!f.insertions && f.deletions) return 'deleted';
    return 'modified';
  }

  /**
   * Parse unified diff output into hunks per file
   */
  private parseDiffHunks(rawDiff: string): Map<string, DiffHunk[]> {
    const fileHunks = new Map<string, DiffHunk[]>();
    
    if (!rawDiff) return fileHunks;

    let currentFile: string | null = null;
    let currentHunk: DiffHunk | null = null;
    const lines = rawDiff.split('\n');

    for (const line of lines) {
      // Match file header: diff --git a/path b/path
      const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (fileMatch) {
        currentFile = fileMatch[2];
        if (!fileHunks.has(currentFile)) {
          fileHunks.set(currentFile, []);
        }
        currentHunk = null;
        continue;
      }

      // Match hunk header: @@ -oldStart,oldLines +newStart,newLines @@
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (hunkMatch && currentFile) {
        currentHunk = {
          oldStart: parseInt(hunkMatch[1], 10),
          oldLines: parseInt(hunkMatch[2] || '1', 10),
          newStart: parseInt(hunkMatch[3], 10),
          newLines: parseInt(hunkMatch[4] || '1', 10),
          content: hunkMatch[5] ? hunkMatch[5].trim() + '\n' : '',
        };
        fileHunks.get(currentFile)!.push(currentHunk);
        continue;
      }

      // Accumulate hunk content (context, additions, deletions)
      if (currentHunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
        currentHunk.content += line + '\n';
      }
    }

    return fileHunks;
  }
}
