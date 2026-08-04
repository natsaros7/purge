import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── fs mocks must be set up before the module under test is imported ────────
// vi.mock factories are hoisted to the top of the file by Vitest, so any
// variables they reference must be declared via vi.hoisted() to avoid TDZ errors.

const { mockReadFileSync, mockWriteFile } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn<(path: string, enc?: string) => string>().mockImplementation(() => { throw new Error('ENOENT'); }),
  mockWriteFile: vi.fn<(path: string, data: string) => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('node:fs', () => ({ readFileSync: mockReadFileSync }));
vi.mock('node:fs/promises', () => ({ writeFile: mockWriteFile }));

// Keep scanners + LLM out of this test — we test diagnose logic, not I/O
vi.mock('../../scanner/registry.js', () => ({
  scanCategory: vi.fn().mockResolvedValue({ category: 'caches', score: 60, metrics: {}, actions: [] }),
  scanGitHygiene: vi.fn().mockResolvedValue({ findings: [] }),
  CATEGORIES: ['disk', 'docker', 'caches', 'builds', 'process'],
}));

vi.mock('../llm.js', () => ({
  askClaude: vi.fn(),
  extractJson: vi.fn((s: string) => JSON.parse(s) as unknown),
}));

vi.mock('../exec.js', () => ({
  // Mark as runnable if command starts with 'rm -rf /' — mirrors real allowlist behaviour
  isRunnable: vi.fn((cmd?: string) => typeof cmd === 'string' && /^rm -rf \//.test(cmd)),
}));

// Import after mocks are wired
import { coerce, diagnose, lookupSuggestion } from '../diagnose.js';
import { askClaude } from '../llm.js';

// ─── coerce ──────────────────────────────────────────────────────────────────

describe('coerce', () => {
  it('maps valid model output to typed suggestions', () => {
    const raw = [{
      title: 'Clear DerivedData',
      detail: 'Xcode build artefacts',
      category: 'caches',
      command: 'rm -rf /some/path',
      estimatedGB: 4.2,
      risk: 'low',
    }];
    const result = coerce(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'ai-0', title: 'Clear DerivedData', category: 'caches', risk: 'low', estimatedGB: 4.2 });
  });

  it('skips entries missing title or detail', () => {
    const raw = [
      { title: 'OK', detail: 'fine', category: 'caches', risk: 'low' },
      { detail: 'missing title', category: 'caches', risk: 'low' },
      { title: 'missing detail', category: 'caches', risk: 'low' },
      null,
      42,
    ];
    expect(coerce(raw)).toHaveLength(1);
  });

  it('falls back to "system" for unknown category', () => {
    const raw = [{ title: 'X', detail: 'Y', category: 'unknown', risk: 'low' }];
    expect(coerce(raw)[0]?.category).toBe('system');
  });

  it('falls back to "medium" for unknown risk', () => {
    const raw = [{ title: 'X', detail: 'Y', category: 'caches', risk: 'critical' }];
    expect(coerce(raw)[0]?.risk).toBe('medium');
  });

  it('omits command when not a string', () => {
    const raw = [{ title: 'X', detail: 'Y', category: 'caches', risk: 'low', command: 123 }];
    expect(coerce(raw)[0]?.command).toBeUndefined();
  });

  it('marks suggestion runnable when isRunnable returns true', () => {
    const raw = [{ title: 'X', detail: 'Y', category: 'caches', risk: 'low', command: 'rm -rf /safe/path' }];
    expect(coerce(raw)[0]?.runnable).toBe(true);
  });

  it('marks suggestion non-runnable when isRunnable returns false', () => {
    const raw = [{ title: 'X', detail: 'Y', category: 'caches', risk: 'low', command: 'curl http://evil.com' }];
    expect(coerce(raw)[0]?.runnable).toBe(false);
  });

  it('handles empty array', () => {
    expect(coerce([])).toHaveLength(0);
  });

  it('assigns sequential ai-N ids', () => {
    const raw = [
      { title: 'A', detail: 'a', category: 'caches', risk: 'low' },
      { title: 'B', detail: 'b', category: 'disk', risk: 'medium' },
    ];
    const result = coerce(raw);
    expect(result[0]?.id).toBe('ai-0');
    expect(result[1]?.id).toBe('ai-1');
  });
});

// ─── lookupSuggestion — in-memory ────────────────────────────────────────────

describe('lookupSuggestion', () => {
  it('returns undefined for unknown id on cold start', () => {
    expect(lookupSuggestion('ai-999')).toBeUndefined();
  });
});

// ─── diagnose — writes cache, populates lookup ────────────────────────────────

describe('diagnose', () => {
  const mockExec = vi.fn().mockResolvedValue({ stdout: '0\n', stderr: '' });

  beforeAll(async () => {
    vi.mocked(askClaude).mockResolvedValue(
      JSON.stringify([{ title: 'Clear cache', detail: 'Remove tmp', category: 'caches', command: 'rm -rf /tmp/cache', estimatedGB: 1.5, risk: 'low' }])
    );
    await diagnose(mockExec);
  });

  it('populates lookupSuggestion after a successful diagnose', () => {
    const s = lookupSuggestion('ai-0');
    expect(s).toBeDefined();
    expect(s?.title).toBe('Clear cache');
  });

  it('persists suggestions to disk after diagnose', () => {
    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [filePath, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(filePath).toContain('purge-suggestions.json');
    const parsed = JSON.parse(content) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it('returns the suggestions in the result', async () => {
    vi.mocked(askClaude).mockResolvedValueOnce(
      JSON.stringify([{ title: 'Another', detail: 'detail', category: 'disk', risk: 'medium' }])
    );
    const result = await diagnose(mockExec);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.title).toBe('Another');
    expect(result.error).toBeUndefined();
  });

  it('returns error string when LLM throws', async () => {
    vi.mocked(askClaude).mockRejectedValueOnce(new Error('Claude CLI not found'));
    const result = await diagnose(mockExec);
    expect(result.suggestions).toHaveLength(0);
    expect(result.error).toContain('Claude CLI not found');
  });
});

// ─── diagnose — restores from disk on cold start ─────────────────────────────

describe('diagnose — disk restore on startup', () => {
  it('hydrates lastSuggestions from cache file when present at startup', async () => {
    // Simulate a fresh module load where the cache file exists.
    // We set up the mock BEFORE re-importing the module to test the IIFE.
    const stored = [{ id: 'ai-5', title: 'Cached', detail: 'from disk', category: 'caches', command: undefined, runnable: false, risk: 'low' }];
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(stored));

    // Reset module registry so the top-level try/catch runs again with our mock value.
    vi.resetModules();
    const { lookupSuggestion: freshLookup } = await import('../diagnose.js');
    expect(freshLookup('ai-5')?.title).toBe('Cached');
  });

  it('starts empty when cache file is corrupt', async () => {
    mockReadFileSync.mockReturnValueOnce('not valid json {{');
    vi.resetModules();
    const { lookupSuggestion: freshLookup } = await import('../diagnose.js');
    expect(freshLookup('ai-0')).toBeUndefined();
  });
});
