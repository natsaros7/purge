import type { Category, CategoryScan, PurgeEvent } from './types.js';
import { scanDisk } from './scanner/disk.js';
import { scanDocker } from './scanner/docker.js';
import { scanCaches } from './scanner/caches.js';
import { scanBuilds } from './scanner/builds.js';
import { scanProcess } from './scanner/process.js';
import { scanNodeModules } from './scanner/nodemodules.js';
import { scanMemory } from './scanner/memory.js';
import { buildPlan, computeScores } from './planner.js';
import { executeTask } from './generator.js';

type Emit = (event: PurgeEvent) => void;

const SCORE_IMPROVEMENT_THRESHOLD = 2;
const MAX_REPLAN_CYCLES = 2;

async function rescanCategory(category: Category): Promise<CategoryScan> {
  switch (category) {
    case 'disk':        return scanDisk();
    case 'docker':      return scanDocker();
    case 'caches':      return scanCaches();
    case 'builds':      return scanBuilds();
    case 'process':     return scanProcess();
    case 'nodemodules': return scanNodeModules();
    case 'memory':      return scanMemory();
  }
}

export async function runEngine(
  initialScans: CategoryScan[],
  emit: Emit,
): Promise<void> {
  let currentScans = [...initialScans];
  let plan = buildPlan(currentScans);
  const startTime = Date.now();
  let totalReclaimed = 0;
  let passCount = 0;
  let failCount = 0;
  const failedTaskIds = new Set<string>(); // never re-add these during replan

  emit({ phase: 'PLANNING', scores: plan.scores });

  let taskIndex = 0;
  while (taskIndex < plan.tasks.length) {
    const task = plan.tasks[taskIndex];

    const prevScan = currentScans.find(s => s.category === task.category);
    const prevScore = prevScan?.score ?? 0;

    await executeTask(task, emit);

    const freshScan = await rescanCategory(task.category);
    const improved = freshScan.score >= prevScore + SCORE_IMPROVEMENT_THRESHOLD;

    emit({ phase: 'EVALUATING', category: task.category, passed: improved, newScore: freshScan.score });

    currentScans = currentScans.map(s => s.category === task.category ? freshScan : s);

    if (improved) {
      totalReclaimed += task.estimatedReclaimBytes;
      passCount++;
      taskIndex++;
    } else {
      task.replanCount++;

      if (task.replanCount > MAX_REPLAN_CYCLES) {
        emit({ phase: 'FAILED', taskId: task.id, reason: `Score did not improve after ${MAX_REPLAN_CYCLES} replan cycles` });
        failedTaskIds.add(task.id);
        failCount++;
        taskIndex++;
      } else {
        const remaining = plan.tasks.slice(taskIndex);
        const newPlan = buildPlan(currentScans);
        plan.tasks = [
          ...plan.tasks.slice(0, taskIndex),
          ...newPlan.tasks
            .filter(t => !failedTaskIds.has(t.id)) // never retry failed tasks
            .map(t => ({
              ...t,
              replanCount: remaining.find(r => r.id === t.id)?.replanCount ?? 0,
            })),
        ];
        emit({ phase: 'REPLANNING', cycle: task.replanCount, tasksRemaining: plan.tasks.length - taskIndex });
      }
    }
  }

  const finalScores = computeScores(currentScans);
  emit({
    phase: 'COMPLETE',
    summary: {
      totalReclaimedBytes: totalReclaimed,
      passCount,
      failCount,
      newScores: finalScores,
      durationMs: Date.now() - startTime,
    },
  });
}
