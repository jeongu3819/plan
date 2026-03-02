import React from 'react';
import { Box, Typography, Paper, Avatar, Chip, CircularProgress } from '@mui/material';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { MentionNote } from '../types';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const MentionsPage: React.FC = () => {
  const currentUserId = useAppStore(state => state.currentUserId);
  const navigate = useNavigate();

  const { data: mentions = [], isLoading } = useQuery<MentionNote[]>({
    queryKey: ['mentions', currentUserId],
    queryFn: () => api.getMentions(currentUserId),
  });

  const renderContent = (content: string) => {
    return content.split(/(@\S+)/g).map((part, i) =>
      part.match(/^@\S+/) ? (
        <span key={i} style={{ color: '#2955FF', fontWeight: 600 }}>
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <AlternateEmailIcon sx={{ fontSize: '1.8rem', color: '#2955FF' }} />
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          @나를 언급
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : mentions.length === 0 ? (
        <Paper
          sx={{ p: 6, textAlign: 'center', borderRadius: 2, border: '1px solid #E5E7EB' }}
          elevation={0}
        >
          <AlternateEmailIcon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" sx={{ color: '#6B7280', mb: 0.5 }}>
            아직 멘션된 메모가 없습니다
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
            다른 사용자가 @이름으로 멘션하면 여기에 표시됩니다
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mentions.map(note => (
            <Paper
              key={note.id}
              onClick={() => navigate(`/project/${note.project_id}?tab=notes`)}
              sx={{
                p: 2.5,
                borderRadius: 2,
                border: '1px solid #E5E7EB',
                cursor: 'pointer',
                transition: 'all 0.15s',
                '&:hover': {
                  borderColor: '#C7D2FE',
                  boxShadow: '0 2px 8px rgba(41,85,255,0.08)',
                  transform: 'translateY(-1px)',
                },
              }}
              elevation={0}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Avatar
                  sx={{
                    bgcolor: note.author_color || '#2955FF',
                    width: 32,
                    height: 32,
                    fontSize: '0.75rem',
                    mt: 0.3,
                  }}
                >
                  {(note.author_name || 'U').charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 0.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1A1D29' }}
                    >
                      {note.author_name || 'Unknown'}
                    </Typography>
                    <Chip
                      label={note.project_name || 'Project'}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        bgcolor: '#EEF2FF',
                        color: '#2955FF',
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{ color: '#9CA3AF', fontSize: '0.7rem', ml: 'auto' }}
                    >
                      {note.created_at ? format(new Date(note.created_at), 'yyyy-MM-dd HH:mm') : ''}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    component="div"
                    sx={{
                      color: '#374151',
                      fontSize: '0.88rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {renderContent(note.content)}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default MentionsPage;
