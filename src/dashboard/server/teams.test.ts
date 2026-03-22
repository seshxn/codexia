import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { TeamConfigLoader } from './teams.js';

describe('TeamConfigLoader', () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('returns a disabled config when codexia.teams.yaml is missing', async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexia-teams-'));

    const loader = new TeamConfigLoader(tempDir);
    const result = await loader.load();

    expect(result.enabled).toBe(false);
    expect(result.teams).toEqual([]);
    expect(result.message).toContain('codexia.teams.yaml');
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
