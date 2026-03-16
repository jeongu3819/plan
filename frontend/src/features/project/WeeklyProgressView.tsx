import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  getYear,
  getMonth,
  startOfISOWeek,
  endOfISOWeek,
  getISOWeek,
  format,
  parseISO,
  isWithinInterval,
} from 'date-fns';
import { api } from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import { Task, User } from '../../types';

interface WeeklyProgressViewProps {
  projectId: number;
}

const statusConfig: Record<string, { label: string; color: string; bgcolor: string }> = {
  todo: { label: 'To Do', color: '#6B7280', bgcolor: '#F3F4F6' },
  in_progress: { label: 'In Progress', color: '#2955FF', bgcolor: '#EEF2FF' },
  done: { label: 'Done', color: '#22C55E', bgcolor: '#F0FDF4' },
  hold: { label: 'Hold', color: '#F59E0B', bgcolor: '#FFFBEB' },
};

interface WeekGroup {
  label: string;
  dateRange: string;
  tasks: Task[];
  weekStart: Date;
}

const WeeklyProgressView: React.FC<WeeklyProgressViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const openDrawer = useAppStore(state => state.openDrawer);
  const currentUserId = useAppStore(state => state.currentUserId);

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data: tasks } = useQuery({
    queryKey: ['tasks', projectId, currentUserId],
    queryFn: () => api.getTasks(projectId, currentUserId),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  const userMap = useMemo(() => {
    const map = new Map<number, User>();
    (users || []).forEach(u => map.set(u.id, u));
    return map;
  }, [users]);

  const updateRemarksMutation = useMutation({
    mutationFn: ({ taskId, remarks }: { taskId: number; remarks: string }) =>
      api.updateTask(taskId, { remarks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleRemarksBlur = useCallback(
    (taskId: number) => {
      const task = tasks?.find(t => t.id === taskId);
      const newValue = editValue.trim();
      if (task && newValue !== (task.remarks || '')) {
        updateRemarksMutation.mutate({ taskId, remarks: newValue });
      }
      setEditingTaskId(null);
    },
    [editValue, tasks, updateRemarksMutation]
  );

  const handleRemarksKeyDown = useCallback(
    (e: React.KeyboardEvent, taskId: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRemarksBlur(taskId);
      } else if (e.key === 'Escape') {
        setEditingTaskId(null);
      }
    },
    [handleRemarksBlur]
  );

  // Group tasks by ISO week within the current month
  const weekGroups = useMemo(() => {
    if (!tasks) return { weeks: [] as WeekGroup[], undated: [] as Task[] };

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const year = getYear(currentMonth);
    const month = getMonth(currentMonth) + 1; // 1-based

    // Collect weeks that overlap with the current month
    const weekMap = new Map<string, WeekGroup>();
    const undated: Task[] = [];

    const activeTasks = tasks.filter(t => !t.archived_at);

    activeTasks.forEach(task => {
      if (!task.due_date && !task.start_date) {
        undated.push(task);
        return;
      }

      // Determine the task's effective date range
      const taskStart = task.start_date ? parseISO(task.start_date) : (task.due_date ? parseISO(task.due_date) : null);
      const taskEnd = task.due_date ? parseISO(task.due_date) : (task.start_date ? parseISO(task.start_date) : null);

      if (!taskStart || !taskEnd) {
        // Only one date exists — check if that single date falls within the month
        const singleDate = taskStart || taskEnd;
        if (!singleDate || !isWithinInterval(singleDate, { start: monthStart, end: monthEnd })) {
          // If the single date is outside this month, skip
          if (!singleDate) { undated.push(task); return; }
          return;
        }
      } else {
        // Both dates exist — check if the task's date range overlaps with the current month
        // Overlap condition: taskStart <= monthEnd AND taskEnd >= monthStart
        if (taskStart > monthEnd || taskEnd < monthStart) {
          return; // No overlap
        }
      }

      // Determine which week to place the task in:
      // Use due_date if it falls in this month, otherwise use the month boundary
      const effectiveDate = task.due_date ? parseISO(task.due_date) : taskEnd!;
      const dateForWeek = effectiveDate > monthEnd
        ? monthEnd // Task extends beyond this month — show in last week
        : effectiveDate < monthStart
          ? monthStart // Task started before this month — show in first week
          : effectiveDate;

      const weekStartDate = startOfISOWeek(dateForWeek);
      const weekEndDate = endOfISOWeek(dateForWeek);
      const isoWeek = getISOWeek(dateForWeek);
      const key = `${year}-W${isoWeek}`;

      if (!weekMap.has(key)) {
        const weekOfMonth = Math.ceil(dateForWeek.getDate() / 7);
        const rangeStart = format(weekStartDate, 'M/d');
        const rangeEnd = format(weekEndDate, 'M/d');
        weekMap.set(key, {
          label: `${month}월 ${weekOfMonth}주차`,
          dateRange: `(${rangeStart}~${rangeEnd})`,
          tasks: [],
          weekStart: weekStartDate,
        });
      }
      weekMap.get(key)!.tasks.push(task);
    });

    // Sort weeks by weekStart
    const weeks = Array.from(weekMap.values()).sort(
      (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
    );

    // Sort tasks within each week by due_date
    weeks.forEach(w => {
      w.tasks.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
    });

    return { weeks, undated };
  }, [tasks, currentMonth]);

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  const year = getYear(currentMonth);
  const month = getMonth(currentMonth) + 1;

  const renderAssignees = (assigneeIds: number[]) => {
    if (!assigneeIds || assigneeIds.length === 0) return <Typography variant="caption" sx={{ color: '#9CA3AF' }}>-</Typography>;
    const names = assigneeIds
      .map(id => userMap.get(id)?.username)
      .filter(Boolean)
      .join(', ');
    return (
      <Typography variant="caption" sx={{ fontSize: '0.8rem', color: '#374151' }}>
        {names}
      </Typography>
    );
  };

  const renderStatusChip = (status: string) => {
    const config = statusConfig[status] || statusConfig.todo;
    return (
      <Chip
        label={config.label}
        size="small"
        sx={{
          height: 24,
          fontSize: '0.7rem',
          fontWeight: 600,
          bgcolor: config.bgcolor,
          color: config.color,
          border: 'none',
        }}
      />
    );
  };

  const renderRemarksCell = (task: Task) => {
    if (editingTaskId === task.id) {
      return (
        <TextField
          autoFocus
          size="small"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => handleRemarksBlur(task.id)}
          onKeyDown={e => handleRemarksKeyDown(e, task.id)}
          variant="standard"
          sx={{
            width: '100%',
            '& .MuiInput-root': { fontSize: '0.8rem' },
          }}
        />
      );
    }
    return (
      <Box
        onClick={e => {
          e.stopPropagation();
          setEditingTaskId(task.id);
          setEditValue(task.remarks || '');
        }}
        sx={{
          minHeight: 24,
          cursor: 'text',
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.8rem',
            color: task.remarks ? '#374151' : '#D1D5DB',
          }}
        >
          {task.remarks || '클릭하여 입력'}
        </Typography>
      </Box>
    );
  };

  const totalTasks = weekGroups.weeks.reduce((sum, w) => sum + w.tasks.length, 0) + weekGroups.undated.length;

  return (
    <Box>
      {/* Month Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 2 }}>
        <IconButton size="small" onClick={handlePrevMonth}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', minWidth: 140, textAlign: 'center' }}>
          {year}년 {month}월
        </Typography>
        <IconButton size="small" onClick={handleNextMonth}>
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {/* Table */}
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.85)' }}>
              <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 160 }}>
                주차
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5 }}>
                업무
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 160 }}>
                담당자
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 110 }}>
                상태
              </TableCell>
              <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 200 }}>
                비고
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {weekGroups.weeks.map(week =>
              week.tasks.map((task, taskIdx) => (
                <TableRow
                  key={task.id}
                  hover
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(41,85,255,0.04)' },
                    '& td': { py: 1.2, borderColor: 'rgba(0,0,0,0.06)' },
                    ...(taskIdx === 0 && {
                      '& td': {
                        py: 1.2,
                        borderColor: 'rgba(0,0,0,0.06)',
                        borderTop: '2px solid rgba(41,85,255,0.12)',
                      },
                    }),
                  }}
                >
                  {taskIdx === 0 ? (
                    <TableCell
                      rowSpan={week.tasks.length}
                      sx={{
                        verticalAlign: 'top',
                        bgcolor: 'rgba(41,85,255,0.03)',
                        borderLeft: '3px solid #2955FF',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#1E40AF' }}>
                        {week.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.72rem' }}>
                        {week.dateRange}
                      </Typography>
                    </TableCell>
                  ) : null}
                  <TableCell onClick={() => openDrawer(task, projectId)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: (statusConfig[task.status] || statusConfig.todo).color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {task.title}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell onClick={() => openDrawer(task, projectId)}>
                    {renderAssignees(task.assignee_ids)}
                  </TableCell>
                  <TableCell onClick={() => openDrawer(task, projectId)}>
                    {renderStatusChip(task.status)}
                  </TableCell>
                  <TableCell>{renderRemarksCell(task)}</TableCell>
                </TableRow>
              ))
            )}

            {/* Undated tasks */}
            {weekGroups.undated.length > 0 &&
              weekGroups.undated.map((task, taskIdx) => (
                <TableRow
                  key={task.id}
                  hover
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(41,85,255,0.04)' },
                    '& td': { py: 1.2, borderColor: 'rgba(0,0,0,0.06)' },
                    ...(taskIdx === 0 && {
                      '& td': {
                        py: 1.2,
                        borderColor: 'rgba(0,0,0,0.06)',
                        borderTop: '2px solid rgba(245,158,11,0.2)',
                      },
                    }),
                  }}
                >
                  {taskIdx === 0 ? (
                    <TableCell
                      rowSpan={weekGroups.undated.length}
                      sx={{
                        verticalAlign: 'top',
                        bgcolor: 'rgba(245,158,11,0.03)',
                        borderLeft: '3px solid #F59E0B',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#92400E' }}>
                        미정
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.72rem' }}>
                        (마감일 없음)
                      </Typography>
                    </TableCell>
                  ) : null}
                  <TableCell onClick={() => openDrawer(task, projectId)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: (statusConfig[task.status] || statusConfig.todo).color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                        {task.title}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell onClick={() => openDrawer(task, projectId)}>
                    {renderAssignees(task.assignee_ids)}
                  </TableCell>
                  <TableCell onClick={() => openDrawer(task, projectId)}>
                    {renderStatusChip(task.status)}
                  </TableCell>
                  <TableCell>{renderRemarksCell(task)}</TableCell>
                </TableRow>
              ))}

            {totalTasks === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                    이 달에 해당하는 업무가 없습니다.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default WeeklyProgressView;
