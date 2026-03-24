import * as path from 'node:path';
import type { FileInfo, GitDiff } from '../core/types.js';
import { DependencyGraph } from '../core/dependency-graph.js';
import { SymbolMap } from '../core/symbol-map.js';
import { ImpactAnalyzer } from './impact-analyzer.js';
import { SmartTestPrioritizer } from './smart-test-prioritizer.js';
import type { FileComplexity } from './complexity-engine.js';
import type { FileCoChange } from './temporal-analyzer.js';

export type RefactorOperationType = 'extract-module' | 'split-class' | 'move-function' | 'rename-symbol';

export interface RefactorPlanRequest {
  type: RefactorOperationType;
  file?: string;
  targetSymbol?: string;
  newSymbolName?: string;
  destinationFile?: string;
  depth?: number;
  staged?: boolean;
  base?: string;
}

export interface RefactorPlanningContext {
  files: Map<string, FileInfo>;
  fileContents?: Map<string, string>;
  complexity?: Map<string, FileComplexity>;
  coChangeClusters?: FileCoChange[][];
  maxDepth?: number;
}

export interface RefactorBlastRadius {
  rootFiles: string[];
  downstreamByDepth: Array<{ depth: number; files: string[] }>;
  downstreamFiles: string[];
  upstreamFiles: string[];
  totalFiles: number;
}

export interface RefactorStepTestGate {
  tests: string[];
  rationale: string;
  estimatedDurationMs: number;
}

export interface RefactorStepPlan {
  id: number;
  title: string;
  goal: string;
  files: string[];
  buildInvariant: string;
  testGate: RefactorStepTestGate;
}

export interface RenamePropagationEntry {
  file: string;
  reason: string;
}

export interface RenamePropagationPlan {
  oldSymbol: string;
  newSymbol: string;
  declarations: RenamePropagationEntry[];
  imports: RenamePropagationEntry[];
  reexports: RenamePropagationEntry[];
  callSites: RenamePropagationEntry[];
  estimatedEditFiles: number;
}

export interface ModuleExtractionAdvice {
  targetFile: string;
  cohesion: number | null;
  maintainabilityIndex: number | null;
  coChangePartners: string[];
  recommendation: 'extract-recommended' | 'extract-optional' | 'extract-not-needed';
  rationale: string[];
  proposedModules: Array<{
    name: string;
    files: string[];
    reason: string;
  }>;
}

export interface RefactorWhatIfAnalysis {
  simulated: true;
  operation: RefactorOperationType;
  predictedRisk: 'low' | 'medium' | 'high';
  expectedFilesTouched: number;
  assumptions: string[];
}

export interface RefactorPlanResult {
  mode: 'simulate';
  whatIf: RefactorWhatIfAnalysis;
  blastRadius: RefactorBlastRadius;
  steps: RefactorStepPlan[];
  renamePropagation: RenamePropagationPlan | null;
  moduleExtractionAdvice: ModuleExtractionAdvice;
  risks: string[];
}

const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__|tests?)\/|(?:\.test\.|\.spec\.)/i;

export class RefactorCartographer {
  constructor(
    private depGraph: DependencyGraph,
    private symbolMap: SymbolMap,
    private impactAnalyzer: ImpactAnalyzer,
    private testPrioritizer: SmartTestPrioritizer
  ) {}

  plan(request: RefactorPlanRequest, context: RefactorPlanningContext): RefactorPlanResult {
    const rootFiles = this.resolveRootFiles(request, context.files);
    const blastRadius = this.computeBlastRadius(rootFiles, request.depth ?? context.maxDepth ?? 6);

    const allTouchedFiles = unique([
      ...blastRadius.rootFiles,
      ...blastRadius.downstreamFiles,
      ...blastRadius.upstreamFiles,
    ]);

    const renamePropagation = request.type === 'rename-symbol'
      ? this.planRenamePropagation(request, rootFiles, allTouchedFiles, context.files, context.fileContents)
      : null;

    const moduleExtractionAdvice = this.buildModuleExtractionAdvice(
      request,
      rootFiles[0],
      context.files,
      context.complexity,
      context.coChangeClusters
    );

    const steps = this.buildSteps(request, blastRadius, renamePropagation, context.files, moduleExtractionAdvice);
    const risks = this.collectRisks(blastRadius, renamePropagation, moduleExtractionAdvice, steps);

    return {
      mode: 'simulate',
      whatIf: {
        simulated: true,
        operation: request.type,
        predictedRisk: this.classifyRisk(blastRadius, steps, moduleExtractionAdvice),
        expectedFilesTouched: unique(steps.flatMap((step) => step.files)).length,
        assumptions: [
          'This is a simulation only; no files are edited.',
          'Dependency edges are computed from current repository imports.',
          'Test gates are prioritized via SmartTestPrioritizer heuristics.',
        ],
      },
      blastRadius,
      steps,
      renamePropagation,
      moduleExtractionAdvice,
      risks,
    };
  }

