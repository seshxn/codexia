import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import type { FileInfo, InvariantMemory, Invariant } from '../core/types.js';

// ============================================================================
// Invariant Types
// ============================================================================

export interface InvariantRule {
  id: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  type: InvariantType;
  config: InvariantConfig;
  enabled: boolean;
}

export type InvariantType = 
  | 'no-import'           // Disallow imports from A to B
  | 'require-import'      // Require imports from A to include B
  | 'file-pattern'        // Files matching pattern must/must not exist
  | 'symbol-required'     // Certain symbols must exist in certain files
  | 'annotation-required' // Certain files must have annotations
  | 'layer-boundary'      // Layer A cannot depend on layer B
  | 'naming-pattern'      // Symbols must match naming pattern
  | 'max-dependencies'    // Max number of dependencies
  | 'custom';             // Custom check function

export interface InvariantConfig {
  // For no-import / require-import
  fromPattern?: string;    // Glob pattern for source files
  toPattern?: string;      // Glob pattern for target imports
  
  // For file-pattern
  pattern?: string;        // Glob pattern
  mustExist?: boolean;     // true = must exist, false = must not exist
  
  // For symbol-required / annotation-required
  filePattern?: string;    // Files to check
  symbolName?: string;     // Required symbol name
  symbolKind?: string;     // Required symbol kind
  annotation?: string;     // Required annotation (JSDoc tag)
  
  // For layer-boundary
  sourceLayer?: string;
  targetLayer?: string;
  
  // For naming-pattern
  targetKind?: string;     // 'class', 'function', etc.
  namePattern?: string;    // Regex pattern
  
  // For max-dependencies
  maxCount?: number;
  
  // For custom
  checkFn?: string;        // Path to custom check module
}

export interface InvariantViolation {
  rule: InvariantRule;
  filePath: string;
  line?: number;
  message: string;
  evidence: string;
  suggestion?: string;
}

export interface InvariantCheckResult {
  passed: boolean;
  violations: InvariantViolation[];
  checkedRules: number;
  passedRules: number;
}

// ============================================================================
// Invariant Engine
// ============================================================================

export class InvariantEngine {
  private rules: InvariantRule[] = [];
  private repoRoot: string;
  private layers: Map<string, string[]> = new Map();  // Layer name -> file patterns

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Load invariants from memory file
   */
  loadFromMemory(memory: InvariantMemory): void {
    for (const invariant of memory.rules) {
      this.addRule(this.parseInvariant(invariant));
    }
  }

