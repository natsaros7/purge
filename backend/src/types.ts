export type Category = 'disk' | 'docker' | 'caches' | 'builds' | 'process' | 'nodemodules' | 'memory';

export interface RemediationAction {
  id: string;
  label: string;
  command: string;
  estimatedReclaimBytes: number;
  category: Category;
}

export interface CategoryScan {
  category: Category;
  score: number; // 0–100
  metrics: Record<string, number | string>;
  actions: RemediationAction[];
  error?: string;
}

export interface GitFinding {
  type: 'stale-branch' | 'large-untracked' | 'old-worktree';
  repo: string;   // short repo name, e.g. "purge"
  path: string;   // absolute path to the repo or file
  detail: string;
  cleanCommand: string;
}

export interface GitScan {
  findings: GitFinding[];
  error?: string;
}

export interface AISuggestion {
  id: string;
  title: string;
  detail: string;
  category: Category | 'system' | 'git';
  command?: string;        // shown to the user; only executed if `runnable`
  runnable?: boolean;      // command passed the safe-prefix allowlist (server-decided)
  estimatedGB?: number;
  risk: 'low' | 'medium' | 'high';
}

export interface DiagnoseResult {
  suggestions: AISuggestion[];
  error?: string;
  model?: string;
}

export interface CategoryScores {
  disk: number;
  docker: number;
  caches: number;
  builds: number;
  process: number;
  nodemodules: number;
  memory: number;
  overall: number;
}

export interface RemediationTask {
  id: string;
  label: string;
  command: string;
  estimatedReclaimBytes: number;
  category: Category;
  status: 'pending' | 'executing' | 'pass' | 'fail';
  actualReclaimBytes: number;
  replanCount: number;
}

export interface RemediationPlan {
  tasks: RemediationTask[];
  scores: CategoryScores;
  createdAt: number;
}

export interface CompleteSummary {
  totalReclaimedBytes: number;
  passCount: number;
  failCount: number;
  newScores: CategoryScores;
  durationMs: number;
}

export type PurgeEvent =
  | { phase: 'PLANNING'; scores: CategoryScores }
  | { phase: 'EXECUTING'; taskId: string; label: string; status: 'start' | 'done'; reclaimedBytes?: number }
  | { phase: 'EVALUATING'; category: Category; passed: boolean; newScore: number }
  | { phase: 'REPLANNING'; cycle: number; tasksRemaining: number }
  | { phase: 'COMPLETE'; summary: CompleteSummary }
  | { phase: 'FAILED'; taskId: string; reason: string };

export interface ScanResult {
  categories: CategoryScan[];
  git?: GitScan; // loaded separately via GET /api/git to avoid blocking the main scan
  scores: CategoryScores;
  scannedAt: number;
}