  private resolveRootFiles(request: RefactorPlanRequest, files: Map<string, FileInfo>): string[] {
    const roots = new Set<string>();

    if (request.file) {
      roots.add(request.file);
    }

    if (request.targetSymbol) {
      const matches = this.symbolMap.findByName(request.targetSymbol);
      for (const match of matches) {
        if (!request.file || match.filePath === request.file) {
          roots.add(match.filePath);
        }
      }
    }

    if (roots.size === 0 && request.destinationFile) {
      roots.add(request.destinationFile);
    }

    const rootList = Array.from(roots).filter((file) => files.has(file));
    if (rootList.length === 0) {
      throw new Error('Unable to resolve target file(s) for refactor planning');
    }

    if (request.type === 'rename-symbol') {
      if (!request.targetSymbol || !request.newSymbolName) {
        throw new Error('rename-symbol requires targetSymbol and newSymbolName');
      }
    }

    return unique(rootList);
  }

  private computeBlastRadius(rootFiles: string[], maxDepth: number): RefactorBlastRadius {
    const downstreamByDepth = new Map<number, Set<string>>();
    downstreamByDepth.set(0, new Set(rootFiles));

    const downstreamSeen = new Set(rootFiles);
    const queue: Array<{ file: string; depth: number }> = rootFiles.map((file) => ({ file, depth: 0 }));

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) {
        continue;
      }

