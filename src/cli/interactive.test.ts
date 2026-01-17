import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { selectCategory, selectCommand, getCommandOptions, executeCommand, runInteractiveWizard, runQuickCommand } from './interactive.js';
import * as inquirer from '@inquirer/prompts';
import { CodexiaEngine } from './engine.js';
import { Formatter } from './formatter.js';

// Mock dependencies
vi.mock('@inquirer/prompts');
vi.mock('./engine.js');
vi.mock('./formatter.js');
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
  })),
}));
vi.mock('boxen', () => ({
  default: vi.fn((content: string) => content),
}));
vi.mock('chalk', () => {
  const createChainableMock = () => {
    const fn = vi.fn((s: string) => s);
    fn.bold = fn;
    fn.dim = fn;
    fn.cyan = fn;
    fn.yellow = fn;
    fn.white = fn;
    fn.gray = fn;
    fn.green = fn;
    fn.red = fn;
    fn.blue = fn;
    return fn;
  };
  
  const chalk = createChainableMock();
  return {
    default: chalk,
  };
});
vi.mock('gradient-string', () => ({
  default: vi.fn(() => vi.fn((s: string) => s)),
}));

describe('Interactive Wizard', () => {
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockConfirm: ReturnType<typeof vi.fn>;
  let mockInput: ReturnType<typeof vi.fn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSelect = vi.fn();
    mockConfirm = vi.fn();
    mockInput = vi.fn();
    
    vi.mocked(inquirer.select).mockImplementation(mockSelect);
    vi.mocked(inquirer.confirm).mockImplementation(mockConfirm);
    vi.mocked(inquirer.input).mockImplementation(mockInput);

    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockRestore();
  });

  describe('selectCategory', () => {
    it('should prompt user with category choices', async () => {
      mockSelect.mockResolvedValue('analyze');
      
      const result = await selectCategory();
      
      expect(result).toBe('analyze');
      expect(mockSelect).toHaveBeenCalledOnce();
      expect(mockSelect.mock.calls[0][0]).toHaveProperty('message');
      expect(mockSelect.mock.calls[0][0]).toHaveProperty('choices');
      expect(mockSelect.mock.calls[0][0].choices.length).toBeGreaterThan(0);
    });

    it('should return the selected category value', async () => {
      const categories = ['analyze', 'reports', 'quality', 'testing', 'setup'];
      
      for (const category of categories) {
        mockSelect.mockResolvedValue(category);
        const result = await selectCategory();
        expect(result).toBe(category);
      }
    });
  });

  describe('selectCommand', () => {
    it('should prompt user with commands for the selected category', async () => {
      mockSelect.mockResolvedValue('scan');
      
      const result = await selectCommand('analyze');
      
      expect(result).toBe('scan');
      expect(mockSelect).toHaveBeenCalledOnce();
      expect(mockSelect.mock.calls[0][0]).toHaveProperty('message');
      expect(mockSelect.mock.calls[0][0]).toHaveProperty('choices');
    });

    it('should include a back option', async () => {
      mockSelect.mockResolvedValue('back');
      
      const result = await selectCommand('analyze');
      
      expect(result).toBe('back');
    });

    it('should throw error for invalid category', async () => {
      await expect(selectCommand('invalid-category')).rejects.toThrow('Invalid category');
    });

    it('should return selected command value', async () => {
      mockSelect.mockResolvedValue('graph');
      const result = await selectCommand('analyze');
      expect(result).toBe('graph');
    });
  });

  describe('getCommandOptions', () => {
    it('should gather options for impact command', async () => {
      mockConfirm.mockResolvedValue(true);
      
      const options = await getCommandOptions('impact');
      
      expect(options.staged).toBe(true);
      expect(mockConfirm).toHaveBeenCalled();
    });

    it('should gather options for graph command', async () => {
      mockInput.mockResolvedValue('src/index.ts');
      mockConfirm.mockResolvedValue(false);
      
      const options = await getCommandOptions('graph');
      
      expect(options.file).toBe('src/index.ts');
      expect(mockInput).toHaveBeenCalled();
    });

    it('should gather options for changelog command', async () => {
      mockInput.mockResolvedValueOnce('v1.0.0').mockResolvedValueOnce('HEAD');
      mockConfirm.mockResolvedValue(false);
      
      const options = await getCommandOptions('changelog');
      
      expect(options.from).toBe('v1.0.0');
      expect(options.to).toBe('HEAD');
      expect(mockInput).toHaveBeenCalledTimes(2);
    });

    it('should gather options for history command', async () => {
      mockInput.mockResolvedValue('src/test.ts');
      mockConfirm.mockResolvedValue(false);
      
      const options = await getCommandOptions('history');
      
      expect(options.file).toBe('src/test.ts');
    });

    it('should gather options for complexity command', async () => {
      mockInput.mockResolvedValue('src/');
      mockConfirm.mockResolvedValue(true);
      
      const options = await getCommandOptions('complexity');
      
      expect(options.file).toBe('src/');
      expect(options.json).toBe(true);
    });

    it('should add json option for format commands when user confirms', async () => {
      mockConfirm.mockResolvedValue(true);
      
      const options = await getCommandOptions('scan');
      
      expect(options.json).toBe(true);
    });

    it('should not add json option when user declines', async () => {
      mockConfirm.mockResolvedValue(false);
      
      const options = await getCommandOptions('scan');
      
      expect(options.json).toBeUndefined();
    });

    it('should return empty options for commands without specific prompts', async () => {
      const options = await getCommandOptions('init');
      
      expect(Object.keys(options)).toHaveLength(0);
    });
  });

  describe('executeCommand', () => {
    let mockEngine: any;
    let mockFormatter: any;

    beforeEach(() => {
      mockEngine = {
        scan: vi.fn().mockResolvedValue({ files: [], dependencies: [] }),
        analyzeImpact: vi.fn().mockResolvedValue({ directlyChanged: [], affectedModules: [] }),
        getStagedDiff: vi.fn().mockResolvedValue({ files: [] }),
        getDiff: vi.fn().mockResolvedValue({ files: [] }),
        analyzeSignals: vi.fn().mockResolvedValue({ signals: [] }),
        checkConventions: vi.fn().mockResolvedValue({ violations: [] }),
        suggestTests: vi.fn().mockResolvedValue({ suggestions: [] }),
        initialize: vi.fn().mockResolvedValue(undefined),
        getGraphData: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
        analyzeComplexity: vi.fn().mockResolvedValue({
          summary: {
            totalFiles: 10,
            averageMaintainability: 75,
            filesNeedingAttention: 2,
            criticalFiles: 0,
          },
          recommendations: [],
        }),
        analyzeHistory: vi.fn().mockResolvedValue({
          summary: {
            filesAnalyzed: 10,
            hotspotCount: 3,
            riskFileCount: 1,
            staleFileCount: 2,
          },
        }),
        checkInvariants: vi.fn().mockResolvedValue({
          passed: true,
          rulesChecked: 5,
          passedRules: 5,
          violations: [],
        }),
        analyzeHotPaths: vi.fn().mockResolvedValue({
          summary: {
            totalPaths: 15,
            criticalPaths: 2,
            highPaths: 5,
            mediumPaths: 8,
          },
        }),
        generateChangelog: vi.fn().mockResolvedValue({
          sections: [],
          stats: { commits: 10, additions: 100, deletions: 50, contributors: [] },
        }),
        getLatestTag: vi.fn().mockResolvedValue('v1.0.0'),
        analyzeMonorepo: vi.fn().mockResolvedValue({
          type: 'npm',
          packages: ['package-a', 'package-b'],
        }),
        generatePrReport: vi.fn().mockResolvedValue({ summary: 'test' }),
      };

      mockFormatter = {
        formatScan: vi.fn().mockReturnValue('formatted scan'),
        formatImpact: vi.fn().mockReturnValue('formatted impact'),
        formatSignals: vi.fn().mockReturnValue('formatted signals'),
        formatConventions: vi.fn().mockReturnValue('formatted conventions'),
        formatTests: vi.fn().mockReturnValue('formatted tests'),
        formatPrReport: vi.fn().mockReturnValue('formatted pr report'),
        formatError: vi.fn().mockReturnValue('formatted error'),
      };

      vi.mocked(CodexiaEngine).mockImplementation(() => mockEngine);
      vi.mocked(Formatter).mockImplementation(() => mockFormatter);
    });

    it('should execute scan command', async () => {
      await executeCommand('scan', {});
      
      expect(mockEngine.scan).toHaveBeenCalledOnce();
      expect(mockFormatter.formatScan).toHaveBeenCalled();
    });

    it('should execute impact command with staged option', async () => {
      await executeCommand('impact', { staged: true });
      
      expect(mockEngine.getStagedDiff).toHaveBeenCalled();
      expect(mockEngine.analyzeImpact).toHaveBeenCalledWith({ staged: true });
    });

    it('should execute impact command without staged option', async () => {
      await executeCommand('impact', { staged: false });
      
      expect(mockEngine.getDiff).toHaveBeenCalled();
      expect(mockEngine.analyzeImpact).toHaveBeenCalledWith({ staged: false });
    });

    it('should execute signals command', async () => {
      await executeCommand('signals', {});
      
      expect(mockEngine.analyzeSignals).toHaveBeenCalled();
      expect(mockFormatter.formatSignals).toHaveBeenCalled();
    });

    it('should execute check command', async () => {
      await executeCommand('check', {});
      
      expect(mockEngine.checkConventions).toHaveBeenCalled();
      expect(mockFormatter.formatConventions).toHaveBeenCalled();
    });

    it('should execute tests command', async () => {
      await executeCommand('tests', {});
      
      expect(mockEngine.suggestTests).toHaveBeenCalled();
      expect(mockFormatter.formatTests).toHaveBeenCalled();
    });

    it('should execute graph command', async () => {
      await executeCommand('graph', { file: 'src/test.ts' });
      
      expect(mockEngine.initialize).toHaveBeenCalled();
      expect(mockEngine.getGraphData).toHaveBeenCalledWith('src/test.ts');
    });

    it('should execute complexity command with json output', async () => {
      const jsonSpy = vi.spyOn(JSON, 'stringify');
      await executeCommand('complexity', { json: true });
      
      expect(mockEngine.analyzeComplexity).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalled();
      jsonSpy.mockRestore();
    });

    it('should execute complexity command with formatted output', async () => {
      await executeCommand('complexity', { json: false });
      
      expect(mockEngine.analyzeComplexity).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });

    it('should execute history command', async () => {
      await executeCommand('history', { file: 'src/test.ts' });
      
      expect(mockEngine.analyzeHistory).toHaveBeenCalledWith({ file: 'src/test.ts' });
    });

    it('should execute invariants command', async () => {
      await executeCommand('invariants', {});
      
      expect(mockEngine.checkInvariants).toHaveBeenCalled();
    });

    it('should execute hotpaths command', async () => {
      await executeCommand('hotpaths', {});
      
      expect(mockEngine.analyzeHotPaths).toHaveBeenCalled();
    });

    it('should execute changelog command with from and to options', async () => {
      await executeCommand('changelog', { from: 'v1.0.0', to: 'HEAD' });
      
      expect(mockEngine.generateChangelog).toHaveBeenCalledWith({
        from: 'v1.0.0',
        to: 'HEAD',
      });
    });

    it('should execute changelog command with auto-detected from', async () => {
      await executeCommand('changelog', { from: '', to: 'HEAD' });
      
      expect(mockEngine.getLatestTag).toHaveBeenCalled();
      expect(mockEngine.generateChangelog).toHaveBeenCalled();
    });

    it('should execute monorepo command', async () => {
      await executeCommand('monorepo', {});
      
      expect(mockEngine.analyzeMonorepo).toHaveBeenCalled();
    });

    it('should execute pr-report command', async () => {
      await executeCommand('pr-report', {});
      
      expect(mockEngine.generatePrReport).toHaveBeenCalled();
      expect(mockFormatter.formatPrReport).toHaveBeenCalled();
    });

    it('should handle init command and create config file', async () => {
      // Just test that the command runs without error
      // The actual file system interaction is tested through integration
      await executeCommand('init', {});
      
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle watch command info display', async () => {
      await executeCommand('watch', {});
      
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle mcp-server command info display', async () => {
      await executeCommand('mcp-server', {});
      
      expect(console.log).toHaveBeenCalled();
    });

    it('should handle unimplemented commands', async () => {
      await executeCommand('unknown-command', {});
      
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not yet implemented'));
    });

    it('should handle errors gracefully', async () => {
      mockEngine.scan.mockRejectedValue(new Error('Test error'));
      
      await executeCommand('scan', {});
      
      expect(mockFormatter.formatError).toHaveBeenCalled();
    });
  });

  describe('runInteractiveWizard', () => {
    let mockEngine: any;
    let mockFormatter: any;

    beforeEach(() => {
      mockEngine = {
        scan: vi.fn().mockResolvedValue({ files: [], dependencies: [] }),
      };
      mockFormatter = {
        formatScan: vi.fn().mockReturnValue('formatted'),
      };
      vi.mocked(CodexiaEngine).mockImplementation(() => mockEngine);
      vi.mocked(Formatter).mockImplementation(() => mockFormatter);
    });

    it('should run the full wizard flow', async () => {
      mockSelect.mockResolvedValueOnce('analyze').mockResolvedValueOnce('scan');
      mockConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
      
      await runInteractiveWizard();
      
      expect(mockSelect).toHaveBeenCalled();
      expect(mockConfirm).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalled();
    });

    it('should allow running multiple commands', async () => {
      mockSelect
        .mockResolvedValueOnce('analyze')
        .mockResolvedValueOnce('scan')
        .mockResolvedValueOnce('analyze')
        .mockResolvedValueOnce('graph');
      mockInput.mockResolvedValue('');
      mockConfirm
        .mockResolvedValueOnce(false) // json for scan
        .mockResolvedValueOnce(true)  // run another
        .mockResolvedValueOnce(false) // json for graph
        .mockResolvedValueOnce(false); // don't run another
      
      mockEngine.initialize = vi.fn().mockResolvedValue(undefined);
      mockEngine.getGraphData = vi.fn().mockResolvedValue({ nodes: [], edges: [] });

      await runInteractiveWizard();
      
      expect(mockSelect).toHaveBeenCalledTimes(4);
      expect(mockEngine.scan).toHaveBeenCalled();
    });

    it('should handle back navigation', async () => {
      mockSelect
        .mockResolvedValueOnce('analyze')
        .mockResolvedValueOnce('back')
        .mockResolvedValueOnce('reports')
        .mockResolvedValueOnce('impact');
      mockConfirm
        .mockResolvedValueOnce(false) // staged
        .mockResolvedValueOnce(false) // json
        .mockResolvedValueOnce(false); // don't run another
      
      mockEngine.analyzeImpact = vi.fn().mockResolvedValue({});
      mockEngine.getDiff = vi.fn().mockResolvedValue({ files: [] });
      mockFormatter.formatImpact = vi.fn().mockReturnValue('formatted');

      await runInteractiveWizard();
      
      expect(mockSelect).toHaveBeenCalledTimes(4);
    });

    it('should handle ExitPromptError gracefully', async () => {
      const exitError = new Error('User cancelled');
      exitError.name = 'ExitPromptError';
      mockSelect.mockRejectedValue(exitError);
      
      await expect(runInteractiveWizard()).resolves.not.toThrow();
    });

    it('should propagate non-exit errors', async () => {
      const error = new Error('Unexpected error');
      mockSelect.mockRejectedValue(error);
      
      await expect(runInteractiveWizard()).rejects.toThrow('Unexpected error');
    });
  });

  describe('runQuickCommand', () => {
    let mockEngine: any;
    let mockFormatter: any;

    beforeEach(() => {
      mockEngine = {
        scan: vi.fn().mockResolvedValue({ files: [], dependencies: [] }),
      };
      mockFormatter = {
        formatScan: vi.fn().mockReturnValue('formatted'),
      };
      vi.mocked(CodexiaEngine).mockImplementation(() => mockEngine);
      vi.mocked(Formatter).mockImplementation(() => mockFormatter);
    });

    it('should display all commands and execute selected one', async () => {
      mockSelect.mockResolvedValue('scan');
      mockConfirm.mockResolvedValue(false);
      
      await runQuickCommand();
      
      expect(mockSelect).toHaveBeenCalledOnce();
      expect(mockEngine.scan).toHaveBeenCalled();
    });

    it('should handle ExitPromptError without throwing', async () => {
      const exitError = new Error('User cancelled');
      exitError.name = 'ExitPromptError';
      mockSelect.mockRejectedValue(exitError);
      
      await expect(runQuickCommand()).resolves.not.toThrow();
    });

    it('should propagate non-exit errors', async () => {
      const error = new Error('Unexpected error');
      mockSelect.mockRejectedValue(error);
      
      await expect(runQuickCommand()).rejects.toThrow('Unexpected error');
    });
  });
});
