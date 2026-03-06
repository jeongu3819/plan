import React from 'react';
import { Paper, Typography, Box, Chip, Avatar, Tooltip } from '@mui/material';
import { Task } from '../../types';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FlagIcon from '@mui/icons-material/Flag';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useQuery } from '@tanstack/react-query';
import { api, User } from '../../api/client';

interface TaskCardProps {
    task: Task;
    onClick: () => void;
    style?: React.CSSProperties;
    compact?: boolean;
}

const statusColors: Record<string, string> = {
    todo: '#6B7280',
    in_progress: '#2955FF',
    done: '#22C55E',
    hold: '#F59E0B',
};

const priorityConfig: Record<string, { color: string; label: string }> = {
    low: { color: '#6B7280', label: 'Low' },
    medium: { color: '#3B82F6', label: 'Medium' },
    high: { color: '#EF4444', label: 'High' },
};

/** Remove first character (surname) and return the rest. If 1 char, return as-is. */
const shortName = (name: string): string => {
    if (!name) return '';
    return name.length <= 1 ? name : name.slice(1);
};

const MAX_DISPLAY = 3;

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, style, compact = false }) => {
    const priority = task.priority ? priorityConfig[task.priority] : null;

    const { data: users = [] } = useQuery<User[]>({
        queryKey: ['users'],
        queryFn: () => api.getUsers(),
    });

    // Resolve assignee names
    const assignees = (task.assignee_ids || [])
        .map(id => users.find(u => u.id === id))
        .filter((u): u is User => !!u);

    const displayAssignees = assignees.slice(0, MAX_DISPLAY);
    const remaining = assignees.length - MAX_DISPLAY;

    const assigneeLabel = displayAssignees.map(u => shortName(u.username)).join(' / ')
        + (remaining > 0 ? ` +${remaining}명` : '');

    const fullTooltip = assignees.map(u => u.username).join(', ');

    return (
        <Paper
            elevation={0}
            sx={{
                p: compact ? 1.2 : 2,
                mb: 1,
                cursor: 'pointer',
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.08)',
                bgcolor: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(4px)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                transition: 'all 0.15s ease',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                    borderColor: '#2955FF',
                    boxShadow: '0 4px 12px rgba(41, 85, 255, 0.12)',
                    transform: 'translateY(-2px)',
                },
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    bgcolor: statusColors[task.status] || '#6B7280',
                    borderRadius: '3px 0 0 3px',
                },
                ...style,
            }}
            onClick={onClick}
        >
            {/* Priority Flag */}
            {priority && task.priority !== 'medium' && (
                <Box sx={{ mb: 0.8 }}>
                    <Chip
                        icon={<FlagIcon sx={{ fontSize: '0.8rem !important' }} />}
                        label={priority.label}
                        size="small"
                        sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            bgcolor: `${priority.color}15`,
                            color: priority.color,
                            border: `1px solid ${priority.color}30`,
                            '& .MuiChip-icon': { color: priority.color },
                        }}
                    />
                </Box>
            )}

            {/* Title */}
            <Typography
                variant="body2"
                sx={{
                    fontWeight: 600,
                    fontSize: compact ? '0.8rem' : '0.875rem',
                    lineHeight: 1.4,
                    color: '#1A1D29',
                    mb: task.description || task.due_date ? 0.8 : 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {task.title}
            </Typography>

            {/* Description preview */}
            {!compact && task.description && (
                <Typography
                    variant="caption"
                    sx={{
                        color: '#9CA3AF',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 1,
                        fontSize: '0.75rem',
                    }}
                >
                    {task.description}
                </Typography>
            )}

            {/* Footer: Due date + Attachment indicator + Assignees */}
            {(task.due_date || assignees.length > 0 || (task as any).attachment_count > 0) && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {task.due_date && (
                            <Box sx={{
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                color: '#9CA3AF', fontSize: '0.7rem',
                            }}>
                                <AccessTimeIcon sx={{ fontSize: '0.8rem' }} />
                                <span>{task.due_date}</span>
                            </Box>
                        )}
                        {(task as any).attachment_count > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, color: '#9CA3AF', fontSize: '0.7rem' }}>
                                <AttachFileIcon sx={{ fontSize: '0.8rem' }} />
                                <span>{(task as any).attachment_count}</span>
                            </Box>
                        )}
                    </Box>
                    {assignees.length > 0 && (
                        <Tooltip title={fullTooltip} arrow>
                            <Box sx={{
                                display: 'flex', alignItems: 'center', gap: 0.5,
                                maxWidth: '55%',
                            }}>
                                <Avatar
                                    sx={{
                                        width: 20, height: 20, fontSize: '0.55rem',
                                        bgcolor: assignees[0]?.avatar_color || '#2955FF',
                                    }}
                                >
                                    {assignees[0]?.username?.charAt(0) || '?'}
                                </Avatar>
                                <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{
                                        fontSize: '0.7rem', color: '#6B7280', fontWeight: 500,
                                        maxWidth: '100%',
                                    }}
                                >
                                    {assigneeLabel}
                                </Typography>
                            </Box>
                        </Tooltip>
                    )}
                </Box>
            )}
        </Paper>
    );
};

export default TaskCard;
