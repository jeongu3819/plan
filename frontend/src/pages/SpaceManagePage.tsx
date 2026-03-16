/**
 * SpaceManagePage — Full space management:
 * - Search/browse all spaces (favorites, recent, full list with pagination)
 * - Delete spaces (owner only)
 * - Import existing projects into current space
 */

import React, { useState } from 'react';
import {
  Box, Typography, Paper, TextField, Chip, IconButton, Button,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Pagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Project } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';

const SPACES_PER_PAGE = 30;

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

  const { data: spaces = [] } = useQuery<any[]>({
    queryKey: ['spaces', currentUserId],
    queryFn: () => api.getSpaces(currentUserId),
    enabled: currentUserId > 0,
  });

  const { data: unassignedProjects = [] } = useQuery<Project[]>({
    queryKey: ['unassignedProjects', currentUserId],
    queryFn: () => api.getUnassignedProjects(currentUserId),
    enabled: currentUserId > 0 && importDialogOpen,
  });

  const q = search.trim().toLowerCase();
  const filtered = q ? spaces.filter((s: any) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)) : spaces;
  const totalPages = Math.ceil(filtered.length / SPACES_PER_PAGE);
  const pageSpaces = filtered.slice(page * SPACES_PER_PAGE, (page + 1) * SPACES_PER_PAGE);

  const favSpaces = spaces.filter((s: any) => favoriteIds.includes(s.id));
  const recentSpaces = recentIds.map(id => spaces.find((s: any) => s.id === id)).filter(Boolean).slice(0, 10);

  const handleDeleteSpace = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteSpace(deleteConfirm.id, currentUserId);
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
    setCurrentSpace(s.id, s.name, s.slug);
    // Track recent
    const recent = [s.id, ...recentIds.filter((x: number) => x !== s.id)].slice(0, 10);
    localStorage.setItem('plan-a-recent-spaces', JSON.stringify(recent));
    navigate(`/space/${s.slug}`);
  };

  const renderSpaceRow = (s: any) => {
    const isOwner = s.members?.some((m: any) => m.user_id === currentUserId && m.role === 'owner');
    return (
      <Paper
        key={s.id}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2,
          border: s.id === currentSpaceId ? '2px solid #2955FF' : '1px solid rgba(0,0,0,0.06)',
          bgcolor: s.id === currentSpaceId ? '#EEF2FF' : 'rgba(255,255,255,0.7)',
          cursor: 'pointer', transition: 'all 0.15s',
          '&:hover': { borderColor: '#C7D2FE', boxShadow: '0 2px 8px rgba(41,85,255,0.08)' },
        }}
        elevation={0}
        onClick={() => selectSpace(s)}
      >
        <IconButton size="small" onClick={e => { e.stopPropagation(); toggleFav(s.id); }} sx={{ p: 0.3 }}>
          {favoriteIds.includes(s.id) ? <StarIcon sx={{ fontSize: 18, color: '#F59E0B' }} /> : <StarBorderIcon sx={{ fontSize: 18, color: '#D1D5DB' }} />}
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.name}</Typography>
          {s.description && <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.7rem' }}>{s.description}</Typography>}
        </Box>
        <Chip label={`${s.member_count}명`} size="small" sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#F3F4F6', color: '#6B7280' }} />
        <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.6rem', minWidth: 70, textAlign: 'right' }}>
          /space/{s.slug}
        </Typography>
        {isOwner && (
          <Tooltip title="공간 삭제">
            <IconButton size="small" onClick={e => { e.stopPropagation(); setDeleteConfirm(s); }} sx={{ color: '#D1D5DB', '&:hover': { color: '#EF4444' } }}>
              <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WorkspacesIcon sx={{ fontSize: 24, color: '#2955FF' }} />
          <Typography variant="h5" sx={{ fontWeight: 800 }}>공간 관리</Typography>
        </Box>
        {currentSpaceId && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<MoveToInboxIcon sx={{ fontSize: 16 }} />}
            onClick={() => setImportDialogOpen(true)}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderColor: '#059669', color: '#059669', '&:hover': { bgcolor: '#ECFDF5' } }}
          >
            기존 프로젝트 가져오기
          </Button>
        )}
      </Box>

      {/* Search */}
      <TextField
        fullWidth size="small" placeholder="공간 이름 또는 URL로 검색..."
        value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
        InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 18, color: '#9CA3AF', mr: 1 }} /> }}
        sx={{ mb: 3, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />

      {/* Favorites */}
      {favSpaces.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, fontSize: '0.68rem', color: '#F59E0B', letterSpacing: '0.08em', mb: 1, display: 'block' }}>
            즐겨찾기 공간
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {favSpaces.map(renderSpaceRow)}
          </Box>
        </Box>
      )}

      {/* Recent */}
      {recentSpaces.length > 0 && !q && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" sx={{ fontWeight: 700, fontSize: '0.68rem', color: '#6B7280', letterSpacing: '0.08em', mb: 1, display: 'block' }}>
            최근 사용한 공간
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentSpaces.map((s: any) => renderSpaceRow(s))}
          </Box>
        </Box>
      )}

      {/* All spaces */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, fontSize: '0.68rem', color: '#6B7280', letterSpacing: '0.08em', mb: 1, display: 'block' }}>
          전체 공간 목록 ({filtered.length}개)
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {pageSpaces.length === 0 && (
            <Typography sx={{ textAlign: 'center', color: '#9CA3AF', py: 4, fontSize: '0.85rem' }}>
              {q ? '검색 결과가 없습니다' : '공간이 없습니다'}
            </Typography>
          )}
          {pageSpaces.map((s: any) => renderSpaceRow(s))}
        </Box>
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Pagination count={totalPages} page={page + 1} onChange={(_, p) => setPage(p - 1)} />
          </Box>
        )}
      </Box>

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
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                    borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)',
                  }}
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
