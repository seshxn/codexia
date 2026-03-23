import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'yaml';

export interface TeamConfig {
  name: string;
  repos: string[];
  github?: {
    org?: string;
    team?: string;
  };
  jira?: {
    boardIds?: number[];
    projectKeys?: string[];
  };
  deployments?: {
    environments?: string[];
    workflows?: string[];
    branches?: string[];
  };
  incidents?: {
    projectKeys?: string[];
    issueTypes?: string[];
    labels?: string[];
    jql?: string;
  };
}

export interface TeamConfigFile {
  teams: TeamConfig[];
}

export interface TeamConfigStatus {
  enabled: boolean;
  path: string;
  message: string;
  teams: TeamConfig[];
}

const CONFIG_FILE = 'codexia.teams.yaml';
const ENV_CONFIG_KEY = 'CODEXIA_DASHBOARD_TEAMS_JSON';

export class TeamConfigLoader {
  constructor(
    private readonly repoRoot: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async load(): Promise<TeamConfigStatus> {
    const filePath = path.join(this.repoRoot, CONFIG_FILE);
    const envConfig = this.env[ENV_CONFIG_KEY]?.trim();

    if (envConfig) {
      const teams = this.parseTeams(envConfig, 'environment');

      return {
        enabled: teams.length > 0,
        path: ENV_CONFIG_KEY,
        message: teams.length > 0
          ? `Loaded ${teams.length} team mapping${teams.length === 1 ? '' : 's'} from environment variable ${ENV_CONFIG_KEY}.`
          : `No teams are defined in environment variable ${ENV_CONFIG_KEY}.`,
        teams,
      };
    }

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const teams = this.parseTeams(raw, CONFIG_FILE, true);

      return {
        enabled: teams.length > 0,
        path: filePath,
        message: teams.length > 0
          ? `Loaded ${teams.length} team mapping${teams.length === 1 ? '' : 's'} from ${CONFIG_FILE}.`
          : `No teams are defined in ${CONFIG_FILE}.`,
        teams,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          enabled: false,
          path: filePath,
          message: `Set ${ENV_CONFIG_KEY} or create ${CONFIG_FILE} to enable multi-team engineering intelligence.`,
          teams: [],
        };
      }

      throw error;
    }
  }

  private parseTeams(raw: string, source: string, isYaml = false): TeamConfig[] {
    const parsed = isYaml
      ? parse(raw)
      : JSON.parse(raw);

    const teamEntries = Array.isArray(parsed)
      ? parsed
      : (parsed as TeamConfigFile | null)?.teams || [];

    if (!Array.isArray(teamEntries)) {
      throw new Error(`Invalid team configuration in ${source}. Expected an array or { teams: [...] } object.`);
    }

    return this.normalizeTeams(teamEntries);
  }

  private normalizeTeams(input: unknown[]): TeamConfig[] {
    return input.map((entry, index) => this.normalizeTeam(entry, index));
  }

  private normalizeTeam(input: unknown, index: number): TeamConfig {
    if (!input || typeof input !== 'object') {
      throw new Error(`Invalid team definition at index ${index}.`);
    }

    const record = input as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) {
      throw new Error(`Team definition at index ${index} is missing a name.`);
    }

    const repos = this.normalizeStringArray(record.repos);
    if (repos.length === 0) {
      throw new Error(`Team "${name}" must define at least one repo.`);
    }

    return {
      name,
      repos,
      github: this.normalizeGithub(record.github),
      jira: this.normalizeJira(record.jira),
      deployments: this.normalizeDeployments(record.deployments),
      incidents: this.normalizeIncidents(record.incidents),
    };
  }

  private normalizeGithub(input: unknown): TeamConfig['github'] | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const record = input as Record<string, unknown>;
    const org = typeof record.org === 'string' ? record.org.trim() : undefined;
    const team = typeof record.team === 'string' ? record.team.trim() : undefined;
    return org || team ? { org, team } : undefined;
  }

  private normalizeJira(input: unknown): TeamConfig['jira'] | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const record = input as Record<string, unknown>;
    const boardIds = this.normalizeNumberArray(record.boardIds);
    const projectKeys = this.normalizeStringArray(record.projectKeys).map((value) => value.toUpperCase());
    return boardIds.length > 0 || projectKeys.length > 0
      ? { boardIds: boardIds.length > 0 ? boardIds : undefined, projectKeys: projectKeys.length > 0 ? projectKeys : undefined }
      : undefined;
  }

  private normalizeDeployments(input: unknown): TeamConfig['deployments'] | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const record = input as Record<string, unknown>;
    const environments = this.normalizeStringArray(record.environments);
    const workflows = this.normalizeStringArray(record.workflows);
    const branches = this.normalizeStringArray(record.branches);
    return environments.length > 0 || workflows.length > 0 || branches.length > 0
      ? {
          environments: environments.length > 0 ? environments : undefined,
          workflows: workflows.length > 0 ? workflows : undefined,
          branches: branches.length > 0 ? branches : undefined,
        }
      : undefined;
  }

  private normalizeIncidents(input: unknown): TeamConfig['incidents'] | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const record = input as Record<string, unknown>;
    const projectKeys = this.normalizeStringArray(record.projectKeys).map((value) => value.toUpperCase());
    const issueTypes = this.normalizeStringArray(record.issueTypes);
    const labels = this.normalizeStringArray(record.labels);
    const jql = typeof record.jql === 'string' && record.jql.trim() ? record.jql.trim() : undefined;
    return projectKeys.length > 0 || issueTypes.length > 0 || labels.length > 0 || jql
      ? {
          projectKeys: projectKeys.length > 0 ? projectKeys : undefined,
          issueTypes: issueTypes.length > 0 ? issueTypes : undefined,
          labels: labels.length > 0 ? labels : undefined,
          jql,
        }
      : undefined;
  }

  private normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private normalizeNumberArray(input: unknown): number[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((value) => (typeof value === 'number' ? value : Number.parseInt(String(value), 10)))
      .filter((value) => Number.isFinite(value) && value > 0);
  }
}
