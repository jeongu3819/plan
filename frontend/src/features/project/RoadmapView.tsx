import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  IconButton,
  Collapse,
  LinearProgress,
  Tooltip,
  TextField,
  MenuItem,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TodayIcon from '@mui/icons-material/Today';
import FilterListIcon from '@mui/icons-material/FilterList';
import FolderIcon from '@mui/icons-material/Folder';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { RoadmapItem } from '../../types';
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
import {
  format,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfYear,
  endOfYear,
  getWeek,
  startOfQuarter,
  endOfQuarter,
  subMonths,
  addMonths,
} from 'date-fns';

interface RoadmapViewProps {
  projectId: number;
}

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

type ViewMode = 'month' | 'week' | 'quarter';

const SortableRoadmapRow: React.FC<{
  id: string;
  children: (handleListeners: Record<string, any>) => React.ReactNode;
}> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ? transition.replace(/(\d+)ms/g, '150ms') : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
};

const RoadmapView: React.FC<RoadmapViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const currentMarkerRef = useRef<HTMLDivElement>(null);
  const [nameColumnWidth, setNameColumnWidth] = useState(430);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [hideDone, setHideDone] = useState(false);

  const deleteSubProjectMutation = useMutation({
    mutationFn: (subId: number) => api.deleteSubProject(subId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roadmap', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
      setDeleteTarget(null);
    },
  });

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = nameColumnWidth;
      const onMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.min(600, Math.max(200, startWidth + (ev.clientX - startX)));
        setNameColumnWidth(newWidth);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [nameColumnWidth]
  );

  // ── Drag reorder state ──
  const [localItems, setLocalItems] = useState<RoadmapItem[]>([]);
  const localDragRef = useRef(false); // true while a drag-save is in flight

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { data: roadmapData, isLoading } = useQuery({
    queryKey: ['roadmap', projectId, viewMode],
    queryFn: () => api.getRoadmap({ project_id: projectId, view: viewMode }),
  });

  // Sync local items when API data changes — skip if we just did a local drag
  useEffect(() => {
    if (localDragRef.current) return;
    setLocalItems(roadmapData?.items || []);
  }, [roadmapData]);

  const findSiblings = useCallback((items: RoadmapItem[], id: string): RoadmapItem[] | null => {
    for (const item of items) {
      if (item.id === id) return items;
      if (item.children) {
        const found = findSiblings(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const reorderInTree = useCallback(
    (items: RoadmapItem[], activeId: string, overId: string): RoadmapItem[] | null => {
      const activeIdx = items.findIndex(i => i.id === activeId);
      const overIdx = items.findIndex(i => i.id === overId);
      if (activeIdx !== -1 && overIdx !== -1) {
        return arrayMove(items, activeIdx, overIdx);
      }
      for (let i = 0; i < items.length; i++) {
        if (items[i].children) {
          const result = reorderInTree(items[i].children!, activeId, overId);
          if (result) {
            const newItems = [...items];
            newItems[i] = { ...newItems[i], children: result };
            return newItems;
          }
        }
      }
      return null;
    },
    []
  );

  const saveOrderMutation = useMutation({
    mutationFn: ({ order, parentKey }: { order: string[]; parentKey?: string }) =>
      api.saveRoadmapOrder(projectId, order, parentKey),
    onSettled: () => {
      // After save completes (success or error), allow future server syncs
      localDragRef.current = false;
    },
  });

  // Find the parent item that contains the given id
  const findParent = useCallback(
    (items: RoadmapItem[], id: string, parent?: RoadmapItem): RoadmapItem | null => {
      for (const item of items) {
        if (item.id === id) return parent || null;
        if (item.children) {
          const found = findParent(item.children, id, item);
          if (found !== undefined && found !== null) return found;
          if (item.children.some(c => c.id === id)) return item;
        }
      }
      return null;
    },
    []
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      // Only reorder if in same sibling group
      const activeSiblings = findSiblings(localItems, activeId);
      const overSiblings = findSiblings(localItems, overId);
      if (!activeSiblings || !overSiblings || activeSiblings !== overSiblings) return;

      const result = reorderInTree(localItems, activeId, overId);
      if (result) {
        // 1. Instant local update
        localDragRef.current = true;
        setLocalItems(result);

        // 2. Optimistically update query cache so future reads see the new order
        queryClient.setQueryData(['roadmap', projectId, viewMode], (old: any) => {
          if (!old) return old;
          return { ...old, items: result };
        });

        // 3. Persist to server in background
        const parentItem = findParent(result, activeId);
        if (parentItem && parentItem.children) {
          const order = parentItem.children.map(c => c.id);
          if (parentItem.type === 'project') {
            saveOrderMutation.mutate({ order });
          } else {
            saveOrderMutation.mutate({ order, parentKey: parentItem.id });
          }
        } else {
          const projectItem = result[0];
          if (projectItem?.children) {
            const order = projectItem.children.map(c => c.id);
            saveOrderMutation.mutate({ order });
          }
        }
      }
    },
    [
      localItems,
      findSiblings,
      reorderInTree,
      findParent,
      saveOrderMutation,
      queryClient,
      projectId,
      viewMode,
    ]
  );

  const today = new Date();

  // ── Date range ──
  const dateRange = useMemo(() => {
    let start: Date, end: Date;
    if (viewMode === 'month') {
      // Scan all items for earliest start_date
      let earliest = startOfMonth(subMonths(today, 3));
      const scanEarliest = (items: RoadmapItem[]) => {
        items.forEach(item => {
          if (item.start_date) {
            const d = startOfMonth(new Date(item.start_date));
            if (d < earliest) earliest = d;
          }
          if (item.children) scanEarliest(item.children);
        });
      };
      scanEarliest(roadmapData?.items || []);
      start = earliest;
      end = endOfMonth(new Date(today.getFullYear(), 11, 1)); // end of current year
    } else if (viewMode === 'week') {
      // Past 2 months + future 3 months for scrollable week view
      start = startOfWeek(startOfMonth(subMonths(today, 2)), { weekStartsOn: 1 });
      end = endOfWeek(endOfMonth(addMonths(today, 3)), { weekStartsOn: 1 });
    } else {
      start = startOfYear(today);
      end = endOfYear(today);
    }
    return eachDayOfInterval({ start, end });
  }, [viewMode, roadmapData]);

  const totalDays = dateRange.length;
  const rangeStart = dateRange[0];

  // Scroll sync between header and body
  const handleHeaderScroll = useCallback(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (timelineScrollRef.current && bodyScrollRef.current) {
      bodyScrollRef.current.scrollLeft = timelineScrollRef.current.scrollLeft;
    }
    syncingRef.current = false;
  }, []);

  const handleBodyScroll = useCallback(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (bodyScrollRef.current && timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
    syncingRef.current = false;
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (roadmapData?.items) {
      const ids = new Set<string>();
      const collect = (items: RoadmapItem[]) => {
        items.forEach(item => {
          if (item.children && item.children.length > 0) {
            ids.add(item.id);
            collect(item.children);
          }
        });
      };
      collect(roadmapData.items);
      setExpandedIds(ids);
    }
  }, [roadmapData]);

  const getBarPosition = (startDate?: string | null, dueDate?: string | null) => {
    if (!startDate && !dueDate) return null;
    const s = startDate ? new Date(startDate) : new Date(dueDate!);
    const e = dueDate ? new Date(dueDate) : new Date(startDate!);
    const left = Math.max(0, differenceInDays(s, rangeStart));
    const width = Math.max(1, differenceInDays(e, s) + 1);
    return {
      left: `${(left / totalDays) * 100}%`,
      width: `${(width / totalDays) * 100}%`,
    };
  };

  // Filter done items recursively
  const filterDoneItems = useCallback((items: RoadmapItem[]): RoadmapItem[] => {
    if (!hideDone) return items;
    return items.reduce<RoadmapItem[]>((acc, item) => {
      if (item.type === 'task') {
        if (item.status !== 'done') acc.push(item);
      } else {
        const filteredChildren = item.children ? filterDoneItems(item.children) : [];
        if (filteredChildren.length > 0 || item.status !== 'done') {
          acc.push({ ...item, children: filteredChildren });
        }
      }
      return acc;
    }, []);
  }, [hideDone]);

  // Use localItems (drag-reordered) with fallback to API data
  const baseItems = localItems.length > 0 ? localItems : roadmapData?.items || [];
  const displayItems = filterDoneItems(baseItems);

  // Flatten visible item IDs for SortableContext (must match rendered items)
  const flatVisibleIds = useMemo(() => {
    const ids: string[] = [];
    const collect = (items: RoadmapItem[]) => {
      items.forEach(item => {
        ids.push(item.id);
        if (item.children && expandedIds.has(item.id)) {
          collect(item.children);
        }
      });
    };
    collect(displayItems);
    return ids;
  }, [displayItems, expandedIds]);

  const renderRow = (item: RoadmapItem, depth: number = 0): React.ReactNode => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const barPos = getBarPosition(item.start_date, item.due_date);

    // done status → force 100%
    const displayProgress = item.status === 'done' ? 100 : item.progress;

    const typeIcon =
      item.type === 'project' ? (
        <FolderIcon sx={{ fontSize: 16, color: '#2955FF' }} />
      ) : item.type === 'subproject' ? (
        <FolderSpecialIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />
      ) : (
        <TaskAltIcon sx={{ fontSize: 16, color: statusColors[item.status] }} />
      );

    const barColor =
      item.type === 'project'
        ? '#2955FF'
        : item.type === 'subproject'
          ? '#8B5CF6'
          : statusColors[item.status] || '#6B7280';

    const barHeight = item.type === 'task' ? 16 : 10;
    const barRadius = item.type === 'task' ? 8 : 5;

    return (
      <SortableRoadmapRow key={item.id} id={item.id}>
        {handleListeners => (
          <>
            <Box
              sx={{
                display: 'flex',
                minHeight: 44,
                minWidth: timelineMinWidth ? nameColumnWidth + timelineMinWidth : undefined,
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                '&:hover': { bgcolor: 'rgba(41,85,255,0.03)' },
                '&:hover .subproject-delete-btn': { opacity: 1 },
                transition: 'background 0.1s',
              }}
            >
              <Box
                sx={{
                  width: nameColumnWidth,
                  minWidth: nameColumnWidth,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  pl: 0.5 + depth * 2.5,
                  pr: 1,
                  borderRight: '1px solid rgba(0,0,0,0.06)',
                  position: 'sticky',
                  left: 0,
                  bgcolor: 'rgba(255,255,255,0.95)',
                  zIndex: 3,
                }}
              >
                <Box
                  component="span"
                  {...handleListeners}
                  sx={{
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    '&:active': { cursor: 'grabbing' },
                  }}
                >
                  <DragIndicatorIcon sx={{ fontSize: 16, color: '#C0C4CC' }} />
                </Box>
                {hasChildren ? (
                  <IconButton size="small" onClick={() => toggleExpand(item.id)} sx={{ p: 0.3 }}>
                    {isExpanded ? (
                      <ExpandLessIcon sx={{ fontSize: 16 }} />
                    ) : (
                      <ExpandMoreIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                ) : (
                  <Box sx={{ width: 22 }} />
                )}
                {typeIcon}
                <Tooltip
                  title={item.name}
                  placement="top-start"
                  disableHoverListener={item.name.length < 40}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: item.type === 'task' ? 500 : 700,
                      fontSize: '0.8rem',
                      flexGrow: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      color: item.overdue ? '#EF4444' : '#1A1D29',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.name}
                  </Typography>
                </Tooltip>
                {item.overdue && (
                  <Tooltip title="Overdue">
                    <WarningAmberIcon sx={{ fontSize: 14, color: '#EF4444' }} />
                  </Tooltip>
                )}
                {item.type === 'subproject' && (
                  <Tooltip title="Subproject 삭제">
                    <IconButton
                      size="small"
                      onClick={e => {
                        e.stopPropagation();
                        setDeleteTarget({ id: item.id, name: item.name });
                      }}
                      sx={{
                        p: 0.3,
                        color: '#D1D5DB',
                        opacity: 0,
                        '.MuiBox-root:hover > &, &:focus': { opacity: 1 },
                        '&:hover': { color: '#EF4444' },
                        transition: 'opacity 0.15s, color 0.15s',
                      }}
                      className="subproject-delete-btn"
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <Chip
                  label={statusLabels[item.status] || item.status}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    bgcolor: `${statusColors[item.status]}15`,
                    color: statusColors[item.status],
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{ color: '#9CA3AF', fontSize: '0.65rem', minWidth: 32, textAlign: 'right' }}
                >
                  {displayProgress}%
                </Typography>
              </Box>

              <Box sx={{ flexGrow: 1, minWidth: timelineMinWidth, position: 'relative', overflow: 'hidden' }}>
                {/* Today marker */}
                {(() => {
                  const todayOffset = differenceInDays(today, rangeStart);
                  if (todayOffset >= 0 && todayOffset < totalDays) {
                    const leftPct = `${(todayOffset / totalDays) * 100}%`;
                    return (
                      <Box sx={{
                        position: 'absolute', top: 0, bottom: 0, left: leftPct, zIndex: 2,
                      }}>
                        <Box sx={{
                          position: 'absolute', top: 0, bottom: 0, left: 0,
                          width: 2, bgcolor: '#EF4444',
                          opacity: 0.35,
                        }} />
                      </Box>
                    );
                  }
                  return null;
                })()}

                {/* Progress gauge bar */}
                {barPos && (
                  <Tooltip title={`${item.name}: ${displayProgress}%`} arrow placement="top">
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        left: barPos.left,
                        width: barPos.width,
                        height: barHeight,
                        bgcolor: `${barColor}18`,
                        borderRadius: `${barRadius}px`,
                        minWidth: 6,
                        zIndex: 1,
                        overflow: 'hidden',
                        border: `1px solid ${barColor}40`,
                        boxShadow: `0 1px 4px ${barColor}15`,
                      }}
                    >
                      {/* Filled portion = progress */}
                      <Box
                        sx={{
                          width: `${displayProgress}%`,
                          height: '100%',
                          bgcolor: barColor,
                          borderRadius: `${barRadius}px`,
                          transition: 'width 0.5s ease',
                          opacity: item.status === 'done' ? 0.8 : 1,
                        }}
                      />
                      {/* Progress label on bar */}
                      {item.type === 'task' && (
                        <Typography
                          sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: '0.5rem',
                            fontWeight: 700,
                            color: displayProgress > 50 ? '#fff' : '#374151',
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                            textShadow: displayProgress > 50 ? '0 0 2px rgba(0,0,0,0.3)' : 'none',
                          }}
                        >
                          {displayProgress}%
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {hasChildren && (
              <Collapse in={isExpanded}>
                {item.children!.map(child => renderRow(child, depth + 1))}
              </Collapse>
            )}
          </>
        )}
      </SortableRoadmapRow>
    );
  };

  // ── Date headers ──
  const dateHeaders = useMemo((): {
    label: string;
    span: number;
    isCurrent?: boolean;
    id?: string;
  }[] => {
    if (viewMode === 'month') {
      const months: { label: string; span: number; isCurrent?: boolean; id?: string }[] = [];
      let currentMonth = '';
      dateRange.forEach(d => {
        const m = format(d, 'MMM');
        if (m !== currentMonth) {
          const isCurrent = format(d, 'yyyy-MM') === format(today, 'yyyy-MM');
          months.push({
            label: m,
            span: 1,
            isCurrent,
            id: isCurrent ? 'current-period' : undefined,
          });
          currentMonth = m;
        } else {
          months[months.length - 1].span++;
        }
      });
      return months;
    } else if (viewMode === 'week') {
      const result: { label: string; span: number; isCurrent?: boolean; id?: string }[] = [];
      let currentGroup = '';
      dateRange.forEach(d => {
        const monthLabel = format(d, 'yyyy-MM');
        const weekNum = getWeek(d, { weekStartsOn: 1 });
        const weekStart = startOfWeek(d, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(d, { weekStartsOn: 1 });
        const key = `${monthLabel}-W${weekNum}`;

        if (key !== currentGroup) {
          const isCurrent = today >= weekStart && today <= weekEnd;
          result.push({
            label: `W${weekNum} (${format(weekStart, 'dd')}~${format(weekEnd, 'dd')})`,
            span: 1,
            isCurrent,
            id: isCurrent ? 'current-period' : undefined,
          });
          currentGroup = key;
        } else {
          result[result.length - 1].span++;
        }
      });
      return result;
    } else {
      const result: { label: string; span: number; isCurrent?: boolean; id?: string }[] = [];
      let currentQ = '';
      dateRange.forEach(d => {
        const q = `Q${Math.ceil((d.getMonth() + 1) / 3)}`;
        if (q !== currentQ) {
          const qStart = startOfQuarter(d);
          const qEnd = endOfQuarter(d);
          const isCurrent = today >= qStart && today <= qEnd;
          result.push({
            label: `${q} ${format(d, 'yyyy')}`,
            span: 1,
            isCurrent,
            id: isCurrent ? 'current-period' : undefined,
          });
          currentQ = q;
        } else {
          result[result.length - 1].span++;
        }
      });
      return result;
    }
  }, [viewMode, dateRange]);

  // Week view: month group headers above week headers
  const monthGroupHeaders = useMemo(() => {
    if (viewMode !== 'week') return [];
    const result: { label: string; span: number }[] = [];

    // Iterate dateRange by week and group into months
    const weekMonths: string[] = [];
    let lastWeekKey = '';
    dateRange.forEach(d => {
      const weekNum = getWeek(d, { weekStartsOn: 1 });
      const monthKey = format(d, 'yyyy-MM');
      const weekKey = `${monthKey}-W${weekNum}`;
      if (weekKey !== lastWeekKey) {
        weekMonths.push(format(d, 'yyyy-MM'));
        lastWeekKey = weekKey;
      }
    });

    let curM = '';
    weekMonths.forEach(m => {
      if (m !== curM) {
        result.push({ label: m, span: 1 });
        curM = m;
      } else {
        result[result.length - 1].span++;
      }
    });

    return result;
  }, [viewMode, dateRange, dateHeaders]);

  // Min width per column for scrollable views
  const minColWidth = viewMode === 'week' ? 120 : viewMode === 'month' ? 120 : undefined;
  const timelineMinWidth = minColWidth
    ? dateHeaders.length * minColWidth
    : undefined;

  // Auto-scroll to today instantly on view change
  useEffect(() => {
    if ((viewMode === 'week' || viewMode === 'month') && timelineScrollRef.current && timelineMinWidth) {
      requestAnimationFrame(() => {
        const todayOffset = differenceInDays(today, rangeStart);
        if (todayOffset >= 0 && todayOffset < totalDays) {
          const todayPx = (todayOffset / totalDays) * timelineMinWidth;
          const containerWidth = timelineScrollRef.current!.clientWidth;
          const scrollTo = Math.max(0, todayPx - containerWidth / 2);
          timelineScrollRef.current!.scrollLeft = scrollTo;
          if (bodyScrollRef.current) {
            bodyScrollRef.current.scrollLeft = scrollTo;
          }
        }
      });
    }
  }, [viewMode, dateRange, timelineMinWidth]);

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <LinearProgress sx={{ maxWidth: 300, mx: 'auto', mb: 2 }} />
        <Typography variant="body2" color="textSecondary">
          Loading roadmap...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_, v) => v && setViewMode(v)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              fontSize: '0.75rem',
              px: 2,
              py: 0.5,
              textTransform: 'none',
            },
          }}
        >
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="quarter">Quarter</ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title="Today">
          <IconButton size="small" sx={{ color: '#EF4444' }}>
            <TodayIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={hideDone ? '완료된 항목 보기' : '완료된 항목 숨기기'}>
          <IconButton
            size="small"
            onClick={() => setHideDone(!hideDone)}
            sx={{ color: hideDone ? '#9CA3AF' : '#22C55E' }}
          >
            {hideDone ? <VisibilityOffIcon sx={{ fontSize: '1.1rem' }} /> : <VisibilityIcon sx={{ fontSize: '1.1rem' }} />}
          </IconButton>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        <IconButton
          size="small"
          onClick={() => setShowFilters(!showFilters)}
          sx={{ color: showFilters ? '#2955FF' : '#6B7280' }}
        >
          <FilterListIcon fontSize="small" />
        </IconButton>
      </Box>

      {showFilters && (
        <Paper
          sx={{
            p: 2,
            mb: 2,
            display: 'flex',
            gap: 2,
            borderRadius: 2,
            border: '1px solid rgba(0,0,0,0.08)',
          }}
          elevation={0}
        >
          <TextField
            select
            size="small"
            label="Status"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            sx={{ minWidth: 120, '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="todo">To Do</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="done">Done</MenuItem>
            <MenuItem value="hold">Hold</MenuItem>
          </TextField>
        </Paper>
      )}

      <Paper
        sx={{
          borderRadius: 2,
          border: '1px solid rgba(0,0,0,0.1)',
          overflow: 'hidden',
          bgcolor: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
        elevation={0}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', borderBottom: '2px solid rgba(0,0,0,0.08)', bgcolor: 'rgba(255,255,255,0.85)' }}>
          <Box
            sx={{
              width: nameColumnWidth,
              minWidth: nameColumnWidth,
              flexShrink: 0,
              borderRight: '1px solid rgba(0,0,0,0.06)',
              px: 2,
              py: 1,
              position: 'relative',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: '#374151',
                textTransform: 'uppercase',
                fontSize: '0.7rem',
              }}
            >
              Task Name
            </Typography>
            {/* Resize handle */}
            <Box
              onMouseDown={handleResizeMouseDown}
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: 5,
                cursor: 'col-resize',
                '&:hover': { bgcolor: 'rgba(41, 85, 255, 0.3)' },
                transition: 'background-color 0.15s',
              }}
            />
          </Box>
          <Box
            ref={timelineScrollRef}
            onScroll={handleHeaderScroll}
            sx={{
              flexGrow: 1,
              overflowX: 'auto',
              '&::-webkit-scrollbar': { height: 6 },
              '&::-webkit-scrollbar-thumb': { bgcolor: '#CBD5E1', borderRadius: 3 },
            }}
          >
            <Box sx={{ minWidth: timelineMinWidth, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Month group row for week view */}
              {viewMode === 'week' && monthGroupHeaders.length > 0 && (
                <Box sx={{ display: 'flex', borderBottom: '1px solid #F3F4F6' }}>
                  {monthGroupHeaders.map((mh, i) => (
                    <Box
                      key={i}
                      sx={{
                        flex: mh.span,
                        textAlign: 'center',
                        py: 0.3,
                        borderRight: '1px solid rgba(0,0,0,0.08)',
                        bgcolor: '#F0F4FF',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 800, fontSize: '0.6rem', color: '#374151' }}
                      >
                        {mh.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
              {/* Date header columns */}
              <Box sx={{ display: 'flex' }}>
                {dateHeaders.map((h, i) => (
                  <Box
                    key={i}
                    ref={h.id === 'current-period' ? currentMarkerRef : undefined}
                    sx={{
                      flex: h.span,
                      minWidth: minColWidth,
                      textAlign: 'center',
                      py: 1,
                      borderRight: '1px solid #F3F4F6',
                      bgcolor: h.isCurrent ? '#EEF2FF' : 'transparent',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: h.isCurrent ? 800 : 600,
                        fontSize: viewMode === 'week' ? '0.6rem' : '0.65rem',
                        color: h.isCurrent ? '#2955FF' : '#6B7280',
                      }}
                    >
                      {h.label}
                    </Typography>
                  </Box>
                ))}
              </Box>
              {/* Today label in header */}
              {(() => {
                const todayOff = differenceInDays(today, rangeStart);
                if (todayOff >= 0 && todayOff < totalDays) {
                  const leftPct = `${(todayOff / totalDays) * 100}%`;
                  return (
                    <Box sx={{
                      position: 'absolute', bottom: -1, left: leftPct, zIndex: 10,
                      transform: 'translateX(-50%)',
                    }}>
                      <Box sx={{
                        fontSize: '0.6rem', fontWeight: 700, color: '#fff',
                        bgcolor: '#EF4444', px: 0.7, py: 0.15, borderRadius: '4px 4px 0 0',
                        whiteSpace: 'nowrap', lineHeight: 1.2, letterSpacing: '-0.02em',
                      }}>
                        {`${today.getMonth() + 1}/${today.getDate()}`}
                      </Box>
                    </Box>
                  );
                }
                return null;
              })()}
            </Box>
          </Box>
        </Box>

        {/* Body rows */}
        <Box
          ref={bodyScrollRef}
          onScroll={handleBodyScroll}
          sx={{
            overflowX: 'auto',
            overflowY: 'auto',
            '&::-webkit-scrollbar': { height: 6 },
            '&::-webkit-scrollbar-thumb': { bgcolor: '#CBD5E1', borderRadius: 3 },
          }}
        >
          {displayItems.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <Typography variant="body2" color="textSecondary">
                No roadmap data. Add tasks with start/due dates to see the roadmap.
              </Typography>
            </Box>
          ) : (
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={flatVisibleIds} strategy={verticalListSortingStrategy}>
                {displayItems.map(item => renderRow(item))}
              </SortableContext>
            </DndContext>
          )}
        </Box>
      </Paper>

      {/* Subproject Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#EF4444' }}>
          Subproject 삭제
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: '#374151', fontSize: '0.9rem' }}>
            <strong>"{deleteTarget?.name}"</strong> 을(를) 삭제하시겠습니까?
            <br />
            <br />
            하위 Task는 삭제되지 않고 프로젝트 직속으로 이동됩니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ color: '#6B7280' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (deleteTarget) {
                const numericId = parseInt(deleteTarget.id.replace('subproject-', ''), 10);
                deleteSubProjectMutation.mutate(numericId);
              }
            }}
            disabled={deleteSubProjectMutation.isPending}
            sx={{ bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' } }}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RoadmapView;
