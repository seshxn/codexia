import { describe, it, expect, beforeEach } from 'vitest';
import { GitAnalyzer } from './git-analyzer.js';

describe('GitAnalyzer', () => {
  let analyzer: GitAnalyzer;

  beforeEach(() => {
    analyzer = new GitAnalyzer(process.cwd());
  });

  it('should create an analyzer instance', () => {
    expect(analyzer).toBeDefined();
  });

  it('should return the repo root', () => {
    expect(analyzer.getRepoRoot()).toBe(process.cwd());
  });

  it('should detect if directory is a git repo', async () => {
    const isRepo = await analyzer.isGitRepo();
    expect(typeof isRepo).toBe('boolean');
  });

  it('should get changed files list', async () => {
    const files = await analyzer.getChangedFiles();
    expect(Array.isArray(files)).toBe(true);
  });

  it('should get staged files list', async () => {
    const files = await analyzer.getStagedFiles();
    expect(Array.isArray(files)).toBe(true);
  });
});
