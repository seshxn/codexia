import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileInfo, Symbol } from './types.js';

const INDEX_FILE = path.join('.codexia', 'codegraph', 'semantic-index.json');
const VECTOR_DIMENSIONS = 96;
const MAX_FILE_CHARS = 12000;
const MAX_SYMBOL_LINES = 40;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'const', 'class', 'def', 'enum', 'export',
  'file', 'for', 'from', 'function', 'if', 'implements', 'import', 'in', 'interface', 'is',
  'it', 'let', 'module', 'new', 'of', 'on', 'or', 'public', 'private', 'protected', 'return',
  'static', 'struct', 'the', 'this', 'to', 'type', 'var', 'void', 'with',
]);

export interface SemanticSearchResult {
  id: string;
  type: 'file' | 'symbol';
  path: string;
  name?: string;
  kind?: string;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  excerpt?: string;
}

interface SemanticDocument {
  id: string;
  type: 'file' | 'symbol';
  path: string;
  name?: string;
  kind?: string;
  excerpt: string;
  vector: number[];
  tokens: string[];
}

interface SemanticIndexPayload {
  version: 1 | 2;
  generatedAt: string;
  vocabularySize: number;
  documents: SemanticDocument[];
  invertedIndex?: Record<string, string[]>;
}

export interface SemanticIndexStats {
  documents: number;
  vocabulary: number;
  generatedAt?: string;
}

