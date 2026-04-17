/**
 * SheetHistoryPage — Sheet 실행 이력 조회/필터
 */
import { useState } from 'react';
import {
  Box, Typography, Paper, Chip, FormControl, InputLabel,
  Select, MenuItem, alpha, CircularProgress, IconButton,
  LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';
import { useSpaceNav } from '../hooks/useSpaceNav';
import type { SheetExecution } from '../types';

export default function SheetHistoryPage() {
  const currentSpaceId = useAppStore(state => state.currentSpaceId);
  const navigate = useNavigate();
  const { spacePath } = useSpaceNav();

  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: execData, isLoading } = useQuery({
    queryKey: ['sheetExecutions', currentSpaceId, statusFilter],
    queryFn: () => api.getSheetExecutions(currentSpaceId!, { status: statusFilter || undefined }),
    enabled: !!currentSpaceId,
  });

  const executions: SheetExecution[] = execData?.executions || [];

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate(`${spacePath}/sheets`)}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>실행 이력</Typography>
          <Typography variant="body2" color="text.secondary">
            과거 Sheet 실행 기록을 확인합니다
          </Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>상태</InputLabel>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="상태">
            <MenuItem value="">전체</MenuItem>
            <MenuItem value="in_progress">진행 중</MenuItem>
            <MenuItem value="completed">완료</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* List */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : executions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" fontWeight={600}>
            실행 이력이 없습니다
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {executions.map(exec => {
            const isCompleted = exec.status === 'completed';
            return (
              <Paper
                key={exec.id}
                variant="outlined"
                onClick={() => navigate(`${spacePath}/sheets/execution/${exec.id}`)}
                sx={{
                  p: 2, borderRadius: 2, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 2,
                  '&:hover': { bgcolor: '#FAFAFA', borderColor: '#2955FF' },
                  transition: 'all 0.15s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', color: isCompleted ? '#22C55E' : '#F59E0B' }}>
                  {isCompleted ? <CheckCircleIcon /> : <PlayCircleOutlineIcon />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exec.title}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.3 }}>
                    {exec.equipment_name && (
                      <Chip label={exec.equipment_name} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                    )}
                    <Chip
                      label={isCompleted ? '완료' : '진행 중'}
                      size="small"
                      sx={{
                        height: 18, fontSize: '0.6rem', fontWeight: 600,
                        bgcolor: isCompleted ? alpha('#22C55E', 0.1) : alpha('#F59E0B', 0.1),
                        color: isCompleted ? '#16A34A' : '#D97706',
                      }}
                    />
                  </Box>
                </Box>
                <Box sx={{ width: 120 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                    <Typography variant="caption" sx={{ fontSize: '0.62rem' }}>
                      {exec.checked_items}/{exec.total_items}
                    </Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.62rem', color: isCompleted ? '#22C55E' : '#2955FF' }}>
                      {exec.progress}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate" value={exec.progress}
                    sx={{
                      height: 4, borderRadius: 2, bgcolor: '#F3F4F6',
                      '& .MuiLinearProgress-bar': { bgcolor: isCompleted ? '#22C55E' : '#2955FF', borderRadius: 2 },
                    }}
                  />
                </Box>
                <Box sx={{ textAlign: 'right', minWidth: 90 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.62rem', color: '#9CA3AF', display: 'block' }}>
                    {exec.started_at?.slice(0, 10)}
                  </Typography>
                  {exec.completed_at && (
                    <Typography variant="caption" sx={{ fontSize: '0.62rem', color: '#22C55E', display: 'block' }}>
                      {exec.completed_at.slice(0, 10)}
                    </Typography>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
