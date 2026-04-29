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
import { useState } from 'react';
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

  const { data: execution, isLoading } = useQuery<SheetExecution>({
    queryKey: ['sheetExecution', executionId],
    queryFn: () => api.getSheetExecution(executionId!),
    enabled: open && !!executionId,
    refetchInterval: 30000,
  });

  // v3.11: 응답의 task_progress + task_status 를 caches/store 에 즉시 반영
  //   - Check Sheet 100% 시 Task Details Status 가 새로고침 없이 Done 으로 보이게 함
  //   - 단일 dropdown 변경 / ALL 진행 양쪽에서 같은 로직을 쓰므로 헬퍼로 분리
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
    onSuccess: (response: any) => {
      // 시트 자체는 invalidate (item 목록/메타가 바뀌었으므로)
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
      applyTaskSync(response);
    },
  });

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
  //   N/A 는 건너뛰고, 진행으로 바뀐 행은 backend 가 진행일자 컬럼에 오늘 날짜를 기록한다.
  const markAllMut = useMutation({
    mutationFn: () => api.markAllSheetProgress(executionId!, true, userId),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
      applyTaskSync(response);
    },
    onError: (e: any) => alert(e?.response?.data?.detail || 'ALL 진행 처리 실패'),
  });

  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  const [downloading, setDownloading] = useState(false);

  const handleCheckChange = useCallback((cellRef: string, checked: boolean) => {
    upsertMut.mutate({ cellRef, data: { checked } });
  }, [upsertMut]);

  const handleValueChange = useCallback((cellRef: string, value: string) => {
    upsertMut.mutate({ cellRef, data: { value } });
  }, [upsertMut]);

  // v3.4: 상태 select 변경 — value/checked 동시 갱신 + 진행일자 자동 연동
  //   진행(O) → checked=true, 진행일자에 오늘 날짜
  //   미진행(X) → checked=false, 진행일자 비움
  //   N/A     → checked=false (모수 제외), 진행일자 비움
  //   '' (선택 해제) → checked=false, value 비움
  const progressDateCol = execution?.template_structure?.column_roles?.progress_date?.col;
  const handleStatusChange = useCallback(
    (cellRef: string, status: StatusValue, rowIdx: number, _colIdx: number) => {
      const checked = status === 'O';
      upsertMut.mutate({ cellRef, data: { value: status, checked } });
      if (progressDateCol !== undefined && progressDateCol >= 0) {
        const dateRef = refOf(rowIdx, progressDateCol);
        const dateValue = status === 'O' ? todayYmd() : '';
        upsertMut.mutate({ cellRef: dateRef, data: { value: dateValue } });
      }
    },
    [upsertMut, progressDateCol],
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

  // 항목별 매핑 — execution.items가 바뀔 때만 재생성하여 SheetRenderer의 useMemo가
  // 매 부모 렌더마다 무효화되지 않게 한다 (입력 시 grid 전체 리렌더 방지).
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
    return { checkedMap: cMap, checkedAtMap: aMap, valueMap: vMap };
  }, [execution?.items]);

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
