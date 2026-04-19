/**
 * SheetExecutionPopup — 풀스크린 팝업에서 체크시트 직접 사용
 * Excel과 유사한 형태로 렌더링, 웹에서 직접 체크, 진행률 실시간 표시
 */
import { useCallback } from 'react';
import {
  Dialog, AppBar, Toolbar, Typography, IconButton, Box,
  LinearProgress, Chip, alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import SheetRenderer from './SheetRenderer';
import type { SheetExecution } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  executionId: number | null;
  userId: number;
}

export default function SheetExecutionPopup({ open, executionId, userId, onClose }: Props) {
  const queryClient = useQueryClient();

  const { data: execution, isLoading } = useQuery<SheetExecution>({
    queryKey: ['sheetExecution', executionId],
    queryFn: () => api.getSheetExecution(executionId!),
    enabled: open && !!executionId,
    refetchInterval: 30000,
  });

  const upsertMut = useMutation({
    mutationFn: ({ cellRef, data }: { cellRef: string; data: any }) =>
      api.upsertSheetExecutionCell(executionId!, cellRef, data, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
    },
  });

  const copyMut = useMutation({
    mutationFn: ({ title, includeData }: { title: string; includeData: boolean }) =>
      api.copySheetExecution(executionId!, title, includeData, userId),
    onSuccess: () => {
      alert('체크시트가 복제되었습니다.');
      queryClient.invalidateQueries(); // 목록 새로고침
      onClose(); // 복제 후 팝업 닫기 (새 시트가 리스트에 보여짐)
    },
  });

  const handleCheckChange = useCallback((cellRef: string, checked: boolean) => {
    upsertMut.mutate({ cellRef, data: { checked } });
  }, [upsertMut]);

  const handleValueChange = useCallback((cellRef: string, value: string) => {
    upsertMut.mutate({ cellRef, data: { value } });
  }, [upsertMut]);

  const handleCopyClick = () => {
    const title = prompt('새로운 체크시트 이름을 입력하세요:', (execution?.title || '') + ' (복사본)');
    if (!title) return;
    const includeData = confirm('기존 체크 내역과 입력값을 포함해서 복사하시겠습니까?\n(취소 시 양식만 복사됩니다)');
    copyMut.mutate({ title, includeData });
  };

  const structure = execution?.template_structure;
  const progress = execution?.progress ?? 0;
  const checkedCount = execution?.checked_items ?? 0;
  const totalCount = execution?.total_items ?? 0;
  const columnRoles = structure?.column_roles;

  // 항목별 매핑
  const checkedMap = new Map<string, boolean>();
  const checkedAtMap = new Map<string, string>();
  const valueMap = new Map<string, string>();
  
  if (execution?.items) {
    for (const item of execution.items) {
      checkedMap.set(item.cell_ref, item.checked);
      if (item.checked_at) checkedAtMap.set(item.cell_ref, item.checked_at);
      if (item.value) valueMap.set(item.cell_ref, item.value);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: '#F9FAFB' } }}
    >
      {/* Top Bar */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: '#1A1D29' }}>
        <Toolbar sx={{ gap: 2 }}>
          <AssignmentIcon sx={{ color: '#2955FF', fontSize: 22 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#fff', fontSize: '0.92rem', lineHeight: 1.2 }}>
              {execution?.title || '체크시트'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.68rem' }}>
              {execution?.template_name || ''}
            </Typography>
          </Box>

          {/* Summary chips */}
          <Chip
            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
            label={`${checkedCount}/${totalCount} 완료`}
            size="small"
            sx={{
              bgcolor: alpha('#22C55E', 0.15), color: '#22C55E',
              fontWeight: 700, fontSize: '0.72rem', height: 26,
            }}
          />
          <Chip
            icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
            label={`${progress}%`}
            size="small"
            sx={{
              bgcolor: alpha('#2955FF', 0.15), color: '#93B4FF',
              fontWeight: 700, fontSize: '0.72rem', height: 26,
            }}
          />

          {/* Progress bar */}
          <Box sx={{ width: 120, flexShrink: 0 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6, borderRadius: 3,
                bgcolor: 'rgba(255,255,255,0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: progress >= 100 ? '#22C55E' : '#2955FF',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                },
              }}
            />
          </Box>

          {(upsertMut.isPending || copyMut.isPending) && (
            <Chip
              label={copyMut.isPending ? "복사 중..." : "저장 중..."}
              size="small"
              sx={{ bgcolor: alpha('#F59E0B', 0.15), color: '#F59E0B', height: 22, fontSize: '0.62rem' }}
            />
          )}
          
          <Chip
            label="복제하기"
            onClick={handleCopyClick}
            size="small"
            sx={{
              bgcolor: 'rgba(255,255,255,0.1)', color: '#fff',
              fontWeight: 600, fontSize: '0.72rem', height: 26, cursor: 'pointer',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
            }}
          />

          <IconButton onClick={onClose} sx={{ color: 'rgba(255,255,255,0.7)' }}>
            <CloseIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Box sx={{ textAlign: 'center' }}>
              <LinearProgress sx={{ width: 200, mb: 2, borderRadius: 2 }} />
              <Typography variant="body2" color="text.secondary">체크시트 로딩 중...</Typography>
            </Box>
          </Box>
        ) : structure ? (
          <Box sx={{
            bgcolor: '#fff', borderRadius: 2, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            overflow: 'auto', maxHeight: 'calc(100vh - 80px)',
          }}>
            <SheetRenderer
              structure={structure}
              checkedMap={checkedMap}
              checkedAtMap={checkedAtMap}
              valueMap={valueMap}
              columnRoles={columnRoles}
              onCheckChange={handleCheckChange}
              onValueChange={handleValueChange}
              readOnly={execution?.status === 'completed'}
            />
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body2" color="text.secondary">
              시트 구조를 불러올 수 없습니다.
            </Typography>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}
