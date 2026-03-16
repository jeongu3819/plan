import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GroupIcon from '@mui/icons-material/Group';
import SearchIcon from '@mui/icons-material/Search';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, User, MemberGroup } from '../api/client';
import { useAppStore } from '../stores/useAppStore';

const GroupPage: React.FC = () => {
  const queryClient = useQueryClient();
  const currentUserId = useAppStore(s => s.currentUserId);

  const { data: groups = [], isLoading } = useQuery<MemberGroup[]>({
    queryKey: ['memberGroups', currentUserId],
    queryFn: () => api.getMemberGroups(currentUserId),
    enabled: currentUserId > 0,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MemberGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [userSearch, setUserSearch] = useState('');

  const openCreateDialog = () => {
    setEditingGroup(null);
    setGroupName('');
    setGroupDescription('');
    setSelectedUserIds([]);
    setUserSearch('');
    setDialogOpen(true);
  };

  const openEditDialog = (g: MemberGroup) => {
    setEditingGroup(g);
    setGroupName(g.name);
    setGroupDescription(g.description || '');
    setSelectedUserIds(g.members.map(m => m.user_id));
    setUserSearch('');
    setDialogOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (data: { name: string; description?: string; member_user_ids: number[] }) =>
      api.createMemberGroup(data, currentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberGroups', currentUserId] });
      setDialogOpen(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; description?: string; member_user_ids?: number[] } }) =>
      api.updateMemberGroup(id, data, currentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberGroups', currentUserId] });
      setDialogOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteMemberGroup(id, currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberGroups'] }),
  });

  const handleSave = () => {
    const data = {
      name: groupName.trim(),
      description: groupDescription.trim() || undefined,
      member_user_ids: selectedUserIds,
    };
    if (editingGroup) {
      updateMut.mutate({ id: editingGroup.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.username || '').toLowerCase().includes(q) ||
      (u.loginid || '').toLowerCase().includes(q) ||
      (u.deptname || '').toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <GroupIcon sx={{ color: '#2955FF', fontSize: '1.8rem' }} />
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1D29' }}>
            그룹 관리
          </Typography>
          <Chip
            label={`${groups.length}개`}
            size="small"
            sx={{ bgcolor: '#EEF2FF', color: '#2955FF', fontWeight: 700, fontSize: '0.75rem' }}
          />
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
          sx={{ bgcolor: '#2955FF', fontWeight: 600, '&:hover': { bgcolor: '#1E44CC' } }}
        >
          새 그룹
        </Button>
      </Box>

      <Typography variant="body2" sx={{ color: '#6B7280', mb: 3, fontSize: '0.85rem' }}>
        구성원들을 그룹으로 묶어서 프로젝트 생성이나 설정에서 한 번에 추가할 수 있습니다.
      </Typography>

      {/* Group Cards */}
      {groups.length === 0 ? (
        <Paper
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid #E5E7EB',
            bgcolor: 'rgba(255,255,255,0.7)',
          }}
        >
          <GroupIcon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" sx={{ color: '#9CA3AF', fontWeight: 500 }}>
            아직 생성된 그룹이 없습니다
          </Typography>
          <Typography variant="body2" sx={{ color: '#D1D5DB', mt: 0.5, mb: 2 }}>
            "새 그룹" 버튼을 눌러 그룹을 만들어보세요
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreateDialog} sx={{ color: '#2955FF', borderColor: '#2955FF' }}>
            그룹 만들기
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map(g => (
            <Paper
              key={g.id}
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: '1px solid rgba(0,0,0,0.08)',
                bgcolor: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                transition: 'all 0.15s',
                '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar sx={{ bgcolor: '#2955FF', width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700 }}>
                    {g.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1A1D29' }}>
                      {g.name}
                    </Typography>
                    {g.description && (
                      <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.75rem' }}>
                        {g.description}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={`${g.member_count}명`}
                    size="small"
                    sx={{ bgcolor: '#EEF2FF', color: '#2955FF', fontWeight: 700, fontSize: '0.7rem', height: 22 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="편집">
                    <IconButton size="small" onClick={() => openEditDialog(g)} sx={{ color: '#6B7280' }}>
                      <EditIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="삭제">
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (window.confirm(`"${g.name}" 그룹을 삭제하시겠습니까?`)) {
                          deleteMut.mutate(g.id);
                        }
                      }}
                      sx={{ color: '#EF4444' }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>

              {/* Member avatars */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                {g.members.map(m => (
                  <Tooltip key={m.user_id} title={`${m.username}${m.deptname ? ` (${m.deptname})` : ''}`}>
                    <Chip
                      avatar={
                        <Avatar sx={{ bgcolor: m.avatar_color || '#2955FF', width: 22, height: 22, fontSize: '0.6rem' }}>
                          {(m.username || '?').charAt(0).toUpperCase()}
                        </Avatar>
                      }
                      label={m.username}
                      size="small"
                      sx={{
                        height: 26,
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        bgcolor: '#F9FAFB',
                        border: '1px solid #F3F4F6',
                      }}
                    />
                  </Tooltip>
                ))}
                {g.member_count === 0 && (
                  <Typography variant="caption" sx={{ color: '#D1D5DB', fontStyle: 'italic' }}>
                    멤버 없음
                  </Typography>
                )}
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GroupIcon sx={{ color: '#2955FF', fontSize: '1.2rem' }} />
            {editingGroup ? '그룹 편집' : '새 그룹 만들기'}
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="그룹 이름 *"
            placeholder="예: 마케팅팀"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="설명 (선택)"
            placeholder="그룹에 대한 설명"
            value={groupDescription}
            onChange={e => setGroupDescription(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* Member selection */}
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', mb: 0.5, display: 'block' }}>
            그룹 멤버 선택 ({selectedUserIds.length}명 선택)
          </Typography>
          <TextField
            size="small"
            fullWidth
            placeholder="이름, ID, 소속으로 검색"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            sx={{ mb: 1 }}
            InputProps={{
              endAdornment: <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF' }} />,
            }}
          />
          <Box
            sx={{
              maxHeight: 280,
              overflowY: 'auto',
              border: '1px solid #E5E7EB',
              borderRadius: 2,
              p: 0.5,
            }}
          >
            {filteredUsers.map(user => (
              <Box
                key={user.id}
                onClick={() =>
                  setSelectedUserIds(prev =>
                    prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id]
                  )
                }
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.7,
                  px: 1.5,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#F3F4F6' },
                  bgcolor: selectedUserIds.includes(user.id) ? '#EEF2FF' : 'transparent',
                }}
              >
                <Checkbox size="small" checked={selectedUserIds.includes(user.id)} sx={{ p: 0.3 }} />
                <Avatar
                  sx={{ width: 24, height: 24, fontSize: '0.6rem', bgcolor: user.avatar_color || '#2955FF' }}
                >
                  {(user.username || '?').charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    {user.username}
                    <Typography component="span" sx={{ fontSize: '0.7rem', color: '#9CA3AF', ml: 0.5 }}>
                      ({user.loginid})
                    </Typography>
                  </Typography>
                </Box>
                {user.deptname && (
                  <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem' }}>
                    {user.deptname}
                  </Typography>
                )}
              </Box>
            ))}
            {filteredUsers.length === 0 && (
              <Typography variant="body2" sx={{ color: '#9CA3AF', textAlign: 'center', py: 2, fontSize: '0.8rem' }}>
                검색 결과가 없습니다
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: '#6B7280' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!groupName.trim() || createMut.isPending || updateMut.isPending}
            sx={{ bgcolor: '#2955FF', '&:hover': { bgcolor: '#1E44CC' } }}
          >
            {createMut.isPending || updateMut.isPending ? '저장 중...' : editingGroup ? '저장' : '생성'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GroupPage;
