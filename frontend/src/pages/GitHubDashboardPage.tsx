import React, { useState } from 'react';
import {
    Box, Typography, Paper, Button, Chip, LinearProgress,
    CircularProgress, Alert, IconButton, Tooltip, Collapse,
} from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import SyncIcon from '@mui/icons-material/Sync';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { GitHubDashboardProject } from '../types';

const STATUS_COLORS: Record<string, string> = {
    done: '#22C55E',
    in_progress: '#F59E0B',
    todo: '#6B7280',
    hold: '#EF4444',
};

const STATUS_LABELS: Record<string, string> = {
    done: '완료',
    in_progress: '진행중',
    todo: '계획됨',
    hold: '보류',
};

const PRIORITY_COLORS: Record<string, string> = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#6B7280',
};

const GitHubDashboardPage: React.FC = () => {
    const queryClient = useQueryClient();

    const { data: authStatus } = useQuery({
        queryKey: ['github-auth'],
        queryFn: () => api.getGitHubAuthStatus(),
    });

    const { data: dashboard, isLoading } = useQuery({
        queryKey: ['github-dashboard'],
        queryFn: () => api.getGitHubDashboard(),
    });

    const projects = dashboard?.projects ?? [];

    return (
        <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <GitHubIcon sx={{ fontSize: '2rem', color: '#24292F' }} />
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D29', letterSpacing: '-0.02em' }}>
                            GitHub 개발 현황
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
                            연결된 프로젝트의 Issue, PR, Milestone 현황
                        </Typography>
                    </Box>
                </Box>
                {authStatus && (
                    <Chip
                        label={authStatus.authenticated ? `${authStatus.username}` : '미인증'}
                        size="small"
                        sx={{
                            bgcolor: authStatus.authenticated ? '#ECFDF5' : '#FEF2F2',
                            color: authStatus.authenticated ? '#059669' : '#DC2626',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                        }}
                    />
                )}
            </Box>

            {!authStatus?.authenticated && (
                <Alert severity="warning" sx={{ mb: 3, fontSize: '0.85rem' }}>
                    {authStatus?.message || "GitHub CLI 인증이 필요합니다. 서버에서 'gh auth login'을 실행해주세요."}
                </Alert>
            )}

            {isLoading && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" sx={{ mt: 2, color: '#6B7280' }}>로딩 중...</Typography>
                </Box>
            )}

            {!isLoading && projects.length === 0 && (
                <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, border: '1px solid #E5E7EB' }}>
                    <GitHubIcon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#6B7280', mb: 1 }}>
                        연결된 GitHub repo가 없습니다
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
                        프로젝트 설정에서 GitHub Repository를 연결해주세요.
                    </Typography>
                </Paper>
            )}

            {projects.map((proj) => (
                <ProjectCard key={proj.project_id} project={proj} queryClient={queryClient} />
            ))}
        </Box>
    );
};

