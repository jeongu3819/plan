import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Avatar,
  IconButton,
  CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Note } from '../../types';
import { useAppStore } from '../../stores/useAppStore';
import { useSnackbar } from 'notistack';
import { format } from 'date-fns';

interface NotesPanelProps {
  projectId: number;
}

const NotesPanel: React.FC<NotesPanelProps> = ({ projectId }) => {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();
  const currentUserId = useAppStore(state => state.currentUserId);
  const { enqueueSnackbar } = useSnackbar();

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ['notes', projectId],
    queryFn: () => api.getNotes(projectId, currentUserId),
  });

  const createMutation = useMutation({
    mutationFn: (text: string) => api.createNote(projectId, text, currentUserId),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['notes', projectId] });
      setContent('');
      // Show Korean toast as required
      enqueueSnackbar(data.message || '메모가 등록되었습니다', {
        variant: 'success',
        autoHideDuration: 3000,
        anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => api.deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', projectId] });
      enqueueSnackbar('메모가 삭제되었습니다', { variant: 'info', autoHideDuration: 2000 });
    },
  });

  const handleSubmit = () => {
    if (content.trim()) {
      createMutation.mutate(content.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Box sx={{ maxWidth: 800 }}>
      {/* Create Note */}
      <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid #E5E7EB', mb: 3 }} elevation={0}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Avatar sx={{ bgcolor: '#2955FF', width: 32, height: 32, fontSize: '0.8rem', mt: 0.5 }}>
            {String(currentUserId).charAt(0)}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              placeholder="메모를 작성하세요... (Ctrl+Enter로 등록)"
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              variant="outlined"
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  fontSize: '0.9rem',
                  bgcolor: '#FAFBFC',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5, gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                endIcon={<SendIcon sx={{ fontSize: '0.9rem !important' }} />}
                onClick={handleSubmit}
                disabled={!content.trim() || createMutation.isPending}
                sx={{
                  bgcolor: '#2955FF',
                  px: 2.5,
                  '&:hover': { bgcolor: '#1E44CC' },
                }}
              >
                등록
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Notes List */}
      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : notes.length === 0 ? (
        <Paper
          sx={{ p: 6, textAlign: 'center', borderRadius: 2, border: '1px solid #E5E7EB' }}
          elevation={0}
        >
          <StickyNote2Icon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" sx={{ color: '#6B7280', mb: 0.5 }}>
            메모가 없습니다
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
            첫 번째 메모를 작성해보세요
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {notes.map(note => (
            <Paper
              key={note.id}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid #E5E7EB',
                transition: 'all 0.15s',
                '&:hover': { borderColor: '#C7D2FE', boxShadow: '0 2px 8px rgba(41,85,255,0.06)' },
              }}
              elevation={0}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Avatar
                  sx={{
                    bgcolor: note.author_color || '#2955FF',
                    width: 28,
                    height: 28,
                    fontSize: '0.7rem',
                    mt: 0.3,
                  }}
                >
                  {(note.author_name || 'U').charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1A1D29' }}
                    >
                      {note.author_name || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                      {note.created_at ? format(new Date(note.created_at), 'yyyy-MM-dd HH:mm') : ''}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    component="div"
                    sx={{
                      color: '#374151',
                      fontSize: '0.9rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {note.content.split(/(@\S+)/g).map((part, i) =>
                      part.match(/^@\S+/) ? (
                        <span key={i} style={{ color: '#2955FF', fontWeight: 600 }}>
                          {part}
                        </span>
                      ) : (
                        <React.Fragment key={i}>{part}</React.Fragment>
                      )
                    )}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => deleteMutation.mutate(note.id)}
                  sx={{ color: '#D1D5DB', '&:hover': { color: '#EF4444' } }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default NotesPanel;
