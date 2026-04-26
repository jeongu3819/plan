import React, { useState, useCallback, useMemo } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  Chip,
  IconButton,
  TextField,
  MenuItem,
  Tooltip,
  TableSortLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';

import { api } from '../../api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import { Task, SubProject } from '../../types';
import { getStatusDisplay } from '../../utils/taskStatus';
import QuickAdd from '../../components/QuickAdd';
import EditIcon from '@mui/icons-material/Edit';
import FlagIcon from '@mui/icons-material/Flag';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';

// dnd-kit imports
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ListViewProps {
  projectId: number;
}

// statusConfig lives in utils/taskStatus.ts (getStatusDisplay) so the
// `in_progress` vs `in_progress ≥50%` distinction is rendered consistently.

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: '#6B7280' },
  medium: { label: 'Medium', color: '#3B82F6' },
  high: { label: 'High', color: '#EF4444' },
};

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

// B-1: SortableTaskRow component
const SortableTaskRow: React.FC<{
  task: Task;
  indent: boolean;
  projectId: number;
  openDrawer: (task: Task | null, projectId: number) => void;
  isDragMode: boolean;
}> = ({ task, indent, projectId, openDrawer, isDragMode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(task.id),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const status = getStatusDisplay(task);
  const priority = task.priority ? priorityConfig[task.priority] : null;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      hover
      onClick={() => openDrawer(task, projectId)}
      sx={{
        cursor: 'pointer',
        '&:hover': { bgcolor: 'rgba(41,85,255,0.04)' },
        '& td': { py: 1.5, borderColor: 'rgba(0,0,0,0.06)' },
      }}
    >
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pl: indent ? 3 : 0 }}>
          {isDragMode && (
            <Box
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: '#9CA3AF', '&:hover': { color: '#6B7280' } }}
            >
              <DragIndicatorIcon sx={{ fontSize: 18 }} />
            </Box>
          )}
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: status.color,
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
            {task.title}
          </Typography>
          {(task as any).attachment_count > 0 && (
            <AttachFileIcon sx={{ fontSize: '0.8rem', color: '#9CA3AF', ml: 0.5, flexShrink: 0 }} />
          )}
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          label={status.sublabel ? `${status.label} · ${status.sublabel}` : status.label}
          size="small"
          sx={{
            height: 24,
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: status.bgcolor,
            color: status.color,
            border: 'none',
          }}
        />
      </TableCell>
      <TableCell>
        {priority && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: priority.color }}>
            <FlagIcon sx={{ fontSize: '0.85rem' }} />
            <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
              {priority.label}
            </Typography>
          </Box>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
          {task.due_date || '-'}
        </Typography>
      </TableCell>
      <TableCell>
        <IconButton size="small" sx={{ color: '#9CA3AF' }}>
          <EditIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

// Sortable SubProject header row
const SortableSubProjectRow: React.FC<{
  subProject: SubProject;
  taskCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onEdit: (subProject: SubProject) => void;
}> = ({ subProject, taskCount, isCollapsed, onToggle, onEdit }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sp-${subProject.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      onClick={onToggle}
      sx={{
        cursor: 'pointer',
        bgcolor: 'rgba(139,92,246,0.08)',
        '&:hover': { bgcolor: '#F0EBFF' },
        '& td': { py: 1.2, borderColor: '#E5E7EB' },
      }}
    >
      <TableCell colSpan={5}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: '#B0A4D0', '&:hover': { color: '#8B5CF6' } }}
          >
            <DragIndicatorIcon sx={{ fontSize: 18 }} />
          </Box>
          <IconButton size="small" sx={{ p: 0.3 }}>
            {isCollapsed ? (
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            ) : (
              <ExpandLessIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
          <FolderSpecialIcon sx={{ fontSize: 18, color: '#8B5CF6' }} />
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#5B21B6' }}
          >
            {subProject.name}
          </Typography>
          <Chip
            label={`${taskCount} task${taskCount !== 1 ? 's' : ''}`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              bgcolor: '#EDE9FE',
              color: '#7C3AED',
            }}
          />
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onEdit(subProject); }}
            sx={{ ml: 'auto', color: '#8B5CF6', '&:hover': { bgcolor: '#EDE9FE' } }}
          >
            <EditIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </TableCell>
    </TableRow>
  );
};

