import React from 'react';
import {
    Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography, Box, Chip, IconButton
} from '@mui/material';

import { api } from '../../api/client';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/useAppStore';
import QuickAdd from '../../components/QuickAdd';
import EditIcon from '@mui/icons-material/Edit';
import FlagIcon from '@mui/icons-material/Flag';

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

const ListView: React.FC<ListViewProps> = ({ projectId }) => {
    const openDrawer = useAppStore((state) => state.openDrawer);
    const currentUserId = useAppStore((state) => state.currentUserId);

    const { data: tasks, isLoading } = useQuery({
        queryKey: ['tasks', projectId, currentUserId],
        queryFn: () => api.getTasks(projectId, currentUserId),
    });

    if (isLoading) return <Typography>Loading...</Typography>;

    return (
        <Box>
            <QuickAdd projectId={projectId} />
            <TableContainer component={Paper} elevation={0} sx={{ mt: 1, border: '1px solid #E5E7EB', borderRadius: 2 }}>
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#FAFBFC' }}>
                            <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5 }}>Title</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 120 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 100 }}>Priority</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 120 }}>Due Date</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: '#374151', fontSize: '0.8rem', py: 1.5, width: 60 }}></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {tasks?.map((task) => {
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
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Box sx={{
                                                width: 6, height: 6, borderRadius: '50%',
                                                bgcolor: status.color, flexShrink: 0,
                                            }} />
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
                                                height: 24, fontSize: '0.7rem', fontWeight: 600,
                                                bgcolor: status.bgcolor, color: status.color,
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
