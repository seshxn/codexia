import { Command } from 'commander';
import { Formatter } from '../formatter.js';
import chalk from 'chalk';

export const mcpServerCommand = new Command('mcp-server')
  .description('Start MCP server for AI integration')
  .option('-p, --port <port>', 'HTTP port (uses stdio if not specified)')
  .option('--host <host>', 'Host to bind the HTTP server', '127.0.0.1')
  .option('--stdio', 'Use stdio transport (for direct MCP integration)')
  .option('--tools <tools>', 'Comma-separated list of tools to enable')
  .option('--verbose', 'Enable verbose logging')
  .addHelpText('after', `
Examples:
  $ codexia mcp-server                     Start with stdio (for Claude/etc)
  $ codexia mcp-server --port 3000         Start HTTP server on port 3000
  $ codexia mcp-server --tools scan,impact Enable specific tools only

Available MCP Tools:
  - scan          Scan repository and index all code
  - impact        Analyze change impact
  - context       Get intelligent context for a file
  - validate      Validate changes against conventions
  - signals       Get semantic signals
  - tests         Suggest affected tests
  - dependencies  Get dependency information
  - hotpaths      Analyze critical code paths
  - complexity    Get complexity metrics
  - memory        Access project memory
`)
  .action(async (options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      // Dynamic import to avoid loading MCP server when not needed
      const { startMCPServer } = await import('../../mcp/server.js');

      console.error(chalk.cyan('🤖 Starting Codexia MCP Server...\n'));

      if (options.port) {
        console.error(chalk.dim(`Mode: HTTP server on port ${options.port}`));
        console.error(chalk.dim('Endpoint: POST /mcp\n'));
      } else {
        console.error(chalk.dim('Mode: stdio (for direct MCP integration)'));
        console.error(chalk.dim('Connect via stdin/stdout\n'));
      }

      if (options.tools) {
        console.error(chalk.dim(`Enabled tools: ${options.tools}\n`));
      }

      // Start MCP server with appropriate transport
      const transport = options.port ? 'http' : 'stdio';
      const host = options.host as string;
      await startMCPServer(transport, options.port, host);

      // Keep process alive
      if (options.port) {
          console.error(chalk.green('✓ MCP Server running'));
        console.error(chalk.dim(`\nExample request:
        curl -X POST http://localhost:${options.port}/mcp \\
    -H "Content-Type: application/json" \\
    -d '{"method": "tools/call", "params": {"name": "codexia_scan"}}'
`));
      }
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
