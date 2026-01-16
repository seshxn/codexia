#!/usr/bin/env node
/**
 * Codexia MCP Server
 * 
 * Model Context Protocol server that exposes Codexia's analysis capabilities
 * to AI assistants like Claude, GPT, and other MCP-compatible tools.
 * 
 * Run with: npx codexia mcp-server
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { CodexiaEngine } from '../cli/engine.js';

// ============================================================================
// MCP Types
// ============================================================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, MCPPropertySchema>;
    required?: string[];
  };
}

export interface MCPPropertySchema {
  type: string;
  description: string;
  items?: { type: string };
  enum?: string[];
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'json';
    text?: string;
    json?: unknown;
  }>;
}

// ============================================================================
// MCP Server
// ============================================================================

export class CodexiaMCPServer {
  private engine: CodexiaEngine;
  private initialized = false;

  constructor(repoRoot?: string) {
    this.engine = new CodexiaEngine({ repoRoot });
  }

  /**
   * Get available tools
   */
  getTools(): MCPTool[] {
    return [
      {
        name: 'codexia/scan',
        description: 'Scan and index the repository to understand its structure, symbols, and dependencies',
        inputSchema: {
          type: 'object',
          properties: {
            force: {
              type: 'boolean',
              description: 'Force re-indexing even if cache exists',
            },
          },
        },
      },
      {
        name: 'codexia/impact',
        description: 'Analyze the impact of code changes - what modules are affected, risk score, breaking changes',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              description: 'Specific files to analyze (optional - analyzes staged/uncommitted if not provided)',
              items: { type: 'string' },
            },
            staged: {
              type: 'boolean',
              description: 'Analyze only staged changes',
            },
            base: {
              type: 'string',
              description: 'Base ref for comparison (default: HEAD)',
            },
          },
        },
      },
      {
        name: 'codexia/context',
        description: 'Get rich context about a symbol, file, or code area - useful for understanding before making changes',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name to get context for',
            },
            file: {
              type: 'string',
              description: 'File path to get context for',
            },
            includeHistory: {
              type: 'boolean',
              description: 'Include git history and temporal insights',
            },
          },
        },
      },
      {
        name: 'codexia/validate',
        description: 'Validate code changes against conventions, invariants, and architectural rules',
        inputSchema: {
          type: 'object',
          properties: {
            staged: {
              type: 'boolean',
              description: 'Validate only staged changes',
            },
            checkInvariants: {
              type: 'boolean',
              description: 'Check architectural invariants',
            },
            checkConventions: {
              type: 'boolean',
              description: 'Check naming and code conventions',
            },
          },
        },
      },
      {
        name: 'codexia/signals',
        description: 'Get code quality signals - orphan code, god classes, circular dependencies, complexity issues',
        inputSchema: {
          type: 'object',
          properties: {
            types: {
              type: 'array',
              description: 'Signal types to check: orphans, god-classes, cycles, complexity',
              items: { type: 'string' },
            },
            file: {
              type: 'string',
              description: 'Check signals for a specific file',
            },
          },
        },
      },
      {
        name: 'codexia/tests',
        description: 'Get test suggestions and prioritization for code changes',
        inputSchema: {
          type: 'object',
          properties: {
            staged: {
              type: 'boolean',
              description: 'Suggest tests for staged changes',
            },
            prioritize: {
              type: 'boolean',
              description: 'Return tests in priority order',
            },
          },
        },
      },
      {
        name: 'codexia/dependencies',
        description: 'Get dependency information - what depends on what, import/export relationships',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Get dependencies for a specific file',
            },
            direction: {
              type: 'string',
              description: 'Direction: "imports" (what this file imports) or "importedBy" (what imports this file)',
              enum: ['imports', 'importedBy', 'both'],
            },
            depth: {
              type: 'number',
              description: 'Depth for transitive dependencies',
            },
          },
        },
      },
      {
        name: 'codexia/hotpaths',
        description: 'Get hot paths - critical code paths that are high-risk to modify',
        inputSchema: {
          type: 'object',
          properties: {
            checkImpact: {
              type: 'boolean',
              description: 'Check if current changes affect hot paths',
            },
          },
        },
      },
      {
        name: 'codexia/complexity',
        description: 'Get complexity analysis for files - cyclomatic, cognitive, maintainability scores',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File to analyze',
            },
            threshold: {
              type: 'number',
              description: 'Only return files above this complexity threshold',
            },
          },
        },
      },
      {
        name: 'codexia/memory',
        description: 'Access project memory - architecture, conventions, invariants, ADRs',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              description: 'Which memory section to retrieve',
              enum: ['architecture', 'conventions', 'invariants', 'adrs', 'all'],
            },
          },
        },
      },
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    // Ensure engine is initialized
    if (!this.initialized) {
      await this.engine.initialize();
      this.initialized = true;
    }

    try {
      switch (name) {
        case 'codexia/scan':
          return this.handleScan(params);
        case 'codexia/impact':
          return this.handleImpact(params);
        case 'codexia/context':
          return this.handleContext(params);
        case 'codexia/validate':
          return this.handleValidate(params);
        case 'codexia/signals':
          return this.handleSignals(params);
        case 'codexia/tests':
          return this.handleTests(params);
        case 'codexia/dependencies':
          return this.handleDependencies(params);
        case 'codexia/hotpaths':
          return this.handleHotPaths(params);
        case 'codexia/complexity':
          return this.handleComplexity(params);
        case 'codexia/memory':
          return this.handleMemory(params);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
      };
    }
  }

  private async handleScan(_params: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.engine.scan();
    
    return {
      content: [{
        type: 'json',
        json: {
          status: 'success',
          stats: result.stats,
          hasMemory: result.hasMemory,
          duration: result.duration,
        },
      }],
    };
  }

  private async handleImpact(params: Record<string, unknown>): Promise<MCPToolResult> {
    const impact = await this.engine.analyzeImpact({
      staged: params.staged as boolean,
      base: params.base as string,
    });

    return {
      content: [{
        type: 'json',
        json: {
          riskScore: impact.riskScore,
          directlyChanged: impact.directlyChanged.map(c => ({
            symbol: c.symbol.name,
            file: c.symbol.filePath,
            type: c.changeType,
            kind: c.symbol.kind,
          })),
          affectedModules: impact.affectedModules.map(m => ({
            path: m.path,
            reason: m.reason,
            distance: m.distance,
          })),
          publicApiChanges: impact.publicApiChanges,
          boundaryViolations: impact.boundaryViolations,
        },
      }],
    };
  }

  private async handleContext(params: Record<string, unknown>): Promise<MCPToolResult> {
    const context: Record<string, unknown> = {};

    // Basic context about the file or symbol
    if (params.file) {
      const analysis = await this.engine.analyzeComplexity(params.file as string);
      context.file = {
        path: params.file,
        complexity: analysis.files?.[0]?.metrics,
      };
    }

    if (params.symbol) {
      context.symbol = {
        name: params.symbol,
        note: 'Symbol lookup - use scan for full symbol information',
      };
    }

    return {
      content: [{
        type: 'json',
        json: context,
      }],
    };
  }

  private async handleValidate(params: Record<string, unknown>): Promise<MCPToolResult> {
    const violations = await this.engine.checkConventions({
      staged: params.staged as boolean,
    });

    return {
      content: [{
        type: 'json',
        json: {
          passed: violations.length === 0,
          violations: violations.map(v => ({
            file: v.filePath,
            line: v.line,
            rule: v.convention.id,
            message: v.message,
            severity: v.convention.severity,
            suggestion: v.suggestion,
          })),
        },
      }],
    };
  }

  private async handleSignals(_params: Record<string, unknown>): Promise<MCPToolResult> {
    const signals = await this.engine.analyzeSignals({});

    return {
      content: [{
        type: 'json',
        json: {
          signals: signals.map(s => ({
            type: s.type,
            severity: s.severity,
            message: s.message,
            file: s.filePath,
            evidence: s.evidence,
          })),
        },
      }],
    };
  }

  private async handleTests(params: Record<string, unknown>): Promise<MCPToolResult> {
    const suggestions = await this.engine.suggestTests({
      staged: params.staged as boolean,
    });

    return {
      content: [{
        type: 'json',
        json: {
          suggestions: suggestions.map(s => ({
            targetFile: s.targetFile,
            targetSymbol: s.targetSymbol,
            testFile: s.testFile,
            testType: s.testType,
            priority: s.priority,
            reason: s.reason,
          })),
        },
      }],
    };
  }

  private async handleDependencies(params: Record<string, unknown>): Promise<MCPToolResult> {
    // Use the graph data method to get dependency information
    const graphData = await this.engine.getGraphData(params.file as string);

    return {
      content: [{
        type: 'json',
        json: graphData,
      }],
    };
  }

  private async handleHotPaths(_params: Record<string, unknown>): Promise<MCPToolResult> {
    const paths = await this.engine.analyzeHotPaths({ autoDetect: true });

    return {
      content: [{
        type: 'json',
        json: paths,
      }],
    };
  }

  private async handleComplexity(params: Record<string, unknown>): Promise<MCPToolResult> {
    const complexity = await this.engine.analyzeComplexity(params.file as string);

    return {
      content: [{
        type: 'json',
        json: complexity,
      }],
    };
  }

  private async handleMemory(_params: Record<string, unknown>): Promise<MCPToolResult> {
    const memory = await this.engine.getMemory();

    return {
      content: [{
        type: 'json',
        json: memory,
      }],
    };
  }

  /**
   * Handle JSON-RPC request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'codexia',
                version: '0.2.0',
              },
              capabilities: {
                tools: {},
              },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.getTools(),
            },
          };

        case 'tools/call':
          const toolResult = await this.executeTool(
            params?.name as string,
            params?.arguments as Record<string, unknown> || {}
          );
          return {
            jsonrpc: '2.0',
            id,
            result: toolResult,
          };

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }
  }

  /**
   * Start HTTP server for MCP
   */
  startHttpServer(port: number = 3100): void {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const request = JSON.parse(body) as MCPRequest;
          const response = await this.handleRequest(request);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
            },
          }));
        }
      });
    });

    server.listen(port, () => {
      console.log(`Codexia MCP Server running on http://localhost:${port}`);
      console.log('Available tools:');
      for (const tool of this.getTools()) {
        console.log(`  - ${tool.name}: ${tool.description}`);
      }
    });
  }

  /**
   * Run in stdio mode (for direct MCP integration)
   */
  async runStdio(): Promise<void> {
    const readline = await import('node:readline');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await this.handleRequest(request);
        console.log(JSON.stringify(response));
      } catch (error) {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
          },
        }));
      }
    });
  }
}

/**
 * Start MCP server based on mode
 */
export async function startMCPServer(
  mode: 'http' | 'stdio' = 'stdio',
  port?: number
): Promise<void> {
  const server = new CodexiaMCPServer();

  if (mode === 'http') {
    server.startHttpServer(port);
  } else {
    await server.runStdio();
  }
}