const ListView: React.FC<ListViewProps> = ({ projectId }) => {
  const openDrawer = useAppStore(state => state.openDrawer);
  const currentUserId = useAppStore(state => state.currentUserId);
  const filterSearch = useAppStore(state => state.filterSearch);
  const queryClient = useQueryClient();
  const [sortField, setSortField] = useState<SortField>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [collapsedSubs, setCollapsedSubs] = useState<Set<number>>(new Set());
  const [hideDone, setHideDone] = useState(false);

  // SubProject edit state
  const [editingSub, setEditingSub] = useState<SubProject | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubDesc, setEditSubDesc] = useState('');

  const updateSubMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SubProject> }) =>
      api.updateSubProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subprojects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['graphData', projectId] });
      setEditingSub(null);
    },
  });

  const handleEditSub = (sub: SubProject) => {
    setEditingSub(sub);
    setEditSubName(sub.name);
    setEditSubDesc(sub.description || '');
  };

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', projectId, currentUserId],
    queryFn: () => api.getTasks(projectId, currentUserId),
  });

  const { data: subProjects = [] } = useQuery<SubProject[]>({
    queryKey: ['subprojects', projectId],
    queryFn: () => api.getSubProjects(projectId),
  });

  // Load all orders at once (root tasks, sp order, sp task orders)
  const { data: allOrders } = useQuery({
    queryKey: ['allListOrders', projectId],
    queryFn: () => api.getAllListOrders(projectId),
  });

  const saveOrderMutation = useMutation({
    mutationFn: (order: number[]) => api.saveListOrder(projectId, order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allListOrders', projectId] });
    },
  });

  const saveSpOrderMutation = useMutation({
    mutationFn: (order: number[]) => api.saveSubProjectOrder(projectId, order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allListOrders', projectId] });
    },
  });

  const saveSpTaskOrderMutation = useMutation({
    mutationFn: ({ subId, order }: { subId: number; order: number[] }) =>
      api.saveSpTaskOrder(subId, order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allListOrders', projectId] });
    },
  });

  // B-1: dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const toggleSubCollapse = useCallback((subId: number) => {
    setCollapsedSubs(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  }, []);

  // Sort tasks with optional orderKey for subproject-specific ordering
  const sortTasksWithKey = useCallback(
    (taskList: Task[], orderKey?: string): Task[] => {
      if (sortField === 'default') {
        const key = orderKey || 'root';
        const savedOrder = allOrders?.[key];
        if (savedOrder && savedOrder.length > 0) {
          const orderMap = new Map<number, number>();
          savedOrder.forEach((id: number, idx: number) => orderMap.set(id, idx));
          return [...taskList].sort((a, b) => {
            const aIdx = orderMap.get(a.id) ?? 99999;
            const bIdx = orderMap.get(b.id) ?? 99999;
            return aIdx - bIdx;
          });
        }
        return taskList;
      }
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
    [sortField, sortDirection, allOrders]
  );

  const sortTasks = useCallback(
    (taskList: Task[]): Task[] => sortTasksWithKey(taskList),
    [sortTasksWithKey]
  );

  const handleHeaderSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  // Group tasks by subproject (with saved order)
  const groupedTasks = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    let allTasks = (tasks || []).filter(t => !q || t.title.toLowerCase().includes(q));
    if (hideDone) {
      allTasks = allTasks.filter(t => t.status !== 'done');
    }
    const rootTasks = allTasks.filter(t => !t.sub_project_id);

    // Apply saved subproject order
    let orderedSps = [...subProjects];
    const spOrder = allOrders?.sp_order;
    if (spOrder && spOrder.length > 0) {
      const orderMap = new Map<number, number>();
      spOrder.forEach((id: number, idx: number) => orderMap.set(id, idx));
      orderedSps.sort((a, b) => {
        const aIdx = orderMap.get(a.id) ?? 99999;
        const bIdx = orderMap.get(b.id) ?? 99999;
        return aIdx - bIdx;
      });
    }

    const subGroups = orderedSps
      .map(sp => ({
        subProject: sp,
        tasks: allTasks.filter(t => t.sub_project_id === sp.id),
      }))
      .filter(g => !hideDone || g.tasks.length > 0);
    return { rootTasks, subGroups };
  }, [tasks, subProjects, allOrders, filterSearch, hideDone]);

  const hasSubProjects = subProjects.length > 0;

  const sortedRootTasks = sortTasks(groupedTasks.rootTasks);
  const isDragMode = sortField === 'default';

  // Handle drag end for task, subproject, and sp-task reorder
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // SubProject reorder
      if (activeId.startsWith('sp-') && overId.startsWith('sp-')) {
        const subs = groupedTasks.subGroups.map(g => g.subProject);
        const oldIndex = subs.findIndex(sp => `sp-${sp.id}` === activeId);
        const newIndex = subs.findIndex(sp => `sp-${sp.id}` === overId);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(subs, oldIndex, newIndex);
        saveSpOrderMutation.mutate(reordered.map(sp => sp.id));
        return;
      }

      // Check if both are in the same subproject
      for (const { subProject, tasks: spTasks } of groupedTasks.subGroups) {
        const spTaskList = sortTasksWithKey(spTasks, `sptask_${subProject.id}`);
        const oldIdx = spTaskList.findIndex(t => String(t.id) === activeId);
        const newIdx = spTaskList.findIndex(t => String(t.id) === overId);
        if (oldIdx !== -1 && newIdx !== -1) {
          const reordered = arrayMove(spTaskList, oldIdx, newIdx);
          saveSpTaskOrderMutation.mutate({
            subId: subProject.id,
            order: reordered.map(t => t.id),
          });
          return;
        }
      }

      // Root task reorder
      const oldIndex = sortedRootTasks.findIndex(t => String(t.id) === activeId);
      const newIndex = sortedRootTasks.findIndex(t => String(t.id) === overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(sortedRootTasks, oldIndex, newIndex);
      saveOrderMutation.mutate(reordered.map(t => t.id));
    },
    [sortedRootTasks, saveOrderMutation, groupedTasks.subGroups, saveSpOrderMutation, saveSpTaskOrderMutation, sortTasksWithKey]
  );

  if (isLoading) return <Typography>Loading...</Typography>;

  const renderTaskRow = (task: Task, indent: boolean = false) => {
    const status = getStatusDisplay(task);
    const priority = task.priority ? priorityConfig[task.priority] : null;
    return (
      <TableRow
        key={task.id}
        hover
        onClick={() => openDrawer(task, projectId)}
        sx={{
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(41,85,255,0.04)' },
          '& td': { py: 1.5, borderColor: 'rgba(0,0,0,0.06)' },
        }}
      >
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pl: indent ? 3 : 0 }}>
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: status.color,
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
              {task.title}
            </Typography>
            {(task as any).attachment_count > 0 && (
              <AttachFileIcon sx={{ fontSize: '0.8rem', color: '#9CA3AF', ml: 0.5, flexShrink: 0 }} />
            )}
          </Box>
        </TableCell>
        <TableCell>
          <Chip
            label={status.sublabel ? `${status.label} · ${status.sublabel}` : status.label}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.7rem',
              fontWeight: 600,
              bgcolor: status.bgcolor,
              color: status.color,
              border: 'none',
            }}
          />
        </TableCell>
        <TableCell>
          {priority && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: priority.color }}>
              <FlagIcon sx={{ fontSize: '0.85rem' }} />
              <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                {priority.label}
              </Typography>
            </Box>
          )}
        </TableCell>
        <TableCell>
          <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
            {task.due_date || '-'}
          </Typography>
        </TableCell>
        <TableCell>
          <IconButton size="small" sx={{ color: '#9CA3AF' }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box>
      <QuickAdd projectId={projectId} />
      {/* Sort Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, mb: 1 }}>
        <Tooltip title={hideDone ? '완료된 항목 보기' : '완료된 항목 숨기기'}>
          <IconButton
            size="small"
            onClick={() => setHideDone(!hideDone)}
            sx={{ color: hideDone ? '#9CA3AF' : '#22C55E', p: 0.5 }}
          >
            {hideDone ? <VisibilityOffIcon sx={{ fontSize: '1.1rem' }} /> : <VisibilityIcon sx={{ fontSize: '1.1rem' }} />}
          </IconButton>
        </Tooltip>
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
      </Box>
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
              <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5 }}>
                <TableSortLabel
                  active={sortField === 'title'}
                  direction={sortField === 'title' ? sortDirection : 'asc'}
                  onClick={() => handleHeaderSort('title')}
                >
                  Title
                </TableSortLabel>
              </TableCell>
              <TableCell
                sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 120 }}
              >
                Status
              </TableCell>
              <TableCell
                sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 100 }}
              >
                <TableSortLabel
                  active={sortField === 'priority'}
                  direction={sortField === 'priority' ? sortDirection : 'asc'}
                  onClick={() => handleHeaderSort('priority')}
                >
                  Priority
                </TableSortLabel>
              </TableCell>
              <TableCell
                sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 120 }}
              >
                <TableSortLabel
                  active={sortField === 'due_date'}
                  direction={sortField === 'due_date' ? sortDirection : 'asc'}
                  onClick={() => handleHeaderSort('due_date')}
                >
                  Due Date
                </TableSortLabel>
              </TableCell>
              <TableCell
                sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 60 }}
              ></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isDragMode ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {/* Root tasks sortable */}
                <SortableContext
                  items={sortedRootTasks.map(t => String(t.id))}
                  strategy={verticalListSortingStrategy}
                >
                  {sortedRootTasks.map(task => (
                    <SortableTaskRow
                      key={task.id}
                      task={task}
                      indent={false}
                      projectId={projectId}
                      openDrawer={openDrawer}
                      isDragMode={isDragMode}
                    />
                  ))}
                </SortableContext>

                {/* Subproject groups sortable */}
                {hasSubProjects && (
                  <SortableContext
                    items={groupedTasks.subGroups.map(g => `sp-${g.subProject.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {groupedTasks.subGroups.map(({ subProject, tasks: spTasks }) => {
                      const isCollapsed = collapsedSubs.has(subProject.id);
                      const sortedSpTasks = sortTasksWithKey(spTasks, `sptask_${subProject.id}`);
                      return (
                        <React.Fragment key={`sp-${subProject.id}`}>
                          <SortableSubProjectRow
                            subProject={subProject}
                            taskCount={spTasks.length}
                            isCollapsed={isCollapsed}
                            onToggle={() => toggleSubCollapse(subProject.id)}
                            onEdit={handleEditSub}
                          />
                          {!isCollapsed && (
                            <SortableContext
                              items={sortedSpTasks.map(t => String(t.id))}
                              strategy={verticalListSortingStrategy}
                            >
                              {sortedSpTasks.map(task => (
                                <SortableTaskRow
                                  key={task.id}
                                  task={task}
                                  indent={true}
                                  projectId={projectId}
                                  openDrawer={openDrawer}
                                  isDragMode={true}
                                />
                              ))}
                            </SortableContext>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </SortableContext>
                )}
              </DndContext>
            ) : (
              <>
                {sortedRootTasks.map(task => renderTaskRow(task, false))}
                {hasSubProjects &&
                  groupedTasks.subGroups.map(({ subProject, tasks: spTasks }) => {
                    const isCollapsed = collapsedSubs.has(subProject.id);
                    const sortedSpTasks = sortTasks(spTasks);
                    return (
                      <React.Fragment key={`sp-${subProject.id}`}>
                        <TableRow
                          onClick={() => toggleSubCollapse(subProject.id)}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: 'rgba(139,92,246,0.08)',
                            '&:hover': { bgcolor: '#F0EBFF' },
                            '& td': { py: 1.2, borderColor: '#E5E7EB' },
                          }}
                        >
                          <TableCell colSpan={5}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <IconButton size="small" sx={{ p: 0.3 }}>
                                {isCollapsed ? (
                                  <ExpandMoreIcon sx={{ fontSize: 18 }} />
                                ) : (
                                  <ExpandLessIcon sx={{ fontSize: 18 }} />
                                )}
                              </IconButton>
                              <FolderSpecialIcon sx={{ fontSize: 18, color: '#8B5CF6' }} />
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#5B21B6' }}
                              >
                                {subProject.name}
                              </Typography>
                              <Chip
                                label={`${spTasks.length} task${spTasks.length !== 1 ? 's' : ''}`}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  bgcolor: '#EDE9FE',
                                  color: '#7C3AED',
                                }}
                              />
                            </Box>
                          </TableCell>
                        </TableRow>
                        {!isCollapsed && sortedSpTasks.map(task => renderTaskRow(task, true))}
                      </React.Fragment>
                    );
                  })}
              </>
            )}

            {(!tasks || tasks.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 1 }}>
                      No tasks yet
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#D1D5DB' }}>
                      Add your first task using the input above
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* SubProject edit dialog */}
      <Dialog open={!!editingSub} onClose={() => setEditingSub(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>서브프로젝트 편집</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="이름"
            value={editSubName}
            onChange={e => setEditSubName(e.target.value)}
            size="small"
            required
            fullWidth
          />
          <TextField
            label="설명 (선택)"
            value={editSubDesc}
            onChange={e => setEditSubDesc(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditingSub(null)} sx={{ textTransform: 'none' }}>취소</Button>
          <Button
            variant="contained"
            disabled={!editSubName.trim() || updateSubMut.isPending}
            onClick={() => {
              if (editingSub && editSubName.trim()) {
                updateSubMut.mutate({ id: editingSub.id, data: { name: editSubName.trim(), description: editSubDesc.trim() || undefined } });
              }
            }}
            sx={{ textTransform: 'none' }}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ListView;
