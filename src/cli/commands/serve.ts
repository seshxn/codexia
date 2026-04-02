import { Command } from 'commander';
import chalk from 'chalk';
import { Formatter } from '../formatter.js';

export const serveCommand = new Command('serve')
  .description('Primary MCP entry point for the Integrate workflow')
  .option('--http', 'Run over HTTP instead of stdio')
  .option('-p, --port <port>', 'HTTP port', '3000')
  .option('--host <host>', 'Host to bind the HTTP server', '127.0.0.1')
  .addHelpText('after', `
When to use:
  Start this when an editor or agent needs direct MCP access to the repository.

Depends on:
  A repository checkout; run \`codexia analyze\` or \`codexia update\` first if you want the index current.

Usually next:
  For stdio, have the editor or client launch \`codexia serve\`. For HTTP, point the client at the running endpoint.

Examples:
  $ codexia serve
  $ codexia serve --http --port 3000

Compatibility:
  $ codexia mcp-server                Legacy alias for codexia serve
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const { startMCPServer } = await import('../../mcp/server.js');
      const transport = options.http ? 'http' : 'stdio';
      await startMCPServer(transport, options.http ? options.port : undefined, options.host);

      if (options.http) {
        console.error(chalk.green(`Codexia MCP server listening on http://${options.host}:${options.port}/mcp`));
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
