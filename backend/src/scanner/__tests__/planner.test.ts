import { describe, it, expect } from 'vitest';
import { buildPlan, computeScores } from '../../planner.js';
import type { CategoryScan } from '../../types.js';

const mockScans: CategoryScan[] = [
  { category: 'disk',        score: 80, metrics: {}, actions: [] },
  { category: 'docker',      score: 40, metrics: {}, actions: [
    { id: 'docker-builder-prune', label: 'Prune build cache', command: 'docker builder prune -af', estimatedReclaimBytes: 9 * 1024**3, category: 'docker' },
    { id: 'docker-image-prune', label: 'Prune images', command: 'docker image prune -f', estimatedReclaimBytes: 1 * 1024**3, category: 'docker' },
  ]},
  { category: 'caches',      score: 60, metrics: {}, actions: [
    { id: 'jetbrains', label: 'JetBrains', command: 'rm -rf ~/Library/Caches/JetBrains/*', estimatedReclaimBytes: 7 * 1024**3, category: 'caches' },
  ]},
  { category: 'builds',      score: 90, metrics: {}, actions: [] },
  { category: 'process',     score: 70, metrics: {}, actions: [] },
  { category: 'nodemodules', score: 50, metrics: {}, actions: [] },
  { category: 'memory',      score: 75, metrics: {}, actions: [] },
];

describe('computeScores', () => {
  it('weights scores correctly', () => {
    const scores = computeScores(mockScans);
    // Weights: disk=0.10, docker=0.30, caches=0.25, builds=0.10, process=0.05, nodemodules=0.20, memory=0.10; total=1.10
    // 80*0.10 + 40*0.30 + 60*0.25 + 90*0.10 + 70*0.05 + 50*0.20 + 75*0.10 = 8+12+15+9+3.5+10+7.5 = 65
    // 65 / 1.10 ≈ 59.09 → rounds to 59
    expect(scores.overall).toBe(59);
    expect(scores.disk).toBe(80);
  });
});

describe('buildPlan', () => {
  it('sorts tasks by estimatedReclaimBytes descending', () => {
    const plan = buildPlan(mockScans);
    expect(plan.tasks[0].estimatedReclaimBytes).toBeGreaterThanOrEqual(plan.tasks[1].estimatedReclaimBytes);
  });

  it('initialises all tasks as pending with replanCount 0', () => {
    const plan = buildPlan(mockScans);
    plan.tasks.forEach(t => {
      expect(t.status).toBe('pending');
      expect(t.replanCount).toBe(0);
      expect(t.actualReclaimBytes).toBe(0);
    });
  });

  it('excludes categories with no actions', () => {
    const plan = buildPlan(mockScans);
    expect(plan.tasks.length).toBe(3); // docker×2 + caches×1
  });
});
