import * as path from 'node:path';
import type { FileInfo, Symbol } from '../core/types.js';
import type { FileComplexity, SymbolComplexity } from './complexity-engine.js';
import type { FileCoChange, TemporalInsights } from './temporal-analyzer.js';

export interface CognitiveLoadDimensions {
  cyclomaticLoad: number;
  cognitiveComplexityLoad: number;
  namingInconsistencyLoad: number;
  abstractionDepthLoad: number;
  implicitCouplingLoad: number;
  documentationDebtLoad: number;
  contextSwitchLoad: number;
  mentalModelSwitchLoad: number;
  churnLoad: number;
}

export interface CognitiveFunctionScore {
  path: string;
  name: string;
  kind: string;
  line: number;
  score: number;
  contextSwitchCost: number;
  dimensions: CognitiveLoadDimensions;
}

export interface CognitiveFileScore {
  path: string;
  module: string;
  score: number;
  contextSwitchCost: number;
  dimensions: CognitiveLoadDimensions;
  documentationScore: number;
  complexityScore: number;
  modificationFrequency: number;
  onboardingWeight: number;
  functions: CognitiveFunctionScore[];
}

export interface CognitiveModuleScore {
  module: string;
  score: number;
  fileCount: number;
  avgContextSwitchCost: number;
  onboardingDifficulty: number;
  topRiskFiles: string[];
}

export interface ImplicitCouplingPair {
  from: string;
  to: string;
  coChangeRatio: number;
  coChangeCount: number;
  directDependency: boolean;
  score: number;
}

export interface DocumentationGap {
  path: string;
  complexityBurden: number;
  documentationScore: number;
  cognitiveLoadScore: number;
  gapScore: number;
}

export interface OnboardingDifficulty {
  path: string;
  difficultyScore: number;
  modificationFrequency: number;
  cognitiveLoadScore: number;
  ownershipRisk: number;
  contextSwitchCost: number;
}

export interface CognitiveLoadMapResult {
  generatedAt: string;
  files: CognitiveFileScore[];
  functions: CognitiveFunctionScore[];
  modules: CognitiveModuleScore[];
  implicitCoupling: ImplicitCouplingPair[];
  documentationGaps: DocumentationGap[];
  onboardingDifficulty: OnboardingDifficulty[];
  summary: {
    filesAnalyzed: number;
    modulesAnalyzed: number;
    averageScore: number;
    highLoadFiles: number;
    topFiles: string[];
    topModules: string[];
  };
}

export interface CognitiveLoadAnalysisInput {
  files: Map<string, FileInfo>;
  complexity: Map<string, FileComplexity>;
  temporal: Map<string, TemporalInsights>;
  namingViolationsByFile: Map<string, number>;
  coChangeClusters: FileCoChange[][];
  semanticDispersionByFile?: Map<string, number>;
  directDependencies?: Map<string, Set<string>>;
}

