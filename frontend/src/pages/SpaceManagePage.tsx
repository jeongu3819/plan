/**
 * SpaceManagePage — 공간 관리 페이지
 * - 전체 공간 목록 (메인 영역, 접근 가능 여부 표시)
 * - 최근 사용한 공간 / 즐겨찾기 공간 (오른쪽 사이드)
 * - 공간 생성/수정/멤버관리 통합
 * - 검색 기반 멤버 추가 (전체 목록 노출 안 함)
 * - 멤버별 역할(owner/operator/member) 관리
 */

import React, { useState, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, Chip, IconButton, Button,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Pagination,
  Avatar, Select, MenuItem, FormControl,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SettingsIcon from '@mui/icons-material/Settings';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Project } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';

const SPACES_PER_PAGE = 24;

const ROLE_LABELS: Record<string, string> = {
  owner: '소유자',
  admin: '관리자',
  operator: '공간운영',
  member: '멤버',
};

const ROLE_COLORS: Record<string, string> = {
  owner: '#2955FF',
  admin: '#8B5CF6',
  operator: '#F59E0B',
  member: '#6B7280',
};

const SpaceManagePage: React.FC = () => {
  const currentUserId = useAppStore(state => state.currentUserId);
  const currentSpaceId = useAppStore(state => state.currentSpaceId);
  const currentSpaceName = useAppStore(state => state.currentSpaceName);
  const setCurrentSpace = useAppStore(state => state.setCurrentSpace);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Space create/edit dialog
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editingSpace, setEditingSpace] = useState<any>(null);
  const [spaceName, setSpaceName] = useState('');
  const [spaceDesc, setSpaceDesc] = useState('');

  // Member management dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [managingSpace, setManagingSpace] = useState<any>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Favorites & recent from localStorage
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('plan-a-fav-spaces') || '[]'); } catch { return []; }
  });
  const recentIds: number[] = (() => {
    try { return JSON.parse(localStorage.getItem('plan-a-recent-spaces') || '[]'); } catch { return []; }
  })();

  const toggleFav = (id: number) => {
    setFavoriteIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('plan-a-fav-spaces', JSON.stringify(next));
      return next;
    });
  };

  // Fetch ALL spaces (not just user's) with is_member flag
  const { data: allSpaces = [] } = useQuery<any[]>({
    queryKey: ['allSpaces', currentUserId],
    queryFn: () => api.getAllSpaces(currentUserId),
    enabled: currentUserId > 0,
  });

  const { data: unassignedProjects = [] } = useQuery<Project[]>({
    queryKey: ['unassignedProjects', currentUserId],
    queryFn: () => api.getUnassignedProjects(currentUserId),
    enabled: currentUserId > 0 && importDialogOpen,
  });

  // Join requests for managing space
  const { data: joinRequests = [] } = useQuery<any[]>({
    queryKey: ['spaceJoinRequests', managingSpace?.id, currentUserId],
    queryFn: () => api.getSpaceJoinRequests(managingSpace!.id, currentUserId),
    enabled: !!managingSpace && memberDialogOpen && currentUserId > 0,
    retry: false,
  });

  const q = search.trim().toLowerCase();
  const filtered = q ? allSpaces.filter((s: any) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)) : allSpaces;
  const totalPages = Math.ceil(filtered.length / SPACES_PER_PAGE);
  const pageSpaces = filtered.slice(page * SPACES_PER_PAGE, (page + 1) * SPACES_PER_PAGE);

  const favSpaces = allSpaces.filter((s: any) => favoriteIds.includes(s.id));
  const recentSpaces = recentIds.map(id => allSpaces.find((s: any) => s.id === id)).filter(Boolean).slice(0, 8);

  // Search users for member addition
  const handleMemberSearch = useCallback(async (query: string) => {
    setMemberSearch(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await api.searchUsers(query.trim(), currentUserId);
      setSearchResults(results);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [currentUserId]);

  // Debounced search
  const [searchTimer, setSearchTimer] = useState<any>(null);
  const debouncedSearch = (query: string) => {
    setMemberSearch(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchTimer(setTimeout(() => handleMemberSearch(query), 300));
  };

  const handleDeleteSpace = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteSpace(deleteConfirm.id, currentUserId);
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      if (currentSpaceId === deleteConfirm.id) {
        setCurrentSpace(null, null, null);
      }
      setDeleteConfirm(null);
    } catch (e) { console.error(e); }
  };

  const handleImportProject = async (projectId: number) => {
    if (!currentSpaceId) return;
    try {
      await api.moveProjectToSpace(projectId, currentSpaceId, currentUserId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['unassignedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (e) { console.error(e); }
  };

  const selectSpace = (s: any) => {
    if (!s.is_member) return; // Don't navigate if not member
    setCurrentSpace(s.id, s.name, s.slug);
    const recent = [s.id, ...recentIds.filter((x: number) => x !== s.id)].slice(0, 10);
    localStorage.setItem('plan-a-recent-spaces', JSON.stringify(recent));
    navigate(`/space/${s.slug}`);
  };

  const openCreateDialog = () => {
    setDialogMode('create');
    setEditingSpace(null);
    setSpaceName('');
    setSpaceDesc('');
    setSpaceDialogOpen(true);
  };

  const openEditDialog = (s: any) => {
    setDialogMode('edit');
    setEditingSpace(s);
    setSpaceName(s.name);
    setSpaceDesc(s.description || '');
    setSpaceDialogOpen(true);
  };

  const openMemberDialog = (s: any) => {
    setManagingSpace(s);
    setMemberSearch('');
    setSearchResults([]);
    setMemberDialogOpen(true);
  };

  const handleCreateSpace = async () => {
    if (!spaceName.trim()) return;
    try {
      const created = await api.createSpace(
        { name: spaceName.trim(), description: spaceDesc.trim() || undefined },
        currentUserId
      );
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      setSpaceDialogOpen(false);
      setCurrentSpace(created.id, created.name, created.slug);
      navigate(`/space/${created.slug}`);
    } catch (e) { console.error(e); }
  };

  const handleUpdateSpace = async () => {
    if (!editingSpace || !spaceName.trim()) return;
    try {
      const updated = await api.updateSpace(
        editingSpace.id,
        { name: spaceName.trim(), description: spaceDesc.trim() || undefined },
        currentUserId
      );
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      // If editing current space, update slug in store and URL
      if (currentSpaceId === editingSpace.id) {
        setCurrentSpace(updated.id, updated.name, updated.slug);
        navigate(`/space/${updated.slug}/spaces`, { replace: true });
      }
      setSpaceDialogOpen(false);
    } catch (e) { console.error(e); }
  };

  const handleAddMember = async (userId: number) => {
    if (!managingSpace) return;
    try {
      await api.addSpaceMember(managingSpace.id, userId, currentUserId);
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      // Refresh managing space data
      const updated = await api.getAllSpaces(currentUserId);
      const refreshed = updated.find((s: any) => s.id === managingSpace.id);
      if (refreshed) setManagingSpace(refreshed);
    } catch (e) { console.error(e); }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!managingSpace) return;
    try {
      await api.removeSpaceMember(managingSpace.id, userId, currentUserId);
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      const updated = await api.getAllSpaces(currentUserId);
      const refreshed = updated.find((s: any) => s.id === managingSpace.id);
      if (refreshed) setManagingSpace(refreshed);
    } catch (e) { console.error(e); }
  };

  const handleRoleChange = async (userId: number, role: string) => {
    if (!managingSpace) return;
    try {
      await api.updateSpaceMemberRole(managingSpace.id, userId, role, currentUserId);
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      const updated = await api.getAllSpaces(currentUserId);
      const refreshed = updated.find((s: any) => s.id === managingSpace.id);
      if (refreshed) setManagingSpace(refreshed);
    } catch (e) { console.error(e); }
  };

  const handleApproveJoinRequest = async (requestId: number, action: string) => {
    if (!managingSpace) return;
    try {
      await api.approveSpaceJoinRequest(managingSpace.id, requestId, action, currentUserId);
      queryClient.invalidateQueries({ queryKey: ['spaceJoinRequests'] });
      queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
      const updated = await api.getAllSpaces(currentUserId);
      const refreshed = updated.find((s: any) => s.id === managingSpace.id);
      if (refreshed) setManagingSpace(refreshed);
    } catch (e) { console.error(e); }
  };

  const getMyRole = (s: any) => {
    const m = s.members?.find((m: any) => m.user_id === currentUserId);
    return m?.role || null;
  };

  const canManage = (s: any) => {
    const role = getMyRole(s);
    return role === 'owner' || role === 'admin' || role === 'operator';
  };

  const renderSpaceCard = (s: any) => {
    const myRole = getMyRole(s);
    const isMember = s.is_member;
    return (
      <Paper
        key={s.id}
        sx={{
          display: 'flex', flexDirection: 'column', gap: 1, p: 2, borderRadius: 2.5,
          border: s.id === currentSpaceId ? '2px solid #2955FF' : isMember ? '1px solid rgba(0,0,0,0.08)' : '1px dashed rgba(0,0,0,0.15)',
          bgcolor: s.id === currentSpaceId ? '#EEF2FF' : isMember ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.02)',
          cursor: isMember ? 'pointer' : 'default',
          transition: 'all 0.15s',
          opacity: isMember ? 1 : 0.75,
          '&:hover': isMember ? { borderColor: '#C7D2FE', boxShadow: '0 2px 12px rgba(41,85,255,0.08)' } : {},
          position: 'relative',
        }}
        elevation={0}
        onClick={() => isMember && selectSpace(s)}
      >
        {/* Top row: name + fav */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>{s.name}</Typography>
              {!isMember && <LockOutlinedIcon sx={{ fontSize: 14, color: '#D1D5DB' }} />}
            </Box>
            {s.description && (
              <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.7rem', display: 'block', mt: 0.3 }}>
                {s.description}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={e => { e.stopPropagation(); toggleFav(s.id); }} sx={{ p: 0.3 }}>
            {favoriteIds.includes(s.id) ? <StarIcon sx={{ fontSize: 16, color: '#F59E0B' }} /> : <StarBorderIcon sx={{ fontSize: 16, color: '#D1D5DB' }} />}
          </IconButton>
        </Box>

        {/* Bottom row: info chips + actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <Chip label={`${s.member_count}명`} size="small" sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#F3F4F6', color: '#6B7280' }} />
          {myRole && (
            <Chip
              label={ROLE_LABELS[myRole] || myRole}
              size="small"
              sx={{ height: 20, fontSize: '0.62rem', bgcolor: `${ROLE_COLORS[myRole] || '#6B7280'}15`, color: ROLE_COLORS[myRole] || '#6B7280', fontWeight: 600 }}
            />
          )}
          {!isMember && (
            <Chip label="참여 불가" size="small" sx={{ height: 20, fontSize: '0.62rem', bgcolor: '#FEF2F2', color: '#EF4444' }} />
          )}
          <Box sx={{ flex: 1 }} />
          {canManage(s) && (
            <>
              <Tooltip title="공간 수정">
                <IconButton size="small" onClick={e => { e.stopPropagation(); openEditDialog(s); }} sx={{ p: 0.3, color: '#9CA3AF', '&:hover': { color: '#2955FF' } }}>
                  <EditIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="멤버 관리">
                <IconButton size="small" onClick={e => { e.stopPropagation(); openMemberDialog(s); }} sx={{ p: 0.3, color: '#9CA3AF', '&:hover': { color: '#F59E0B' } }}>
                  <SettingsIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
          {myRole === 'owner' && (
            <Tooltip title="공간 삭제">
              <IconButton size="small" onClick={e => { e.stopPropagation(); setDeleteConfirm(s); }} sx={{ p: 0.3, color: '#D1D5DB', '&:hover': { color: '#EF4444' } }}>
                <DeleteOutlineIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
          {!isMember && (
            <Button
              size="small"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await api.requestJoinSpace(s.id, currentUserId);
                  queryClient.invalidateQueries({ queryKey: ['allSpaces'] });
                } catch (err) { console.error(err); }
              }}
              sx={{ textTransform: 'none', fontSize: '0.68rem', fontWeight: 600, color: '#2955FF', minWidth: 0, px: 1 }}
            >
              참여 신청
            </Button>
          )}
        </Box>
      </Paper>
    );
  };

  return (
    <Box sx={{ display: 'flex', gap: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* ── Main Area: 전체 공간 목록 ── */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <WorkspacesIcon sx={{ fontSize: 24, color: '#2955FF' }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>공간</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={openCreateDialog}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', bgcolor: '#2955FF', borderRadius: 2 }}
            >
              새 공간 만들기
            </Button>
            {currentSpaceId && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<MoveToInboxIcon sx={{ fontSize: 14 }} />}
                onClick={() => setImportDialogOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.72rem', borderColor: '#059669', color: '#059669', borderRadius: 2, '&:hover': { bgcolor: '#ECFDF5' } }}
              >
                프로젝트 가져오기
              </Button>
            )}
          </Box>
        </Box>

        {/* Search */}
        <TextField
          fullWidth size="small" placeholder="공간 이름으로 검색..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF', mr: 1 }} /> }}
          sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />

        {/* Space grid */}
        <Typography variant="overline" sx={{ fontWeight: 700, fontSize: '0.68rem', color: '#374151', letterSpacing: '0.08em', mb: 1.5, display: 'block' }}>
          전체 공간 ({filtered.length}개)
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1.5, mb: 2 }}>
          {pageSpaces.length === 0 && (
            <Paper sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 6, borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)' }} elevation={0}>
              <WorkspacesIcon sx={{ fontSize: 40, color: '#D1D5DB', mb: 1 }} />
              <Typography sx={{ color: '#9CA3AF', fontSize: '0.88rem', mb: 2 }}>
                {q ? '검색 결과가 없습니다' : '아직 공간이 없습니다'}
              </Typography>
              {!q && (
                <Button
                  variant="outlined" size="small"
                  startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                  onClick={openCreateDialog}
                  sx={{ textTransform: 'none', fontSize: '0.78rem', fontWeight: 600, color: '#2955FF', borderColor: '#2955FF' }}
                >
                  첫 공간 만들기
                </Button>
              )}
            </Paper>
          )}
          {pageSpaces.map(renderSpaceCard)}
        </Box>
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={totalPages} page={page + 1} onChange={(_, p) => setPage(p - 1)} />
          </Box>
        )}
      </Box>

      {/* ── Right Sidebar: 즐겨찾기/최근 ── */}
      <Box sx={{ width: 240, flexShrink: 0 }}>
        {/* 즐겨찾기 */}
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
            즐겨찾기 공간
          </Typography>
          {favSpaces.length === 0 ? (
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>즐겨찾기가 없습니다</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {favSpaces.map((s: any) => (
                <Box
                  key={s.id}
                  onClick={() => s.is_member && selectSpace(s)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.8,
                    py: 0.6, px: 1, borderRadius: 1.5, cursor: s.is_member ? 'pointer' : 'default',
                    '&:hover': s.is_member ? { bgcolor: '#F9FAFB' } : {},
                    bgcolor: s.id === currentSpaceId ? '#EEF2FF' : 'transparent',
                  }}
                >
                  <StarIcon sx={{ fontSize: 13, color: '#F59E0B' }} />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: s.id === currentSpaceId ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </Typography>
                  {!s.is_member && <LockOutlinedIcon sx={{ fontSize: 12, color: '#D1D5DB' }} />}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* 최근 사용 */}
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
            최근 사용한 공간
          </Typography>
          {recentSpaces.length === 0 ? (
            <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF' }}>최근 기록이 없습니다</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {recentSpaces.map((s: any) => (
                <Box
                  key={s.id}
                  onClick={() => s.is_member && selectSpace(s)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.8,
                    py: 0.6, px: 1, borderRadius: 1.5, cursor: s.is_member ? 'pointer' : 'default',
                    '&:hover': s.is_member ? { bgcolor: '#F9FAFB' } : {},
                    bgcolor: s.id === currentSpaceId ? '#EEF2FF' : 'transparent',
                  }}
                >
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: s.is_member ? '#22C55E' : '#D1D5DB', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: s.id === currentSpaceId ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── 공간 생성/수정 Dialog ── */}
      <Dialog open={spaceDialogOpen} onClose={() => setSpaceDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          {dialogMode === 'create' ? '새 공간 만들기' : `공간 수정: ${editingSpace?.name || ''}`}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="공간 이름 *"
            placeholder="예: DA파트, 개발팀"
            value={spaceName} onChange={e => setSpaceName(e.target.value)}
            sx={{ mt: 1, mb: 1 }}
            helperText={spaceName.trim() ? `URL: /space/${spaceName.trim().replace(/\s+/g, '-')}` : ''}
            FormHelperTextProps={{ sx: { fontSize: '0.68rem', color: '#2955FF' } }}
            onKeyDown={e => { if (e.key === 'Enter' && spaceName.trim()) dialogMode === 'create' ? handleCreateSpace() : handleUpdateSpace(); }}
          />
          <TextField
            fullWidth label="설명 (선택)"
            placeholder="공간에 대한 간단한 설명"
            value={spaceDesc} onChange={e => setSpaceDesc(e.target.value)}
            sx={{ mb: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSpaceDialogOpen(false)} sx={{ color: '#6B7280' }}>취소</Button>
          <Button
            variant="contained"
            disabled={!spaceName.trim()}
            onClick={dialogMode === 'create' ? handleCreateSpace : handleUpdateSpace}
            sx={{ bgcolor: '#2955FF' }}
          >
            {dialogMode === 'create' ? '생성' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 멤버 관리 Dialog ── */}
      <Dialog open={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>멤버 관리: {managingSpace?.name}</span>
          <IconButton size="small" onClick={() => setMemberDialogOpen(false)}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
        </DialogTitle>
        <DialogContent>
          {/* Add member by search */}
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', mb: 0.5, display: 'block', mt: 1 }}>
            멤버 추가 (이름 또는 ID로 검색)
          </Typography>
          <TextField
            size="small" fullWidth
            placeholder="2글자 이상 입력하여 검색..."
            value={memberSearch}
            onChange={e => debouncedSearch(e.target.value)}
            InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: '#9CA3AF', mr: 0.5 }} /> }}
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { fontSize: '0.82rem', borderRadius: 1.5 } }}
          />
          {/* Search results */}
          {memberSearch.trim().length >= 2 && (
            <Box sx={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 2, p: 0.5, mb: 2 }}>
              {searching && <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', py: 1 }}>검색 중...</Typography>}
              {!searching && searchResults.length === 0 && (
                <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', py: 1 }}>검색 결과가 없습니다</Typography>
              )}
              {searchResults
                .filter(u => !managingSpace?.members?.some((m: any) => m.user_id === u.id))
                .map(user => (
                  <Box
                    key={user.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1,
                      py: 0.6, px: 1.5, borderRadius: 1.5, cursor: 'pointer',
                      '&:hover': { bgcolor: '#F3F4F6' },
                    }}
                    onClick={() => handleAddMember(user.id)}
                  >
                    <Avatar sx={{ width: 24, height: 24, fontSize: '0.6rem', bgcolor: user.avatar_color || '#2955FF' }}>
                      {user.username?.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                        {user.username}
                        <Typography component="span" sx={{ fontSize: '0.68rem', color: '#9CA3AF', ml: 0.5 }}>
                          ({user.loginid})
                        </Typography>
                      </Typography>
                    </Box>
                    <PersonAddIcon sx={{ fontSize: 16, color: '#22C55E' }} />
                  </Box>
                ))}
            </Box>
          )}

          {/* Current members */}
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', mb: 0.5, display: 'block' }}>
            현재 멤버 ({managingSpace?.members?.length || 0}명)
          </Typography>
          <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 2, p: 0.5 }}>
            {(managingSpace?.members || []).map((m: any) => {
              const isOwner = m.role === 'owner';
              const myRole = getMyRole(managingSpace);
              const canChangeRole = myRole === 'owner' && !isOwner;
              const canRemove = (myRole === 'owner' || myRole === 'admin' || myRole === 'operator') && !isOwner && m.user_id !== currentUserId;
              return (
                <Box
                  key={m.user_id}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    py: 0.7, px: 1.5, borderRadius: 1.5,
                    '&:hover': { bgcolor: '#F9FAFB' },
                  }}
                >
                  <Avatar sx={{ width: 26, height: 26, fontSize: '0.6rem', bgcolor: m.avatar_color || '#2955FF' }}>
                    {m.username?.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      {m.username}
                      <Typography component="span" sx={{ fontSize: '0.68rem', color: '#9CA3AF', ml: 0.5 }}>
                        ({m.loginid})
                      </Typography>
                    </Typography>
                  </Box>
                  {canChangeRole ? (
                    <FormControl size="small" sx={{ minWidth: 85 }}>
                      <Select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.user_id, e.target.value as string)}
                        sx={{ fontSize: '0.68rem', height: 26, borderRadius: 1.5, '& .MuiSelect-select': { py: 0.3, px: 1 } }}
                      >
                        <MenuItem value="operator" sx={{ fontSize: '0.75rem' }}>공간운영</MenuItem>
                        <MenuItem value="member" sx={{ fontSize: '0.75rem' }}>멤버</MenuItem>
                      </Select>
                    </FormControl>
                  ) : (
                    <Chip
                      label={ROLE_LABELS[m.role] || m.role}
                      size="small"
                      sx={{
                        height: 22, fontSize: '0.62rem', fontWeight: 600,
                        bgcolor: `${ROLE_COLORS[m.role] || '#6B7280'}15`,
                        color: ROLE_COLORS[m.role] || '#6B7280',
                      }}
                    />
                  )}
                  {canRemove && (
                    <Tooltip title="멤버 제거">
                      <IconButton size="small" onClick={() => handleRemoveMember(m.user_id)} sx={{ p: 0.3, color: '#D1D5DB', '&:hover': { color: '#EF4444' } }}>
                        <PersonRemoveIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Pending join requests */}
          {joinRequests.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#EF4444', mb: 0.5, display: 'block' }}>
                접근 신청 대기 ({joinRequests.length}건)
              </Typography>
              <Box sx={{ border: '1px solid #FECACA', borderRadius: 2, p: 0.5, bgcolor: '#FEF2F2' }}>
                {joinRequests.map((req: any) => (
                  <Box key={req.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6, px: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {req.username}
                        <Typography component="span" sx={{ fontSize: '0.68rem', color: '#9CA3AF', ml: 0.5 }}>({req.loginid})</Typography>
                      </Typography>
                    </Box>
                    <Button size="small" onClick={() => handleApproveJoinRequest(req.id, 'approve')} sx={{ minWidth: 0, fontSize: '0.68rem', color: '#22C55E', fontWeight: 700 }}>승인</Button>
                    <Button size="small" onClick={() => handleApproveJoinRequest(req.id, 'reject')} sx={{ minWidth: 0, fontSize: '0.68rem', color: '#EF4444', fontWeight: 700 }}>거절</Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>공간 삭제</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#374151' }}>
            <strong>{deleteConfirm?.name}</strong> 공간을 삭제하시겠습니까?
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF', mt: 1, display: 'block' }}>
            공간에 속한 프로젝트는 삭제되지 않으며, 기본 공간으로 이동됩니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: '#6B7280' }}>취소</Button>
          <Button variant="contained" onClick={handleDeleteSpace} sx={{ bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' } }}>삭제</Button>
        </DialogActions>
      </Dialog>

      {/* Import existing projects */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          기존 프로젝트 가져오기 → {currentSpaceName}
        </DialogTitle>
        <DialogContent>
          {unassignedProjects.length === 0 ? (
            <Typography sx={{ color: '#9CA3AF', textAlign: 'center', py: 4, fontSize: '0.85rem' }}>
              가져올 수 있는 프로젝트가 없습니다
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              {unassignedProjects.map(p => (
                <Paper
                  key={p.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)' }}
                  elevation={0}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.name}</Typography>
                    {p.description && <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.7rem' }}>{p.description}</Typography>}
                  </Box>
                  <Button
                    size="small" variant="outlined"
                    startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                    onClick={() => handleImportProject(p.id)}
                    sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, borderColor: '#2955FF', color: '#2955FF' }}
                  >
                    가져오기
                  </Button>
                </Paper>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setImportDialogOpen(false)} sx={{ textTransform: 'none' }}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SpaceManagePage;
