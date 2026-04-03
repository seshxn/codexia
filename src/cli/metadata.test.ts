import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCliProgram, cliVersion, shouldRunCli } from './index.js';
import { dashboardCommand } from './commands/dashboard.js';
import { driftCommand } from './commands/drift.js';
import { cognitiveLoadCommand } from './commands/cognitive-load.js';
import { authCommand } from './commands/auth.js';
import { jiraCommand } from './commands/jira.js';
import { engineeringCommand } from './commands/engineering.js';
import { repoCommand } from './commands/repo.js';
import { setupCommand } from './commands/setup.js';
import packageJson from '../../package.json' with { type: 'json' };

const cliIndexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8');

describe('CLI metadata', () => {
  it('sources the CLI version from package metadata instead of hard-coding it', () => {
    expect(cliVersion).toBe(packageJson.version);
    expect(cliIndexSource).toContain("new URL('../../package.json', import.meta.url)");
    expect(cliIndexSource).toContain("JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))");
    expect(cliIndexSource).not.toContain("with { type: 'json' }");
    expect(cliIndexSource).not.toContain("assert { type: 'json' }");
  });

  it('publishes serve at the top level and hides mcp-server as a compatibility alias', () => {
    const program = createCliProgram();
    const help = program.helpInformation();
    const visibleCommands = program.commands.filter((command) => !command._hidden).map((command) => command.name());
    const serve = program.commands.find((command) => command.name() === 'serve');
    const legacy = program.commands.find((command) => command.name() === 'mcp-server');

    expect(visibleCommands).toContain('serve');
    expect(visibleCommands).not.toContain('mcp-server');
    expect(help).toContain('serve');
    expect(help).not.toContain('mcp-server');
    expect(serve).toBeDefined();
    expect(serve?.description()).toContain('Primary MCP entry point');
    expect(serve?.description()).toContain('Integrate workflow');
    expect(legacy?._hidden).toBe(true);
    expect(legacy?.name()).toBe('mcp-server');
    expect(legacy?.description()).toMatch(/compatibility alias/i);
  });

  it('publishes the new analytics commands at the top level', () => {
    const program = createCliProgram();
    const visibleCommands = program.commands.filter((command) => !command._hidden).map((command) => command.name());

    expect(visibleCommands).toContain('drift');
    expect(visibleCommands).toContain('cognitive-load');
    expect(visibleCommands).toContain('auth');
    expect(visibleCommands).toContain('jira');
    expect(visibleCommands).toContain('engineering');
    expect(visibleCommands).toContain('repo');
  });

  it('treats symlinked bin paths as direct CLI execution', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'codexia-cli-'));
    const symlinkPath = join(tempDir, 'codexia');
    const cliModuleUrl = new URL('./index.ts', import.meta.url).href;

    try {
      symlinkSync(fileURLToPath(new URL('./index.ts', import.meta.url)), symlinkPath);

      expect(shouldRunCli(symlinkPath, cliModuleUrl)).toBe(true);
      expect(shouldRunCli(join(tempDir, 'not-codexia'), cliModuleUrl)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('describes setup and dashboard in workflow terms', () => {
    expect(setupCommand.description()).toContain('Integrate workflow');
    expect(dashboardCommand.description()).toContain('workflow');
    expect(driftCommand.description()).toContain('drift');
    expect(cognitiveLoadCommand.description()).toContain('cognitive load');
    expect(authCommand.description()).toContain('auth');
    expect(jiraCommand.description()).toContain('Jira analytics');
    expect(engineeringCommand.description()).toContain('engineering analytics');
    expect(repoCommand.description()).toContain('repository analytics');
  });
});
