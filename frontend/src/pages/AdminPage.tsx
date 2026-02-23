import React, { useState } from 'react';
import {
    Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Switch, Chip, TextField, Button, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Alert, FormControlLabel,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import GroupsIcon from '@mui/icons-material/Groups';
import LinkIcon from '@mui/icons-material/Link';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, User, Shortcut, Group } from '../api/client';
import { useAppStore } from '../stores/useAppStore';

const ICON_COLORS = ['#2955FF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#0EA5E9'];

const AdminPage: React.FC = () => {
    const currentUserId = useAppStore(state => state.currentUserId);
    const queryClient = useQueryClient();
    const [tabIndex, setTabIndex] = useState(0);

    // ─── Data queries ───
    const { data: adminUsers = [] } = useQuery<User[]>({
        queryKey: ['adminUsers', currentUserId],
        queryFn: () => api.getAdminUsers(currentUserId),
    });
    const { data: groups = [] } = useQuery<Group[]>({
        queryKey: ['adminGroups', currentUserId],
        queryFn: () => api.getGroups(currentUserId),
    });
    const { data: shortcuts = [] } = useQuery<Shortcut[]>({
        queryKey: ['shortcuts'],
        queryFn: api.getShortcuts,
    });


    // ─── Mutations ───
    const toggleActiveMut = useMutation({
        mutationFn: (targetId: number) => api.toggleUserActive(targetId, currentUserId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const createGroupMut = useMutation({
        mutationFn: (data: { name: string }) => api.createGroup(data, currentUserId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminGroups'] }),
        onError: (err: any) => {
            alert(err?.response?.data?.detail || '그룹 생성 실패');
        },
    });
    const deleteGroupMut = useMutation({
        mutationFn: (id: number) => api.deleteGroup(id, currentUserId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminGroups'] }),
    });
    const applyGroupMut = useMutation({
        mutationFn: (id: number) => api.applyGroup(id, currentUserId),
        onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            if (data) alert(`${data.activated}명 활성화 (총 매칭: ${data.total_matched}명)`);
        },
    });

    const createShortcutMut = useMutation({
        mutationFn: (data: { name: string; url: string; icon_text?: string; icon_color?: string; order?: number; open_new_tab?: boolean }) => api.createShortcut(data, currentUserId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shortcuts'] }),
    });
    const updateShortcutMut = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Shortcut> }) => api.updateShortcut(id, data, currentUserId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shortcuts'] }),
    });
    const deleteShortcutMut = useMutation({
        mutationFn: (id: number) => api.deleteShortcut(id, currentUserId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shortcuts'] }),
    });

    // ─── Local state ───
    const [userSearch, setUserSearch] = useState('');
    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
    const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
    const [scName, setScName] = useState('');
    const [scUrl, setScUrl] = useState('');
    const [scIconColor, setScIconColor] = useState('#2955FF');
    const [scIconText, setScIconText] = useState('');
    const [scOpenNewTab, setScOpenNewTab] = useState(true);

    const filteredUsers = adminUsers.filter(u =>
        !userSearch || u.username.toLowerCase().includes(userSearch.toLowerCase()) || u.loginid.toLowerCase().includes(userSearch.toLowerCase())
    );

    const openShortcutDialog = (sc?: Shortcut) => {
        if (sc) {
            setEditingShortcut(sc);
            setScName(sc.name);
            setScUrl(sc.url);
            setScIconColor(sc.icon_color);
            setScIconText(sc.icon_text);
            setScOpenNewTab(sc.open_new_tab);
        } else {
            setEditingShortcut(null);
            setScName('');
            setScUrl('');
            setScIconColor(ICON_COLORS[Math.floor(Math.random() * ICON_COLORS.length)]);
            setScIconText('');
            setScOpenNewTab(true);
        }
        setShortcutDialogOpen(true);
    };

    const handleSaveShortcut = () => {
        if (!scName.trim() || !scUrl.trim()) return;
        const url = scUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            alert('URL은 http:// 또는 https://로 시작해야 합니다.');
            return;
        }
        if (editingShortcut) {
            updateShortcutMut.mutate({ id: editingShortcut.id, data: { name: scName.trim(), url, icon_text: scIconText.trim() || scName.trim()[0].toUpperCase(), icon_color: scIconColor, open_new_tab: scOpenNewTab } });
        } else {
            createShortcutMut.mutate({ name: scName.trim(), url, icon_text: scIconText.trim() || undefined, icon_color: scIconColor, open_new_tab: scOpenNewTab });
        }
        setShortcutDialogOpen(false);
    };

    const handleCreateGroup = () => {
        if (!groupName.trim()) return;
        createGroupMut.mutate({ name: groupName.trim() });
        setGroupDialogOpen(false);
        setGroupName('');
    };

    return (
        <Box sx={{ p: 3, maxWidth: 1100 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5, color: '#1A1D29' }}>관리자 페이지</Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>사이트 구성원, 그룹, 바로가기를 관리합니다.</Typography>

            <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 3, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.9rem' } }}>
                <Tab label="구성원 관리" />
                <Tab label="그룹 관리" />
                <Tab label="바로가기 관리" />
            </Tabs>

            {/* ── Tab 0: User Management ── */}
            {tabIndex === 0 && (
                <Box>
                    <TextField
                        size="small" placeholder="이름 또는 ID로 검색..." value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        sx={{ mb: 2, width: 300 }}
                    />
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #E5E7EB' }} elevation={0}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>사용자</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Login ID</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>소속 그룹</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>역할</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>상태</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">활성/비활성</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredUsers.map(user => (
                                    <TableRow key={user.id} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: user.avatar_color || '#2955FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                                                    {user.username.charAt(0).toUpperCase()}
                                                </Box>
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>{user.username}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell><Typography variant="body2" sx={{ color: '#6B7280' }}>{user.loginid}</Typography></TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ color: user.group_name ? '#374151' : '#9CA3AF', fontSize: '0.8rem' }}>
                                                {user.group_name || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell><Chip label={user.role || 'member'} size="small" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: user.role === 'admin' ? '#DBEAFE' : '#F3F4F6', color: user.role === 'admin' ? '#2955FF' : '#6B7280' }} /></TableCell>
                                        <TableCell>
                                            <Chip label={user.is_active !== false ? '활성' : '비활성'} size="small" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: user.is_active !== false ? '#DCFCE7' : '#FEE2E2', color: user.is_active !== false ? '#22C55E' : '#EF4444' }} />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Switch
                                                checked={user.is_active !== false}
                                                onChange={() => toggleActiveMut.mutate(user.id)}
                                                disabled={user.role === 'admin'}
                                                size="small"
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {/* ── Tab 1: Group Management (회사 실제 그룹명 등록) ── */}
            {tabIndex === 1 && (
                <Box>
                    <Alert severity="info" sx={{ borderRadius: 2, mb: 2, fontSize: '0.85rem' }}>
                        회사 내부 실제 조직/그룹명(예: ETCH기술팀)을 등록하면, 해당 그룹에 소속된 사용자에게 사이트 접근 권한이 자동 부여됩니다.
                        사용자의 소속 그룹은 사용자 데이터의 <strong>group_name</strong> 필드로 매칭됩니다.
                    </Alert>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>등록된 그룹 목록</Typography>
                        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setGroupDialogOpen(true)}
                            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
                            그룹 등록
                        </Button>
                    </Box>
                    {groups.length === 0 ? (
                        <Alert severity="warning" sx={{ borderRadius: 2 }}>등록된 그룹이 없습니다. 회사 조직/그룹명을 등록하세요.</Alert>
                    ) : (
                        <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #E5E7EB' }} elevation={0}>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>그룹명</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">매칭 인원</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>등록일</TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">작업</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {groups.map(group => (
                                        <TableRow key={group.id} hover>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <GroupsIcon sx={{ color: '#8B5CF6', fontSize: 20 }} />
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{group.name}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={`${group.matched_count || 0}명`}
                                                    size="small"
                                                    sx={{
                                                        fontWeight: 600, fontSize: '0.7rem',
                                                        bgcolor: (group.matched_count || 0) > 0 ? '#DCFCE7' : '#FEF3C7',
                                                        color: (group.matched_count || 0) > 0 ? '#22C55E' : '#D97706',
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>
                                                    {group.created_at ? new Date(group.created_at).toLocaleDateString('ko-KR') : '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                    <Tooltip title="그룹 소속 사용자 일괄 활성화">
                                                        <IconButton size="small" onClick={() => applyGroupMut.mutate(group.id)} color="primary">
                                                            <PlayArrowIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="삭제">
                                                        <IconButton size="small" onClick={() => deleteGroupMut.mutate(group.id)} color="error">
                                                            <DeleteIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}

            {/* ── Tab 2: Shortcut Management ── */}
            {tabIndex === 2 && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>바로가기 목록</Typography>
                        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => openShortcutDialog()}
                            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
                            바로가기 추가
                        </Button>
                    </Box>
                    {shortcuts.length === 0 ? (
                        <Alert severity="info" sx={{ borderRadius: 2 }}>등록된 바로가기가 없습니다.</Alert>
                    ) : (
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {shortcuts.sort((a, b) => (a.order || 0) - (b.order || 0)).map(sc => (
                                <Paper key={sc.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #E5E7EB', width: 200, position: 'relative' }} elevation={0}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                        <Box sx={{
                                            width: 44, height: 44, borderRadius: 2, bgcolor: sc.icon_color || '#2955FF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontWeight: 800, fontSize: '1.1rem',
                                        }}>
                                            {sc.icon_text || sc.name.charAt(0).toUpperCase()}
                                        </Box>
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }} noWrap>{sc.name}</Typography>
                                            <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                                <LinkIcon sx={{ fontSize: 10 }} /> {sc.url.replace(/^https?:\/\//, '').substring(0, 20)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                        <Chip label={sc.active ? '활성' : '비활성'} size="small" sx={{ fontSize: '0.6rem', fontWeight: 600, bgcolor: sc.active ? '#DCFCE7' : '#FEE2E2', color: sc.active ? '#22C55E' : '#EF4444' }} />
                                        <IconButton size="small" onClick={() => openShortcutDialog(sc)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                                        <IconButton size="small" onClick={() => deleteShortcutMut.mutate(sc.id)} color="error"><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                                    </Box>
                                </Paper>
                            ))}
                        </Box>
                    )}
                </Box>
            )}

            {/* ── Group Dialog ── */}
            <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>그룹 등록</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: '#6B7280', mb: 2, fontSize: '0.85rem' }}>
                        회사 내부 조직/그룹명을 입력하세요. (예: ETCH기술팀, 개발1팀)
                    </Typography>
                    <TextField
                        fullWidth label="그룹명 *" value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="예: ETCH기술팀"
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setGroupDialogOpen(false)} sx={{ textTransform: 'none' }}>취소</Button>
                    <Button variant="contained" onClick={handleCreateGroup} disabled={!groupName.trim()} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>등록</Button>
                </DialogActions>
            </Dialog>

            {/* ── Shortcut Dialog ── */}
            <Dialog open={shortcutDialogOpen} onClose={() => setShortcutDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{editingShortcut ? '바로가기 수정' : '바로가기 추가'}</DialogTitle>
                <DialogContent>
                    <TextField fullWidth label="이름 *" value={scName} onChange={(e) => setScName(e.target.value)} sx={{ mt: 1, mb: 2 }} />
                    <TextField fullWidth label="URL *" placeholder="https://example.com" value={scUrl} onChange={(e) => setScUrl(e.target.value)} sx={{ mb: 2 }} />
                    <TextField fullWidth label="아이콘 텍스트 (기본: 이름 첫글자)" value={scIconText} onChange={(e) => setScIconText(e.target.value)} sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>아이콘 배경색</Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                        {ICON_COLORS.map(color => (
                            <Box
                                key={color}
                                onClick={() => setScIconColor(color)}
                                sx={{
                                    width: 32, height: 32, borderRadius: 1.5, bgcolor: color, cursor: 'pointer',
                                    border: scIconColor === color ? '3px solid #1A1D29' : '2px solid transparent',
                                    transition: 'all 0.15s',
                                    '&:hover': { transform: 'scale(1.1)' },
                                }}
                            />
                        ))}
                    </Box>
                    {/* Preview */}
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>미리보기</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#F9FAFB', borderRadius: 2 }}>
                        <Box sx={{
                            width: 48, height: 48, borderRadius: 2, bgcolor: scIconColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: '1.2rem',
                        }}>
                            {(scIconText || scName || '?').charAt(0).toUpperCase()}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{scName || '이름'}</Typography>
                    </Box>
                    <FormControlLabel
                        control={<Switch checked={scOpenNewTab} onChange={(e) => setScOpenNewTab(e.target.checked)} size="small" />}
                        label={<Typography variant="body2" sx={{ fontSize: '0.85rem' }}>새 탭에서 열기</Typography>}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setShortcutDialogOpen(false)} sx={{ textTransform: 'none' }}>취소</Button>
                    <Button variant="contained" onClick={handleSaveShortcut} disabled={!scName.trim() || !scUrl.trim()} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
                        {editingShortcut ? '수정' : '추가'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AdminPage;
