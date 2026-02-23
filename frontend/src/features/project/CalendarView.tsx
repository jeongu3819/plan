import React, { useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';

import { api } from '../../api/client';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval,
    isSameDay, isToday, getDay, addMonths, subMonths
} from 'date-fns';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface CalendarViewProps {
    projectId: number;
}

const statusColors: Record<string, string> = {
    todo: '#6B7280',
    in_progress: '#2955FF',
    done: '#22C55E',
    hold: '#F59E0B',
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
                    onClick={() => setCurrentMonth(new Date())}
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

            {/* Calendar Grid */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 0,
            }}>
                {/* Empty padding cells */}
                {Array.from({ length: startPadding }).map((_, i) => (
                    <Box key={`pad-${i}`} sx={{
                        minHeight: 110,
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

                    return (
                        <Box
                            key={day.toISOString()}
                            sx={{
                                minHeight: 110,
                                border: '1px solid #F3F4F6',
                                p: 0.8,
                                bgcolor: isCurrentDay ? '#EEF2FF' : holiday ? '#FFF5F5' : '#fff',
                                transition: 'background-color 0.15s',
                                '&:hover': { bgcolor: isCurrentDay ? '#E0E7FF' : '#F8F9FF' },
                            }}
                        >
                            {/* Date Number */}
                            <Box sx={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5,
                            }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <Box sx={{
                                        width: isCurrentDay ? 26 : 'auto',
                                        height: isCurrentDay ? 26 : 'auto',
                                        borderRadius: '50%',
                                        bgcolor: isCurrentDay ? '#2955FF' : 'transparent',
                                        color: isCurrentDay ? '#fff' : holiday || isSunday ? '#EF4444' : isSaturday ? '#3B82F6' : '#374151',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.8rem',
                                        fontWeight: isCurrentDay ? 700 : 500,
                                    }}>
                                        {format(day, 'd')}
                                    </Box>
                                </Box>
                                {holiday && (
                                    <Tooltip title={holiday} arrow>
                                        <Typography sx={{
                                            fontSize: '0.58rem', fontWeight: 700,
                                            color: '#EF4444', lineHeight: 1.2,
                                            maxWidth: 60, textAlign: 'right',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap', cursor: 'default',
                                        }}>
                                            {holiday}
                                        </Typography>
                                    </Tooltip>
                                )}
                            </Box>

                            {/* Tasks */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                {dayTasks.slice(0, 3).map((t) => (
                                    <Box
                                        key={t.id}
                                        onClick={() => openDrawer(t, projectId)}
                                        sx={{
                                            px: 0.8, py: 0.3,
                                            bgcolor: `${statusColors[t.status]}15`,
                                            borderLeft: `2px solid ${statusColors[t.status] || '#6B7280'}`,
                                            borderRadius: '0 4px 4px 0',
                                            cursor: 'pointer',
                                            fontSize: '0.7rem',
                                            fontWeight: 500,
                                            color: '#374151',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.1s',
                                            '&:hover': {
                                                bgcolor: `${statusColors[t.status]}25`,
                                            },
                                        }}
                                    >
                                        {t.title}
                                    </Box>
                                ))}
                                {dayTasks.length > 3 && (
                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem', pl: 0.8 }}>
                                        +{dayTasks.length - 3} more
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    );
                })}

                {/* End padding cells */}
                {Array.from({ length: endPadding }).map((_, i) => (
                    <Box key={`epad-${i}`} sx={{
                        minHeight: 110,
                        border: '1px solid #F3F4F6',
                        bgcolor: '#FAFBFC',
                    }} />
                ))}
            </Box>
        </Box>
    );
};

export default CalendarView;
