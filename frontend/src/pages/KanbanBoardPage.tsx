import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, MenuItem, Chip, CircularProgress,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import { useQuery } from '@tanstack/react-query';
import { api, Project } from '../api/client';
import { Task } from '../types';
import { useAppStore } from '../stores/useAppStore';
import BoardView from '../features/project/BoardView';

const KanbanBoardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUserId = useAppStore(state => state.currentUserId);
  const openDrawer = useAppStore(state => state.openDrawer);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['projects', currentUserId],
    queryFn: () => api.getProjects(currentUserId),
  });

  const paramProjectId = searchParams.get('projectId');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    paramProjectId ? parseInt(paramProjectId, 10) : null
  );

  // Auto-select first project if none selected
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Sync URL param
  useEffect(() => {
    if (selectedProjectId) {
      setSearchParams({ projectId: String(selectedProjectId) }, { replace: true });
    }
  }, [selectedProjectId, setSearchParams]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ['tasks', selectedProjectId, currentUserId],
    queryFn: () => api.getTasks(selectedProjectId!, currentUserId),
    enabled: !!selectedProjectId && selectedProjectId > 0,
  });

  const taskCounts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
          <ViewKanbanIcon sx={{ color: '#2955FF', fontSize: '1.5rem' }} />
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D29', letterSpacing: '-0.025em' }}>
            Kanban Board
          </Typography>

          {/* Project Selector */}
          <TextField
            select
            size="small"
            value={selectedProjectId || ''}
            onChange={e => setSelectedProjectId(Number(e.target.value))}
            sx={{
              minWidth: 200,
              '& .MuiOutlinedInput-root': { fontSize: '0.85rem', fontWeight: 600 },
            }}
          >
            {projects.map(p => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>

          <Box sx={{ ml: 'auto' }}>
            {selectedProjectId && (
              <>
                <Chip
                  label="Settings"
                  size="small"
                  onClick={() => navigate(`/project/${selectedProjectId}?tab=settings`)}
                  sx={{ fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', mr: 1 }}
                />
                <IconButton
                  onClick={() => openDrawer(null, selectedProjectId)}
                  sx={{
                    bgcolor: '#2955FF', color: '#fff', width: 36, height: 36,
                    '&:hover': { bgcolor: '#1E44CC' },
                  }}
                >
                  <AddIcon />
                </IconButton>
              </>
            )}
          </Box>
        </Box>

        {/* Stats */}
        {selectedProjectId && (
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <Chip label={`${taskCounts.todo} To Do`} size="small"
              sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#F3F4F6', color: '#6B7280' }} />
            <Chip label={`${taskCounts.in_progress} In Progress`} size="small"
              sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#EEF2FF', color: '#2955FF' }} />
            <Chip label={`${taskCounts.done} Done`} size="small"
              sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: '#F0FDF4', color: '#22C55E' }} />
          </Box>
        )}
      </Box>

      {/* Content */}
      {projectsLoading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : !selectedProjectId ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="body1" sx={{ color: '#9CA3AF' }}>
            프로젝트를 선택하세요
          </Typography>
        </Box>
      ) : tasksLoading ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <BoardView projectId={selectedProjectId} />
      )}
    </Box>
  );
};

export default KanbanBoardPage;
