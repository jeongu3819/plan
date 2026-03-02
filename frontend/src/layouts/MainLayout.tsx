import React, { useState, useMemo, useEffect } from 'react';
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
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Project, User } from '../api/client';
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
  '#F3F4F6',
  '#E5E5E5',
  '#D8CFDC',
  '#E7C9D1',
  '#E8C097',
  '#E6D395',
  '#B7C9BB',
  '#9EBFD6',
  '#5C6F8E',
  '#6F647F',
  '#6A4A3F',
  '#195B4E',
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

  // projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects', effectiveUserId],
    queryFn: () => api.getProjects(effectiveUserId),
    enabled: !!me && effectiveUserId > 0,
  });

  // non-super_admin에게 super_admin 계정 노출 최소화 (프론트 1차)
  const safeUsers = isSuperAdmin ? users : users.filter(u => u.role !== 'super_admin');

  // Switch User 메뉴에서 보여줄 사용자 (메뉴 자체는 super_admin만 열림)
  const visibleUsersForSwitch = isSuperAdmin ? users : currentUser ? [currentUser] : [];

  // 프로젝트 멤버 선택에서도 super_admin 숨김(본인 제외)
  const usersForMemberSelection = safeUsers.filter(u => u.id !== effectiveUserId);

  // Dialogs & menus
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
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

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);

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
        owner_id: effectiveUserId, // ✅ 실제 동작 사용자 기준 (super_admin이면 전환된 사용자, 아니면 본인)
        require_approval: requireApproval,
        permissions,
        member_ids: selectedMemberIds,
      }),
    onSuccess: newProject => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setProjectDialogOpen(false);
      setNewProjectName('');
      setNewProjectDescription('');
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
      if (newProject?.id) navigate(`/project/${newProject.id}`);
    },
    onError: (err: any) => {
      console.error('Project creation failed:', err);
      alert(
        `프로젝트 생성에 실패했습니다: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`
      );
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: number) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setDeleteConfirmOpen(false);
      setDeleteProjectId(null);
      if (location.pathname.includes(`/project/${deleteProjectId}`)) {
        navigate('/');
      }
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

  const handleDeleteProject = (projectId: number) => {
    setDeleteProjectId(projectId);
    setDeleteConfirmOpen(true);
    setProjectMenuAnchor(null);
  };

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
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{ bgcolor: '#2955FF', width: 36, height: 36, fontSize: '0.9rem', fontWeight: 700 }}
          >
            AG
          </Avatar>
          <Box>
            <Typography
              variant="subtitle1"
              sx={{
                color: theme.sidebarText,
                fontWeight: 700,
                fontSize: '0.95rem',
                lineHeight: 1.2,
              }}
            >
              Antigravity
            </Typography>
            <Typography variant="caption" sx={{ color: theme.sidebarMuted, fontSize: '0.7rem' }}>
              Schedule Platform
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: '#2A2F52', mx: 1.5 }} />

        {/* Main Menu */}
        <List sx={{ px: 1, py: 1 }}>
          {[
            { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
            {
              text: 'Kanban Board',
              icon: <ViewKanbanIcon />,
              path: projects.length > 0 ? `/project/${projects[0].id}` : '/',
            },
            { text: '전체 로드맵', icon: <TimelineIcon />, path: '/roadmap' },
            // ✅ 추가된 메뉴
            { text: '@나를 언급', icon: <AlternateEmailIcon />, path: '/mentions' },
            {
              text: 'AI Settings',
              icon: <AutoAwesomeIcon />,
              path: '/ai-settings',
              adminOnly: true,
            },
          ]
            .filter(item => !item.adminOnly || isAdminLike)
            .map(item => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname + location.search === item.path;
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
                        onClick={() => navigate(`/project/${project.id}`)}
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
                              bgcolor: isActive ? '#2955FF' : dotColor,
                            }}
                          />
                        </ListItemIcon>
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

          {/* Admin + Trash */}
          <List sx={{ px: 1, py: 0.5 }}>
            {isAdminLike && (
              <ListItem disablePadding sx={{ mb: 0.3 }}>
                <ListItemButton
                  onClick={() => navigate('/admin')}
                  sx={{
                    borderRadius: 1.5,
                    py: 0.8,
                    px: 1.5,
                    color: location.pathname === '/admin' ? theme.sidebarText : theme.sidebarMuted,
                    bgcolor: location.pathname === '/admin' ? theme.sidebarHover : 'transparent',
                    '&:hover': { bgcolor: theme.sidebarHover },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: location.pathname === '/admin' ? '#2955FF' : theme.sidebarMuted,
                      minWidth: 36,
                    }}
                  >
                    <AdminPanelSettingsIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="어드민"
                    primaryTypographyProps={{
                      fontSize: '0.85rem',
                      fontWeight: location.pathname === '/admin' ? 600 : 400,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            )}

            <ListItem disablePadding>
              <ListItemButton
                onClick={() => navigate('/trash')}
                sx={{
                  borderRadius: 1.5,
                  py: 0.8,
                  px: 1.5,
                  color: location.pathname === '/trash' ? theme.sidebarText : theme.sidebarMuted,
                  bgcolor: location.pathname === '/trash' ? theme.sidebarHover : 'transparent',
                  '&:hover': { bgcolor: theme.sidebarHover },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: location.pathname === '/trash' ? '#2955FF' : theme.sidebarMuted,
                    minWidth: 36,
                  }}
                >
                  <DeleteOutlineIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Trash"
                  primaryTypographyProps={{
                    fontSize: '0.85rem',
                    fontWeight: location.pathname === '/trash' ? 600 : 400,
                  }}
                />
              </ListItemButton>
            </ListItem>
          </List>

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
        {children}
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
            if (projectMenuId) navigate(`/project/${projectMenuId}`);
          }}
          sx={{ fontSize: '0.85rem' }}
        >
          Open Project
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            if (projectMenuId) handleDeleteProject(projectMenuId);
          }}
          sx={{ fontSize: '0.85rem', color: '#EF4444' }}
        >
          <DeleteOutlineIcon sx={{ fontSize: '1rem', mr: 1 }} /> Delete
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
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>새 프로젝트</DialogTitle>
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

          {/* Member Selection */}
          <Box sx={{ mb: 2 }}>
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
          </Box>

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

      {/* ─── Delete Confirm Dialog ─── */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#EF4444' }}>
          Delete Project?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#6B7280' }}>
            This will archive all tasks in this project. This action cannot be easily undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: '#6B7280' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (deleteProjectId) deleteProjectMutation.mutate(deleteProjectId);
            }}
            sx={{ bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' } }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
