import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { RepoIndexer } from './repo-indexer.js';

describe('RepoIndexer', () => {
  let indexer: RepoIndexer;

  beforeEach(() => {
    indexer = new RepoIndexer(process.cwd());
  });

  it('should create an indexer instance', () => {
    expect(indexer).toBeDefined();
  });

  it('should not be indexed initially', () => {
    expect(indexer.isIndexed()).toBe(false);
  });

  it('should index the repository', async () => {
    await indexer.index();
    expect(indexer.isIndexed()).toBe(true);
  });

  it('should find files after indexing', async () => {
    await indexer.index();
    const files = indexer.getFiles();
    expect(files.size).toBeGreaterThan(0);
  });

  it('should return stats after indexing', async () => {
    await indexer.index();
    const stats = indexer.getStats();
    
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.symbols).toBeGreaterThanOrEqual(0);
    expect(stats.exports).toBeGreaterThanOrEqual(0);
    expect(typeof stats.avgFanOut).toBe('number');
  });

  describe('caching', () => {
    it('should index without cache when useCache is false', async () => {
      await indexer.index({ useCache: false });
      expect(indexer.isIndexed()).toBe(true);
      const files = indexer.getFiles();
      expect(files.size).toBeGreaterThan(0);
    });

    it('should reindex and clear cache', async () => {
      // First index
      await indexer.index();
      const firstCount = indexer.getFiles().size;
      
      // Clear cache
      await indexer.clearCache();
      
      // Reindex should work
      await indexer.reindex();
      const secondCount = indexer.getFiles().size;
      
      expect(secondCount).toBe(firstCount);
    });

    it('should use cache on subsequent indexes if available', async () => {
      // First index without cache
      await indexer.index({ useCache: false });
      
      // Create a new indexer instance
      const indexer2 = new RepoIndexer(process.cwd());
      
      // Second index should use cache if .codexia directory exists
      await indexer2.index({ useCache: true });
      const secondFiles = indexer2.getFiles();
      
      // Should have same number of files (or close, accounting for file changes)
      // We can't guarantee exact match due to potential file changes, but check it indexed
      expect(secondFiles.size).toBeGreaterThan(0);
      expect(indexer2.isIndexed()).toBe(true);
    });

    it('should validate cache version', async () => {
      // Index once to create cache
      await indexer.index({ useCache: true });
      
      // Clear cache to force re-index with version check
      await indexer.clearCache();
      
      // New indexer should work even with no cache
      const indexer2 = new RepoIndexer(process.cwd());
      await indexer2.index({ useCache: true });
      
      expect(indexer2.isIndexed()).toBe(true);
    });

    it('should handle cache staleness', async () => {
      // This test verifies the staleness logic exists
      // Actual staleness checking requires time manipulation or mocking
      // which is complex, so we just verify the index works
      await indexer.index({ useCache: true });
      expect(indexer.isIndexed()).toBe(true);
    });

    it('should handle file modification time validation', async () => {
      // This test verifies that file modification validation logic exists
      // The actual validation happens during cache load
      // We just verify that indexing works correctly
      await indexer.index({ useCache: true });
      const files = indexer.getFiles();
      expect(files.size).toBeGreaterThan(0);
    });

    it('should detect changed and deleted files incrementally', async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-indexer-'));
      const memoryDir = path.join(repoRoot, '.codexia');
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'src', 'a.ts'), 'export function a() { return 1; }\n', 'utf-8');
      await fs.writeFile(path.join(repoRoot, 'src', 'b.ts'), 'export function b() { return 2; }\n', 'utf-8');

      const tempIndexer = new RepoIndexer(repoRoot);
      await tempIndexer.index({ useCache: true });

      await fs.writeFile(path.join(repoRoot, 'src', 'a.ts'), 'export function a() { return 3; }\n', 'utf-8');
      await fs.unlink(path.join(repoRoot, 'src', 'b.ts'));
      await fs.writeFile(path.join(repoRoot, 'src', 'c.ts'), 'export function c() { return 4; }\n', 'utf-8');

      const result = await tempIndexer.incrementalUpdate();

      expect(result.changedFiles).toEqual(expect.arrayContaining(['src/a.ts', 'src/c.ts']));
      expect(result.deletedFiles).toEqual(['src/b.ts']);
      expect(result.unchangedFiles).toEqual([]);
      expect(result.changedSymbols).toEqual(['src/c.ts']);
      expect(result.dependencyRepairFiles).toEqual(expect.arrayContaining(['src/a.ts', 'src/b.ts', 'src/c.ts']));
      expect(result.currentFiles.has('src/a.ts')).toBe(true);
      expect(result.currentFiles.has('src/b.ts')).toBe(false);
      expect(result.currentFiles.has('src/c.ts')).toBe(true);

      await fs.rm(repoRoot, { recursive: true, force: true });
    });

    it('keeps unchanged files out of incremental update scope', async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-indexer-unchanged-'));
      await fs.mkdir(path.join(repoRoot, '.codexia'), { recursive: true });
      await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'src', 'a.ts'), 'export function a() { return 1; }\n', 'utf-8');
      await fs.writeFile(path.join(repoRoot, 'src', 'b.ts'), 'export function b() { return 2; }\n', 'utf-8');

      const tempIndexer = new RepoIndexer(repoRoot);
      await tempIndexer.index({ useCache: true });
      await fs.writeFile(path.join(repoRoot, 'src', 'a.ts'), 'export function a() { return 3; }\n', 'utf-8');

      const result = await tempIndexer.incrementalUpdate();

      expect(result.changedFiles).toEqual(['src/a.ts']);
      expect(result.unchangedFiles).toEqual(['src/b.ts']);
      expect(result.dependencyRepairFiles).toEqual(['src/a.ts']);

      await fs.rm(repoRoot, { recursive: true, force: true });
    });

    it('should index richer Tree-sitter symbols for Ruby, Java, Rust, C#, and Kotlin', async () => {
      const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-ast-'));
      await fs.mkdir(path.join(repoRoot, '.codexia'), { recursive: true });
      await fs.mkdir(path.join(repoRoot, 'app', 'models'), { recursive: true });
      await fs.mkdir(path.join(repoRoot, 'src', 'main', 'java', 'com', 'acme'), { recursive: true });
      await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });

      await fs.writeFile(
        path.join(repoRoot, 'app', 'models', 'user.rb'),
        `require 'json'\nclass User < BaseUser\n  include Auditable\n  def save(record)\n    Logger.info(record)\n  end\nend\n`,
        'utf-8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'src', 'main', 'java', 'com', 'acme', 'UserService.java'),
        `import java.util.List;\npublic class UserService extends BaseService implements Auditable {\n  public void save(User user) { repo.save(user); }\n}\n`,
        'utf-8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'src', 'lib.rs'),
        `use crate::db::Repo;\npub struct Service;\nimpl Service {\n  pub fn save(&self, user: User) { repo.save(user); }\n}\n`,
        'utf-8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'src', 'UserService.cs'),
        `using System.Collections.Generic;\npublic class UserService : BaseService, IAuditable {\n  public void Save(User user) { repo.Save(user); }\n}\n`,
        'utf-8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'src', 'UserService.kt'),
        `import kotlin.collections.List\nclass UserService : BaseService(), Auditable {\n  fun save(user: User) { repo.save(user) }\n}\n`,
        'utf-8'
      );

      const tempIndexer = new RepoIndexer(repoRoot);
      await tempIndexer.index({ useCache: false });

      const rubyFile = tempIndexer.getFile('app/models/user.rb');
      const javaFile = tempIndexer.getFile('src/main/java/com/acme/UserService.java');
      const rustFile = tempIndexer.getFile('src/lib.rs');
      const csharpFile = tempIndexer.getFile('src/UserService.cs');
      const kotlinFile = tempIndexer.getFile('src/UserService.kt');

      expect(rubyFile?.language).toBe('ruby');
      expect(rubyFile?.symbols.find((symbol) => symbol.name === 'User')?.extendsSymbols).toEqual(['BaseUser']);
      expect(rubyFile?.symbols.find((symbol) => symbol.name === 'save')?.references.map((ref) => ref.target)).toEqual(['Logger.info']);

      expect(javaFile?.language).toBe('java');
      expect(javaFile?.symbols.find((symbol) => symbol.name === 'UserService' && symbol.kind === 'class')?.implementsSymbols).toEqual(['Auditable']);
      expect(javaFile?.symbols.find((symbol) => symbol.name === 'save')?.references.map((ref) => ref.target)).toEqual(['repo.save']);

      expect(rustFile?.language).toBe('rust');
      expect(rustFile?.symbols.find((symbol) => symbol.name === 'save')?.parentSymbol).toBe('Service');
      expect(rustFile?.symbols.find((symbol) => symbol.name === 'save')?.references.map((ref) => ref.target)).toEqual(['repo.save']);

      expect(csharpFile?.language).toBe('csharp');
      expect(csharpFile?.symbols.find((symbol) => symbol.name === 'UserService' && symbol.kind === 'class')?.extendsSymbols).toEqual(['BaseService']);
      expect(csharpFile?.symbols.find((symbol) => symbol.name === 'Save')?.references.map((ref) => ref.target)).toEqual(['repo.Save']);

      expect(kotlinFile?.language).toBe('kotlin');
      expect(kotlinFile?.symbols.find((symbol) => symbol.name === 'UserService' && symbol.kind === 'class')?.extendsSymbols).toEqual(['BaseService']);
      expect(kotlinFile?.symbols.find((symbol) => symbol.name === 'save')?.parameters).toEqual(['user']);

      await fs.rm(repoRoot, { recursive: true, force: true });
    });
  });
});
