import React, { useState, useMemo, useEffect } from 'react';
import Lottie from 'lottie-react';
import pandaAnimation from '../assets/lottie/panda-waving.json';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Switch,
  FormControlLabel,
  Collapse,
  Select,
  FormControl,
  InputLabel,
  Checkbox,
  Chip,
  Popover,
  Pagination,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import TimelineIcon from '@mui/icons-material/Timeline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PaletteIcon from '@mui/icons-material/Palette';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SettingsIcon from '@mui/icons-material/Settings';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon2 from '@mui/icons-material/KeyboardArrowDown';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import GroupsIcon from '@mui/icons-material/Groups';

import { useNavigate, useLocation, useParams } from 'react-router-dom';
import TemplateLibraryDialog from '../components/TemplateLibraryDialog';
import ImportUploadDialog from '../components/ImportUploadDialog';
import SpaceAccessDenied from '../components/SpaceAccessDenied';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Project, User, MemberGroup } from '../api/client';
import {
  deriveSidebarColor,
  deriveSidebarHover,
  deriveSidebarDivider,
  deriveSidebarMuted,
  autoTextColor,
} from '../utils/colorUtils';
import { useUser } from '../context/UserContext';
import { useAppStore } from '../stores/useAppStore';

const BG_PALETTE = [
  // Light
  '#F3F4F6',
  '#E5E5E5',
  '#EEF2FF',
  '#E0F2FE',
  '#ECFDF5',
  '#FEF9C3',
  '#FFF1F2',
  '#F3E8FF',
  // Muted
  '#D8CFDC',
  '#E7C9D1',
  '#E8C097',
  '#E6D395',
  '#B7C9BB',
  '#9EBFD6',
  '#B4C6D9',
  '#C7B8D4',
  // Dark
  '#5C6F8E',
  '#6F647F',
  '#6A4A3F',
  '#195B4E',
  '#3B5998',
  '#4A4A4A',
];

const SIDEBAR_WIDTH = 260;

