import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Command } from 'commander';
import { Formatter } from '../formatter.js';

export const setupCommand = new Command('setup')
  .description('Generate local MCP configuration snippets for editor setup')
  .action(async (_options, command) => {
    const globalOpts = command.parent?.opts() || {};
    const formatter = new Formatter(globalOpts.json);

    try {
      const cwd = process.cwd();
      const config = {
        mcpServers: {
          codexia: {
            command: 'npx',
            args: ['codexia', 'serve'],
            cwd,
          },
        },
      };

      const targetPath = path.join(cwd, '.codexia', 'codegraph', 'mcp-config.json');
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, JSON.stringify(config, null, 2), 'utf-8');

      if (globalOpts.json) {
        console.log(JSON.stringify({ path: targetPath, config }, null, 2));
        return;
      }

      console.log('\nWrote MCP config snippet to .codexia/codegraph/mcp-config.json');
      console.log('Point your editor MCP settings at `npx codexia serve`.\n');
    } catch (error) {
      console.error(formatter.formatError(error as Error));
      process.exit(1);
    }
  });
