import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import { Task } from '../../types';
import WeeklyProgressView from './WeeklyProgressView';
import { api } from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import QuickAdd from '../../components/QuickAdd';
import TaskCard from '../task/TaskCard';
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BoardViewProps {
  projectId: number;
}

// Visual columns for the board
const BOARD_COLUMNS: { id: string; label: string; sublabel?: string; color: string; status: Task['status'] }[] = [
  { id: 'todo', label: 'To Do', color: '#6B7280', status: 'todo' },
  { id: 'in_progress', label: 'In Progress', color: '#2955FF', status: 'in_progress' },
  { id: 'in_progress_advanced', label: 'In Progress', sublabel: '50% 이상 진행', color: '#7C3AED', status: 'in_progress' },
  { id: 'done', label: 'Done', color: '#22C55E', status: 'done' },
  { id: 'hold', label: 'Hold', color: '#F59E0B', status: 'hold' },
];

// All droppable IDs (including hold)
const ALL_DROP_IDS = ['todo', 'in_progress', 'in_progress_advanced', 'done', 'hold'];

type SortField = 'default' | 'created_at' | 'due_date' | 'priority' | 'title';
type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'default', label: '기본순서' },
  { value: 'due_date', label: '마감일순' },
  { value: 'priority', label: '우선순위순' },
  { value: 'title', label: '이름순' },
  { value: 'created_at', label: '생성일순' },
];

const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Sortable task wrapper
const SortableTaskItem = ({ task, onClick, compact }: { task: Task; onClick: () => void; compact?: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} compact={compact} />
    </div>
  );
};

// Droppable column wrapper
const DroppableColumn = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        flexGrow: 1,
        overflowY: 'auto',
        padding: '8px',
        minHeight: 100,
        borderRadius: 8,
        backgroundColor: isOver ? 'rgba(41, 85, 255, 0.08)' : 'transparent',
        transition: 'background-color 0.2s ease',
      }}
    >
      {children}
    </div>
  );
};

// Flow connector between columns (CSS-based)
const FlowConnector = ({ fromColor, toColor }: { fromColor: string; toColor: string }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      width: 20,
      flexShrink: 0,
      mx: 0.5,
    }}
  >
    {/* Solid gradient bar */}
    <Box
      sx={{
        flex: 1,
        height: 6,
        borderRadius: 3,
        background: `linear-gradient(to right, ${fromColor}66, ${toColor}99)`,
      }}
    />
    {/* Triangle arrowhead */}
    <Box
      sx={{
        width: 0,
        height: 0,
        borderTop: '8px solid transparent',
        borderBottom: '8px solid transparent',
        borderLeft: `10px solid ${toColor}88`,
        flexShrink: 0,
      }}
    />
  </Box>
);


