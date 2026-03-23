import { afterEach, describe, expect, it } from 'vitest';
import { JiraAnalyticsService } from './jira.js';

describe('JiraAnalyticsService config', () => {
  const originalEnv = {
    CODEXIA_JIRA_BASE_URL: process.env.CODEXIA_JIRA_BASE_URL,
    CODEXIA_JIRA_EMAIL: process.env.CODEXIA_JIRA_EMAIL,
    CODEXIA_JIRA_API_TOKEN: process.env.CODEXIA_JIRA_API_TOKEN,
    CODEXIA_JIRA_BEARER_TOKEN: process.env.CODEXIA_JIRA_BEARER_TOKEN,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
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
});
