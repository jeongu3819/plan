import React, { useEffect, useState, useRef } from 'react';
import {
    Drawer, Box, Typography, TextField, Button, MenuItem,
    Stack, IconButton, Divider, Chip, Avatar, Autocomplete,
    Checkbox, Slider, Link, CircularProgress, LinearProgress,
    Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import LinkIcon from '@mui/icons-material/Link';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DownloadIcon from '@mui/icons-material/Download';
import { useAppStore } from '../stores/useAppStore';
import { Task, Attachment, TaskActivity } from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, User, API_URL } from '../api/client';
import WorkNoteModal from './WorkNoteModal';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const TaskDrawer: React.FC = () => {
    const { isDrawerOpen, closeDrawer, selectedTask, drawerProjectId, currentUserId } = useAppStore();
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<Partial<Task>>({});
    const [selectedAssignees, setSelectedAssignees] = useState<User[]>([]);
    const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
    const [newAttachmentName, setNewAttachmentName] = useState('');
    const [showAttachmentForm, setShowAttachmentForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch users (all - for fallback/display)
    const { data: allUsers = [] } = useQuery<User[]>({
        queryKey: ['users'],
        queryFn: () => api.getUsers(),
    });

    // Fetch project members - only assignable (not viewer)
    const activeProjectId = selectedTask?.project_id || drawerProjectId;
    const { data: projectMembers = [] } = useQuery<any[]>({
        queryKey: ['projectMembers', activeProjectId],
        queryFn: () => api.getProjectMembers(activeProjectId!),
        enabled: !!activeProjectId,
    });

    // Filter: viewer cannot be assigned
    const memberUserIds = new Set(
        projectMembers
            .filter((m: any) => m.role !== 'viewer')
            .map((m: any) => m.user_id)
    );
    const users = activeProjectId
        ? allUsers.filter(u => memberUserIds.has(u.id))
        : allUsers;

    // Check if current user is viewer (read-only)
    const currentMember = projectMembers.find((m: any) => m.user_id === currentUserId);
    const isViewer = currentMember?.role === 'viewer';

    // Fetch attachments when editing existing task
    const { data: attachments = [], isLoading: attachmentsLoading } = useQuery<Attachment[]>({
        queryKey: ['attachments', selectedTask?.id],
        queryFn: () => api.getAttachments(selectedTask!.id),
        enabled: !!selectedTask?.id,
    });

    const urlAttachments = attachments.filter(a => a.type !== 'file');
    const fileAttachments = attachments.filter(a => a.type === 'file');

    useEffect(() => {
        if (selectedTask) {
            setFormData({ ...selectedTask });
        } else {
            setFormData({
                title: '',
                status: 'todo',
                description: '',
                priority: 'medium',
                start_date: '',
                due_date: '',
                assignee_ids: [],
                tags: [],
                progress: 0,
                project_id: drawerProjectId,
            });
            setSelectedAssignees([]);
        }
        setShowAttachmentForm(false);
        setNewAttachmentUrl('');
        setNewAttachmentName('');
    }, [selectedTask, isDrawerOpen, drawerProjectId]);

    // Sync assignees when users load (separate effect to avoid infinite loop)
    useEffect(() => {
        if (selectedTask && users.length > 0) {
            const assigned = users.filter(u => selectedTask.assignee_ids?.includes(u.id));
            setSelectedAssignees(assigned);
        }
    }, [selectedTask?.id, users.length]);

    const updateMutation = useMutation({
        mutationFn: (updates: Partial<Task>) => {
            if (!selectedTask?.id) return Promise.reject("No task selected");
            return api.updateTask(selectedTask.id, updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            closeDrawer();
        },
    });

    const createMutation = useMutation({
        mutationFn: (newTask: Omit<Task, 'id'>) => api.createTask(newTask),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            closeDrawer();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (taskId: number) => api.deleteTask(taskId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            closeDrawer();
        },
    });

    const addAttachmentMutation = useMutation({
        mutationFn: (att: { url: string; filename?: string }) =>
            api.createAttachment(selectedTask!.id, { ...att, type: 'url' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attachments', selectedTask?.id] });
            setNewAttachmentUrl('');
            setNewAttachmentName('');
            setShowAttachmentForm(false);
        },
    });

    const deleteAttachmentMutation = useMutation({
        mutationFn: (id: number) => api.deleteAttachment(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attachments', selectedTask?.id] });
        },
    });

    const uploadFileMutation = useMutation({
        mutationFn: (file: File) => api.uploadTaskFile(selectedTask!.id, file, currentUserId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['attachments', selectedTask?.id] });
            setUploading(false);
        },
        onError: () => setUploading(false),
    });

    // Activities (for progress display only)
    const { data: activities = [] } = useQuery<TaskActivity[]>({
        queryKey: ['activities', selectedTask?.id],
        queryFn: () => api.getTaskActivities(selectedTask!.id),
        enabled: !!selectedTask?.id,
    });

    const [workNoteOpen, setWorkNoteOpen] = useState(false);

    const checkboxActivities = activities.filter(a => (a.block_type || 'checkbox') === 'checkbox');
    const activityProgress = checkboxActivities.length > 0
        ? Math.round(checkboxActivities.filter(a => a.checked).length / checkboxActivities.length * 100)
        : null;
    const displayProgress = activityProgress !== null ? activityProgress : (formData.progress || 0);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        setUploading(true);
        Array.from(selectedFiles).forEach((file) => uploadFileMutation.mutate(file));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleChange = (field: keyof Task, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        const assigneeIds = selectedAssignees.map(u => u.id);
        if (selectedTask && selectedTask.id) {
            updateMutation.mutate({ ...formData, assignee_ids: assigneeIds });
        } else {
            const newTask: Omit<Task, 'id'> = {
                title: formData.title || 'Untitled Task',
                project_id: formData.project_id || drawerProjectId,
                status: (formData.status as Task['status']) || 'todo',
                description: formData.description || '',
                priority: (formData.priority as Task['priority']) || 'medium',
                start_date: formData.start_date || null,
                due_date: formData.due_date || null,
                assignee_ids: assigneeIds,
                tags: formData.tags || [],
                progress: formData.progress || 0,
            };
            createMutation.mutate(newTask);
        }
    };

    const handleDelete = () => {
        if (selectedTask?.id) {
            deleteMutation.mutate(selectedTask.id);
        }
    };

    const statusOptions = [
        { value: 'todo', label: 'To Do', color: '#6B7280' },
        { value: 'in_progress', label: 'In Progress', color: '#2955FF' },
        { value: 'done', label: 'Done', color: '#22C55E' },
        { value: 'hold', label: 'Hold', color: '#F59E0B' },
    ];

    const priorityOptions = [
        { value: 'low', label: 'Low', color: '#6B7280' },
        { value: 'medium', label: 'Medium', color: '#3B82F6' },
        { value: 'high', label: 'High', color: '#EF4444' },
    ];

    const canEdit = !isViewer;

    return (
        <Drawer
            anchor="right"
            open={isDrawerOpen}
            onClose={closeDrawer}
            PaperProps={{ sx: { width: 560, p: 0, bgcolor: '#fff' } }}
        >
            {/* Header */}
            <Box sx={{
                p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid #E5E7EB', bgcolor: '#FAFBFC',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                        {selectedTask ? 'Task Details' : 'New Task'}
                    </Typography>
                    {isViewer && (
                        <Chip label="Viewer (읽기 전용)" size="small" sx={{ fontSize: '0.65rem', bgcolor: '#F3F4F6', color: '#6B7280' }} />
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {selectedTask && canEdit && (
                        <IconButton size="small" onClick={handleDelete} sx={{ color: '#EF4444' }}>
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                    )}
                    <IconButton size="small" onClick={closeDrawer}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>

            {/* Body */}
            <Box sx={{ p: 3, overflowY: 'auto', flexGrow: 1 }}>
                <Stack spacing={3}>
                    {/* Title */}
                    <TextField
                        placeholder="Task title..."
                        fullWidth
                        value={formData.title || ''}
                        onChange={(e) => handleChange('title', e.target.value)}
                        variant="standard"
                        InputProps={{
                            disableUnderline: true,
                            sx: { fontSize: '1.3rem', fontWeight: 700 },
                            readOnly: !canEdit,
                        }}
                        autoFocus={!selectedTask}
                    />

                    <Divider />

                    {/* Status & Priority */}
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                            Status & Priority
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                select label="Status" fullWidth size="small"
                                value={formData.status || 'todo'}
                                onChange={(e) => handleChange('status', e.target.value)}
                                disabled={!canEdit}
                            >
                                {statusOptions.map(opt => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: opt.color }} />
                                            {opt.label}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                select label="Priority" fullWidth size="small"
                                value={formData.priority || 'medium'}
                                onChange={(e) => handleChange('priority', e.target.value)}
                                disabled={!canEdit}
                            >
                                {priorityOptions.map(opt => (
                                    <MenuItem key={opt.value} value={opt.value}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: opt.color }} />
                                            {opt.label}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>
                    </Box>

                    {/* Progress + Work Note */}
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                Progress: {displayProgress}%
                                {activityProgress !== null && (
                                    <Chip label="자동 계산" size="small" sx={{ ml: 1, height: 16, fontSize: '0.55rem', bgcolor: '#EEF2FF', color: '#2955FF' }} />
                                )}
                            </Typography>
                            {selectedTask?.id && (
                                <Tooltip title="작업노트 열기" arrow>
                                    <Button
                                        size="small"
                                        startIcon={<EditNoteIcon sx={{ fontSize: '0.9rem' }} />}
                                        onClick={() => setWorkNoteOpen(true)}
                                        sx={{
                                            textTransform: 'none', fontSize: '0.7rem', fontWeight: 600,
                                            color: '#2955FF', borderRadius: 2, px: 1.2, py: 0.3,
                                            bgcolor: '#EEF2FF',
                                            '&:hover': { bgcolor: '#DBEAFE' },
                                        }}
                                    >
                                        작업노트
                                        {checkboxActivities.length > 0 && (
                                            <Chip
                                                label={`${checkboxActivities.filter(a => a.checked).length}/${checkboxActivities.length}`}
                                                size="small"
                                                sx={{ ml: 0.5, height: 16, fontSize: '0.55rem', bgcolor: 'rgba(41,85,255,0.15)', color: '#2955FF' }}
                                            />
                                        )}
                                    </Button>
                                </Tooltip>
                            )}
                        </Box>

                        {activityProgress !== null ? (
                            <Box
                                onClick={() => selectedTask?.id && setWorkNoteOpen(true)}
                                sx={{ cursor: selectedTask?.id ? 'pointer' : 'default', borderRadius: 1, p: 0.5, mx: -0.5, '&:hover': selectedTask?.id ? { bgcolor: '#F8F9FF' } : {} }}
                            >
                                <LinearProgress
                                    variant="determinate"
                                    value={displayProgress}
                                    sx={{
                                        height: 8, borderRadius: 4,
                                        bgcolor: '#E5E7EB',
                                        '& .MuiLinearProgress-bar': { bgcolor: displayProgress >= 100 ? '#22C55E' : '#2955FF', borderRadius: 4 },
                                    }}
                                />
                            </Box>
                        ) : (
                            <Slider
                                value={formData.progress || 0}
                                onChange={(_, v) => handleChange('progress', v as number)}
                                min={0} max={100} step={5}
                                disabled={!canEdit}
                                sx={{
                                    color: '#2955FF',
                                    '& .MuiSlider-thumb': { width: 16, height: 16 },
                                    '& .MuiSlider-track': { height: 6 },
                                    '& .MuiSlider-rail': { height: 6 },
                                }}
                            />
                        )}
                    </Box>

                    {/* Assignees */}
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                            Assignees
                        </Typography>
                        <Autocomplete
                            multiple
                            size="small"
                            options={users}
                            disableCloseOnSelect
                            value={selectedAssignees}
                            onChange={(_, newValue) => setSelectedAssignees(newValue)}
                            getOptionLabel={(option) => option.username}
                            isOptionEqualToValue={(option, value) => option.id === value.id}
                            disabled={!canEdit}
                            renderOption={(props, option, { selected }) => (
                                <li {...props}>
                                    <Checkbox
                                        icon={icon}
                                        checkedIcon={checkedIcon}
                                        style={{ marginRight: 8 }}
                                        checked={selected}
                                    />
                                    <Avatar sx={{ width: 24, height: 24, fontSize: '0.7rem', mr: 1, bgcolor: option.avatar_color || '#2955FF' }}>
                                        {option.username.charAt(0).toUpperCase()}
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{option.username}</Typography>
                                        <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>{option.role || 'member'}</Typography>
                                    </Box>
                                </li>
                            )}
                            renderTags={(tagValue, getTagProps) =>
                                tagValue.map((option, index) => (
                                    <Chip
                                        {...getTagProps({ index })}
                                        key={option.id}
                                        avatar={
                                            <Avatar sx={{ bgcolor: option.avatar_color || '#2955FF', width: 20, height: 20, fontSize: '0.6rem' }}>
                                                {option.username.charAt(0).toUpperCase()}
                                            </Avatar>
                                        }
                                        label={option.username}
                                        size="small"
                                        sx={{ height: 26, fontSize: '0.75rem' }}
                                    />
                                ))
                            }
                            renderInput={(params) => (
                                <TextField {...params} placeholder="Search members..." />
                            )}
                        />
                    </Box>

                    {/* Dates */}
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                            Schedule
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Start Date"
                                type="date"
                                fullWidth
                                size="small"
                                value={formData.start_date || ''}
                                onChange={(e) => handleChange('start_date', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                disabled={!canEdit}
                            />
                            <TextField
                                label="Due Date"
                                type="date"
                                fullWidth
                                size="small"
                                value={formData.due_date || ''}
                                onChange={(e) => handleChange('due_date', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                disabled={!canEdit}
                            />
                        </Box>
                    </Box>

                    {/* Description */}
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                            Description
                        </Typography>
                        <TextField
                            multiline
                            minRows={4}
                            maxRows={10}
                            fullWidth
                            size="small"
                            value={formData.description || ''}
                            onChange={(e) => handleChange('description', e.target.value)}
                            placeholder="Add a detailed description..."
                            disabled={!canEdit}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    fontSize: '0.9rem',
                                    bgcolor: '#FAFBFC',
                                },
                            }}
                        />
                    </Box>

                    {/* URL Attachments (only for existing tasks) */}
                    {selectedTask?.id && (
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                    <LinkIcon sx={{ fontSize: '0.8rem', mr: 0.5, verticalAlign: 'text-bottom' }} />
                                    URL 첨부 ({urlAttachments.length})
                                </Typography>
                                {canEdit && (
                                    <IconButton size="small" onClick={() => setShowAttachmentForm(!showAttachmentForm)} sx={{ color: '#2955FF' }}>
                                        <AddIcon sx={{ fontSize: '1rem' }} />
                                    </IconButton>
                                )}
                            </Box>

                            {/* Add Attachment Form */}
                            {showAttachmentForm && canEdit && (
                                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, p: 1.5, bgcolor: '#F8F9FF', borderRadius: 1.5, border: '1px solid #E8EDFF' }}>
                                    <TextField
                                        size="small" placeholder="URL..." fullWidth
                                        value={newAttachmentUrl}
                                        onChange={e => setNewAttachmentUrl(e.target.value)}
                                        InputProps={{ startAdornment: <LinkIcon sx={{ fontSize: '1rem', color: '#9CA3AF', mr: 0.5 }} /> }}
                                        sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
                                    />
                                    <TextField
                                        size="small" placeholder="Name..." sx={{ minWidth: 120, '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
                                        value={newAttachmentName}
                                        onChange={e => setNewAttachmentName(e.target.value)}
                                    />
                                    <Button size="small" variant="contained"
                                        disabled={!newAttachmentUrl.trim()}
                                        onClick={() => addAttachmentMutation.mutate({ url: newAttachmentUrl.trim(), filename: newAttachmentName.trim() || undefined })}
                                        sx={{ bgcolor: '#2955FF', minWidth: 'auto', px: 2 }}
                                    >
                                        Add
                                    </Button>
                                </Box>
                            )}

                            {/* URL Attachment List */}
                            {attachmentsLoading ? (
                                <CircularProgress size={16} />
                            ) : urlAttachments.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {urlAttachments.map(att => (
                                        <Box key={att.id} sx={{
                                            display: 'flex', alignItems: 'center', gap: 1, p: 1,
                                            borderRadius: 1, border: '1px solid #E5E7EB',
                                            '&:hover': { bgcolor: '#FAFBFF' },
                                        }}>
                                            <LinkIcon sx={{ fontSize: '0.9rem', color: '#2955FF' }} />
                                            <Link
                                                href={att.url}
                                                target="_blank"
                                                sx={{
                                                    fontSize: '0.8rem', fontWeight: 500, flexGrow: 1,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {att.filename || att.url}
                                            </Link>
                                            <IconButton size="small" href={att.url} target="_blank" sx={{ color: '#6B7280' }}>
                                                <OpenInNewIcon sx={{ fontSize: '0.8rem' }} />
                                            </IconButton>
                                            {canEdit && (
                                                <IconButton size="small" onClick={() => deleteAttachmentMutation.mutate(att.id)} sx={{ color: '#D1D5DB', '&:hover': { color: '#EF4444' } }}>
                                                    <DeleteOutlineIcon sx={{ fontSize: '0.8rem' }} />
                                                </IconButton>
                                            )}
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="caption" sx={{ color: '#9CA3AF' }}>URL 첨부 없음</Typography>
                            )}
                        </Box>
                    )}

                    {/* File Attachments (only for existing tasks) */}
                    {selectedTask?.id && (
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                    <CloudUploadIcon sx={{ fontSize: '0.8rem', mr: 0.5, verticalAlign: 'text-bottom' }} />
                                    Files 업로드 ({fileAttachments.length})
                                </Typography>
                                {canEdit && (
                                    <Button
                                        size="small"
                                        startIcon={<CloudUploadIcon sx={{ fontSize: '0.8rem' }} />}
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                        sx={{ textTransform: 'none', fontSize: '0.7rem', color: '#2955FF' }}
                                    >
                                        {uploading ? '업로드 중...' : '파일 선택'}
                                    </Button>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    hidden
                                    onChange={handleFileSelect}
                                />
                            </Box>

                            {uploading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

                            {fileAttachments.length > 0 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {fileAttachments.map(att => (
                                        <Box key={att.id} sx={{
                                            display: 'flex', alignItems: 'center', gap: 1, p: 1,
                                            borderRadius: 1, border: '1px solid #E5E7EB',
                                            '&:hover': { bgcolor: '#FAFBFF' },
                                        }}>
                                            <InsertDriveFileIcon sx={{ fontSize: '0.9rem', color: '#8B5CF6' }} />
                                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                                    {att.filename || 'file'}
                                                </Typography>
                                                {att.size && (
                                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem' }}>
                                                        {formatFileSize(att.size)}
                                                    </Typography>
                                                )}
                                            </Box>
                                            <Tooltip title="다운로드">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => {
                                                        const baseUrl = API_URL.replace(/\/api\/?$/, '');
                                                        const fileUrl = att.url.startsWith('/') ? `${baseUrl}${att.url}` : `${baseUrl}/${att.url}`;
                                                        window.open(fileUrl, '_blank');
                                                    }}
                                                    sx={{ color: '#2955FF' }}
                                                >
                                                    <DownloadIcon sx={{ fontSize: '0.8rem' }} />
                                                </IconButton>
                                            </Tooltip>
                                            {canEdit && (
                                                <IconButton size="small" onClick={() => deleteAttachmentMutation.mutate(att.id)} sx={{ color: '#D1D5DB', '&:hover': { color: '#EF4444' } }}>
                                                    <DeleteOutlineIcon sx={{ fontSize: '0.8rem' }} />
                                                </IconButton>
                                            )}
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="caption" sx={{ color: '#9CA3AF' }}>첨부 파일 없음</Typography>
                            )}
                        </Box>
                    )}
                </Stack>
            </Box>

            {/* Footer */}
            {canEdit && (
                <Box sx={{
                    p: 2.5, display: 'flex', gap: 2,
                    borderTop: '1px solid #E5E7EB', bgcolor: '#FAFBFC',
                }}>
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleSave}
                        disabled={updateMutation.isPending || createMutation.isPending || !formData.title?.trim()}
                        sx={{ py: 1.2, bgcolor: '#2955FF', '&:hover': { bgcolor: '#1E44CC' } }}
                    >
                        {selectedTask ? 'Save Changes' : 'Create Task'}
                    </Button>
                    <Button variant="outlined" fullWidth onClick={closeDrawer} sx={{ py: 1.2 }}>
                        Cancel
                    </Button>
                </Box>
            )}
            {!canEdit && (
                <Box sx={{
                    p: 2.5, display: 'flex', gap: 2,
                    borderTop: '1px solid #E5E7EB', bgcolor: '#FAFBFC',
                }}>
                    <Button variant="outlined" fullWidth onClick={closeDrawer} sx={{ py: 1.2 }}>
                        닫기
                    </Button>
                </Box>
            )}
            {/* Work Note Modal */}
            {selectedTask?.id && (
                <WorkNoteModal
                    open={workNoteOpen}
                    onClose={() => setWorkNoteOpen(false)}
                    taskId={selectedTask.id}
                    taskTitle={selectedTask.title}
                    canEdit={canEdit}
                />
            )}
        </Drawer>
    );
};

export default TaskDrawer;
