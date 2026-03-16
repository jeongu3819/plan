/**
 * Hook: useDensityScores
 *
 * Fetches task activities and calculates density scores for a list of tasks.
 * Returns a Map<taskId, DensityResult> for use in any task list UI.
 */

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Task, TaskActivity } from '../types';
import { api } from '../api/client';
import { calculateBatchDensity, DensityResult } from '../utils/densityScore';

export function useDensityScores(tasks: Task[]): Map<number, DensityResult> {
  // Only fetch activities for non-done tasks to reduce API calls
  const activeTasks = useMemo(
    () => tasks.filter(t => t.status !== 'done'),
    [tasks]
  );

  const activityQueries = useQueries({
    queries: activeTasks.map(task => ({
      queryKey: ['activities', task.id],
      queryFn: () => api.getTaskActivities(task.id),
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: activeTasks.length > 0,
    })),
  });

  return useMemo(() => {
    const activitiesMap: Record<number, TaskActivity[]> = {};
    activeTasks.forEach((task, idx) => {
      const query = activityQueries[idx];
      if (query?.data) {
        activitiesMap[task.id] = query.data;
      }
    });
    return calculateBatchDensity(tasks, activitiesMap);
  }, [tasks, activeTasks, activityQueries]);
}
