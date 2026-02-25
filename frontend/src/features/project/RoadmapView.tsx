import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Box, Typography, ToggleButtonGroup, ToggleButton, Chip,
    IconButton, Collapse, LinearProgress, Tooltip, TextField,
    MenuItem, Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import TodayIcon from '@mui/icons-material/Today';
import FilterListIcon from '@mui/icons-material/FilterList';
import FolderIcon from '@mui/icons-material/Folder';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { RoadmapItem } from '../../types';
import {
    format, differenceInDays, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, eachDayOfInterval, startOfYear, endOfYear,
    getWeek, startOfQuarter, endOfQuarter, subMonths, addMonths,
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

const RoadmapView: React.FC<RoadmapViewProps> = ({ projectId }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [filterStatus, setFilterStatus] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    const timelineScrollRef = useRef<HTMLDivElement>(null);
    const currentMarkerRef = useRef<HTMLDivElement>(null);

    const { data: roadmapData, isLoading } = useQuery({
        queryKey: ['roadmap', projectId, viewMode],
        queryFn: () => api.getRoadmap({ project_id: projectId, view: viewMode }),
    });

    const today = new Date();

    // ── Date range ──
    const dateRange = useMemo(() => {
        let start: Date, end: Date;
        if (viewMode === 'month') {
            start = startOfYear(today);
            end = endOfYear(today);
        } else if (viewMode === 'week') {
            // Past 2 months + future 3 months for scrollable week view
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

    const renderRow = (item: RoadmapItem, depth: number = 0): React.ReactNode => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedIds.has(item.id);
        const barPos = getBarPosition(item.start_date, item.due_date);

        // done status → force 100%
        const displayProgress = item.status === 'done' ? 100 : item.progress;

        const typeIcon = item.type === 'project' ? <FolderIcon sx={{ fontSize: 16, color: '#2955FF' }} /> :
            item.type === 'subproject' ? <FolderSpecialIcon sx={{ fontSize: 16, color: '#8B5CF6' }} /> :
                <TaskAltIcon sx={{ fontSize: 16, color: statusColors[item.status] }} />;

        const barColor = item.type === 'project' ? '#2955FF' :
            item.type === 'subproject' ? '#8B5CF6' :
                statusColors[item.status] || '#6B7280';

        const barHeight = item.type === 'task' ? 16 : 10;
        const barRadius = item.type === 'task' ? 8 : 5;

        return (
            <React.Fragment key={item.id}>
                <Box sx={{
                    display: 'flex', minHeight: 44, borderBottom: '1px solid #F3F4F6',
                    '&:hover': { bgcolor: '#FAFBFF' }, transition: 'background 0.1s',
                }}>
                    <Box sx={{
                        width: 360, minWidth: 360, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 0.5,
                        pl: 1 + depth * 2.5, pr: 1,
                        borderRight: '1px solid #E5E7EB',
                    }}>
                        {hasChildren ? (
                            <IconButton size="small" onClick={() => toggleExpand(item.id)} sx={{ p: 0.3 }}>
                                {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                        ) : (
                            <Box sx={{ width: 22 }} />
                        )}
                        {typeIcon}
                        <Tooltip title={item.name} placement="top-start" disableHoverListener={item.name.length < 40}>
                            <Typography variant="body2" sx={{
                                fontWeight: item.type === 'task' ? 500 : 700, fontSize: '0.8rem',
                                flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis',
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
                            label={statusLabels[item.status] || item.status}
                            size="small"
                            sx={{
                                height: 18, fontSize: '0.6rem', fontWeight: 600,
                                bgcolor: `${statusColors[item.status]}15`,
                                color: statusColors[item.status],
                            }}
                        />
                        <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem', minWidth: 32, textAlign: 'right' }}>
                            {displayProgress}%
                        </Typography>
                    </Box>

                    <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                        {/* Today marker */}
                        {(() => {
                            const todayOffset = differenceInDays(today, rangeStart);
                            if (todayOffset >= 0 && todayOffset < totalDays) {
                                return (
                                    <Box sx={{
                                        position: 'absolute', top: 0, bottom: 0,
                                        left: `${(todayOffset / totalDays) * 100}%`,
                                        width: 2, bgcolor: '#EF4444', zIndex: 2, opacity: 0.6,
                                    }} />
                                );
                            }
                            return null;
                        })()}

                        {/* Progress gauge bar */}
                        {barPos && (
                            <Tooltip title={`${item.name}: ${displayProgress}%`} arrow placement="top">
                                <Box sx={{
                                    position: 'absolute',
                                    top: '50%', transform: 'translateY(-50%)',
                                    left: barPos.left, width: barPos.width,
                                    height: barHeight,
                                    bgcolor: '#E5E7EB',
                                    borderRadius: `${barRadius}px`,
                                    minWidth: 6,
                                    zIndex: 1,
                                    overflow: 'hidden',
                                    border: `1px solid ${barColor}30`,
                                }}>
                                    {/* Filled portion = progress */}
                                    <Box sx={{
                                        width: `${displayProgress}%`,
                                        height: '100%',
                                        bgcolor: barColor,
                                        borderRadius: `${barRadius}px`,
                                        transition: 'width 0.5s ease',
                                        opacity: item.status === 'done' ? 0.7 : 0.9,
                                    }} />
                                    {/* Progress label on bar */}
                                    {item.type === 'task' && (
                                        <Typography sx={{
                                            position: 'absolute', top: '50%', left: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            fontSize: '0.5rem', fontWeight: 700,
                                            color: displayProgress > 50 ? '#fff' : '#374151',
                                            lineHeight: 1, whiteSpace: 'nowrap',
                                            textShadow: displayProgress > 50 ? '0 0 2px rgba(0,0,0,0.3)' : 'none',
                                        }}>
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
            </React.Fragment>
        );
    };

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
                    result.push({ label: `${q} ${format(d, 'yyyy')}`, span: 1, isCurrent, id: isCurrent ? 'current-period' : undefined });
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

    if (isLoading) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <LinearProgress sx={{ maxWidth: 300, mx: 'auto', mb: 2 }} />
                <Typography variant="body2" color="textSecondary">Loading roadmap...</Typography>
            </Box>
        );
    }

    const items = roadmapData?.items || [];

    // Min width per column for scrollable week view
    const minColWidth = viewMode === 'week' ? 100 : undefined;
    const timelineMinWidth = minColWidth ? dateHeaders.reduce((sum, h) => sum + h.span * minColWidth, 0) : undefined;

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(_, v) => v && setViewMode(v)}
                    size="small"
                    sx={{ '& .MuiToggleButton-root': { fontSize: '0.75rem', px: 2, py: 0.5, textTransform: 'none' } }}
                >
                    <ToggleButton value="month">Month</ToggleButton>
                    <ToggleButton value="week">Week</ToggleButton>
                    <ToggleButton value="quarter">Quarter</ToggleButton>
                </ToggleButtonGroup>

                <Tooltip title="Today">
                    <IconButton size="small" sx={{ color: '#EF4444' }}>
                        <TodayIcon fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Box sx={{ flexGrow: 1 }} />

                <IconButton size="small" onClick={() => setShowFilters(!showFilters)} sx={{ color: showFilters ? '#2955FF' : '#6B7280' }}>
                    <FilterListIcon fontSize="small" />
                </IconButton>
            </Box>

            {showFilters && (
                <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, borderRadius: 2, border: '1px solid #E5E7EB' }} elevation={0}>
                    <TextField
                        select size="small" label="Status" value={filterStatus}
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

            <Paper sx={{ borderRadius: 2, border: '1px solid #E5E7EB', overflow: 'hidden' }} elevation={0}>
                {/* Header */}
                <Box sx={{ display: 'flex', borderBottom: '2px solid #E5E7EB', bgcolor: '#FAFBFC' }}>
                    <Box sx={{ width: 360, minWidth: 360, flexShrink: 0, borderRight: '1px solid #E5E7EB', px: 2, py: 1 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                            Task Name
                        </Typography>
                    </Box>
                    <Box ref={timelineScrollRef} sx={{
                        flexGrow: 1, overflowX: viewMode === 'week' ? 'auto' : 'hidden',
                        '&::-webkit-scrollbar': { height: 6 },
                        '&::-webkit-scrollbar-thumb': { bgcolor: '#CBD5E1', borderRadius: 3 },
                    }}>
                        <Box sx={{ minWidth: timelineMinWidth, display: 'flex', flexDirection: 'column' }}>
                            {/* Month group row for week view */}
                            {viewMode === 'week' && monthGroupHeaders.length > 0 && (
                                <Box sx={{ display: 'flex', borderBottom: '1px solid #F3F4F6' }}>
                                    {monthGroupHeaders.map((mh, i) => (
                                        <Box key={i} sx={{
                                            flex: mh.span, textAlign: 'center', py: 0.3,
                                            borderRight: '1px solid #E5E7EB',
                                            bgcolor: '#F0F4FF',
                                        }}>
                                            <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.6rem', color: '#374151' }}>
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

                {/* Body rows */}
                <Box sx={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
                    {items.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}>
                            <Typography variant="body2" color="textSecondary">No roadmap data. Add tasks with start/due dates to see the roadmap.</Typography>
                        </Box>
                    ) : (
                        items.map(item => renderRow(item))
                    )}
                </Box>
            </Paper>
        </Box>
    );
};

export default RoadmapView;