const WEIGHTS = {
  cyclomaticLoad: 0.14,
  cognitiveComplexityLoad: 0.18,
  namingInconsistencyLoad: 0.1,
  abstractionDepthLoad: 0.09,
  implicitCouplingLoad: 0.13,
  documentationDebtLoad: 0.1,
  contextSwitchLoad: 0.1,
  mentalModelSwitchLoad: 0.08,
  churnLoad: 0.08,
} satisfies Record<keyof CognitiveLoadDimensions, number>;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const round = (value: number): number => Math.round(value * 10) / 10;

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toModulePath = (filePath: string): string => {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length === 0) return '.';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}/${parts[1]}`;
};

const isCamelCase = (value: string): boolean => /^[a-z][a-zA-Z0-9]*$/.test(value);
const isPascalCase = (value: string): boolean => /^[A-Z][a-zA-Z0-9]*$/.test(value);
const isScreamingSnake = (value: string): boolean => /^[A-Z][A-Z0-9_]+$/.test(value);

const symbolNamingMismatch = (symbol: Symbol): number => {
  if (symbol.kind === 'function' || symbol.kind === 'method') {
    return isCamelCase(symbol.name) ? 0 : 1;
  }
  if (symbol.kind === 'class' || symbol.kind === 'interface' || symbol.kind === 'type' || symbol.kind === 'enum') {
    return isPascalCase(symbol.name) ? 0 : 1;
  }
  if (symbol.kind === 'variable') {
    return isCamelCase(symbol.name) || isScreamingSnake(symbol.name) ? 0 : 1;
  }
  return 0;
};

const normalizeImportDomain = (filePath: string, source: string): string => {
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return `pkg:${source.split('/')[0]}`;
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), source));
  const top = resolved.split('/').filter(Boolean)[0] || '.';
  return `dir:${top}`;
};

const moduleBoundary = (filePath: string): string => {
  return filePath.split('/').filter(Boolean)[0] || '.';
};

const scoreFromDimensions = (dimensions: CognitiveLoadDimensions): number => {
  const weighted =
    dimensions.cyclomaticLoad * WEIGHTS.cyclomaticLoad +
    dimensions.cognitiveComplexityLoad * WEIGHTS.cognitiveComplexityLoad +
    dimensions.namingInconsistencyLoad * WEIGHTS.namingInconsistencyLoad +
    dimensions.abstractionDepthLoad * WEIGHTS.abstractionDepthLoad +
    dimensions.implicitCouplingLoad * WEIGHTS.implicitCouplingLoad +
    dimensions.documentationDebtLoad * WEIGHTS.documentationDebtLoad +
    dimensions.contextSwitchLoad * WEIGHTS.contextSwitchLoad +
    dimensions.mentalModelSwitchLoad * WEIGHTS.mentalModelSwitchLoad +
    dimensions.churnLoad * WEIGHTS.churnLoad;

  return round(clamp(weighted, 0, 100));
};

export class CognitiveLoadAnalyzer {
  analyze(input: CognitiveLoadAnalysisInput): CognitiveLoadMapResult {
    const implicitCoupling = this.detectImplicitCoupling(input.coChangeClusters, input.directDependencies || new Map());

    const implicitCouplingLoadByFile = new Map<string, number>();
    for (const pair of implicitCoupling) {
      implicitCouplingLoadByFile.set(pair.from, Math.max(implicitCouplingLoadByFile.get(pair.from) || 0, pair.score));
      implicitCouplingLoadByFile.set(pair.to, Math.max(implicitCouplingLoadByFile.get(pair.to) || 0, pair.score));
    }

    const fileScores: CognitiveFileScore[] = [];
    const functionScores: CognitiveFunctionScore[] = [];

    for (const [filePath, fileInfo] of input.files) {
      const complexity = input.complexity.get(filePath);
      if (!complexity) {
        continue;
      }

      const temporal = input.temporal.get(filePath);
      const semanticDispersion = input.semanticDispersionByFile?.get(filePath) || 0;
      const namingViolations = input.namingViolationsByFile.get(filePath) || 0;

      const symbols = fileInfo.symbols;
      const totalSymbols = Math.max(symbols.length, 1);
      const namingMismatches = symbols.reduce((sum, symbol) => sum + symbolNamingMismatch(symbol), 0);
      const namingInconsistencyLoad = clamp((namingMismatches / totalSymbols) * 100 + namingViolations * 8, 0, 100);

      const documentedSymbols = symbols.filter((symbol) => (symbol.documentation || '').trim().length > 12).length;
      const symbolDocsCoverage = documentedSymbols / totalSymbols;
      const documentationScore = round(clamp((symbolDocsCoverage * 0.65 + complexity.metrics.commentRatio * 0.35) * 100, 0, 100));

      const importDomains = new Set(fileInfo.imports.map((entry) => normalizeImportDomain(filePath, entry.source)));
      const symbolKinds = new Set(fileInfo.symbols.map((symbol) => symbol.kind));
      const externalImports = fileInfo.imports.filter((entry) => !entry.source.startsWith('.') && !entry.source.startsWith('/')).length;
      const contextSwitchCost =
        importDomains.size +
        Math.max(0, symbolKinds.size - 2) +
        Math.min(3, externalImports);
      const contextSwitchLoad = clamp(contextSwitchCost * 12, 0, 100);

      const fileBoundary = moduleBoundary(filePath);
      const crossBoundaryImports = fileInfo.imports.filter((entry) => {
        if (!entry.source.startsWith('.') && !entry.source.startsWith('/')) {
          return true;
        }
        return moduleBoundary(path.posix.normalize(path.posix.join(path.posix.dirname(filePath), entry.source))) !== fileBoundary;
      }).length;

      const mentalModelSwitchLoad = clamp(
        crossBoundaryImports * 14 +
        Math.max(0, importDomains.size - 1) * 10 +
        Math.max(0, symbolKinds.size - 1) * 6 +
        semanticDispersion * 30,
        0,
        100
      );

      const abstractionDepthLoad = clamp(
        complexity.metrics.maxNestingDepth * 10 +
        complexity.metrics.avgFunctionLength / 2 +
        complexity.metrics.parameterCount * 1.5,
        0,
        100
      );

      const cyclomaticLoad = clamp(complexity.score.cyclomatic * 4 + complexity.metrics.maxNestingDepth * 2, 0, 100);
      const cognitiveComplexityLoad = clamp(complexity.score.cognitive * 3 + complexity.metrics.maxNestingDepth * 4, 0, 100);
      const implicitCouplingLoad = implicitCouplingLoadByFile.get(filePath) || 0;

      const churnRate = temporal?.churnRate || 0;
      const churnLoad = clamp(churnRate * 120 + (100 - (temporal?.stabilityScore || 100)) * 0.25, 0, 100);

      const dimensions: CognitiveLoadDimensions = {
        cyclomaticLoad: round(cyclomaticLoad),
        cognitiveComplexityLoad: round(cognitiveComplexityLoad),
        namingInconsistencyLoad: round(namingInconsistencyLoad),
        abstractionDepthLoad: round(abstractionDepthLoad),
        implicitCouplingLoad: round(implicitCouplingLoad),
        documentationDebtLoad: round(100 - documentationScore),
        contextSwitchLoad: round(contextSwitchLoad),
        mentalModelSwitchLoad: round(mentalModelSwitchLoad),
        churnLoad: round(churnLoad),
      };

      const score = scoreFromDimensions(dimensions);
      const complexityScore = round((dimensions.cyclomaticLoad + dimensions.cognitiveComplexityLoad) / 2);
      const onboardingWeight = round(clamp(score * 0.55 + churnLoad * 0.25 + (temporal?.ownershipRisk || 0) * 0.2, 0, 100));

      const perFunctionScores = this.buildFunctionScores(fileInfo, complexity.symbols, dimensions, contextSwitchCost);
      functionScores.push(...perFunctionScores);

      fileScores.push({
        path: filePath,
        module: toModulePath(filePath),
        score,
        contextSwitchCost,
        dimensions,
        documentationScore,
        complexityScore,
        modificationFrequency: round(churnRate),
        onboardingWeight,
        functions: perFunctionScores,
      });
    }

    fileScores.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    functionScores.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

    const modules = this.buildModuleScores(fileScores);
    const documentationGaps = this.findDocumentationGaps(fileScores, input.complexity);
    const onboardingDifficulty = this.buildOnboardingDifficulty(fileScores, input.temporal);

    return {
      generatedAt: new Date().toISOString(),
      files: fileScores,
      functions: functionScores,
      modules,
      implicitCoupling,
      documentationGaps,
      onboardingDifficulty,
      summary: {
        filesAnalyzed: fileScores.length,
        modulesAnalyzed: modules.length,
        averageScore: round(average(fileScores.map((file) => file.score))),
        highLoadFiles: fileScores.filter((file) => file.score >= 70).length,
        topFiles: fileScores.slice(0, 5).map((file) => file.path),
        topModules: modules.slice(0, 5).map((module) => module.module),
      },
    };
  }

  private buildFunctionScores(
    fileInfo: FileInfo,
    symbolComplexities: SymbolComplexity[],
    inheritedFileDimensions: CognitiveLoadDimensions,
    contextSwitchCost: number
  ): CognitiveFunctionScore[] {
    const byName = new Map(symbolComplexities.map((symbol) => [symbol.name, symbol]));

    return fileInfo.symbols
      .filter((symbol) => symbol.kind === 'function' || symbol.kind === 'method')
      .map((symbol) => {
        const complexity = byName.get(symbol.name);
        const symbolCyclomatic = complexity?.cyclomatic || 1;
        const symbolCognitive = complexity?.cognitive || 1;
        const symbolDocsScore = (symbol.documentation || '').trim().length > 12 ? 90 : 20;
        const namingInconsistencyLoad = symbolNamingMismatch(symbol) ? 72 : 12;
        const abstractionDepthLoad = clamp((complexity?.parameters || 0) * 8 + (complexity?.dependencies || 0) * 4, 0, 100);

        const dimensions: CognitiveLoadDimensions = {
          cyclomaticLoad: round(clamp(symbolCyclomatic * 5, 0, 100)),
          cognitiveComplexityLoad: round(clamp(symbolCognitive * 4, 0, 100)),
          namingInconsistencyLoad,
          abstractionDepthLoad: round(abstractionDepthLoad),
          implicitCouplingLoad: inheritedFileDimensions.implicitCouplingLoad,
          documentationDebtLoad: round(100 - symbolDocsScore),
          contextSwitchLoad: inheritedFileDimensions.contextSwitchLoad,
          mentalModelSwitchLoad: inheritedFileDimensions.mentalModelSwitchLoad,
          churnLoad: inheritedFileDimensions.churnLoad,
        };

        return {
          path: fileInfo.relativePath,
          name: symbol.name,
          kind: symbol.kind,
          line: symbol.line,
          contextSwitchCost,
          dimensions,
          score: scoreFromDimensions(dimensions),
        };
      });
  }

  private buildModuleScores(fileScores: CognitiveFileScore[]): CognitiveModuleScore[] {
    const grouped = new Map<string, CognitiveFileScore[]>();
    for (const file of fileScores) {
      const list = grouped.get(file.module) || [];
      list.push(file);
      grouped.set(file.module, list);
    }

    return Array.from(grouped.entries())
      .map(([module, files]) => ({
        module,
        score: round(average(files.map((file) => file.score))),
        fileCount: files.length,
        avgContextSwitchCost: round(average(files.map((file) => file.contextSwitchCost))),
        onboardingDifficulty: round(average(files.map((file) => file.onboardingWeight))),
        topRiskFiles: [...files]
          .sort((left, right) => right.score - left.score)
          .slice(0, 3)
          .map((file) => file.path),
      }))
      .sort((left, right) => right.score - left.score || left.module.localeCompare(right.module));
  }

  private findDocumentationGaps(
    fileScores: CognitiveFileScore[],
    complexityByFile: Map<string, FileComplexity>
  ): DocumentationGap[] {
    return fileScores
      .map((file) => {
        const complexity = complexityByFile.get(file.path);
        const complexityBurden = complexity ? clamp(100 - complexity.score.overall, 0, 100) : file.complexityScore;
        const gapScore = round(clamp(complexityBurden * 0.6 + (100 - file.documentationScore) * 0.4, 0, 100));

        return {
          path: file.path,
          complexityBurden: round(complexityBurden),
          documentationScore: file.documentationScore,
          cognitiveLoadScore: file.score,
          gapScore,
        };
      })
      .filter((item) => item.complexityBurden >= 55 && item.documentationScore <= 45)
      .sort((left, right) => right.gapScore - left.gapScore || left.path.localeCompare(right.path))
      .slice(0, 40);
  }

  private buildOnboardingDifficulty(
    fileScores: CognitiveFileScore[],
    temporalByFile: Map<string, TemporalInsights>
  ): OnboardingDifficulty[] {
    return fileScores
      .map((file) => {
        const temporal = temporalByFile.get(file.path);
        const ownershipRisk = temporal?.ownershipRisk || 0;
        const difficultyScore = round(clamp(
          file.score * 0.55 +
          file.dimensions.churnLoad * 0.25 +
          ownershipRisk * 0.2,
          0,
          100
        ));

        return {
          path: file.path,
          difficultyScore,
          modificationFrequency: file.modificationFrequency,
          cognitiveLoadScore: file.score,
          ownershipRisk: round(ownershipRisk),
          contextSwitchCost: file.contextSwitchCost,
        };
      })
      .sort((left, right) => right.difficultyScore - left.difficultyScore || left.path.localeCompare(right.path));
  }

  private detectImplicitCoupling(
    clusters: FileCoChange[][],
    directDependencies: Map<string, Set<string>>
  ): ImplicitCouplingPair[] {
    const pairs = new Map<string, ImplicitCouplingPair>();

    for (const cluster of clusters) {
      if (cluster.length < 2) {
        continue;
      }

      const anchor = cluster[0];
      for (const related of cluster.slice(1)) {
        const directDependency =
          directDependencies.get(anchor.path)?.has(related.path) ||
          directDependencies.get(related.path)?.has(anchor.path) ||
          false;

        if (directDependency) {
          continue;
        }

        const from = anchor.path;
        const to = related.path;
        const key = [from, to].sort().join('::');
        const score = round(clamp(related.coChangeRatio * 100 + related.coChangeCount * 0.35, 0, 100));
        const existing = pairs.get(key);

        if (!existing || existing.score < score) {
          pairs.set(key, {
            from,
            to,
            coChangeRatio: round(related.coChangeRatio),
            coChangeCount: related.coChangeCount,
            directDependency,
            score,
          });
        }
      }
    }

    return Array.from(pairs.values())
      .sort((left, right) => right.score - left.score || left.from.localeCompare(right.from))
      .slice(0, 80);
  }
}
