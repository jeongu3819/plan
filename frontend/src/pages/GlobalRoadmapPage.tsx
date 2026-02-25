import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    Box, Typography, ToggleButtonGroup, ToggleButton, Collapse,
    Chip, IconButton, Tooltip, LinearProgress, TextField, MenuItem,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderIcon from '@mui/icons-material/Folder';
import TodayIcon from '@mui/icons-material/Today';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TimelineIcon from '@mui/icons-material/Timeline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SortIcon from '@mui/icons-material/Sort';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { RoadmapItem } from '../types';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    format, differenceInDays, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, eachDayOfInterval, startOfYear, endOfYear,
    getWeek, startOfQuarter, endOfQuarter, subMonths, addMonths,
} from 'date-fns';

type ViewMode = 'month' | 'week' | 'quarter';
type SortKey = 'default' | 'name' | 'due_date' | 'status' | 'progress';

const STATUS_COLORS: Record<string, string> = {
    done: '#22C55E', in_progress: '#2955FF', todo: '#6B7280', hold: '#F59E0B',
};
const STATUS_LABELS: Record<string, string> = {
    todo: 'To Do', in_progress: 'In Progress', done: 'Done', hold: 'Hold',
};
const STATUS_ORDER: Record<string, number> = {
    in_progress: 0, todo: 1, hold: 2, done: 3,
};
const PROJECT_COLORS = ['#2955FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const SortableGlobalRow: React.FC<{
    id: string;
    children: (handleListeners: Record<string, any>) => React.ReactNode;
}> = ({ id, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
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

const GlobalRoadmapPage: React.FC = () => {
    const currentUserId = useAppStore(state => state.currentUserId);
    const queryClient = useQueryClient();
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const timelineScrollRef = useRef<HTMLDivElement>(null);
    const currentMarkerRef = useRef<HTMLDivElement>(null);
    const [sortKey, setSortKey] = useState<SortKey>('default');
    const [sortAsc, setSortAsc] = useState(true);

    // ── Drag reorder state ──
    const [localItems, setLocalItems] = useState<RoadmapItem[]>([]);
    const localDragRef = useRef(false);
    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const { data: roadmapData, isLoading } = useQuery({
        queryKey: ['globalRoadmap', currentUserId, viewMode],
        queryFn: () => api.getGlobalRoadmap(currentUserId, viewMode),
    });

    // Sync local items when API data changes — skip if we just did a local drag
    useEffect(() => {
        if (localDragRef.current) return;
        setLocalItems(roadmapData?.items || []);
    }, [roadmapData]);

    const today = useMemo(() => new Date(), []);

    // Auto-expand all projects on data load
    useEffect(() => {
        const items = roadmapData?.items || [];
        if (items.length > 0) {
            const ids = new Set<string>();
            const collect = (list: RoadmapItem[]) => {
                list.forEach(it => {
                    if (it.children && it.children.length > 0) {
                        ids.add(it.id);
                        collect(it.children);
                    }
                });
            };
            collect(items);
            setExpandedProjects(ids);
        }
    }, [roadmapData]);

    // ── Sorting logic ──
    const sortItems = useCallback((items: RoadmapItem[]): RoadmapItem[] => {
        if (sortKey === 'default') return items;

        const compare = (a: RoadmapItem, b: RoadmapItem): number => {
            let result = 0;
            switch (sortKey) {
                case 'name':
                    result = (a.name || '').localeCompare(b.name || '', 'ko');
                    break;
                case 'due_date':
                    result = (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
                    break;
                case 'status':
                    result = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
                    break;
                case 'progress':
                    result = (a.progress || 0) - (b.progress || 0);
                    break;
            }
            return sortAsc ? result : -result;
        };

        return [...items].sort(compare).map(item => {
            if (item.children && item.children.length > 0) {
                return { ...item, children: sortItems(item.children) };
            }
            return item;
        });
    }, [sortKey, sortAsc]);

    // Display items: sorted or drag-ordered
    const displayItems = useMemo(() => {
        const base = localItems.length > 0 ? localItems : (roadmapData?.items || []);
        return sortKey === 'default' ? base : sortItems(base);
    }, [localItems, roadmapData, sortKey, sortAsc, sortItems]);

    // ── Drag helpers ──
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

    const reorderInTree = useCallback((items: RoadmapItem[], activeId: string, overId: string): RoadmapItem[] | null => {
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
    }, []);

    const findParent = useCallback((items: RoadmapItem[], id: string, parent?: RoadmapItem): RoadmapItem | null => {
        for (const item of items) {
            if (item.id === id) return parent || null;
            if (item.children) {
                const found = findParent(item.children, id, item);
                if (found !== undefined && found !== null) return found;
                if (item.children.some(c => c.id === id)) return item;
            }
        }
        return null;
    }, []);

    // Save global project order
    const saveGlobalOrderMutation = useMutation({
        mutationFn: ({ order, parentKey }: { order: string[]; parentKey?: string }) =>
            api.saveGlobalRoadmapOrder(currentUserId, order, parentKey),
        onSettled: () => { localDragRef.current = false; },
    });

    // Save per-project children order (reuse existing endpoint)
    const saveProjectOrderMutation = useMutation({
        mutationFn: ({ projectId, order, parentKey }: { projectId: number; order: string[]; parentKey?: string }) =>
            api.saveRoadmapOrder(projectId, order, parentKey),
        onSettled: () => { localDragRef.current = false; },
    });

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overId = String(over.id);

        const activeSiblings = findSiblings(localItems, activeId);
        const overSiblings = findSiblings(localItems, overId);
        if (!activeSiblings || !overSiblings || activeSiblings !== overSiblings) return;

        const result = reorderInTree(localItems, activeId, overId);
        if (result) {
            localDragRef.current = true;
            setLocalItems(result);

            // Optimistic cache update
            queryClient.setQueryData(['globalRoadmap', currentUserId, viewMode], (old: any) => {
                if (!old) return old;
                return { ...old, items: result };
            });

            // Determine what level was reordered and persist
            const parentItem = findParent(result, activeId);
            if (!parentItem) {
                // Top-level project reorder
                const order = result.map(c => c.id);
                saveGlobalOrderMutation.mutate({ order });
            } else if (parentItem.type === 'project') {
                // Children within a project → use per-project order endpoint
                const projectId = parseInt(parentItem.id.replace('project-', ''), 10);
                const order = parentItem.children!.map(c => c.id);
                saveProjectOrderMutation.mutate({ projectId, order });
            } else if (parentItem.type === 'subproject') {
                // Children within a subproject → use per-project order with parentKey
                const grandParent = findParent(result, parentItem.id);
                if (grandParent) {
                    const projectId = parseInt(grandParent.id.replace('project-', ''), 10);
                    const order = parentItem.children!.map(c => c.id);
                    saveProjectOrderMutation.mutate({ projectId, order, parentKey: parentItem.id });
                }
            }
        }
    }, [localItems, findSiblings, reorderInTree, findParent, saveGlobalOrderMutation, saveProjectOrderMutation, queryClient, currentUserId, viewMode]);

    // Flatten visible item IDs for SortableContext
    const flatVisibleIds = useMemo(() => {
        const ids: string[] = [];
        const collect = (items: RoadmapItem[]) => {
            items.forEach(item => {
                ids.push(item.id);
                if (item.children && expandedProjects.has(item.id)) {
                    collect(item.children);
                }
            });
        };
        collect(displayItems);
        return ids;
    }, [displayItems, expandedProjects]);

    // ── Date range ──
    const dateRange = useMemo(() => {
        let start: Date, end: Date;
        if (viewMode === 'month') {
            start = startOfYear(today);
            end = endOfYear(today);
        } else if (viewMode === 'week') {
            start = startOfWeek(startOfMonth(subMonths(today, 2)), { weekStartsOn: 1 });
            end = endOfWeek(endOfMonth(addMonths(today, 3)), { weekStartsOn: 1 });
        } else {
            start = startOfYear(today);
            end = endOfYear(today);
        }
        return eachDayOfInterval({ start, end });
    }, [viewMode]);

    const totalDays = dateRange.length;
    const rangeStart = dateRange[0];

    // Auto-scroll to current period on week view
    useEffect(() => {
        if (viewMode === 'week' && currentMarkerRef.current && timelineScrollRef.current) {
            setTimeout(() => {
                currentMarkerRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }, 100);
        }
    }, [viewMode, dateRange]);

    // ── Date headers ──
    const dateHeaders = useMemo((): { label: string; span: number; isCurrent?: boolean; id?: string }[] => {
        if (viewMode === 'month') {
            const months: { label: string; span: number; isCurrent?: boolean; id?: string }[] = [];
            let currentMonth = '';
            dateRange.forEach(d => {
                const m = format(d, 'MMM');
                if (m !== currentMonth) {
                    const isCurrent = format(d, 'yyyy-MM') === format(today, 'yyyy-MM');
                    months.push({ label: m, span: 1, isCurrent, id: isCurrent ? 'current-period' : undefined });
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
                        span: 1, isCurrent,
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
                    result.push({ label: `${q} ${format(d, 'yyyy')}`, span: 1, isCurrent, id: isCurrent ? 'current-period' : undefined });
                    currentQ = q;
                } else {
                    result[result.length - 1].span++;
                }
            });
            return result;
        }
    }, [viewMode, dateRange]);

    // Week view: month group headers
    const monthGroupHeaders = useMemo(() => {
        if (viewMode !== 'week') return [];
        const result: { label: string; span: number }[] = [];
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
    }, [viewMode, dateRange]);

    const toggleProject = (id: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

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

    const minColWidth = viewMode === 'week' ? 100 : undefined;
    const timelineMinWidth = minColWidth ? dateHeaders.reduce((sum, h) => sum + h.span * minColWidth, 0) : undefined;

    // ── Render a row (project, subproject, or task) ──
    const renderRow = (item: RoadmapItem, depth: number, projectColor: string): React.ReactNode => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedProjects.has(item.id);
        const barPos = getBarPosition(item.start_date, item.due_date);
        const displayProgress = item.status === 'done' ? 100 : item.progress;

        const typeIcon = item.type === 'project'
            ? <FolderIcon sx={{ fontSize: 16, color: projectColor }} />
            : item.type === 'subproject'
                ? <FolderSpecialIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />
                : <TaskAltIcon sx={{ fontSize: 16, color: STATUS_COLORS[item.status] }} />;

        const barColor = item.type === 'project' ? projectColor
            : item.type === 'subproject' ? '#8B5CF6'
                : STATUS_COLORS[item.status] || '#6B7280';

        const barHeight = item.type === 'task' ? 16 : 10;
        const barRadius = item.type === 'task' ? 8 : 5;
        const isDragDisabled = sortKey !== 'default';

        return (
            <SortableGlobalRow key={item.id} id={item.id}>
                {(handleListeners) => (
                    <>
                        <Box sx={{
                            display: 'flex', minHeight: item.type === 'project' ? 40 : 36,
                            borderBottom: item.type === 'project' ? '1px solid #E5E7EB' : '1px solid #F3F4F6',
                            '&:hover': { bgcolor: '#FAFBFF' },
                            transition: 'background 0.1s',
                        }}>
                            <Box sx={{
                                width: 300, minWidth: 300, flexShrink: 0,
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                pl: 0.5 + depth * 2, pr: 1,
                                borderRight: '1px solid #E5E7EB',
                            }}>
                                {/* Drag handle */}
                                {!isDragDisabled ? (
                                    <Box
                                        component="span"
                                        {...handleListeners}
                                        sx={{
                                            cursor: 'grab', display: 'flex', alignItems: 'center',
                                            flexShrink: 0, '&:active': { cursor: 'grabbing' },
                                        }}
                                    >
                                        <DragIndicatorIcon sx={{ fontSize: 16, color: '#C0C4CC' }} />
                                    </Box>
                                ) : (
                                    <Box sx={{ width: 16, flexShrink: 0 }} />
                                )}

                                {/* Expand/collapse */}
                                {hasChildren ? (
                                    <IconButton size="small" onClick={() => toggleProject(item.id)} sx={{ p: 0.3 }}>
                                        {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                                    </IconButton>
                                ) : (
                                    <Box sx={{ width: 22 }} />
                                )}

                                {/* Color dot for projects */}
                                {item.type === 'project' && (
                                    <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: projectColor, flexShrink: 0 }} />
                                )}

                                {typeIcon}

                                <Tooltip title={item.name} placement="top-start" disableHoverListener={item.name.length < 35}>
                                    <Typography variant="body2" sx={{
                                        fontWeight: item.type === 'task' ? 500 : 700,
                                        fontSize: '0.8rem', flexGrow: 1,
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        color: item.overdue ? '#EF4444' : '#1A1D29',
                                        lineHeight: 1.4, wordBreak: 'break-word',
                                    }}>
                                        {item.name}
                                    </Typography>
                                </Tooltip>

                                {item.overdue && (
                                    <Tooltip title="Overdue">
                                        <WarningAmberIcon sx={{ fontSize: 14, color: '#EF4444' }} />
                                    </Tooltip>
                                )}

                                <Chip
                                    label={STATUS_LABELS[item.status] || item.status}
                                    size="small"
                                    sx={{
                                        height: 18, fontSize: '0.6rem', fontWeight: 600,
                                        bgcolor: `${STATUS_COLORS[item.status || 'todo']}15`,
                                        color: STATUS_COLORS[item.status || 'todo'],
                                    }}
                                />
                                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem', minWidth: 32, textAlign: 'right' }}>
                                    {displayProgress || 0}%
                                </Typography>
                            </Box>

                            {/* Timeline bar */}
                            <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                                {/* Today marker */}
                                {(() => {
                                    const todayOffset = differenceInDays(today, rangeStart);
                                    if (todayOffset >= 0 && todayOffset < totalDays) {
                                        return (
                                            <Box sx={{
                                                position: 'absolute', top: 0, bottom: 0,
                                                left: `${(todayOffset / totalDays) * 100}%`,
                                                width: item.type === 'project' ? 2 : 1.5,
                                                bgcolor: '#EF4444', zIndex: 2,
                                                opacity: item.type === 'project' ? 0.6 : 0.4,
                                            }} />
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Progress bar */}
                                {barPos && (
                                    <Tooltip title={`${item.name}: ${displayProgress || 0}%`} arrow placement="top">
                                        <Box sx={{
                                            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                                            left: barPos.left, width: barPos.width,
                                            height: barHeight, bgcolor: '#E5E7EB',
                                            borderRadius: `${barRadius}px`,
                                            minWidth: 6, zIndex: 1, overflow: 'hidden',
                                            border: `1px solid ${barColor}30`,
                                        }}>
                                            <Box sx={{
                                                width: `${displayProgress || 0}%`, height: '100%',
                                                bgcolor: barColor, borderRadius: `${barRadius}px`,
                                                transition: 'width 0.5s ease',
                                                opacity: item.status === 'done' ? 0.7 : 0.9,
                                            }} />
                                            {item.type === 'task' && (
                                                <Typography sx={{
                                                    position: 'absolute', top: '50%', left: '50%',
                                                    transform: 'translate(-50%, -50%)',
                                                    fontSize: '0.5rem', fontWeight: 700,
                                                    color: (displayProgress || 0) > 50 ? '#fff' : '#374151',
                                                    lineHeight: 1, whiteSpace: 'nowrap',
                                                    textShadow: (displayProgress || 0) > 50 ? '0 0 2px rgba(0,0,0,0.3)' : 'none',
                                                }}>
                                                    {displayProgress || 0}%
                                                </Typography>
                                            )}
                                        </Box>
                                    </Tooltip>
                                )}
                            </Box>
                        </Box>

                        {/* Children */}
                        {hasChildren && (
                            <Collapse in={isExpanded}>
                                {(sortKey !== 'default' ? sortItems(item.children!) : item.children!).map(child =>
                                    renderRow(child, depth + 1, projectColor)
                                )}
                            </Collapse>
                        )}
                    </>
                )}
            </SortableGlobalRow>
        );
    };

    if (isLoading) {
        return (
            <Box sx={{ p: 4 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>전체 Roadmap</Typography>
                <LinearProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: '#1A1D29' }}>
                        전체 Roadmap
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
                        담당 프로젝트 통합 타임라인 ({displayItems.length}개 프로젝트)
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {/* Sort controls */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <SortIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />
                        <TextField
                            select size="small" value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)}
                            sx={{
                                minWidth: 120,
                                '& .MuiOutlinedInput-root': { fontSize: '0.78rem', height: 32 },
                                '& .MuiSelect-select': { py: 0.5 },
                            }}
                        >
                            <MenuItem value="default">기본순서 (수동)</MenuItem>
                            <MenuItem value="name">이름순</MenuItem>
                            <MenuItem value="due_date">마감일순</MenuItem>
                            <MenuItem value="status">상태순</MenuItem>
                            <MenuItem value="progress">진행률순</MenuItem>
                        </TextField>
                        {sortKey !== 'default' && (
                            <Tooltip title={sortAsc ? '오름차순' : '내림차순'}>
                                <IconButton size="small" onClick={() => setSortAsc(!sortAsc)} sx={{ color: '#2955FF' }}>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }}>
                                        {sortAsc ? 'ASC' : 'DESC'}
                                    </Typography>
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>

                    <ToggleButtonGroup value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)} size="small"
                        sx={{ '& .MuiToggleButton-root': { fontSize: '0.75rem', px: 2, py: 0.5, textTransform: 'none' } }}>
                        <ToggleButton value="month">Month</ToggleButton>
                        <ToggleButton value="week">Week</ToggleButton>
                        <ToggleButton value="quarter">Quarter</ToggleButton>
                    </ToggleButtonGroup>
                    <Tooltip title="Today">
                        <IconButton size="small" sx={{ color: '#EF4444' }}>
                            <TodayIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {displayItems.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8, color: '#9CA3AF' }}>
                    <TimelineIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                    <Typography>담당 프로젝트가 없거나 데이터가 없습니다.</Typography>
                </Box>
            ) : (
                <Box sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden', bgcolor: '#fff' }}>
                    {/* ── Header Row ── */}
                    <Box sx={{ display: 'flex', borderBottom: '2px solid #E5E7EB', bgcolor: '#FAFBFC' }}>
                        <Box sx={{ width: 300, minWidth: 300, flexShrink: 0, borderRight: '1px solid #E5E7EB', px: 2, py: 1 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                프로젝트 / 항목
                            </Typography>
                        </Box>
                        <Box ref={timelineScrollRef} sx={{
                            flexGrow: 1, overflowX: viewMode === 'week' ? 'auto' : 'hidden',
                            '&::-webkit-scrollbar': { height: 6 },
                            '&::-webkit-scrollbar-thumb': { bgcolor: '#CBD5E1', borderRadius: 3 },
                        }}>
                            <Box sx={{ minWidth: timelineMinWidth, display: 'flex', flexDirection: 'column' }}>
                                {viewMode === 'week' && monthGroupHeaders.length > 0 && (
                                    <Box sx={{ display: 'flex', borderBottom: '1px solid #F3F4F6' }}>
                                        {monthGroupHeaders.map((mh, i) => (
                                            <Box key={i} sx={{
                                                flex: mh.span, textAlign: 'center', py: 0.3,
                                                borderRight: '1px solid #E5E7EB', bgcolor: '#F0F4FF',
                                            }}>
                                                <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.6rem', color: '#374151' }}>
                                                    {mh.label}
                                                </Typography>
                                            </Box>
                                        ))}
                                    </Box>
                                )}
                                <Box sx={{ display: 'flex' }}>
                                    {dateHeaders.map((h, i) => (
                                        <Box
                                            key={i}
                                            ref={h.id === 'current-period' ? currentMarkerRef : undefined}
                                            sx={{
                                                flex: h.span, minWidth: minColWidth,
                                                textAlign: 'center', py: 1,
                                                borderRight: '1px solid #F3F4F6',
                                                bgcolor: h.isCurrent ? '#EEF2FF' : 'transparent',
                                            }}
                                        >
                                            <Typography variant="caption" sx={{
                                                fontWeight: h.isCurrent ? 800 : 600,
                                                fontSize: viewMode === 'week' ? '0.6rem' : '0.65rem',
                                                color: h.isCurrent ? '#2955FF' : '#6B7280',
                                            }}>
                                                {h.label}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        </Box>
                    </Box>

                    {/* ── Body rows ── */}
                    <Box sx={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={flatVisibleIds} strategy={verticalListSortingStrategy}>
                                {displayItems.map((project, pIdx) => {
                                    const projectColor = PROJECT_COLORS[pIdx % PROJECT_COLORS.length];
                                    return renderRow(project, 0, projectColor);
                                })}
                            </SortableContext>
                        </DndContext>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default GlobalRoadmapPage;
