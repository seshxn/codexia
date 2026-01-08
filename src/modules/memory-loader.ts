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

    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.slice(3).toLowerCase();
      } else if (line.startsWith('- ') && currentSection === 'layers') {
        const match = line.match(/- \*\*(.+)\*\*: (.+)/);
        if (match) {
          layers.push({
            name: match[1],
            description: match[2],
            paths: [],
            allowedDependencies: [],
          });
        }
      } else if (line.startsWith('- ') && currentSection === 'entry points') {
        entryPoints.push(line.slice(2).trim());
      }
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
