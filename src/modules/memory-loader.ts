import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { 
  ProjectMemory, 
  ArchitectureMemory, 
  ConventionMemory, 
  InvariantMemory,
  AdrMemory 
} from '../core/types.js';

export class MemoryLoader {
  private memoryDir: string;

  constructor(repoRoot: string) {
    this.memoryDir = path.join(repoRoot, '.codexia');
  }

  /**
   * Check if memory directory exists
   */
  async hasMemory(): Promise<boolean> {
    try {
      await fs.access(this.memoryDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load all project memory
   */
  async loadMemory(): Promise<ProjectMemory | null> {
    if (!(await this.hasMemory())) {
      return null;
    }

    const [architecture, conventions, invariants, adrs] = await Promise.all([
      this.loadArchitecture(),
      this.loadConventions(),
      this.loadInvariants(),
      this.loadAdrs(),
    ]);

    return {
      architecture,
      conventions,
      invariants,
      adrs,
    };
  }

  /**
   * Load architecture memory
   */
  async loadArchitecture(): Promise<ArchitectureMemory> {
    const filePath = path.join(this.memoryDir, 'architecture.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseArchitecture(content);
    } catch {
      return {
        layers: [],
        boundaries: [],
        entryPoints: [],
        criticalPaths: [],
      };
    }
  }

  /**
   * Load conventions memory
   */
  async loadConventions(): Promise<ConventionMemory> {
    const filePath = path.join(this.memoryDir, 'conventions.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseConventions(content);
    } catch {
      return {
        naming: [],
        structure: [],
        patterns: [],
      };
    }
  }

  /**
   * Load invariants memory
   */
  async loadInvariants(): Promise<InvariantMemory> {
    const filePath = path.join(this.memoryDir, 'invariants.md');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseInvariants(content);
    } catch {
      return {
        rules: [],
      };
    }
  }

  /**
   * Load ADRs
   */
  async loadAdrs(): Promise<AdrMemory[]> {
    const adrDir = path.join(this.memoryDir, 'adrs');
    try {
      const files = await fs.readdir(adrDir);
      const adrs: AdrMemory[] = [];

      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = await fs.readFile(path.join(adrDir, file), 'utf-8');
          const adr = this.parseAdr(content, file);
          if (adr) {
            adrs.push(adr);
          }
        }
      }

      return adrs;
    } catch {
      return [];
    }
  }

