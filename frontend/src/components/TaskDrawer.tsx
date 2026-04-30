import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import { useAppStore } from '../stores/useAppStore';
import { Task, Attachment, TaskActivity, SubProject } from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, User, API_URL } from '../api/client';
import WorkNoteModal from './WorkNoteModal';
import TaskSheetPanel from './sheets/TaskSheetPanel';
import { parseTaskInput } from '../utils/magicInputParser';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const TaskDrawer: React.FC = () => {
    const { isDrawerOpen, closeDrawer, openDrawer, selectedTask, drawerProjectId, drawerInitialData, currentUserId, currentSpaceId } = useAppStore();
    const queryClient = useQueryClient();
    const pendingFollowUpRef = useRef<{ title: string; projectId: number } | null>(null);
    const [formData, setFormData] = useState<Partial<Task>>({});
    const [selectedAssignees, setSelectedAssignees] = useState<User[]>([]);
    const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
    const [newAttachmentName, setNewAttachmentName] = useState('');
    const [showAttachmentForm, setShowAttachmentForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Pending state for new tasks
    const [pendingUrls, setPendingUrls] = useState<{url: string, filename?: string}[]>([]);
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [pendingSheets, setPendingSheets] = useState<{templateId: number, title: string}[]>([]);

    // mode flag: calendar 날짜 클릭으로 생성 중인가?
    const isCalendarCreateMode = !selectedTask && (drawerInitialData as any)?.isCalendarCreate === true;

    // Fetch space projects for creation selection
    const { data: spaceProjects = [] } = useQuery<any[]>({
        queryKey: ['projects', currentUserId, currentSpaceId],
        queryFn: () => api.getProjects(currentUserId, currentSpaceId),
        enabled: !!currentSpaceId && isCalendarCreateMode,
    });

    // Fetch users (all - for fallback/display)
    const { data: allUsers = [] } = useQuery<User[]>({
        queryKey: ['users'],
        queryFn: () => api.getUsers(),
    });

    // Fetch project members - only assignable (not viewer)
    const activeProjectId = selectedTask?.project_id || formData.project_id || (drawerProjectId > 0 ? drawerProjectId : undefined);
    const { data: projectMembers = [] } = useQuery<any[]>({
        queryKey: ['projectMembers', activeProjectId],
        queryFn: () => api.getProjectMembers(activeProjectId!),
        enabled: !!activeProjectId,
    });

    // Fetch subprojects for the project
    const { data: subProjects = [] } = useQuery<SubProject[]>({
        queryKey: ['subProjects', activeProjectId],
        queryFn: () => api.getSubProjects(activeProjectId!),
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
                project_id: drawerProjectId > 0 ? drawerProjectId : undefined,
                ...(drawerInitialData || {}),
            });
            setSelectedAssignees([]);
        }
        setShowAttachmentForm(false);
        setNewAttachmentUrl('');
        setNewAttachmentName('');
        setPendingUrls([]);
        setPendingFiles([]);
        setPendingSheets([]);
        const tags = selectedTask?.tags || [];
        setIsIssue(tags.includes('이슈'));
        setIsSpecial(tags.includes('특이사항'));
        setCreateFollowUp(false);
    }, [selectedTask, isDrawerOpen, drawerProjectId, drawerInitialData]);

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
            queryClient.invalidateQueries({ queryKey: ['spaceOverview'] });
            queryClient.invalidateQueries({ queryKey: ['sheetExecutions'] });
            closeDrawer();
        },
    });

    const createMutation = useMutation({
        mutationFn: (newTask: Omit<Task, 'id'>) => api.createTask(newTask),
        onSuccess: async (createdTask) => {
            // v3.14: Task 생성 성공 후 pending 상태의 파일, URL, 시트 처리
            const uPromises = pendingUrls.map(att => api.createAttachment(createdTask.id, { ...att, type: 'url' }).catch(e => console.error(e)));
            const fPromises = pendingFiles.map(file => api.uploadTaskFile(createdTask.id, file, currentUserId).catch(e => console.error(e)));
            const sPromises = pendingSheets.map(sheet => {
                if (!currentSpaceId) return Promise.resolve();
                return api.createSheetExecution({
                    template_id: sheet.templateId,
                    task_id: createdTask.id,
                    project_id: createdTask.project_id,
                    title: sheet.title || undefined,
                }, currentSpaceId, currentUserId).catch(e => console.error(e));
            });

            if (uPromises.length > 0 || fPromises.length > 0 || sPromises.length > 0) {
                await Promise.all([...uPromises, ...fPromises, ...sPromises]);
            }

            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['spaceOverview'] });
            queryClient.invalidateQueries({ queryKey: ['sheetExecutions'] });
            
            const followUp = pendingFollowUpRef.current;
            pendingFollowUpRef.current = null;
            
            if (followUp) {
                openDrawer(null, followUp.projectId);
                setTimeout(() => setFormData(prev => ({ ...prev, title: followUp.title })), 30);
            } else if (isCalendarCreateMode) {
                // 캘린더 생성 모드면 생성 후 닫기
                closeDrawer();
            } else {
                // 보드 등에서의 생성은 생성 후 바로 편집 모드로 전환 (상세 기능 활성화)
                openDrawer(createdTask, createdTask.project_id);
            }
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (taskId: number) => api.deleteTask(taskId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            queryClient.invalidateQueries({ queryKey: ['spaceOverview'] });
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
    const [isIssue, setIsIssue] = useState(false);
    const [isSpecial, setIsSpecial] = useState(false);
    const [createFollowUp, setCreateFollowUp] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    // @멘션 링크에서 작업노트 자동 열기
    useEffect(() => {
        if (searchParams.get('openWorkNote') === '1' && selectedTask && isDrawerOpen) {
            setWorkNoteOpen(true);
            // 파라미터 정리
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('openWorkNote');
            newParams.delete('openTask');
            setSearchParams(newParams, { replace: true });
        }
    }, [selectedTask, isDrawerOpen, searchParams, setSearchParams]);

    const checkboxActivities = activities.filter(a => (a.block_type || 'checkbox') === 'checkbox');
    const activityProgress = checkboxActivities.length > 0
        ? Math.round(checkboxActivities.filter(a => a.checked).length / checkboxActivities.length * 100)
        : null;
    const displayProgress = activityProgress !== null ? activityProgress : (formData.progress || 0);

    const handleChange = (field: keyof Task, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // Auto-parse title for dates/tags when creating a new task
    const handleTitleBlur = () => {
        if (selectedTask) return; // only for new tasks
        const title = formData.title || '';
        if (!title.trim()) return;
        const parsed = parseTaskInput(title);
        if (parsed.confidence > 0.3) {
            setFormData(prev => ({
                ...prev,
                title: parsed.title,
                start_date: parsed.startDate || prev.start_date,
                due_date: parsed.endDate || prev.due_date,
                tags: parsed.tags.length > 0 ? parsed.tags : prev.tags,
                priority: parsed.priority || prev.priority,
            }));
        }
        // Auto-assign current user if no assignees yet
        if (selectedAssignees.length === 0 && currentUserId > 0 && users.length > 0) {
            const me = users.find(u => u.id === currentUserId);
            if (me) setSelectedAssignees([me]);
        }
    };

    const buildTags = (base: string[]) => {
        const t = new Set(base);
        if (isIssue) t.add('이슈'); else t.delete('이슈');
        if (isSpecial) t.add('특이사항'); else t.delete('특이사항');
        return Array.from(t);
    };

    const handleSave = () => {
        const assigneeIds = selectedAssignees.map(u => u.id);
        const tags = buildTags(formData.tags || []);
        if (selectedTask && selectedTask.id) {
            updateMutation.mutate({ ...formData, assignee_ids: assigneeIds, tags });
        } else {
            const currentTitle = formData.title || 'Untitled Task';
            const pid = formData.project_id || drawerProjectId;
            const newTask: Omit<Task, 'id'> = {
                title: currentTitle,
                project_id: pid,
                status: (formData.status as Task['status']) || 'todo',
                description: formData.description || '',
                priority: (formData.priority as Task['priority']) || 'medium',
                start_date: formData.start_date || null,
                due_date: formData.due_date || null,
                assignee_ids: assigneeIds,
                tags,
                progress: formData.progress || 0,
                sub_project_id: formData.sub_project_id || null,
            };
            if (createFollowUp) {
                pendingFollowUpRef.current = { title: `[후속] ${currentTitle}`, projectId: pid };
            }
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
                        placeholder={selectedTask ? "Task title..." : "예: 개선 아이템 3월~10월"}
                        fullWidth
                        value={formData.title || ''}
                        onChange={(e) => handleChange('title', e.target.value)}
                        onBlur={handleTitleBlur}
                        variant="standard"
                        InputProps={{
                            disableUnderline: true,
                            sx: { fontSize: '1.3rem', fontWeight: 700 },
                            readOnly: !canEdit,
                        }}
                        helperText={!selectedTask && !formData.title ? '일정을 포함하면 자동 설정됩니다 (예: 3~10, 3/10~10/20)' : undefined}
                        FormHelperTextProps={{ sx: { fontSize: '0.68rem', color: '#9CA3AF', mt: 0.5 } }}
                        autoFocus={!selectedTask}
                    />

                    <Divider />

                    {/* Project Selection (Calendar Create Task only) */}
                    {isCalendarCreateMode && (
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                                Project *
                            </Typography>
                            <TextField
                                select
                                fullWidth
                                size="small"
                                value={formData.project_id || ''}
                                onChange={(e) => handleChange('project_id', Number(e.target.value))}
                                disabled={!canEdit}
                                SelectProps={{ displayEmpty: true }}
                                error={!formData.project_id}
                                helperText={!formData.project_id ? '프로젝트를 선택해주세요' : ''}
                            >
                                <MenuItem value="" disabled>
                                    <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>프로젝트 선택</Typography>
                                </MenuItem>
                                {spaceProjects.length === 0 ? (
                                    <MenuItem value="" disabled>
                                        <Typography sx={{ fontSize: '0.85rem' }}>먼저 프로젝트를 생성해주세요</Typography>
                                    </MenuItem>
                                ) : (
                                    spaceProjects.map(p => (
                                        <MenuItem key={p.id} value={p.id}>
                                            {p.name}
                                        </MenuItem>
                                    ))
                                )}
                            </TextField>
                        </Box>
                    )}

                    {/* Status & Priority */}
                    <Box data-tour="status-priority-section">
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                            Status & Priority
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                data-tour="status-select"
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
                                data-tour="priority-select"
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

                    {/* SubProject */}
                    {subProjects.length > 0 && (
                    <Box>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                            Sub Project
                        </Typography>
                        <TextField
                            data-tour="subproject-select"
                            select
                            fullWidth
                            size="small"
                            value={formData.sub_project_id || ''}
                            onChange={(e) => handleChange('sub_project_id', e.target.value ? Number(e.target.value) : null)}
                            disabled={!canEdit}
                            SelectProps={{ displayEmpty: true }}
                        >
                            <MenuItem value="">
                                <Typography sx={{ color: '#9CA3AF', fontSize: '0.85rem' }}>선택 안 함</Typography>
                            </MenuItem>
                            {subProjects.map(sp => (
                                <MenuItem key={sp.id} value={sp.id}>
                                    {sp.name}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    )}

                    {/* Progress + Work Note */}
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                Progress: {displayProgress}%
                                {activityProgress !== null && (
                                    <Chip label="자동 계산" size="small" sx={{ ml: 1, height: 16, fontSize: '0.55rem', bgcolor: '#EEF2FF', color: '#2955FF' }} />
                                )}
                            </Typography>
                            <Tooltip title={selectedTask?.id ? "작업노트 열기" : "저장 후 작성 가능합니다"} arrow>
                                <span>
                                    <Button
                                        data-tour="work-note-btn"
                                        size="small"
                                        startIcon={<EditNoteIcon sx={{ fontSize: '0.9rem' }} />}
                                        onClick={() => setWorkNoteOpen(true)}
                                        disabled={!selectedTask?.id}
                                        sx={{
                                            textTransform: 'none', fontSize: '0.7rem', fontWeight: 600,
                                            color: '#2955FF', borderRadius: 2, px: 1.2, py: 0.3,
                                            bgcolor: '#EEF2FF',
                                            '&:hover': { bgcolor: '#DBEAFE' },
                                            '&.Mui-disabled': { bgcolor: '#F3F4F6', color: '#9CA3AF' }
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
                                </span>
                            </Tooltip>
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

                    {/* Quick actions (new task only) */}
                    {!selectedTask && canEdit && (
                        <Box>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem', mb: 1, display: 'block' }}>
                                추가 액션 (선택)
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Chip
                                    icon={<BugReportOutlinedIcon sx={{ fontSize: '0.9rem !important' }} />}
                                    label="이슈로 등록"
                                    size="small"
                                    clickable
                                    onClick={() => setIsIssue(v => !v)}
                                    sx={{
                                        fontSize: '0.72rem', height: 28,
                                        bgcolor: isIssue ? '#FEF2F2' : '#F3F4F6',
                                        color: isIssue ? '#DC2626' : '#6B7280',
                                        borderColor: isIssue ? '#FCA5A5' : 'transparent',
                                        border: '1px solid',
                                        fontWeight: isIssue ? 700 : 400,
                                    }}
                                />
                                <Chip
                                    icon={<WarningAmberIcon sx={{ fontSize: '0.9rem !important' }} />}
                                    label="특이사항 표시"
                                    size="small"
                                    clickable
                                    onClick={() => setIsSpecial(v => !v)}
                                    sx={{
                                        fontSize: '0.72rem', height: 28,
                                        bgcolor: isSpecial ? '#FFFBEB' : '#F3F4F6',
                                        color: isSpecial ? '#D97706' : '#6B7280',
                                        borderColor: isSpecial ? '#FCD34D' : 'transparent',
                                        border: '1px solid',
                                        fontWeight: isSpecial ? 700 : 400,
                                    }}
                                />
                                <Chip
                                    icon={<SubdirectoryArrowRightIcon sx={{ fontSize: '0.9rem !important' }} />}
                                    label="후속 Task 생성"
                                    size="small"
                                    clickable
                                    onClick={() => setCreateFollowUp(v => !v)}
                                    sx={{
                                        fontSize: '0.72rem', height: 28,
                                        bgcolor: createFollowUp ? '#EEF2FF' : '#F3F4F6',
                                        color: createFollowUp ? '#2955FF' : '#6B7280',
                                        borderColor: createFollowUp ? '#BFDBFE' : 'transparent',
                                        border: '1px solid',
                                        fontWeight: createFollowUp ? 700 : 400,
                                    }}
                                />
                            </Box>
                            {createFollowUp && (
                                <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.68rem', mt: 0.5, display: 'block' }}>
                                    저장 후 제목에 "[후속]"이 붙은 새 Task 입력창이 열립니다
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Issue/Special badges for existing tasks */}
                    {selectedTask && (isIssue || isSpecial) && (
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {isIssue && <Chip icon={<BugReportOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />} label="이슈" size="small" sx={{ fontSize: '0.7rem', height: 24, bgcolor: '#FEF2F2', color: '#DC2626' }} />}
                            {isSpecial && <Chip icon={<WarningAmberIcon sx={{ fontSize: '0.85rem !important' }} />} label="특이사항" size="small" sx={{ fontSize: '0.7rem', height: 24, bgcolor: '#FFFBEB', color: '#D97706' }} />}
                        </Box>
                    )}

                    {/* v3.13: 상세 기능 영역 (보드 생성 시에도 노출, 캘린더 생성 시에만 프로젝트 선택 후 노출) */}
                    {(!isCalendarCreateMode || formData.project_id) && (
                        <>
                        {/* URL Attachments */}
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                    <LinkIcon sx={{ fontSize: '0.8rem', mr: 0.5, verticalAlign: 'text-bottom' }} />
                                    URL 첨부 ({(selectedTask?.id ? urlAttachments.length : 0) + pendingUrls.length})
                                </Typography>
                                {canEdit && (
                                    <Tooltip title="URL 추가" arrow>
                                        <span>
                                            <IconButton
                                                data-tour="url-add-btn"
                                                size="small"
                                                onClick={() => setShowAttachmentForm(!showAttachmentForm)}
                                                sx={{ color: '#2955FF' }}
                                            >
                                                <AddIcon sx={{ fontSize: '1rem' }} />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                )}
                            </Box>

                            {/* Add Attachment Form */}
                            {showAttachmentForm && canEdit && (
                                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, p: 1.5, bgcolor: '#F8F9FF', borderRadius: 1.5, border: '1px solid #E8EDFF' }}>
                                    <TextField
                                        data-tour="url-input"
                                        size="small" placeholder="URL..." fullWidth
                                        value={newAttachmentUrl}
                                        onChange={e => setNewAttachmentUrl(e.target.value)}
                                        InputProps={{ startAdornment: <LinkIcon sx={{ fontSize: '1rem', color: '#9CA3AF', mr: 0.5 }} /> }}
                                        sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
                                    />
                                    <TextField
                                        data-tour="url-name-input"
                                        size="small" placeholder="Name..." sx={{ minWidth: 120, '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
                                        value={newAttachmentName}
                                        onChange={e => setNewAttachmentName(e.target.value)}
                                    />
                                    <Button data-tour="url-add-submit" size="small" variant="contained"
                                        disabled={!newAttachmentUrl.trim()}
                                        onClick={() => {
                                            if (selectedTask?.id) {
                                                addAttachmentMutation.mutate({ url: newAttachmentUrl.trim(), filename: newAttachmentName.trim() || undefined });
                                            } else {
                                                setPendingUrls(prev => [...prev, { url: newAttachmentUrl.trim(), filename: newAttachmentName.trim() || undefined }]);
                                                setNewAttachmentUrl('');
                                                setNewAttachmentName('');
                                                setShowAttachmentForm(false);
                                            }
                                        }}
                                        sx={{ bgcolor: '#2955FF', minWidth: 'auto', px: 2 }}
                                    >
                                        Add
                                    </Button>
                                </Box>
                            )}

                            {/* URL Attachment List */}
                            {attachmentsLoading ? (
                                <CircularProgress size={16} />
                            ) : (urlAttachments.length > 0 || pendingUrls.length > 0) ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {pendingUrls.map((att, idx) => (
                                        <Box key={`pending-url-${idx}`} sx={{
                                            display: 'flex', alignItems: 'center', gap: 1, p: 1,
                                            borderRadius: 1, border: '1px dashed #D1D5DB', bgcolor: '#F3F4F6'
                                        }}>
                                            <LinkIcon sx={{ fontSize: '0.9rem', color: '#9CA3AF' }} />
                                            <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, flexGrow: 1, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {att.filename || att.url}
                                            </Typography>
                                            <Chip label="대기 중" size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: '#E5E7EB', color: '#4B5563' }} />
                                            {canEdit && (
                                                <IconButton size="small" onClick={() => setPendingUrls(prev => prev.filter((_, i) => i !== idx))} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}>
                                                    <DeleteOutlineIcon sx={{ fontSize: '0.8rem' }} />
                                                </IconButton>
                                            )}
                                        </Box>
                                    ))}
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
                                <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                                    URL 첨부 없음
                                </Typography>
                            )}
                        </Box>

                        {/* File Attachments */}
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                    <CloudUploadIcon sx={{ fontSize: '0.8rem', mr: 0.5, verticalAlign: 'text-bottom' }} />
                                    Files 업로드 ({(selectedTask?.id ? fileAttachments.length : 0) + pendingFiles.length})
                                </Typography>
                                {canEdit && (
                                    <Tooltip title="파일 선택" arrow>
                                        <span>
                                            <Button
                                                size="small"
                                                startIcon={<CloudUploadIcon sx={{ fontSize: '0.8rem' }} />}
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                                sx={{ textTransform: 'none', fontSize: '0.7rem', color: '#2955FF' }}
                                            >
                                                {uploading ? '업로드 중...' : '파일 선택'}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    hidden
                                    onChange={(e) => {
                                        const selectedFiles = e.target.files;
                                        if (!selectedFiles) return;
                                        if (selectedTask?.id) {
                                            setUploading(true);
                                            Array.from(selectedFiles).forEach((file) => uploadFileMutation.mutate(file));
                                        } else {
                                            setPendingFiles(prev => [...prev, ...Array.from(selectedFiles)]);
                                        }
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                />
                            </Box>

                            {uploading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

                            {(fileAttachments.length > 0 || pendingFiles.length > 0) ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                    {pendingFiles.map((file, idx) => (
                                        <Box key={`pending-file-${idx}`} sx={{
                                            display: 'flex', alignItems: 'center', gap: 1, p: 1,
                                            borderRadius: 1, border: '1px dashed #D1D5DB', bgcolor: '#F3F4F6'
                                        }}>
                                            <InsertDriveFileIcon sx={{ fontSize: '0.9rem', color: '#9CA3AF' }} />
                                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                <Typography variant="body2" noWrap sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#6B7280' }}>
                                                    {file.name}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.65rem' }}>
                                                    {formatFileSize(file.size)}
                                                </Typography>
                                            </Box>
                                            <Chip label="대기 중" size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: '#E5E7EB', color: '#4B5563' }} />
                                            {canEdit && (
                                                <IconButton size="small" onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))} sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }}>
                                                    <DeleteOutlineIcon sx={{ fontSize: '0.8rem' }} />
                                                </IconButton>
                                            )}
                                        </Box>
                                    ))}
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

                        {/* Check Sheets */}
                        <Box>
                            <TaskSheetPanel
                                taskId={selectedTask?.id || 0}
                                projectId={selectedTask?.project_id || drawerProjectId || undefined}
                                canEdit={canEdit}
                                pendingSheets={pendingSheets}
                                onAddPendingSheet={(sheet) => setPendingSheets(prev => [...prev, sheet])}
                                onRemovePendingSheet={(idx) => setPendingSheets(prev => prev.filter((_, i) => i !== idx))}
                            />
                        </Box>
                        </>
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
