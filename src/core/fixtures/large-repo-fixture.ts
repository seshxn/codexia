import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface LargeRepoFixtureOptions {
  files: number;
  fanout: number;
  symbolsPerFile: number;
  language: 'typescript';
}

export interface LargeRepoFixtureResult {
  repoRoot: string;
  files: number;
  expectedSymbols: number;
  expectedImports: number;
}

const moduleName = (index: number): string => `module-${String(index).padStart(4, '0')}`;

const functionName = (fileIndex: number, symbolIndex: number): string =>
  `fn${String(fileIndex).padStart(4, '0')}_${String(symbolIndex).padStart(2, '0')}`;

export async function createLargeRepoFixture(
  repoRoot: string,
  options: LargeRepoFixtureOptions
): Promise<LargeRepoFixtureResult> {
  if (options.language !== 'typescript') {
    throw new Error(`Unsupported large repo fixture language: ${options.language}`);
  }
  if (options.files < 1) {
    throw new Error('Large repo fixture requires at least one file');
  }
  if (options.fanout < 0) {
    throw new Error('Large repo fixture fanout cannot be negative');
  }
  if (options.symbolsPerFile < 1) {
    throw new Error('Large repo fixture requires at least one symbol per file');
  }

  const sourceDir = path.join(repoRoot, 'src');
  await fs.mkdir(sourceDir, { recursive: true });

  let expectedImports = 0;
  for (let fileIndex = 0; fileIndex < options.files; fileIndex += 1) {
    const imports: string[] = [];
    const callTargets: string[] = [];
    for (let offset = 1; offset <= options.fanout; offset += 1) {
      const targetIndex = fileIndex + offset;
      if (targetIndex >= options.files) {
        continue;
      }
      const imported = functionName(targetIndex, 0);
      imports.push(`import { ${imported} } from './${moduleName(targetIndex)}.js';`);
      callTargets.push(imported);
      expectedImports += 1;
    }

    const symbols: string[] = [];
    for (let symbolIndex = 0; symbolIndex < options.symbolsPerFile; symbolIndex += 1) {
      const name = functionName(fileIndex, symbolIndex);
      const calls = callTargets.map((target) => `${target}(input)`).join(' + ');
      const returnExpression = calls.length > 0
        ? `input + ${symbolIndex} + ${calls}`
        : `input + ${fileIndex} + ${symbolIndex}`;
      symbols.push([
        `export function ${name}(input: number): number {`,
        `  return ${returnExpression};`,
        '}',
      ].join('\n'));
    }

    const content = [
      ...imports,
      '',
      `export const MODULE_${String(fileIndex).padStart(4, '0')} = '${moduleName(fileIndex)}';`,
      '',
      ...symbols,
      '',
    ].join('\n');

    await fs.writeFile(path.join(sourceDir, `${moduleName(fileIndex)}.ts`), content, 'utf-8');
  }

  await fs.writeFile(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ type: 'module', private: true }, null, 2),
    'utf-8'
  );

  return {
    repoRoot,
    files: options.files,
    expectedSymbols: options.files * options.symbolsPerFile,
    expectedImports,
  };
}
