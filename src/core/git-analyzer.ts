import { simpleGit, SimpleGit } from 'simple-git';
import type { 
  GitDiff, 
  DiffFile, 
  DiffStats, 
  FileHistory, 
  CommitInfo, 
  AuthorStats 
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
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'HEAD';
  }

  /**
   * Get diff between two refs
   */
  async getDiff(base: string = 'HEAD', head: string = ''): Promise<GitDiff> {
    const diffSummary = await this.git.diffSummary([base, head].filter(Boolean));
    
    const files: DiffFile[] = diffSummary.files.map(file => {
      const filePath = 'file' in file ? (file as { file: string }).file : '';
      return {
        path: filePath,
        status: this.getFileStatus(file),
        additions: 'insertions' in file ? (file as { insertions: number }).insertions : 0,
        deletions: 'deletions' in file ? (file as { deletions: number }).deletions : 0,
        hunks: [],
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
    
    const files: DiffFile[] = diffSummary.files.map(file => {
      const filePath = 'file' in file ? (file as { file: string }).file : '';
      return {
        path: filePath,
        status: this.getFileStatus(file),
        additions: 'insertions' in file ? (file as { insertions: number }).insertions : 0,
        deletions: 'deletions' in file ? (file as { deletions: number }).deletions : 0,
        hunks: [],
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
}
