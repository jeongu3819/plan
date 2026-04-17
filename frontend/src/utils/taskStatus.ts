import type { Task } from '../types';

export type BoardColumnId =
  | 'todo'
  | 'in_progress'
  | 'in_progress_advanced'
  | 'done'
  | 'hold';

export const BOARD_COLUMNS: {
  id: BoardColumnId;
  label: string;
  sublabel?: string;
  color: string;
  status: Task['status'];
}[] = [
  { id: 'todo', label: 'To Do', color: '#6B7280', status: 'todo' },
  { id: 'in_progress', label: 'In Progress', color: '#2955FF', status: 'in_progress' },
  { id: 'in_progress_advanced', label: 'In Progress', sublabel: '50% 이상 진행', color: '#7C3AED', status: 'in_progress' },
  { id: 'done', label: 'Done', color: '#22C55E', status: 'done' },
  { id: 'hold', label: 'Hold', color: '#F59E0B', status: 'hold' },
];

export const ALL_COLUMN_IDS: BoardColumnId[] = BOARD_COLUMNS.map((c) => c.id);

/**
 * Single source of truth: which visual column does a task belong to?
 * Rule:
 *  - hold       → hold
 *  - done OR progress≥100 → done
 *  - in_progress AND progress≥50 → in_progress_advanced
 *  - in_progress (progress<50)   → in_progress
 *  - todo       → todo
 */
export function deriveBoardColumn(task: Pick<Task, 'status' | 'progress'>): BoardColumnId {
  const status = task.status;
  const progress = task.progress ?? 0;
  if (status === 'hold') return 'hold';
  if (status === 'done' || progress >= 100) return 'done';
  if (status === 'in_progress') {
    return progress >= 50 ? 'in_progress_advanced' : 'in_progress';
  }
  return 'todo';
}

/** Does a task render in `colId`? Used by filter predicates. */
export function belongsToColumn(task: Pick<Task, 'status' | 'progress'>, colId: BoardColumnId): boolean {
  return deriveBoardColumn(task) === colId;
}

/**
 * Compute the (status, progress) updates needed to move a task into `targetCol`.
 * Returns `null` if the task already renders in that column (no update needed).
 *
 * Policy:
 *  - 50%+ is derived from progress, not a separate status. So moving between
 *    `in_progress` and `in_progress_advanced` requires adjusting progress %,
 *    not status.
 *  - Minimal change: set just enough progress to land in the target column.
 */
export function computeColumnMoveUpdates(
  task: Pick<Task, 'status' | 'progress'>,
  targetCol: BoardColumnId,
): Partial<Pick<Task, 'status' | 'progress'>> | null {
  const currentCol = deriveBoardColumn(task);
  if (currentCol === targetCol) return null;

  const progress = task.progress ?? 0;
  const updates: Partial<Pick<Task, 'status' | 'progress'>> = {};

  switch (targetCol) {
    case 'todo':
      updates.status = 'todo';
      if (progress !== 0) updates.progress = 0;
      return updates;
    case 'in_progress':
      updates.status = 'in_progress';
      if (progress >= 50) updates.progress = 49;
      else if (progress === 0) updates.progress = 1;
      return updates;
    case 'in_progress_advanced':
      updates.status = 'in_progress';
      if (progress < 50) updates.progress = 50;
      return updates;
    case 'done':
      updates.status = 'done';
      if (progress < 100) updates.progress = 100;
      return updates;
    case 'hold':
      updates.status = 'hold';
      return updates;
  }
}
