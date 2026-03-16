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
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import { useQuery } from '@tanstack/react-query';
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
    board: 0, list: 1, calendar: 2, roadmap: 3, notes: 4, graph: 5, report: 6, settings: 7,
};

const tabIcons = [
    <ViewKanbanIcon sx={{ fontSize: '1rem' }} />,
    <ViewListIcon sx={{ fontSize: '1rem' }} />,
    <CalendarMonthIcon sx={{ fontSize: '1rem' }} />,
    <TimelineIcon sx={{ fontSize: '1rem' }} />,
    <StickyNote2Icon sx={{ fontSize: '1rem' }} />,
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
                        <Tab icon={tabIcons[4]} iconPosition="start" label="Notes" />
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
                />
            )}
        </Box>
    );
};

export default ProjectPage;