  /**
   * Load invariants from .codexia/invariants.md
   */
  async loadFromFile(): Promise<void> {
    const filePath = path.join(this.repoRoot, '.codexia', 'invariants.md');
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const rules = this.parseInvariantsMarkdown(content);
      for (const rule of rules) {
        this.addRule(rule);
      }
    } catch {
      // No invariants file, use defaults
    }
  }

  /**
   * Add a rule programmatically
   */
  addRule(rule: InvariantRule): void {
    this.rules.push(rule);
  }

  /**
   * Define architectural layers
   */
  defineLayers(layers: Record<string, string[]>): void {
    this.layers = new Map(Object.entries(layers));
  }

  /**
   * Check all invariants against the codebase
   */
  async check(files: Map<string, FileInfo>): Promise<InvariantCheckResult> {
    const violations: InvariantViolation[] = [];
    let passedRules = 0;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const ruleViolations = await this.checkRule(rule, files);
      
      if (ruleViolations.length === 0) {
        passedRules++;
      } else {
        violations.push(...ruleViolations);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      checkedRules: this.rules.filter(r => r.enabled).length,
      passedRules,
    };
  }

  /**
   * Check a single rule
   */
  private async checkRule(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): Promise<InvariantViolation[]> {
    switch (rule.type) {
      case 'no-import':
        return this.checkNoImport(rule, files);
      case 'require-import':
        return this.checkRequireImport(rule, files);
      case 'layer-boundary':
        return this.checkLayerBoundary(rule, files);
      case 'naming-pattern':
        return this.checkNamingPattern(rule, files);
      case 'max-dependencies':
        return this.checkMaxDependencies(rule, files);
      case 'annotation-required':
        return this.checkAnnotationRequired(rule, files);
      case 'file-pattern':
        return this.checkFilePattern(rule);
      default:
        return [];
    }
  }

  /**
   * Check no-import invariant
   */
  private checkNoImport(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const { fromPattern, toPattern } = rule.config;

    if (!fromPattern || !toPattern) return violations;

    for (const [filePath, fileInfo] of files) {
      // Check if file matches source pattern
      if (!this.matchesPattern(filePath, fromPattern)) continue;

      // Check imports
      for (const imp of fileInfo.imports) {
        if (this.matchesPattern(imp.source, toPattern)) {
          violations.push({
            rule,
            filePath,
            line: imp.line,
            message: `Import from '${imp.source}' violates invariant: ${rule.description}`,
            evidence: `import { ${imp.specifiers.join(', ')} } from '${imp.source}'`,
            suggestion: `Remove or refactor this import to comply with architectural boundaries`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check require-import invariant
   */
  private checkRequireImport(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const { fromPattern, toPattern } = rule.config;

    if (!fromPattern || !toPattern) return violations;

    for (const [filePath, fileInfo] of files) {
      if (!this.matchesPattern(filePath, fromPattern)) continue;

      const hasRequiredImport = fileInfo.imports.some(imp => 
        this.matchesPattern(imp.source, toPattern)
      );

      if (!hasRequiredImport) {
        violations.push({
          rule,
          filePath,
          message: `Missing required import matching '${toPattern}'`,
          evidence: `File matches '${fromPattern}' but doesn't import from '${toPattern}'`,
          suggestion: `Add import from ${toPattern}`,
        });
      }
    }

    return violations;
  }

  /**
   * Check layer boundary invariant
   */
  private checkLayerBoundary(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const { sourceLayer, targetLayer } = rule.config;

    if (!sourceLayer || !targetLayer) return violations;

    const sourcePatterns = this.layers.get(sourceLayer) || [sourceLayer];
    const targetPatterns = this.layers.get(targetLayer) || [targetLayer];

    for (const [filePath, fileInfo] of files) {
      // Check if file is in source layer
      const isInSourceLayer = sourcePatterns.some(p => this.matchesPattern(filePath, p));
      if (!isInSourceLayer) continue;

      // Check imports
      for (const imp of fileInfo.imports) {
        const importsFromTarget = targetPatterns.some(p => 
          this.matchesPattern(imp.source, p)
        );

        if (importsFromTarget) {
          violations.push({
            rule,
            filePath,
            line: imp.line,
            message: `Layer violation: '${sourceLayer}' cannot depend on '${targetLayer}'`,
            evidence: `Import '${imp.source}' crosses layer boundary`,
            suggestion: `Introduce an abstraction or move this code to a shared layer`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check naming pattern invariant
   */
  private checkNamingPattern(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const { targetKind, namePattern, filePattern } = rule.config;

    if (!targetKind || !namePattern) return violations;

    const regex = new RegExp(namePattern);

    for (const [filePath, fileInfo] of files) {
      if (filePattern && !this.matchesPattern(filePath, filePattern)) continue;

      for (const symbol of fileInfo.symbols) {
        if (symbol.kind !== targetKind) continue;

        if (!regex.test(symbol.name)) {
          violations.push({
            rule,
            filePath,
            line: symbol.line,
            message: `Naming violation: ${symbol.kind} '${symbol.name}' doesn't match pattern '${namePattern}'`,
            evidence: `${symbol.kind} ${symbol.name}`,
            suggestion: `Rename to match pattern: ${namePattern}`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check max dependencies invariant
   */
  private checkMaxDependencies(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const { maxCount, filePattern } = rule.config;

    if (maxCount === undefined) return violations;

    for (const [filePath, fileInfo] of files) {
      if (filePattern && !this.matchesPattern(filePath, filePattern)) continue;

      if (fileInfo.imports.length > maxCount) {
        violations.push({
          rule,
          filePath,
          message: `Too many dependencies: ${fileInfo.imports.length} (max: ${maxCount})`,
          evidence: `File has ${fileInfo.imports.length} imports`,
          suggestion: `Reduce dependencies or split into smaller modules`,
        });
      }
    }

    return violations;
  }

  /**
   * Check annotation required invariant
   */
  private checkAnnotationRequired(
    rule: InvariantRule,
    files: Map<string, FileInfo>
  ): InvariantViolation[] {
    const violations: InvariantViolation[] = [];
    const { filePattern, annotation, symbolKind } = rule.config;

    if (!filePattern || !annotation) return violations;

    for (const [filePath, fileInfo] of files) {
      if (!this.matchesPattern(filePath, filePattern)) continue;

      for (const symbol of fileInfo.symbols) {
        if (symbolKind && symbol.kind !== symbolKind) continue;
        if (!symbol.exported) continue;

        const hasAnnotation = symbol.documentation?.includes(annotation);

        if (!hasAnnotation) {
          violations.push({
            rule,
            filePath,
            line: symbol.line,
            message: `Missing required annotation '${annotation}' on ${symbol.kind} '${symbol.name}'`,
            evidence: `Exported ${symbol.kind} without ${annotation} annotation`,
            suggestion: `Add ${annotation} annotation to documentation`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check file pattern invariant
   */
  private async checkFilePattern(rule: InvariantRule): Promise<InvariantViolation[]> {
    const violations: InvariantViolation[] = [];
    const { pattern, mustExist } = rule.config;

    if (!pattern) return violations;

    const matches = await glob(pattern, {
      cwd: this.repoRoot,
      ignore: ['**/node_modules/**'],
    });

    if (mustExist && matches.length === 0) {
      violations.push({
        rule,
        filePath: pattern,
        message: `Required file pattern '${pattern}' has no matches`,
        evidence: 'No files found matching pattern',
        suggestion: `Create files matching ${pattern}`,
      });
    }

    if (!mustExist && matches.length > 0) {
      for (const match of matches) {
        violations.push({
          rule,
          filePath: match,
          message: `Forbidden file pattern '${pattern}' has matches`,
          evidence: `File '${match}' should not exist`,
          suggestion: `Remove or rename file`,
        });
      }
    }

    return violations;
  }

  /**
   * Parse invariant from memory format
   */
  private parseInvariant(invariant: Invariant): InvariantRule {
    const config: InvariantConfig = {};
    let type: InvariantType = 'custom';

    // Parse check string to determine type
    if (invariant.check) {
      const check = invariant.check.toLowerCase();
      
      if (check.includes('cannot import') || check.includes('no import')) {
        type = 'no-import';
        const match = invariant.check.match(/from ['"](.*?)['"].*?cannot import.*?['"](.*?)['"]/i) ||
                     invariant.check.match(/['"](.*?)['"].*?cannot import.*?from ['"](.*?)['"]/i);
        if (match) {
          config.fromPattern = match[1];
          config.toPattern = match[2];
        }
      } else if (check.includes('must import')) {
        type = 'require-import';
      } else if (check.includes('layer')) {
        type = 'layer-boundary';
      }
    }

    return {
      id: invariant.id,
      description: invariant.description,
      severity: invariant.severity,
      type,
      config,
      enabled: true,
    };
  }

  /**
   * Parse invariants from markdown
   */
  private parseInvariantsMarkdown(content: string): InvariantRule[] {
    const rules: InvariantRule[] = [];
    const lines = content.split('\n');
    
    let currentRule: Partial<InvariantRule> | null = null;

    for (const line of lines) {
      // Rule header: ## INV-001: Description
      const headerMatch = line.match(/^##\s+(INV-\d+):\s*(.+)$/);
      if (headerMatch) {
        if (currentRule?.id) {
          rules.push(currentRule as InvariantRule);
        }
        currentRule = {
          id: headerMatch[1],
          description: headerMatch[2],
          type: 'custom',
          config: {},
          enabled: true,
          severity: 'medium',
        };
        continue;
      }

      if (!currentRule) continue;

      // Severity: - **Severity:** critical
      const severityMatch = line.match(/\*\*Severity\*\*:\s*(critical|high|medium)/i);
      if (severityMatch) {
        currentRule.severity = severityMatch[1].toLowerCase() as 'critical' | 'high' | 'medium';
      }

      // Check: - **Check:** Files in `src/controllers/` cannot import from `src/db/`
      const checkMatch = line.match(/\*\*Check\*\*:\s*(.+)/);
      if (checkMatch) {
        const checkStr = checkMatch[1];
        
        // Parse no-import pattern
        const noImportMatch = checkStr.match(/Files in [`'](.+?)[`'] cannot import from [`'](.+?)[`']/);
        if (noImportMatch) {
          currentRule.type = 'no-import';
          currentRule.config = {
            fromPattern: noImportMatch[1] + '**',
            toPattern: noImportMatch[2],
          };
        }

        // Parse annotation required
        const annotationMatch = checkStr.match(/must have [`'](.+?)[`'] (annotation|JSDoc)/);
        if (annotationMatch) {
          currentRule.type = 'annotation-required';
          currentRule.config = {
            ...currentRule.config,
            annotation: annotationMatch[1],
          };
        }

        // Parse naming pattern
        const namingMatch = checkStr.match(/(class|function|interface|type).*?must match.*?[`'](.+?)[`']/i);
        if (namingMatch) {
          currentRule.type = 'naming-pattern';
          currentRule.config = {
            ...currentRule.config,
            targetKind: namingMatch[1].toLowerCase(),
            namePattern: namingMatch[2],
          };
        }
      }
    }

    // Don't forget the last rule
    if (currentRule?.id) {
      rules.push(currentRule as InvariantRule);
    }

    return rules;
  }

  /**
   * Check if path matches glob pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple glob matching (supports * and **)
    const regex = pattern
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLESTAR}}/g, '.*')
      .replace(/\//g, '\\/');
    
    return new RegExp(`^${regex}$`).test(filePath) ||
           new RegExp(regex).test(filePath);
  }

  /**
   * Get all registered rules
   */
  getRules(): InvariantRule[] {
    return [...this.rules];
  }

  /**
   * Generate a sample invariants.md file
   */
  static generateSampleFile(): string {
    return `# Invariants

These rules must never be violated. They represent architectural constraints that ensure system integrity.

## INV-001: No direct database access from controllers
- **Severity:** critical
- **Check:** Files in \`src/controllers/\` cannot import from \`src/db/\`
- **Rationale:** Controllers should use services/repositories for data access

## INV-002: All public APIs must have documentation
- **Severity:** high
- **Check:** Exported functions in \`src/api/\` must have \`@description\` JSDoc
- **Rationale:** Public APIs must be documented for consumers

## INV-003: Services must follow naming convention
- **Severity:** medium
- **Check:** class in \`src/services/\` must match \`^[A-Z][a-zA-Z]+Service$\`
- **Rationale:** Consistent naming improves discoverability

## INV-004: Maximum dependencies per module
- **Severity:** medium
- **Check:** Files cannot have more than 15 imports
- **Rationale:** Too many dependencies indicate poor cohesion

## INV-005: Test files must exist for services
- **Severity:** high
- **Check:** Files matching \`src/services/*.ts\` must have corresponding \`*.test.ts\`
- **Rationale:** All services must have test coverage
`;
  }
}
