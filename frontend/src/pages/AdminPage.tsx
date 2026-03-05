import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  Chip,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Alert,
  FormControlLabel,
  Select,
  MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import GroupsIcon from '@mui/icons-material/Groups';
import LinkIcon from '@mui/icons-material/Link';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import CircularProgress from '@mui/material/CircularProgress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, User, Shortcut, Group } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useUser } from '../context/UserContext'; // ✅ 현재 store에 me/loginid가 없으니 UserContext 사용

const ICON_COLORS = [
  '#2955FF',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#0EA5E9',
];

const ROLE_CONFIG: Record<string, { label: string; color: string; bgcolor: string }> = {
  super_admin: { label: 'Super Admin', color: '#9333EA', bgcolor: '#F3E8FF' },
  admin: { label: 'Admin', color: '#2955FF', bgcolor: '#DBEAFE' },
  manager: { label: '중간관리자', color: '#F59E0B', bgcolor: '#FEF3C7' },
  member: { label: 'Member', color: '#6B7280', bgcolor: '#F3F4F6' },
};

const normalize = (v?: string) =>
  String(v || '')
    .trim()
    .toLowerCase();

const AdminPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tabIndex, setTabIndex] = useState(0);

  // ✅ 실제 로그인 사용자(UserContext) 기준
  const { user: me, loading: meLoading } = useUser();

  // ✅ store에는 currentUserId만 있음
  const storedCurrentUserId = useAppStore(state => state.currentUserId);
  const setCurrentUserId = useAppStore(state => state.setCurrentUserId);

  // ✅ users 목록은 화면 렌더 + loginid → id 매핑용
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    enabled: !meLoading, // me가 준비되면 호출
  });

  // ✅ 핵심: store id 우선, 없으면 me.loginid로 users에서 id 매핑
  const resolvedCurrentUserId = useMemo(() => {
    if (storedCurrentUserId && storedCurrentUserId > 0) return storedCurrentUserId;

    const myLogin = normalize(me?.loginid);
    if (!myLogin) return 0;

    const matched = users.find(u => normalize(u.loginid) === myLogin);
    return matched?.id ?? 0;
  }, [storedCurrentUserId, users, me?.loginid]);

  // ✅ 한번 매핑되면 store에 확정 저장(다음부터는 매핑 불필요)
  useEffect(() => {
    if (resolvedCurrentUserId > 0 && storedCurrentUserId !== resolvedCurrentUserId) {
      setCurrentUserId(resolvedCurrentUserId);
    }
  }, [resolvedCurrentUserId, storedCurrentUserId, setCurrentUserId]);

  // ✅ 권한 판단은 me.role 기반(가장 안전)
  const effectiveRole = normalize((me as any)?.role);
  const isAdminAccess = effectiveRole === 'admin' || effectiveRole === 'super_admin';
  const canChangeRoles = isAdminAccess;
  const isSuperAdmin = effectiveRole === 'super_admin';

  const requireAdminUserId = () => {
    if (!isAdminAccess) throw new Error('관리자 권한이 없습니다.');
    if (resolvedCurrentUserId <= 0)
      throw new Error('관리자 사용자 ID를 확인할 수 없습니다. (loginid → id 매핑 실패)');
    return resolvedCurrentUserId;
  };

  // ─── Data queries ───
  const { data: adminUsers = [] } = useQuery<User[]>({
    queryKey: ['adminUsers', resolvedCurrentUserId],
    queryFn: () => api.getAdminUsers(resolvedCurrentUserId),
    enabled: isAdminAccess && resolvedCurrentUserId > 0, // ✅ 권한 + id 확인 후 호출
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['adminGroups', resolvedCurrentUserId],
    queryFn: () => api.getGroups(resolvedCurrentUserId),
    enabled: isAdminAccess && resolvedCurrentUserId > 0,
  });

  const { data: shortcuts = [] } = useQuery<Shortcut[]>({
    queryKey: ['shortcuts'],
    queryFn: api.getShortcuts,
    enabled: isAdminAccess && resolvedCurrentUserId > 0,
  });

  // ─── Mutations ───
  const toggleActiveMut = useMutation({
    mutationFn: (targetId: number) => api.toggleUserActive(targetId, requireAdminUserId()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || err?.message || '활성/비활성 변경 실패');
    },
  });

  const updateRoleMut = useMutation({
    mutationFn: ({ targetId, role }: { targetId: number; role: string }) =>
      api.updateUserRole(targetId, role, requireAdminUserId()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '역할 변경 실패');
    },
  });

  const deleteUserMut = useMutation({
    mutationFn: (targetId: number) => api.deleteAdminUser(targetId, requireAdminUserId()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '사용자 삭제 실패');
    },
  });

  const createGroupMut = useMutation({
    mutationFn: (data: { name: string }) => api.createGroup(data, requireAdminUserId()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminGroups'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '그룹 생성 실패');
    },
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: number) => api.deleteGroup(id, requireAdminUserId()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adminGroups'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '그룹 삭제 실패');
    },
  });

  const applyGroupMut = useMutation({
    mutationFn: (id: number) => api.applyGroup(id, requireAdminUserId()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (data) alert(`${data.activated}명 활성화 (총 매칭: ${data.total_matched}명)`);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '그룹 적용 실패');
    },
  });

  const createShortcutMut = useMutation({
    mutationFn: (data: {
      name: string;
      url: string;
      icon_text?: string;
      icon_color?: string;
      order?: number;
      open_new_tab?: boolean;
    }) => api.createShortcut(data, requireAdminUserId()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shortcuts'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '바로가기 추가 실패');
    },
  });

  const updateShortcutMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Shortcut> }) =>
      api.updateShortcut(id, data, requireAdminUserId()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shortcuts'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '바로가기 수정 실패');
    },
  });

  const deleteShortcutMut = useMutation({
    mutationFn: (id: number) => api.deleteShortcut(id, requireAdminUserId()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shortcuts'] }),
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '바로가기 삭제 실패');
    },
  });

  // ─── D-1: Create user mutation ───
  const createUserMut = useMutation({
    mutationFn: (data: { username: string; loginid: string; role?: string; deptname?: string; mail?: string }) =>
      api.createUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateUserDialogOpen(false);
      setNewUsername('');
      setNewLoginId('');
      setNewUserRole('member');
      setNewDeptname('');
      setNewMail('');
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || '사용자 추가 실패');
    },
  });

  // ─── Local state ───
  const [userSearch, setUserSearch] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState('');

  // D-1: Create user dialog state
  const [createUserDialogOpen, setCreateUserDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [newUserRole, setNewUserRole] = useState('member');
  const [newDeptname, setNewDeptname] = useState('');
  const [newMail, setNewMail] = useState('');

  // D-2: Knox search state (Tab 0 inline)
  const [knoxSearch, setKnoxSearch] = useState('');
  const [knoxResults, setKnoxResults] = useState<any[]>([]);
  const [knoxSearching, setKnoxSearching] = useState(false);

  // Knox search in create user dialog
  const [dialogKnoxQuery, setDialogKnoxQuery] = useState('');
  const [dialogKnoxResults, setDialogKnoxResults] = useState<any[]>([]);
  const [dialogKnoxSearching, setDialogKnoxSearching] = useState(false);

  const handleDialogKnoxSearch = async () => {
    if (!dialogKnoxQuery.trim()) return;
    setDialogKnoxSearching(true);
    try {
      const results = await api.searchKnoxEmployees({ query: dialogKnoxQuery.trim() });
      setDialogKnoxResults(results);
    } catch {
      setDialogKnoxResults([]);
    } finally {
      setDialogKnoxSearching(false);
    }
  };

  // Knox search for group management (Tab 1)
  const [groupKnoxQuery, setGroupKnoxQuery] = useState('');
  const [groupKnoxResults, setGroupKnoxResults] = useState<any[]>([]);
  const [groupKnoxSearching, setGroupKnoxSearching] = useState(false);

  const handleGroupKnoxSearch = async () => {
    if (!groupKnoxQuery.trim()) return;
    setGroupKnoxSearching(true);
    try {
      const results = await api.searchKnoxEmployees({ query: groupKnoxQuery.trim() });
      // Extract unique department names from results
      setGroupKnoxResults(results);
    } catch {
      setGroupKnoxResults([]);
    } finally {
      setGroupKnoxSearching(false);
    }
  };

  const handleKnoxSearch = async (searchOverride?: string) => {
    const query = searchOverride || knoxSearch || userSearch;
    if (!query.trim()) return;
    setKnoxSearch(query.trim());
    setKnoxSearching(true);
    try {
      const results = await api.searchKnoxEmployees({ query: query.trim() });
      setKnoxResults(results);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Knox 검색 실패');
      setKnoxResults([]);
    } finally {
      setKnoxSearching(false);
    }
  };

  const addFromKnoxMut = useMutation({
    mutationFn: (data: { username: string; loginid: string }) =>
      api.createUser({ ...data, role: 'member' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.detail || 'Knox 사용자 추가 실패');
    },
  });
  const [shortcutDialogOpen, setShortcutDialogOpen] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
  const [scName, setScName] = useState('');
  const [scUrl, setScUrl] = useState('');
  const [scIconColor, setScIconColor] = useState('#2955FF');
  const [scIconText, setScIconText] = useState('');
  const [scOpenNewTab, setScOpenNewTab] = useState(true);

  const filteredUsers = adminUsers.filter(u => {
    const q = normalize(userSearch);
    if (!q) return true;
    return normalize(u.username).includes(q) || normalize(u.loginid).includes(q);
  });

  const openShortcutDialog = (sc?: Shortcut) => {
    if (sc) {
      setEditingShortcut(sc);
      setScName(sc.name);
      setScUrl(sc.url);
      setScIconColor(sc.icon_color || '#2955FF');
      setScIconText(sc.icon_text || '');
      setScOpenNewTab(sc.open_new_tab !== false);
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
      updateShortcutMut.mutate({
        id: editingShortcut.id,
        data: {
          name: scName.trim(),
          url,
          icon_text: scIconText.trim() || scName.trim()[0].toUpperCase(),
          icon_color: scIconColor,
          open_new_tab: scOpenNewTab,
        },
      });
    } else {
      createShortcutMut.mutate({
        name: scName.trim(),
        url,
        icon_text: scIconText.trim() || undefined,
        icon_color: scIconColor,
        open_new_tab: scOpenNewTab,
      });
    }
    setShortcutDialogOpen(false);
  };

  const handleCreateGroup = () => {
    if (!groupName.trim()) return;
    createGroupMut.mutate({ name: groupName.trim() });
    setGroupDialogOpen(false);
    setGroupName('');
  };

  // ✅ 로딩 처리
  if (meLoading || usersLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: '#6B7280' }}>
          사용자 정보 확인 중...
        </Typography>
      </Box>
    );
  }

  // ✅ me 없으면 (UserProvider가 리다이렉트 처리하는 경우)
  if (!me) return null;

  // ✅ 매핑 실패 알림
  const mappingFailed = normalize(me?.loginid) && users.length > 0 && resolvedCurrentUserId <= 0;

  // ✅ 권한 없는 경우 안내
  if (!isAdminAccess) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="warning" sx={{ maxWidth: 520, mx: 'auto', textAlign: 'left' }}>
          관리자 권한이 없습니다. (role: <strong>{String((me as any)?.role || '')}</strong>)
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5, color: '#1A1D29' }}>
        관리자 페이지
      </Typography>
      <Typography variant="body2" sx={{ color: '#6B7280', mb: 2 }}>
        사이트 구성원, 그룹, 바로가기를 관리합니다.
      </Typography>

      {mappingFailed && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          현재 로그인 사용자(loginid)와 users 목록 매핑에 실패했습니다. <br />
          <strong>me.loginid</strong> / <strong>users.loginid</strong> 값 확인이 필요합니다.
        </Alert>
      )}

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{
          mb: 3,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.9rem' },
        }}
      >
        <Tab label="구성원 관리" />
        <Tab label="그룹 관리" />
        <Tab label="바로가기 관리" />
      </Tabs>

      {/* ── Tab 0: User Management ── */}
      {tabIndex === 0 && (
        <Box>
          {/* D-1: Role descriptions */}
          <Alert severity="info" sx={{ borderRadius: 2, mb: 2, fontSize: '0.85rem' }}>
            <strong>역할 설명:</strong><br />
            <strong>Super Admin</strong> — 전체 시스템 관리 (사용자/그룹/설정 등 모든 권한)<br />
            <strong>Admin</strong> — 사이트 관리 (프로젝트/구성원 관리)<br />
            <strong>중간관리자</strong> — 소속 프로젝트 관리 (담당 프로젝트 내 관리 권한)<br />
            <strong>Member</strong> — 일반 사용자 (할당된 프로젝트 내 작업 수행)
          </Alert>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <TextField
              size="small"
              placeholder="이름 또는 ID로 검색 (Enter: Knox 사내 검색)"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && userSearch.trim()) {
                  handleKnoxSearch();
                }
              }}
              sx={{ width: 380 }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={knoxSearching ? <CircularProgress size={16} /> : <SearchIcon />}
              onClick={() => { if (userSearch.trim()) handleKnoxSearch(userSearch.trim()); }}
              disabled={knoxSearching || !userSearch.trim()}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Knox 검색
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<PersonAddIcon />}
              onClick={() => setCreateUserDialogOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              구성원 추가
            </Button>
          </Box>

          <TableContainer
            component={Paper}
            sx={{ borderRadius: 2, border: '1px solid #E5E7EB' }}
            elevation={0}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>사용자</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Login ID</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>소속그룹</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>메일</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>역할</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>상태</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">
                    활성/비활성
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">
                    삭제
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredUsers.map(user => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            bgcolor: user.avatar_color || '#2955FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          {String(user.username || '?')
                            .charAt(0)
                            .toUpperCase()}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {user.username}
                        </Typography>
                      </Box>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {user.loginid}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: user.deptname ? '#374151' : '#9CA3AF', fontSize: '0.8rem' }}
                      >
                        {user.deptname || '-'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: user.mail ? '#374151' : '#9CA3AF', fontSize: '0.8rem' }}
                      >
                        {user.mail || '-'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {canChangeRoles && user.id !== resolvedCurrentUserId ? (
                        <Select
                          value={user.role || 'member'}
                          size="small"
                          onChange={e =>
                            updateRoleMut.mutate({
                              targetId: user.id,
                              role: String(e.target.value),
                            })
                          }
                          sx={{
                            height: 28,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            bgcolor: ROLE_CONFIG[user.role || 'member']?.bgcolor || '#F3F4F6',
                            color: ROLE_CONFIG[user.role || 'member']?.color || '#6B7280',
                            '& .MuiSelect-select': { py: 0.3, px: 1 },
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#C7D2FE' },
                            borderRadius: 2,
                          }}
                        >
                          <MenuItem value="member" sx={{ fontSize: '0.8rem' }}>
                            Member
                          </MenuItem>
                          {isSuperAdmin && (
                            <MenuItem value="admin" sx={{ fontSize: '0.8rem' }}>
                              Admin
                            </MenuItem>
                          )}
                          {isSuperAdmin && (
                            <MenuItem value="super_admin" sx={{ fontSize: '0.8rem' }}>
                              Super Admin
                            </MenuItem>
                          )}
                        </Select>
                      ) : (
                        <Chip
                          label={ROLE_CONFIG[user.role || 'member']?.label || user.role || 'member'}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            bgcolor: ROLE_CONFIG[user.role || 'member']?.bgcolor || '#F3F4F6',
                            color: ROLE_CONFIG[user.role || 'member']?.color || '#6B7280',
                          }}
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={user.is_active !== false ? '활성' : '비활성'}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          bgcolor: user.is_active !== false ? '#DCFCE7' : '#FEE2E2',
                          color: user.is_active !== false ? '#22C55E' : '#EF4444',
                        }}
                      />
                    </TableCell>

                    <TableCell align="center">
                      <Switch
                        checked={user.is_active !== false}
                        onChange={() => toggleActiveMut.mutate(user.id)}
                        disabled={
                          user.role === 'admin' ||
                          user.role === 'super_admin' ||
                          user.id === resolvedCurrentUserId
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="비활성화 (접근 차단)">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={
                              user.role === 'super_admin' ||
                              user.id === resolvedCurrentUserId ||
                              deleteUserMut.isPending
                            }
                            onClick={() => {
                              if (window.confirm(`"${user.username}" 사용자를 삭제하시겠습니까?\n관련 데이터가 모두 삭제됩니다.`)) {
                                deleteUserMut.mutate(user.id);
                              }
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Knox 검색 결과 (사용자 테이블 바로 아래) */}
          {knoxResults.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#5B21B6' }}>
                Knox 사내 검색 결과 ({knoxResults.length}명) — "{knoxSearch}"
              </Typography>
              <TableContainer
                component={Paper}
                sx={{ borderRadius: 2, border: '1px solid #E5E7EB' }}
                elevation={0}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#F5F3FF' }}>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>이름</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>부서</TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">작업</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {knoxResults.map((emp: any, idx: number) => {
                      const loginid = (emp.loginid || emp.login_id || emp.id || '').toString().toLowerCase();
                      const isRegistered = adminUsers.some(
                        u => (u.loginid || '').toLowerCase() === loginid
                      );
                      return (
                        <TableRow key={idx} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {emp.fullName || emp.username || emp.name || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#6B7280' }}>
                              {loginid}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
                              {emp.deptName || emp.deptname || emp.department || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            {isRegistered ? (
                              <Chip
                                label="등록됨"
                                size="small"
                                sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#DCFCE7', color: '#22C55E' }}
                              />
                            ) : (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={() =>
                                  addFromKnoxMut.mutate({
                                    username: emp.fullName || emp.username || emp.name || loginid,
                                    loginid,
                                  })
                                }
                                disabled={addFromKnoxMut.isPending}
                                sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                              >
                                추가
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      )}

      {/* ── Tab 1: Group Management ── */}
      {tabIndex === 1 && (
        <Box>
          <Alert severity="info" sx={{ borderRadius: 2, mb: 2, fontSize: '0.85rem' }}>
            회사 내부 실제 조직/그룹명(예: ETCH기술팀)을 등록하면, 해당 그룹에 소속된 사용자에게
            사이트 접근 권한이 자동 부여됩니다. 사용자의 소속 그룹은 사용자 데이터의{' '}
            <strong>group_name</strong> 필드로 매칭됩니다.
          </Alert>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              등록된 그룹 목록
            </Typography>
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              size="small"
              onClick={() => setGroupDialogOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              그룹 등록
            </Button>
          </Box>

          {/* Knox 부서/그룹 검색 */}
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid #E5E7EB' }} elevation={0}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#5B21B6' }}>
              Knox 사내 부서 검색
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem', mb: 1.5 }}>
              사내 구성원을 검색하면 소속 부서를 확인하고 그룹으로 등록할 수 있습니다.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <TextField
                size="small"
                placeholder="사내 이름으로 검색..."
                value={groupKnoxQuery}
                onChange={e => setGroupKnoxQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGroupKnoxSearch()}
                sx={{ width: 300 }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={groupKnoxSearching ? <CircularProgress size={14} /> : <SearchIcon />}
                onClick={handleGroupKnoxSearch}
                disabled={groupKnoxSearching || !groupKnoxQuery.trim()}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                검색
              </Button>
            </Box>
            {groupKnoxResults.length > 0 && (() => {
              // Extract unique departments
              const deptSet = new Map<string, number>();
              groupKnoxResults.forEach((emp: any) => {
                const dept = emp.deptName || emp.deptname || emp.department || '';
                if (dept) deptSet.set(dept, (deptSet.get(dept) || 0) + 1);
              });
              const depts = Array.from(deptSet.entries());
              return (
                <Box>
                  <Typography variant="caption" sx={{ color: '#6B7280', mb: 1, display: 'block' }}>
                    검색된 부서 ({depts.length}개)
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                    {depts.map(([dept, count]) => {
                      const alreadyExists = groups.some(g => g.name === dept);
                      return (
                        <Chip
                          key={dept}
                          label={`${dept} (${count}명)`}
                          size="small"
                          onClick={() => {
                            if (!alreadyExists) {
                              setGroupName(dept);
                              setGroupDialogOpen(true);
                            }
                          }}
                          sx={{
                            cursor: alreadyExists ? 'default' : 'pointer',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            bgcolor: alreadyExists ? '#DCFCE7' : '#EDE9FE',
                            color: alreadyExists ? '#22C55E' : '#7C3AED',
                            border: alreadyExists ? '1px solid #22C55E40' : '1px solid #8B5CF640',
                            '&:hover': alreadyExists ? {} : { bgcolor: '#DDD6FE' },
                          }}
                          deleteIcon={alreadyExists ? undefined : <AddIcon sx={{ fontSize: '14px !important' }} />}
                          onDelete={alreadyExists ? undefined : () => {
                            setGroupName(dept);
                            setGroupDialogOpen(true);
                          }}
                        />
                      );
                    })}
                  </Box>
                  <Typography variant="caption" sx={{ color: '#6B7280', mb: 1, display: 'block' }}>
                    검색된 구성원 ({groupKnoxResults.length}명)
                  </Typography>
                  <TableContainer component={Paper} sx={{ borderRadius: 1, border: '1px solid #E5E7EB', maxHeight: 200 }} elevation={0}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#F5F3FF' }}>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>이름</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>ID</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>부서</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {groupKnoxResults.slice(0, 20).map((emp: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ fontSize: '0.8rem' }}>{emp.fullName || emp.username || emp.name || '-'}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: '#6B7280' }}>{(emp.loginid || emp.login_id || emp.id || '').toString().toLowerCase()}</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: '#6B7280' }}>{emp.deptName || emp.deptname || emp.department || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              );
            })()}
          </Paper>

          {groups.length === 0 ? (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              등록된 그룹이 없습니다. 회사 조직/그룹명을 등록하세요.
            </Alert>
          ) : (
            <TableContainer
              component={Paper}
              sx={{ borderRadius: 2, border: '1px solid #E5E7EB' }}
              elevation={0}
            >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>그룹명</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">
                      매칭 인원
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>등록일</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }} align="center">
                      작업
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groups.map(group => (
                    <TableRow key={group.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <GroupsIcon sx={{ color: '#8B5CF6', fontSize: 20 }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {group.name}
                          </Typography>
                        </Box>
                      </TableCell>

                      <TableCell align="center">
                        <Chip
                          label={`${group.matched_count || 0}명`}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            bgcolor: (group.matched_count || 0) > 0 ? '#DCFCE7' : '#FEF3C7',
                            color: (group.matched_count || 0) > 0 ? '#22C55E' : '#D97706',
                          }}
                        />
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#9CA3AF', fontSize: '0.8rem' }}>
                          {group.created_at
                            ? new Date(group.created_at).toLocaleDateString('ko-KR')
                            : '-'}
                        </Typography>
                      </TableCell>

                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="그룹 소속 사용자 일괄 활성화">
                            <IconButton
                              size="small"
                              onClick={() => applyGroupMut.mutate(group.id)}
                              color="primary"
                            >
                              <PlayArrowIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="삭제">
                            <IconButton
                              size="small"
                              onClick={() => deleteGroupMut.mutate(group.id)}
                              color="error"
                            >
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              바로가기 목록
            </Typography>
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              size="small"
              onClick={() => openShortcutDialog()}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              바로가기 추가
            </Button>
          </Box>

          {shortcuts.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              등록된 바로가기가 없습니다.
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {shortcuts
                .slice()
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(sc => (
                  <Paper
                    key={sc.id}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: '1px solid #E5E7EB',
                      width: 200,
                      position: 'relative',
                    }}
                    elevation={0}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: 2,
                          bgcolor: sc.icon_color || '#2955FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '1.1rem',
                        }}
                      >
                        {sc.icon_text || sc.name.charAt(0).toUpperCase()}
                      </Box>

                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, fontSize: '0.85rem' }}
                          noWrap
                        >
                          {sc.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: '#9CA3AF',
                            fontSize: '0.6rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.3,
                          }}
                        >
                          <LinkIcon sx={{ fontSize: 10 }} />{' '}
                          {sc.url.replace(/^https?:\/\//, '').substring(0, 20)}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <Chip
                        label={sc.active ? '활성' : '비활성'}
                        size="small"
                        sx={{
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          bgcolor: sc.active ? '#DCFCE7' : '#FEE2E2',
                          color: sc.active ? '#22C55E' : '#EF4444',
                        }}
                      />
                      <IconButton size="small" onClick={() => openShortcutDialog(sc)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => deleteShortcutMut.mutate(sc.id)}
                        color="error"
                      >
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  </Paper>
                ))}
            </Box>
          )}
        </Box>
      )}

      {/* ── Group Dialog ── */}
      <Dialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>그룹 등록</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#6B7280', mb: 2, fontSize: '0.85rem' }}>
            회사 내부 조직/그룹명을 입력하세요. (예: ETCH기술팀, 개발1팀)
          </Typography>
          <TextField
            fullWidth
            label="그룹명 *"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="예: ETCH기술팀"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setGroupDialogOpen(false)} sx={{ textTransform: 'none' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateGroup}
            disabled={!groupName.trim()}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            등록
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Shortcut Dialog ── */}
      <Dialog
        open={shortcutDialogOpen}
        onClose={() => setShortcutDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingShortcut ? '바로가기 수정' : '바로가기 추가'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="이름 *"
            value={scName}
            onChange={e => setScName(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="URL *"
            placeholder="https://example.com"
            value={scUrl}
            onChange={e => setScUrl(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="아이콘 텍스트 (기본: 이름 첫글자)"
            value={scIconText}
            onChange={e => setScIconText(e.target.value)}
            sx={{ mb: 2 }}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            아이콘 배경색
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {ICON_COLORS.map(color => (
              <Box
                key={color}
                onClick={() => setScIconColor(color)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1.5,
                  bgcolor: color,
                  cursor: 'pointer',
                  border: scIconColor === color ? '3px solid #1A1D29' : '2px solid transparent',
                  transition: 'all 0.15s',
                  '&:hover': { transform: 'scale(1.1)' },
                }}
              />
            ))}
          </Box>

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            미리보기
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              bgcolor: '#F9FAFB',
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: scIconColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: '1.2rem',
              }}
            >
              {(scIconText || scName || '?').charAt(0).toUpperCase()}
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {scName || '이름'}
            </Typography>
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={scOpenNewTab}
                onChange={e => setScOpenNewTab(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                새 탭에서 열기
              </Typography>
            }
            sx={{ mt: 2 }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShortcutDialogOpen(false)} sx={{ textTransform: 'none' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveShortcut}
            disabled={!scName.trim() || !scUrl.trim()}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {editingShortcut ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── D-1: Create User Dialog (with Knox search) ── */}
      <Dialog
        open={createUserDialogOpen}
        onClose={() => { setCreateUserDialogOpen(false); setDialogKnoxResults([]); setDialogKnoxQuery(''); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon sx={{ color: '#2955FF' }} />
            구성원 추가
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Knox 사내 검색 */}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, mt: 1, color: '#5B21B6' }}>
            Knox 사내 검색으로 추가
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="사내 이름으로 검색..."
              value={dialogKnoxQuery}
              onChange={e => setDialogKnoxQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDialogKnoxSearch()}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={dialogKnoxSearching ? <CircularProgress size={14} /> : <SearchIcon />}
              onClick={handleDialogKnoxSearch}
              disabled={dialogKnoxSearching || !dialogKnoxQuery.trim()}
              sx={{ textTransform: 'none', minWidth: 80 }}
            >
              검색
            </Button>
          </Box>
          {dialogKnoxResults.length > 0 && (
            <Box sx={{ maxHeight: 200, overflowY: 'auto', mb: 2, border: '1px solid #E5E7EB', borderRadius: 1 }}>
              {dialogKnoxResults.map((emp: any, idx: number) => {
                const lid = (emp.loginid || emp.login_id || emp.id || '').toString().toLowerCase();
                const name = emp.fullName || emp.username || emp.name || lid;
                const dept = emp.deptName || emp.deptname || emp.department || '';
                const isRegistered = adminUsers.some(u => (u.loginid || '').toLowerCase() === lid);
                return (
                  <Box
                    key={idx}
                    sx={{
                      px: 1.5, py: 0.8,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      borderBottom: '1px solid #F3F4F6',
                      '&:hover': { bgcolor: '#F9FAFB' },
                      cursor: isRegistered ? 'default' : 'pointer',
                    }}
                    onClick={() => {
                      if (!isRegistered) {
                        setNewUsername(name);
                        setNewLoginId(lid);
                        setNewDeptname(dept);
                        setNewMail(emp.email || emp.mail || '');
                        setDialogKnoxResults([]);
                      }
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.85rem' }}>{name}</Typography>
                      <Typography variant="caption" sx={{ color: '#9CA3AF' }}>{lid} {dept ? `· ${dept}` : ''}</Typography>
                    </Box>
                    {isRegistered ? (
                      <Chip label="등록됨" size="small" sx={{ fontSize: '0.65rem', bgcolor: '#DCFCE7', color: '#22C55E' }} />
                    ) : (
                      <Typography variant="caption" sx={{ color: '#2955FF', fontWeight: 600 }}>선택</Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* 직접 입력 */}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#374151' }}>
            직접 입력
          </Typography>
          <TextField
            fullWidth
            label="이름 *"
            size="small"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            placeholder="예: 홍길동"
            sx={{ mb: 1.5 }}
          />
          <TextField
            fullWidth
            label="Login ID *"
            size="small"
            value={newLoginId}
            onChange={e => setNewLoginId(e.target.value)}
            placeholder="예: gildong.hong"
            sx={{ mb: 1.5 }}
          />
          <Select
            fullWidth
            value={newUserRole}
            onChange={e => setNewUserRole(e.target.value as string)}
            size="small"
            sx={{ mb: 1 }}
          >
            <MenuItem value="member">Member — 일반 사용자</MenuItem>
            <MenuItem value="manager">중간관리자 — 소속 프로젝트 관리</MenuItem>
            {isSuperAdmin && <MenuItem value="admin">Admin — 사이트 관리</MenuItem>}
          </Select>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => { setCreateUserDialogOpen(false); setDialogKnoxResults([]); setDialogKnoxQuery(''); }}
            sx={{ textTransform: 'none' }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!newUsername.trim() || !newLoginId.trim()) return;
              createUserMut.mutate({
                username: newUsername.trim(),
                loginid: newLoginId.trim(),
                role: newUserRole,
                deptname: newDeptname.trim() || undefined,
                mail: newMail.trim() || undefined,
              });
            }}
            disabled={!newUsername.trim() || !newLoginId.trim() || createUserMut.isPending}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {createUserMut.isPending ? '추가 중...' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPage;
