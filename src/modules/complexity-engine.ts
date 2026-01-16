import type { Symbol, FileInfo } from '../core/types.js';

// ============================================================================
// Complexity Metrics Types
// ============================================================================

export interface ComplexityScore {
  overall: number;           // 0-100 composite score
  cyclomatic: number;        // Control flow complexity
  cognitive: number;         // Human readability difficulty  
  coupling: number;          // Dependencies in/out
  cohesion: number;          // How related are internal symbols (0-1)
  abstractness: number;      // Interface vs implementation ratio (0-1)
  instability: number;       // Ratio of outgoing to total dependencies (0-1)
  maintainabilityIndex: number; // Classic maintainability index
}

export interface FileComplexity {
  path: string;
  score: ComplexityScore;
  symbols: SymbolComplexity[];
  metrics: DetailedMetrics;
}

export interface SymbolComplexity {
  name: string;
  kind: string;
  cyclomatic: number;
  cognitive: number;
  linesOfCode: number;
  parameters: number;
  dependencies: number;
}

export interface DetailedMetrics {
  linesOfCode: number;
  logicalLines: number;
  commentLines: number;
  blankLines: number;
  commentRatio: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
  maxNestingDepth: number;
  parameterCount: number;
  returnStatements: number;
}

// ============================================================================
// Complexity Engine
// ============================================================================

export class ComplexityEngine {
  /**
   * Analyze complexity of a single file
   */
  analyzeFile(fileInfo: FileInfo, content: string): FileComplexity {
    const metrics = this.calculateDetailedMetrics(content);
    const symbolComplexities = this.analyzeSymbols(fileInfo.symbols, content);
    const score = this.calculateScore(fileInfo, metrics, symbolComplexities);

    return {
      path: fileInfo.relativePath,
      score,
      symbols: symbolComplexities,
      metrics,
    };
  }

  /**
   * Analyze complexity across all files
   */
  analyzeAll(
    files: Map<string, FileInfo>,
    contents: Map<string, string>,
    dependencyInfo: Map<string, { imports: number; importedBy: number }>
  ): Map<string, FileComplexity> {
    const results = new Map<string, FileComplexity>();

    for (const [path, fileInfo] of files) {
      const content = contents.get(path) || '';
      const complexity = this.analyzeFile(fileInfo, content);
      
      // Add coupling metrics from dependency info
      const deps = dependencyInfo.get(path);
      if (deps) {
        const totalDeps = deps.imports + deps.importedBy;
        complexity.score.coupling = Math.min(100, (deps.imports + deps.importedBy) * 5);
        complexity.score.instability = totalDeps > 0 
          ? deps.imports / totalDeps 
          : 0;
      }

      results.set(path, complexity);
    }

    return results;
  }

  /**
   * Calculate detailed code metrics
   */
  private calculateDetailedMetrics(content: string): DetailedMetrics {
    const lines = content.split('\n');
    
    let logicalLines = 0;
    let commentLines = 0;
    let blankLines = 0;
    let inBlockComment = false;
    let maxNestingDepth = 0;
    let currentNesting = 0;
    let returnStatements = 0;
    let parameterCount = 0;

    const functionLengths: number[] = [];
    let currentFunctionStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Blank line
      if (line === '') {
        blankLines++;
        continue;
      }

      // Block comment handling
      if (line.startsWith('/*')) {
        inBlockComment = true;
        commentLines++;
        if (line.includes('*/')) inBlockComment = false;
        continue;
      }
      if (inBlockComment) {
        commentLines++;
        if (line.includes('*/')) inBlockComment = false;
        continue;
      }

      // Single line comment
      if (line.startsWith('//')) {
        commentLines++;
        continue;
      }

      // Logical line
      logicalLines++;

      // Nesting depth tracking
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      currentNesting += openBraces - closeBraces;
      maxNestingDepth = Math.max(maxNestingDepth, currentNesting);

      // Return statements
      if (/\breturn\b/.test(line)) {
        returnStatements++;
      }

      // Function/method detection
      if (/\b(function|async function|\w+\s*\(.*\)\s*[:{]|=>\s*{?)/.test(line)) {
        if (currentFunctionStart >= 0) {
          functionLengths.push(i - currentFunctionStart);
        }
        currentFunctionStart = i;
        
        // Count parameters
        const paramMatch = line.match(/\(([^)]*)\)/);
        if (paramMatch) {
          const params = paramMatch[1].split(',').filter(p => p.trim());
          parameterCount += params.length;
        }
      }
    }

    // Close last function
    if (currentFunctionStart >= 0) {
      functionLengths.push(lines.length - currentFunctionStart);
    }

    const avgFunctionLength = functionLengths.length > 0
      ? functionLengths.reduce((a, b) => a + b, 0) / functionLengths.length
      : 0;

    const maxFunctionLength = functionLengths.length > 0
      ? Math.max(...functionLengths)
      : 0;

    return {
      linesOfCode: lines.length,
      logicalLines,
      commentLines,
      blankLines,
      commentRatio: lines.length > 0 ? commentLines / lines.length : 0,
      avgFunctionLength,
      maxFunctionLength,
      maxNestingDepth,
      parameterCount,
      returnStatements,
    };
  }

