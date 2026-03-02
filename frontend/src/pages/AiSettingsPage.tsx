import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SaveIcon from '@mui/icons-material/Save';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import BlockIcon from '@mui/icons-material/Block';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, User } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';

const AiSettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUserId = useAppStore(state => state.currentUserId);
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
  });
  const currentUser = users.find(u => u.id === currentUserId) || users[0];

  // Admin guard – block non-admin direct URL access
  if (currentUser && currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <BlockIcon sx={{ fontSize: 48, color: '#EF4444', mb: 2 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#1A1D29' }}>
          접근 권한이 없습니다
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
          AI Settings는 관리자만 접근할 수 있습니다.
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/')}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            bgcolor: '#2955FF',
            '&:hover': { bgcolor: '#1E3FCC' },
          }}
        >
          Dashboard로 돌아가기
        </Button>
      </Box>
    );
  }
  const [apiUrl, setApiUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => api.getAiSettings(),
  });

  useEffect(() => {
    if (settings) {
      setApiUrl(settings.api_url || '');
      setModelName(settings.model_name || '');
      setApiKey(settings.api_key || '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveAiSettings({ api_url: apiUrl, model_name: modelName, api_key: apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <AutoAwesomeIcon sx={{ color: '#2955FF', fontSize: '1.8rem' }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D29' }}>
            AI Settings
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.8rem' }}>
            Configure your AI model API for report generation
          </Typography>
        </Box>
      </Box>

      {saved && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
          Settings saved successfully!
        </Alert>
      )}

      <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #E5E7EB' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, mb: 0.5, color: '#374151', fontSize: '0.85rem' }}
            >
              API URL
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="http://localhost:1234/v1 or https://api.openai.com/v1"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' },
              }}
            />
            <Typography variant="caption" sx={{ color: '#9CA3AF', mt: 0.5, display: 'block' }}>
              지원: OpenAI, Anthropic Claude, Zhipu(GLM), DeepSeek, Ollama, LM Studio 등
            </Typography>
          </Box>

          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, mb: 0.5, color: '#374151', fontSize: '0.85rem' }}
            >
              Model Name
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="gpt-4, llama-3, gemma-2, etc."
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' },
              }}
            />
          </Box>

          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, mb: 0.5, color: '#374151', fontSize: '0.85rem' }}
            >
              API Key (Optional)
            </Typography>
            <TextField
              fullWidth
              size="small"
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowKey(!showKey)}>
                      {showKey ? (
                        <VisibilityOffIcon sx={{ fontSize: '1rem' }} />
                      ) : (
                        <VisibilityIcon sx={{ fontSize: '1rem' }} />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' },
              }}
            />
            <Typography variant="caption" sx={{ color: '#9CA3AF', mt: 0.5, display: 'block' }}>
              Required for cloud providers (OpenAI, Anthropic). Leave empty for local models.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={
              saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />
            }
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !apiUrl || !modelName}
            sx={{
              bgcolor: '#2955FF',
              textTransform: 'none',
              fontWeight: 700,
              mt: 1,
              borderRadius: 2,
              alignSelf: 'flex-start',
              boxShadow: '0 2px 8px rgba(41,85,255,0.25)',
              '&:hover': { bgcolor: '#1E3FCC' },
            }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default AiSettingsPage;
