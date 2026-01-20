import { Command } from 'commander';
import chalk from 'chalk';
import { CodexiaEngine } from '../engine.js';

export const dashboardCommand = new Command('dashboard')
  .description('Start the web dashboard for visualizing code analysis')
  .option('-p, --port <port>', 'Port to run the dashboard on', '3200')
  .option('--host <host>', 'Host to bind the dashboard server', '127.0.0.1')
  .option('--open', 'Open the dashboard in your default browser')
  .option('--no-open', 'Do not open the browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const host = options.host as string;
    
    console.log(chalk.cyan('\n🚀 Starting Codexia Dashboard...\n'));
    
    try {
      const engine = new CodexiaEngine();
      
      // Dynamically import the dashboard server
      const { startDashboard } = await import('../../dashboard/server/index.js');
      
      await startDashboard(engine, port, options.open !== false, host);
      
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      console.log(chalk.green(`Dashboard is running at ${chalk.bold(`http://${displayHost}:${port}`)}`));
      console.log(chalk.gray('\nPress Ctrl+C to stop the server.\n'));
      
      // Keep the process running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nShutting down dashboard...'));
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk.red('Failed to start dashboard:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
