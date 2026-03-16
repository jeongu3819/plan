/**
 * Density Score — Activity-Based Priority
 *
 * Calculates a "heat" score for each task based on activity signals.
 * This is a DERIVED signal layered on top of manual priority, not a replacement.
 *
 * Scoring weights (tunable):
 *   - TaskActivity count (checkbox + text blocks)
 *   - Checkbox completion rate
 *   - Recent update recency
 *   - Progress momentum
 */

import { Task, TaskActivity } from '../types';

export interface DensityResult {
  score: number;       // 0–100
  level: 'cold' | 'warm' | 'hot';
  label: string;       // Display label
}

// ── Tunable thresholds ──
const THRESHOLDS = {
  HOT: 65,
  WARM: 35,
};

// ── Weight config (total should sum to ~100 max contribution) ──
const WEIGHTS = {
  ACTIVITY_COUNT: 20,        // max 20 pts for having many activity blocks
  ACTIVITY_COUNT_CAP: 10,    // cap at this many blocks
  CHECKBOX_RATE: 25,         // max 25 pts for checkbox completion rate
  RECENCY: 30,               // max 30 pts for recent updates
  RECENCY_DAYS_CAP: 14,      // tasks updated within this many days get full score
  PROGRESS_MOMENTUM: 25,     // max 25 pts for progress > 0
};

/**
 * Calculate density score for a single task.
 *
 * @param task       - The task object
 * @param activities - TaskActivity[] for this task (optional, can be empty)
 */
export function calculateDensityScore(
  task: Task,
  activities: TaskActivity[] = []
): DensityResult {
  let score = 0;

  // 1) Activity count contribution
  const actCount = Math.min(activities.length, WEIGHTS.ACTIVITY_COUNT_CAP);
  score += (actCount / WEIGHTS.ACTIVITY_COUNT_CAP) * WEIGHTS.ACTIVITY_COUNT;

  // 2) Checkbox completion rate
  const checkboxes = activities.filter(a => a.block_type === 'checkbox');
  if (checkboxes.length > 0) {
    const checkedCount = checkboxes.filter(a => a.checked).length;
    const rate = checkedCount / checkboxes.length;
    // Higher score for partially completed (active work), not 100% done
    const adjustedRate = rate >= 1 ? 0.5 : rate > 0 ? rate + 0.3 : 0;
    score += Math.min(adjustedRate, 1) * WEIGHTS.CHECKBOX_RATE;
  }

  // 3) Recency — how recently was the task updated?
  if (task.updated_at) {
    const daysSinceUpdate = Math.max(
      0,
      (Date.now() - new Date(task.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const recencyFactor = Math.max(0, 1 - daysSinceUpdate / WEIGHTS.RECENCY_DAYS_CAP);
    score += recencyFactor * WEIGHTS.RECENCY;
  }

  // 4) Progress momentum — tasks with progress > 0 and < 100 are actively worked on
  const progress = task.progress ?? 0;
  if (progress > 0 && progress < 100) {
    score += (progress / 100) * WEIGHTS.PROGRESS_MOMENTUM;
  } else if (progress >= 100) {
    score += WEIGHTS.PROGRESS_MOMENTUM * 0.3; // completed tasks get partial credit
  }

  // Clamp to 0-100
  score = Math.round(Math.min(100, Math.max(0, score)));

  const level: DensityResult['level'] =
    score >= THRESHOLDS.HOT ? 'hot' : score >= THRESHOLDS.WARM ? 'warm' : 'cold';

  const label =
    level === 'hot' ? 'Hot' : level === 'warm' ? 'Active' : '';

  return { score, level, label };
}

/**
 * Batch-calculate density scores for tasks.
 * Uses a map of taskId → activities for efficiency.
 */
export function calculateBatchDensity(
  tasks: Task[],
  activitiesMap: Record<number, TaskActivity[]>
): Map<number, DensityResult> {
  const results = new Map<number, DensityResult>();
  for (const task of tasks) {
    results.set(task.id, calculateDensityScore(task, activitiesMap[task.id] || []));
  }
  return results;
}
