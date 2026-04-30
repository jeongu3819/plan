/**
 * SheetExecutionPopup — 풀스크린 팝업에서 체크시트 직접 사용
 * Excel과 유사한 형태로 렌더링, 웹에서 직접 체크, 진행률 실시간 표시
 */
import { useCallback, useMemo } from 'react';
import {
  Dialog, AppBar, Toolbar, Typography, IconButton, Box,
  LinearProgress, Chip, alpha, Button, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import SaveIcon from '@mui/icons-material/Save';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';
import SheetRenderer, { type StatusValue } from './SheetRenderer';
import type { SheetExecution, Task } from '../../types';

/** 0-based col index → Excel A1 column letter */
function colToLetter(col: number): string {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
function refOf(rowIdx: number, colIdx: number): string {
  return `${colToLetter(colIdx)}${rowIdx + 1}`;
}
function todayYmd(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  executionId: number | null;
  userId: number;
}

export default function SheetExecutionPopup({ open, executionId, userId, onClose }: Props) {
  const queryClient = useQueryClient();

  // 로컬 변경 사항 (수동 저장용)
  const [pendingChanges, setPendingChanges] = useState<Map<string, { checked?: boolean; value?: string; memo?: string }>>(new Map());

  const { data: execution, isLoading } = useQuery<SheetExecution>({
    queryKey: ['sheetExecution', executionId],
    queryFn: () => api.getSheetExecution(executionId!),
    enabled: open && !!executionId,
    refetchInterval: 30000,
  });

  // 데이터 로드 시 pending 초기화
  useEffect(() => {
    if (open) setPendingChanges(new Map());
  }, [open, executionId]);

  // v3.11: 응답의 task_progress + task_status 를 caches/store 에 즉시 반영
  const applyTaskSync = (response: any) => {
    const taskId: number | null | undefined = response?.task_id;
    const taskProgress: number | null | undefined = response?.task_progress;
    const taskStatus: string | null | undefined = response?.task_status;
    if (taskId != null && (typeof taskProgress === 'number' || typeof taskStatus === 'string')) {
      queryClient.setQueriesData<Task[]>(
        { queryKey: ['tasks'] },
        (old) => Array.isArray(old)
          ? old.map(t => {
              if (t.id !== taskId) return t;
              const patch: Partial<Task> = {};
              if (typeof taskProgress === 'number') patch.progress = taskProgress;
              if (typeof taskStatus === 'string') patch.status = taskStatus as Task['status'];
              return { ...t, ...patch };
            })
          : old,
      );
      const sel = useAppStore.getState().selectedTask;
      if (sel && sel.id === taskId) {
        const patch: Partial<Task> = {};
        if (typeof taskProgress === 'number') patch.progress = taskProgress;
        if (typeof taskStatus === 'string') patch.status = taskStatus as Task['status'];
        useAppStore.setState({ selectedTask: { ...sel, ...patch } });
      }
      queryClient.invalidateQueries({ queryKey: ['taskSheetSummary', taskId] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['taskSheetSummary'] });
    }
    // Dashboard / Sheets 화면도 즉시 갱신
    queryClient.invalidateQueries({ queryKey: ['spaceOverview'] });
    queryClient.invalidateQueries({ queryKey: ['sheetExecutions'] });
  };

  const upsertMut = useMutation({
    mutationFn: ({ cellRef, data }: { cellRef: string; data: any }) =>
      api.upsertSheetExecutionCell(executionId!, cellRef, data, userId),
  });

  const handleSave = async () => {
    if (pendingChanges.size === 0) return;
    try {
      const promises = Array.from(pendingChanges.entries()).map(([cellRef, data]) =>
        upsertMut.mutateAsync({ cellRef, data })
      );
      const results = await Promise.all(promises);
      setPendingChanges(new Map());
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
      // 마지막 결과로 task sync
      if (results.length > 0) applyTaskSync(results[results.length - 1]);
    } catch (err) {
      console.error('Failed to save changes:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleClose = () => {
    if (pendingChanges.size > 0) {
      if (!window.confirm('저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?')) {
        return;
      }
    }
    onClose();
  };

  // 삭제(숨김) 컬럼 관리 — execution 단위로 저장
  const hiddenCols: number[] = (execution as any)?.hidden_cols || [];
  const [pendingDeleteCol, setPendingDeleteCol] = useState<number | null>(null);
  const hiddenColsMut = useMutation({
    mutationFn: (cols: number[]) => api.updateSheetHiddenCols(executionId!, cols, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
    },
    onError: (e: any) => alert(e?.response?.data?.detail || '컬럼 삭제 실패'),
  });
  const handleDeleteColumn = useCallback((colIdx: number) => {
    setPendingDeleteCol(colIdx);
  }, []);
  const confirmDeleteColumn = () => {
    if (pendingDeleteCol == null) return;
    const next = Array.from(new Set([...hiddenCols, pendingDeleteCol])).sort((a, b) => a - b);
    hiddenColsMut.mutate(next);
    setPendingDeleteCol(null);
  };

  // v3.11: ALL 진행 — 시트 내 미진행/빈/X 항목을 일괄 진행 처리.
  const markAllMut = useMutation({
    mutationFn: () => api.markAllSheetProgress(executionId!, true, userId),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
      applyTaskSync(response);
      setPendingChanges(new Map()); // 서버에서 직접 처리하므로 로컬 pending 비움
    },
    onError: (e: any) => alert(e?.response?.data?.detail || 'ALL 진행 처리 실패'),
  });

  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const handleCheckChange = useCallback((cellRef: string, checked: boolean) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(cellRef) || {};
      next.set(cellRef, { ...existing, checked });
      return next;
    });
  }, []);

  const handleValueChange = useCallback((cellRef: string, value: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(cellRef) || {};
      next.set(cellRef, { ...existing, value });
      return next;
    });
  }, []);

  // v3.4: 상태 select 변경 — value/checked 동시 갱신 + 진행일자 자동 연동
  const progressDateCol = execution?.template_structure?.column_roles?.progress_date?.col;
  const handleStatusChange = useCallback(
    (cellRef: string, status: StatusValue, rowIdx: number, _colIdx: number) => {
      const checked = status === 'O';
      setPendingChanges(prev => {
        const next = new Map(prev);
        // 상태값 변경
        const existing = next.get(cellRef) || {};
        next.set(cellRef, { ...existing, value: status, checked });

        // 점검일 자동 기록 (staging)
        if (progressDateCol !== undefined && progressDateCol >= 0) {
          const dateRef = refOf(rowIdx, progressDateCol);
          const dateValue = status === 'O' ? todayYmd() : '';
          const existingDate = next.get(dateRef) || {};
          next.set(dateRef, { ...existingDate, value: dateValue });
        }
        return next;
      });
    },
    [progressDateCol],
  );

  const handleDownloadClick = async () => {
    if (!executionId || downloading) return;
    setDownloading(true);
    try {
      await api.downloadSheetExecutionXlsx(executionId, execution?.title || 'sheet');
    } catch (e: any) {
      alert(e?.response?.data?.detail || '엑셀 다운로드 실패');
    } finally {
      setDownloading(false);
    }
  };
  // queryClient referenced to keep mutation hook patterns consistent (no-op)
  void queryClient;

  const structure = execution?.template_structure;
  const progress = execution?.progress ?? 0;
  const checkedCount = execution?.checked_items ?? 0;
  const totalCount = execution?.total_items ?? 0;
  const columnRoles = structure?.column_roles;

  // 항목별 매핑 — execution.items가 바뀔 때만 재생성
  const { checkedMap, checkedAtMap, valueMap } = useMemo(() => {
    const cMap = new Map<string, boolean>();
    const aMap = new Map<string, string>();
    const vMap = new Map<string, string>();
    if (execution?.items) {
      for (const item of execution.items) {
        cMap.set(item.cell_ref, item.checked);
        if (item.checked_at) aMap.set(item.cell_ref, item.checked_at);
        if (item.value) vMap.set(item.cell_ref, item.value);
      }
    }

    // Overlay Pending
    pendingChanges.forEach((data, ref) => {
      if (data.checked !== undefined) cMap.set(ref, data.checked);
      if (data.value !== undefined) vMap.set(ref, data.value);
    });

    return { checkedMap: cMap, checkedAtMap: aMap, valueMap: vMap };
  }, [execution?.items, pendingChanges]);

  const isDirty = pendingChanges.size > 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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

          {/* 저장 버튼 */}
          <Chip
            icon={<SaveIcon sx={{ fontSize: '1.1rem !important', color: isDirty ? '#fff !important' : 'inherit' }} />}
            label={upsertMut.isPending ? '저장 중...' : '저장하기'}
            clickable
            onClick={handleSave}
            disabled={!isDirty || upsertMut.isPending}
            sx={{
              fontWeight: 800,
              bgcolor: isDirty ? '#2955FF' : 'rgba(255,255,255,0.05)',
              color: isDirty ? '#fff' : '#6B7280',
              border: isDirty ? 'none' : '1px solid rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: isDirty ? '#1E40AF' : 'rgba(255,255,255,0.1)' },
              transition: 'all 0.2s',
              height: 26,
              fontSize: '0.72rem',
            }}
          />

          {(upsertMut.isPending || markAllMut.isPending || downloading) && (
            <Chip
              label={downloading ? "다운로드 중..." : markAllMut.isPending ? "ALL 진행 중..." : "저장 중..."}
              size="small"
              sx={{ bgcolor: alpha('#F59E0B', 0.15), color: '#F59E0B', height: 22, fontSize: '0.62rem' }}
            />
          )}

          {/* v3.11: ALL 진행 — 미진행/빈/X 일괄 진행 처리. completed 시트엔 비활성. */}
          {execution?.status !== 'completed' && (
            <Chip
              icon={<DoneAllIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
              label="ALL 진행"
              onClick={() => setConfirmAllOpen(true)}
              size="small"
              disabled={markAllMut.isPending || upsertMut.isPending}
              sx={{
                bgcolor: alpha('#22C55E', 0.85), color: '#fff',
                fontWeight: 700, fontSize: '0.72rem', height: 26, cursor: 'pointer',
                '&:hover': { bgcolor: '#22C55E' },
              }}
            />
          )}

          <Chip
            icon={<FileDownloadIcon sx={{ fontSize: 14, color: '#fff !important' }} />}
            label="엑셀 다운로드"
            onClick={handleDownloadClick}
            size="small"
            disabled={downloading}
            sx={{
              bgcolor: 'rgba(255,255,255,0.1)', color: '#fff',
              fontWeight: 600, fontSize: '0.72rem', height: 26, cursor: 'pointer',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
            }}
          />

          <IconButton onClick={handleClose} sx={{ color: 'rgba(255,255,255,0.7)' }}>
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
              onStatusChange={handleStatusChange}
              readOnly={execution?.status === 'completed'}
              hiddenCols={hiddenCols}
              onDeleteColumn={execution?.status === 'completed' ? undefined : handleDeleteColumn}
              freeTextEdit
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

      {/* v3.11: ALL 진행 확인 모달 */}
      <Dialog open={confirmAllOpen} onClose={() => setConfirmAllOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>모든 항목을 진행 처리할까요?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.7 }}>
            · 미진행 / 빈 값 항목을 모두 <b>진행</b>으로 변경합니다.<br />
            · 진행으로 바뀐 행의 <b>진행일자</b>는 오늘 날짜로 자동 입력됩니다.<br />
            · 이미 <b>N/A</b>로 표시된 항목은 그대로 유지됩니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmAllOpen(false)} sx={{ color: '#6B7280' }}>취소</Button>
          <Button
            variant="contained"
            disabled={markAllMut.isPending}
            onClick={() => {
              setConfirmAllOpen(false);
              markAllMut.mutate();
            }}
            sx={{ bgcolor: '#22C55E', '&:hover': { bgcolor: '#16A34A' } }}
          >
            모두 진행
          </Button>
        </DialogActions>
      </Dialog>

      {/* 컬럼 삭제 확인 */}
      <Dialog open={pendingDeleteCol != null} onClose={() => setPendingDeleteCol(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>이 컬럼을 삭제할까요?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.7 }}>
            · 컬럼 <b>{pendingDeleteCol != null ? colToLetter(pendingDeleteCol) : ''}</b> 가 이 실행본에서 숨겨집니다.<br />
            · <b>원본 양식(template)</b> 은 변경되지 않으며 다른 실행본에는 영향이 없습니다.<br />
            · 이미 입력된 데이터는 보존됩니다 (다시 표시할 수 있음).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPendingDeleteCol(null)} sx={{ color: '#6B7280' }}>취소</Button>
          <Button
            variant="contained"
            disabled={hiddenColsMut.isPending}
            onClick={confirmDeleteColumn}
            sx={{ bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } }}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
