import { scanDisk }    from './disk.js';
import { scanDocker }  from './docker.js';
import { scanCaches }  from './caches.js';
import { scanBuilds }  from './builds.js';
import { scanProcess } from './process.js';
import { scanGit }     from './git.js';
import type { CategoryScan, GitScan, Category } from '../types.js';

// ─── Scanners ────────────────────────────────────────────────────────────────

type Scanner = () => Promise<CategoryScan>;

const SCANNERS: Record<Category, Scanner> = {
  disk:    scanDisk,
  docker:  scanDocker,
  caches:  scanCaches,
  builds:  scanBuilds,
  process: scanProcess,
};

export const CATEGORIES: Category[] = ['disk', 'docker', 'caches', 'builds', 'process'];

// ─── Cache + in-flight dedup ─────────────────────────────────────────────────

const CAT_TTL_MS     = 60_000;
const GIT_TTL_MS     = 60_000;
const CAT_TIMEOUT_MS = 12_000;
const GIT_TIMEOUT_MS = 20_000;

interface Entry<T> { result: T; ts: number; }

const catCache   = new Map<Category, Entry<CategoryScan>>();
const catFlight  = new Map<Category, Promise<CategoryScan>>();
let gitCache:  Entry<GitScan> | null = null;
let gitFlight: Promise<GitScan> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);
}

function timedOut(category: Category): CategoryScan {
  // Neutral score so a timeout doesn't crater the overall.
  return { category, score: 50, metrics: {}, actions: [], error: 'TIMEOUT' };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function scanCategory(category: Category, force = false): Promise<CategoryScan> {
  const now = Date.now();
  const cached = catCache.get(category);
  if (!force && cached && now - cached.ts < CAT_TTL_MS) return cached.result;

  if (!catFlight.has(category)) {
    const promise = withTimeout(SCANNERS[category](), CAT_TIMEOUT_MS, timedOut(category))
      .then(result => {
        catCache.set(category, { result, ts: Date.now() });
        catFlight.delete(category);
        return result;
      })
      .catch(err => {
        catFlight.delete(category);
        throw err;
      });
    catFlight.set(category, promise);
  }

  return catFlight.get(category)!;
}

export async function scanGitHygiene(force = false): Promise<GitScan> {
  const now = Date.now();
  if (!force && gitCache && now - gitCache.ts < GIT_TTL_MS) return gitCache.result;

  if (!gitFlight) {
    gitFlight = withTimeout(scanGit(), GIT_TIMEOUT_MS, { findings: [], error: 'TIMEOUT' })
      .then(result => {
        gitCache = { result, ts: Date.now() };
        gitFlight = null;
        return result;
      })
      .catch(err => { gitFlight = null; throw err; });
  }

  return gitFlight;
}

/** Kick off all category scans in parallel — results cache independently. */
export function warmAllCategories(): void {
  CATEGORIES.forEach(cat => scanCategory(cat).catch(() => {}));
}
