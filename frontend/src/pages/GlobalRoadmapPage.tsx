import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Box, Typography, ToggleButtonGroup, ToggleButton, Collapse,
    Chip, IconButton, Tooltip, LinearProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderIcon from '@mui/icons-material/Folder';
import TodayIcon from '@mui/icons-material/Today';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TimelineIcon from '@mui/icons-material/Timeline';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { RoadmapItem } from '../types';
import {
    format, differenceInDays, startOfMonth, endOfMonth,
    startOfWeek, endOfWeek, eachDayOfInterval, startOfYear, endOfYear,
    getWeek, startOfQuarter, endOfQuarter, subMonths, addMonths,
} from 'date-fns';

type ViewMode = 'month' | 'week' | 'quarter';

const STATUS_COLORS: Record<string, string> = {
    done: '#22C55E', in_progress: '#2955FF', todo: '#6B7280', hold: '#F59E0B',
};
const STATUS_LABELS: Record<string, string> = {
    todo: 'To Do', in_progress: 'In Progress', done: 'Done', hold: 'Hold',
};
const PROJECT_COLORS = ['#2955FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const GlobalRoadmapPage: React.FC = () => {
    const currentUserId = useAppStore(state => state.currentUserId);
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const timelineScrollRef = useRef<HTMLDivElement>(null);
    const currentMarkerRef = useRef<HTMLDivElement>(null);

    const { data: roadmapData, isLoading } = useQuery({
        queryKey: ['globalRoadmap', currentUserId, viewMode],
        queryFn: () => api.getGlobalRoadmap(currentUserId, viewMode),
    });

    const items: RoadmapItem[] = roadmapData?.items || [];
    const today = useMemo(() => new Date(), []);

    // Auto-expand all projects on data load
    useEffect(() => {
        if (items.length > 0) {
            setExpandedProjects(new Set(items.map(p => p.id)));
        }
    }, [items]);

    // ── Date range (identical to RoadmapView) ──
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

    // ── Date headers (identical to RoadmapView) ──
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

    // Min width per column for scrollable week view
    const minColWidth = viewMode === 'week' ? 100 : undefined;
    const timelineMinWidth = minColWidth ? dateHeaders.reduce((sum, h) => sum + h.span * minColWidth, 0) : undefined;

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
                        담당 프로젝트 통합 타임라인 ({items.length}개 프로젝트)
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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

            {items.length === 0 ? (
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

                    {/* ── Body rows ── */}
                    <Box sx={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                        {items.map((project, pIdx) => {
                            const isExpanded = expandedProjects.has(project.id);
                            const projectColor = PROJECT_COLORS[pIdx % PROJECT_COLORS.length];
                            const children = project.children || [];
                            const displayProgress = project.status === 'done' ? 100 : project.progress;
                            const barPos = getBarPosition(project.start_date, project.due_date);

                            return (
                                <React.Fragment key={project.id}>
                                    {/* Project header row */}
                                    <Box sx={{ display: 'flex', minHeight: 40, borderBottom: '1px solid #E5E7EB', '&:hover': { bgcolor: '#FAFBFF' }, transition: 'background 0.1s' }}>
                                        <Box sx={{
                                            width: 300, minWidth: 300, flexShrink: 0,
                                            display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pr: 1,
                                            borderRight: '1px solid #E5E7EB',
                                        }}>
                                            <IconButton size="small" onClick={() => toggleProject(project.id)} sx={{ p: 0.3 }}>
                                                {isExpanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
                                            </IconButton>
                                            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: projectColor, flexShrink: 0 }} />
                                            <FolderIcon sx={{ fontSize: 16, color: projectColor }} />
                                            <Typography variant="body2" sx={{
                                                fontWeight: 700, fontSize: '0.8rem', flexGrow: 1,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {project.name}
                                            </Typography>
                                            <Chip
                                                label={STATUS_LABELS[project.status] || project.status}
                                                size="small"
                                                sx={{
                                                    height: 18, fontSize: '0.6rem', fontWeight: 600,
                                                    bgcolor: `${STATUS_COLORS[project.status || 'todo']}15`,
                                                    color: STATUS_COLORS[project.status || 'todo'],
                                                }}
                                            />
                                            <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem', minWidth: 32, textAlign: 'right' }}>
                                                {displayProgress || 0}%
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
                                            {/* Project bar */}
                                            {barPos && (
                                                <Tooltip title={`${project.name}: ${displayProgress || 0}%`} arrow placement="top">
                                                    <Box sx={{
                                                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                                                        left: barPos.left, width: barPos.width,
                                                        height: 10, bgcolor: '#E5E7EB', borderRadius: '5px',
                                                        minWidth: 6, zIndex: 1, overflow: 'hidden',
                                                        border: `1px solid ${projectColor}30`,
                                                    }}>
                                                        <Box sx={{
                                                            width: `${displayProgress || 0}%`, height: '100%',
                                                            bgcolor: projectColor, borderRadius: '5px',
                                                            transition: 'width 0.5s ease', opacity: 0.9,
                                                        }} />
                                                    </Box>
                                                </Tooltip>
                                            )}
                                        </Box>
                                    </Box>

                                    {/* Children (tasks/subprojects) */}
                                    <Collapse in={isExpanded}>
                                        {children.map(child => {
                                            const childBarPos = getBarPosition(child.start_date, child.due_date);
                                            const childProgress = child.status === 'done' ? 100 : child.progress;
                                            const childColor = child.type === 'subproject' ? '#8B5CF6' : STATUS_COLORS[child.status] || '#6B7280';
                                            const barHeight = child.type === 'task' ? 16 : 10;
                                            const barRadius = child.type === 'task' ? 8 : 5;
                                            const typeIcon = child.type === 'subproject'
                                                ? <FolderSpecialIcon sx={{ fontSize: 16, color: '#8B5CF6' }} />
                                                : <TaskAltIcon sx={{ fontSize: 16, color: STATUS_COLORS[child.status] }} />;

                                            return (
                                                <Box key={child.id} sx={{
                                                    display: 'flex', minHeight: 36, borderBottom: '1px solid #F3F4F6',
                                                    '&:hover': { bgcolor: '#FAFBFF' }, transition: 'background 0.1s',
                                                }}>
                                                    <Box sx={{
                                                        width: 300, minWidth: 300, flexShrink: 0,
                                                        display: 'flex', alignItems: 'center', gap: 0.5,
                                                        pl: child.type === 'task' ? 5 : 3.5, pr: 1,
                                                        borderRight: '1px solid #E5E7EB',
                                                    }}>
                                                        <Box sx={{ width: 22 }} />
                                                        {typeIcon}
                                                        <Typography variant="body2" sx={{
                                                            fontWeight: child.type === 'subproject' ? 700 : 500,
                                                            fontSize: '0.8rem', flexGrow: 1,
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            color: child.overdue ? '#EF4444' : '#1A1D29',
                                                        }}>
                                                            {child.name}
                                                        </Typography>
                                                        {child.overdue && (
                                                            <Tooltip title="Overdue">
                                                                <WarningAmberIcon sx={{ fontSize: 14, color: '#EF4444' }} />
                                                            </Tooltip>
                                                        )}
                                                        <Chip
                                                            label={STATUS_LABELS[child.status] || child.status}
                                                            size="small"
                                                            sx={{
                                                                height: 18, fontSize: '0.6rem', fontWeight: 600,
                                                                bgcolor: `${STATUS_COLORS[child.status]}15`,
                                                                color: STATUS_COLORS[child.status],
                                                            }}
                                                        />
                                                        <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem', minWidth: 32, textAlign: 'right' }}>
                                                            {childProgress || 0}%
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
                                                                        width: 1.5, bgcolor: '#EF4444', zIndex: 2, opacity: 0.4,
                                                                    }} />
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                        {/* Child bar */}
                                                        {childBarPos && (
                                                            <Tooltip title={`${child.name}: ${childProgress || 0}%`} arrow placement="top">
                                                                <Box sx={{
                                                                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                                                                    left: childBarPos.left, width: childBarPos.width,
                                                                    height: barHeight, bgcolor: '#E5E7EB',
                                                                    borderRadius: `${barRadius}px`,
                                                                    minWidth: 6, zIndex: 1, overflow: 'hidden',
                                                                    border: `1px solid ${childColor}30`,
                                                                }}>
                                                                    <Box sx={{
                                                                        width: `${childProgress || 0}%`, height: '100%',
                                                                        bgcolor: childColor,
                                                                        borderRadius: `${barRadius}px`,
                                                                        transition: 'width 0.5s ease',
                                                                        opacity: child.status === 'done' ? 0.7 : 0.9,
                                                                    }} />
                                                                    {child.type === 'task' && (
                                                                        <Typography sx={{
                                                                            position: 'absolute', top: '50%', left: '50%',
                                                                            transform: 'translate(-50%, -50%)',
                                                                            fontSize: '0.5rem', fontWeight: 700,
                                                                            color: (childProgress || 0) > 50 ? '#fff' : '#374151',
                                                                            lineHeight: 1, whiteSpace: 'nowrap',
                                                                            textShadow: (childProgress || 0) > 50 ? '0 0 2px rgba(0,0,0,0.3)' : 'none',
                                                                        }}>
                                                                            {childProgress || 0}%
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Collapse>
                                </React.Fragment>
                            );
                        })}
                    </Box>
                </Box>
            )}
        </Box>
    );
};

export default GlobalRoadmapPage;
