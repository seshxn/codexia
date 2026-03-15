import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CodeGraphStats, RepoRegistryEntry, RepoStatus } from './types.js';

const GLOBAL_DIR = path.join(os.homedir(), '.codexia');
const REGISTRY_PATH = path.join(GLOBAL_DIR, 'registry.json');
const LOCAL_DIR = path.join('.codexia', 'codegraph');
const STATE_PATH = path.join(LOCAL_DIR, 'state.json');
const STALE_MS = 24 * 60 * 60 * 1000;

interface RepoState {
  lastAnalyzedAt?: string;
  lastUpdatedAt?: string;
  stats?: CodeGraphStats;
}

const readJsonFile = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
};

export class CodeGraphRegistry {
  constructor(private readonly repoRoot: string) {}

  private getLocalStatePath(): string {
    return path.join(this.repoRoot, STATE_PATH);
  }

  async listRepos(): Promise<RepoRegistryEntry[]> {
    const entries = await readJsonFile<RepoRegistryEntry[]>(REGISTRY_PATH, []);
    return entries.sort((a, b) => a.repoName.localeCompare(b.repoName));
  }

  async registerRepo(stats?: CodeGraphStats): Promise<RepoRegistryEntry> {
    const entries = await this.listRepos();
    const now = new Date().toISOString();
    const repoName = path.basename(this.repoRoot);
    const existing = entries.find((entry) => entry.repoRoot === this.repoRoot);
    const entry: RepoRegistryEntry = {
      repoRoot: this.repoRoot,
      repoName,
      registeredAt: existing?.registeredAt || now,
      lastAnalyzedAt: now,
      lastUpdatedAt: now,
      stats: stats || existing?.stats,
    };

    const nextEntries = entries.filter((item) => item.repoRoot !== this.repoRoot);
    nextEntries.push(entry);
    await writeJsonFile(REGISTRY_PATH, nextEntries);

    await writeJsonFile(this.getLocalStatePath(), {
      lastAnalyzedAt: now,
      lastUpdatedAt: now,
      stats,
    } satisfies RepoState);

    return entry;
  }

  async updateRepoState(update: {
    analyzedAt?: string;
    updatedAt?: string;
    stats?: CodeGraphStats;
  }): Promise<void> {
    const entries = await this.listRepos();
    const currentState = await readJsonFile<RepoState>(this.getLocalStatePath(), {});
    const existing = entries.find((entry) => entry.repoRoot === this.repoRoot);
    const nextState: RepoState = {
      lastAnalyzedAt: update.analyzedAt || currentState.lastAnalyzedAt,
      lastUpdatedAt: update.updatedAt || currentState.lastUpdatedAt,
      stats: update.stats || currentState.stats,
    };

    if (existing) {
      const nextEntries = entries.map((entry) =>
        entry.repoRoot === this.repoRoot
          ? {
              ...entry,
              lastAnalyzedAt: nextState.lastAnalyzedAt,
              lastUpdatedAt: nextState.lastUpdatedAt,
              stats: nextState.stats,
            }
          : entry
      );
      await writeJsonFile(REGISTRY_PATH, nextEntries);
    }

    await writeJsonFile(this.getLocalStatePath(), nextState);
  }

  async unregisterRepo(): Promise<void> {
    const entries = await this.listRepos();
    await writeJsonFile(
      REGISTRY_PATH,
      entries.filter((entry) => entry.repoRoot !== this.repoRoot)
    );

    try {
      await fs.rm(path.join(this.repoRoot, LOCAL_DIR), { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  async getStatus(sessionCount: number): Promise<RepoStatus> {
    const state = await readJsonFile<RepoState>(this.getLocalStatePath(), {});
    const lastTouch = state.lastUpdatedAt || state.lastAnalyzedAt;
    const isStale = lastTouch ? Date.now() - new Date(lastTouch).getTime() > STALE_MS : true;

    return {
      repoRoot: this.repoRoot,
      repoName: path.basename(this.repoRoot),
      analyzed: Boolean(state.lastAnalyzedAt),
      lastAnalyzedAt: state.lastAnalyzedAt,
      lastUpdatedAt: state.lastUpdatedAt,
      sessionsRecorded: sessionCount,
      stats: state.stats,
      isStale,
    };
  }
}
