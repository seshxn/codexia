import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import { AuthManager } from '../auth/auth-manager.js';
import { CodexiaEngine } from '../engine.js';
import type { GitHubAnalyticsServiceOptions } from '../../dashboard/server/github.js';
import type { JiraAnalyticsServiceOptions } from '../../dashboard/server/jira.js';

const resolveDashboardAnalyticsOptions = async (): Promise<{
  githubConfig?: GitHubAnalyticsServiceOptions;
  jiraConfig?: JiraAnalyticsServiceOptions;
}> => {
  const authManager = new AuthManager();

  let githubConfig: GitHubAnalyticsServiceOptions | undefined;
  let jiraConfig: JiraAnalyticsServiceOptions | undefined;

  try {
    const github = await authManager.resolveGitHubCredentials();
    if (github.token) {
      githubConfig = {
        env: process.env,
        token: github.token,
      };
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Skipping stored GitHub credentials for dashboard startup: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  try {
    const jira = await authManager.resolveJiraCredentials();
    if (jira.mode !== 'missing' && jira.baseUrl) {
      jiraConfig = {
        env: process.env,
        baseUrl: jira.baseUrl,
        email: jira.mode === 'basic' ? jira.email : undefined,
        apiToken: jira.mode === 'basic' ? jira.apiToken : undefined,
        bearerToken: jira.mode === 'bearer' ? jira.bearerToken : undefined,
      };
    }
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Skipping stored Jira credentials for dashboard startup: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  return { githubConfig, jiraConfig };
};

export const dashboardCommand = new Command('dashboard')
  .description('Open the workflow dashboard for repository analysis')
  .option('-p, --port <port>', 'Port to run the dashboard on', '3200')
  .option('--host <host>', 'Host to bind the dashboard server', '127.0.0.1')
  .option('-r, --repo <path>', 'Repository path to analyze (defaults to current directory)')
  .option('--open', 'Open the dashboard in your default browser')
  .option('--no-open', 'Do not open the browser automatically')
  .addHelpText('after', `
When to use:
  Use this when you want a browser view of repository analysis.

Depends on:
  A repository checkout; run \`codexia analyze\` or \`codexia update\` first if you want the latest local data.

Usually next:
  Use \`codexia status\` or \`codexia update\` from the CLI when the repo changes.

Examples:
  $ codexia dashboard --repo .
`)
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const host = options.host as string;
    const repoRoot = path.resolve((options.repo as string | undefined) || process.cwd());
    
    console.log(chalk.cyan('\n🚀 Starting Codexia Dashboard...\n'));
    
    try {
      const engine = new CodexiaEngine({ repoRoot });
      
      // Dynamically import the dashboard server
      const { startDashboard } = await import('../../dashboard/server/index.js');
      const analyticsOptions = await resolveDashboardAnalyticsOptions();
      
      await startDashboard(engine, port, options.open !== false, host, repoRoot, analyticsOptions);
      
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      console.log(chalk.green(`Dashboard is running at ${chalk.bold(`http://${displayHost}:${port}`)}`));
      console.log(chalk.gray(`Analyzing repository: ${repoRoot}`));
      console.log(chalk.gray('\nPress Ctrl+C to stop the server.\n'));
      
      // Keep the process running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nShutting down dashboard...'));
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk.red('Failed to start dashboard:'));
      console.error(error);
      process.exit(1);
    }
  });
