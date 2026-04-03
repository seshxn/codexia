import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthCommand } from './auth.js';

vi.mock('keytar', () => {
  const mock = {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  };

  return {
    default: mock,
  };
});

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));

vi.mock('chalk', () => {
  const passthrough = vi.fn((value: string) => value);
  passthrough.bold = passthrough;
  passthrough.cyan = passthrough;
  passthrough.green = passthrough;
  passthrough.yellow = passthrough;
  passthrough.red = passthrough;
  passthrough.gray = passthrough;
  passthrough.dim = passthrough;
  passthrough.white = passthrough;
  return {
    default: passthrough,
  };
});

const createManager = () => ({
  getStatus: vi.fn(),
  authenticateGitHub: vi.fn(),
  authenticateJira: vi.fn(),
  logout: vi.fn(),
});

describe('auth command', () => {
  const log = vi.fn();
  const error = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildCommand = (manager = createManager()) =>
    createAuthCommand({
      createManager: () => manager as never,
      log,
      error,
    });

  it('registers status, github, jira, and logout subcommands', () => {
    const command = buildCommand();

    expect(command.name()).toBe('auth');
    expect(command.commands.map((subcommand) => subcommand.name())).toEqual([
      'status',
      'doctor',
      'github',
      'jira',
      'logout',
    ]);
  });

  it('prints a redacted status summary with env and keychain sources', async () => {
    const manager = createManager();
    manager.getStatus.mockResolvedValue({
      github: {
        token: { source: 'env', isSet: true, display: 'set' },
        clientId: { source: 'missing', isSet: false, display: 'missing' },
      },
      jira: {
        baseUrl: { source: 'keychain', isSet: true, display: 'https://example.atlassian.net' },
        email: { source: 'env', isSet: true, display: 'jira@example.com' },
        apiToken: { source: 'keychain', isSet: true, display: 'set' },
        bearerToken: { source: 'missing', isSet: false, display: 'missing' },
        mode: 'basic',
      },
    });

    await buildCommand(manager).parseAsync(['node', 'codexia', 'status']);

    expect(manager.getStatus).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('GitHub');
    expect(log.mock.calls[0][0]).toContain('Token: set (env)');
    expect(log.mock.calls[0][0]).toContain('Jira');
    expect(log.mock.calls[0][0]).toContain('Base URL: https://example.atlassian.net (keychain)');
    expect(log.mock.calls[0][0]).toContain('API token: set (keychain)');
  });

  it('runs the GitHub auth flow and reports the chosen source', async () => {
    const manager = createManager();
    manager.authenticateGitHub.mockResolvedValue({
      token: 'ghp_device_token',
      source: 'device-flow',
    });

    await buildCommand(manager).parseAsync(['node', 'codexia', 'github']);

    expect(manager.authenticateGitHub).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('GitHub credentials are ready');
    expect(log.mock.calls[0][0]).toContain('device-flow');
  });

  it('prints readiness guidance from auth doctor', async () => {
    const manager = createManager();
    manager.getStatus.mockResolvedValue({
      github: {
        token: { source: 'missing', isSet: false, display: 'missing' },
        clientId: { source: 'missing', isSet: false, display: 'missing' },
      },
      jira: {
        baseUrl: { source: 'missing', isSet: false, display: 'missing' },
        email: { source: 'missing', isSet: false, display: 'missing' },
        apiToken: { source: 'missing', isSet: false, display: 'missing' },
        bearerToken: { source: 'missing', isSet: false, display: 'missing' },
        mode: 'missing',
      },
    });

    await buildCommand(manager).parseAsync(['node', 'codexia', 'doctor']);

    expect(manager.getStatus).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('Auth Doctor');
    expect(log.mock.calls[0][0]).toContain('GitHub: needs setup');
    expect(log.mock.calls[0][0]).toContain('Jira: needs setup');
  });

  it('runs the Jira auth flow and reports the chosen source', async () => {
    const manager = createManager();
    manager.authenticateJira.mockResolvedValue({
      baseUrl: 'https://example.atlassian.net',
      email: 'jira@example.com',
      apiToken: 'jira-token',
      bearerToken: null,
      mode: 'basic',
      source: 'prompt',
    });

    await buildCommand(manager).parseAsync(['node', 'codexia', 'jira']);

    expect(manager.authenticateJira).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('Jira credentials are ready');
    expect(log.mock.calls[0][0]).toContain('prompt');
  });

  it('forwards logout requests to the auth manager', async () => {
    const manager = createManager();
    manager.logout.mockResolvedValue({ github: true, jira: false });

    await buildCommand(manager).parseAsync(['node', 'codexia', 'logout', 'github']);

    expect(manager.logout).toHaveBeenCalledWith('github');
    expect(log.mock.calls[0][0]).toContain('Removed stored GitHub credentials');
  });
});
