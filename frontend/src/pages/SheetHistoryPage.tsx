/**
 * SheetHistoryPage — Sheet 실행 이력 조회/필터 (강화)
 */
import { useState } from 'react';
import {
  Box, Typography, Paper, Chip, FormControl, InputLabel,
  Select, MenuItem, alpha, CircularProgress, IconButton,
  LinearProgress, TextField, InputAdornment, Collapse, Button,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
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

  const [statusFilter, setStatusFilter] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const hasFilter = !!(statusFilter || equipmentFilter || dateFrom || dateTo);

  const clearFilters = () => {
    setStatusFilter('');
    setEquipmentFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const { data: execData, isLoading } = useQuery({
    queryKey: ['sheetExecutions', currentSpaceId, statusFilter, equipmentFilter, dateFrom, dateTo],
    queryFn: () => api.getSheetExecutions(currentSpaceId!, {
      status: statusFilter || undefined,
      equipment_name: equipmentFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    enabled: !!currentSpaceId,
  });

  const executions: SheetExecution[] = (execData as any)?.executions || [];

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate(`${spacePath}/sheets`)}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={800}>실행 이력</Typography>
          <Typography variant="body2" color="text.secondary">
            과거 Sheet 실행 기록을 확인합니다
          </Typography>
        </Box>
        <Button
          size="small"
          variant={hasFilter ? 'contained' : 'outlined'}
          startIcon={<FilterListIcon sx={{ fontSize: 16 }} />}
          onClick={() => setFilterOpen(v => !v)}
          sx={{ fontSize: '0.76rem', ...(hasFilter && { bgcolor: '#2955FF' }) }}
        >
          필터 {hasFilter && `(${[statusFilter, equipmentFilter, dateFrom, dateTo].filter(Boolean).length})`}
        </Button>
      </Box>

      {/* Filter panel */}
      <Collapse in={filterOpen}>
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5, alignItems: 'flex-end' }}>
            <FormControl size="small" fullWidth>
              <InputLabel>상태</InputLabel>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="상태">
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="in_progress">진행 중</MenuItem>
                <MenuItem value="completed">완료</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small" fullWidth label="설비명"
              value={equipmentFilter}
              onChange={e => setEquipmentFilter(e.target.value)}
              placeholder="예: K08, CMP-01"
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: '#9CA3AF' }} /></InputAdornment>,
                endAdornment: equipmentFilter ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setEquipmentFilter('')}><ClearIcon sx={{ fontSize: 14 }} /></IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
            <TextField
              size="small" fullWidth label="시작일"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" fullWidth label="종료일"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          {hasFilter && (
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <Button size="small" onClick={clearFilters} sx={{ fontSize: '0.72rem', color: '#6B7280' }}>
                필터 초기화
              </Button>
            </Box>
          )}
        </Paper>
      </Collapse>

      {/* 결과 수 */}
      {!isLoading && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          {executions.length}건
        </Typography>
      )}

      {/* List */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : executions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" fontWeight={600}>
            {hasFilter ? '조건에 맞는 이력이 없습니다' : '실행 이력이 없습니다'}
          </Typography>
          {hasFilter && (
            <Button size="small" onClick={clearFilters} sx={{ mt: 1 }}>
              필터 초기화
            </Button>
          )}
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
                <Box sx={{ color: isCompleted ? '#22C55E' : '#F59E0B', display: 'flex', flexShrink: 0 }}>
                  {isCompleted ? <CheckCircleIcon /> : <PlayCircleOutlineIcon />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exec.title}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.3, flexWrap: 'wrap' }}>
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
                <Box sx={{ width: 120, flexShrink: 0 }}>
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
                <Box sx={{ textAlign: 'right', minWidth: 90, flexShrink: 0 }}>
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
