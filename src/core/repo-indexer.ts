import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import type { FileInfo, ImportInfo, ExportInfo, Symbol, SymbolKind } from './types.js';
import { getLanguageRegistry, type LanguageProviderRegistry } from './language-providers/index.js';

interface CacheMetadata {
  version: string;
  timestamp: number;
  fileCount: number;
}

interface CachedFileInfo {
  info: FileInfo;
  mtime: number; // File modification time in milliseconds
}

interface IndexCache {
  metadata: CacheMetadata;
  files: Record<string, CachedFileInfo>;
}

const CACHE_VERSION = '1.0.0';
const CACHE_DIR = '.codexia';
const CACHE_FILE = 'index-cache.json';
const CACHE_STALENESS_MS = parseInt(process.env.CODEXIA_CACHE_STALENESS_MS || '3600000', 10); // Default: 1 hour

export class RepoIndexer {
  private repoRoot: string;
  private files: Map<string, FileInfo> = new Map();
  private indexed: boolean = false;
  private languageRegistry: LanguageProviderRegistry;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.languageRegistry = getLanguageRegistry();
  }

  /**
   * Index the repository (with optional caching)
   */
  async index(options: { useCache?: boolean } = {}): Promise<void> {
    const { useCache = true } = options;

    if (useCache) {
      const cached = await this.loadCache();
      if (cached) {
        // Extract FileInfo from CachedFileInfo
        const filesMap = new Map<string, FileInfo>();
        for (const [key, cachedFile] of Object.entries(cached.files)) {
          filesMap.set(key, cachedFile.info);
        }
        this.files = filesMap;
        this.indexed = true;
        return;
      }
    }

    await this.performIndex();

    if (useCache) {
      await this.saveCache();
    }
  }

  /**
   * Force re-index without using cache
   */
  async reindex(): Promise<void> {
    await this.performIndex();
    await this.saveCache();
  }

  /**
   * Clear the index cache
   */
  async clearCache(): Promise<void> {
    const cachePath = path.join(this.repoRoot, CACHE_DIR, CACHE_FILE);
    try {
      await fs.unlink(cachePath);
    } catch {
      // Cache file doesn't exist, nothing to clear
    }
  }

  private async performIndex(): Promise<void> {
    this.files.clear();
    
    // Get patterns from all registered language providers
    const patterns = this.languageRegistry.getAllPatterns();

    // Get common ignore patterns
    const ignorePatterns = this.languageRegistry.getIgnorePatterns();

    const filePaths = await glob(patterns, {
      cwd: this.repoRoot,
      ignore: ignorePatterns,
      absolute: false,
    });

    for (const relativePath of filePaths) {
      const absolutePath = path.join(this.repoRoot, relativePath);
      try {
        const content = await fs.readFile(absolutePath, 'utf-8');
        const fileInfo = this.analyzeFile(relativePath, content);
        this.files.set(relativePath, fileInfo);
      } catch {
        // Skip files that can't be read
      }
    }

    this.indexed = true;
  }

  /**
   * Load index from cache file
   */
  private async loadCache(): Promise<IndexCache | null> {
    const cachePath = path.join(this.repoRoot, CACHE_DIR, CACHE_FILE);
    
    try {
      const content = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(content) as IndexCache;
      
      // Validate cache version
      if (cache.metadata.version !== CACHE_VERSION) {
        return null;
      }
      
      // Check if cache is stale (default: 1 hour, configurable via CODEXIA_CACHE_STALENESS_MS)
      if (Date.now() - cache.metadata.timestamp > CACHE_STALENESS_MS) {
        return null;
      }
      
      // Validate that cached files still exist and haven't been modified
      for (const [relativePath, cachedFile] of Object.entries(cache.files)) {
        const absolutePath = path.join(this.repoRoot, relativePath);
        try {
          const stats = await fs.stat(absolutePath);
          // If file has been modified since caching, invalidate entire cache
          if (stats.mtimeMs > cachedFile.mtime) {
            return null;
          }
        } catch {
          // File no longer exists, invalidate cache
          return null;
        }
      }
      
      return cache;
    } catch {
      return null;
    }
  }

  /**
   * Save index to cache file (only if .codexia directory exists)
   */
  private async saveCache(): Promise<void> {
    const cacheDir = path.join(this.repoRoot, CACHE_DIR);
    const cachePath = path.join(cacheDir, CACHE_FILE);
    
    try {
      // Only save cache if .codexia directory already exists
      // (i.e., user has run `codexia init`)
      await fs.access(cacheDir);
    } catch {
      // .codexia directory doesn't exist, skip caching
      return;
    }
    
    try {
      const filesObj: Record<string, CachedFileInfo> = {};
      for (const [key, value] of this.files) {
        const absolutePath = path.join(this.repoRoot, key);
        try {
          const stats = await fs.stat(absolutePath);
          filesObj[key] = {
            info: value,
            mtime: stats.mtimeMs,
          };
        } catch {
          // Skip files that can't be accessed
        }
      }
      
      const cache: IndexCache = {
        metadata: {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          fileCount: this.files.size,
        },
        files: filesObj,
      };
      
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // Silently fail if we can't write cache
    }
  }

  /**
   * Get all indexed files
   */
  getFiles(): Map<string, FileInfo> {
    return this.files;
  }

  /**
   * Get file info by path
   */
  getFile(filePath: string): FileInfo | undefined {
    return this.files.get(filePath);
  }

  /**
   * Check if repository has been indexed
   */
  isIndexed(): boolean {
    return this.indexed;
  }

  /**
   * Get statistics about the indexed repository
   */
  getStats(): { files: number; symbols: number; exports: number; avgFanOut: number } {
    let totalSymbols = 0;
    let totalExports = 0;
    let totalImports = 0;

    for (const file of this.files.values()) {
      totalSymbols += file.symbols.length;
      totalExports += file.exports.length;
      totalImports += file.imports.length;
    }

    const avgFanOut = this.files.size > 0 ? totalImports / this.files.size : 0;

    return {
      files: this.files.size,
      symbols: totalSymbols,
      exports: totalExports,
      avgFanOut: Math.round(avgFanOut * 10) / 10,
    };
  }

  private analyzeFile(relativePath: string, content: string): FileInfo {
    const lines = content.split('\n');
    const provider = this.languageRegistry.getForFile(relativePath);
    
    // Use language provider if available, otherwise use legacy extraction
    const language = provider ? provider.getLanguageName(path.extname(relativePath)) : this.getLanguageLegacy(relativePath);
    const imports = provider ? provider.extractImports(content, relativePath) : this.extractImportsLegacy(content);
    const exports = provider ? provider.extractExports(content, relativePath) : this.extractExportsLegacy(content);
    const symbols = provider ? provider.extractSymbols(content, relativePath) : this.extractSymbolsLegacy(content, relativePath);

    return {
      path: path.join(this.repoRoot, relativePath),
      relativePath,
      language,
      size: content.length,
      lines: lines.length,
      symbols,
      imports,
      exports,
    };
  }

  /**
   * Get the language registry for external use
   */
  getLanguageRegistry(): LanguageProviderRegistry {
    return this.languageRegistry;
  }

  // Legacy methods for backward compatibility with unsupported languages
  private getLanguageLegacy(filePath: string): string {
    const ext = path.extname(filePath);
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
    };
    return langMap[ext] || 'unknown';
  }

  private extractImportsLegacy(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    const lines = content.split('\n');

    const importRegex = /^import\s+(?:(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))(?:\s*,\s*)?)*\s*from\s*['"]([^'"]+)['"]/;
    const defaultImportRegex = /^import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      const match = trimmed.match(importRegex);
      if (match) {
        const specifiers: string[] = [];
        let isDefault = false;
        let isNamespace = false;

        if (match[1]) {
          const named = match[1].replace(/[{}]/g, '').split(',').map(s => s.trim());
          specifiers.push(...named);
        }
        if (match[2]) {
          isNamespace = true;
          specifiers.push(match[2].replace('* as ', '').trim());
        }
        if (match[3]) {
          isDefault = true;
          specifiers.push(match[3]);
        }

        imports.push({
          source: match[4],
          specifiers,
          isDefault,
          isNamespace,
          line: index + 1,
        });
        return;
      }

      const defaultMatch = trimmed.match(defaultImportRegex);
      if (defaultMatch) {
        imports.push({
          source: defaultMatch[2],
          specifiers: [defaultMatch[1]],
          isDefault: true,
          isNamespace: false,
          line: index + 1,
        });
      }
    });

    return imports;
  }

  private extractExportsLegacy(content: string): ExportInfo[] {
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    const patterns: Array<{ regex: RegExp; kind: SymbolKind; isDefault: boolean }> = [
      { regex: /^export\s+default\s+class\s+(\w+)/, kind: 'class', isDefault: true },
      { regex: /^export\s+default\s+function\s+(\w+)/, kind: 'function', isDefault: true },
      { regex: /^export\s+class\s+(\w+)/, kind: 'class', isDefault: false },
      { regex: /^export\s+interface\s+(\w+)/, kind: 'interface', isDefault: false },
      { regex: /^export\s+type\s+(\w+)/, kind: 'type', isDefault: false },
      { regex: /^export\s+function\s+(\w+)/, kind: 'function', isDefault: false },
      { regex: /^export\s+const\s+(\w+)/, kind: 'variable', isDefault: false },
      { regex: /^export\s+let\s+(\w+)/, kind: 'variable', isDefault: false },
      { regex: /^export\s+enum\s+(\w+)/, kind: 'enum', isDefault: false },
    ];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      for (const { regex, kind, isDefault } of patterns) {
        const match = trimmed.match(regex);
        if (match) {
          exports.push({
            name: match[1],
            kind,
            isDefault,
            line: index + 1,
          });
          break;
        }
      }
    });

    return exports;
  }

  private extractSymbolsLegacy(content: string, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];
    const lines = content.split('\n');

    const patterns: Array<{ regex: RegExp; kind: SymbolKind }> = [
      { regex: /^(?:export\s+)?class\s+(\w+)/, kind: 'class' },
      { regex: /^(?:export\s+)?interface\s+(\w+)/, kind: 'interface' },
      { regex: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: 'type' },
      { regex: /^(?:export\s+)?function\s+(\w+)/, kind: 'function' },
      { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])*=>/, kind: 'function' },
      { regex: /^(?:export\s+)?const\s+(\w+)/, kind: 'variable' },
      { regex: /^(?:export\s+)?let\s+(\w+)/, kind: 'variable' },
      { regex: /^(?:export\s+)?enum\s+(\w+)/, kind: 'enum' },
      { regex: /^\s+(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/, kind: 'method' },
    ];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      for (const { regex, kind } of patterns) {
        const match = trimmed.match(regex);
        if (match && match[1] && !match[1].startsWith('_')) {
          const isExported = trimmed.startsWith('export');
          symbols.push({
            name: match[1],
            kind,
            filePath,
            line: index + 1,
            column: line.indexOf(match[1]) + 1,
            exported: isExported,
            references: [],
          });
          break;
        }
      }
    });

    return symbols;
  }
}