  private parseArchitecture(content: string): ArchitectureMemory {
    const layers: ArchitectureMemory['layers'] = [];
    const boundaries: ArchitectureMemory['boundaries'] = [];
    const entryPoints: string[] = [];
    const criticalPaths: string[] = [];

    const lines = content.split('\n');
    let currentSection = '';
    let currentLayer: ArchitectureMemory['layers'][0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('## ')) {
        // Save current layer if any
        if (currentLayer) {
          layers.push(currentLayer);
          currentLayer = null;
        }
        currentSection = line.slice(3).toLowerCase().trim();
      } else if (currentSection === 'layers' || currentSection.includes('architecture')) {
        // Parse layer definition: **LayerName**: Description
        const layerMatch = line.match(/^[-*]\s*\*\*(.+?)\*\*:\s*(.+)$/);
        if (layerMatch) {
          if (currentLayer) {
            layers.push(currentLayer);
          }
          currentLayer = {
            name: layerMatch[1].trim(),
            description: layerMatch[2].trim(),
            paths: [],
            allowedDependencies: [],
          };
        }
        // Parse paths (indented under layer): - path: `src/foo/**`
        else if (currentLayer) {
          const pathMatch = line.match(/^\s+[-*]\s*(?:path|folder|directory|location)s?:\s*`(.+?)`/i);
          if (pathMatch) {
            currentLayer.paths.push(pathMatch[1]);
          }
          // Also match simple path patterns in backticks
          const simplePathMatch = line.match(/^\s+[-*]\s*`([^`]+)`/);
          if (simplePathMatch && !pathMatch) {
            currentLayer.paths.push(simplePathMatch[1]);
          }
          // Parse allowed dependencies
          const depsMatch = line.match(/^\s+[-*]\s*(?:can\s+)?(?:depend|import)s?\s*(?:on)?:\s*(.+)/i);
          if (depsMatch) {
            const deps = depsMatch[1].split(/[,;]/).map(d => d.trim().replace(/`/g, '')).filter(Boolean);
            currentLayer.allowedDependencies.push(...deps);
          }
        }
      } else if (currentSection.includes('boundaries') || currentSection.includes('rules')) {
        // Parse boundary rules: **From** cannot import **To**: reason
        const boundaryMatch = line.match(/^[-*]\s*\*\*(.+?)\*\*\s*(cannot|must not|should not|can|may)\s*(?:import|depend on)\s*\*\*(.+?)\*\*(?::\s*(.+))?/i);
        if (boundaryMatch) {
          boundaries.push({
            from: boundaryMatch[1].trim(),
            to: boundaryMatch[3].trim(),
            allowed: !['cannot', 'must not', 'should not'].includes(boundaryMatch[2].toLowerCase()),
            reason: boundaryMatch[4]?.trim() || '',
          });
        }
      } else if (currentSection.includes('entry point')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const content = trimmed.replace(/^[-*]\s+/, '').trim();
          let entry: string | null = null;

          // Case 1: entire content is a single backticked value, e.g. - `src/index.ts`
          const backticked = content.match(/^`([^`]+)`$/);
          if (backticked) {
            entry = backticked[1].trim();
          } else if (!content.includes('`') && /^[\w./\\*-]+$/.test(content)) {
            // Case 2: bare path-like pattern without backticks, e.g. - src/index.ts
            entry = content;
          }

          if (entry) {
            entryPoints.push(entry);
          }
        }
      } else if (currentSection.includes('critical path')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const content = trimmed.replace(/^[-*]\s+/, '').trim();
          let criticalPath: string | null = null;

          // Case 1: entire content is a single backticked value, e.g. - `src/feature/**`
          const backticked = content.match(/^`([^`]+)`$/);
          if (backticked) {
            criticalPath = backticked[1].trim();
          } else if (!content.includes('`') && /^[\w./\\*-]+$/.test(content)) {
            // Case 2: bare path-like pattern without backticks
            criticalPath = content;
          }

          if (criticalPath) {
            criticalPaths.push(criticalPath);
          }
        }
      }
    }

    // Don't forget the last layer
    if (currentLayer) {
      layers.push(currentLayer);
    }

    return { layers, boundaries, entryPoints, criticalPaths };
  }

  private parseConventions(content: string): ConventionMemory {
    const naming: ConventionMemory['naming'] = [];
    const structure: ConventionMemory['structure'] = [];
    const patterns: ConventionMemory['patterns'] = [];

    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.slice(3).toLowerCase();
      } else if (line.startsWith('- ') && currentSection.includes('naming')) {
        const match = line.match(/- (.+): `(.+)`/);
        if (match) {
          naming.push({
            target: match[1],
            pattern: match[2],
            example: '',
          });
        }
      } else if (line.startsWith('- ') && currentSection.includes('structure')) {
        structure.push({
          description: line.slice(2).trim(),
          rule: '',
        });
      }
    }

    return { naming, structure, patterns };
  }

  private parseInvariants(content: string): InvariantMemory {
    const rules: InvariantMemory['rules'] = [];
    const lines = content.split('\n');

    let currentRule: { id: string; description: string; severity: 'critical' | 'high' | 'medium' } | null = null;

    for (const line of lines) {
      if (line.startsWith('### ')) {
        if (currentRule) {
          rules.push(currentRule);
        }
        currentRule = {
          id: line.slice(4).trim(),
          description: '',
          severity: 'high',
        };
      } else if (currentRule && line.trim() && !line.startsWith('#')) {
        currentRule.description += line.trim() + ' ';
      }
    }

    if (currentRule) {
      rules.push(currentRule);
    }

    return { rules };
  }

  private parseAdr(content: string, filename: string): AdrMemory | null {
    const lines = content.split('\n');
    const adr: Partial<AdrMemory> = {
      id: filename.replace('.md', ''),
      consequences: [],
    };

    let currentSection = '';

    for (const line of lines) {
      if (line.startsWith('# ')) {
        adr.title = line.slice(2).trim();
      } else if (line.startsWith('## ')) {
        currentSection = line.slice(3).toLowerCase();
      } else if (line.startsWith('**Status:**')) {
        const status = line.split(':')[1]?.trim().toLowerCase();
        if (status === 'accepted' || status === 'proposed' || status === 'deprecated' || status === 'superseded') {
          adr.status = status;
        }
      } else if (line.startsWith('**Date:**')) {
        adr.date = line.split(':')[1]?.trim() || '';
      } else if (currentSection === 'context' && line.trim()) {
        adr.context = (adr.context || '') + line.trim() + ' ';
      } else if (currentSection === 'decision' && line.trim()) {
        adr.decision = (adr.decision || '') + line.trim() + ' ';
      } else if (currentSection === 'consequences' && line.startsWith('- ')) {
        adr.consequences?.push(line.slice(2).trim());
      }
    }

    if (adr.title && adr.status) {
      return adr as AdrMemory;
    }

    return null;
  }
}
