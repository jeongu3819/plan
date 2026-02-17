import React, { useState, useMemo } from 'react';
import {
    Box, List, ListItem, ListItemButton, ListItemIcon,
    ListItemText, Typography, Avatar, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, IconButton, Menu, MenuItem, Tooltip,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import TimelineIcon from '@mui/icons-material/Timeline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PaletteIcon from '@mui/icons-material/Palette';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Project, User } from '../api/client';
import {
    deriveSidebarColor, deriveSidebarHover, deriveSidebarDivider,
    deriveSidebarMuted, autoTextColor,
} from '../utils/colorUtils';

const BG_PALETTE = [
    '#F3F4F6', '#E5E5E5', '#D8CFDC', '#E7C9D1', '#E8C097', '#E6D395',
    '#B7C9BB', '#9EBFD6', '#5C6F8E', '#6F647F', '#6A4A3F', '#195B4E', '#4A4A4A',
];
import { useAppStore } from '../stores/useAppStore';

const SIDEBAR_WIDTH = 260;
const PROJECT_COLORS = ['#2955FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const AVATAR_COLORS = ['#2955FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const currentUserId = useAppStore(state => state.currentUserId);
    const setCurrentUserId = useAppStore(state => state.setCurrentUserId);
    const bgColor = useAppStore(state => state.bgColor);
    const setBgColor = useAppStore(state => state.setBgColor);
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

    // Fetch projects & users
    const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: () => api.getProjects() });
    const { data: users = [] } = useQuery<User[]>({ queryKey: ['users'], queryFn: () => api.getUsers() });

    const currentUser = users.find(u => u.id === currentUserId) || users[0];

    // Dialogs & menus
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [userDialogOpen, setUserDialogOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newLoginId, setNewLoginId] = useState('');
    const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
    const [projectMenuAnchor, setProjectMenuAnchor] = useState<null | HTMLElement>(null);
    const [projectMenuId, setProjectMenuId] = useState<number | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);

    // Mutations
    const createProjectMutation = useMutation({
        mutationFn: (name: string) => api.createProject({ name, owner_id: currentUserId }),
        onSuccess: (newProject) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            setProjectDialogOpen(false);
            setNewProjectName('');
            if (newProject?.id) navigate(`/project/${newProject.id}`);
        },
        onError: (err: any) => {
            console.error('Project creation failed:', err);
            alert(`프로젝트 생성에 실패했습니다: ${err?.response?.data?.detail || err?.message || 'Unknown error'}`);
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
        mutationFn: () => api.createUser({
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
    });

    const handleDeleteProject = (projectId: number) => {
        setDeleteProjectId(projectId);
        setDeleteConfirmOpen(true);
        setProjectMenuAnchor(null);
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {/* ─── Sidebar ─── */}
            <Box sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, bgcolor: theme.sidebar, color: theme.sidebarMuted, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background-color 0.3s ease' }}>
                {/* Logo */}
                <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: '#2955FF', width: 36, height: 36, fontSize: '0.9rem', fontWeight: 700 }}>AG</Avatar>
                    <Box>
                        <Typography variant="subtitle1" sx={{ color: theme.sidebarText, fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>Antigravity</Typography>
                        <Typography variant="caption" sx={{ color: theme.sidebarMuted, fontSize: '0.7rem' }}>Schedule Platform</Typography>
                    </Box>
                </Box>

                <Divider sx={{ borderColor: '#2A2F52', mx: 1.5 }} />

                {/* Main Menu */}
                <List sx={{ px: 1, py: 1 }}>
                    {[
                        { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
                        { text: 'Kanban Board', icon: <ViewKanbanIcon />, path: projects.length > 0 ? `/project/${projects[0].id}` : '/' },
                        { text: 'Roadmap', icon: <TimelineIcon />, path: projects.length > 0 ? `/project/${projects[0].id}?tab=roadmap` : '/' },
                        { text: 'AI Settings', icon: <AutoAwesomeIcon />, path: '/ai-settings' },
                    ].map((item) => {
                        const isActive = item.path === '/' ? location.pathname === '/' : location.pathname + location.search === item.path;
                        return (
                            <ListItem key={item.text} disablePadding sx={{ mb: 0.3 }}>
                                <ListItemButton onClick={() => navigate(item.path)} sx={{ borderRadius: 1.5, py: 1, px: 1.5, color: isActive ? theme.sidebarText : theme.sidebarMuted, bgcolor: isActive ? `${theme.sidebarHover}` : 'transparent', '&:hover': { bgcolor: theme.sidebarHover } }}>
                                    <ListItemIcon sx={{ color: isActive ? '#2955FF' : theme.sidebarMuted, minWidth: 36 }}>{item.icon}</ListItemIcon>
                                    <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: isActive ? 600 : 400 }} />
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>

                {/* Projects */}
                <Box sx={{ px: 2.5, pt: 2, pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: theme.sidebarMuted, fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Projects</Typography>
                    <Tooltip title="New Project">
                        <AddIcon onClick={() => setProjectDialogOpen(true)} sx={{ fontSize: 16, color: theme.sidebarMuted, cursor: 'pointer', '&:hover': { color: theme.sidebarText }, transition: 'color 0.15s' }} />
                    </Tooltip>
                </Box>

                <List sx={{ px: 1, flexGrow: 1, overflowY: 'auto' }}>
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
                                        onClick={(e) => { e.stopPropagation(); setProjectMenuAnchor(e.currentTarget); setProjectMenuId(project.id); }}
                                        sx={{ color: theme.sidebarMuted, opacity: 0, '.MuiListItem-root:hover &': { opacity: 1 }, transition: 'opacity 0.15s' }}
                                    >
                                        <MoreVertIcon sx={{ fontSize: '1rem' }} />
                                    </IconButton>
                                }
                            >
                                <ListItemButton onClick={() => navigate(`/project/${project.id}`)} sx={{ borderRadius: 1.5, py: 0.8, px: 1.5, color: isActive ? theme.sidebarText : theme.sidebarMuted, bgcolor: isActive ? theme.sidebarHover : 'transparent', '&:hover': { bgcolor: theme.sidebarHover } }}>
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: isActive ? '#2955FF' : dotColor }} />
                                    </ListItemIcon>
                                    <ListItemText primary={project.name} primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: isActive ? 600 : 400, noWrap: true }} />
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>

                {/* Bottom */}
                <Divider sx={{ borderColor: theme.sidebarDivider, mx: 1.5 }} />

                {/* Trash */}
                <List sx={{ px: 1, py: 0.5 }}>
                    <ListItem disablePadding>
                        <ListItemButton onClick={() => navigate('/trash')} sx={{ borderRadius: 1.5, py: 0.8, px: 1.5, color: location.pathname === '/trash' ? theme.sidebarText : theme.sidebarMuted, bgcolor: location.pathname === '/trash' ? theme.sidebarHover : 'transparent', '&:hover': { bgcolor: theme.sidebarHover } }}>
                            <ListItemIcon sx={{ color: location.pathname === '/trash' ? '#2955FF' : theme.sidebarMuted, minWidth: 36 }}><DeleteOutlineIcon /></ListItemIcon>
                            <ListItemText primary="Trash" primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: location.pathname === '/trash' ? 600 : 400 }} />
                        </ListItemButton>
                    </ListItem>
                </List>

                <Divider sx={{ borderColor: theme.sidebarDivider, mx: 1.5 }} />

                {/* User Selector */}
                <Box sx={{ p: 1.5 }}>
                    <Box
                        onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 1.5,
                            cursor: 'pointer', '&:hover': { bgcolor: theme.sidebarHover }, transition: 'background 0.15s',
                        }}
                    >
                        <Avatar sx={{
                            width: 32, height: 32, fontSize: '0.8rem', fontWeight: 700,
                            bgcolor: currentUser?.avatar_color || '#2955FF',
                        }}>
                            {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
                        </Avatar>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ color: theme.sidebarText, fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.2 }} noWrap>
                                {currentUser?.username || 'Select User'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: theme.sidebarMuted, fontSize: '0.65rem' }}>
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
                            display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5,
                            borderRadius: 1.5, cursor: 'pointer',
                            '&:hover': { bgcolor: theme.sidebarHover }, transition: 'background 0.15s',
                        }}
                    >
                        <PaletteIcon sx={{ fontSize: '1rem', color: theme.sidebarMuted }} />
                        <Typography variant="caption" sx={{ color: theme.sidebarMuted, fontWeight: 600, fontSize: '0.7rem' }}>
                            Theme
                        </Typography>
                        <Box sx={{ ml: 'auto', width: 16, height: 16, borderRadius: '50%', bgcolor: bgColor, border: `2px solid ${theme.sidebarDivider}` }} />
                    </Box>
                    {paletteOpen && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, mt: 0.8, px: 0.5 }}>
                            {BG_PALETTE.map(color => (
                                <Tooltip key={color} title={color} placement="top">
                                    <Box
                                        onClick={() => setBgColor(color)}
                                        sx={{
                                            width: 22, height: 22, borderRadius: '50%', bgcolor: color,
                                            cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
                                            border: bgColor === color ? '2.5px solid #2955FF' : '2px solid transparent',
                                            boxShadow: bgColor === color ? '0 0 0 2px rgba(41,85,255,0.3)' : 'none',
                                            '&:hover': { transform: 'scale(1.2)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' },
                                        }}
                                    />
                                </Tooltip>
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>

            {/* ─── Main Content ─── */}
            <Box component="main" sx={{ flexGrow: 1, overflow: 'auto', bgcolor: bgColor, p: 3, transition: 'background-color 0.3s ease' }}>
                {children}
            </Box>

            {/* ─── Project Context Menu ─── */}
            <Menu
                anchorEl={projectMenuAnchor}
                open={Boolean(projectMenuAnchor)}
                onClose={() => setProjectMenuAnchor(null)}
                PaperProps={{ sx: { borderRadius: 2, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' } }}
            >
                <MenuItem onClick={() => { setProjectMenuAnchor(null); if (projectMenuId) navigate(`/project/${projectMenuId}`); }} sx={{ fontSize: '0.85rem' }}>
                    Open Project
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => { if (projectMenuId) handleDeleteProject(projectMenuId); }} sx={{ fontSize: '0.85rem', color: '#EF4444' }}>
                    <DeleteOutlineIcon sx={{ fontSize: '1rem', mr: 1 }} /> Delete
                </MenuItem>
            </Menu>

            {/* ─── User Switch Menu ─── */}
            <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={() => setUserMenuAnchor(null)}
                PaperProps={{ sx: { borderRadius: 2, minWidth: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' } }}
            >
                <Box sx={{ px: 2, py: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                        Switch User
                    </Typography>
                </Box>
                {users.map(user => (
                    <MenuItem
                        key={user.id}
                        onClick={() => { setCurrentUserId(user.id); setUserMenuAnchor(null); }}
                        selected={user.id === currentUserId}
                        sx={{ fontSize: '0.85rem', py: 1 }}
                    >
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.6rem', mr: 1.5, bgcolor: user.avatar_color || '#2955FF' }}>
                            {user.username.charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>{user.username}</Typography>
                            <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>{user.role || 'member'}</Typography>
                        </Box>
                    </MenuItem>
                ))}
                <Divider />
                <MenuItem onClick={() => { setUserMenuAnchor(null); setUserDialogOpen(true); }} sx={{ fontSize: '0.85rem', color: '#2955FF' }}>
                    <PersonAddIcon sx={{ fontSize: '1rem', mr: 1 }} /> Add Member
                </MenuItem>
            </Menu>

            {/* ─── New Project Dialog ─── */}
            <Dialog open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>New Project</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth label="Project Name" placeholder="e.g. Marketing Campaign" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} sx={{ mt: 1 }} onKeyDown={(e) => { if (e.key === 'Enter' && newProjectName.trim()) createProjectMutation.mutate(newProjectName.trim()); }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setProjectDialogOpen(false)} sx={{ color: '#6B7280' }}>Cancel</Button>
                    <Button variant="contained" onClick={() => createProjectMutation.mutate(newProjectName.trim())} disabled={!newProjectName.trim()} sx={{ bgcolor: '#2955FF' }}>Create</Button>
                </DialogActions>
            </Dialog>

            {/* ─── New User Dialog ─── */}
            <Dialog open={userDialogOpen} onClose={() => setUserDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Add Team Member</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth label="Username" placeholder="e.g. John Doe" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} sx={{ mt: 1, mb: 2 }} />
                    <TextField fullWidth label="Login ID" placeholder="e.g. john.doe" value={newLoginId} onChange={(e) => setNewLoginId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newUsername.trim() && newLoginId.trim()) createUserMutation.mutate(); }} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setUserDialogOpen(false)} sx={{ color: '#6B7280' }}>Cancel</Button>
                    <Button variant="contained" onClick={() => createUserMutation.mutate()} disabled={!newUsername.trim() || !newLoginId.trim()} sx={{ bgcolor: '#2955FF' }}>Add</Button>
                </DialogActions>
            </Dialog>

            {/* ─── Delete Confirm Dialog ─── */}
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: '#EF4444' }}>Delete Project?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        This will archive all tasks in this project. This action cannot be easily undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ color: '#6B7280' }}>Cancel</Button>
                    <Button variant="contained" onClick={() => { if (deleteProjectId) deleteProjectMutation.mutate(deleteProjectId); }} sx={{ bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' } }}>Delete</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
