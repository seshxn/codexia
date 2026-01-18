import type { Symbol, ImportInfo, ExportInfo } from '../types.js';

// ============================================================================
// Language Provider Types
// ============================================================================

export interface CommentPatterns {
  singleLine: RegExp;
  blockStart: RegExp;
  blockEnd: RegExp;
}

export interface LanguageProvider {
  /** Unique identifier (e.g., 'typescript', 'python', 'go') */
  id: string;

  /** Display name */
  name: string;

  /** File extensions this provider handles (e.g., ['.ts', '.tsx']) */
  extensions: string[];

  /** Glob patterns for file discovery */
  filePatterns: string[];

  /** Extract imports from source code */
  extractImports(content: string, filePath: string): ImportInfo[];

  /** Extract exports from source code */
  extractExports(content: string, filePath: string): ExportInfo[];

  /** Extract symbols (classes, functions, etc.) */
  extractSymbols(content: string, filePath: string): Symbol[];

  /** Resolve import path to actual file path */
  resolveImportPath(
    fromPath: string,
    importSource: string,
    existingFiles: Set<string>
  ): string | null;

  /** Get control flow patterns for cyclomatic complexity */
  getControlFlowPatterns(): RegExp[];

  /** Get comment patterns */
  getCommentPatterns(): CommentPatterns;

  /** Get patterns for detecting entry points (APIs, routes, etc.) */
  getEntryPointPatterns(): RegExp[];

  /** Map file extension to language name */
  getLanguageName(ext: string): string;
}

// ============================================================================
// Base Provider with shared utilities
// ============================================================================

export abstract class BaseLanguageProvider implements LanguageProvider {
  abstract id: string;
  abstract name: string;
  abstract extensions: string[];
  abstract filePatterns: string[];

  abstract extractImports(content: string, filePath: string): ImportInfo[];
  abstract extractExports(content: string, filePath: string): ExportInfo[];
  abstract extractSymbols(content: string, filePath: string): Symbol[];
  abstract resolveImportPath(
    fromPath: string,
    importSource: string,
    existingFiles: Set<string>
  ): string | null;
  abstract getControlFlowPatterns(): RegExp[];
  abstract getCommentPatterns(): CommentPatterns;
  abstract getEntryPointPatterns(): RegExp[];

  getLanguageName(_ext: string): string {
    return this.name;
  }

  /**
   * Utility: Count lines in content
   */
  protected countLines(content: string, upToIndex: number): number {
    return content.slice(0, upToIndex).split('\n').length;
  }

  /**
   * Utility: Check if position is inside a comment or string
   */
  protected isInCommentOrString(content: string, index: number): boolean {
    // Simple heuristic - can be overridden by specific providers
    const lineStart = content.lastIndexOf('\n', index) + 1;
    const lineContent = content.slice(lineStart, index);
    
    // Check for single-line comment
    const patterns = this.getCommentPatterns();
    if (patterns.singleLine.test(lineContent)) {
      return true;
    }

    return false;
  }
}