const ProjectCard: React.FC<{ project: GitHubDashboardProject; queryClient: any }> = ({ project, queryClient }) => {
    const [expanded, setExpanded] = useState(true);
    const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const syncMutation = useMutation({
        mutationFn: () => api.syncGitHub(project.project_id),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['github-dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            setSyncMsg({ type: 'success', text: result.message });
            setTimeout(() => setSyncMsg(null), 5000);
        },
        onError: (err: any) => {
            setSyncMsg({ type: 'error', text: err?.response?.data?.detail || '동기화 실패' });
        },
    });

    const statusMutation = useMutation({
        mutationFn: () => api.getGitHubProjectStatus(project.project_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['github-dashboard'] });
        },
    });

    const doneTasks = project.tasks.filter(t => t.status === 'done');
    const inProgressTasks = project.tasks.filter(t => t.status === 'in_progress');
    const todoTasks = project.tasks.filter(t => t.status === 'todo');
    const holdTasks = project.tasks.filter(t => t.status === 'hold');

    return (
        <Paper sx={{
            mb: 3, borderRadius: 3,
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden',
        }}>
            {/* Project Header */}
            <Box sx={{
                px: 3, py: 2,
                bgcolor: '#FAFBFC',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                    <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ color: '#6B7280' }}>
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1A1D29' }} noWrap>
                            {project.project_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.75rem' }}>
                            {project.repo}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                        label={`${project.progress}%`}
                        size="small"
                        sx={{
                            bgcolor: project.progress >= 100 ? '#ECFDF5' : project.progress > 0 ? '#FEF9C3' : '#F3F4F6',
                            color: project.progress >= 100 ? '#059669' : project.progress > 0 ? '#D97706' : '#6B7280',
                            fontWeight: 700, fontSize: '0.75rem',
                        }}
                    />
                    <Tooltip title="GitHub에서 열기">
                        <IconButton
                            size="small"
                            onClick={() => window.open(`https://github.com/${project.repo}`, '_blank')}
                            sx={{ color: '#6B7280' }}
                        >
                            <OpenInNewIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="최신 상태 가져오기">
                        <IconButton
                            size="small"
                            onClick={() => statusMutation.mutate()}
                            disabled={statusMutation.isPending}
                            sx={{ color: '#6B7280' }}
                        >
                            {statusMutation.isPending ? <CircularProgress size={16} /> : <SyncIcon sx={{ fontSize: '1.1rem' }} />}
                        </IconButton>
                    </Tooltip>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={syncMutation.isPending ? <CircularProgress size={14} /> : <SyncIcon />}
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                        sx={{ fontWeight: 600, fontSize: '0.75rem', borderColor: '#2955FF', color: '#2955FF' }}
                    >
                        {syncMutation.isPending ? '동기화 중...' : '동기화'}
                    </Button>
                </Box>
            </Box>

            {syncMsg && (
                <Alert severity={syncMsg.type} sx={{ mx: 2, mt: 1, fontSize: '0.8rem' }} onClose={() => setSyncMsg(null)}>
                    {syncMsg.text}
                </Alert>
            )}

            <Collapse in={expanded}>
                <Box sx={{ p: 3 }}>
                    {/* Progress Bar */}
                    <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                                진행률
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                                {project.status_counts.done}/{project.total}
                            </Typography>
                        </Box>
                        <LinearProgress
                            variant="determinate"
                            value={project.progress}
                            sx={{
                                height: 8, borderRadius: 4,
                                bgcolor: '#F3F4F6',
                                '& .MuiLinearProgress-bar': {
                                    borderRadius: 4,
                                    bgcolor: project.progress >= 100 ? '#22C55E' : '#2955FF',
                                },
                            }}
                        />
                    </Box>

                    {/* Milestones */}
                    {project.milestones.length > 0 && (
                        <Box sx={{ mb: 3 }}>
                            {project.milestones.map(ms => {
                                const msTotal = ms.open_issues + ms.closed_issues;
                                const msProgress = msTotal > 0 ? Math.round(ms.closed_issues / msTotal * 100) : 0;
                                return (
                                    <Box key={ms.number} sx={{
                                        display: 'flex', alignItems: 'center', gap: 1.5,
                                        py: 1, px: 2, mb: 1,
                                        bgcolor: '#F9FAFB', borderRadius: 2,
                                        border: '1px solid #F3F4F6',
                                    }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#374151', minWidth: 0, flex: 1 }} noWrap>
                                            Milestone: {ms.title}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <LinearProgress
                                                variant="determinate"
                                                value={msProgress}
                                                sx={{
                                                    width: 100, height: 6, borderRadius: 3,
                                                    bgcolor: '#E5E7EB',
                                                    '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: '#8B5CF6' },
                                                }}
                                            />
                                            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                                {ms.closed_issues}/{msTotal} ({msProgress}%)
                                            </Typography>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}

                    {/* Status Summary Chips */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
                        {[
                            { key: 'done', count: doneTasks.length },
                            { key: 'in_progress', count: inProgressTasks.length },
                            { key: 'todo', count: todoTasks.length },
                            { key: 'hold', count: holdTasks.length },
                        ].filter(s => s.count > 0).map(s => (
                            <Chip
                                key={s.key}
                                label={`${STATUS_LABELS[s.key]} (${s.count})`}
                                size="small"
                                sx={{
                                    bgcolor: `${STATUS_COLORS[s.key]}15`,
                                    color: STATUS_COLORS[s.key],
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                }}
                            />
                        ))}
                    </Box>

                    {/* Task List */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {project.tasks.map(task => (
                            <Box key={task.id} sx={{
                                display: 'flex', alignItems: 'center', gap: 1.5,
                                py: 1, px: 1.5, borderRadius: 1.5,
                                '&:hover': { bgcolor: '#F9FAFB' },
                                transition: 'background 0.1s',
                            }}>
                                {task.status === 'done' ? (
                                    <CheckCircleOutlineIcon sx={{ fontSize: '1rem', color: '#22C55E' }} />
                                ) : (
                                    <RadioButtonUncheckedIcon sx={{ fontSize: '1rem', color: STATUS_COLORS[task.status] || '#6B7280' }} />
                                )}
                                {task.github_issue_number && (
                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 600, fontSize: '0.7rem', minWidth: 28 }}>
                                        #{task.github_issue_number}
                                    </Typography>
                                )}
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontSize: '0.83rem',
                                        color: task.status === 'done' ? '#9CA3AF' : '#374151',
                                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                                        flex: 1, minWidth: 0,
                                    }}
                                    noWrap
                                >
                                    {task.title}
                                </Typography>
                                <Chip
                                    label={STATUS_LABELS[task.status] || task.status}
                                    size="small"
                                    sx={{
                                        height: 20, fontSize: '0.6rem', fontWeight: 700,
                                        bgcolor: `${STATUS_COLORS[task.status] || '#6B7280'}15`,
                                        color: STATUS_COLORS[task.status] || '#6B7280',
                                    }}
                                />
                                {task.priority && task.priority !== 'medium' && (
                                    <Chip
                                        label={task.priority}
                                        size="small"
                                        sx={{
                                            height: 20, fontSize: '0.6rem', fontWeight: 700,
                                            bgcolor: `${PRIORITY_COLORS[task.priority] || '#6B7280'}15`,
                                            color: PRIORITY_COLORS[task.priority] || '#6B7280',
                                        }}
                                    />
                                )}
                                {task.due_date && (
                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                        {task.due_date.slice(5)}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                    </Box>

                    {project.tasks.length === 0 && (
                        <Box sx={{ textAlign: 'center', py: 3 }}>
                            <Typography variant="body2" sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
                                동기화된 Task가 없습니다. [동기화] 버튼을 눌러주세요.
                            </Typography>
                        </Box>
                    )}

                    {/* Pull Requests */}
                    {project.pull_requests.length > 0 && (
                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #F3F4F6' }}>
                            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Pull Requests
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                                {project.pull_requests.slice(0, 10).map(pr => (
                                    <Chip
                                        key={pr.number}
                                        label={`#${pr.number} ${pr.merged ? 'merged' : pr.state}${pr.merged_at ? ' ' + pr.merged_at.slice(5, 10) : ''}`}
                                        size="small"
                                        clickable
                                        onClick={() => window.open(pr.html_url, '_blank')}
                                        sx={{
                                            height: 24, fontSize: '0.7rem', fontWeight: 600,
                                            bgcolor: pr.merged ? '#F3E8FF' : pr.state === 'open' ? '#ECFDF5' : '#F3F4F6',
                                            color: pr.merged ? '#7C3AED' : pr.state === 'open' ? '#059669' : '#6B7280',
                                        }}
                                    />
                                ))}
                            </Box>
                        </Box>
                    )}

                    {/* Cache info */}
                    {project.cached_at && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#D1D5DB', fontSize: '0.65rem', textAlign: 'right' }}>
                            마지막 캐시: {new Date(project.cached_at).toLocaleString('ko-KR')}
                        </Typography>
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
};

export default GitHubDashboardPage;
