import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraAnalyticsService } from './jira.js';

describe('JiraAnalyticsService config', () => {
  const originalEnv = {
    CODEXIA_JIRA_BASE_URL: process.env.CODEXIA_JIRA_BASE_URL,
    CODEXIA_JIRA_EMAIL: process.env.CODEXIA_JIRA_EMAIL,
    CODEXIA_JIRA_API_TOKEN: process.env.CODEXIA_JIRA_API_TOKEN,
    CODEXIA_JIRA_BEARER_TOKEN: process.env.CODEXIA_JIRA_BEARER_TOKEN,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('prefers injected Jira basic auth config over env defaults', () => {
    process.env.CODEXIA_JIRA_BASE_URL = '';
    process.env.CODEXIA_JIRA_EMAIL = 'env@example.com';
    process.env.CODEXIA_JIRA_API_TOKEN = 'env-secret';
    process.env.CODEXIA_JIRA_BEARER_TOKEN = '';

    const jira = new JiraAnalyticsService({
      baseUrl: 'https://example.atlassian.net',
      email: 'user@example.com',
      apiToken: 'secret',
    } as never);

    expect(jira.getConfig()).toEqual({
      enabled: true,
      baseUrl: 'https://example.atlassian.net',
      authMode: 'basic',
      message: 'Jira analytics is configured.',
    });
  });

  it('prefers injected Jira bearer config over env defaults', () => {
    process.env.CODEXIA_JIRA_BASE_URL = '';
    process.env.CODEXIA_JIRA_EMAIL = 'env@example.com';
    process.env.CODEXIA_JIRA_API_TOKEN = 'env-secret';
    process.env.CODEXIA_JIRA_BEARER_TOKEN = '';

    const jira = new JiraAnalyticsService({
      baseUrl: 'https://example.atlassian.net',
      bearerToken: 'bearer-secret',
    } as never);

    expect(jira.getConfig()).toEqual({
      enabled: true,
      baseUrl: 'https://example.atlassian.net',
      authMode: 'bearer',
      message: 'Jira analytics is configured.',
    });
  });

  it('reports missing base URL as disabled configuration', () => {
    const jira = new JiraAnalyticsService();

    expect(jira.getConfig()).toEqual({
      enabled: false,
      baseUrl: null,
      authMode: 'none',
      message: 'Set CODEXIA_JIRA_BASE_URL to enable Jira analytics.',
    });
  });

  it('reports configured basic auth when base URL and API token are present', () => {
    process.env.CODEXIA_JIRA_BASE_URL = 'https://example.atlassian.net';
    process.env.CODEXIA_JIRA_EMAIL = 'user@example.com';
    process.env.CODEXIA_JIRA_API_TOKEN = 'secret';

    const jira = new JiraAnalyticsService();

    expect(jira.getConfig()).toEqual({
      enabled: true,
      baseUrl: 'https://example.atlassian.net',
      authMode: 'basic',
      message: 'Jira analytics is configured.',
    });
  });

  it('falls back to /rest/api/2/field when /rest/api/3/field is unavailable', async () => {
    process.env.CODEXIA_JIRA_BASE_URL = 'https://example.atlassian.net';
    process.env.CODEXIA_JIRA_EMAIL = 'user@example.com';
    process.env.CODEXIA_JIRA_API_TOKEN = 'secret';

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/rest/api/3/field')) {
        return new Response('Not found', { status: 404 });
      }
      if (url.includes('/rest/api/2/field')) {
        return new Response(JSON.stringify([
          { id: 'customfield_10016', name: 'Story point estimate' },
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const jira = new JiraAnalyticsService();
    const fieldId = await (jira as unknown as { getStoryPointsFieldId: () => Promise<string | null> }).getStoryPointsFieldId();

    expect(fieldId).toBe('customfield_10016');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to /rest/api/2/search when /rest/api/3/search is unavailable', async () => {
    process.env.CODEXIA_JIRA_BASE_URL = 'https://example.atlassian.net';
    process.env.CODEXIA_JIRA_EMAIL = 'user@example.com';
    process.env.CODEXIA_JIRA_API_TOKEN = 'secret';

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/rest/api/3/search/jql')) {
        return new Response('Method not allowed', { status: 405 });
      }
      if (url.includes('/rest/api/2/search')) {
        return new Response(JSON.stringify({
          startAt: 0,
          maxResults: 100,
          total: 1,
          issues: [{
            key: 'PLAT-1',
            fields: {
              summary: 'Example',
              status: { name: 'Done', statusCategory: { key: 'done' } },
              resolutiondate: '2026-01-02T10:00:00Z',
              created: '2026-01-01T08:00:00Z',
              issuetype: { name: 'Story' },
              labels: [],
              project: { key: 'PLAT' },
            },
            changelog: {
              histories: [],
            },
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const jira = new JiraAnalyticsService();
    const report = await jira.getFlowSnapshot({
      projectKeys: ['PLAT'],
      lookbackDays: 30,
    });

    expect(report.issueCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
