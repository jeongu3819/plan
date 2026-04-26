import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Paper,
  Avatar,
  IconButton,
  CircularProgress,
  Chip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Note } from '../../types';
import { useAppStore } from '../../stores/useAppStore';
import { useSnackbar } from 'notistack';
import { format, differenceInDays } from 'date-fns';

interface NotesPanelProps {
  projectId: number;
}

const NotesPanel: React.FC<NotesPanelProps> = ({ projectId }) => {
  const [content, setContent] = useState('');
  const queryClient = useQueryClient();
  const currentUserId = useAppStore(state => state.currentUserId);
  const { enqueueSnackbar } = useSnackbar();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ['notes', projectId],
    queryFn: () => api.getNotes(projectId, currentUserId),
  });

  // Reverse order for chat-style (oldest first at top, newest at bottom)
  const sortedNotes = [...notes].reverse();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [notes.length]);

  const createMutation = useMutation({
    mutationFn: (text: string) => api.createNote(projectId, text, currentUserId),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['notes', projectId] });
      setContent('');
      enqueueSnackbar(data.message || '메시지가 전송되었습니다', {
        variant: 'success',
        autoHideDuration: 2000,
        anchorOrigin: { vertical: 'bottom', horizontal: 'right' },
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => api.deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', projectId] });
      enqueueSnackbar('메시지가 삭제되었습니다', { variant: 'info', autoHideDuration: 2000 });
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

  const getDaysRemaining = (createdAt: string) => {
    const days = 7 - differenceInDays(new Date(), new Date(createdAt));
    return Math.max(0, days);
  };

  return (
    <Box sx={{ maxWidth: 800, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.5 }}>
        <ChatBubbleOutlineIcon sx={{ fontSize: '1.1rem', color: '#2955FF' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.88rem', flexGrow: 1 }}>
          Messenger
        </Typography>
        <Chip
          icon={<InfoOutlinedIcon sx={{ fontSize: '0.7rem !important' }} />}
          label="메시지는 7일간 보관됩니다"
          size="small"
          sx={{
            height: 22, fontSize: '0.65rem', fontWeight: 500,
            bgcolor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A',
            '& .MuiChip-icon': { color: '#92400E' },
          }}
        />
      </Box>

      {/* Messages Area */}
      <Paper
        sx={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          borderRadius: 2, border: '1px solid rgba(0,0,0,0.08)',
          bgcolor: 'rgba(248,249,252,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column',
        }}
        elevation={0}
      >
        {/* Messages scroll area */}
        <Box sx={{
          flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.12)', borderRadius: 2 },
        }}>
          {isLoading ? (
            <Box sx={{ textAlign: 'center', py: 4, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : sortedNotes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: '2.5rem', color: '#D1D5DB', mb: 1 }} />
              <Typography variant="body2" sx={{ color: '#6B7280', mb: 0.5 }}>
                메시지가 없습니다
              </Typography>
              <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                프로젝트 담당자들과 대화를 시작해보세요
              </Typography>
            </Box>
          ) : (
            sortedNotes.map(note => {
              const isMe = note.author_id === currentUserId;
              const daysLeft = note.created_at ? getDaysRemaining(note.created_at) : 7;
              return (
                <Box
                  key={note.id}
                  sx={{
                    display: 'flex',
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'flex-start',
                    gap: 1,
                    '&:hover .msg-actions': { opacity: 1 },
                  }}
                >
                  {!isMe && (
                    <Avatar
                      sx={{
                        bgcolor: note.author_color || '#2955FF',
                        width: 28, height: 28, fontSize: '0.7rem', mt: 0.3,
                      }}
                    >
                      {(note.author_name || 'U').charAt(0).toUpperCase()}
                    </Avatar>
                  )}
                  <Box sx={{ maxWidth: '75%', minWidth: 0 }}>
                    {!isMe && (
                      <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#6B7280', ml: 0.5, mb: 0.2, display: 'block' }}>
                        {note.author_name || 'Unknown'}
                      </Typography>
                    )}
                    <Box
                      sx={{
                        px: 1.8, py: 1.2,
                        borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        bgcolor: isMe ? '#2955FF' : '#fff',
                        color: isMe ? '#fff' : '#374151',
                        border: isMe ? 'none' : '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      <Typography
                        variant="body2"
                        component="div"
                        sx={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                      >
                        {note.content.split(/(@\S+)/g).map((part, i) =>
                          part.match(/^@\S+/) ? (
                            <span key={i} style={{ color: isMe ? '#93C5FD' : '#2955FF', fontWeight: 600 }}>
                              {part}
                            </span>
                          ) : (
                            <React.Fragment key={i}>{part}</React.Fragment>
                          )
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3, px: 0.5, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#9CA3AF' }}>
                        {note.created_at ? format(new Date(note.created_at), 'M/d HH:mm') : ''}
                      </Typography>
                      {daysLeft <= 2 && (
                        <Typography variant="caption" sx={{ fontSize: '0.55rem', color: '#F59E0B', fontWeight: 600 }}>
                          {daysLeft}일 후 삭제
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <IconButton
                    className="msg-actions"
                    size="small"
                    onClick={() => deleteMutation.mutate(note.id)}
                    sx={{ opacity: 0, transition: 'opacity 0.15s', color: '#D1D5DB', mt: 0.5, '&:hover': { color: '#EF4444' } }}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: '0.85rem' }} />
                  </IconButton>
                </Box>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input area */}
        <Box sx={{
          p: 1.5, borderTop: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'flex-end', gap: 1,
        }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            data-tour="messenger-input"
            placeholder="메시지를 입력하세요... (Ctrl+Enter)"
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3, fontSize: '0.85rem', bgcolor: '#F9FAFB',
                '& fieldset': { borderColor: 'rgba(0,0,0,0.08)' },
                '&:hover fieldset': { borderColor: '#C7D2FE' },
                '&.Mui-focused fieldset': { borderColor: '#2955FF' },
              },
            }}
          />
          <IconButton
            onClick={handleSubmit}
            disabled={!content.trim() || createMutation.isPending}
            sx={{
              bgcolor: '#2955FF', color: '#fff', width: 38, height: 38,
              '&:hover': { bgcolor: '#1E44CC' },
              '&.Mui-disabled': { bgcolor: '#E5E7EB', color: '#9CA3AF' },
            }}
          >
            <SendIcon sx={{ fontSize: '1.1rem' }} />
          </IconButton>
        </Box>
      </Paper>
    </Box>
  );
};

export default NotesPanel;
