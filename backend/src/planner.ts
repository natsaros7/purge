import type { CategoryScan, CategoryScores, RemediationPlan, RemediationTask } from './types.js';

const WEIGHTS: Record<string, number> = {
  disk:        0.10,
  docker:      0.30,
  caches:      0.25,
  builds:      0.10,
  process:     0.05,
  nodemodules: 0.20,
  memory:      0.10,
};

export function computeScores(scans: CategoryScan[]): CategoryScores {
  const byCategory = Object.fromEntries(scans.map(s => [s.category, s.score]));
  const totalWeight = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
  const overall = Math.round(
    Object.entries(WEIGHTS).reduce((sum, [cat, w]) => sum + (byCategory[cat] ?? 0) * w, 0) / totalWeight
  );
  return {
    disk:        byCategory['disk']        ?? 0,
    docker:      byCategory['docker']      ?? 0,
    caches:      byCategory['caches']      ?? 0,
    builds:      byCategory['builds']      ?? 0,
    process:     byCategory['process']     ?? 0,
    nodemodules: byCategory['nodemodules'] ?? 0,
    memory:      byCategory['memory']      ?? 0,
    overall,
  };
}

export function buildPlan(scans: CategoryScan[]): RemediationPlan {
  const allActions = scans.flatMap(s => s.actions);
  // Sort by estimated reclaim descending — biggest wins first
  allActions.sort((a, b) => b.estimatedReclaimBytes - a.estimatedReclaimBytes);

  const tasks: RemediationTask[] = allActions.map(action => ({
    ...action,
    status: 'pending',
    actualReclaimBytes: 0,
    replanCount: 0,
  }));

  return { tasks, scores: computeScores(scans), createdAt: Date.now() };
}
