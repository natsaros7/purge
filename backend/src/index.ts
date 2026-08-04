import express from 'express';
import cors from 'cors';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { scanRouter } from './routes/scan.js';
import { runRouter } from './routes/run.js';
import { eventsRouter } from './routes/events.js';
import { scanCategory, CATEGORIES } from './scanner/registry.js';
import { diagnose, lookupSuggestion } from './ai/diagnose.js';
import { isRunnable } from './ai/exec.js';
import type { Category } from './types.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const KNOWN_CATEGORIES = new Set<Category>(CATEGORIES);

// Paths that must never be touched by git-clean regardless of scanner output.
const HOME = homedir();
const GIT_CLEAN_DENYLIST = [
  path.join(HOME, '.ssh'),
  path.join(HOME, '.gnupg'),
  path.join(HOME, 'Library', 'Keychains'),
  path.join(HOME, 'Library', 'Application Support', 'Google'),
  path.join(HOME, 'Library', 'Application Support', 'Firefox'),
  path.join(HOME, 'Library', 'Application Support', 'Microsoft Edge'),
  '/System',
  '/Library',
];

const SHELL_METACHAR = /[;&|`$()<>\\'"\n\r]/;

function isDenied(arg: string): boolean {
  if (arg.startsWith('-')) return false;
  const resolved = path.resolve(arg.replace(/^~/, HOME));
  return GIT_CLEAN_DENYLIST.some(d => resolved === d || resolved.startsWith(d + path.sep));
}

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/scan', scanRouter);
app.use('/api/run', runRouter);
app.use('/api/events', eventsRouter);

// Run a single remediation action by ID — command is always server-generated, never client-supplied.
app.post('/api/action', async (req, res) => {
  const { category, actionId } = req.body as { category?: string; actionId?: string };
  if (!category || !actionId || !KNOWN_CATEGORIES.has(category as Category)) {
    res.status(400).json({ error: 'Invalid category or actionId' }); return;
  }
  try {
    const scan = await scanCategory(category as Category);
    const action = scan.actions.find(a => a.id === actionId);
    if (!action) { res.status(404).json({ error: 'Action not found in current scan' }); return; }
    // Command is from our own scanner — exec with shell needed for glob expansion (e.g. rm -rf "path"*)
    await execAsync(action.command, { timeout: 60_000 });
    res.json({ ok: true, reclaimedBytes: action.estimatedReclaimBytes });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Run every remediation action in a category — commands always server-generated.
app.post('/api/action/all', async (req, res) => {
  const { category } = req.body as { category?: string };
  if (!category || !KNOWN_CATEGORIES.has(category as Category)) {
    res.status(400).json({ error: 'Invalid category' }); return;
  }
  try {
    const scan = await scanCategory(category as Category);
    if (scan.actions.length === 0) { res.json({ ok: true, reclaimedBytes: 0, ranCount: 0 }); return; }
    const results = await Promise.allSettled(
      scan.actions.map(a => execAsync(a.command, { timeout: 60_000 }))
    );
    const reclaimedBytes = scan.actions
      .filter((_, i) => results[i]?.status === 'fulfilled')
      .reduce((sum, a) => sum + a.estimatedReclaimBytes, 0);
    const failed = results.filter(r => r.status === 'rejected').length;
    res.json({ ok: failed === 0, reclaimedBytes, ranCount: scan.actions.length - failed, failedCount: failed });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// AI-powered diagnosis — gathers extended context and asks Claude for dynamic suggestions.
app.post('/api/diagnose', async (_req, res) => {
  try {
    res.json(await diagnose());
  } catch (e) {
    res.status(500).json({ suggestions: [], error: String(e) });
  }
});

// Execute a single AI suggestion by id. The command is the server-held one from the
// last diagnosis (never client-supplied) and must pass the AI safe-prefix allowlist.
app.post('/api/diagnose/run', async (req, res) => {
  const { id } = req.body as { id?: string };
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
  const suggestion = lookupSuggestion(id);
  if (!suggestion?.command) { res.status(404).json({ error: 'Suggestion not found or has no command' }); return; }
  if (!isRunnable(suggestion.command)) { res.status(403).json({ error: 'Command not in safe allowlist' }); return; }
  try {
    // execFileAsync has no shell, so ~ is never expanded. Do it explicitly.
    const expanded = suggestion.command.trim().replace(/(^| )~\//g, `$1${HOME}/`);
    const [bin, ...args] = expanded.split(/\s+/);
    await execFileAsync(bin, args, { timeout: 120_000 });
    res.json({ ok: true, reclaimedBytes: (suggestion.estimatedGB ?? 0) * 1024 ** 3 });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/git-clean', async (req, res) => {
  const { command } = req.body as { command?: string };
  if (!command || typeof command !== 'string') {
    res.status(400).json({ error: 'Missing command' }); return;
  }
  if (!command.startsWith('rm ') && !command.startsWith('git ')) {
    res.status(403).json({ error: 'Command not allowed' }); return;
  }
  // Reject shell metacharacters — execFile does not spawn a shell, but be explicit.
  if (SHELL_METACHAR.test(command)) {
    res.status(403).json({ error: 'Command not allowed' }); return;
  }
  const [bin, ...args] = command.trim().split(/\s+/);
  if (args.some(isDenied)) {
    res.status(403).json({ error: 'Path not allowed' }); return;
  }
  try {
    // execFile (no shell) — prevents semicolon/pipe chaining entirely.
    await execFileAsync(bin, args, { timeout: 30_000 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Score history ────────────────────────────────────────────────────────────

const HISTORY_FILE = path.join(HOME, '.config', 'purge', 'history.json');
const HISTORY_MAX  = 30;

interface HistoryEntry { ts: number; score: number; }

async function readHistory(): Promise<HistoryEntry[]> {
  try { return JSON.parse(await readFile(HISTORY_FILE, 'utf-8')) as HistoryEntry[]; }
  catch { return []; }
}

async function appendHistory(score: number): Promise<void> {
  const entries = await readHistory();
  entries.push({ ts: Date.now(), score: Math.round(score) });
  const trimmed = entries.slice(-HISTORY_MAX);
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await writeFile(HISTORY_FILE, JSON.stringify(trimmed));
}

app.get('/api/history', async (_req, res) => {
  res.json(await readHistory());
});

app.post('/api/history', async (req, res) => {
  const { score } = req.body as { score?: number };
  if (typeof score !== 'number') { res.status(400).json({ error: 'score required' }); return; }
  await appendHistory(score).catch(() => {});
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Purge backend online :${PORT}`));
