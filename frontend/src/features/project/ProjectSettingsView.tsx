import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  IconButton,
  Divider,
  Switch,
  FormControlLabel,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  Tooltip,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SecurityIcon from '@mui/icons-material/Security';
import GroupIcon from '@mui/icons-material/Group';
import SearchIcon from '@mui/icons-material/Search';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, User, MemberGroup } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';
import { useNavigate } from 'react-router-dom';

interface ProjectSettingsViewProps {
  projectId: number;
}

const ProjectSettingsView: React.FC<ProjectSettingsViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUserId = useAppStore(state => state.currentUserId);

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

  const { data: memberGroups = [] } = useQuery<MemberGroup[]>({
    queryKey: ['memberGroups', currentUserId],
    queryFn: () => api.getMemberGroups(currentUserId),
    enabled: currentUserId > 0,
  });

  const project = projects.find((p: any) => p.id === projectId);

  // State
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [knoxQuery, setKnoxQuery] = useState('');
  const [knoxResults, setKnoxResults] = useState<any[]>([]);
  const [knoxSearching, setKnoxSearching] = useState(false);
  const [visibility, setVisibility] = useState<string>(project?.visibility || 'private');
  const [requireApproval, setRequireApproval] = useState(project?.require_approval ?? false);
  const [permissions, setPermissions] = useState<Record<string, string>>(
    project?.permissions ?? {
      post_write: 'all',
      post_edit: 'all',
      post_view: 'all',
      comment_write: 'all',
      file_view: 'all',
      file_download: 'all',
    }
  );

  // Sync state when project data loads
  React.useEffect(() => {
    if (project) {
      setVisibility(project.visibility || 'private');
      setRequireApproval(project.require_approval ?? false);
      setPermissions(
        project.permissions ?? {
          post_write: 'all',
          post_edit: 'all',
          post_view: 'all',
          comment_write: 'all',
          file_view: 'all',
          file_download: 'all',
        }
      );
    }
  }, [project]);

  // Mutations
  const addMemberMutation = useMutation({
    mutationFn: (userId: number) => api.addProjectMember(projectId, userId, 'member'),
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

  const handleSavePermissions = () => {
    updateProjectMutation.mutate({ visibility, require_approval: requireApproval, permissions });
  };

  const deleteProjectMutation = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate('/');
    },
  });

  const handleAddMembers = async () => {
    for (const uid of selectedUserIds) {
      try {
        await addMemberMutation.mutateAsync(uid);
      } catch {
        // 이미 멤버인 경우 무시
      }
    }
    queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
    setSelectedUserIds([]);
    setAddMemberOpen(false);
    setMemberSearch('');
    setKnoxResults([]);
    setKnoxQuery('');
  };

  const handleKnoxSearch = async () => {
    if (!knoxQuery.trim()) return;
    setKnoxSearching(true);
    try {
      const results = await api.searchKnoxEmployees({ fullName: knoxQuery.trim() });
      setKnoxResults(results);
    } catch {
      setKnoxResults([]);
    } finally {
      setKnoxSearching(false);
    }
  };

  // Create user from Knox result then add as member
  const createAndAddMutation = useMutation({
    mutationFn: async (data: { username: string; loginid: string }) => {
      const newUser = await api.createUser({ ...data, role: 'member' });
      await api.addProjectMember(projectId, newUser.id, 'member');
      return newUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: async (err: any) => {
      // User already exists — try adding as member directly
      const detail = err?.response?.data?.detail || '';
      if (detail.includes('already exists') || detail.includes('이미 등록')) {
        const matched = users.find(u => u.loginid === (err as any)._loginid);
        if (matched) {
          try {
            await addMemberMutation.mutateAsync(matched.id);
          } catch { /* ignore */ }
          queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
        }
      }
    },
  });

  const memberUserIds = new Set(members.map((m: any) => m.user_id));
  const availableUsers = users.filter(u => !memberUserIds.has(u.id));
  const isOwner = project?.owner_id === currentUserId;
  const currentUserObj = users.find(u => u.id === currentUserId);
  const isSuperAdmin = currentUserObj?.role === 'super_admin';
  const currentMember = members.find((m: any) => m.user_id === currentUserId);
  const isProjectManager = currentMember?.role === 'manager';
  const canManage = isOwner || isSuperAdmin || isProjectManager;

  const updateMemberRoleMut = useMutation({
    mutationFn: ({ targetUserId, role }: { targetUserId: number; role: string }) =>
      api.updateProjectMemberRole(projectId, targetUserId, role, currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] }),
  });

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', py: 2 }}>
      {/* ─── Members Section ─── */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          borderRadius: 3,
          border: '1px solid rgba(0,0,0,0.08)',
          bgcolor: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GroupIcon sx={{ color: '#2955FF', fontSize: '1.3rem' }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D29' }}>
              프로젝트 멤버
            </Typography>
            <Chip
              label={`${members.length}명`}
              size="small"
              sx={{
                bgcolor: '#EEF2FF',
                color: '#2955FF',
                fontWeight: 700,
                fontSize: '0.7rem',
                height: 22,
              }}
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 1.2,
                  px: 2,
                  borderRadius: 2,
                  bgcolor: isCurrentOwner ? '#FFFBEB' : '#F9FAFB',
                  border: `1px solid ${isCurrentOwner ? '#FDE68A' : '#F3F4F6'}`,
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: isCurrentOwner ? '#FEF9C3' : '#F3F4F6' },
                }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: '0.7rem',
                    bgcolor: m.avatar_color || '#2955FF',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  {(m.username || '?').charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}
                  >
                    {m.username || `User ${m.user_id}`}
                  </Typography>
                </Box>
                {isCurrentOwner ? (
                  <Chip
                    label="소유자"
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#FEF3C7', color: '#D97706' }}
                  />
                ) : canManage ? (
                  <Select
                    native
                    value={m.role || 'member'}
                    size="small"
                    onChange={e => updateMemberRoleMut.mutate({ targetUserId: m.user_id, role: e.target.value as string })}
                    sx={{
                      height: 26, fontSize: '0.7rem', fontWeight: 600,
                      bgcolor: m.role === 'manager' ? '#FEF3C7' : '#E5E7EB',
                      color: m.role === 'manager' ? '#D97706' : '#6B7280',
                      '& .MuiNativeSelect-select': { py: 0.2, px: 1 },
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
                      borderRadius: 2,
                    }}
                  >
                    <option value="member" style={{ fontSize: '0.8rem' }}>멤버</option>
                    <option value="manager" style={{ fontSize: '0.8rem' }}>중간관리자</option>
                  </Select>
                ) : (
                  <Chip
                    label={m.role === 'manager' ? '중간관리자' : '멤버'}
                    size="small"
                    sx={{
                      height: 22, fontSize: '0.65rem', fontWeight: 700,
                      bgcolor: m.role === 'manager' ? '#FEF3C7' : '#E5E7EB',
                      color: m.role === 'manager' ? '#D97706' : '#6B7280',
                    }}
                  />
                )}
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

      {/* ─── Visibility Section ─── */}
      {canManage && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            {visibility === 'public' ? (
              <PublicIcon sx={{ color: '#2955FF', fontSize: '1.3rem' }} />
            ) : (
              <LockIcon sx={{ color: '#6B7280', fontSize: '1.3rem' }} />
            )}
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#1A1D29' }}>
              공개 범위
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {[
              { value: 'private', label: '비공개', desc: '나와 담당자만 볼 수 있습니다' },
              { value: 'public', label: '공개', desc: '모든 사용자가 볼 수 있습니다' },
            ].map(opt => (
              <Box
                key={opt.value}
                onClick={() => setVisibility(opt.value)}
                sx={{
                  flex: 1, p: 1.5, borderRadius: 2, cursor: 'pointer',
                  border: visibility === opt.value ? '2px solid #2955FF' : '1px solid #E5E7EB',
                  bgcolor: visibility === opt.value ? '#EEF2FF' : 'transparent',
                  '&:hover': { borderColor: '#2955FF' },
                  transition: 'all 0.15s',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{opt.label}</Typography>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>{opt.desc}</Typography>
              </Box>
            ))}
          </Box>
          {visibility !== (project?.visibility || 'private') && (
            <Button
              size="small"
              variant="contained"
              onClick={() => updateProjectMutation.mutate({ visibility })}
              disabled={updateProjectMutation.isPending}
              sx={{ bgcolor: '#2955FF', fontWeight: 600, fontSize: '0.8rem', '&:hover': { bgcolor: '#1E44CC' } }}
            >
              공개 범위 저장
            </Button>
          )}
        </Paper>
      )}

      {/* ─── Permissions Section ─── */}
      {canManage && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
          }}
        >
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
                onChange={e => setRequireApproval(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  관리자 승인 후 참여 가능
                </Typography>
                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                  {requireApproval
                    ? 'ON: 참여 요청 후 관리자가 승인해야 합니다'
                    : 'OFF: 즉시 참여 가능'}
                </Typography>
              </Box>
            }
            sx={{ mb: 2, ml: 0 }}
          />

          <Divider sx={{ mb: 2 }} />

          {/* Post Permissions */}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: '#6B7280',
              textTransform: 'uppercase',
              fontSize: '0.65rem',
              letterSpacing: '0.05em',
              mb: 1,
              display: 'block',
            }}
          >
            게시글 권한
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>작성 권한</InputLabel>
              <Select
                native
                value={permissions.post_write || 'all'}
                onChange={e =>
                  setPermissions({ ...permissions, post_write: e.target.value as string })
                }
                label="작성 권한"
                sx={{ fontSize: '0.8rem' }}
              >
                <option value="all">전체</option>
                <option value="super_admin">슈퍼관리자</option>
                <option value="members_only">담당자만</option>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>수정 권한</InputLabel>
              <Select
                native
                value={permissions.post_edit || 'all'}
                onChange={e =>
                  setPermissions({ ...permissions, post_edit: e.target.value as string })
                }
                label="수정 권한"
                sx={{ fontSize: '0.8rem' }}
              >
                <option value="all">전체</option>
                <option value="super_admin">슈퍼관리자</option>
                <option value="members_only">담당자만</option>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>조회 권한</InputLabel>
              <Select
                native
                value={permissions.post_view || 'all'}
                onChange={e =>
                  setPermissions({ ...permissions, post_view: e.target.value as string })
                }
                label="조회 권한"
                sx={{ fontSize: '0.8rem' }}
              >
                <option value="all">전체</option>
                <option value="members_only">담당자만</option>
              </Select>
            </FormControl>
          </Box>

          {/* Comment & File Permissions */}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: '#6B7280',
              textTransform: 'uppercase',
              fontSize: '0.65rem',
              letterSpacing: '0.05em',
              mb: 1,
              display: 'block',
            }}
          >
            댓글 & 파일 권한
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 3 }}>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>댓글 작성</InputLabel>
              <Select
                native
                value={permissions.comment_write || 'all'}
                onChange={e =>
                  setPermissions({ ...permissions, comment_write: e.target.value as string })
                }
                label="댓글 작성"
                sx={{ fontSize: '0.8rem' }}
              >
                <option value="all">전체</option>
                <option value="members_only">담당자만</option>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>파일 조회</InputLabel>
              <Select
                native
                value={permissions.file_view || 'all'}
                onChange={e =>
                  setPermissions({ ...permissions, file_view: e.target.value as string })
                }
                label="파일 조회"
                sx={{ fontSize: '0.8rem' }}
              >
                <option value="all">전체</option>
                <option value="members_only">담당자만</option>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: '0.8rem' }}>파일 다운로드</InputLabel>
              <Select
                native
                value={permissions.file_download || 'all'}
                onChange={e =>
                  setPermissions({ ...permissions, file_download: e.target.value as string })
                }
                label="파일 다운로드"
                sx={{ fontSize: '0.8rem' }}
              >
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
              bgcolor: '#2955FF',
              fontWeight: 600,
              px: 4,
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

      {/* ─── Delete Project Section (Owner only) ─── */}
      {isOwner && (
        <Paper
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 3,
            border: '1px solid #FCA5A5',
            bgcolor: '#FEF2F2',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <DeleteForeverIcon sx={{ color: '#EF4444', fontSize: '1.3rem' }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#DC2626' }}>
              프로젝트 삭제
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem', mb: 2 }}>
            프로젝트를 삭제하면 모든 태스크, 멤버, 파일이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </Typography>
          <Button
            variant="contained"
            startIcon={<DeleteForeverIcon />}
            onClick={() => {
              if (window.confirm(`"${project?.name}" 프로젝트를 삭제하시겠습니까?\n모든 데이터가 삭제됩니다.`)) {
                deleteProjectMutation.mutate();
              }
            }}
            disabled={deleteProjectMutation.isPending}
            sx={{
              bgcolor: '#EF4444',
              fontWeight: 600,
              '&:hover': { bgcolor: '#DC2626' },
            }}
          >
            {deleteProjectMutation.isPending ? '삭제 중...' : '프로젝트 삭제'}
          </Button>
        </Paper>
      )}

      {/* ─── Add Member Dialog (with Knox search) ─── */}
      <Dialog
        open={addMemberOpen}
        onClose={() => {
          setAddMemberOpen(false);
          setSelectedUserIds([]);
          setMemberSearch('');
          setKnoxResults([]);
          setKnoxQuery('');
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon sx={{ color: '#2955FF', fontSize: '1.2rem' }} />
            멤버 추가
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Search bar */}
          <TextField
            size="small"
            fullWidth
            placeholder="이름으로 검색 (Enter: Knox 사내 검색)"
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && memberSearch.trim()) {
                setKnoxQuery(memberSearch.trim());
                handleKnoxSearch();
              }
            }}
            sx={{ mt: 1, mb: 1.5 }}
            InputProps={{
              endAdornment: (
                <IconButton
                  size="small"
                  onClick={() => {
                    if (memberSearch.trim()) {
                      setKnoxQuery(memberSearch.trim());
                      handleKnoxSearch();
                    }
                  }}
                  disabled={knoxSearching || !memberSearch.trim()}
                >
                  {knoxSearching ? <CircularProgress size={16} /> : <SearchIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              ),
            }}
          />

          {/* Group quick-add */}
          {memberGroups.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#2955FF', mb: 0.5, display: 'block' }}>
                그룹으로 추가
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                {memberGroups.map(g => {
                  const newIds = g.members
                    .map(m => m.user_id)
                    .filter(uid => !memberUserIds.has(uid) && !selectedUserIds.includes(uid));
                  return (
                    <Chip
                      key={g.id}
                      label={`${g.name} (${g.member_count}명)`}
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        if (newIds.length > 0) {
                          setSelectedUserIds(prev => [...new Set([...prev, ...newIds])]);
                        }
                      }}
                      disabled={newIds.length === 0}
                      sx={{
                        cursor: newIds.length > 0 ? 'pointer' : 'default',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        borderColor: newIds.length > 0 ? '#2955FF' : '#E5E7EB',
                        color: newIds.length > 0 ? '#2955FF' : '#9CA3AF',
                        '&:hover': newIds.length > 0 ? { bgcolor: '#EEF2FF' } : {},
                      }}
                    />
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Knox search results */}
          {knoxResults.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#5B21B6', mb: 0.5, display: 'block' }}>
                Knox 사내 검색 결과 ({knoxResults.length}명)
              </Typography>
              <Box sx={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #EDE9FE', borderRadius: 1 }}>
                {knoxResults.map((emp: any, idx: number) => {
                  const lid = (emp.loginid || emp.login_id || emp.id || '').toString().toLowerCase();
                  const name = emp.fullName || emp.username || emp.name || lid;
                  const dept = emp.deptName || emp.deptname || emp.department || '';
                  const isAlreadyMember = members.some((m: any) => {
                    const mUser = users.find(u => u.id === m.user_id);
                    return mUser && (mUser.loginid || '').toLowerCase() === lid;
                  });
                  const existingUser = users.find(u => (u.loginid || '').toLowerCase() === lid);
                  return (
                    <Box
                      key={idx}
                      sx={{
                        px: 1.5, py: 0.8,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: '1px solid #F3F4F6',
                        '&:hover': { bgcolor: '#F9FAFB' },
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>{name}</Typography>
                        <Typography variant="caption" sx={{ color: '#9CA3AF' }}>{lid}{dept ? ` · ${dept}` : ''}</Typography>
                      </Box>
                      {isAlreadyMember ? (
                        <Chip label="멤버" size="small" sx={{ fontSize: '0.65rem', bgcolor: '#DCFCE7', color: '#22C55E' }} />
                      ) : existingUser ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            if (!selectedUserIds.includes(existingUser.id)) {
                              setSelectedUserIds(prev => [...prev, existingUser.id]);
                            }
                          }}
                          disabled={selectedUserIds.includes(existingUser.id)}
                          sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 50 }}
                        >
                          {selectedUserIds.includes(existingUser.id) ? '선택됨' : '선택'}
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => createAndAddMutation.mutate({ username: name, loginid: lid })}
                          disabled={createAndAddMutation.isPending}
                          sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 80, bgcolor: '#8B5CF6', '&:hover': { bgcolor: '#7C3AED' } }}
                        >
                          등록+추가
                        </Button>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Existing users list */}
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', mb: 0.5, display: 'block' }}>
            등록된 사용자 ({availableUsers.filter(u => {
              if (!memberSearch) return true;
              const q = memberSearch.toLowerCase();
              return (u.username || '').toLowerCase().includes(q) || (u.loginid || '').toLowerCase().includes(q);
            }).length}명)
          </Typography>
          {availableUsers.length === 0 && knoxResults.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                추가할 수 있는 사용자가 없습니다. Knox 검색을 시도하세요.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 250, overflowY: 'auto' }}>
              {availableUsers
                .filter(u => {
                  if (!memberSearch) return true;
                  const q = memberSearch.toLowerCase();
                  return (u.username || '').toLowerCase().includes(q) || (u.loginid || '').toLowerCase().includes(q);
                })
                .map(user => (
                <Box
                  key={user.id}
                  onClick={() =>
                    setSelectedUserIds(prev =>
                      prev.includes(user.id)
                        ? prev.filter(id => id !== user.id)
                        : [...prev, user.id]
                    )
                  }
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1,
                    px: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: selectedUserIds.includes(user.id) ? '#EEF2FF' : 'transparent',
                    '&:hover': {
                      bgcolor: selectedUserIds.includes(user.id) ? '#E0E7FF' : '#F3F4F6',
                    },
                    transition: 'all 0.15s',
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={selectedUserIds.includes(user.id)}
                    sx={{ p: 0.3 }}
                  />
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: '0.65rem',
                      bgcolor: user.avatar_color || '#2955FF',
                    }}
                  >
                    {(user.username || '?').charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                      {user.username}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem' }}>
                      {user.loginid}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                    {user.role || 'member'}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setAddMemberOpen(false);
              setSelectedUserIds([]);
              setMemberSearch('');
              setKnoxResults([]);
            }}
            sx={{ color: '#6B7280' }}
          >
            취소
          </Button>
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
