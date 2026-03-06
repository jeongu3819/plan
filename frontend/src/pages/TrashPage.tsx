import {
    Typography, Box, Button, Paper, List, ListItem,
    ListItemText, Chip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreIcon from '@mui/icons-material/Restore';
import FolderIcon from '@mui/icons-material/Folder';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const PURGE_DAYS = 3;

/** 남은 시간 계산 */
const remainingText = (archivedAt: string): string => {
    if (!archivedAt) return '';
    const deleted = new Date(archivedAt);
    const purgeAt = new Date(deleted.getTime() + PURGE_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diffMs = purgeAt.getTime() - now.getTime();
    if (diffMs <= 0) return '곧 영구삭제';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `${hours}시간 후 영구삭제`;
    const days = Math.ceil(hours / 24);
    return `${days}일 후 영구삭제`;
};

const TrashPage = () => {
    const queryClient = useQueryClient();

    const { data: trash } = useQuery({
        queryKey: ['trash'],
        queryFn: () => api.getTrash(),
    });

    const archivedProjects = trash?.projects || [];
    const archivedTasks = trash?.tasks || [];
    const isEmpty = archivedProjects.length === 0 && archivedTasks.length === 0;

    const restoreProjectMut = useMutation({
        mutationFn: (id: number) => api.restoreProject(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trash'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
        },
    });

    const restoreTaskMut = useMutation({
        mutationFn: (id: number) => api.restoreTask(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['trash'] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
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
                        삭제된 항목은 {PURGE_DAYS}일 후 자동 영구삭제됩니다. 그 전에 복원할 수 있습니다.
                    </Typography>
                </Box>
            </Box>

            {isEmpty ? (
                <Paper sx={{
                    p: 6, textAlign: 'center', borderRadius: 3,
                    border: '1px solid #E5E7EB',
                }} elevation={0}>
                    <DeleteOutlineIcon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 2 }} />
                    <Typography variant="body1" sx={{ color: '#6B7280', mb: 0.5 }}>
                        휴지통이 비어있습니다
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                        삭제된 프로젝트와 태스크가 여기에 표시됩니다.
                    </Typography>
                </Paper>
            ) : (
                <>
                    {/* Archived Projects */}
                    {archivedProjects.length > 0 && (
                        <Paper sx={{ borderRadius: 3, border: '1px solid #E5E7EB', overflow: 'hidden', mb: 3 }} elevation={0}>
                            <Box sx={{ px: 3, py: 1.5, bgcolor: '#FEF2F2', display: 'flex', alignItems: 'center', gap: 1 }}>
                                <FolderIcon sx={{ fontSize: '1rem', color: '#EF4444' }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#DC2626', fontSize: '0.85rem' }}>
                                    삭제된 프로젝트
                                </Typography>
                                <Chip label={`${archivedProjects.length}개`} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#FECACA', color: '#DC2626' }} />
                            </Box>
                            <List disablePadding>
                                {archivedProjects.map((p: any, index: number) => (
                                    <ListItem
                                        key={p.id}
                                        divider={index < archivedProjects.length - 1}
                                        secondaryAction={
                                            <Button
                                                size="small"
                                                startIcon={<RestoreIcon />}
                                                onClick={() => restoreProjectMut.mutate(p.id)}
                                                disabled={restoreProjectMut.isPending}
                                                sx={{ color: '#2955FF', fontWeight: 600 }}
                                            >
                                                복원
                                            </Button>
                                        }
                                        sx={{ px: 3, py: 1.5 }}
                                    >
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#6B7280', textDecoration: 'line-through' }}>
                                                        {p.name}
                                                    </Typography>
                                                    {p.task_count > 0 && (
                                                        <Chip label={`태스크 ${p.task_count}개`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#F3F4F6', color: '#6B7280' }} />
                                                    )}
                                                </Box>
                                            }
                                            secondary={
                                                <Box sx={{ display: 'flex', gap: 1, mt: 0.3 }}>
                                                    <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                                                        삭제: {p.archived_at ? new Date(p.archived_at).toLocaleDateString() : ''}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 600 }}>
                                                        {remainingText(p.archived_at)}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Paper>
                    )}

                    {/* Archived Tasks (individually deleted, project still active) */}
                    {archivedTasks.length > 0 && (
                        <Paper sx={{ borderRadius: 3, border: '1px solid #E5E7EB', overflow: 'hidden' }} elevation={0}>
                            <Box sx={{ px: 3, py: 1.5, bgcolor: '#FFF7ED', display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AssignmentIcon sx={{ fontSize: '1rem', color: '#F59E0B' }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#D97706', fontSize: '0.85rem' }}>
                                    삭제된 태스크
                                </Typography>
                                <Chip label={`${archivedTasks.length}개`} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#FDE68A', color: '#D97706' }} />
                            </Box>
                            <List disablePadding>
                                {archivedTasks.map((task: any, index: number) => (
                                    <ListItem
                                        key={task.id}
                                        divider={index < archivedTasks.length - 1}
                                        secondaryAction={
                                            <Button
                                                size="small"
                                                startIcon={<RestoreIcon />}
                                                onClick={() => restoreTaskMut.mutate(task.id)}
                                                disabled={restoreTaskMut.isPending}
                                                sx={{ color: '#2955FF', fontWeight: 600 }}
                                            >
                                                복원
                                            </Button>
                                        }
                                        sx={{ px: 3, py: 1.5 }}
                                    >
                                        <ListItemText
                                            primary={task.title}
                                            secondary={
                                                <Box sx={{ display: 'flex', gap: 1, mt: 0.3 }}>
                                                    <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                                                        삭제: {task.archived_at ? new Date(task.archived_at).toLocaleDateString() : ''}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 600 }}>
                                                        {remainingText(task.archived_at)}
                                                    </Typography>
                                                </Box>
                                            }
                                            primaryTypographyProps={{ fontWeight: 500, fontSize: '0.9rem', color: '#6B7280', sx: { textDecoration: 'line-through' } }}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Paper>
                    )}
                </>
            )}
        </Box>
    );
};

export default TrashPage;
