import React, { useState } from 'react';
import {
    Box, Typography, Paper, Button, Avatar, IconButton,
    Divider, Switch, FormControlLabel, Select, FormControl,
    InputLabel, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, Checkbox, Tooltip, TextField, CircularProgress,
    Alert,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SecurityIcon from '@mui/icons-material/Security';
import GroupIcon from '@mui/icons-material/Group';
import GitHubIcon from '@mui/icons-material/GitHub';
import SyncIcon from '@mui/icons-material/Sync';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, User } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';

interface ProjectSettingsViewProps {
    projectId: number;
}

const ProjectSettingsView: React.FC<ProjectSettingsViewProps> = ({ projectId }) => {
    const queryClient = useQueryClient();
    const currentUserId = useAppStore((state) => state.currentUserId);

    // Fetch data
    const { data: members = [] } = useQuery<any[]>({
        queryKey: ['projectMembers', projectId],
        queryFn: async () => {
            const res = await api.getProjectMembers(projectId);
            return res;
        },
    });

    const { data: users = [] } = useQuery<User[]>({
        queryKey: ['users'],
        queryFn: () => api.getUsers(),
    });

    const { data: projects = [] } = useQuery<any[]>({
        queryKey: ['projects', currentUserId],
        queryFn: () => api.getProjects(currentUserId),
    });

    const project = projects.find((p: any) => p.id === projectId);

    // State
    const [addMemberOpen, setAddMemberOpen] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [requireApproval, setRequireApproval] = useState(project?.require_approval ?? false);
    const [permissions, setPermissions] = useState<Record<string, string>>(
        project?.permissions ?? {
            post_write: 'all', post_edit: 'all', post_view: 'all',
            comment_write: 'all', file_view: 'all', file_download: 'all',
        }
    );

    // GitHub state
    const [githubRepo, setGithubRepo] = useState(project?.github_repo ?? '');
    const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Sync state when project data loads
    React.useEffect(() => {
        if (project) {
            setRequireApproval(project.require_approval ?? false);
            setPermissions(project.permissions ?? {
                post_write: 'all', post_edit: 'all', post_view: 'all',
                comment_write: 'all', file_view: 'all', file_download: 'all',
            });
            setGithubRepo(project.github_repo ?? '');
        }
    }, [project]);

    // Mutations
    const addMemberMutation = useMutation({
        mutationFn: (userId: number) => api.addProjectMember(projectId, userId, 'member'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
        },
    });

    const removeMemberMutation = useMutation({
        mutationFn: (userId: number) => api.removeProjectMember(projectId, userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });

    const updateProjectMutation = useMutation({
        mutationFn: (updates: Record<string, any>) => api.updateProject(projectId, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });

    const saveGithubRepoMutation = useMutation({
        mutationFn: (repo: string) => api.updateProject(projectId, { github_repo: repo } as any),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setSyncMessage({ type: 'success', text: 'GitHub repo 저장 완료' });
            setTimeout(() => setSyncMessage(null), 3000);
        },
        onError: (err: any) => {
            setSyncMessage({ type: 'error', text: err?.response?.data?.detail || 'repo 저장 실패' });
        },
    });

    const [syncErrors, setSyncErrors] = useState<string[]>([]);

    const syncGithubMutation = useMutation({
        mutationFn: () => api.syncGitHub(projectId),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            setSyncMessage({ type: result.errors?.length ? 'warning' as any : 'success', text: result.message });
            setSyncErrors(result.errors || []);
            setTimeout(() => setSyncMessage(null), 5000);
        },
        onError: (err: any) => {
            setSyncMessage({ type: 'error', text: err?.response?.data?.detail || '동기화 실패' });
            setSyncErrors([]);
        },
    });

    const handleSaveGithubRepo = () => {
        saveGithubRepoMutation.mutate(githubRepo.trim());
    };

    const handleSavePermissions = () => {
        updateProjectMutation.mutate({ require_approval: requireApproval, permissions });
    };

    const handleAddMembers = () => {
        selectedUserIds.forEach(uid => addMemberMutation.mutate(uid));
        setSelectedUserIds([]);
        setAddMemberOpen(false);
    };

    const memberUserIds = new Set(members.map((m: any) => m.user_id));
    const availableUsers = users.filter(u => !memberUserIds.has(u.id));
    const isOwner = project?.owner_id === currentUserId;
    const currentUserObj = users.find(u => u.id === currentUserId);
    const isAdmin = currentUserObj?.role === 'admin';
    const canManage = isOwner || isAdmin;

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', py: 2 }}>
            {/* ─── GitHub Integration Section ─── */}
            <Paper sx={{
                p: 3, mb: 3, borderRadius: 3,
                border: '1px solid #E5E7EB',
                boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                    <GitHubIcon sx={{ color: '#24292F', fontSize: '1.3rem' }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D29' }}>
                        GitHub 연동
                    </Typography>
                </Box>

                <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem', mb: 2 }}>
                    GitHub Repository를 연결하면 Issue/Task를 양방향 동기화할 수 있습니다.
                </Typography>

                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 2 }}>
                    <TextField
                        fullWidth
                        size="small"
                        label="GitHub Repository"
                        placeholder="owner/repo 또는 https://github.com/owner/repo"
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && githubRepo.trim()) handleSaveGithubRepo(); }}
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
                    />
                    <Button
                        variant="contained"
                        onClick={handleSaveGithubRepo}
                        disabled={saveGithubRepoMutation.isPending}
                        sx={{ bgcolor: '#24292F', fontWeight: 600, whiteSpace: 'nowrap', minWidth: 80, '&:hover': { bgcolor: '#1B1F23' } }}
                    >
                        {saveGithubRepoMutation.isPending ? '...' : '저장'}
                    </Button>
                </Box>

                {project?.github_repo && (
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1 }}>
                        <Chip
                            label={project.github_repo}
                            size="small"
                            sx={{ bgcolor: '#F3F4F6', fontWeight: 600, fontSize: '0.75rem' }}
                        />
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={syncGithubMutation.isPending ? <CircularProgress size={14} /> : <SyncIcon />}
                            onClick={() => syncGithubMutation.mutate()}
                            disabled={syncGithubMutation.isPending}
                            sx={{ fontWeight: 600, fontSize: '0.8rem', borderColor: '#2955FF', color: '#2955FF' }}
                        >
                            {syncGithubMutation.isPending ? '동기화 중...' : '동기화'}
                        </Button>
                    </Box>
                )}

                {syncMessage && (
                    <Alert severity={syncMessage.type} sx={{ mt: 1.5, fontSize: '0.8rem' }} onClose={() => setSyncMessage(null)}>
                        {syncMessage.text}
                    </Alert>
                )}
                {syncErrors.length > 0 && (
                    <Alert severity="warning" sx={{ mt: 1, fontSize: '0.75rem' }} onClose={() => setSyncErrors([])}>
                        {syncErrors.map((err, i) => <div key={i}>{err}</div>)}
                    </Alert>
                )}
            </Paper>

            {/* ─── Members Section ─── */}
            <Paper sx={{
                p: 3, mb: 3, borderRadius: 3,
                border: '1px solid #E5E7EB',
                boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GroupIcon sx={{ color: '#2955FF', fontSize: '1.3rem' }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D29' }}>
                            프로젝트 멤버
                        </Typography>
                        <Chip
                            label={`${members.length}명`}
                            size="small"
                            sx={{ bgcolor: '#EEF2FF', color: '#2955FF', fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                        />
                    </Box>
                    {canManage && (
                        <Button
                            size="small"
                            startIcon={<PersonAddIcon />}
                            onClick={() => setAddMemberOpen(true)}
                            sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#2955FF' }}
                        >
                            멤버 추가
                        </Button>
                    )}
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {members.map((m: any) => {
                        const isCurrentOwner = m.role === 'owner';
                        return (
                            <Box
                                key={m.user_id}
                                sx={{
                                    display: 'flex', alignItems: 'center', gap: 1.5,
                                    py: 1.2, px: 2, borderRadius: 2,
                                    bgcolor: isCurrentOwner ? '#FFFBEB' : '#F9FAFB',
                                    border: `1px solid ${isCurrentOwner ? '#FDE68A' : '#F3F4F6'}`,
                                    transition: 'all 0.15s',
                                    '&:hover': { bgcolor: isCurrentOwner ? '#FEF9C3' : '#F3F4F6' },
                                }}
                            >
                                <Avatar sx={{
                                    width: 32, height: 32, fontSize: '0.7rem',
                                    bgcolor: m.avatar_color || '#2955FF',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                }}>
                                    {(m.username || '?').charAt(0).toUpperCase()}
                                </Avatar>
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                                        {m.username || `User ${m.user_id}`}
                                    </Typography>
                                </Box>
                                <Chip
                                    label={isCurrentOwner ? '소유자' : '멤버'}
                                    size="small"
                                    sx={{
                                        height: 22, fontSize: '0.65rem', fontWeight: 700,
                                        bgcolor: isCurrentOwner ? '#FEF3C7' : '#E5E7EB',
                                        color: isCurrentOwner ? '#D97706' : '#6B7280',
                                    }}
                                />
                                {canManage && !isCurrentOwner && (
                                    <Tooltip title="멤버 제거">
                                        <IconButton
                                            size="small"
                                            onClick={() => removeMemberMutation.mutate(m.user_id)}
                                            sx={{ color: '#EF4444', '&:hover': { bgcolor: '#FEF2F2' } }}
                                        >
                                            <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        );
                    })}

                    {members.length === 0 && (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <GroupIcon sx={{ fontSize: '2.5rem', color: '#D1D5DB', mb: 1 }} />
                            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                                아직 멤버가 없습니다
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* ─── Permissions Section ─── */}
            {canManage && (
                <Paper sx={{
                    p: 3, mb: 3, borderRadius: 3,
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                        <SecurityIcon sx={{ color: '#8B5CF6', fontSize: '1.3rem' }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D29' }}>
                            권한 설정
                        </Typography>
                    </Box>

                    <FormControlLabel
                        control={
                            <Switch
                                checked={requireApproval}
                                onChange={(e) => setRequireApproval(e.target.checked)}
                                color="primary"
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                    관리자 승인 후 참여 가능
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                                    {requireApproval ? 'ON: 참여 요청 후 관리자가 승인해야 합니다' : 'OFF: 즉시 참여 가능'}
                                </Typography>
                            </Box>
                        }
                        sx={{ mb: 2, ml: 0 }}
                    />

                    <Divider sx={{ mb: 2 }} />

                    {/* Post Permissions */}
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em', mb: 1, display: 'block' }}>
                        게시글 권한
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 2 }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '0.8rem' }}>작성 권한</InputLabel>
                            <Select native value={permissions.post_write || 'all'} onChange={(e) => setPermissions({ ...permissions, post_write: e.target.value as string })} label="작성 권한" sx={{ fontSize: '0.8rem' }}>
                                <option value="all">전체</option>
                                <option value="admin">관리자</option>
                                <option value="members_only">담당자만</option>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '0.8rem' }}>수정 권한</InputLabel>
                            <Select native value={permissions.post_edit || 'all'} onChange={(e) => setPermissions({ ...permissions, post_edit: e.target.value as string })} label="수정 권한" sx={{ fontSize: '0.8rem' }}>
                                <option value="all">전체</option>
                                <option value="admin">관리자</option>
                                <option value="members_only">담당자만</option>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '0.8rem' }}>조회 권한</InputLabel>
                            <Select native value={permissions.post_view || 'all'} onChange={(e) => setPermissions({ ...permissions, post_view: e.target.value as string })} label="조회 권한" sx={{ fontSize: '0.8rem' }}>
                                <option value="all">전체</option>
                                <option value="members_only">담당자만</option>
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Comment & File Permissions */}
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em', mb: 1, display: 'block' }}>
                        댓글 & 파일 권한
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 3 }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '0.8rem' }}>댓글 작성</InputLabel>
                            <Select native value={permissions.comment_write || 'all'} onChange={(e) => setPermissions({ ...permissions, comment_write: e.target.value as string })} label="댓글 작성" sx={{ fontSize: '0.8rem' }}>
                                <option value="all">전체</option>
                                <option value="members_only">담당자만</option>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '0.8rem' }}>파일 조회</InputLabel>
                            <Select native value={permissions.file_view || 'all'} onChange={(e) => setPermissions({ ...permissions, file_view: e.target.value as string })} label="파일 조회" sx={{ fontSize: '0.8rem' }}>
                                <option value="all">전체</option>
                                <option value="members_only">담당자만</option>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ fontSize: '0.8rem' }}>파일 다운로드</InputLabel>
                            <Select native value={permissions.file_download || 'all'} onChange={(e) => setPermissions({ ...permissions, file_download: e.target.value as string })} label="파일 다운로드" sx={{ fontSize: '0.8rem' }}>
                                <option value="all">전체</option>
                                <option value="members_only">담당자만</option>
                            </Select>
                        </FormControl>
                    </Box>

                    <Button
                        variant="contained"
                        onClick={handleSavePermissions}
                        disabled={updateProjectMutation.isPending}
                        sx={{
                            bgcolor: '#2955FF', fontWeight: 600, px: 4,
                            '&:hover': { bgcolor: '#1E44CC' },
                        }}
                    >
                        {updateProjectMutation.isPending ? '저장 중...' : '권한 설정 저장'}
                    </Button>

                    {updateProjectMutation.isSuccess && (
                        <Typography variant="caption" sx={{ ml: 2, color: '#22C55E', fontWeight: 600 }}>
                            ✓ 저장되었습니다
                        </Typography>
                    )}
                </Paper>
            )}

            {/* ─── Add Member Dialog ─── */}
            <Dialog open={addMemberOpen} onClose={() => { setAddMemberOpen(false); setSelectedUserIds([]); }} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAddIcon sx={{ color: '#2955FF', fontSize: '1.2rem' }} />
                        멤버 추가
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {availableUsers.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 3 }}>
                            <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                                추가할 수 있는 사용자가 없습니다
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                            {availableUsers.map(user => (
                                <Box
                                    key={user.id}
                                    onClick={() => setSelectedUserIds(prev =>
                                        prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id]
                                    )}
                                    sx={{
                                        display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1.5,
                                        borderRadius: 2, cursor: 'pointer',
                                        bgcolor: selectedUserIds.includes(user.id) ? '#EEF2FF' : 'transparent',
                                        '&:hover': { bgcolor: selectedUserIds.includes(user.id) ? '#E0E7FF' : '#F3F4F6' },
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <Checkbox size="small" checked={selectedUserIds.includes(user.id)} sx={{ p: 0.3 }} />
                                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.65rem', bgcolor: user.avatar_color || '#2955FF' }}>
                                        {user.username.charAt(0).toUpperCase()}
                                    </Avatar>
                                    <Box sx={{ flexGrow: 1 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>{user.username}</Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>{user.role || 'member'}</Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setAddMemberOpen(false); setSelectedUserIds([]); }} sx={{ color: '#6B7280' }}>취소</Button>
                    <Button
                        variant="contained"
                        onClick={handleAddMembers}
                        disabled={selectedUserIds.length === 0}
                        sx={{ bgcolor: '#2955FF' }}
                    >
                        {selectedUserIds.length > 0 ? `${selectedUserIds.length}명 추가` : '추가'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ProjectSettingsView;
