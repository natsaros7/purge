import type { CategoryScan } from '../types.js';
import { type ExecFn, defaultExec, linearScore } from './utils.js';

// Score: 100 at used ≤ 60% of total, 0 at used ≥ 95% of total
function scoreMemory(usedPct: number): number {
  return linearScore(-usedPct, -95, -60);
}

function parseSysctlBytes(stdout: string): number {
  return parseInt(stdout.trim().split(/\s+/).pop() ?? '0', 10) || 0;
}

function parseVmStat(stdout: string): { pageSize: number; free: number; speculative: number; wired: number; active: number; inactive: number; compressed: number } {
  const pageSize = parseInt(stdout.match(/page size of (\d+) bytes/)?.[1] ?? '4096', 10);

  function pages(label: string): number {
    const m = stdout.match(new RegExp(`${label}:\\s+([\\d]+)\\.`));
    return m ? parseInt(m[1], 10) : 0;
  }

  return {
    pageSize,
    free:        pages('Pages free'),
    speculative: pages('Pages speculative'),
    wired:       pages('Pages wired down'),
    active:      pages('Pages active'),
    inactive:    pages('Pages inactive'),
    compressed:  pages('Pages stored in compressor'),
  };
}

export async function scanMemory(exec: ExecFn = defaultExec): Promise<CategoryScan> {
  try {
    const [memOut, vmOut] = await Promise.all([
      exec('sysctl hw.memsize'),
      exec('vm_stat'),
    ]);

    const totalBytes = parseSysctlBytes(memOut.stdout);
    const vm = parseVmStat(vmOut.stdout);

    const usedBytes = (vm.wired + vm.active + vm.compressed) * vm.pageSize;
    const freeBytes = (vm.free + vm.speculative) * vm.pageSize;
    const usedPct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

    const toGB = (b: number) => parseFloat((b / 1024 ** 3).toFixed(2));

    return {
      category: 'memory',
      score: scoreMemory(usedPct),
      metrics: {
        totalGB:  toGB(totalBytes),
        usedGB:   toGB(usedBytes),
        freeGB:   toGB(freeBytes),
        usedPct:  parseFloat(usedPct.toFixed(1)),
      },
      actions: [],
    };
  } catch (e) {
    return { category: 'memory', score: 0, metrics: {}, actions: [], error: String(e) };
  }
}
