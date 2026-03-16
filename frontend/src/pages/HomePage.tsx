import React, { useState, useEffect, useRef } from 'react';
import Lottie from 'lottie-react';
import pandaAnimation from '../assets/lottie/calendar-animation.json';
import {
  Box,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  IconButton,
  Divider,
  Tooltip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Switch,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import UpcomingIcon from '@mui/icons-material/Upcoming';
import PersonIcon from '@mui/icons-material/Person';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import FolderIcon from '@mui/icons-material/Folder';
import WidgetsIcon from '@mui/icons-material/Widgets';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, DashboardStats, ProjectStats, Shortcut, UserShortcut } from '../api/client';
import { Task } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';
import { useDensityScores } from '../hooks/useDensityScores';
import ZeroStateDashboard from '../components/ZeroStateDashboard';
import {
  format,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isToday as isDateToday,
  addMonths,
  subMonths,
} from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Korean Public Holidays (2025–2027) ──
const KOREAN_HOLIDAYS: Record<string, string> = {
  '2025-01-01': '신정',
  '2025-01-28': '설날 연휴',
  '2025-01-29': '설날',
  '2025-01-30': '설날 연휴',
  '2025-03-01': '삼일절',
  '2025-05-05': '어린이날',
  '2025-05-06': '대체공휴일',
  '2025-05-15': '부처님오신날',
  '2025-06-06': '현충일',
  '2025-08-15': '광복절',
  '2025-10-03': '개천절',
  '2025-10-05': '추석 연휴',
  '2025-10-06': '추석',
  '2025-10-07': '추석 연휴',
  '2025-10-08': '대체공휴일',
  '2025-10-09': '한글날',
  '2025-12-25': '성탄절',
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
  '2027-01-01': '신정',
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '대체공휴일',
  '2027-03-01': '삼일절',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-06-07': '대체공휴일',
  '2027-08-15': '광복절',
  '2027-08-16': '대체공휴일',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절',
  '2027-10-04': '대체공휴일',
  '2027-10-09': '한글날',
  '2027-10-11': '대체공휴일',
  '2027-12-25': '성탄절',
  '2027-12-27': '대체공휴일',
};

interface WidgetDef {
  id: string;
  title: string;
  icon: React.ReactNode;
}

const ALL_WIDGETS: WidgetDef[] = [
  { id: 'overview', title: 'Overview', icon: <AssessmentIcon /> },
  { id: 'overdue', title: 'Overdue Tasks', icon: <WarningAmberIcon /> },
  { id: 'upcoming', title: 'Upcoming Tasks', icon: <UpcomingIcon /> },
  { id: 'mytasks', title: 'My Tasks', icon: <PersonIcon /> },
  { id: 'projects', title: 'Projects', icon: <FolderIcon /> },
  { id: 'calendar', title: 'Calendar', icon: <CalendarMonthIcon /> },
];

const DEFAULT_VISIBLE = ALL_WIDGETS.map(w => w.id);

const statusColors: Record<string, string> = {
  todo: '#6B7280',
  in_progress: '#2955FF',
  done: '#22C55E',
  hold: '#F59E0B',
};

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  hold: 'Hold',
};

// ── Default & min widget height ──
// Dynamically fit 2 rows of widgets into the viewport
// Header area (~140px) + grid gap (16px) + bottom padding (16px) ≈ 172px overhead
function getDefaultWidgetHeight() {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  return Math.max(200, Math.floor((vh - 172) / 2));
}
const MIN_WIDGET_HEIGHT = 120;
const MAX_WIDGET_HEIGHT = 600;

// ── Sortable Widget Wrapper with resizable height ──
const SortableWidget: React.FC<{
  id: string;
  height: number;
  onHeightChange: (id: string, height: number) => void;
  children: React.ReactNode;
}> = ({ id, height, onHeightChange, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : ('auto' as any),
  };

  // Resize handle logic
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = height;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const newH = Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, startHeight + delta));
      onHeightChange(id, newH);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: isDragging ? '2px solid #2955FF' : '1px solid rgba(0,0,0,0.08)',
        bgcolor: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(12px)',
        height,
        transition: 'box-shadow 0.2s, border 0.2s',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        '&:hover': { boxShadow: '0 6px 20px rgba(0,0,0,0.08)' },
        '&:hover .drag-handle': { opacity: 1 },
        '&:hover .resize-handle': { opacity: 1 },
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        className="drag-handle"
        {...attributes}
        {...listeners}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          opacity: 0,
          transition: 'opacity 0.2s',
          cursor: 'grab',
          color: '#CBD5E1',
          '&:hover': { color: '#2955FF' },
          '&:active': { cursor: 'grabbing' },
          zIndex: 5,
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: '1.1rem' }} />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.12)', borderRadius: 2 } }}>
        {children}
      </Box>
      {/* Resize handle */}
      <Box
        className="resize-handle"
        onMouseDown={handleResizeStart}
        sx={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 40,
          height: 8,
          cursor: 'ns-resize',
          opacity: 0,
          transition: 'opacity 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5,
          '&::after': {
            content: '""',
            width: 28,
            height: 3,
            borderRadius: 2,
            bgcolor: '#CBD5E1',
          },
          '&:hover::after': {
            bgcolor: '#2955FF',
          },
        }}
      />
    </Paper>
  );
};

