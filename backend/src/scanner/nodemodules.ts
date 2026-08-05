import { readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CategoryScan, RemediationAction } from '../types.js';
import { type ExecFn, defaultExec, HOME, linearScore } from './utils.js';

// Never suggest deleting our own node_modules — the app would kill itself.
const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'node_modules');

// Score: 100 at ≤0.5 GB total, 0 at ≥15 GB total
function scoreNodeModules(totalGB: number): number {
  return linearScore(-totalGB, -15, -0.5);
}

const DEFAULT_ROOTS = [
  join(HOME, 'Developer'),
  join(HOME, 'Code'),
  join(HOME, 'Projects'),
  join(HOME, 'dev'),
  join(HOME, 'src'),
  join(HOME, 'work'),
];

const SKIP_DIRS = new Set(['.git', 'Library', 'Applications', '.Trash', '.cache', '.npm']);

async function existsDir(p: string): Promise<boolean> {
  try { const s = await stat(p); return s.isDirectory(); } catch { return false; }
}

// Walk up to maxDepth=4; collect node_modules dirs that are siblings of a package.json
async function findNodeModules(root: string, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return [];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const names = new Set(entries.map(e => e.name));
    const found: string[] = [];

    if (names.has('node_modules') && names.has('package.json')) {
      const nmPath = join(root, 'node_modules');
      try {
        const s = await stat(nmPath);
        if (s.isDirectory()) found.push(nmPath);
      } catch { /* skip */ }
      // Don't recurse further into this project dir
      return found;
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === 'node_modules' || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const nested = await findNodeModules(join(root, e.name), maxDepth, depth + 1);
      found.push(...nested);
    }
    return found;
  } catch { return []; }
}

export async function scanNodeModules(exec: ExecFn = defaultExec): Promise<CategoryScan> {
  try {
    const roots = (await Promise.all(DEFAULT_ROOTS.map(async r => (await existsDir(r)) ? r : null)))
      .filter((r): r is string => r !== null);

    const allLists = await Promise.all(roots.map(r => findNodeModules(r, 4)));
    const nmDirs = [...new Set(allLists.flat())];

    const actions: RemediationAction[] = [];
    let totalBytes = 0;

    await Promise.all(
      nmDirs.map(async dir => {
        if (dir === SELF_ROOT) return; // never suggest deleting our own node_modules
        try {
          const { stdout } = await exec(`du -sk "${dir}" 2>/dev/null`);
          const kb = parseInt(stdout.trim().split(/\s+/)[0], 10) || 0;
          if (!kb) return;
          const bytes = kb * 1024;
          totalBytes += bytes;
          actions.push({
            id: `nm-${Buffer.from(dir).toString('base64').slice(0, 16)}`,
            label: dir.replace(HOME, '~'),
            command: `rm -rf "${dir}"`,
            estimatedReclaimBytes: bytes,
            category: 'nodemodules',
          });
        } catch { /* du failed */ }
      })
    );

    actions.sort((a, b) => b.estimatedReclaimBytes - a.estimatedReclaimBytes);

    return {
      category: 'nodemodules',
      score: scoreNodeModules(totalBytes / 1024 ** 3),
      metrics: { totalGB: parseFloat((totalBytes / 1024 ** 3).toFixed(2)), dirCount: actions.length },
      actions,
    };
  } catch (e) {
    return { category: 'nodemodules', score: 0, metrics: {}, actions: [], error: String(e) };
  }
}
