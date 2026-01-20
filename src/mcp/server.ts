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
  private authToken: string | null = process.env.CODEXIA_MCP_TOKEN || null;
  private maxBodyBytes: number = Number(process.env.CODEXIA_MCP_MAX_BODY_BYTES || 1024 * 1024);
  private rateLimitWindowMs: number = Number(process.env.CODEXIA_MCP_RATE_LIMIT_WINDOW_MS || 60000);
  private rateLimitMax: number = Number(process.env.CODEXIA_MCP_RATE_LIMIT_MAX || 120);
  private rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

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

    const tool = this.getTools().find(t => t.name === name);
    if (!tool) {
      return {
        content: [{
          type: 'text',
          text: `Unknown tool: ${name}`,
        }],
      };
    }

    const validationErrors = this.validateToolParams(tool, params);
    if (validationErrors.length > 0) {
      return {
        content: [{
          type: 'json',
          json: {
            status: 'error',
            message: 'Invalid tool parameters',
            errors: validationErrors,
          },
        }],
      };
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
    const graphData = await this.engine.getGraphData({ focus: params.file as string });

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
    if (!this.isValidRequest(request)) {
      return {
        jsonrpc: '2.0',
        id: request?.id ?? null,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };
    }

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
  startHttpServer(port: number = 3100, host: string = process.env.CODEXIA_MCP_HOST || '127.0.0.1'): void {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      if (pathname !== '/mcp' && pathname !== '/') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      if (this.isRateLimited(req)) {
        this.logSecurityEvent('mcp.rate_limit', req, { path: pathname });
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Too Many Requests' },
        }));
        return;
      }

      if (!this.isAuthorized(req)) {
        this.logSecurityEvent('mcp.unauthorized', req, { path: pathname });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Unauthorized' },
        }));
        return;
      }

      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        this.logSecurityEvent('mcp.invalid_content_type', req, { contentType });
        res.writeHead(415, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Content-Type must be application/json' },
        }));
        return;
      }

      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > this.maxBodyBytes) {
          this.logSecurityEvent('mcp.request_too_large', req, { size: body.length });
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32600, message: 'Request too large' },
          }));
          req.destroy();
        }
      });
      req.on('end', async () => {
        try {
          const request = JSON.parse(body) as MCPRequest;
          const response = await this.handleRequest(request);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          this.logSecurityEvent('mcp.parse_error', req, { error: error instanceof Error ? error.message : 'Unknown error' });
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

    server.listen(port, host, () => {
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      console.log(`Codexia MCP Server running on http://${displayHost}:${port}`);
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

  private isAuthorized(req: IncomingMessage): boolean {
    if (!this.authToken) {
      return true;
    }

    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers['x-codexia-token'];
    const token = typeof tokenHeader === 'string' ? tokenHeader : null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length) === this.authToken;
    }

    if (token) {
      return token === this.authToken;
    }

    return false;
  }

  private isRateLimited(req: IncomingMessage): boolean {
    const key = this.getClientKey(req);
    const now = Date.now();
    const bucket = this.rateLimitBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      this.rateLimitBuckets.set(key, { count: 1, resetAt: now + this.rateLimitWindowMs });
      return false;
    }

    bucket.count += 1;
    return bucket.count > this.rateLimitMax;
  }

  private getClientKey(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    return ip || 'unknown';
  }

  private logSecurityEvent(event: string, req: IncomingMessage, context?: Record<string, unknown>): void {
    const entry = {
      event,
      time: new Date().toISOString(),
      ip: this.getClientKey(req),
      method: req.method,
      path: req.url,
      ...context,
    };
    console.warn(`[security] ${JSON.stringify(entry)}`);
  }

  private isValidRequest(request: MCPRequest): boolean {
    if (!request || request.jsonrpc !== '2.0') {
      return false;
    }

    if (typeof request.method !== 'string' || request.method.length === 0) {
      return false;
    }

    if (request.id === undefined || request.id === null) {
      return false;
    }

    return true;
  }

  private validateToolParams(tool: MCPTool, params: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const schema = tool.inputSchema;
    const required = new Set(schema.required || []);

    for (const req of required) {
      if (!(req in params)) {
        errors.push(`Missing required field: ${req}`);
      }
    }

    for (const [key, value] of Object.entries(params)) {
      const property = schema.properties[key];
      if (!property) {
        errors.push(`Unknown field: ${key}`);
        continue;
      }

      const type = property.type;
      if (type === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`Field ${key} must be an array`);
          continue;
        }
      } else if (type === 'number') {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`Field ${key} must be a number`);
          continue;
        }
      } else if (typeof value !== type) {
        errors.push(`Field ${key} must be a ${type}`);
        continue;
      }

      if (property.enum && value !== undefined && !property.enum.includes(value as string)) {
        errors.push(`Field ${key} must be one of: ${property.enum.join(', ')}`);
      }
    }

    return errors;
  }
}

/**
 * Start MCP server based on mode
 */
export async function startMCPServer(
  mode: 'http' | 'stdio' = 'stdio',
  port?: number,
  host?: string
): Promise<void> {
  const server = new CodexiaMCPServer();

  if (mode === 'http') {
    server.startHttpServer(port, host);
  } else {
    await server.runStdio();
  }
}
