import { Command } from 'commander';
import chalk from 'chalk';
import { Formatter } from '../formatter.js';

export const serveCommand = new Command('serve')
  .description('Start the MCP server using the CodeGraph command surface')
  .option('--http', 'Run over HTTP instead of stdio')
  .option('-p, --port <port>', 'HTTP port', '3000')
  .option('--host <host>', 'Host to bind the HTTP server', '127.0.0.1')
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const { startMCPServer } = await import('../../mcp/server.js');
      const transport = options.http ? 'http' : 'stdio';
      await startMCPServer(transport, options.http ? options.port : undefined, options.host);

      if (options.http) {
        console.error(chalk.green(`CodeGraph MCP server listening on http://${options.host}:${options.port}/mcp`));
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
