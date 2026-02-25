import React, { useState, useMemo } from 'react';
import { Box, Typography, IconButton, Tooltip, Chip, Paper } from '@mui/material';

import { api } from '../../api/client';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    isSameDay, isToday, getDay, addMonths, subMonths
} from 'date-fns';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FlagIcon from '@mui/icons-material/Flag';
import EditIcon from '@mui/icons-material/Edit';

interface CalendarViewProps {
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

const priorityConfig: Record<string, { label: string; color: string }> = {
    low: { label: 'Low', color: '#6B7280' },
    medium: { label: 'Medium', color: '#3B82F6' },
    high: { label: 'High', color: '#EF4444' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Korean Public Holidays (2025–2027) ──
const KOREAN_HOLIDAYS: Record<string, string> = {
    // 2025
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
    // 2026
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
    // 2027
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

const CalendarView: React.FC<CalendarViewProps> = ({ projectId }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const openDrawer = useAppStore((state) => state.openDrawer);
    const currentUserId = useAppStore((state) => state.currentUserId);

    const { data: tasks, isLoading } = useQuery({
        queryKey: ['tasks', projectId, currentUserId],
        queryFn: () => api.getTasks(projectId, currentUserId),
    });

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad start of month
    const startPadding = getDay(monthStart);
    // Pad end of month to fill last row
    const endPadding = (7 - ((startPadding + days.length) % 7)) % 7;

    // Tasks for the selected date
    const selectedDayTasks = useMemo(() => {
        if (!selectedDate || !tasks) return [];
        return tasks.filter(t => t.due_date && isSameDay(new Date(t.due_date), selectedDate));
    }, [selectedDate, tasks]);

    if (isLoading) return <Typography>Loading...</Typography>;

    return (
        <Box>
            {/* Month Navigation */}
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                mb: 2, px: 1,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton size="small" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <ChevronLeftIcon />
                    </IconButton>
                    <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 180, textAlign: 'center' }}>
                        {format(currentMonth, 'MMMM yyyy')}
                    </Typography>
                    <IconButton size="small" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <ChevronRightIcon />
                    </IconButton>
                </Box>
                <Typography
                    variant="body2"
                    sx={{
                        color: '#2955FF', cursor: 'pointer', fontWeight: 600,
                        '&:hover': { textDecoration: 'underline' },
                    }}
                    onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()); }}
                >
                    Today
                </Typography>
            </Box>

