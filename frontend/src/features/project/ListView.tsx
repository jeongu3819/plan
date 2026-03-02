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
} from '@mui/material';

import { api } from '../../api/client';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import { Task, SubProject } from '../../types';
import QuickAdd from '../../components/QuickAdd';
import EditIcon from '@mui/icons-material/Edit';
import FlagIcon from '@mui/icons-material/Flag';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface ListViewProps {
  projectId: number;
}

const statusConfig: Record<string, { label: string; color: string; bgcolor: string }> = {
  todo: { label: 'To Do', color: '#6B7280', bgcolor: '#F3F4F6' },
  in_progress: { label: 'In Progress', color: '#2955FF', bgcolor: '#EEF2FF' },
  done: { label: 'Done', color: '#22C55E', bgcolor: '#F0FDF4' },
  hold: { label: 'Hold', color: '#F59E0B', bgcolor: '#FFFBEB' },
};

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

const ListView: React.FC<ListViewProps> = ({ projectId }) => {
  const openDrawer = useAppStore(state => state.openDrawer);
  const currentUserId = useAppStore(state => state.currentUserId);
  const [sortField, setSortField] = useState<SortField>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [collapsedSubs, setCollapsedSubs] = useState<Set<number>>(new Set());

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks', projectId, currentUserId],
    queryFn: () => api.getTasks(projectId, currentUserId),
  });

  const { data: subProjects = [] } = useQuery<SubProject[]>({
    queryKey: ['subprojects', projectId],
    queryFn: () => api.getSubProjects(projectId),
  });

  const toggleSubCollapse = useCallback((subId: number) => {
    setCollapsedSubs(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  }, []);

  const sortTasks = useCallback(
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

  // Group tasks by subproject
  const groupedTasks = useMemo(() => {
    const allTasks = tasks || [];
    const rootTasks = allTasks.filter(t => !t.sub_project_id);
    const subGroups = subProjects.map(sp => ({
      subProject: sp,
      tasks: allTasks.filter(t => t.sub_project_id === sp.id),
    }));
    return { rootTasks, subGroups };
  }, [tasks, subProjects]);

  const hasSubProjects = subProjects.length > 0;

  if (isLoading) return <Typography>Loading...</Typography>;

  const renderTaskRow = (task: Task, indent: boolean = false) => {
    const status = statusConfig[task.status] || statusConfig.todo;
    const priority = task.priority ? priorityConfig[task.priority] : null;
    return (
      <TableRow
        key={task.id}
        hover
        onClick={() => openDrawer(task, projectId)}
        sx={{
          cursor: 'pointer',
          '&:hover': { bgcolor: '#F8F9FF' },
          '& td': { py: 1.5, borderColor: '#F3F4F6' },
        }}
      >
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pl: indent ? 3 : 0 }}>
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
          </Box>
        </TableCell>
        <TableCell>
          <Chip
            label={status.label}
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

  const sortedRootTasks = sortTasks(groupedTasks.rootTasks);

  return (
    <Box>
      <QuickAdd projectId={projectId} />
      {/* Sort Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, mb: 1 }}>
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
        sx={{ border: '1px solid #E5E7EB', borderRadius: 2 }}
      >
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#FAFBFC' }}>
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
            {/* Root tasks (no subproject) */}
            {sortedRootTasks.map(task => renderTaskRow(task, false))}

            {/* Subproject groups */}
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
                        bgcolor: '#F8F5FF',
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
    </Box>
  );
};

export default ListView;