const HomePage: React.FC = () => {
  const currentUserId = useAppStore(state => state.currentUserId);
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [calMonth, setCalMonth] = useState(new Date());
  const [overviewFilter, setOverviewFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [hideDoneTasks, setHideDoneTasks] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() });
  const meRole = ((me as any)?.role || '').toLowerCase().trim();
  const isAdminLike = meRole === 'admin' || meRole === 'super_admin';

  const currentSpaceId = useAppStore(state => state.currentSpaceId);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['stats', currentUserId, currentSpaceId],
    queryFn: () => api.getStats(currentUserId, currentSpaceId),
  });

  // Density Scores for My Tasks widget
  const myTasksForDensity = stats?.my_tasks || [];
  const densityScores = useDensityScores(myTasksForDensity);

  // Zero State: no projects at all
  const hasProjects = (stats?.project_stats || []).length > 0;

  const { data: savedLayout } = useQuery({
    queryKey: ['layout', currentUserId],
    queryFn: () => api.getUserLayout(currentUserId),
  });

  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (layout: any) => api.saveUserLayout(currentUserId, layout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layout', currentUserId] });
    },
  });

  // Visible widgets + order — saved preference or default
  const widgetOrder: string[] =
    savedLayout?.widgetOrder && Array.isArray(savedLayout.widgetOrder)
      ? (savedLayout.widgetOrder as string[]).filter(id => ALL_WIDGETS.some(w => w.id === id))
      : DEFAULT_VISIBLE;

  const visibleWidgets: string[] =
    savedLayout?.widgetIds && Array.isArray(savedLayout.widgetIds)
      ? (savedLayout.widgetIds as string[]).filter(id => ALL_WIDGETS.some(w => w.id === id))
      : DEFAULT_VISIBLE;

  // Per-widget heights (persisted in layout)
  const widgetHeights: Record<string, number> =
    savedLayout?.widgetHeights && typeof savedLayout.widgetHeights === 'object'
      ? (savedLayout.widgetHeights as Record<string, number>)
      : {};

  const defaultH = getDefaultWidgetHeight();
  const getWidgetHeight = (id: string) => widgetHeights[id] || defaultH;

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleWidgetHeightChange = (id: string, height: number) => {
    const next = { ...widgetHeights, [id]: height };
    // Optimistic update
    queryClient.setQueryData(['layout', currentUserId], (old: any) => ({
      ...old,
      widgetHeights: next,
    }));
    // Debounced save
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveMutation.mutate({ widgetIds: visibleWidgets, widgetOrder, widgetHeights: next, gridLayouts: {} });
    }, 500);
  };

  const toggleWidget = (id: string) => {
    const next = visibleWidgets.includes(id)
      ? visibleWidgets.filter(w => w !== id)
      : [...visibleWidgets, id];
    queryClient.setQueryData(['layout', currentUserId], (old: any) => ({
      ...old,
      widgetIds: next,
    }));
    saveMutation.mutate({ widgetIds: next, widgetOrder, gridLayouts: {} });
  };

  const resetToDefault = () => {
    queryClient.setQueryData(['layout', currentUserId], (old: any) => ({
      ...old,
      widgetIds: DEFAULT_VISIBLE,
      widgetOrder: DEFAULT_VISIBLE,
      widgetHeights: {},
    }));
    saveMutation.mutate({
      widgetIds: DEFAULT_VISIBLE,
      widgetOrder: DEFAULT_VISIBLE,
      widgetHeights: {},
      gridLayouts: {},
    });
  };

  const resetWidgetHeights = () => {
    queryClient.setQueryData(['layout', currentUserId], (old: any) => ({
      ...old,
      widgetHeights: {},
    }));
    saveMutation.mutate({ widgetIds: visibleWidgets, widgetOrder, widgetHeights: {}, gridLayouts: {} });
  };

  // ── DnD sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = displayOrder.indexOf(active.id as string);
      const newIdx = displayOrder.indexOf(over.id as string);
      const newOrder = arrayMove(displayOrder, oldIdx, newIdx);
      // Also update widgetOrder to include all for persistence
      const fullNewOrder = newOrder.concat(widgetOrder.filter(id => !newOrder.includes(id)));
      queryClient.setQueryData(['layout', currentUserId], (old: any) => ({
        ...old,
        widgetOrder: fullNewOrder,
      }));
      saveMutation.mutate({
        widgetIds: visibleWidgets,
        widgetOrder: fullNewOrder,
        gridLayouts: {},
      });
    }
  };

  const { openDrawer } = useAppStore();

  // ── Task list helper ──
  const renderTaskList = (tasks: Task[] | undefined, emptyMsg: string) => {
    if (!tasks || tasks.length === 0) {
      return (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
            {emptyMsg}
          </Typography>
        </Box>
      );
    }
    return (
      <Box>
        {tasks.map(task => (
          <Box
            key={task.id}
            onClick={() => openDrawer(task)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              py: 1,
              px: 1.5,
              borderRadius: 1.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
              transition: 'all 0.15s',
            }}
          >
            {task.status === 'done' ? (
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: '#22C55E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CheckIcon sx={{ fontSize: 11, color: '#fff' }} />
              </Box>
            ) : (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: statusColors[task.status] || '#6B7280',
                  flexShrink: 0,
                }}
              />
            )}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task.title}
              </Typography>
              {task.due_date && (
                <Typography
                  variant="caption"
                  sx={{
                    color:
                      differenceInDays(new Date(task.due_date), new Date()) < 0 ? '#EF4444' : '#9CA3AF',
                    fontSize: '0.7rem',
                  }}
                >
                  Due {format(new Date(task.due_date), 'MMM dd')}
                </Typography>
              )}
            </Box>
            <Chip
              label={task.priority || 'medium'}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor:
                  task.priority === 'high'
                    ? '#FEF2F2'
                    : task.priority === 'low'
                      ? '#F3F4F6'
                      : '#EFF6FF',
                color:
                  task.priority === 'high'
                    ? '#EF4444'
                    : task.priority === 'low'
                      ? '#6B7280'
                      : '#3B82F6',
              }}
            />
          </Box>
        ))}
      </Box>
    );
  };

  // ── Widget header ──
  const WidgetHeader: React.FC<{ def: WidgetDef }> = ({ def }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: 0.5 }}>
      <Box sx={{ color: '#2955FF', display: 'flex' }}>
        {React.cloneElement(def.icon as React.ReactElement, { sx: { fontSize: '1.1rem' } })}
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', flexGrow: 1 }}>
        {def.title}
      </Typography>
    </Box>
  );

  // ── Widget content ──
  const renderWidget = (widgetId: string) => {
    const def = ALL_WIDGETS.find(w => w.id === widgetId)!;

    switch (widgetId) {
      case 'overview': {
        const statusFilterMap: Record<string, string> = {
          Total: 'all',
          'In Progress': 'in_progress',
          Done: 'done',
          'To Do': 'todo',
        };
        const allOverviewTasks: Task[] = stats?.all_tasks || [];
        const filteredOverviewTasks =
          overviewFilter && overviewFilter !== 'all'
            ? allOverviewTasks.filter(t => t.status === overviewFilter)
            : allOverviewTasks;

        return (
          <>
            <WidgetHeader def={def} />
            {statsLoading ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CircularProgress size={20} />
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                  {[
                    { label: 'Total', value: stats?.total || 0, color: '#1A1D29' },
                    { label: 'In Progress', value: stats?.in_progress || 0, color: '#2955FF' },
                    { label: 'Done', value: stats?.done || 0, color: '#22C55E' },
                    { label: 'To Do', value: stats?.todo || 0, color: '#6B7280' },
                  ].map(item => (
                    <Box
                      key={item.label}
                      onClick={() =>
                        setOverviewFilter(prev =>
                          prev === statusFilterMap[item.label] ? null : statusFilterMap[item.label]
                        )
                      }
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        cursor: 'pointer',
                        bgcolor:
                          overviewFilter === statusFilterMap[item.label]
                            ? `${item.color}10`
                            : 'rgba(255,255,255,0.5)',
                        border:
                          overviewFilter === statusFilterMap[item.label]
                            ? `2px solid ${item.color}`
                            : '1px solid rgba(0,0,0,0.06)',
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: `${item.color}08`, transform: 'translateY(-1px)' },
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ color: '#9CA3AF', fontSize: '0.65rem', fontWeight: 500 }}
                      >
                        {item.label}
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 800, color: item.color, fontSize: '1.3rem' }}
                      >
                        {item.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Filtered task list */}
                {overviewFilter && (
                  <Box sx={{ mt: 1 }}>
                    <Divider sx={{ mb: 1 }} />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.7rem',
                        color: '#6B7280',
                        mb: 0.5,
                        display: 'block',
                      }}
                    >
                      {overviewFilter === 'all'
                        ? 'All Tasks'
                        : statusLabels[overviewFilter] || overviewFilter}{' '}
                      ({filteredOverviewTasks.length})
                    </Typography>
                    {filteredOverviewTasks.length === 0 ? (
                      <Typography
                        sx={{ fontSize: '0.75rem', color: '#9CA3AF', py: 1, textAlign: 'center' }}
                      >
                        No tasks
                      </Typography>
                    ) : (
                      <Box>
                      {filteredOverviewTasks.map(task => (
                        <Box
                          key={task.id}
                          onClick={() => openDrawer(task)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.5,
                            px: 0.5,
                            borderRadius: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                            transition: 'background 0.1s',
                          }}
                        >
                          <Box
                            sx={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              flexShrink: 0,
                              bgcolor: statusColors[task.status] || '#6B7280',
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              flexGrow: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {task.title}
                          </Typography>
                          {task.due_date && (
                            <Typography
                              sx={{ fontSize: '0.6rem', color: '#9CA3AF', flexShrink: 0 }}
                            >
                              {format(new Date(task.due_date), 'M/d')}
                            </Typography>
                          )}
                        </Box>
                      ))
                      }
                      </Box>
                    )}
                  </Box>
                )}

                {(stats?.total || 0) > 0 && !overviewFilter && (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
                        Completion
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 700, fontSize: '0.7rem', color: '#22C55E' }}
                      >
                        {Math.round(((stats?.done || 0) / (stats?.total || 1)) * 100)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={((stats?.done || 0) / (stats?.total || 1)) * 100}
                      sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: 'rgba(0,0,0,0.08)',
                        '& .MuiLinearProgress-bar': { bgcolor: '#22C55E', borderRadius: 3 },
                      }}
                    />
                  </Box>
                )}
              </Box>
            )}
          </>
        );
      }
      case 'overdue':
        return (
          <>
            <WidgetHeader def={def} />
            {renderTaskList(stats?.overdue, 'No overdue tasks 🎉')}
          </>
        );
      case 'upcoming':
        return (
          <>
            <WidgetHeader def={def} />
            {renderTaskList(stats?.upcoming, 'No upcoming tasks')}
          </>
        );
      case 'mytasks': {
        const statusOrder: Record<string, number> = { in_progress: 0, todo: 1, done: 2, hold: 3 };
        const sortedMyTasks = [...(stats?.my_tasks || [])]
          .filter(t => !(hideDoneTasks && t.status === 'done'))
          .sort((a, b) => {
            const sa = statusOrder[a.status] ?? 2;
            const sb = statusOrder[b.status] ?? 2;
            if (sa !== sb) return sa - sb;
            // Within same status, sort by due date (earliest first, no date last)
            if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            if (a.due_date) return -1;
            if (b.due_date) return 1;
            return 0;
          });
        const doneCount = (stats?.my_tasks || []).filter(t => t.status === 'done').length;

        const renderMyTaskList = (tasks: Task[]) => {
          if (tasks.length === 0) {
            return (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                  No tasks assigned to you
                </Typography>
              </Box>
            );
          }
          return (
            <Box>
              {tasks.map(task => {
                const density = densityScores.get(task.id);
                const isHot = density?.level === 'hot';
                const isWarm = density?.level === 'warm';
                return (
                  <Box
                    key={task.id}
                    onClick={() => openDrawer(task)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 1,
                      px: 1.5,
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      position: 'relative',
                      borderLeft: isHot
                        ? '3px solid #EF4444'
                        : isWarm
                          ? '3px solid #F59E0B'
                          : '3px solid transparent',
                      bgcolor: isHot ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                      '&:hover': { bgcolor: isHot ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.04)' },
                      transition: 'all 0.15s',
                    }}
                  >
                    {task.status === 'done' ? (
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          bgcolor: '#22C55E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <CheckIcon sx={{ fontSize: 11, color: '#fff' }} />
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: statusColors[task.status] || '#6B7280',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.title}
                      </Typography>
                      {task.due_date && (
                        <Typography
                          variant="caption"
                          sx={{
                            color:
                              differenceInDays(new Date(task.due_date), new Date()) < 0 ? '#EF4444' : '#9CA3AF',
                            fontSize: '0.7rem',
                          }}
                        >
                          Due {format(new Date(task.due_date), 'MMM dd')}
                        </Typography>
                      )}
                    </Box>
                    {/* Density badge */}
                    {isHot && (
                      <Tooltip title={`Activity Score: ${density?.score}`}>
                        <Chip
                          icon={<LocalFireDepartmentIcon sx={{ fontSize: '0.7rem !important' }} />}
                          label="Hot"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.58rem',
                            fontWeight: 700,
                            bgcolor: '#FEF2F2',
                            color: '#EF4444',
                            border: '1px solid #FECACA',
                            '& .MuiChip-icon': { color: '#EF4444', ml: 0.3 },
                            '& .MuiChip-label': { px: 0.4 },
                          }}
                        />
                      </Tooltip>
                    )}
                    <Chip
                      label={task.priority || 'medium'}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        bgcolor:
                          task.priority === 'high'
                            ? '#FEF2F2'
                            : task.priority === 'low'
                              ? '#F3F4F6'
                              : '#EFF6FF',
                        color:
                          task.priority === 'high'
                            ? '#EF4444'
                            : task.priority === 'low'
                              ? '#6B7280'
                              : '#3B82F6',
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
          );
        };

        return (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: 0.5 }}>
              <Box sx={{ color: '#2955FF', display: 'flex' }}>
                {React.cloneElement(def.icon as React.ReactElement, { sx: { fontSize: '1.1rem' } })}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', flexGrow: 1 }}>
                {def.title}
              </Typography>
              {doneCount > 0 && (
                <Tooltip title={hideDoneTasks ? `완료된 태스크 보기 (${doneCount})` : '완료된 태스크 숨기기'}>
                  <IconButton
                    size="small"
                    onClick={() => setHideDoneTasks(!hideDoneTasks)}
                    sx={{ color: hideDoneTasks ? '#9CA3AF' : '#22C55E', p: 0.5 }}
                  >
                    {hideDoneTasks ? <VisibilityOffIcon sx={{ fontSize: '0.95rem' }} /> : <VisibilityIcon sx={{ fontSize: '0.95rem' }} />}
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            {renderMyTaskList(sortedMyTasks)}
          </>
        );
      }
      case 'projects':
        return (
          <>
            <WidgetHeader def={def} />
            {(stats?.project_stats || []).length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                  No projects yet
                </Typography>
              </Box>
            ) : (
              (stats?.project_stats || []).map((p: ProjectStats) => (
                <Box
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  sx={{
                    py: 1,
                    px: 1.5,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                    transition: 'all 0.15s',
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                      {p.done}/{p.total}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={p.progress}
                    sx={{
                      height: 4,
                      borderRadius: 2,
                      bgcolor: 'rgba(0,0,0,0.08)',
                      '& .MuiLinearProgress-bar': { bgcolor: '#2955FF', borderRadius: 2 },
                    }}
                  />
                </Box>
              ))
            )}
          </>
        );
      case 'calendar': {
        const mStart = startOfMonth(calMonth);
        const mEnd = endOfMonth(calMonth);
        const mDays = eachDayOfInterval({ start: mStart, end: mEnd });
        const pad = getDay(mStart);
        const allTasks: Task[] = [
          ...(stats?.overdue || []),
          ...(stats?.upcoming || []),
          ...(stats?.my_tasks || []),
        ];
        const uniqueTasks = allTasks.filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);
        const WDAYS = ['일', '월', '화', '수', '목', '금', '토'];

        // Tasks only (no holidays) for the list
        const taskEvents: { date: Date; label: string; status: string; task: Task }[] = [];
        mDays.forEach(day => {
          uniqueTasks
            .filter(t => t.due_date && isSameDay(new Date(t.due_date), day))
            .forEach(t => {
              taskEvents.push({ date: day, label: t.title, status: t.status, task: t });
            });
        });

        // If a date is selected, filter to that date
        const displayEvents = selectedDate
          ? taskEvents.filter(ev => isSameDay(ev.date, selectedDate))
          : taskEvents;

        return (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {React.cloneElement(def.icon as React.ReactElement, {
                  sx: { fontSize: '1.1rem', color: '#2955FF' },
                })}
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {def.title}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <IconButton
                  size="small"
                  onClick={() => {
                    setCalMonth(subMonths(calMonth, 1));
                    setSelectedDate(null);
                  }}
                  sx={{ p: 0.3 }}
                >
                  <ChevronLeftIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, fontSize: '0.8rem', minWidth: 90, textAlign: 'center' }}
                >
                  {format(calMonth, 'yyyy년 M월')}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => {
                    setCalMonth(addMonths(calMonth, 1));
                    setSelectedDate(null);
                  }}
                  sx={{ p: 0.3 }}
                >
                  <ChevronRightIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
              </Box>
            </Box>
            {/* Weekday headers */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, mb: 0.5 }}>
              {WDAYS.map((d, i) => (
                <Box
                  key={i}
                  sx={{
                    textAlign: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#9CA3AF',
                    py: 0.3,
                  }}
                >
                  {d}
                </Box>
              ))}
            </Box>
            {/* Day grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {Array.from({ length: pad }).map((_, i) => (
                <Box key={`p${i}`} sx={{ height: 38 }} />
              ))}
              {mDays.map(day => {
                const dayNum = parseInt(format(day, 'd'));
                const dateKey = format(day, 'yyyy-MM-dd');
                const holiday = KOREAN_HOLIDAYS[dateKey];
                const isSun = getDay(day) === 0;
                const isSat = getDay(day) === 6;
                const isTd = isDateToday(day);
                const dayTasks = uniqueTasks.filter(
                  t => t.due_date && isSameDay(new Date(t.due_date), day)
                );
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <Tooltip
                    key={dayNum}
                    title={
                      holiday || (dayTasks.length > 0 ? dayTasks.map(t => t.title).join(', ') : '')
                    }
                    arrow
                    placement="top"
                  >
                    <Box
                      onClick={() => {
                        if (dayTasks.length > 0) {
                          setSelectedDate(prev => (prev && isSameDay(prev, day) ? null : day));
                        }
                      }}
                      sx={{
                        height: 38,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 1,
                        cursor: dayTasks.length > 0 ? 'pointer' : 'default',
                        position: 'relative',
                        bgcolor: isSelected
                          ? '#1E44CC'
                          : isTd
                            ? '#2955FF'
                            : holiday
                              ? '#FEF2F2'
                              : 'transparent',
                        '&:hover': {
                          bgcolor: isSelected
                            ? '#1E44CC'
                            : isTd
                              ? '#1E44CC'
                              : holiday
                                ? '#FEE2E2'
                                : 'rgba(0,0,0,0.04)',
                        },
                        transition: 'background 0.15s',
                        outline: isSelected ? '2px solid #2955FF' : 'none',
                        outlineOffset: -1,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.82rem',
                          fontWeight: isTd || holiday || isSelected ? 700 : 500,
                          color:
                            isSelected || isTd
                              ? '#fff'
                              : holiday || isSun
                                ? '#EF4444'
                                : isSat
                                  ? '#3B82F6'
                                  : '#374151',
                          lineHeight: 1,
                        }}
                      >
                        {dayNum}
                      </Typography>
                      {holiday && (
                        <Typography
                          sx={{
                            fontSize: '0.45rem',
                            color: isSelected || isTd ? '#fff' : '#EF4444',
                            fontWeight: 600,
                            lineHeight: 1,
                            mt: 0.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 34,
                          }}
                        >
                          {holiday}
                        </Typography>
                      )}
                      {dayTasks.length > 0 && !holiday && (
                        <Box
                          sx={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            bgcolor: isSelected || isTd ? '#fff' : '#2955FF',
                            position: 'absolute',
                            bottom: 2,
                          }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            {/* ── Task list below calendar (tasks only, no holidays) ── */}
            {displayEvents.length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                {selectedDate && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#374151' }}>
                      {format(selectedDate, 'M월 d일')} 일정
                    </Typography>
                    <Typography
                      onClick={() => setSelectedDate(null)}
                      sx={{
                        fontSize: '0.65rem',
                        color: '#2955FF',
                        cursor: 'pointer',
                        fontWeight: 600,
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      전체보기
                    </Typography>
                  </Box>
                )}
                <Box sx={{ maxHeight: 320, overflowY: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 2 } }}>
                  {displayEvents.map(
                    (ev, idx) => (
                      <Box
                        key={idx}
                        onClick={() => openDrawer(ev.task)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          py: 0.6,
                          px: 0.5,
                          borderRadius: 1,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                          transition: 'background 0.1s',
                        }}
                      >
                        <Box
                          sx={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            flexShrink: 0,
                            bgcolor: statusColors[ev.status] || '#6B7280',
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color: '#374151',
                            flexGrow: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.label}
                        </Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: '#9CA3AF', flexShrink: 0 }}>
                          {format(ev.date, 'M/d')}
                        </Typography>
                      </Box>
                    )
                  )}
                </Box>
              </>
            )}
          </>
        );
      }
      default:
        return null;
    }
  };

  // Display order = widgetOrder filtered to visible
  const displayOrder = widgetOrder.filter(id => visibleWidgets.includes(id));
  // Add any visible widgets not in order (edge case)
  visibleWidgets.forEach(id => {
    if (!displayOrder.includes(id)) displayOrder.push(id);
  });

  /* ── Intro Animation State ── */
  const [introPhase, setIntroPhase] = useState<'splash' | 'shrinking' | 'done'>(() =>
    sessionStorage.getItem('plan-a-intro-done') ? 'done' : 'splash'
  );
  const headerLottieRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (introPhase === 'splash') {
      const t1 = setTimeout(() => setIntroPhase('shrinking'), 1800);
      return () => clearTimeout(t1);
    }
    if (introPhase === 'shrinking') {
      const t2 = setTimeout(() => {
        setIntroPhase('done');
        sessionStorage.setItem('plan-a-intro-done', '1');
      }, 900);
      return () => clearTimeout(t2);
    }
  }, [introPhase]);

  return (
    <Box>
      {/* ── Intro Splash Overlay ── */}
      {introPhase !== 'done' && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#FAFBFF',
            transition: 'opacity 0.7s ease, visibility 0.7s ease',
            opacity: introPhase === 'shrinking' ? 0 : 1,
            visibility: introPhase === 'shrinking' ? 'hidden' : 'visible',
          }}
        >
          {/* Big Calendar Lottie */}
          <Box
            sx={{
              width: { xs: 200, sm: 260 },
              height: { xs: 200, sm: 260 },
              transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: introPhase === 'shrinking' ? 'scale(0.2) translateY(-40vh)' : 'scale(1)',
              opacity: introPhase === 'shrinking' ? 0 : 1,
            }}
          >
            <Lottie
              animationData={pandaAnimation}
              loop
              autoplay
              style={{ width: '100%', height: '100%' }}
            />
          </Box>
          {/* Branding text */}
          <Typography
            variant="h3"
            sx={{
              mt: 3,
              fontWeight: 900,
              color: '#1A1D29',
              letterSpacing: '-0.03em',
              transition: 'all 0.6s ease',
              opacity: introPhase === 'shrinking' ? 0 : 1,
              transform: introPhase === 'shrinking' ? 'translateY(-20px)' : 'translateY(0)',
            }}
          >
            PLAN-A
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mt: 1,
              color: '#6B7280',
              fontWeight: 500,
              letterSpacing: '0.04em',
              transition: 'all 0.5s ease 0.1s',
              opacity: introPhase === 'shrinking' ? 0 : 1,
              transform: introPhase === 'shrinking' ? 'translateY(-10px)' : 'translateY(0)',
            }}
          >
            Organize your schedule, effortlessly.
          </Typography>
        </Box>
      )}

      {/* ── Page Header with Shortcuts ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
          opacity: introPhase === 'done' ? 1 : 0,
          transform: introPhase === 'done' ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
        }}
      >
        <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Calendar Lottie Animation */}
          <Box
            ref={headerLottieRef}
            sx={{
              width: { xs: 52, sm: 60 },
              height: { xs: 52, sm: 60 },
              flexShrink: 0,
              borderRadius: '14px',
              overflow: 'hidden',
              bgcolor: 'transparent',
            }}
          >
            <Lottie
              animationData={pandaAnimation}
              loop
              autoplay
              style={{ width: '100%', height: '100%' }}
            />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8 }}>
              <Typography
                variant="h4"
                sx={{ fontWeight: 900, color: '#1A1D29', letterSpacing: '-0.03em' }}
              >
                PLAN-A
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: '#9CA3AF', fontWeight: 500, fontSize: '0.7rem', letterSpacing: '0.02em' }}
              >
                Dashboard
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.2, fontSize: '0.8rem' }}>
              {format(new Date(), 'EEEE, MMMM dd, yyyy')}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center', px: 2 }}>
          <ShortcutSection currentUserId={currentUserId} navigate={navigate} />
        </Box>
        <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 0.8 }}>
          {isAdminLike && (
            <Tooltip title="어드민">
              <IconButton
                onClick={() => navigate('/admin')}
                sx={{ bgcolor: '#F3F4F6', color: '#6B7280', '&:hover': { bgcolor: '#E5E7EB', color: '#374151' } }}
                size="small"
              >
                <AdminPanelSettingsIcon sx={{ fontSize: '1.2rem' }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Trash">
            <IconButton
              onClick={() => navigate('/trash')}
              sx={{ bgcolor: '#F3F4F6', color: '#6B7280', '&:hover': { bgcolor: '#FEE2E2', color: '#EF4444' } }}
              size="small"
            >
              <DeleteOutlineIcon sx={{ fontSize: '1.2rem' }} />
            </IconButton>
          </Tooltip>
          {Object.keys(widgetHeights).length > 0 && (
            <Tooltip title="위젯 높이 초기화">
              <IconButton
                onClick={resetWidgetHeights}
                size="small"
                sx={{ bgcolor: '#F3F4F6', color: '#6B7280', '&:hover': { bgcolor: '#E5E7EB', color: '#374151' } }}
              >
                <RestartAltIcon sx={{ fontSize: '1.2rem' }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Widget Settings">
            <IconButton
              onClick={() => setPaletteOpen(true)}
              sx={{ bgcolor: '#EEF2FF', color: '#2955FF', '&:hover': { bgcolor: '#C7D2FE' } }}
            >
              <WidgetsIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Zero State or Active Dashboard ── */}
      {!statsLoading && !hasProjects ? (
        <Box
          sx={{
            opacity: introPhase === 'done' ? 1 : 0,
            transform: introPhase === 'done' ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.6s ease 0.25s, transform 0.6s ease 0.25s',
          }}
        >
          <ZeroStateDashboard currentUserId={currentUserId} />
        </Box>
      ) : (
        /* ── Sortable Widget Grid ── */
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayOrder} strategy={rectSortingStrategy}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 2,
                opacity: introPhase === 'done' ? 1 : 0,
                transform: introPhase === 'done' ? 'translateY(0)' : 'translateY(16px)',
                transition: 'opacity 0.6s ease 0.25s, transform 0.6s ease 0.25s',
              }}
            >
              {displayOrder.map(wId => (
                <SortableWidget key={wId} id={wId} height={getWidgetHeight(wId)} onHeightChange={handleWidgetHeightChange}>
                  {renderWidget(wId)}
                </SortableWidget>
              ))}
            </Box>
          </SortableContext>
        </DndContext>
      )}

      {/* ── Widget Palette Drawer ── */}
      <Drawer
        anchor="right"
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        PaperProps={{ sx: { width: 320, p: 3 } }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          Widgets
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280', mb: 2, fontSize: '0.8rem' }}>
          Toggle widgets to show or hide on the dashboard
        </Typography>
        <Button
          startIcon={<RestartAltIcon />}
          onClick={resetToDefault}
          size="small"
          sx={{ mb: 2, color: '#6B7280', textTransform: 'none', fontWeight: 600 }}
        >
          Reset to Default
        </Button>
        <Divider sx={{ mb: 2 }} />
        <List disablePadding>
          {ALL_WIDGETS.map(w => (
            <ListItemButton
              key={w.id}
              onClick={() => toggleWidget(w.id)}
              sx={{ borderRadius: 2, mb: 0.5, px: 1.5 }}
            >
              <ListItemIcon
                sx={{ minWidth: 36, color: visibleWidgets.includes(w.id) ? '#2955FF' : '#D1D5DB' }}
              >
                {w.icon}
              </ListItemIcon>
              <ListItemText
                primary={w.title}
                primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
              />
              <Switch
                checked={visibleWidgets.includes(w.id)}
                size="small"
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#2955FF' } }}
              />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </Box>
  );
};

// ── Shared shortcut icon renderer ──
const ShortcutIcon: React.FC<{ sc: { name: string; url: string; icon_text?: string | null; icon_color?: string | null; open_new_tab?: boolean } }> = ({ sc }) => (
  <Tooltip title={sc.url}>
    <Box
      onClick={() => {
        if (sc.open_new_tab !== false) window.open(sc.url, '_blank');
        else window.location.href = sc.url;
      }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.8,
        cursor: 'pointer',
        width: 72,
        '&:hover .shortcut-icon': { transform: 'scale(1.08)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' },
        transition: 'all 0.15s',
      }}
    >
      <Box
        className="shortcut-icon"
        sx={{
          width: 48,
          height: 48,
          borderRadius: 2.5,
          bgcolor: sc.icon_color || '#2955FF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 800,
          fontSize: '1.2rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease',
        }}
      >
        {sc.icon_text || sc.name.charAt(0).toUpperCase()}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.65rem',
          fontWeight: 500,
          color: '#4B5563',
          textAlign: 'center',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          maxWidth: 72,
        }}
      >
        {sc.name}
      </Typography>
    </Box>
  </Tooltip>
);

// ── Shortcut Section Component ──
const ShortcutSection: React.FC<{
  currentUserId: number;
  navigate: ReturnType<typeof useNavigate>;
}> = ({ currentUserId }) => {
  const queryClient = useQueryClient();

  // 프리셋 (관리자가 등록한 공용 바로가기)
  const { data: presets = [] } = useQuery<Shortcut[]>({
    queryKey: ['shortcuts'],
    queryFn: api.getShortcuts,
  });
  // 내 바로가기 (사용자별 DB)
  const { data: userShortcuts = [] } = useQuery<UserShortcut[]>({
    queryKey: ['userShortcuts', currentUserId],
    queryFn: () => api.getUserShortcuts(currentUserId),
    enabled: currentUserId > 0,
  });

  const activePresets = presets
    .filter(s => s.active !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<'preset' | 'custom'>('preset');
  const [scName, setScName] = useState('');
  const [scUrl, setScUrl] = useState('');
  const [scIconText, setScIconText] = useState('');
  const [scIconColor, setScIconColor] = useState('#2955FF');
  const [scOpenNewTab, setScOpenNewTab] = useState(true);

  const createUserScMut = useMutation({
    mutationFn: (data: { name: string; url: string; icon_text?: string; icon_color?: string; open_new_tab?: boolean; order?: number }) =>
      api.createUserShortcut(currentUserId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userShortcuts', currentUserId] });
      setDialogOpen(false);
      setScName(''); setScUrl(''); setScIconText(''); setScIconColor('#2955FF'); setScOpenNewTab(true);
    },
  });

  const deleteUserScMut = useMutation({
    mutationFn: (id: number) => api.deleteUserShortcut(id, currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userShortcuts', currentUserId] }),
  });

  const handleSaveCustom = () => {
    if (!scName.trim() || !scUrl.trim()) return;
    createUserScMut.mutate({
      name: scName.trim(),
      url: scUrl.trim(),
      icon_text: scIconText.trim() || undefined,
      icon_color: scIconColor,
      open_new_tab: scOpenNewTab,
      order: userShortcuts.length,
    });
  };

  const handleAddPreset = (preset: Shortcut) => {
    createUserScMut.mutate({
      name: preset.name,
      url: preset.url,
      icon_text: preset.icon_text || undefined,
      icon_color: preset.icon_color || '#2955FF',
      open_new_tab: preset.open_new_tab !== false,
      order: userShortcuts.length,
    });
  };

  // 이미 추가된 프리셋 URL 체크
  const addedUrls = new Set(userShortcuts.map(s => s.url));

  if (userShortcuts.length === 0 && currentUserId <= 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
      {/* 내 바로가기만 표시 */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        {userShortcuts.map(sc => (
          <Box key={sc.id} sx={{ position: 'relative', '&:hover .del-btn': { opacity: 1 } }}>
            <ShortcutIcon sc={sc} />
            <IconButton
              className="del-btn"
              size="small"
              onClick={e => { e.stopPropagation(); deleteUserScMut.mutate(sc.id); }}
              sx={{
                position: 'absolute', top: -6, right: -6, opacity: 0,
                transition: 'opacity 0.15s', bgcolor: '#FEE2E2', color: '#EF4444',
                width: 18, height: 18,
                '&:hover': { bgcolor: '#EF4444', color: '#fff' },
              }}
            >
              <DeleteIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        {/* "+" 버튼 */}
        <Tooltip title="바로가기 추가">
          <Box
            onClick={() => { setDialogTab(activePresets.length > 0 ? 'preset' : 'custom'); setDialogOpen(true); }}
            sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.8,
              cursor: 'pointer', width: 72,
              '&:hover .my-add-icon': { transform: 'scale(1.08)', borderColor: '#22C55E' },
            }}
          >
            <Box
              className="my-add-icon"
              sx={{
                width: 48, height: 48, borderRadius: 2.5,
                border: '2px dashed #86EFAC',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#22C55E', fontSize: '1.5rem', transition: 'all 0.2s ease',
              }}
            >
              +
            </Box>
            <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 500, color: '#22C55E' }}>
              추가
            </Typography>
          </Box>
        </Tooltip>
      </Box>

      {/* 바로가기 추가 다이얼로그 */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0 }}>바로가기 추가</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {/* 탭 전환 */}
          {activePresets.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, mt: 1 }}>
              <Chip
                label="프리셋"
                size="small"
                onClick={() => setDialogTab('preset')}
                sx={{
                  fontWeight: dialogTab === 'preset' ? 700 : 400,
                  bgcolor: dialogTab === 'preset' ? '#2955FF' : '#F3F4F6',
                  color: dialogTab === 'preset' ? '#fff' : '#6B7280',
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                }}
              />
              <Chip
                label="직접 추가"
                size="small"
                onClick={() => setDialogTab('custom')}
                sx={{
                  fontWeight: dialogTab === 'custom' ? 700 : 400,
                  bgcolor: dialogTab === 'custom' ? '#2955FF' : '#F3F4F6',
                  color: dialogTab === 'custom' ? '#fff' : '#6B7280',
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.85 },
                }}
              />
            </Box>
          )}

          {/* 프리셋 탭 */}
          {dialogTab === 'preset' && activePresets.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {activePresets.map(preset => {
                const alreadyAdded = addedUrls.has(preset.url);
                return (
                  <Box
                    key={preset.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      px: 1.5, py: 1, borderRadius: 1.5,
                      border: '1px solid #E5E7EB',
                      cursor: alreadyAdded ? 'default' : 'pointer',
                      opacity: alreadyAdded ? 0.5 : 1,
                      '&:hover': alreadyAdded ? {} : { bgcolor: '#F9FAFB', borderColor: '#2955FF' },
                    }}
                    onClick={() => { if (!alreadyAdded) handleAddPreset(preset); }}
                  >
                    <Box sx={{
                      width: 36, height: 36, borderRadius: 2,
                      bgcolor: preset.icon_color || '#2955FF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0,
                    }}>
                      {preset.icon_text || preset.name.charAt(0).toUpperCase()}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{preset.name}</Typography>
                      <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preset.url}</Typography>
                    </Box>
                    {alreadyAdded ? (
                      <Chip label="추가됨" size="small" sx={{ fontSize: '0.65rem', bgcolor: '#DCFCE7', color: '#22C55E' }} />
                    ) : (
                      <AddIcon sx={{ color: '#2955FF', fontSize: 20 }} />
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* 직접 추가 탭 */}
          {dialogTab === 'custom' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField label="이름" value={scName} onChange={e => setScName(e.target.value)} size="small" required fullWidth />
              <TextField label="URL (https://...)" value={scUrl} onChange={e => setScUrl(e.target.value)} size="small" required fullWidth />
              <TextField label="아이콘 텍스트 (선택)" value={scIconText} onChange={e => setScIconText(e.target.value)} size="small" fullWidth placeholder="예: G, 사내" />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>색상:</Typography>
                <input type="color" value={scIconColor} onChange={e => setScIconColor(e.target.value)} style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4 }} />
              </Box>
              <FormControlLabel
                control={<Switch checked={scOpenNewTab} onChange={e => setScOpenNewTab(e.target.checked)} size="small" />}
                label={<Typography variant="body2" sx={{ fontSize: '0.85rem' }}>새 탭에서 열기</Typography>}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>닫기</Button>
          {dialogTab === 'custom' && (
            <Button
              variant="contained"
              onClick={handleSaveCustom}
              disabled={!scName.trim() || !scUrl.trim() || createUserScMut.isPending}
              sx={{ textTransform: 'none' }}
            >
              추가
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HomePage;
