import type { CategoryScan } from '../types.js';
import { type ExecFn, defaultExec, linearScore } from './utils.js';

// Score: 100 at load ≤2.0, 0 at load ≥16.0. Floor of 20 so a momentary spike doesn't crater the overall.
function scoreProcess(load1m: number): number {
  return Math.max(20, linearScore(-load1m, -16, -2));
}

export async function scanProcess(exec: ExecFn = defaultExec): Promise<CategoryScan> {
  try {
    const [loadOut, psOut] = await Promise.all([
      exec("sysctl -n vm.loadavg | awk '{print $2}'"),
      exec("ps -Ao pid,comm,pcpu,pmem 2>/dev/null | tail -n +2 | sort -k3 -rn | head -5"),
    ]);

    const load1m = parseFloat(loadOut.stdout.trim()) || 0;

    const topProcs = psOut.stdout.trim().split('\n').map(line => {
      const parts = line.trim().split(/\s+/);
      return { pid: parts[0], name: parts[1], cpu: parts[2], mem: parts[3] };
    });

    const metricsObj: Record<string, number | string> = { load1m };
    topProcs.forEach((p, i) => {
      metricsObj[`proc${i}_name`] = p.name ?? '';
      metricsObj[`proc${i}_cpu`] = p.cpu ?? '0';
    });

    return {
      category: 'process',
      score: scoreProcess(load1m),
      metrics: metricsObj,
      actions: [], // process is read-only
    };
  } catch (e) {
    return { category: 'process', score: 0, metrics: {}, actions: [], error: String(e) };
  }
}
