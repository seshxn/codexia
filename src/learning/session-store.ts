import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SessionRecord } from '../codegraph/types.js';

const SESSIONS_PATH = path.join('.codexia', 'codegraph', 'sessions.json');

const readSessions = async (repoRoot: string): Promise<SessionRecord[]> => {
  try {
    const content = await fs.readFile(path.join(repoRoot, SESSIONS_PATH), 'utf-8');
    return JSON.parse(content) as SessionRecord[];
  } catch {
    return [];
  }
};

const writeSessions = async (repoRoot: string, sessions: SessionRecord[]): Promise<void> => {
  const filePath = path.join(repoRoot, SESSIONS_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
};

export class SessionStore {
  private currentSession: SessionRecord | null = null;

  constructor(private readonly repoRoot: string) {}

  async startSession(taskDescription: string, headStart?: string): Promise<SessionRecord> {
    if (this.currentSession) {
      return this.currentSession;
    }

    const session: SessionRecord = {
      id: `session-${Date.now()}`,
      taskDescription,
      startedAt: new Date().toISOString(),
      outcome: 'abandoned',
      headStart,
      toolCalls: [],
      filesRead: [],
      filesEdited: [],
    };

    this.currentSession = session;
    return session;
  }

  async addToolCall(call: {
    tool: string;
    paramsSummary: string;
    filesRead?: string[];
    filesEdited?: string[];
  }): Promise<void> {
    if (!this.currentSession) {
      await this.startSession('MCP session');
    }

    const session = this.currentSession!;
    session.toolCalls.push({
      tool: call.tool,
      timestamp: new Date().toISOString(),
      paramsSummary: call.paramsSummary,
      filesRead: [...new Set(call.filesRead || [])],
      filesEdited: [...new Set(call.filesEdited || [])],
    });

    for (const file of call.filesRead || []) {
      if (!session.filesRead.some((entry) => entry.path === file)) {
        session.filesRead.push({
          path: file,
          order: session.filesRead.length + 1,
        });
      }
    }

    for (const file of call.filesEdited || []) {
      const existing = session.filesEdited.find((entry) => entry.path === file);
      if (existing) {
        existing.linesChanged += 1;
      } else {
        session.filesEdited.push({
          path: file,
          linesChanged: 1,
        });
      }
    }
  }

  async finalizeSession(details: {
    outcome: SessionRecord['outcome'];
    headEnd?: string;
    filesEdited?: Array<{ path: string; linesChanged: number }>;
  }): Promise<SessionRecord | null> {
    if (!this.currentSession) {
      return null;
    }

    const session = this.currentSession;
    session.endedAt = new Date().toISOString();
    session.outcome = details.outcome;
    session.headEnd = details.headEnd;

    for (const file of details.filesEdited || []) {
      const existing = session.filesEdited.find((entry) => entry.path === file.path);
      if (existing) {
        existing.linesChanged = Math.max(existing.linesChanged, file.linesChanged);
      } else {
        session.filesEdited.push(file);
      }
    }

    const sessions = await readSessions(this.repoRoot);
    sessions.push(session);
    await writeSessions(this.repoRoot, sessions);
    this.currentSession = null;
    return session;
  }

  async getSessions(): Promise<SessionRecord[]> {
    return readSessions(this.repoRoot);
  }

  async getSessionCount(): Promise<number> {
    const sessions = await this.getSessions();
    return sessions.length;
  }
}