const BoardView: React.FC<BoardViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const openDrawer = useAppStore(state => state.openDrawer);
  const currentUserId = useAppStore(state => state.currentUserId);
  const filterSearch = useAppStore(state => state.filterSearch);

  const { data: rawTasks, isLoading } = useQuery({
    queryKey: ['tasks', projectId, currentUserId],
    queryFn: () => api.getTasks(projectId, currentUserId),
  });
  const tasks = React.useMemo(() => {
    if (!rawTasks) return rawTasks;
    if (!filterSearch.trim()) return rawTasks;
    const q = filterSearch.trim().toLowerCase();
    return rawTasks.filter(t => t.title.toLowerCase().includes(q));
  }, [rawTasks, filterSearch]);
  const [activeTask, setActiveTask] = React.useState<Task | null>(null);
  const [sortField, setSortField] = React.useState<SortField>('default');
  const [sortDirection, setSortDirection] = React.useState<SortDirection>('asc');
  const [viewMode, setViewMode] = React.useState<'board' | 'weekly'>('board');

  const sortTasks = React.useCallback(
    (taskList: Task[]): Task[] => {
      if (sortField === 'default') return taskList;
      return [...taskList].sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
          case 'due_date': {
            const aVal = a.due_date || '';
            const bVal = b.due_date || '';
            if (!aVal && !bVal) cmp = 0;
            else if (!aVal) cmp = 1;
            else if (!bVal) cmp = -1;
            else cmp = aVal.localeCompare(bVal);
            break;
          }
          case 'priority': {
            const aP = priorityOrder[a.priority || ''] ?? 3;
            const bP = priorityOrder[b.priority || ''] ?? 3;
            cmp = aP - bP;
            break;
          }
          case 'title': {
            cmp = (a.title || '').localeCompare(b.title || '');
            break;
          }
          case 'created_at': {
            const aVal = a.created_at || '';
            const bVal = b.created_at || '';
            cmp = aVal.localeCompare(bVal);
            break;
          }
        }
        return sortDirection === 'desc' ? -cmp : cmp;
      });
    },
    [sortField, sortDirection]
  );

  // Sort by due_date ascending (earlier first, no date last)
  const sortByDueDateAsc = (list: Task[]) =>
    [...list].sort((a, b) => {
      const aD = a.due_date || '';
      const bD = b.due_date || '';
      if (!aD && !bD) return 0;
      if (!aD) return 1;
      if (!bD) return -1;
      return aD.localeCompare(bD);
    });

  // Sort by due_date descending (latest first, no date last)
  const sortByDueDateDesc = (list: Task[]) =>
    [...list].sort((a, b) => {
      const aD = a.due_date || '';
      const bD = b.due_date || '';
      if (!aD && !bD) return 0;
      if (!aD) return 1;
      if (!bD) return -1;
      return bD.localeCompare(aD);
    });

  // Get tasks for each visual column
  const getColumnTasks = React.useCallback(
    (colId: string): Task[] => {
      if (!tasks) return [];
      switch (colId) {
        case 'todo':
          return tasks.filter(t => t.status === 'todo');
        case 'in_progress':
          return sortByDueDateAsc(tasks.filter(t => t.status === 'in_progress' && (t.progress ?? 0) < 50));
        case 'in_progress_advanced':
          return sortByDueDateAsc(tasks.filter(t => t.status === 'in_progress' && (t.progress ?? 0) >= 50));
        case 'done':
          return sortByDueDateDesc(tasks.filter(t => t.status === 'done'));
        case 'hold':
          return tasks.filter(t => t.status === 'hold');
        default:
          return [];
      }
    },
    [tasks]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      api.updateTask(taskId, { status: status as Task['status'] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks?.find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as number;
    const overId = over.id as string;

    // Determine the target status from drop zone
    let newStatus = '';
    if (ALL_DROP_IDS.includes(overId)) {
      // Dropped on a column/zone directly
      const col = BOARD_COLUMNS.find(c => c.id === overId);
      newStatus = col ? col.status : '';
    } else {
      // Dropped over another task — find which column it belongs to
      const overTask = tasks?.find(t => t.id === Number(overId));
      if (overTask) newStatus = overTask.status;
    }

    const draggedTask = tasks?.find(t => t.id === activeId);
    if (draggedTask && newStatus && draggedTask.status !== newStatus) {
      updateStatusMutation.mutate({ taskId: activeId, status: newStatus });
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, p: 2 }}>
        {BOARD_COLUMNS.map(col => (
          <Paper
            key={col.id}
            sx={{ flex: 1, minWidth: 240, height: 400, bgcolor: '#F3F4F6', borderRadius: 2 }}
            elevation={0}
          />
        ))}
      </Box>
    );
  }

  if (viewMode === 'weekly') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1.5, flexShrink: 0 }}>
          <Tooltip title="보드 뷰">
            <Chip
              icon={<ViewKanbanIcon sx={{ fontSize: 16 }} />}
              label="보드"
              size="small"
              onClick={() => setViewMode('board')}
              sx={{
                height: 30,
                fontSize: '0.78rem',
                fontWeight: 600,
                bgcolor: '#F3F4F6',
                color: '#374151',
                cursor: 'pointer',
                '&:hover': { bgcolor: '#E5E7EB' },
              }}
            />
          </Tooltip>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <WeeklyProgressView projectId={projectId} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
      {/* Sort Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexShrink: 0 }}>
        <SortIcon sx={{ fontSize: 18, color: '#6B7280' }} />
        <TextField
          select
          size="small"
          value={sortField}
          onChange={e => setSortField(e.target.value as SortField)}
          sx={{
            minWidth: 130,
            '& .MuiOutlinedInput-root': { fontSize: '0.8rem', height: 32 },
            '& .MuiSelect-select': { py: 0.5 },
          }}
        >
          {SORT_OPTIONS.map(opt => (
            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.8rem' }}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
        {sortField !== 'default' && (
          <Tooltip title={sortDirection === 'asc' ? '오름차순' : '내림차순'}>
            <IconButton
              size="small"
              onClick={() => setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))}
              sx={{ color: '#2955FF' }}
            >
              {sortDirection === 'asc' ? (
                <ArrowUpwardIcon sx={{ fontSize: 18 }} />
              ) : (
                <ArrowDownwardIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="주차별 진척사항">
          <Chip
            icon={<CalendarViewWeekIcon sx={{ fontSize: 16 }} />}
            label="주차별 진척사항"
            size="small"
            onClick={() => setViewMode('weekly')}
            sx={{
              height: 30,
              fontSize: '0.78rem',
              fontWeight: 600,
              bgcolor: '#EEF2FF',
              color: '#2955FF',
              cursor: 'pointer',
              '&:hover': { bgcolor: '#DBEAFE' },
            }}
          />
        </Tooltip>
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Main Board Columns */}
        <Box
          sx={{ display: 'flex', gap: 0, alignItems: 'stretch', overflowX: 'auto', pb: 1.5, flex: 1, minHeight: 0 }}
        >
          {BOARD_COLUMNS.map((col, colIndex) => {
            const colTasks = sortTasks(getColumnTasks(col.id));
            const isLastWorkflow = col.id === 'done';
            const showArrow = colIndex < BOARD_COLUMNS.length - 1 && !isLastWorkflow;

            return (
              <React.Fragment key={col.id}>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 240,
                  bgcolor: 'rgba(255,255,255,0.5)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 2,
                  boxShadow: '0 1px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                {/* Column Header */}
                <Box
                  sx={{
                    p: 1.5,
                    px: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: col.color }} />
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#374151' }}
                    >
                      {col.label}
                    </Typography>
                    {col.sublabel && (
                      <Chip
                        label={col.sublabel}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.62rem',
                          fontWeight: 600,
                          bgcolor: `${col.color}15`,
                          color: col.color,
                          border: `1px solid ${col.color}30`,
                        }}
                      />
                    )}
                    <Chip
                      label={colTasks.length}
                      size="small"
                      sx={{
                        height: 20,
                        minWidth: 20,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: '#E5E7EB',
                        color: '#6B7280',
                      }}
                    />
                  </Box>
                </Box>

                {/* Progress bar for advanced column */}
                {col.id === 'in_progress_advanced' && (
                  <Box sx={{ px: 2, pb: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={50}
                      sx={{
                        height: 3,
                        borderRadius: 2,
                        bgcolor: '#E5E7EB',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: col.color,
                          borderRadius: 2,
                        },
                      }}
                    />
                  </Box>
                )}

                {/* Droppable + Sortable Area */}
                <SortableContext
                  id={col.id}
                  items={colTasks.map(t => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <DroppableColumn id={col.id}>
                    {colTasks.length === 0 ? (
                      <Box
                        sx={{
                          p: 3,
                          textAlign: 'center',
                          color: '#9CA3AF',
                          border: '2px dashed #E5E7EB',
                          borderRadius: 2,
                        }}
                      >
                        <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                          Drop tasks here
                        </Typography>
                      </Box>
                    ) : (
                      colTasks.map(task => (
                        <SortableTaskItem
                          key={task.id}
                          task={task}
                          onClick={() => openDrawer(task, projectId)}
                        />
                      ))
                    )}
                  </DroppableColumn>
                </SortableContext>

                {/* Quick Add (only for todo and in_progress) */}
                {(col.id === 'todo' || col.id === 'in_progress') && (
                  <Box sx={{ px: 1, pb: 1 }}>
                    <QuickAdd projectId={projectId} defaultStatus={col.status} />
                  </Box>
                )}
              </Box>
              {/* Flow connector between columns / spacer before Hold */}
              {showArrow && (
                <FlowConnector
                  fromColor={col.color}
                  toColor={BOARD_COLUMNS[colIndex + 1].color}
                />
              )}
              {isLastWorkflow && (
                <Box sx={{ width: 20 + 8, flexShrink: 0 }} />
              )}
              </React.Fragment>
            );
          })}
        </Box>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              onClick={() => {}}
              style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.15)', transform: 'rotate(3deg)' }}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </Box>
  );
};

export default BoardView;
