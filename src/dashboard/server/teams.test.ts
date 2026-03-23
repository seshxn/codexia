import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { TeamConfigLoader } from './teams.js';

describe('TeamConfigLoader', () => {
  let tempDir: string | null = null;
  const originalTeamsJson = process.env.CODEXIA_DASHBOARD_TEAMS_JSON;

  afterEach(async () => {
    if (originalTeamsJson === undefined) {
      delete process.env.CODEXIA_DASHBOARD_TEAMS_JSON;
    } else {
      process.env.CODEXIA_DASHBOARD_TEAMS_JSON = originalTeamsJson;
    }

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('returns a disabled config when no team config is defined', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-teams-'));

    const loader = new TeamConfigLoader(tempDir);
    const result = await loader.load();

    expect(result.enabled).toBe(false);
    expect(result.teams).toEqual([]);
    expect(result.message).toContain('CODEXIA_DASHBOARD_TEAMS_JSON');
  });

  it('loads team mappings from CODEXIA_DASHBOARD_TEAMS_JSON without a yaml file', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-teams-'));
    process.env.CODEXIA_DASHBOARD_TEAMS_JSON = JSON.stringify({
      teams: [
        {
          name: 'Platform',
          repos: ['acme/api', 'acme/web'],
          github: { org: 'acme', team: 'platform' },
          jira: { boardIds: [12], projectKeys: ['plat'] },
          deployments: { environments: ['production'] },
          incidents: { projectKeys: ['ops'], issueTypes: ['Incident'] },
        },
      ],
    });

    const loader = new TeamConfigLoader(tempDir);
    const result = await loader.load();

    expect(result.enabled).toBe(true);
    expect(result.message).toContain('environment');
    expect(result.teams).toMatchObject([
      {
        name: 'Platform',
        repos: ['acme/api', 'acme/web'],
        github: { org: 'acme', team: 'platform' },
        jira: { boardIds: [12], projectKeys: ['PLAT'] },
        deployments: { environments: ['production'] },
        incidents: { projectKeys: ['OPS'], issueTypes: ['Incident'] },
      },
    ]);
  });

  it('prefers CODEXIA_DASHBOARD_TEAMS_JSON over codexia.teams.yaml when both exist', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-teams-'));
    process.env.CODEXIA_DASHBOARD_TEAMS_JSON = JSON.stringify([
      {
        name: 'Env Team',
        repos: ['acme/env-service'],
      },
    ]);
    await fs.writeFile(
      path.join(tempDir, 'codexia.teams.yaml'),
      `teams:
  - name: Yaml Team
    repos:
      - acme/yaml-service
`,
      'utf8',
    );

    const loader = new TeamConfigLoader(tempDir);
    const result = await loader.load();

    expect(result.enabled).toBe(true);
    expect(result.teams).toMatchObject([
      {
        name: 'Env Team',
        repos: ['acme/env-service'],
      },
    ]);
  });

  it('parses team mappings, deployment selectors, and incident selectors', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-teams-'));
    await fs.writeFile(
      path.join(tempDir, 'codexia.teams.yaml'),
      `teams:
  - name: Platform
    repos:
      - acme/api
      - acme/web
    github:
      org: acme
      team: platform
    jira:
      boardIds: [12, 14]
      projectKeys: [PLAT, CORE]
    deployments:
      environments: [production]
      workflows: [deploy-api, deploy-web]
      branches: [main]
    incidents:
      projectKeys: [OPS]
      issueTypes: [Incident]
      labels: [sev1, production]
      jql: project = OPS
`,
      'utf8',
    );

    const loader = new TeamConfigLoader(tempDir);
    const result = await loader.load();

    expect(result.enabled).toBe(true);
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({
      name: 'Platform',
      repos: ['acme/api', 'acme/web'],
      github: { org: 'acme', team: 'platform' },
      jira: { boardIds: [12, 14], projectKeys: ['PLAT', 'CORE'] },
      deployments: { environments: ['production'], workflows: ['deploy-api', 'deploy-web'], branches: ['main'] },
      incidents: { projectKeys: ['OPS'], issueTypes: ['Incident'], labels: ['sev1', 'production'], jql: 'project = OPS' },
    });
  });

  it('rejects invalid team definitions without names or repos', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-teams-'));
    await fs.writeFile(
      path.join(tempDir, 'codexia.teams.yaml'),
      `teams:
  - name: Broken
    repos: []
`,
      'utf8',
    );

    const loader = new TeamConfigLoader(tempDir);

    await expect(loader.load()).rejects.toThrow(/at least one repo/i);
  });
});
