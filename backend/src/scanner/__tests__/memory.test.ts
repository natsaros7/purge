import { describe, it, expect } from 'vitest';
import { scanMemory } from '../memory.js';

const MOCK_VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               25000.
Pages active:                            200000.
Pages inactive:                          150000.
Pages speculative:                        10000.
Pages throttled:                              0.
Pages wired down:                         80000.
Pages purgeable:                           1000.
"Translation faults":                  1000000.
Pages copy-on-write:                      40000.
Pages zero filled:                        90000.
Pages reactivated:                         5000.
Pages purged:                              1000.
File-backed pages:                        90000.
Anonymous pages:                         110000.
Pages stored in compressor:               60000.
Pages occupied by compressor:             30000.
Decompressions:                           30000.
Compressions:                             40000.
Pageins:                                  50000.
Pageouts:                                     0.
Swapins:                                      0.
Swapouts:                                     0.
`;

// Total RAM: 16 GB
const MOCK_MEMSIZE = 'hw.memsize: 17179869184';

describe('scanMemory', () => {
  it('parses vm_stat and sysctl output and returns memory metrics', async () => {
    const mockExec = async (cmd: string) => {
      if (cmd.includes('hw.memsize')) return { stdout: MOCK_MEMSIZE, stderr: '' };
      if (cmd === 'vm_stat') return { stdout: MOCK_VM_STAT, stderr: '' };
      return { stdout: '', stderr: '' };
    };
    const result = await scanMemory(mockExec);
    expect(result.category).toBe('memory');
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.actions).toHaveLength(0);
    expect(result.metrics).toHaveProperty('totalGB');
    expect(result.metrics).toHaveProperty('usedGB');
    expect(result.metrics).toHaveProperty('freeGB');
    expect(result.metrics).toHaveProperty('usedPct');
  });

  it('computes used = (wired + active + compressed) × pageSize', async () => {
    const mockExec = async (cmd: string) => {
      if (cmd.includes('hw.memsize')) return { stdout: MOCK_MEMSIZE, stderr: '' };
      if (cmd === 'vm_stat') return { stdout: MOCK_VM_STAT, stderr: '' };
      return { stdout: '', stderr: '' };
    };
    const result = await scanMemory(mockExec);
    // wired=80000, active=200000, compressed=60000, pageSize=16384
    const pageSize = 16384;
    const expectedUsedBytes = (80000 + 200000 + 60000) * pageSize;
    const expectedUsedGB = parseFloat((expectedUsedBytes / 1024 ** 3).toFixed(2));
    expect(result.metrics['usedGB']).toBe(expectedUsedGB);
  });

  it('score is 100 when memory pressure is low (used < 60%)', async () => {
    // Simulate very low memory usage: wired=1000, active=1000, compressed=0 pages
    const lightVmStat = MOCK_VM_STAT
      .replace('Pages wired down:                         80000.', 'Pages wired down:                          1000.')
      .replace('Pages active:                            200000.', 'Pages active:                              1000.')
      .replace('Pages stored in compressor:               60000.', 'Pages stored in compressor:                   0.');
    const mockExec = async (cmd: string) => {
      if (cmd.includes('hw.memsize')) return { stdout: MOCK_MEMSIZE, stderr: '' };
      if (cmd === 'vm_stat') return { stdout: lightVmStat, stderr: '' };
      return { stdout: '', stderr: '' };
    };
    const result = await scanMemory(mockExec);
    expect(result.score).toBe(100);
  });

  it('returns score 0 and error when exec fails', async () => {
    const mockExec = async (_cmd: string) => { throw new Error('sysctl failed'); };
    const result = await scanMemory(mockExec);
    expect(result.score).toBe(0);
    expect(result.error).toBeDefined();
  });
});