            {/* Weekday Headers */}
            <Box sx={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 0,
                borderBottom: '2px solid #E5E7EB',
                mb: 0,
            }}>
                {WEEKDAYS.map((d, i) => (
                    <Box key={d} sx={{
                        textAlign: 'center', py: 1,
                        fontWeight: 700, fontSize: '0.75rem',
                        color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#6B7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {d}
                    </Box>
                ))}
            </Box>

            {/* Calendar Grid — compact, dots only */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 0,
            }}>
                {/* Empty padding cells */}
                {Array.from({ length: startPadding }).map((_, i) => (
                    <Box key={`pad-${i}`} sx={{
                        minHeight: 64,
                        border: '1px solid #F3F4F6',
                        bgcolor: '#FAFBFC',
                    }} />
                ))}

                {/* Day cells */}
                {days.map((day) => {
                    const dayTasks = tasks?.filter(
                        (t) => t.due_date && isSameDay(new Date(t.due_date), day)
                    ) || [];
                    const isCurrentDay = isToday(day);
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const holiday = KOREAN_HOLIDAYS[dateKey];
                    const isSunday = getDay(day) === 0;
                    const isSaturday = getDay(day) === 6;
                    const isSelected = selectedDate && isSameDay(day, selectedDate);

                    return (
                        <Box
                            key={day.toISOString()}
                            onClick={() => setSelectedDate(day)}
                            sx={{
                                minHeight: 64,
                                border: '1px solid #F3F4F6',
                                p: 0.6,
                                cursor: 'pointer',
                                bgcolor: isSelected ? '#EEF2FF' : isCurrentDay ? '#FAFBFF' : holiday ? '#FFF5F5' : '#fff',
                                outline: isSelected ? '2px solid #2955FF' : 'none',
                                outlineOffset: -2,
                                borderRadius: isSelected ? 1 : 0,
                                transition: 'all 0.1s',
                                '&:hover': { bgcolor: isSelected ? '#E0E7FF' : '#F8F9FF' },
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                            }}
                        >
                            {/* Date Number */}
                            <Box sx={{
                                width: isCurrentDay ? 26 : 'auto',
                                height: isCurrentDay ? 26 : 'auto',
                                borderRadius: '50%',
                                bgcolor: isCurrentDay ? '#2955FF' : 'transparent',
                                color: isCurrentDay ? '#fff' : holiday || isSunday ? '#EF4444' : isSaturday ? '#3B82F6' : '#374151',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.8rem',
                                fontWeight: isCurrentDay ? 700 : 500,
                                mb: 0.3,
                            }}>
                                {format(day, 'd')}
                            </Box>

                            {/* Holiday label */}
                            {holiday && (
                                <Tooltip title={holiday} arrow>
                                    <Typography sx={{
                                        fontSize: '0.5rem', fontWeight: 700,
                                        color: '#EF4444', lineHeight: 1,
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap', maxWidth: '100%',
                                        cursor: 'default', mb: 0.3,
                                    }}>
                                        {holiday}
                                    </Typography>
                                </Tooltip>
                            )}

                            {/* Task dots */}
                            {dayTasks.length > 0 && (
                                <Tooltip
                                    title={`${dayTasks.length}개 task`}
                                    arrow
                                    placement="top"
                                >
                                    <Box sx={{ display: 'flex', gap: 0.3, flexWrap: 'wrap', justifyContent: 'center', mt: 'auto' }}>
                                        {dayTasks.slice(0, 5).map((t) => (
                                            <Box key={t.id} sx={{
                                                width: 7, height: 7, borderRadius: '50%',
                                                bgcolor: statusColors[t.status] || '#6B7280',
                                            }} />
                                        ))}
                                        {dayTasks.length > 5 && (
                                            <Typography sx={{ fontSize: '0.55rem', color: '#9CA3AF', fontWeight: 600, lineHeight: '7px' }}>
                                                +{dayTasks.length - 5}
                                            </Typography>
                                        )}
                                    </Box>
                                </Tooltip>
                            )}
                        </Box>
                    );
                })}

                {/* End padding cells */}
                {Array.from({ length: endPadding }).map((_, i) => (
                    <Box key={`epad-${i}`} sx={{
                        minHeight: 64,
                        border: '1px solid #F3F4F6',
                        bgcolor: '#FAFBFC',
                    }} />
                ))}
            </Box>

            {/* ── Selected Date Task List ── */}
            <Box sx={{ mt: 2 }}>
                {selectedDate ? (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1A1D29' }}>
                                {format(selectedDate, 'yyyy년 M월 d일 (EEE)')}
                            </Typography>
                            {selectedDayTasks.length > 0 && (
                                <Chip
                                    label={`${selectedDayTasks.length}개`}
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#EEF2FF', color: '#2955FF' }}
                                />
                            )}
                        </Box>

                        {selectedDayTasks.length === 0 ? (
                            <Paper sx={{ p: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #F3F4F6' }} elevation={0}>
                                <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                                    이 날짜에 예정된 Task가 없습니다
                                </Typography>
                            </Paper>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {selectedDayTasks.map((t) => {
                                    const color = statusColors[t.status] || '#6B7280';
                                    const priority = t.priority ? priorityConfig[t.priority] : null;
                                    return (
                                        <Paper
                                            key={t.id}
                                            onClick={() => openDrawer(t, projectId)}
                                            sx={{
                                                display: 'flex', alignItems: 'center', gap: 1.5,
                                                px: 2, py: 1.5,
                                                borderRadius: 2, border: '1px solid #E5E7EB',
                                                borderLeft: `4px solid ${color}`,
                                                cursor: 'pointer', transition: 'all 0.15s',
                                                '&:hover': { borderColor: '#C7D2FE', boxShadow: '0 2px 8px rgba(41,85,255,0.06)', transform: 'translateX(2px)' },
                                            }}
                                            elevation={0}
                                        >
                                            {/* Status dot */}
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />

                                            {/* Title */}
                                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.88rem', flexGrow: 1, color: '#1A1D29' }}>
                                                {t.title}
                                            </Typography>

                                            {/* Priority */}
                                            {priority && (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, color: priority.color, flexShrink: 0 }}>
                                                    <FlagIcon sx={{ fontSize: 14 }} />
                                                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                                                        {priority.label}
                                                    </Typography>
                                                </Box>
                                            )}

                                            {/* Status chip */}
                                            <Chip
                                                label={statusLabels[t.status] || t.status}
                                                size="small"
                                                sx={{
                                                    height: 22, fontSize: '0.68rem', fontWeight: 600,
                                                    bgcolor: `${color}15`, color: color,
                                                    flexShrink: 0,
                                                }}
                                            />

                                            {/* Edit icon */}
                                            <IconButton size="small" sx={{ color: '#C0C4CC', flexShrink: 0, '&:hover': { color: '#2955FF' } }}>
                                                <EditIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Paper>
                                    );
                                })}
                            </Box>
                        )}
                    </>
                ) : (
                    <Paper sx={{ p: 3, textAlign: 'center', borderRadius: 2, border: '1px solid #F3F4F6' }} elevation={0}>
                        <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                            날짜를 클릭하면 해당 날짜의 Task를 확인할 수 있습니다
                        </Typography>
                    </Paper>
                )}
            </Box>
        </Box>
    );
};

export default CalendarView;
