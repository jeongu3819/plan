/**
 * TemplateLibraryDialog — accessible from sidebar "New Project" flow.
 *
 * Shows all available templates in a dialog.
 * Uses shared createProjectFromTemplate for full seed data creation.
 */

import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Paper, Chip, Button, TextField, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { PROJECT_TEMPLATES, ProjectTemplate, createProjectFromTemplate } from './ZeroStateDashboard';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

interface TemplateLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  currentUserId: number;
}

const TemplateLibraryDialog: React.FC<TemplateLibraryDialogProps> = ({
  open, onClose, currentUserId,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ProjectTemplate | null>(null);
  const [customName, setCustomName] = useState('');

  const createMutation = useMutation({
    mutationFn: async (template: ProjectTemplate) => {
      const name = customName.trim() || template.name;
      return createProjectFromTemplate(template, name, currentUserId);
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setSelected(null);
      setCustomName('');
      onClose();
      navigate(`/project/${project.id}?onboarding=1`);
    },
  });

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelected(template);
    setCustomName(template.name);
  };

  const handleBack = () => {
    setSelected(null);
    setCustomName('');
  };

  const taskSummary = (template: ProjectTemplate) => {
    const total = template.defaultTasks.length;
    const subs = template.subProjects?.length || 0;
    const notes = template.defaultTasks.reduce((n, t) => n + (t.activities?.length || 0), 0);
    const parts: string[] = [`${total} tasks`];
    if (subs > 0) parts.push(`${subs} sub`);
    if (notes > 0) parts.push(`${notes} notes`);
    return parts.join(' · ');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          {selected ? '프로젝트 만들기' : '템플릿 라이브러리'}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {!selected ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 0.5 }}>
            {PROJECT_TEMPLATES.map(template => (
              <Paper
                key={template.id}
                onClick={() => handleSelectTemplate(template)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 2, p: 2,
                  borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  '&:hover': {
                    borderColor: `${template.color}40`,
                    boxShadow: `0 2px 12px ${template.color}12`,
                    transform: 'translateX(2px)',
                  },
                }}
                elevation={0}
              >
                <Box sx={{
                  width: 40, height: 40, borderRadius: 2,
                  bgcolor: `${template.color}12`, color: template.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {React.cloneElement(template.icon as React.ReactElement, { sx: { fontSize: 20 } })}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {template.name}
                    </Typography>
                    <Chip label={template.category} size="small" sx={{ height: 16, fontSize: '0.55rem', fontWeight: 600, bgcolor: '#F3F4F6', color: '#6B7280' }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.72rem' }}>
                    {template.description}
                  </Typography>
                </Box>
                <Chip
                  label={taskSummary(template)}
                  size="small"
                  sx={{ height: 20, fontSize: '0.58rem', fontWeight: 600, bgcolor: `${template.color}10`, color: template.color, flexShrink: 0 }}
                />
              </Paper>
            ))}
          </Box>
        ) : (
          <Box sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <Box sx={{
                width: 44, height: 44, borderRadius: 2,
                bgcolor: `${selected.color}12`, color: selected.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {React.cloneElement(selected.icon as React.ReactElement, { sx: { fontSize: 24 } })}
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{selected.name}</Typography>
                <Typography variant="caption" sx={{ color: '#6B7280' }}>
                  {taskSummary(selected)}가 자동 생성됩니다
                </Typography>
              </Box>
            </Box>
            <TextField
              label="프로젝트 이름" value={customName}
              onChange={e => setCustomName(e.target.value)} fullWidth size="small" sx={{ mb: 2 }}
              onKeyDown={e => { if (e.key === 'Enter' && customName.trim()) createMutation.mutate(selected); }}
            />
            <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.72rem', display: 'block', mb: 1 }}>
              포함되는 Task:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 250, overflowY: 'auto' }}>
              {selected.defaultTasks.map((task, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: task.status === 'done' ? '#22C55E' : task.status === 'in_progress' ? '#2955FF' : '#D1D5DB', flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', color: '#374151', flex: 1 }}>
                    {task.title}
                  </Typography>
                  {task.subproject && (
                    <Chip label={task.subproject} size="small" sx={{ height: 14, fontSize: '0.48rem', bgcolor: '#F3F4F6', color: '#9CA3AF' }} />
                  )}
                  {task.priority === 'high' && (
                    <Chip label="High" size="small" sx={{ height: 14, fontSize: '0.5rem', bgcolor: '#FEF2F2', color: '#EF4444' }} />
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {selected ? (
          <>
            <Button onClick={handleBack} sx={{ textTransform: 'none' }}>뒤로</Button>
            <Button
              variant="contained"
              onClick={() => createMutation.mutate(selected)}
              disabled={createMutation.isPending}
              sx={{ textTransform: 'none', bgcolor: selected.color }}
            >
              {createMutation.isPending ? '생성 중...' : '생성하기'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose} sx={{ textTransform: 'none' }}>닫기</Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TemplateLibraryDialog;
