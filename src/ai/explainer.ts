import type { AIProvider, AIExplanation } from './types.js';
import type { ImpactResult } from '../core/types.js';
import { buildImpactExplanationPrompt } from './prompts/impact-explain.js';
import { buildPrReviewPrompt, type PrReportData } from './prompts/pr-review.js';
import { buildPrDescriptionPrompt, type PrDescribeData } from './prompts/pr-describe.js';

/**
 * AI Explainer - generates natural language explanations for analysis results
 */
export class AIExplainer {
  constructor(private provider: AIProvider) {}

  /**
   * Explain impact analysis results in natural language
   */
  async explainImpact(impact: ImpactResult): Promise<AIExplanation> {
    const prompt = buildImpactExplanationPrompt(impact);
    
    try {
      const summary = await this.provider.complete(prompt, {
        maxTokens: 500,
        temperature: 0.3,
      });

      return {
        summary: summary.trim(),
      };
    } catch (error) {
      // Graceful fallback - return empty explanation on error
      return {
        summary: '',
        details: `AI explanation unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate AI-powered PR review summary
   */
  async reviewPr(data: PrReportData): Promise<AIExplanation> {
    const prompt = buildPrReviewPrompt(data);
    
    try {
      const summary = await this.provider.complete(prompt, {
        maxTokens: 800,
        temperature: 0.4,
      });

      return {
        summary: summary.trim(),
      };
    } catch (error) {
      return {
        summary: '',
        details: `AI review unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Generate a PR description from commits and impact analysis
   */
  async describePr(data: PrDescribeData): Promise<string> {
    const prompt = buildPrDescriptionPrompt(data);
    
    try {
      const description = await this.provider.complete(prompt, {
        maxTokens: 1500,
        temperature: 0.5,
      });

      return description.trim();
    } catch (error) {
      // Return a template on error
      return `## What
<!-- Describe what this PR does -->

## Why
<!-- Explain the motivation -->

## How
<!-- Technical implementation details -->

## Testing
<!-- How was this tested -->

_AI description generation failed: ${error instanceof Error ? error.message : 'Unknown error'}_`;
    }
  }

  /**
   * Answer a question about the codebase
   */
  async askQuestion(
    question: string,
    context: {
      architecture?: string;
      fileContext?: string;
      dependencies?: string;
    }
  ): Promise<string> {
    const contextParts: string[] = [];
    
    if (context.architecture) {
      contextParts.push(`## Project Architecture\n${context.architecture}`);
    }
    if (context.fileContext) {
      contextParts.push(`## Relevant Code\n${context.fileContext}`);
    }
    if (context.dependencies) {
      contextParts.push(`## Dependencies\n${context.dependencies}`);
    }

    const prompt = `You are an expert software engineer helping answer questions about a codebase.

${contextParts.join('\n\n')}

## Question
${question}

Provide a clear, helpful answer based on the context provided. If you don't have enough information to answer accurately, say so.`;

    try {
      const answer = await this.provider.complete(prompt, {
        maxTokens: 1000,
        temperature: 0.4,
      });

      return answer.trim();
    } catch (error) {
      return `Unable to answer: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}