      const nextDepth = current.depth + 1;
      for (const dependent of this.depGraph.getDependents(current.file)) {
        if (downstreamSeen.has(dependent)) {
          continue;
        }
        downstreamSeen.add(dependent);
        if (!downstreamByDepth.has(nextDepth)) {
          downstreamByDepth.set(nextDepth, new Set());
        }
        downstreamByDepth.get(nextDepth)!.add(dependent);
        queue.push({ file: dependent, depth: nextDepth });
      }
    }

    const upstreamSeen = new Set<string>();
    const upstreamQueue: Array<{ file: string; depth: number }> = rootFiles.map((file) => ({ file, depth: 0 }));
    while (upstreamQueue.length > 0) {
      const current = upstreamQueue.shift()!;
      if (current.depth >= maxDepth) {
        continue;
      }

      for (const dependency of this.depGraph.getDependencies(current.file)) {
        if (upstreamSeen.has(dependency) || rootFiles.includes(dependency)) {
          continue;
        }
        upstreamSeen.add(dependency);
        upstreamQueue.push({ file: dependency, depth: current.depth + 1 });
      }
    }

    const downstreamFiles = Array.from(downstreamSeen).filter((file) => !rootFiles.includes(file));
    const upstreamFiles = Array.from(upstreamSeen);

    return {
      rootFiles: unique(rootFiles),
      downstreamByDepth: Array.from(downstreamByDepth.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([depth, files]) => ({ depth, files: Array.from(files).sort() })),
      downstreamFiles: downstreamFiles.sort(),
      upstreamFiles: upstreamFiles.sort(),
      totalFiles: unique([...rootFiles, ...downstreamFiles, ...upstreamFiles]).length,
    };
  }

  private planRenamePropagation(
    request: RefactorPlanRequest,
    rootFiles: string[],
    impactedFiles: string[],
    files: Map<string, FileInfo>,
    fileContents?: Map<string, string>
  ): RenamePropagationPlan {
    const oldSymbol = request.targetSymbol!;
    const newSymbol = request.newSymbolName!;
    const declarations: RenamePropagationEntry[] = [];
    const imports: RenamePropagationEntry[] = [];
    const reexports: RenamePropagationEntry[] = [];
    const callSites: RenamePropagationEntry[] = [];

    const declarationMatches = this.symbolMap.findByName(oldSymbol);
    for (const match of declarationMatches) {
      if (rootFiles.includes(match.filePath)) {
        declarations.push({
          file: match.filePath,
          reason: `Symbol declaration ${oldSymbol} (${match.kind})`,
        });
      }
    }

    const rootNames = new Set(rootFiles.map((file) => path.basename(file, path.extname(file))));
    const symbolPattern = new RegExp(`\\b${escapeRegExp(oldSymbol)}\\b`);
    const reExportPattern = new RegExp(`export\\s*\\{[^}]*\\b${escapeRegExp(oldSymbol)}\\b[^}]*\\}\\s*from`, 'm');

    for (const filePath of impactedFiles) {
      const file = files.get(filePath);
      if (!file) {
        continue;
      }

      const importMatch = file.imports.some((imp) => {
        if (imp.specifiers.includes(oldSymbol)) {
          return true;
        }
        return rootNames.has(cleanImportBaseName(imp.source));
      });

      if (importMatch) {
        imports.push({
          file: filePath,
          reason: `Imports ${oldSymbol} directly or through target module`,
        });
      }

      const content = fileContents?.get(filePath);
      const hasReExport = file.exports.some((entry) => entry.name === oldSymbol) ||
        (typeof content === 'string' && reExportPattern.test(content));
      if (hasReExport && !rootFiles.includes(filePath)) {
        reexports.push({
          file: filePath,
          reason: `Re-exports ${oldSymbol} and needs propagation`,
        });
      }

      const hasCallSite = typeof content === 'string'
        ? symbolPattern.test(content)
        : file.imports.some((imp) => imp.specifiers.includes(oldSymbol));
      if (hasCallSite && !rootFiles.includes(filePath)) {
        callSites.push({
          file: filePath,
          reason: `Potential usage site for ${oldSymbol}`,
        });
      }
    }

    return {
      oldSymbol,
      newSymbol,
      declarations: uniqueEntries(declarations),
      imports: uniqueEntries(imports),
      reexports: uniqueEntries(reexports),
      callSites: uniqueEntries(callSites),
      estimatedEditFiles: unique([
        ...declarations.map((entry) => entry.file),
        ...imports.map((entry) => entry.file),
        ...reexports.map((entry) => entry.file),
        ...callSites.map((entry) => entry.file),
      ]).length,
    };
  }

  private buildModuleExtractionAdvice(
    request: RefactorPlanRequest,
    targetFile: string,
    files: Map<string, FileInfo>,
    complexity?: Map<string, FileComplexity>,
    coChangeClusters?: FileCoChange[][]
  ): ModuleExtractionAdvice {
    const score = complexity?.get(targetFile)?.score;
    const cohesion = score ? score.cohesion : null;
    const maintainability = score ? score.maintainabilityIndex : null;

    const cluster = coChangeClusters?.find((entry) => entry.some((item) => item.path === targetFile));
    const coChangePartners = (cluster || [])
      .filter((item) => item.path !== targetFile && item.coChangeRatio >= 0.3)
      .sort((a, b) => b.coChangeRatio - a.coChangeRatio)
      .map((item) => item.path);

    const rationale: string[] = [];
    if (cohesion !== null && cohesion < 0.45) {
      rationale.push(`Low cohesion (${cohesion.toFixed(2)}) indicates unrelated responsibilities.`);
    }
    if (maintainability !== null && maintainability < 45) {
      rationale.push(`Maintainability index is low (${maintainability}), raising refactor urgency.`);
    }
    if (coChangePartners.length > 0) {
      rationale.push(`Temporal co-change cluster detected with ${coChangePartners.length} neighboring file(s).`);
    }

    const sourceFile = files.get(targetFile);
    if (sourceFile && sourceFile.symbols.length > 12) {
      rationale.push(`High symbol count (${sourceFile.symbols.length}) suggests file-level overloading.`);
    }

    let recommendation: ModuleExtractionAdvice['recommendation'] = 'extract-not-needed';
    if ((cohesion !== null && cohesion < 0.45) || (maintainability !== null && maintainability < 45) || coChangePartners.length > 0) {
      recommendation = 'extract-recommended';
    } else if (request.type === 'extract-module') {
      recommendation = 'extract-optional';
      rationale.push('Requested refactor type is extract-module; extraction can still improve boundary clarity.');
    }

    const baseName = path.basename(targetFile, path.extname(targetFile));
    const proposedModules: ModuleExtractionAdvice['proposedModules'] = [];
    if (recommendation !== 'extract-not-needed') {
      proposedModules.push({
        name: `${baseName}-core`,
        files: unique([targetFile, ...coChangePartners.slice(0, 2)]),
        reason: 'Anchor high-cohesion core logic while minimizing import churn.',
      });
      if (coChangePartners.length > 0) {
        proposedModules.push({
          name: `${baseName}-adapters`,
          files: coChangePartners.slice(0, 3),
          reason: 'Isolate volatile edge integrations from stable domain behavior.',
        });
      }
    }

    return {
      targetFile,
      cohesion,
      maintainabilityIndex: maintainability,
      coChangePartners,
      recommendation,
      rationale: rationale.length > 0 ? rationale : ['Current cohesion and temporal signals do not strongly justify extraction.'],
      proposedModules,
    };
  }

  private buildSteps(
    request: RefactorPlanRequest,
    blastRadius: RefactorBlastRadius,
    renamePropagation: RenamePropagationPlan | null,
    files: Map<string, FileInfo>,
    extractionAdvice: ModuleExtractionAdvice
  ): RefactorStepPlan[] {
    const root = blastRadius.rootFiles[0];
    const downstream = blastRadius.downstreamFiles;

    const rawSteps: Array<{ title: string; goal: string; files: string[]; buildInvariant: string }> = [];

    switch (request.type) {
      case 'rename-symbol': {
        const declarationFiles = renamePropagation?.declarations.map((entry) => entry.file) || [root];
        const relayFiles = unique([
          ...(renamePropagation?.reexports.map((entry) => entry.file) || []),
          ...(renamePropagation?.imports.map((entry) => entry.file) || []),
        ]);
        const callerFiles = renamePropagation?.callSites.map((entry) => entry.file) || downstream;
        rawSteps.push(
          {
            title: 'Add temporary compatibility export',
            goal: `Declare ${request.newSymbolName} while keeping ${request.targetSymbol} as an alias.`,
            files: declarationFiles,
            buildInvariant: 'Both old and new symbol names compile from source declarations.',
          },
          {
            title: 'Propagate rename through import/export boundaries',
            goal: 'Update re-exports and direct imports to reference the new symbol first.',
            files: relayFiles.length > 0 ? relayFiles : downstream,
            buildInvariant: 'Intermediate modules still re-export both symbols to avoid breakage.',
          },
          {
            title: 'Flip downstream callers',
            goal: 'Move call sites to the new symbol and keep alias only where migration is incomplete.',
            files: callerFiles.length > 0 ? callerFiles : downstream,
            buildInvariant: 'All downstream consumers compile with mixed old/new references.',
          },
          {
            title: 'Remove compatibility alias',
            goal: `Delete ${request.targetSymbol} alias once callers are fully migrated.`,
            files: unique([root, ...downstream]),
            buildInvariant: 'Repository compiles with only the new symbol in the public surface.',
          }
        );
        break;
      }
      case 'extract-module': {
        const destination = request.destinationFile || root.replace(/\.[^.]+$/, '.extracted.ts');
        rawSteps.push(
          {
            title: 'Create extraction scaffold',
            goal: `Create ${destination} and export a minimal stable API.`,
            files: [root, destination],
            buildInvariant: 'Original file keeps forwarding exports so callers remain valid.',
          },
          {
            title: 'Move cohesive symbols',
            goal: 'Transfer high-cohesion symbol group into the new module with pass-through wrappers.',
            files: unique([root, destination, ...extractionAdvice.coChangePartners.slice(0, 2)]),
            buildInvariant: 'Both old and new module paths compile during migration.',
          },
          {
            title: 'Redirect dependents',
            goal: 'Switch dependents to import from the extracted module.',
            files: unique([destination, ...downstream]),
            buildInvariant: 'No consumer imports removed API contracts in the same step.',
          },
          {
            title: 'Finalize module boundaries',
            goal: 'Remove forwarding code and enforce the extracted module boundary.',
            files: unique([root, destination, ...downstream]),
            buildInvariant: 'All imports resolve to the final module ownership layout.',
          }
        );
        break;
      }
      case 'split-class': {
        const destination = request.destinationFile || root.replace(/\.[^.]+$/, '.split.ts');
        rawSteps.push(
          {
            title: 'Introduce secondary class',
            goal: `Create ${destination} with duplicated interface and delegation hooks.`,
            files: [root, destination],
            buildInvariant: 'Original class remains the stable API entry point.',
          },
          {
            title: 'Move methods incrementally',
            goal: 'Shift method clusters to the secondary class and delegate from the original.',
            files: unique([root, destination]),
            buildInvariant: 'Method signatures stay stable while implementation ownership changes.',
          },
          {
            title: 'Retarget dependents to new class',
            goal: 'Update dependent modules to import and instantiate the split classes directly.',
            files: unique([destination, ...downstream]),
            buildInvariant: 'Constructor and method contracts remain backward-compatible until cutover.',
          },
          {
            title: 'Prune transitional delegations',
            goal: 'Remove temporary delegation methods after dependents migrate.',
            files: unique([root, destination, ...downstream]),
            buildInvariant: 'No stale delegation path remains after final compile check.',
          }
        );
        break;
      }
      case 'move-function': {
        const destination = request.destinationFile || root.replace(/\.[^.]+$/, '.moved.ts');
        rawSteps.push(
          {
            title: 'Create destination function with passthrough export',
            goal: 'Copy function to destination and keep source module forwarding export.',
            files: [root, destination],
            buildInvariant: 'Both import paths resolve while migration begins.',
          },
          {
            title: 'Update direct imports',
            goal: 'Retarget direct imports to the destination module with no behavior change.',
            files: unique([destination, ...downstream]),
            buildInvariant: 'All changed imports compile while source passthrough still exists.',
          },
          {
            title: 'Delete passthrough export',
            goal: 'Remove source forwarding export after all importers are migrated.',
            files: unique([root, destination, ...downstream]),
            buildInvariant: 'Only destination module owns the function symbol.',
          }
        );
        break;
      }
      default:
        break;
    }

    return rawSteps.map((step, index) => ({
      id: index + 1,
      title: step.title,
      goal: step.goal,
      files: unique(step.files),
      buildInvariant: step.buildInvariant,
      testGate: this.buildTestGate(step.files, files),
    }));
  }

  private buildTestGate(stepFiles: string[], files: Map<string, FileInfo>): RefactorStepTestGate {
    const diff = this.syntheticDiff(stepFiles);
    const impact = this.impactAnalyzer.analyze(diff, files, new Map());
    const prioritized = this.testPrioritizer.prioritize(diff, files, impact);
    const selectedTests = unique(prioritized.suggestedSubset.slice(0, 6).map((test) => test.testFile));

    const fallbackTests = unique(
      Array.from(files.keys())
        .filter((file) => TEST_FILE_PATTERN.test(file))
        .slice(0, 3)
    );

    const tests = selectedTests.length > 0 ? selectedTests : fallbackTests;
    const estimatedDurationMs = prioritized.tests
      .filter((test) => tests.includes(test.testFile))
      .reduce((sum, test) => sum + (test.estimatedDuration || 0), 0);

    return {
      tests,
      rationale: tests.length > 0
        ? `Run ${tests.length} prioritized test(s) before advancing this step.`
        : 'No mapped tests found; run a smoke build and targeted manual verification.',
      estimatedDurationMs,
    };
  }

  private syntheticDiff(filesTouched: string[]): GitDiff {
    return {
      base: 'SIMULATION_BASE',
      head: 'SIMULATION_HEAD',
      stats: {
        files: filesTouched.length,
        additions: filesTouched.length,
        deletions: 0,
      },
      files: unique(filesTouched).map((filePath) => ({
        path: filePath,
        status: 'modified' as const,
        additions: 1,
        deletions: 0,
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            content: '',
          },
        ],
      })),
    };
  }

  private collectRisks(
    blastRadius: RefactorBlastRadius,
    renamePropagation: RenamePropagationPlan | null,
    extractionAdvice: ModuleExtractionAdvice,
    steps: RefactorStepPlan[]
  ): string[] {
    const risks: string[] = [];

    if (blastRadius.downstreamFiles.length > 12) {
      risks.push(`Large downstream blast radius (${blastRadius.downstreamFiles.length} files).`);
    }
    if (renamePropagation && renamePropagation.reexports.length > 0) {
      risks.push(`Re-export chain detected in ${renamePropagation.reexports.length} file(s).`);
    }
    if (extractionAdvice.recommendation === 'extract-recommended') {
      risks.push('Cohesion and temporal signals indicate high refactor pressure.');
    }
    if (steps.some((step) => step.testGate.tests.length === 0)) {
      risks.push('Some steps have no directly mapped tests; enforce build checks.');
    }

    return risks.length > 0 ? risks : ['No major structural risks detected beyond normal refactor churn.'];
  }

  private classifyRisk(
    blastRadius: RefactorBlastRadius,
    steps: RefactorStepPlan[],
    extractionAdvice: ModuleExtractionAdvice
  ): 'low' | 'medium' | 'high' {
    let score = 0;
    score += Math.min(30, blastRadius.downstreamFiles.length * 2);
    score += Math.min(20, steps.length * 2);

    if (extractionAdvice.recommendation === 'extract-recommended') {
      score += 20;
    } else if (extractionAdvice.recommendation === 'extract-optional') {
      score += 10;
    }

    if (score >= 45) {
      return 'high';
    }
    if (score >= 20) {
      return 'medium';
    }
    return 'low';
  }
}

const cleanImportBaseName = (source: string): string =>
  path.basename(source.replace(/\\/g, '/').replace(/\.[^.]+$/, ''));

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const uniqueEntries = (entries: RenamePropagationEntry[]): RenamePropagationEntry[] => {
  const seen = new Set<string>();
  const deduped: RenamePropagationEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.file}:${entry.reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
