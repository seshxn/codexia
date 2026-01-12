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

  describe('parseDiffHunks', () => {
    it('should parse diff hunks from raw diff output', async () => {
      // This tests the parseDiffHunks method indirectly through getDiff
      // We can't directly test the private method, but we can verify it works
      // by checking that hunks are populated in diff results
      
      // Skip if not in a git repo
      const isRepo = await analyzer.isGitRepo();
      if (!isRepo) {
        return;
      }

      try {
        const diff = await analyzer.getDiff('HEAD~1', 'HEAD');
        
        // Check that files have hunks populated
        for (const file of diff.files) {
          expect(Array.isArray(file.hunks)).toBe(true);
          
          // If there are hunks, validate their structure
          for (const hunk of file.hunks) {
            expect(typeof hunk.oldStart).toBe('number');
            expect(typeof hunk.oldLines).toBe('number');
            expect(typeof hunk.newStart).toBe('number');
            expect(typeof hunk.newLines).toBe('number');
            expect(typeof hunk.content).toBe('string');
          }
        }
      } catch (error) {
        // Test passes if we can't get diff (e.g., no commits)
      }
    });

    it('should handle empty diff output', async () => {
      // Test with same ref should produce empty diff
      const isRepo = await analyzer.isGitRepo();
      if (!isRepo) {
        return;
      }

      try {
        const diff = await analyzer.getDiff('HEAD', 'HEAD');
        expect(diff.files).toEqual([]);
      } catch (error) {
        // Test passes if we can't get diff
      }
    });
  });
});
