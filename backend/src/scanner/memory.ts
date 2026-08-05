import type { CategoryScan } from '../types.js';
import { type ExecFn, defaultExec, linearScore } from './utils.js';

// Use macOS memory_pressure's own free% — it accounts for compression correctly.
// Score 100 at ≥ 40% free, score 0 at ≤ 5% free.
function scoreMemory(freePct: number): number {
  return linearScore(freePct, 5, 40);
}

function parseSysctlBytes(stdout: string): number {
  return parseInt(stdout.trim().split(/\s+/).pop() ?? '0', 10) || 0;
}

function parseVmStat(stdout: string): { pageSize: number; free: number; speculative: number; wired: number; active: number; compressorUsed: number } {
  const pageSize = parseInt(stdout.match(/page size of (\d+) bytes/)?.[1] ?? '4096', 10);

  function pages(label: string): number {
    const m = stdout.match(new RegExp(`${label}:\\s+([\\d]+)`));
    return m ? parseInt(m[1], 10) : 0;
  }

  return {
    pageSize,
    free:          pages('Pages free'),
    speculative:   pages('Pages speculative'),
    wired:         pages('Pages wired down'),
    active:        pages('Pages active'),
    compressorUsed: pages('Pages used by compressor'),
  };
}

// Parse "System-wide memory free percentage: 70%" from memory_pressure output.
function parseFreePct(stdout: string): number | null {
  const m = stdout.match(/System-wide memory free percentage:\s+(\d+)%/);
  return m ? parseInt(m[1], 10) : null;
}

export async function scanMemory(exec: ExecFn = defaultExec): Promise<CategoryScan> {
  try {
    const [memOut, vmOut, mpOut] = await Promise.all([
      exec('sysctl hw.memsize'),
      exec('vm_stat'),
      exec('memory_pressure'),
    ]);

    const totalBytes = parseSysctlBytes(memOut.stdout);
    const vm = parseVmStat(vmOut.stdout);

    // Physical RAM consumed = wired + active + pages holding the compressor
    const usedBytes = (vm.wired + vm.active + vm.compressorUsed) * vm.pageSize;
    const freeBytes = (vm.free + vm.speculative) * vm.pageSize;

    const toGB = (b: number) => parseFloat((b / 1024 ** 3).toFixed(2));

    // Prefer memory_pressure's authoritative free% (accounts for purgeable/reclaimable).
    const freePct = parseFreePct(mpOut.stdout) ?? (totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0);
    const usedPct = parseFloat((100 - freePct).toFixed(1));

    return {
      category: 'memory',
      score: scoreMemory(freePct),
      metrics: {
        totalGB:  toGB(totalBytes),
        usedGB:   toGB(usedBytes),
        freeGB:   toGB(freeBytes),
        usedPct,
        freePct:  parseFloat(freePct.toFixed(1)),
      },
      actions: [],
    };
  } catch (e) {
    return { category: 'memory', score: 0, metrics: {}, actions: [], error: String(e) };
  }
}