const PROJECT_COLORS = [
  '#2955FF',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

const AVATAR_COLORS = [
  '#2955FF',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

const normalize = (v?: string) =>
  String(v || '')
    .trim()
    .toLowerCase();

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { spaceSlug: urlSpaceSlug } = useParams<{ spaceSlug?: string }>();
  const { user: me, loading: meLoading } = useUser();

  const queryClient = useQueryClient();

  const bgColor = useAppStore(state => state.bgColor);
  const setBgColor = useAppStore(state => state.setBgColor);
  const projectsCollapsed = useAppStore(state => state.projectsCollapsed);
  const toggleProjectsCollapsed = useAppStore(state => state.toggleProjectsCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Derived theme colors ──
  const theme = useMemo(() => {
    const sidebar = deriveSidebarColor(bgColor);
    const sidebarText = autoTextColor(sidebar);
    const sidebarMuted = deriveSidebarMuted(sidebar);
    const sidebarHover = deriveSidebarHover(sidebar);
    const sidebarDivider = deriveSidebarDivider(sidebar);
    return { sidebar, sidebarText, sidebarMuted, sidebarHover, sidebarDivider };
  }, [bgColor]);

  const currentUserId = useAppStore(state => state.currentUserId);
  const setCurrentUserId = useAppStore(state => state.setCurrentUserId);

  // ✅ 권한 판단은 SSO 실제 로그인 사용자 기준
  const meRole = normalize((me as any)?.role);
  const isSuperAdmin = meRole === 'super_admin';
  const isAdminLike = meRole === 'admin' || meRole === 'super_admin';

  // users 목록
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: !!me, // 로그인 사용자 확인 후 조회
  });

  // ✅ SSO 사용자(loginid)와 DB users 매핑
  const meDbUser = users.find(u => u.loginid === me?.loginid);
  const meUserId = meDbUser?.id ?? 0;

  // store currentUserId가 비어있으면 me(loginid)로 채움
  useEffect(() => {
    if (!me?.loginid) return;
    if (currentUserId > 0) return;

    const matched = users.find(u => u.loginid === me.loginid);
    if (matched?.id) setCurrentUserId(matched.id);
  }, [me?.loginid, users, currentUserId, setCurrentUserId]);

  // ✅ super_admin만 "유저 전환" 가능 / 그 외는 항상 본인으로 고정
  const effectiveUserId = isSuperAdmin ? currentUserId || meUserId : meUserId;

  useEffect(() => {
    // super_admin이 아니면 무조건 meUserId로 고정
    if (!meLoading && me && !isSuperAdmin && meUserId > 0 && currentUserId !== meUserId) {
      setCurrentUserId(meUserId);
    }
  }, [meLoading, me, isSuperAdmin, meUserId, currentUserId, setCurrentUserId]);

  // 화면 표시용 현재 사용자
  const currentUser =
    users.find(u => u.id === effectiveUserId) ??
    users.find(u => u.loginid === me?.loginid) ??
    users[0];

  // spaces
  const currentSpaceId = useAppStore(state => state.currentSpaceId);
  const currentSpaceSlug = useAppStore(state => state.currentSpaceSlug);
  const setCurrentSpace = useAppStore(state => state.setCurrentSpace);

  // Space-aware path helper
  const sp = (path: string) => currentSpaceSlug ? `/space/${currentSpaceSlug}${path}` : path;

  const { data: spaces = [] } = useQuery<any[]>({
    queryKey: ['spaces', effectiveUserId],
    queryFn: () => api.getSpaces(effectiveUserId),
    enabled: !!me && effectiveUserId > 0,
  });

  // Check space access when user navigates to a space URL
  const { data: spaceAccess } = useQuery({
    queryKey: ['spaceAccess', urlSpaceSlug, effectiveUserId],
    queryFn: () => api.getSpaceBySlug(urlSpaceSlug!, effectiveUserId),
    enabled: !!urlSpaceSlug && effectiveUserId > 0,
  });

  // Pending join requests for current space (for owner/admin badge)
  const { data: joinRequests = [] } = useQuery<any[]>({
    queryKey: ['spaceJoinRequests', currentSpaceId, effectiveUserId],
    queryFn: () => api.getSpaceJoinRequests(currentSpaceId!, effectiveUserId),
    enabled: !!currentSpaceId && effectiveUserId > 0,
    retry: false,
  });

  // Sync space from URL or auto-select first space
  React.useEffect(() => {
    if (urlSpaceSlug && spaceAccess?.is_member) {
      const s = spaces.find((sp: any) => sp.slug === urlSpaceSlug);
      if (s && s.id !== currentSpaceId) {
        setCurrentSpace(s.id, s.name, s.slug);
      }
    } else if (!urlSpaceSlug && spaces.length > 0 && !currentSpaceId) {
      setCurrentSpace(spaces[0].id, spaces[0].name, spaces[0].slug);
    }
  }, [spaces, urlSpaceSlug, spaceAccess, currentSpaceId, setCurrentSpace]);

  // projects (filtered by current space)
  const { data: allProjects = [] } = useQuery<Project[]>({
    queryKey: ['projects', effectiveUserId, currentSpaceId],
    queryFn: () => api.getProjects(effectiveUserId, currentSpaceId),
    enabled: !!me && effectiveUserId > 0,
  });

  const { data: memberGroups = [] } = useQuery<MemberGroup[]>({
    queryKey: ['memberGroups', effectiveUserId],
    queryFn: () => api.getMemberGroups(effectiveUserId),
    enabled: !!me && effectiveUserId > 0,
  });

  // hidden projects
  const { data: hiddenProjectIds = [] } = useQuery<number[]>({
    queryKey: ['hiddenProjects', effectiveUserId],
    queryFn: () => api.getHiddenProjects(effectiveUserId),
    enabled: !!me && effectiveUserId > 0,
  });

  const [showHidden, setShowHidden] = useState(false);
  const hiddenSet = new Set(hiddenProjectIds);
  const projects = showHidden ? allProjects : allProjects.filter(p => !hiddenSet.has(p.id));

  const toggleHideMut = useMutation({
    mutationFn: (projectId: number) => api.toggleHiddenProject(effectiveUserId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hiddenProjects', effectiveUserId] });
    },
  });

  const renameProjectMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.updateProject(id, { name }, effectiveUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setRenamingProjectId(null);
    },
    onError: () => setRenamingProjectId(null),
  });

  // non-super_admin에게 super_admin 계정 노출 최소화 (프론트 1차)
  const safeUsers = isSuperAdmin ? users : users.filter(u => u.role !== 'super_admin');

  // Switch User 메뉴에서 보여줄 사용자 (메뉴 자체는 super_admin만 열림)
  const visibleUsersForSwitch = isSuperAdmin ? users : currentUser ? [currentUser] : [];

  // 프로젝트 멤버 선택에서도 super_admin 숨김(본인 제외)
  const usersForMemberSelection = safeUsers.filter(u => u.id !== effectiveUserId);

  // Dialogs & menus
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceDesc, setNewSpaceDesc] = useState('');
  const [spaceSelectedUserIds, setSpaceSelectedUserIds] = useState<number[]>([]);
  const [spaceUserSearch, setSpaceUserSearch] = useState('');
  const [spaceManageMode, setSpaceManageMode] = useState<'create' | 'manage'>('create');
  const [managingSpace, setManagingSpace] = useState<any>(null);
  const [spacePickerAnchor, setSpacePickerAnchor] = useState<HTMLElement | null>(null);
  const [spaceSearchQuery, setSpaceSearchQuery] = useState('');
  const [spaceListPage, setSpaceListPage] = useState(0);
  const SPACES_PER_PAGE = 30;

  // Favorites (localStorage)
  const [favoriteSpaceIds, setFavoriteSpaceIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('plan-a-fav-spaces') || '[]'); } catch { return []; }
  });
  const toggleFavorite = (id: number) => {
    setFavoriteSpaceIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('plan-a-fav-spaces', JSON.stringify(next));
      return next;
    });
  };

  // Recently used (localStorage, max 10)
  const [recentSpaceIds, setRecentSpaceIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('plan-a-recent-spaces') || '[]'); } catch { return []; }
  });
  const trackRecent = (id: number) => {
    setRecentSpaceIds(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, 10);
      localStorage.setItem('plan-a-recent-spaces', JSON.stringify(next));
      return next;
    });
  };

  const selectSpace = (s: any) => {
    setCurrentSpace(s.id, s.name, s.slug);
    trackRecent(s.id);
    setSpacePickerAnchor(null);
    navigate(`/space/${s.slug}`);
  };
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectVisibility, setNewProjectVisibility] = useState<'private' | 'public'>('private');
  const [requireApproval, setRequireApproval] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [permissions, setPermissions] = useState({
    post_write: 'all',
    post_edit: 'all',
    post_view: 'all',
    comment_write: 'all',
    file_view: 'all',
    file_download: 'all',
  });
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);

  const [projectMenuAnchor, setProjectMenuAnchor] = useState<null | HTMLElement>(null);
  const [projectMenuId, setProjectMenuId] = useState<number | null>(null);

  // Sidebar inline rename
  const [renamingProjectId, setRenamingProjectId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ✅ Add Member(사용자 추가) 기능 추가
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newLoginId, setNewLoginId] = useState('');

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: () =>
      api.createProject({
        name: newProjectName.trim(),
        description: newProjectDescription.trim() || undefined,
        owner_id: effectiveUserId,
        visibility: newProjectVisibility,
        require_approval: isAdminLike ? requireApproval : false,
        permissions: isAdminLike ? permissions : undefined,
        member_ids: isAdminLike ? selectedMemberIds : [],
        space_id: currentSpaceId || undefined,
      }),
    onSuccess: newProject => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setProjectDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectVisibility('private');
      setRequireApproval(false);
      setAdvancedOpen(false);
      setSelectedMemberIds([]);
      setPermissions({
        post_write: 'all',
        post_edit: 'all',
        post_view: 'all',
        comment_write: 'all',
        file_view: 'all',
        file_download: 'all',
      });
      if (newProject?.id) navigate(sp(`/project/${newProject.id}`));
    },
    onError: (err: any) => {
      console.error('Project creation failed:', err);
      alert(
        `프로젝트 생성에 실패했습니다: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`
      );
    },
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        username: newUsername.trim(),
        loginid: newLoginId.trim(),
        avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setUserDialogOpen(false);
      setNewUsername('');
      setNewLoginId('');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '사용자 추가 실패');
    },
  });

  if (meLoading) return null;
  if (!me) return null; // UserProvider가 로그인 리다이렉트 처리

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ─── Sidebar ─── */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          bgcolor: theme.sidebar,
          color: theme.sidebarMuted,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'background-color 0.3s ease',
        }}
      >
        {/* Logo */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }} onClick={() => navigate(sp('/'))}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              overflow: 'hidden',
              flexShrink: 0,
              bgcolor: 'transparent',
            }}
          >
            <Lottie
              animationData={pandaAnimation}
              loop
              autoplay
              style={{ width: '100%', height: '100%' }}
            />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                color: theme.sidebarText,
                fontWeight: 800,
                fontSize: '1rem',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              PLAN-A
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: theme.sidebarMuted,
                fontSize: '0.62rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
              }}
            >
              Schedule Platform from A-FAB
            </Typography>
          </Box>
        </Box>

        {/* Space Selector + Create */}
        <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 0.5, alignItems: 'center' }}>
          {/* Clickable space button → opens picker popover */}
          <Box
            onClick={e => { setSpacePickerAnchor(e.currentTarget); setSpaceSearchQuery(''); setSpaceListPage(0); }}
            sx={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 1,
              px: 1.5, py: 0.7, borderRadius: 2, cursor: 'pointer',
              bgcolor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)' },
              transition: 'all 0.15s',
            }}
          >
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: theme.sidebarText, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {spaces.find((s: any) => s.id === currentSpaceId)?.name || '공간 선택'}
            </Typography>
            <ExpandMoreIcon2 sx={{ fontSize: 16, color: theme.sidebarMuted }} />
          </Box>
          <Tooltip title="공간 생성 / 관리">
            <IconButton
              size="small"
              onClick={() => {
                setSpaceManageMode('create');
                setNewSpaceName('');
                setNewSpaceDesc('');
                setSpaceSelectedUserIds([]);
                setSpaceDialogOpen(true);
              }}
              sx={{
                color: theme.sidebarMuted,
                bgcolor: 'rgba(255,255,255,0.06)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', color: '#2955FF' },
                width: 30, height: 30,
              }}
            >
              <AddIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          {/* Manage current space (gear icon + join request badge) */}
          {currentSpaceId && (
            <Tooltip title={joinRequests.length > 0 ? `공간 관리 (${joinRequests.length}건 접근 신청)` : '현재 공간 관리'}>
              <IconButton
                size="small"
                onClick={() => {
                  const s = spaces.find((sp: any) => sp.id === currentSpaceId);
                  if (s) {
                    setManagingSpace(s);
                    setNewSpaceName(s.name);
                    setNewSpaceDesc(s.description || '');
                    setSpaceSelectedUserIds(s.members?.map((m: any) => m.user_id) || []);
                    setSpaceManageMode('manage');
                    setSpaceDialogOpen(true);
                  }
                }}
                sx={{
                  color: theme.sidebarMuted,
                  bgcolor: 'rgba(255,255,255,0.06)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.15)', color: '#F59E0B' },
                  width: 30, height: 30,
                  position: 'relative',
                }}
              >
                <SettingsIcon sx={{ fontSize: 14 }} />
                {joinRequests.length > 0 && (
                  <Box sx={{
                    position: 'absolute', top: -2, right: -2,
                    width: 14, height: 14, borderRadius: '50%',
                    bgcolor: '#EF4444', color: '#fff',
                    fontSize: '0.5rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {joinRequests.length}
                  </Box>
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Space Picker Popover */}
        <Popover
          open={Boolean(spacePickerAnchor)}
          anchorEl={spacePickerAnchor}
          onClose={() => setSpacePickerAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { width: 320, maxHeight: 480, borderRadius: 2, mt: 0.5, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } } }}
        >
          <Box sx={{ p: 1.5 }}>
            {/* Search */}
            <TextField
              fullWidth size="small" placeholder="공간 검색..."
              value={spaceSearchQuery} onChange={e => { setSpaceSearchQuery(e.target.value); setSpaceListPage(0); }}
              InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: '#9CA3AF', mr: 0.5 }} /> }}
              sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { fontSize: '0.8rem', borderRadius: 1.5 } }}
            />

            {/* Favorites */}
            {(() => {
              const favSpaces = spaces.filter((s: any) => favoriteSpaceIds.includes(s.id));
              if (favSpaces.length === 0) return null;
              return (
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, px: 0.5 }}>
                    즐겨찾기 공간
                  </Typography>
                  {favSpaces.map((s: any) => (
                    <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.4, px: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: '#F9FAFB' }, bgcolor: s.id === currentSpaceId ? '#EEF2FF' : 'transparent' }}>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); toggleFavorite(s.id); }} sx={{ p: 0.2 }}>
                        <StarIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
                      </IconButton>
                      <Typography onClick={() => selectSpace(s)} sx={{ fontSize: '0.78rem', fontWeight: s.id === currentSpaceId ? 700 : 500, flex: 1, cursor: 'pointer' }}>
                        {s.name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })()}

            {/* Recent */}
            {(() => {
              const recentSpaces = recentSpaceIds.map(id => spaces.find((s: any) => s.id === id)).filter(Boolean).slice(0, 10);
              if (recentSpaces.length === 0) return null;
              return (
                <Box sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, px: 0.5 }}>
                    최근 사용한 공간
                  </Typography>
                  {recentSpaces.map((s: any) => (
                    <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.4, px: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: '#F9FAFB' }, bgcolor: s.id === currentSpaceId ? '#EEF2FF' : 'transparent' }}>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); toggleFavorite(s.id); }} sx={{ p: 0.2 }}>
                        {favoriteSpaceIds.includes(s.id) ? <StarIcon sx={{ fontSize: 14, color: '#F59E0B' }} /> : <StarBorderIcon sx={{ fontSize: 14, color: '#D1D5DB' }} />}
                      </IconButton>
                      <Typography onClick={() => selectSpace(s)} sx={{ fontSize: '0.78rem', fontWeight: s.id === currentSpaceId ? 700 : 500, flex: 1, cursor: 'pointer' }}>
                        {s.name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })()}

            {/* All spaces (searchable, paginated) */}
            <Divider sx={{ mb: 1 }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, px: 0.5 }}>
              공간 목록
            </Typography>
            {(() => {
              const q = spaceSearchQuery.trim().toLowerCase();
              const filtered = q ? spaces.filter((s: any) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q)) : spaces;
              const totalPages = Math.ceil(filtered.length / SPACES_PER_PAGE);
              const pageSpaces = filtered.slice(spaceListPage * SPACES_PER_PAGE, (spaceListPage + 1) * SPACES_PER_PAGE);
              return (
                <>
                  <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                    {pageSpaces.length === 0 && (
                      <Typography sx={{ fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center', py: 2 }}>검색 결과가 없습니다</Typography>
                    )}
                    {pageSpaces.map((s: any) => (
                      <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.4, px: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: '#F9FAFB' }, bgcolor: s.id === currentSpaceId ? '#EEF2FF' : 'transparent' }}>
                        <IconButton size="small" onClick={e => { e.stopPropagation(); toggleFavorite(s.id); }} sx={{ p: 0.2 }}>
                          {favoriteSpaceIds.includes(s.id) ? <StarIcon sx={{ fontSize: 14, color: '#F59E0B' }} /> : <StarBorderIcon sx={{ fontSize: 14, color: '#D1D5DB' }} />}
                        </IconButton>
                        <Typography onClick={() => selectSpace(s)} sx={{ fontSize: '0.78rem', fontWeight: s.id === currentSpaceId ? 700 : 500, flex: 1, cursor: 'pointer' }}>
                          {s.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: '#9CA3AF' }}>{s.member_count}명</Typography>
                      </Box>
                    ))}
                  </Box>
                  {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                      <Pagination count={totalPages} page={spaceListPage + 1} onChange={(_, p) => setSpaceListPage(p - 1)} size="small" />
                    </Box>
                  )}
                </>
              );
            })()}

            {/* Create new space button */}
            <Divider sx={{ my: 1 }} />
            <Button
              fullWidth size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={() => {
                setSpacePickerAnchor(null);
                setSpaceManageMode('create');
                setNewSpaceName(''); setNewSpaceDesc(''); setSpaceSelectedUserIds([]);
                setSpaceDialogOpen(true);
              }}
              sx={{ textTransform: 'none', fontSize: '0.78rem', fontWeight: 600, color: '#2955FF', justifyContent: 'flex-start' }}
            >
              새 공간 만들기
            </Button>
          </Box>
        </Popover>

        <Divider sx={{ borderColor: '#2A2F52', mx: 1.5 }} />

        {/* Main Menu */}
        <List sx={{ px: 1, py: 1 }}>
          {[
            { text: 'Dashboard', icon: <DashboardIcon />, path: sp('/') },
            {
              text: 'Kanban Board',
              icon: <ViewKanbanIcon />,
              path: sp('/project/kanbanboard'),
            },
            { text: '전체 로드맵', icon: <TimelineIcon />, path: sp('/roadmap') },
            { text: '@나를 언급', icon: <AlternateEmailIcon />, path: sp('/mentions') },
            { text: '그룹', icon: <GroupsIcon />, path: sp('/groups') },
            {
              text: 'AI Settings',
              icon: <AutoAwesomeIcon />,
              path: sp('/ai-settings'),
              superAdminOnly: true,
            },
          ]
            .filter(item => !(item as any).superAdminOnly || isSuperAdmin)
            .map(item => {
              const isActive = location.pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 0.3 }}>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: 1.5,
                      py: 1,
                      px: 1.5,
                      color: isActive ? theme.sidebarText : theme.sidebarMuted,
                      bgcolor: isActive ? `${theme.sidebarHover}` : 'transparent',
                      '&:hover': { bgcolor: theme.sidebarHover },
                    }}
                  >
                    <ListItemIcon
                      sx={{ color: isActive ? '#2955FF' : theme.sidebarMuted, minWidth: 36 }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: '0.85rem',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
        </List>

        {/* Projects - flex-growing, scrollable middle section */}
        <Box
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box
            onClick={toggleProjectsCollapsed}
            sx={{
              px: 2.5,
              pt: 2,
              pb: 0.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              '&:hover': { opacity: 0.8 },
              flexShrink: 0,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: theme.sidebarMuted,
                fontWeight: 600,
                fontSize: '0.7rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Projects
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {hiddenProjectIds.length > 0 && (
                <Tooltip title={showHidden ? '숨긴 프로젝트 숨기기' : `숨긴 프로젝트 ${hiddenProjectIds.length}개 보기`}>
                  <VisibilityOffIcon
                    onClick={e => { e.stopPropagation(); setShowHidden(!showHidden); }}
                    sx={{
                      fontSize: 14, cursor: 'pointer',
                      color: showHidden ? '#2955FF' : theme.sidebarMuted,
                      '&:hover': { color: theme.sidebarText },
                      transition: 'color 0.15s',
                    }}
                  />
                </Tooltip>
              )}
              <Tooltip title="New Project">
                <AddIcon
                  onClick={e => {
                    e.stopPropagation();
                    setProjectDialogOpen(true);
                  }}
                  sx={{
                    fontSize: 16,
                    color: theme.sidebarMuted,
                    cursor: 'pointer',
                    '&:hover': { color: theme.sidebarText },
                    transition: 'color 0.15s',
                  }}
                />
              </Tooltip>
              {projectsCollapsed ? (
                <ExpandMoreIcon sx={{ fontSize: 16, color: theme.sidebarMuted }} />
              ) : (
                <ExpandLessIcon sx={{ fontSize: 16, color: theme.sidebarMuted }} />
              )}
            </Box>
          </Box>

          <Collapse in={!projectsCollapsed} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
            <List sx={{ px: 1, pb: 1 }}>
              {projects.map((project, index) => {
                const isActive = location.pathname === `/project/${project.id}`;
                const dotColor = PROJECT_COLORS[index % PROJECT_COLORS.length];
                return (
                  <ListItem
                    key={project.id}
                    disablePadding
                    sx={{ mb: 0.3 }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={e => {
                          e.stopPropagation();
                          setProjectMenuAnchor(e.currentTarget);
                          setProjectMenuId(project.id);
                        }}
                        sx={{
                          color: theme.sidebarMuted,
                          opacity: 0,
                          '.MuiListItem-root:hover &': { opacity: 1 },
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <MoreVertIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    }
                  >
                    <Tooltip title={project.name} placement="right" arrow>
                      <ListItemButton
                        onClick={() => {
                          if (renamingProjectId !== project.id) navigate(sp(`/project/${project.id}`));
                        }}
                        onDoubleClick={() => {
                          const isProjectOwner = project.owner_id === effectiveUserId;
                          if (isProjectOwner || isSuperAdmin) {
                            setRenamingProjectId(project.id);
                            setRenameValue(project.name);
                          }
                        }}
                        sx={{
                          borderRadius: 1.5,
                          py: 0.8,
                          px: 1.5,
                          color: isActive ? theme.sidebarText : theme.sidebarMuted,
                          bgcolor: isActive ? theme.sidebarHover : 'transparent',
                          '&:hover': { bgcolor: theme.sidebarHover },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: isActive ? '#2955FF' : '#22C55E',
                            }}
                          />
                        </ListItemIcon>
                        {renamingProjectId === project.id ? (
                          <TextField
                            autoFocus
                            size="small"
                            variant="standard"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && renameValue.trim()) {
                                renameProjectMut.mutate({ id: project.id, name: renameValue.trim() });
                              }
                              if (e.key === 'Escape') {
                                setRenamingProjectId(null);
                              }
                            }}
                            onBlur={() => {
                              if (renameValue.trim() && renameValue.trim() !== project.name) {
                                renameProjectMut.mutate({ id: project.id, name: renameValue.trim() });
                              } else {
                                setRenamingProjectId(null);
                              }
                            }}
                            InputProps={{
                              disableUnderline: false,
                              sx: {
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: theme.sidebarText,
                              },
                            }}
                            sx={{ flex: 1 }}
                          />
                        ) : (
                          <ListItemText
                            primary={project.name}
                            primaryTypographyProps={{
                              fontSize: '0.85rem',
                              fontWeight: isActive ? 600 : 400,
                              sx: {
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                                lineHeight: 1.4,
                              },
                            }}
                          />
                        )}
                      </ListItemButton>
                    </Tooltip>
                  </ListItem>
                );
              })}
            </List>
          </Collapse>
        </Box>

        {/* Bottom fixed section - Admin/Trash/User/Theme */}
        <Box sx={{ flexShrink: 0 }}>
          <Divider sx={{ borderColor: theme.sidebarDivider, mx: 1.5 }} />


          {/* User Selector */}
          <Box sx={{ p: 1.5 }}>
            <Box
              onClick={e => {
                if (!isSuperAdmin) return; // ✅ 기존 정책 유지: super_admin만 전환 메뉴 오픈
                setUserMenuAnchor(e.currentTarget);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1,
                borderRadius: 1.5,
                cursor: isSuperAdmin ? 'pointer' : 'default',
                '&:hover': { bgcolor: isSuperAdmin ? theme.sidebarHover : 'transparent' },
                transition: 'background 0.15s',
              }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  bgcolor: currentUser?.avatar_color || '#2955FF',
                }}
              >
                {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: theme.sidebarText,
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    lineHeight: 1.2,
                  }}
                  noWrap
                >
                  {currentUser?.username || 'Select User'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: theme.sidebarMuted, fontSize: '0.65rem' }}
                >
                  {currentUser?.role || 'member'}
                </Typography>
              </Box>
              <SwapHorizIcon sx={{ color: theme.sidebarMuted, fontSize: '1rem' }} />
            </Box>
          </Box>

          {/* ── Background Color Palette ── */}
          <Divider sx={{ borderColor: theme.sidebarDivider, mx: 1.5 }} />
          <Box sx={{ px: 1.5, py: 1 }}>
            <Box
              onClick={() => setPaletteOpen(!paletteOpen)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1.5,
                cursor: 'pointer',
                '&:hover': { bgcolor: theme.sidebarHover },
                transition: 'background 0.15s',
              }}
            >
              <PaletteIcon sx={{ fontSize: '1rem', color: theme.sidebarMuted }} />
              <Typography
                variant="caption"
                sx={{ color: theme.sidebarMuted, fontWeight: 600, fontSize: '0.7rem' }}
              >
                Theme
              </Typography>
              <Box
                sx={{
                  ml: 'auto',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  bgcolor: bgColor,
                  border: `2px solid ${theme.sidebarDivider}`,
                }}
              />
            </Box>
            {paletteOpen && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mt: 0.8, px: 0.5 }}>
                {BG_PALETTE.map(color => (
                  <Tooltip key={color} title={color} placement="top">
                    <Box
                      onClick={() => setBgColor(color)}
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: color,
                        cursor: 'pointer',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        border: bgColor === color ? '2.5px solid #2955FF' : '2px solid transparent',
                        boxShadow: bgColor === color ? '0 0 0 2px rgba(41, 85, 255, 0.3)' : 'none',
                        '&:hover': {
                          transform: 'scale(1.2)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        },
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* ─── Main Content ─── */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          bgcolor: bgColor,
          p: 3,
          transition: 'background-color 0.3s ease',
        }}
      >
        {/* Space access check */}
        {urlSpaceSlug && spaceAccess && !spaceAccess.is_member ? (
          <SpaceAccessDenied spaceId={spaceAccess.id} spaceName={spaceAccess.name} hasPendingRequest={spaceAccess.pending_request} />
        ) : children}
      </Box>

      {/* ─── Project Context Menu ─── */}
      <Menu
        anchorEl={projectMenuAnchor}
        open={Boolean(projectMenuAnchor)}
        onClose={() => setProjectMenuAnchor(null)}
        PaperProps={{
          sx: { borderRadius: 2, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' },
        }}
      >
        <MenuItem
          onClick={() => {
            setProjectMenuAnchor(null);
            if (projectMenuId) navigate(sp(`/project/${projectMenuId}`));
          }}
          sx={{ fontSize: '0.85rem' }}
        >
          Open Project
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (projectMenuId) toggleHideMut.mutate(projectMenuId);
            setProjectMenuAnchor(null);
          }}
          sx={{ fontSize: '0.85rem', color: '#6B7280' }}
        >
          {projectMenuId && hiddenSet.has(projectMenuId) ? '숨기기 해제' : '숨기기'}
        </MenuItem>
      </Menu>

      {/* ─── User Switch Menu ─── */}
      <Menu
        anchorEl={userMenuAnchor}
        open={Boolean(userMenuAnchor) && isSuperAdmin}
        onClose={() => setUserMenuAnchor(null)}
        PaperProps={{
          sx: { borderRadius: 2, minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' },
        }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              color: '#6B7280',
              textTransform: 'uppercase',
              fontSize: '0.65rem',
              letterSpacing: '0.05em',
            }}
          >
            Switch User
          </Typography>
        </Box>

        {visibleUsersForSwitch.map(user => (
          <MenuItem
            key={user.id}
            onClick={() => {
              if (!isSuperAdmin) return;
              setCurrentUserId(user.id);
              setUserMenuAnchor(null);
              queryClient.removeQueries(); // permission-scoped refetch
            }}
            selected={user.id === currentUserId}
            sx={{ fontSize: '0.85rem', py: 1 }}
          >
            <Avatar
              sx={{
                width: 24,
                height: 24,
                fontSize: '0.6rem',
                mr: 1.5,
                bgcolor: user.avatar_color || '#2955FF',
              }}
            >
              {user.username.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>
                {user.username}
              </Typography>
              <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                {user.role || 'member'}
              </Typography>
            </Box>
          </MenuItem>
        ))}

        <Divider />

        {/* ✅ Add Member 기능 추가 */}
        <MenuItem
          onClick={() => {
            setUserMenuAnchor(null);
            setUserDialogOpen(true);
          }}
          sx={{ fontSize: '0.85rem', color: '#2955FF' }}
        >
          <PersonAddIcon sx={{ fontSize: '1rem', mr: 1 }} /> Add Member
        </MenuItem>
      </Menu>

      {/* ─── New Project Dialog (Enhanced) ─── */}
      <Dialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>새 프로젝트</Typography>
            <Box sx={{ display: 'flex', gap: 0.8 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setProjectDialogOpen(false);
                  setTemplateLibraryOpen(true);
                }}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: '0.72rem',
                  borderColor: '#D1D5DB', color: '#6B7280', borderRadius: 1.5,
                  px: 1.5, py: 0.3, minWidth: 0,
                  '&:hover': { bgcolor: '#F5F3FF', borderColor: '#7C3AED', color: '#7C3AED' },
                }}
              >
                템플릿
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setProjectDialogOpen(false);
                  setImportDialogOpen(true);
                }}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: '0.72rem',
                  borderColor: '#D1D5DB', color: '#6B7280', borderRadius: 1.5,
                  px: 1.5, py: 0.3, minWidth: 0,
                  '&:hover': { bgcolor: '#ECFDF5', borderColor: '#059669', color: '#059669' },
                }}
              >
                파일 가져오기
              </Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="프로젝트 제목 *"
            placeholder="예: 마케팅 캠페인"
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && newProjectName.trim()) createProjectMutation.mutate();
            }}
          />
          <TextField
            fullWidth
            label="프로젝트 설명"
            placeholder="프로젝트에 대한 간단한 설명을 입력하세요"
            multiline
            rows={2}
            value={newProjectDescription}
            onChange={e => setNewProjectDescription(e.target.value)}
            sx={{ mb: 2 }}
          />
          {/* 공개 범위 */}
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em', mb: 0.5, display: 'block' }}
            >
              공개 범위
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {[
                { value: 'private' as const, label: '비공개', desc: '나와 담당자만 볼 수 있습니다' },
                { value: 'public' as const, label: '공개', desc: '모든 사용자가 볼 수 있습니다' },
              ].map(opt => (
                <Box
                  key={opt.value}
                  onClick={() => setNewProjectVisibility(opt.value)}
                  sx={{
                    flex: 1, p: 1.5, borderRadius: 2, cursor: 'pointer',
                    border: newProjectVisibility === opt.value ? '2px solid #2955FF' : '1px solid #E5E7EB',
                    bgcolor: newProjectVisibility === opt.value ? '#EEF2FF' : 'transparent',
                    '&:hover': { borderColor: '#2955FF' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{opt.label}</Typography>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>{opt.desc}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {isAdminLike && (
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
              sx={{ mb: 1, ml: 0 }}
            />
          )}

          {/* Member Selection - admin/super_admin만 */}
          {isAdminLike && <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: '#6B7280',
                textTransform: 'uppercase',
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                mb: 0.5,
                display: 'block',
              }}
            >
              프로젝트 담당자 선택
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: '#9CA3AF', fontSize: '0.7rem', mb: 1, display: 'block' }}
            >
              선택된 사용자만 이 프로젝트를 조회할 수 있습니다. (생성자는 자동 포함)
            </Typography>
            {/* Group quick-add */}
            {memberGroups.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#2955FF', mb: 0.5, display: 'block', fontSize: '0.65rem' }}>
                  그룹으로 추가
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {memberGroups.map(g => {
                    const newIds = g.members
                      .map(m => m.user_id)
                      .filter(uid => uid !== effectiveUserId && !selectedMemberIds.includes(uid));
                    return (
                      <Chip
                        key={g.id}
                        label={`${g.name} (${g.member_count})`}
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          if (newIds.length > 0) {
                            setSelectedMemberIds(prev => [...new Set([...prev, ...newIds])]);
                          }
                        }}
                        disabled={newIds.length === 0}
                        sx={{
                          cursor: newIds.length > 0 ? 'pointer' : 'default',
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          height: 24,
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

            <Box
              sx={{
                maxHeight: 160,
                overflowY: 'auto',
                border: '1px solid #E5E7EB',
                borderRadius: 2,
                p: 0.5,
              }}
            >
              {usersForMemberSelection.map(user => (
                <Box
                  key={user.id}
                  onClick={() =>
                    setSelectedMemberIds(prev =>
                      prev.includes(user.id)
                        ? prev.filter(id => id !== user.id)
                        : [...prev, user.id]
                    )
                  }
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    px: 1,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#F3F4F6' },
                    bgcolor: selectedMemberIds.includes(user.id) ? '#EEF2FF' : 'transparent',
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={selectedMemberIds.includes(user.id)}
                    sx={{ p: 0.3 }}
                  />
                  <Avatar
                    sx={{
                      width: 22,
                      height: 22,
                      fontSize: '0.55rem',
                      bgcolor: user.avatar_color || '#2955FF',
                    }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    {user.username}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: '#9CA3AF', fontSize: '0.65rem', ml: 'auto' }}
                  >
                    {user.role || 'member'}
                  </Typography>
                </Box>
              ))}
              {usersForMemberSelection.length === 0 && (
                <Typography
                  variant="body2"
                  sx={{ color: '#9CA3AF', fontSize: '0.8rem', textAlign: 'center', py: 2 }}
                >
                  추가할 수 있는 사용자가 없습니다
                </Typography>
              )}
            </Box>
          </Box>}

          {isAdminLike && <>
          <Divider sx={{ my: 1.5 }} />
          {/* Collapsible Advanced Settings */}
          <Box
            onClick={() => setAdvancedOpen(!advancedOpen)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              py: 1,
              '&:hover': { color: '#2955FF' },
              transition: 'color 0.15s',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', flexGrow: 1 }}>
              추가 설정
            </Typography>
            {advancedOpen ? (
              <ExpandLessIcon sx={{ fontSize: '1.2rem' }} />
            ) : (
              <ExpandMoreIcon sx={{ fontSize: '1.2rem' }} />
            )}
          </Box>

          <Collapse in={advancedOpen}>
            <Box sx={{ pl: 1, pt: 1 }}>
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
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>작성 권한</InputLabel>
                  <Select
                    native
                    value={permissions.post_write}
                    onChange={e =>
                      setPermissions({ ...permissions, post_write: e.target.value as string })
                    }
                    label="작성 권한"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <option value="all">전체</option>
                    <option value="admin">관리자</option>
                    <option value="members_only">프로젝트 담당자들만</option>
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>수정 권한</InputLabel>
                  <Select
                    native
                    value={permissions.post_edit}
                    onChange={e =>
                      setPermissions({ ...permissions, post_edit: e.target.value as string })
                    }
                    label="수정 권한"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <option value="all">전체</option>
                    <option value="admin">관리자</option>
                    <option value="members_only">프로젝트 담당자들만</option>
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>조회 권한</InputLabel>
                  <Select
                    native
                    value={permissions.post_view}
                    onChange={e =>
                      setPermissions({ ...permissions, post_view: e.target.value as string })
                    }
                    label="조회 권한"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <option value="all">전체</option>
                    <option value="members_only">프로젝트 담당자들만</option>
                  </Select>
                </FormControl>
              </Box>

              {/* Comment Permissions */}
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
                댓글 권한
              </Typography>
              <Box sx={{ mb: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>댓글 작성 권한</InputLabel>
                  <Select
                    native
                    value={permissions.comment_write}
                    onChange={e =>
                      setPermissions({ ...permissions, comment_write: e.target.value as string })
                    }
                    label="댓글 작성 권한"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <option value="all">전체</option>
                    <option value="members_only">프로젝트 담당자들만</option>
                  </Select>
                </FormControl>
              </Box>

              {/* File Permissions */}
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
                파일 권한
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>파일 조회 권한</InputLabel>
                  <Select
                    native
                    value={permissions.file_view}
                    onChange={e =>
                      setPermissions({ ...permissions, file_view: e.target.value as string })
                    }
                    label="파일 조회 권한"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <option value="all">전체</option>
                    <option value="members_only">프로젝트 담당자들만</option>
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel sx={{ fontSize: '0.8rem' }}>파일 다운로드 권한</InputLabel>
                  <Select
                    native
                    value={permissions.file_download}
                    onChange={e =>
                      setPermissions({ ...permissions, file_download: e.target.value as string })
                    }
                    label="파일 다운로드 권한"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    <option value="all">전체</option>
                    <option value="members_only">프로젝트 담당자들만</option>
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Collapse>
          </>}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setProjectDialogOpen(false)} sx={{ color: '#6B7280' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={() => createProjectMutation.mutate()}
            disabled={!newProjectName.trim()}
            sx={{ bgcolor: '#2955FF' }}
          >
            생성
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Template Library Dialog ─── */}
      <TemplateLibraryDialog
        open={templateLibraryOpen}
        onClose={() => setTemplateLibraryOpen(false)}
        currentUserId={effectiveUserId}
      />

      {/* ─── Import Upload Dialog ─── */}
      <ImportUploadDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        currentUserId={effectiveUserId}
      />

      {/* ─── Space Create/Manage Dialog ─── */}
      <Dialog
        open={spaceDialogOpen}
        onClose={() => setSpaceDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          {spaceManageMode === 'create' ? '새 공간 만들기' : `공간 관리: ${managingSpace?.name || ''}`}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="공간 이름 *"
            placeholder="예: DA파트, 개발팀"
            value={newSpaceName}
            onChange={e => setNewSpaceName(e.target.value)}
            sx={{ mt: 1, mb: 1 }}
            helperText={newSpaceName.trim() ? `URL: /space/${newSpaceName.trim().replace(/\s+/g, '-')}` : ''}
            FormHelperTextProps={{ sx: { fontSize: '0.68rem', color: '#2955FF' } }}
          />
          <TextField
            fullWidth
            label="설명 (선택)"
            placeholder="공간에 대한 간단한 설명"
            value={newSpaceDesc}
            onChange={e => setNewSpaceDesc(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* Member selection */}
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#374151', mb: 0.5, display: 'block' }}>
            멤버 선택 ({spaceSelectedUserIds.length}명)
          </Typography>
          <TextField
            size="small"
            fullWidth
            placeholder="이름, ID로 검색"
            value={spaceUserSearch}
            onChange={e => setSpaceUserSearch(e.target.value)}
            sx={{ mb: 1 }}
          />
          {/* Group quick-apply */}
          {memberGroups.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
              {memberGroups.map(g => (
                <Chip
                  key={g.id}
                  label={`${g.name} (${g.member_count})`}
                  size="small"
                  onClick={() => {
                    const groupUserIds = g.members.map((m: any) => m.user_id);
                    setSpaceSelectedUserIds(prev => {
                      const s = new Set(prev);
                      groupUserIds.forEach((id: number) => s.add(id));
                      return Array.from(s);
                    });
                  }}
                  sx={{
                    height: 22, fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                    bgcolor: '#EEF2FF', color: '#2955FF', border: '1px solid #C7D2FE',
                    '&:hover': { bgcolor: '#DBEAFE' },
                  }}
                />
              ))}
            </Box>
          )}
          <Box sx={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 2, p: 0.5 }}>
            {(users || [])
              .filter(u => {
                if (!spaceUserSearch.trim()) return true;
                const q = spaceUserSearch.toLowerCase();
                return (u.username || '').toLowerCase().includes(q) || (u.loginid || '').toLowerCase().includes(q);
              })
              .map(user => (
                <Box
                  key={user.id}
                  onClick={() =>
                    setSpaceSelectedUserIds(prev =>
                      prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id]
                    )
                  }
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    py: 0.6, px: 1.5, borderRadius: 1.5, cursor: 'pointer',
                    '&:hover': { bgcolor: '#F3F4F6' },
                    bgcolor: spaceSelectedUserIds.includes(user.id) ? '#EEF2FF' : 'transparent',
                  }}
                >
                  <Checkbox size="small" checked={spaceSelectedUserIds.includes(user.id)} sx={{ p: 0.3 }} />
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      {user.username}
                      <Typography component="span" sx={{ fontSize: '0.68rem', color: '#9CA3AF', ml: 0.5 }}>
                        ({user.loginid})
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
              ))}
          </Box>

          {/* Pending join requests (manage mode only) */}
          {spaceManageMode === 'manage' && joinRequests.length > 0 && (
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
                        <Typography component="span" sx={{ fontSize: '0.68rem', color: '#9CA3AF', ml: 0.5 }}>
                          ({req.loginid})
                        </Typography>
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      onClick={async () => {
                        await api.approveSpaceJoinRequest(currentSpaceId!, req.id, 'approve', effectiveUserId);
                        queryClient.invalidateQueries({ queryKey: ['spaceJoinRequests'] });
                        queryClient.invalidateQueries({ queryKey: ['spaces'] });
                      }}
                      sx={{ minWidth: 0, fontSize: '0.68rem', color: '#22C55E', fontWeight: 700 }}
                    >
                      승인
                    </Button>
                    <Button
                      size="small"
                      onClick={async () => {
                        await api.approveSpaceJoinRequest(currentSpaceId!, req.id, 'reject', effectiveUserId);
                        queryClient.invalidateQueries({ queryKey: ['spaceJoinRequests'] });
                      }}
                      sx={{ minWidth: 0, fontSize: '0.68rem', color: '#EF4444', fontWeight: 700 }}
                    >
                      거절
                    </Button>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSpaceDialogOpen(false)} sx={{ color: '#6B7280' }}>취소</Button>
          {spaceManageMode === 'create' ? (
            <Button
              variant="contained"
              disabled={!newSpaceName.trim()}
              onClick={async () => {
                try {
                  const created = await api.createSpace(
                    { name: newSpaceName.trim(), description: newSpaceDesc.trim() || undefined, member_user_ids: spaceSelectedUserIds },
                    effectiveUserId
                  );
                  queryClient.invalidateQueries({ queryKey: ['spaces'] });
                  setSpaceDialogOpen(false);
                  setCurrentSpace(created.id, created.name, created.slug);
                  navigate(`/space/${created.slug}`);
                } catch (e) { console.error(e); }
              }}
              sx={{ bgcolor: '#2955FF' }}
            >
              생성
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={!newSpaceName.trim()}
              onClick={async () => {
                try {
                  if (managingSpace) {
                    await api.updateSpace(managingSpace.id, { name: newSpaceName.trim(), description: newSpaceDesc.trim() || undefined }, effectiveUserId);
                    // Sync members: add new, remove old
                    const currentMembers = new Set((managingSpace.members || []).map((m: any) => m.user_id));
                    const targetMembers = new Set(spaceSelectedUserIds);
                    for (const uid of spaceSelectedUserIds) {
                      if (!currentMembers.has(uid)) {
                        await api.addSpaceMember(managingSpace.id, uid, effectiveUserId);
                      }
                    }
                    for (const uid of Array.from(currentMembers) as number[]) {
                      if (!targetMembers.has(uid) && uid !== effectiveUserId) {
                        await api.removeSpaceMember(managingSpace.id, uid as number, effectiveUserId);
                      }
                    }
                    queryClient.invalidateQueries({ queryKey: ['spaces'] });
                    setSpaceDialogOpen(false);
                  }
                } catch (e) { console.error(e); }
              }}
              sx={{ bgcolor: '#2955FF' }}
            >
              저장
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ✅ New User Dialog (Add Member) */}
      <Dialog
        open={userDialogOpen}
        onClose={() => setUserDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Add Team Member</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Username"
            placeholder="e.g. John Doe"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="Login ID"
            placeholder="e.g. john.doe"
            value={newLoginId}
            onChange={e => setNewLoginId(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newUsername.trim() && newLoginId.trim()) {
                createUserMutation.mutate();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUserDialogOpen(false)} sx={{ color: '#6B7280' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => createUserMutation.mutate()}
            disabled={!newUsername.trim() || !newLoginId.trim()}
            sx={{ bgcolor: '#2955FF' }}
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};
