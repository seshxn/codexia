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
  private sessionStarted = false;
  private sessionFinalized = false;
  private authToken: string | null = process.env.CODEXIA_MCP_TOKEN || null;
  private maxBodyBytes: number = Number(process.env.CODEXIA_MCP_MAX_BODY_BYTES || 1024 * 1024);
  private rateLimitWindowMs: number = Number(process.env.CODEXIA_MCP_RATE_LIMIT_WINDOW_MS || 60000);
  private rateLimitMax: number = Number(process.env.CODEXIA_MCP_RATE_LIMIT_MAX || 120);
  private rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(repoRoot?: string) {
    this.engine = new CodexiaEngine({ repoRoot });
    const finalize = async (): Promise<void> => {
      if (this.sessionFinalized) {
        return;
      }
      this.sessionFinalized = true;
      await this.engine.finalizeLearningSession();
    };

    process.once('beforeExit', () => {
      void finalize();
    });
    process.once('SIGINT', () => {
      void finalize().finally(() => process.exit(0));
    });
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
      {
        name: 'codexia/drift',
        description: 'Analyze architecture drift score, velocity, layer heatmap, and emergent conventions',
        inputSchema: {
          type: 'object',
          properties: {
            commits: {
              type: 'number',
              description: 'Number of recent commits for drift trajectory (default: 20)',
            },
          },
        },
      },
      {
        name: 'query',
        description: 'Search files and symbols in the indexed repository',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'semantic_search',
        description: 'Hybrid lexical and semantic search across files and symbols',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'semantic_search_nodes_tool',
        description: 'Compatibility alias for semantic search',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'impact',
        description: 'Return blast radius grouped by dependency depth',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              description: 'Changed files to analyze',
              items: { type: 'string' },
            },
            depth: {
              type: 'number',
              description: 'Maximum dependency depth',
            },
            staged: {
              type: 'boolean',
              description: 'Use staged changes when files are omitted',
            },
          },
        },
      },
      {
        name: 'review_context',
        description: 'Return token-efficient review context for changed files and their blast radius',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              description: 'Specific files to review',
              items: { type: 'string' },
            },
            staged: {
              type: 'boolean',
              description: 'Use staged changes when files are omitted',
            },
            depth: {
              type: 'number',
              description: 'Blast radius depth',
            },
          },
        },
      },
      {
        name: 'get_review_context_tool',
        description: 'Compatibility alias for review_context',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              description: 'Specific files to review',
              items: { type: 'string' },
            },
            staged: {
              type: 'boolean',
              description: 'Use staged changes when files are omitted',
            },
            depth: {
              type: 'number',
              description: 'Blast radius depth',
            },
          },
        },
      },
      {
        name: 'context',
        description: 'Get structural and temporal context for a file or symbol',
        inputSchema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Symbol name',
            },
            file: {
              type: 'string',
              description: 'File path',
            },
            includeHistory: {
              type: 'boolean',
              description: 'Include git history and co-change data',
            },
          },
        },
      },
      {
        name: 'detect_changes',
        description: 'Map working tree or staged changes to graph entities',
        inputSchema: {
          type: 'object',
          properties: {
            staged: {
              type: 'boolean',
              description: 'Inspect staged changes instead of the working tree',
            },
          },
        },
      },
      {
        name: 'cypher',
        description: 'Execute a read-only Cypher query against the persisted graph',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Cypher query',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'history',
        description: 'Get temporal history for a file or symbol',
        inputSchema: {
          type: 'object',
          properties: {
            symbol_or_file: {
              type: 'string',
              description: 'File path or symbol name',
            },
          },
          required: ['symbol_or_file'],
        },
      },
      {
        name: 'co_changes',
        description: 'List files that frequently change with the given file',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path',
            },
            min_confidence: {
              type: 'number',
              description: 'Minimum confidence threshold',
            },
          },
          required: ['file'],
        },
      },
      {
        name: 'volatility',
        description: 'Return volatility and fragility signals for a file set',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              description: 'Files to inspect',
              items: { type: 'string' },
            },
          },
          required: ['files'],
        },
      },
      {
        name: 'plan',
        description: 'Recommend a file-read order based on prior successful sessions',
        inputSchema: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'Task description',
            },
          },
          required: ['task'],
        },
      },
      {
        name: 'locate',
        description: 'Predict which files match a natural language intent',
        inputSchema: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              description: 'Natural language intent',
            },
          },
          required: ['intent'],
        },
      },
      {
        name: 'embed_graph',
        description: 'Build the local semantic index used for semantic search',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'embed_graph_tool',
        description: 'Compatibility alias for embed_graph',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'docs_section',
        description: 'Retrieve a named documentation section from README/docs',
        inputSchema: {
          type: 'object',
          properties: {
            section_name: {
              type: 'string',
              description: 'Heading or file-style section name',
            },
          },
          required: ['section_name'],
        },
      },
      {
        name: 'get_docs_section_tool',
        description: 'Compatibility alias for docs_section',
        inputSchema: {
          type: 'object',
          properties: {
            section_name: {
              type: 'string',
              description: 'Heading or file-style section name',
            },
          },
          required: ['section_name'],
        },
      },
      {
        name: 'graph_stats',
        description: 'Return graph size, freshness, and semantic-index health',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_graph_stats_tool',
        description: 'Compatibility alias for graph_stats',
        inputSchema: {
          type: 'object',
          properties: {},
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
      if (!this.sessionStarted) {
        await this.engine.beginLearningSession(this.deriveTaskDescription(name, params));
        this.sessionStarted = true;
      }

      let result: MCPToolResult;
      switch (name) {
        case 'codexia/scan':
          result = await this.handleScan(params);
          break;
        case 'codexia/impact':
          result = await this.handleImpact(params);
          break;
        case 'codexia/context':
          result = await this.handleContext(params);
          break;
        case 'codexia/validate':
          result = await this.handleValidate(params);
          break;
        case 'codexia/signals':
          result = await this.handleSignals(params);
          break;
        case 'codexia/tests':
          result = await this.handleTests(params);
          break;
        case 'codexia/dependencies':
          result = await this.handleDependencies(params);
          break;
        case 'codexia/hotpaths':
          result = await this.handleHotPaths(params);
          break;
        case 'codexia/complexity':
          result = await this.handleComplexity(params);
          break;
        case 'codexia/memory':
          result = await this.handleMemory(params);
          break;
        case 'codexia/drift':
          result = await this.handleDrift(params);
          break;
        case 'query':
          result = await this.handleQuery(params);
          break;
        case 'semantic_search':
        case 'semantic_search_nodes_tool':
          result = await this.handleSemanticSearch(params);
          break;
        case 'impact':
          result = await this.handleCodeGraphImpact(params);
          break;
        case 'review_context':
        case 'get_review_context_tool':
          result = await this.handleReviewContext(params);
          break;
        case 'context':
          result = await this.handleCodeGraphContext(params);
          break;
        case 'detect_changes':
          result = await this.handleDetectChanges(params);
          break;
        case 'cypher':
          result = await this.handleCypher(params);
          break;
        case 'history':
          result = await this.handleHistory(params);
          break;
        case 'co_changes':
          result = await this.handleCoChanges(params);
          break;
        case 'volatility':
          result = await this.handleVolatility(params);
          break;
        case 'plan':
          result = await this.handlePlan(params);
          break;
        case 'locate':
          result = await this.handleLocate(params);
          break;
        case 'embed_graph':
        case 'embed_graph_tool':
          result = await this.handleEmbedGraph();
          break;
        case 'docs_section':
        case 'get_docs_section_tool':
          result = await this.handleDocsSection(params);
          break;
        case 'graph_stats':
        case 'list_graph_stats_tool':
          result = await this.handleGraphStats();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      await this.engine.recordToolActivity(
        name,
        params,
        this.extractFilesRead(params, result),
        this.extractFilesEdited(params, result)
      );
      return result;
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

  private async handleQuery(params: Record<string, unknown>): Promise<MCPToolResult> {
    const results = await this.engine.queryGraph(params.query as string, params.limit as number | undefined);
    return {
      content: [{
        type: 'json',
        json: {
          results,
        },
      }],
    };
  }

  private async handleSemanticSearch(params: Record<string, unknown>): Promise<MCPToolResult> {
    const results = await this.engine.semanticSearch(params.query as string, params.limit as number | undefined);
    return {
      content: [{
        type: 'json',
        json: {
          results,
        },
      }],
    };
  }

  private async handleCodeGraphImpact(params: Record<string, unknown>): Promise<MCPToolResult> {
    const files = Array.isArray(params.files) ? params.files as string[] : [];
    const blastRadius = files.length > 0
      ? await this.engine.getBlastRadius(files, Number(params.depth || 2))
      : (await this.engine.detectChanges({ staged: params.staged as boolean })).files;

    return {
      content: [{
        type: 'json',
        json: {
          depthGroups: blastRadius,
        },
      }],
    };
  }

  private async handleCodeGraphContext(params: Record<string, unknown>): Promise<MCPToolResult> {
    const context = await this.engine.getCodeContext({
      symbol: params.symbol as string | undefined,
      file: params.file as string | undefined,
      includeHistory: params.includeHistory as boolean | undefined,
    });

    return {
      content: [{
        type: 'json',
        json: context,
      }],
    };
  }

  private async handleReviewContext(params: Record<string, unknown>): Promise<MCPToolResult> {
    const reviewContext = await this.engine.getReviewContext({
      files: Array.isArray(params.files) ? params.files as string[] : undefined,
      staged: params.staged as boolean | undefined,
      depth: params.depth as number | undefined,
    });

    return {
      content: [{
        type: 'json',
        json: reviewContext,
      }],
    };
  }

  private async handleDetectChanges(params: Record<string, unknown>): Promise<MCPToolResult> {
    const changes = await this.engine.detectChanges({
      staged: params.staged as boolean | undefined,
    });

    return {
      content: [{
        type: 'json',
        json: changes,
      }],
    };
  }

  private async handleCypher(params: Record<string, unknown>): Promise<MCPToolResult> {
    const rows = await this.engine.executePseudoCypher(params.query as string);
    return {
      content: [{
        type: 'json',
        json: rows,
      }],
    };
  }

  private async handleHistory(params: Record<string, unknown>): Promise<MCPToolResult> {
    const target = params.symbol_or_file as string;
    const result = await this.engine.getHistoryDetails(target);

    return {
      content: [{
        type: 'json',
        json: result,
      }],
    };
  }

  private async handleCoChanges(params: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.engine.getCoChanges(
      params.file as string,
      params.min_confidence as number | undefined
    );

    return {
      content: [{
        type: 'json',
        json: {
          file: params.file,
          results: result,
        },
      }],
    };
  }

  private async handleVolatility(params: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.engine.getVolatility(params.files as string[]);
    return {
      content: [{
        type: 'json',
        json: {
          results: result,
        },
      }],
    };
  }

  private async handlePlan(params: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.engine.planTask(params.task as string);
    return {
      content: [{
        type: 'json',
        json: {
          task: params.task,
          plan: result,
        },
      }],
    };
  }

  private async handleLocate(params: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.engine.locateIntent(params.intent as string);
    return {
      content: [{
        type: 'json',
        json: {
          intent: params.intent,
          files: result,
        },
      }],
    };
  }

  private async handleEmbedGraph(): Promise<MCPToolResult> {
    const result = await this.engine.embedGraph();
    return {
      content: [{
        type: 'json',
        json: result,
      }],
    };
  }

  private async handleDocsSection(params: Record<string, unknown>): Promise<MCPToolResult> {
    const result = await this.engine.getDocsSection(params.section_name as string);
    return {
      content: [{
        type: 'json',
        json: result,
      }],
    };
  }

  private async handleGraphStats(): Promise<MCPToolResult> {
    const result = await this.engine.getGraphStats();
    return {
      content: [{
        type: 'json',
        json: result,
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

  private async handleDrift(params: Record<string, unknown>): Promise<MCPToolResult> {
    const commits = typeof params.commits === 'number' ? params.commits : undefined;
    const drift = await this.engine.analyzeDrift({ commits });

    return {
      content: [{
        type: 'json',
        json: drift,
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
      let bodyTooLarge = false;
      req.on('data', chunk => {
        body += chunk;
        if (body.length > this.maxBodyBytes) {
          bodyTooLarge = true;
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
        if (bodyTooLarge) {
          return;
        }
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

  private deriveTaskDescription(name: string, params: Record<string, unknown>): string {
    if (typeof params.task === 'string' && params.task.trim().length > 0) {
      return params.task;
    }
    if (typeof params.intent === 'string' && params.intent.trim().length > 0) {
      return params.intent;
    }
    if (typeof params.query === 'string' && params.query.trim().length > 0) {
      return params.query;
    }
    if (typeof params.symbol === 'string' && params.symbol.trim().length > 0) {
      return `Inspect symbol ${params.symbol}`;
    }
    if (typeof params.file === 'string' && params.file.trim().length > 0) {
      return `Inspect file ${params.file}`;
    }
    return `MCP tool session started with ${name}`;
  }

  private extractFilesRead(params: Record<string, unknown>, result: MCPToolResult): string[] {
    const paramFiles = new Set<string>();
    for (const key of ['file', 'symbol_or_file']) {
      const value = params[key];
      if (typeof value === 'string' && value.includes('/')) {
        paramFiles.add(value);
      }
    }

    const jsonContent = result.content.find((entry) => entry.type === 'json')?.json as Record<string, unknown> | undefined;
    const collect = (value: unknown): void => {
      if (typeof value === 'string' && value.includes('/')) {
        paramFiles.add(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          if (key === 'file' || key === 'path') {
            collect(nested);
          }
        }
      }
    };

    collect(jsonContent);
    return Array.from(paramFiles);
  }

  private extractFilesEdited(params: Record<string, unknown>, result: MCPToolResult): string[] {
    const jsonContent = result.content.find((entry) => entry.type === 'json')?.json as Record<string, unknown> | undefined;
    const files = new Set<string>();

    const add = (value: unknown): void => {
      if (typeof value === 'string' && value.includes('/')) {
        files.add(value);
      }
    };

    if (Array.isArray(params.files)) {
      for (const file of params.files) {
        add(file);
      }
    }

    if (jsonContent && Array.isArray(jsonContent.files)) {
      for (const item of jsonContent.files as Array<Record<string, unknown>>) {
        add(item.path);
      }
    }

    return Array.from(files);
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

export const startMCPServer = async (mode: 'http' | 'stdio' = 'stdio', port?: number, host?: string): Promise<void> => {
  const server = new CodexiaMCPServer();

  if (mode === 'http') {
    server.startHttpServer(port, host);
  } else {
    await server.runStdio();
  }
};