  /**
   * Analyze complexity of individual symbols
   */
  private analyzeSymbols(symbols: Symbol[], content: string): SymbolComplexity[] {
    const results: SymbolComplexity[] = [];
    const lines = content.split('\n');

    for (const symbol of symbols) {
      // Estimate symbol boundaries (simplified)
      const startLine = symbol.line - 1;
      let endLine = startLine;
      let braceCount = 0;
      let started = false;

      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            started = true;
          } else if (char === '}') {
            braceCount--;
            if (started && braceCount === 0) {
              endLine = i;
              break;
            }
          }
        }
        if (started && braceCount === 0) break;
      }

      const symbolContent = lines.slice(startLine, endLine + 1).join('\n');
      
      results.push({
        name: symbol.name,
        kind: symbol.kind,
        cyclomatic: this.calculateCyclomaticComplexity(symbolContent),
        cognitive: this.calculateCognitiveComplexity(symbolContent),
        linesOfCode: endLine - startLine + 1,
        parameters: this.countParameters(symbolContent),
        dependencies: symbol.references?.length || 0,
      });
    }

    return results;
  }

  /**
   * Calculate cyclomatic complexity (decision points + 1)
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1;

    // Control flow keywords
    const patterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bdo\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\?/g,          // Nullish coalescing
      /\?\./g,          // Optional chaining
      /\|\|/g,          // Logical OR
      /&&/g,            // Logical AND
      /\?[^:]/g,        // Ternary (not TS type)
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Calculate cognitive complexity (human-centric complexity)
   */
  private calculateCognitiveComplexity(code: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Increment for nesting
      if (/\b(if|else|for|while|switch|try|catch)\b/.test(trimmed)) {
        complexity += 1 + nestingLevel; // Base + nesting penalty
      }

      // Break/continue with labels add complexity
      if (/\b(break|continue)\s+\w+/.test(trimmed)) {
        complexity += 1;
      }

      // Recursion is complex
      if (/\bthis\.\w+\(/.test(trimmed) || /\brecurs/.test(trimmed)) {
        complexity += 1;
      }

      // Track nesting
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;
      nestingLevel = Math.max(0, nestingLevel + opens - closes);
    }

    return complexity;
  }

  /**
   * Count function parameters
   */
  private countParameters(code: string): number {
    const firstLine = code.split('\n')[0];
    const match = firstLine.match(/\(([^)]*)\)/);
    if (!match) return 0;
    
    const params = match[1].split(',').filter(p => p.trim());
    return params.length;
  }

  /**
   * Calculate overall complexity score
   */
  private calculateScore(
    fileInfo: FileInfo,
    metrics: DetailedMetrics,
    symbolComplexities: SymbolComplexity[]
  ): ComplexityScore {
    // Calculate averages
    const avgCyclomatic = symbolComplexities.length > 0
      ? symbolComplexities.reduce((sum, s) => sum + s.cyclomatic, 0) / symbolComplexities.length
      : 0;

    const avgCognitive = symbolComplexities.length > 0
      ? symbolComplexities.reduce((sum, s) => sum + s.cognitive, 0) / symbolComplexities.length
      : 0;

    // Abstractness: ratio of interfaces/types to classes/functions
    const abstractSymbols = fileInfo.symbols.filter(s => 
      s.kind === 'interface' || s.kind === 'type'
    ).length;
    const concreteSymbols = fileInfo.symbols.filter(s => 
      s.kind === 'class' || s.kind === 'function'
    ).length;
    const abstractness = (abstractSymbols + concreteSymbols) > 0
      ? abstractSymbols / (abstractSymbols + concreteSymbols)
      : 0;

    // Cohesion: simplified - based on how many symbols reference each other
    // Lower exports relative to total symbols suggests higher cohesion
    const cohesion = fileInfo.symbols.length > 0
      ? 1 - (fileInfo.exports.length / fileInfo.symbols.length)
      : 1;

    // Maintainability Index (simplified version of Microsoft's formula)
    // MI = 171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(L)
    // Where V=volume, G=cyclomatic, L=lines
    const volume = metrics.logicalLines * Math.log2(fileInfo.symbols.length + 1);
    const mi = Math.max(0, Math.min(100, 
      171 - 5.2 * Math.log(volume + 1) - 0.23 * avgCyclomatic - 16.2 * Math.log(metrics.linesOfCode + 1)
    ));

    // Overall score (weighted composite)
    const overall = Math.round(
      (100 - Math.min(100, avgCyclomatic * 5)) * 0.25 +
      (100 - Math.min(100, avgCognitive * 3)) * 0.25 +
      mi * 0.3 +
      cohesion * 100 * 0.1 +
      (1 - Math.min(1, metrics.maxNestingDepth / 10)) * 100 * 0.1
    );

    return {
      overall,
      cyclomatic: Math.round(avgCyclomatic * 10) / 10,
      cognitive: Math.round(avgCognitive * 10) / 10,
      coupling: 0, // Calculated externally with dependency info
      cohesion: Math.round(cohesion * 100) / 100,
      abstractness: Math.round(abstractness * 100) / 100,
      instability: 0, // Calculated externally with dependency info
      maintainabilityIndex: Math.round(mi),
    };
  }

  /**
   * Get complexity signals (warnings for problematic areas)
   */
  getSignals(complexity: FileComplexity): ComplexitySignal[] {
    const signals: ComplexitySignal[] = [];

    // High cyclomatic complexity
    if (complexity.score.cyclomatic > 15) {
      signals.push({
        type: 'high-cyclomatic',
        severity: complexity.score.cyclomatic > 25 ? 'error' : 'warning',
        message: `High cyclomatic complexity (${complexity.score.cyclomatic})`,
        suggestion: 'Consider breaking down complex functions',
      });
    }

    // High cognitive complexity
    if (complexity.score.cognitive > 20) {
      signals.push({
        type: 'high-cognitive',
        severity: complexity.score.cognitive > 35 ? 'error' : 'warning',
        message: `High cognitive complexity (${complexity.score.cognitive})`,
        suggestion: 'Simplify nested logic and reduce cognitive load',
      });
    }

    // Low maintainability index
    if (complexity.score.maintainabilityIndex < 40) {
      signals.push({
        type: 'low-maintainability',
        severity: complexity.score.maintainabilityIndex < 20 ? 'error' : 'warning',
        message: `Low maintainability index (${complexity.score.maintainabilityIndex}/100)`,
        suggestion: 'Refactor to improve maintainability',
      });
    }

    // High coupling
    if (complexity.score.coupling > 50) {
      signals.push({
        type: 'high-coupling',
        severity: 'warning',
        message: `High coupling score (${complexity.score.coupling})`,
        suggestion: 'Consider reducing dependencies',
      });
    }

    // Instability zone (high instability + low abstractness)
    if (complexity.score.instability > 0.7 && complexity.score.abstractness < 0.3) {
      signals.push({
        type: 'instability-zone',
        severity: 'warning',
        message: 'File is in instability zone (high instability, low abstractness)',
        suggestion: 'Add abstractions or reduce outgoing dependencies',
      });
    }

    // Complex symbols
    for (const symbol of complexity.symbols) {
      if (symbol.cyclomatic > 20) {
        signals.push({
          type: 'complex-symbol',
          severity: 'warning',
          message: `${symbol.kind} '${symbol.name}' has high complexity (${symbol.cyclomatic})`,
          suggestion: 'Break down into smaller functions',
        });
      }
      if (symbol.linesOfCode > 100) {
        signals.push({
          type: 'long-function',
          severity: 'info',
          message: `${symbol.kind} '${symbol.name}' is ${symbol.linesOfCode} lines`,
          suggestion: 'Consider extracting helper functions',
        });
      }
    }

    return signals;
  }
}

export interface ComplexitySignal {
  type: 'high-cyclomatic' | 'high-cognitive' | 'low-maintainability' | 
        'high-coupling' | 'instability-zone' | 'complex-symbol' | 'long-function';
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion: string;
}