export class SemanticIndex {
  private readonly repoRoot: string;
  private readonly indexPath: string;
  private documents: SemanticDocument[] = [];
  private documentsById = new Map<string, SemanticDocument>();
  private invertedIndex = new Map<string, Set<string>>();
  private vocabularySize = 0;
  private generatedAt?: string;
  private loaded = false;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.indexPath = path.join(repoRoot, INDEX_FILE);
  }

  async build(files: Map<string, FileInfo>): Promise<SemanticIndexStats> {
    const drafts: Array<Omit<SemanticDocument, 'vector'>> = [];
    const documentFrequencies = new Map<string, number>();

    for (const [filePath, fileInfo] of files) {
      const content = await this.safeReadFile(filePath);
      const excerpt = content.slice(0, MAX_FILE_CHARS);
      const fileText = [
        fileInfo.path,
        fileInfo.language,
        fileInfo.imports.map((item) => item.source).join(' '),
        fileInfo.exports.map((item) => item.name).join(' '),
        fileInfo.symbols.map((symbol) => `${symbol.kind} ${symbol.name}`).join(' '),
        excerpt,
      ].join('\n');

      const fileTokens = this.tokenize(fileText);
      drafts.push({
        id: `file:${filePath}`,
        type: 'file',
        path: filePath,
        kind: fileInfo.language,
        excerpt: excerpt.slice(0, 320),
        tokens: fileTokens,
      });
      this.bumpDocumentFrequency(documentFrequencies, fileTokens);

      const lines = content.length > 0 ? content.split(/\r?\n/) : [];
      for (const symbol of fileInfo.symbols) {
        const symbolExcerpt = this.extractSymbolExcerpt(lines, symbol);
        const symbolText = [
          symbol.name,
          symbol.kind,
          symbol.filePath,
          symbol.parentSymbol || '',
          (symbol.parameters || []).join(' '),
          symbol.returnType || '',
          symbol.documentation || '',
          (symbol.extendsSymbols || []).join(' '),
          (symbol.implementsSymbols || []).join(' '),
          symbolExcerpt,
        ].join('\n');
        const symbolTokens = this.tokenize(symbolText);
        drafts.push({
          id: this.symbolId(symbol),
          type: 'symbol',
          path: filePath,
          name: symbol.name,
          kind: symbol.kind,
          excerpt: symbolExcerpt.slice(0, 320),
          tokens: symbolTokens,
        });
        this.bumpDocumentFrequency(documentFrequencies, symbolTokens);
      }
    }

    const totalDocs = Math.max(drafts.length, 1);
    this.documents = drafts.map((draft) => ({
      ...draft,
      vector: this.vectorize(draft.tokens, documentFrequencies, totalDocs),
    }));
    this.rebuildRuntimeIndexes();
    this.vocabularySize = documentFrequencies.size;
    this.generatedAt = new Date().toISOString();
    this.loaded = true;
    await this.persist();

    return this.getStats();
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const raw = await fs.readFile(this.indexPath, 'utf-8');
      const payload = JSON.parse(raw) as SemanticIndexPayload;
      this.documents = payload.documents || [];
      this.rebuildRuntimeIndexes(payload.invertedIndex);
      this.vocabularySize = payload.vocabularySize || 0;
      this.generatedAt = payload.generatedAt;
      this.loaded = true;
    } catch {
      this.documents = [];
      this.documentsById = new Map();
      this.invertedIndex = new Map();
      this.vocabularySize = 0;
      this.generatedAt = undefined;
      this.loaded = true;
    }
  }

  async search(query: string, limit: number = 10): Promise<SemanticSearchResult[]> {
    await this.load();

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0 || this.documents.length === 0) {
      return [];
    }

    const queryVector = this.vectorize(queryTokens, new Map(), Math.max(this.documents.length, 1));
    const lexicalCandidates = this.getLexicalCandidates(queryTokens);
    const semanticCandidates = lexicalCandidates.length > 0 ? lexicalCandidates : this.documents;

    const lexicalRanked = lexicalCandidates
      .map((doc) => ({ doc, score: this.computeLexicalScore(queryTokens, doc) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 4);

    const semanticRanked = semanticCandidates
      .map((doc) => ({ doc, score: this.cosineSimilarity(queryVector, doc.vector) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit * 4);

    const fused = new Map<string, SemanticSearchResult>();
    this.applyReciprocalRankFusion(fused, lexicalRanked, 'lexical');
    this.applyReciprocalRankFusion(fused, semanticRanked, 'semantic');

    return Array.from(fused.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        ...entry,
        score: Number(entry.score.toFixed(4)),
        lexicalScore: Number(entry.lexicalScore.toFixed(4)),
        semanticScore: Number(entry.semanticScore.toFixed(4)),
      }));
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.indexPath);
      return true;
    } catch {
      return false;
    }
  }

  getStats(): SemanticIndexStats {
    return {
      documents: this.documents.length,
      vocabulary: this.vocabularySize,
      generatedAt: this.generatedAt,
    };
  }

  private async persist(): Promise<void> {
    const payload: SemanticIndexPayload = {
      version: 2,
      generatedAt: this.generatedAt || new Date().toISOString(),
      vocabularySize: this.vocabularySize,
      documents: this.documents,
      invertedIndex: this.serializeInvertedIndex(),
    };
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(payload), 'utf-8');
  }

  private async safeReadFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(path.join(this.repoRoot, filePath), 'utf-8');
    } catch {
      return '';
    }
  }

  private extractSymbolExcerpt(lines: string[], symbol: Symbol): string {
    if (lines.length === 0) {
      return symbol.name;
    }

    const start = Math.max(0, symbol.line - 2);
    const endLine = symbol.endLine || symbol.line;
    const end = Math.min(lines.length, Math.max(start + 1, endLine + 2, start + MAX_SYMBOL_LINES));
    return lines.slice(start, Math.min(end, start + MAX_SYMBOL_LINES)).join('\n');
  }

  private tokenize(input: string): string[] {
    return input
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .flatMap((token) => token.split(/[_.:/-]+/))
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  }

  private bumpDocumentFrequency(documentFrequencies: Map<string, number>, tokens: string[]): void {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      documentFrequencies.set(token, (documentFrequencies.get(token) || 0) + 1);
    }
  }

  private rebuildRuntimeIndexes(serialized?: Record<string, string[]>): void {
    this.documentsById = new Map(this.documents.map((doc) => [doc.id, doc]));
    this.invertedIndex = new Map();

    if (serialized) {
      for (const [token, ids] of Object.entries(serialized)) {
        this.invertedIndex.set(token, new Set(ids.filter((id) => this.documentsById.has(id))));
      }
      return;
    }

    for (const doc of this.documents) {
      for (const token of new Set(doc.tokens)) {
        const ids = this.invertedIndex.get(token) || new Set<string>();
        ids.add(doc.id);
        this.invertedIndex.set(token, ids);
      }
    }
  }

  private serializeInvertedIndex(): Record<string, string[]> {
    const serialized: Record<string, string[]> = {};
    for (const [token, ids] of this.invertedIndex) {
      serialized[token] = Array.from(ids);
    }
    return serialized;
  }

  private getLexicalCandidates(queryTokens: string): SemanticDocument[];
  private getLexicalCandidates(queryTokens: string[]): SemanticDocument[];
  private getLexicalCandidates(queryTokens: string[] | string): SemanticDocument[] {
    const tokens = Array.isArray(queryTokens) ? queryTokens : this.tokenize(queryTokens);
    const ids = new Set<string>();
    for (const token of tokens) {
      for (const id of this.invertedIndex.get(token) || []) {
        ids.add(id);
      }
    }
    return Array.from(ids)
      .map((id) => this.documentsById.get(id))
      .filter((doc): doc is SemanticDocument => Boolean(doc));
  }

  private vectorize(tokens: string[], documentFrequencies: Map<string, number>, totalDocs: number): number[] {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);
    for (const [token, count] of counts) {
      const tf = 1 + Math.log(count);
      const df = documentFrequencies.get(token) || 0;
      const idf = df > 0 ? Math.log((totalDocs + 1) / (df + 1)) + 1 : 1;
      const weight = tf * idf;
      const hash = this.hashToken(token);
      const index = Math.abs(hash) % VECTOR_DIMENSIONS;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vector[index] += weight * sign;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => value / magnitude);
  }

  private computeLexicalScore(queryTokens: string[], document: SemanticDocument): number {
    if (queryTokens.length === 0) {
      return 0;
    }

    const haystack = `${document.path} ${document.name || ''} ${document.kind || ''} ${document.tokens.join(' ')}`;
    const exact = haystack.includes(queryTokens.join(' ')) ? 0.25 : 0;
    const hits = queryTokens.filter((token) => document.tokens.includes(token) || haystack.includes(token)).length;
    if (hits === 0) {
      return exact;
    }

    return exact + hits / queryTokens.length;
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    let sum = 0;
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      sum += left[index] * right[index];
    }
    return Math.max(0, sum);
  }

  private applyReciprocalRankFusion(
    fused: Map<string, SemanticSearchResult>,
    ranked: Array<{ doc: SemanticDocument; score: number }>,
    kind: 'lexical' | 'semantic'
  ): void {
    for (const [index, entry] of ranked.entries()) {
      const current = fused.get(entry.doc.id) || {
        id: entry.doc.id,
        type: entry.doc.type,
        path: entry.doc.path,
        name: entry.doc.name,
        kind: entry.doc.kind,
        score: 0,
        lexicalScore: 0,
        semanticScore: 0,
        excerpt: entry.doc.excerpt,
      };

      current.score += 1 / (60 + index + 1);
      if (kind === 'lexical') {
        current.lexicalScore = Math.max(current.lexicalScore, entry.score);
      } else {
        current.semanticScore = Math.max(current.semanticScore, entry.score);
      }
      fused.set(entry.doc.id, current);
    }
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = ((hash << 5) - hash + token.charCodeAt(index)) | 0;
    }
    return hash;
  }

  private symbolId(symbol: Symbol): string {
    return `symbol:${symbol.filePath}:${symbol.name}:${symbol.line}:${symbol.kind}`;
  }
}
