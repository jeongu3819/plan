import {
    Typography, Box, Button, Paper, List, ListItem,
    ListItemText
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreIcon from '@mui/icons-material/Restore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Task } from '../types';
import axios from 'axios';

const TrashPage = () => {
    const queryClient = useQueryClient();

    // Fetch all data and filter archived tasks
    const { data: allData } = useQuery({
        queryKey: ['allData'],
        queryFn: () => axios.get('http://localhost:8000/api/data').then(res => res.data),
    });

    const archivedTasks: Task[] = allData?.tasks?.filter((t: Task) => t.archived_at) || [];

    const restoreMutation = useMutation({
        mutationFn: (taskId: number) => api.restoreTask(taskId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['allData'] });
        },
    });

    return (
        <Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <DeleteOutlineIcon sx={{ color: '#EF4444', fontSize: '1.8rem' }} />
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1D29' }}>
                        Trash
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        Deleted tasks can be restored or permanently removed.
                    </Typography>
                </Box>
            </Box>

            {archivedTasks.length === 0 ? (
                <Paper sx={{
                    p: 6, textAlign: 'center', borderRadius: 3,
                    border: '1px solid #E5E7EB',
                }} elevation={0}>
                    <DeleteOutlineIcon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 2 }} />
                    <Typography variant="body1" sx={{ color: '#6B7280', mb: 0.5 }}>
                        Trash is empty
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                        Deleted tasks will appear here for recovery.
                    </Typography>
                </Paper>
            ) : (
                <Paper sx={{ borderRadius: 3, border: '1px solid #E5E7EB', overflow: 'hidden' }} elevation={0}>
                    <List disablePadding>
                        {archivedTasks.map((task, index) => (
                            <ListItem
                                key={task.id}
                                divider={index < archivedTasks.length - 1}
                                secondaryAction={
                                    <Button
                                        size="small"
                                        startIcon={<RestoreIcon />}
                                        onClick={() => restoreMutation.mutate(task.id)}
                                        sx={{ color: '#2955FF', fontWeight: 600 }}
                                    >
                                        Restore
                                    </Button>
                                }
                                sx={{ px: 3, py: 1.5 }}
                            >
                                <ListItemText
                                    primary={task.title}
                                    secondary={`Deleted: ${task.archived_at ? new Date(task.archived_at).toLocaleDateString() : ''}`}
                                    primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem', color: '#6B7280', sx: { textDecoration: 'line-through' } }}
                                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                                />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            )}
        </Box>
    );
};

export default TrashPage;
