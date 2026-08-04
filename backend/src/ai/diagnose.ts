import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCategory, scanGitHygiene, CATEGORIES } from '../scanner/registry.js';
import { askClaude, extractJson } from './llm.js';
import { isRunnable } from './exec.js';
import { type ExecFn, defaultExec, HOME } from '../scanner/utils.js';
import type { AISuggestion, DiagnoseResult, Category } from '../types.js';

const CACHE_FILE = join(tmpdir(), 'purge-suggestions.json');

// ─── Extra read-only probes ─────────────────────────────────────────────────

const PROBE_DIRS: { key: string; path: string }[] = [
  { key: 'downloadsGB',        path: `${HOME}/Downloads` },
  { key: 'trashGB',            path: `${HOME}/.Trash` },
  { key: 'xcodeDerivedGB',     path: `${HOME}/Library/Developer/Xcode/DerivedData` },
  { key: 'xcodeDeviceSupport', path: `${HOME}/Library/Developer/Xcode/iOS DeviceSupport` },
  { key: 'coreSimulatorGB',    path: `${HOME}/Library/Developer/CoreSimulator` },
  { key: 'containersGB',       path: `${HOME}/Library/Containers` },
  { key: 'npmCacheGB',         path: `${HOME}/.npm` },
  { key: 'gradleGB',           path: `${HOME}/.gradle` },
];

async function duGB(path: string, exec: ExecFn): Promise<number> {
  try {
    const { stdout } = await exec(`du -sk "${path}" 2>/dev/null`);
    const kb = parseInt(stdout.trim().split(/\s+/)[0], 10) || 0;
    return parseFloat((kb / 1024 / 1024).toFixed(2));
  } catch { return 0; }
}

async function gatherProbes(exec: ExecFn): Promise<Record<string, number>> {
  const entries = await Promise.all(
    PROBE_DIRS.map(async d => [d.key, await duGB(d.path, exec)] as const)
  );
  let brewOutdated = 0;
  try {
    const { stdout } = await exec('brew outdated --quiet 2>/dev/null');
    brewOutdated = stdout.trim() ? stdout.trim().split('\n').length : 0;
  } catch { /* brew missing */ }
  return { ...Object.fromEntries(entries), brewOutdatedCount: brewOutdated };
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildPrompt(context: unknown): string {
  return `You are a macOS system-cleanup analyst for a senior software engineer's work machine. \
Analyze the diagnostics JSON below and identify the highest-impact cleanup and maintenance opportunities \
that the static scanners might miss or under-emphasize. Think about disk hogs (Xcode DerivedData, iOS \
DeviceSupport, simulators, Downloads, Trash, node_modules sprawl), outdated tooling, and stale artifacts.

Rules:
- Only suggest safe, reversible or regenerable cleanups. Never suggest touching source code, SSH keys, \
keychains, browser profiles, or corporate/MDM-managed paths.
- Prefer concrete, high-value items. Skip anything under ~0.5 GB unless it's a clear maintenance win.
- For each item, give a shell command ONLY if it is safe and standard (e.g. rm of a regenerable cache dir, \
brew cleanup, xcrun simctl delete unavailable). If unsure, omit the command and describe the manual step.
- risk: "low" = fully regenerable/reversible, "medium" = requires care, "high" = double-check before running.

Return ONLY a JSON array (no prose, no markdown) of objects with this exact shape:
[{"title": string, "detail": string, "category": "disk"|"docker"|"caches"|"builds"|"process"|"git"|"system", \
"command": string (optional), "estimatedGB": number (optional), "risk": "low"|"medium"|"high"}]

Diagnostics:
${JSON.stringify(context, null, 2)}`;
}

// ─── Coerce model output → typed suggestions ─────────────────────────────────

const VALID_CATS = new Set<AISuggestion['category']>([...CATEGORIES, 'system', 'git'] as AISuggestion['category'][]);
const VALID_RISK = new Set(['low', 'medium', 'high']);

/** Validate and normalise raw model output. Exported for unit testing. */
export function coerce(raw: unknown[]): AISuggestion[] {
  return raw.flatMap((r, i) => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    if (typeof o['title'] !== 'string' || typeof o['detail'] !== 'string') return [];
    const category = (VALID_CATS.has(o['category'] as AISuggestion['category']) ? o['category'] : 'system') as AISuggestion['category'];
    const risk = (VALID_RISK.has(o['risk'] as string) ? o['risk'] : 'medium') as AISuggestion['risk'];
    const command = typeof o['command'] === 'string' ? (o['command'] as string) : undefined;
    return [{
      id: `ai-${i}`,
      title: o['title'] as string,
      detail: o['detail'] as string,
      category,
      command,
      runnable: isRunnable(command),
      estimatedGB: typeof o['estimatedGB'] === 'number' ? (o['estimatedGB'] as number) : undefined,
      risk,
    }];
  });
}

// ─── Suggestion cache — in-memory + disk persisted ───────────────────────────
// Persisting to disk means the map survives backend restarts (tsx watch hot-reload
// during dev, or process crashes) so the frontend can still RUN suggestions it
// received before the restart.

let lastSuggestions = new Map<string, AISuggestion>();

// Restore from previous session at module load (sync — avoids async module init).
try {
  const raw = readFileSync(CACHE_FILE, 'utf-8');
  const arr = JSON.parse(raw) as AISuggestion[];
  if (Array.isArray(arr)) lastSuggestions = new Map(arr.map(s => [s.id, s]));
} catch { /* cold start or corrupt cache — start empty */ }

export function lookupSuggestion(id: string): AISuggestion | undefined {
  return lastSuggestions.get(id);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function diagnose(exec: ExecFn = defaultExec): Promise<DiagnoseResult> {
  try {
    const [cats, git, probes] = await Promise.all([
      Promise.all(CATEGORIES.map(c => scanCategory(c as Category))),
      scanGitHygiene(),
      gatherProbes(exec),
    ]);

    const context = {
      categories: cats.map(c => ({ category: c.category, score: c.score, metrics: c.metrics, actionCount: c.actions.length })),
      git: { findingCount: git.findings.length, findings: git.findings.slice(0, 20) },
      probes,
    };

    const raw = await askClaude(buildPrompt(context));
    const arr = extractJson<unknown[]>(raw);
    if (!Array.isArray(arr)) throw new Error('Model did not return an array');

    const suggestions = coerce(arr)
      .sort((a, b) => (b.estimatedGB ?? 0) - (a.estimatedGB ?? 0))
      .slice(0, 20);

    lastSuggestions = new Map(suggestions.map(s => [s.id, s]));
    // Persist so the map survives restarts; non-fatal if write fails.
    writeFile(CACHE_FILE, JSON.stringify(suggestions)).catch(() => {});
    return { suggestions };
  } catch (e) {
    return { suggestions: [], error: String(e instanceof Error ? e.message : e) };
  }
}
