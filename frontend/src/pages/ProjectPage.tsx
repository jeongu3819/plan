import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Tabs, Tab, TextField, InputAdornment,
    IconButton, Chip, CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ViewListIcon from '@mui/icons-material/ViewList';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TimelineIcon from '@mui/icons-material/Timeline';
import ChatIcon from '@mui/icons-material/Chat';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Project } from '../api/client';
import { Task } from '../types';
import { useAppStore } from '../stores/useAppStore';
import BoardView from '../features/project/BoardView';
import ListView from '../features/project/ListView';
import CalendarView from '../features/project/CalendarView';
import RoadmapView from '../features/project/RoadmapView';
import NotesPanel from '../features/project/NotesPanel';
import NodeGraphView from '../features/project/NodeGraphView';
import { ReactFlowProvider } from 'react-flow-renderer';
import ProjectReportView from '../features/project/ProjectReportView';
import ProjectSettingsView from '../features/project/ProjectSettingsView';
import OnboardingTour from '../components/OnboardingTour';

const TAB_MAP: Record<string, number> = {
    board: 0, list: 1, calendar: 2, roadmap: 3, messenger: 4, notes: 4, graph: 5, report: 6, settings: 7,
};

const tabIcons = [
    <ViewKanbanIcon sx={{ fontSize: '1rem' }} />,
    <ViewListIcon sx={{ fontSize: '1rem' }} />,
    <CalendarMonthIcon sx={{ fontSize: '1rem' }} />,
    <TimelineIcon sx={{ fontSize: '1rem' }} />,
    <ChatIcon sx={{ fontSize: '1rem' }} />,
    <AccountTreeIcon sx={{ fontSize: '1rem' }} />,
    <AutoAwesomeIcon sx={{ fontSize: '1rem' }} />,
    <SettingsIcon sx={{ fontSize: '1rem' }} />,
];

const ProjectPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const projectId = parseInt(id || '0', 10);
    const tabParam = searchParams.get('tab');
    const [view, setView] = useState(tabParam ? (TAB_MAP[tabParam] ?? 0) : 0);
    const { openDrawer, filterSearch, setFilterSearch, currentUserId } = useAppStore();
    const queryClient = useQueryClient();

    // Onboarding tour — only for template-created projects (URL has ?onboarding=1)
    const onboardingParam = searchParams.get('onboarding');
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        if (onboardingParam === '1' && !localStorage.getItem('plan-a-onboarding-disabled')) {
            setShowOnboarding(true);
        }
    }, [onboardingParam]);

    // Update view when URL tab param changes
    useEffect(() => {
        if (tabParam && TAB_MAP[tabParam] !== undefined) {
            setView(TAB_MAP[tabParam]);
        }
    }, [tabParam]);

    const { data: projects = [] } = useQuery<Project[]>({
        queryKey: ['projects', currentUserId],
        queryFn: () => api.getProjects(currentUserId),
    });

    const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
        queryKey: ['tasks', projectId, currentUserId],
        queryFn: () => api.getTasks(projectId, currentUserId),
        enabled: projectId > 0,
    });

    const project = projects.find(p => p.id === projectId);

    // Open task drawer + work note from @mention link
    const openTaskParam = searchParams.get('openTask');
    useEffect(() => {
        if (openTaskParam && tasks.length > 0) {
            const taskId = parseInt(openTaskParam, 10);
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                openDrawer(task, projectId);
            }
        }
    }, [openTaskParam, tasks, projectId, openDrawer]);

    const handleSearch = (val: string) => {
        setFilterSearch(val);
    };

    if (!project && !tasksLoading) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6" color="textSecondary">Project not found</Typography>
            </Box>
        );
    }

    const taskCounts = {
        todo: tasks.filter(t => t.status === 'todo').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        done: tasks.filter(t => t.status === 'done').length,
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D29', letterSpacing: '-0.025em' }}>
                            {project?.name || 'Loading...'}
                        </Typography>
                        {project?.description && (
                            <Typography
                                sx={{
                                    fontSize: '0.85rem',
                                    color: '#6B7280',
                                    mt: 0.3,
                                    lineHeight: 1.5,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                }}
                            >
                                {project.description}
                            </Typography>
                        )}
                    </Box>
                    <IconButton
                        onClick={() => openDrawer(null, projectId)}
                        sx={{
                            bgcolor: '#2955FF', color: '#fff', width: 36, height: 36,
                            '&:hover': { bgcolor: '#1E44CC' },
                        }}
                    >
                        <AddIcon />
                    </IconButton>
                </Box>

                {/* Stats chips */}
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <Chip label={`${taskCounts.todo} To Do`} size="small"
                        sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#F3F4F6', color: '#6B7280' }} />
                    <Chip label={`${taskCounts.in_progress} In Progress`} size="small"
                        sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#EEF2FF', color: '#2955FF' }} />
                    <Chip label={`${taskCounts.done} Done`} size="small"
                        sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#F0FDF4', color: '#22C55E' }} />
                </Box>

                {/* Tabs and Search */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB' }}>
                    <Tabs
                        value={view}
                        onChange={(_, v) => setView(v)}
                        sx={{
                            minHeight: 40,
                            '& .MuiTab-root': {
                                minHeight: 40, py: 1, textTransform: 'none',
                                fontWeight: 600, fontSize: '0.8rem', gap: 0.5,
                            },
                            '& .MuiTabs-indicator': { bgcolor: '#2955FF', height: 2.5 },
                        }}
                    >
                        <Tab icon={tabIcons[0]} iconPosition="start" label="Board" />
                        <Tab icon={tabIcons[1]} iconPosition="start" label="List" />
                        <Tab icon={tabIcons[2]} iconPosition="start" label="Calendar" />
                        <Tab icon={tabIcons[3]} iconPosition="start" label="Roadmap" />
                        <Tab icon={tabIcons[4]} iconPosition="start" label="Messenger" />
                        <Tab icon={tabIcons[5]} iconPosition="start" label="Graph" />
                        <Tab icon={tabIcons[6]} iconPosition="start" label="AI Report" />
                        <Tab icon={tabIcons[7]} iconPosition="start" label="Settings" />
                    </Tabs>

                    {view < 3 && (
                        <TextField
                            size="small"
                            placeholder="Search tasks..."
                            value={filterSearch}
                            onChange={(e) => handleSearch(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: '1rem', color: '#9CA3AF' }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                width: 200,
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2, fontSize: '0.8rem', height: 34,
                                },
                            }}
                        />
                    )}
                </Box>
            </Box>

            {/* Content */}
            {tasksLoading ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <CircularProgress size={32} />
                </Box>
            ) : (
                <Box>
                    {view === 0 && <BoardView projectId={projectId} />}
                    {view === 1 && <ListView projectId={projectId} />}
                    {view === 2 && <CalendarView projectId={projectId} />}
                    {view === 3 && <RoadmapView projectId={projectId} />}
                    {view === 4 && <NotesPanel projectId={projectId} />}
                    {view === 5 && <ReactFlowProvider><NodeGraphView projectId={projectId} /></ReactFlowProvider>}
                    {view === 6 && <ProjectReportView projectId={projectId} />}
                    {view === 7 && <ProjectSettingsView projectId={projectId} />}
                </Box>
            )}

            {/* Onboarding Tour */}
            {showOnboarding && (
                <OnboardingTour
                    onComplete={() => setShowOnboarding(false)}
                    onTabChange={(tabIndex) => setView(tabIndex)}
                    onAction={(action) => {
                        const { closeDrawer: cd } = useAppStore.getState();
                        const click = (sel: string, delay = 0) => setTimeout(() => {
                            const el = document.querySelector(`[data-tour="${sel}"]`) as HTMLElement;
                            if (el) el.click();
                        }, delay);

                        switch (action) {
                            case 'openFirstTask': {
                                const t = tasks.find(t => t.status !== 'done') || tasks[0];
                                if (t) openDrawer(t, projectId);
                                break;
                            }
                            case 'closeDrawer':
                                cd();
                                break;
                            case 'openStatusDropdown':
                                // Status select 드롭다운 열기
                                setTimeout(() => {
                                    const sel = document.querySelector('[data-tour="status-select"]');
                                    const input = sel?.querySelector('.MuiSelect-select, .MuiInputBase-input') as HTMLElement;
                                    if (input) input.click();
                                    // 2.5초 후 자동으로 닫기 (바깥 클릭)
                                    setTimeout(() => document.body.click(), 2500);
                                }, 600);
                                break;
                            case 'openPriorityDropdown':
                                // Priority select 드롭다운 열기
                                setTimeout(() => {
                                    const sel = document.querySelector('[data-tour="priority-select"]');
                                    const input = sel?.querySelector('.MuiSelect-select, .MuiInputBase-input') as HTMLElement;
                                    if (input) input.click();
                                    setTimeout(() => document.body.click(), 2500);
                                }, 600);
                                break;
                            case 'demoUrlAttach':
                                // 1) "+" 버튼 클릭 → 폼 열기
                                setTimeout(() => {
                                    const addBtn = document.querySelector('[data-tour="url-add-btn"]') as HTMLElement;
                                    if (addBtn) addBtn.click();
                                }, 400);
                                // 2) URL 입력
                                setTimeout(() => {
                                    const urlInput = document.querySelector('[data-tour="url-input"] input') as HTMLInputElement;
                                    const nameInput = document.querySelector('[data-tour="url-name-input"] input') as HTMLInputElement;
                                    const setVal = (el: HTMLInputElement, val: string) => {
                                        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                                        if (setter) { setter.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }
                                    };
                                    if (urlInput) setVal(urlInput, 'www.naver.com');
                                    if (nameInput) setTimeout(() => setVal(nameInput, '네이버'), 300);
                                }, 1200);
                                // 3) Add 버튼 클릭
                                setTimeout(() => {
                                    const submitBtn = document.querySelector('[data-tour="url-add-submit"]') as HTMLElement;
                                    if (submitBtn) submitBtn.click();
                                }, 2800);
                                break;
                            case 'openWorkNote':
                                click('work-note-btn', 600);
                                break;
                            case 'checkHalfItems':
                                // 체크박스 절반만 체크 (50% 이상 시연)
                                setTimeout(() => {
                                    const unchecked = document.querySelectorAll('.MuiDialog-root [data-testid="RadioButtonUncheckedIcon"]');
                                    const half = Math.ceil(unchecked.length / 2);
                                    for (let i = 0; i < Math.min(half, unchecked.length); i++) {
                                        const btn = unchecked[i]?.closest('button');
                                        if (btn) setTimeout(() => (btn as HTMLElement).click(), i * 500);
                                    }
                                }, 600);
                                break;
                            case 'closeAllAndShowBoard': {
                                const dlgClose = document.querySelector('.MuiDialog-root .MuiIconButton-root') as HTMLElement;
                                if (dlgClose) dlgClose.click();
                                setTimeout(() => cd(), 300);
                                break;
                            }
                            case 'showWeeklyProgress':
                                cd();
                                click('weekly-progress-btn', 500);
                                break;
                            case 'backToBoard':
                                click('board-view-btn');
                                break;
                            // ── Roadmap actions ──
                            case 'roadmapWeek':
                                click('roadmap-week', 500);
                                break;
                            case 'roadmapMonth':
                                click('roadmap-month', 500);
                                break;
                            case 'roadmapQuarter':
                                click('roadmap-quarter', 500);
                                break;
                            case 'roadmapToggleHideDone':
                                click('roadmap-hide-done', 500);
                                break;
                            // ── Messenger @멘션 데모 ──
                            case 'messengerMentionDemo':
                                setTimeout(() => {
                                    const input = document.querySelector('[data-tour="messenger-input"] textarea, [data-tour="messenger-input"] input') as HTMLInputElement;
                                    if (input) {
                                        const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
                                            || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                                        if (nativeSet) {
                                            nativeSet.call(input, '@개발자1 이 부분 확인 부탁드립니다!');
                                            input.dispatchEvent(new Event('input', { bubbles: true }));
                                        }
                                        input.focus();
                                    }
                                }, 800);
                                break;
                            // ── Graph: Task를 Sub Project에 실제 연결 ──
                            case 'graphAssignTaskToSubProject': {
                                // 첫 번째 task를 최신 subproject에 연결
                                setTimeout(async () => {
                                    try {
                                        const subs = await api.getSubProjects(projectId);
                                        const firstTask = tasks[0];
                                        if (subs.length > 0 && firstTask) {
                                            const latestSub = subs[subs.length - 1];
                                            await api.updateTask(firstTask.id, { sub_project_id: latestSub.id } as any);
                                            queryClient.invalidateQueries({ queryKey: ['graph', projectId] });
                                            queryClient.invalidateQueries({ queryKey: ['tasks'] });
                                        }
                                    } catch (e) { /* ignore */ }
                                }, 800);
                                break;
                            }
                            // ── Graph: Sub Project 생성 (다이얼로그 열기 + 입력 + Create) ──
                            case 'graphCreateSubProject': {
                                // 1) 다이얼로그 열기
                                click('graph-add-subproject', 600);
                                const setInput = (sel: string, val: string, delay: number) => {
                                    setTimeout(() => {
                                        const el = document.querySelector(`[data-tour="${sel}"] input, [data-tour="${sel}"] textarea`) as HTMLInputElement;
                                        if (!el) return;
                                        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                                            || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                                        if (setter) { setter.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }
                                        el.focus();
                                    }, delay);
                                };
                                // 2) Name 입력
                                setInput('graph-sp-name', '데모 서브프로젝트', 1200);
                                // 3) Description 입력
                                setInput('graph-sp-desc', '온보딩 투어에서 생성한 예시입니다', 1800);
                                // 4) Create 버튼 클릭
                                setTimeout(() => {
                                    const btn = document.querySelector('[data-tour="graph-sp-create-btn"]') as HTMLElement;
                                    if (btn) btn.click();
                                }, 3200);
                                break;
                            }
                        }
                    }}
                />
            )}
        </Box>
    );
};

export default ProjectPage;
