import { ScanResult, GitScan, CategoryScan, Category, DiagnoseResult } from '../types';

// Direct to backend — CORS is enabled for localhost:5173.
// Vite proxy can't reliably handle SSE + concurrent fetches on the same HTTP/1.1 target.
const API = 'http://localhost:3001';

export async function fetchCategoryScan(category: Category, force = false): Promise<CategoryScan> {
  const res = await fetch(`${API}/api/scan/${category}${force ? '?force=1' : ''}`);
  if (!res.ok) throw new Error(`Scan failed for ${category}: ${res.status}`);
  return res.json();
}

export async function fetchScan(): Promise<ScanResult> {
  const res = await fetch(`${API}/api/scan`);
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
  return res.json();
}

export async function fetchGit(force = false): Promise<GitScan> {
  const res = await fetch(`${API}/api/scan/git${force ? '?force=1' : ''}`);
  if (!res.ok) throw new Error(`Git scan failed: ${res.status}`);
  return res.json();
}

export async function triggerRun(): Promise<void> {
  const res = await fetch(`${API}/api/run`, { method: 'POST' });
  if (res.status === 409) throw new Error('Engine already running');
  if (!res.ok) throw new Error(`Run failed: ${res.status}`);
}

export async function runAction(category: string, actionId: string): Promise<{ ok: boolean; reclaimedBytes?: number }> {
  const res = await fetch(`${API}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, actionId }),
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

export async function runCategory(category: string): Promise<{ ok: boolean; reclaimedBytes?: number; ranCount?: number }> {
  const res = await fetch(`${API}/api/action/all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  if (!res.ok) return { ok: false };
  return res.json();
}

export async function runGitClean(command: string): Promise<boolean> {
  const res = await fetch(`${API}/api/git-clean`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  return res.ok;
}

export async function runDiagnose(): Promise<DiagnoseResult> {
  const res = await fetch(`${API}/api/diagnose`, { method: 'POST' });
  if (!res.ok) return { suggestions: [], error: `Diagnose failed: ${res.status}` };
  return res.json();
}

export async function runSuggestion(id: string): Promise<{ ok: boolean; reclaimedBytes?: number; error?: string }> {
  const res = await fetch(`${API}/api/diagnose/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  }
  return res.json();
}

export const SSE_URL = `${API}/api/events`;
