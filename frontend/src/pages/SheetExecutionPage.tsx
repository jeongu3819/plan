/**
 * SheetExecutionPage — Sheet 실행 화면 (체크/메모/완료)
 */
import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Chip, LinearProgress, IconButton,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Tooltip, alpha, CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useParams, useNavigate } from 'react-router-dom';
import { useSpaceNav } from '../hooks/useSpaceNav';
import SheetRenderer, { type StatusValue } from '../components/sheets/SheetRenderer';
import AssignmentMappingBoard from '../components/sheets/AssignmentMappingBoard';

// 엑셀 스타일 컬럼 letter — 가상 컬럼용 cell_ref 생성기
function colLetter(col0: number): string {
  let n = col0 + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
function makeCellRef(row0: number, col0: number): string {
  return `${colLetter(col0)}${row0 + 1}`;
}
function todayIso(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export default function SheetExecutionPage() {
  const { executionId } = useParams<{ executionId: string }>();
  const currentUserId = useAppStore(state => state.currentUserId);
  const navigate = useNavigate();
  const { spacePath } = useSpaceNav();
  const queryClient = useQueryClient();
  const currentSpaceId = useAppStore(state => state.currentSpaceId);

  const { data: overviewData } = useQuery({
    queryKey: ['spaceOverview', currentSpaceId, currentUserId],
    queryFn: () => api.getSpaceOverview(currentSpaceId!, currentUserId),
    enabled: !!currentSpaceId && currentUserId > 0,
  });

  useEffect(() => {
    if (overviewData && overviewData.purpose === 'project_management') {
      navigate(spacePath('/'), { replace: true });
    }
  }, [overviewData, navigate, spacePath]);

  const [memoDialog, setMemoDialog] = useState<{ itemId: number; cellRef: string; currentMemo: string } | null>(null);
  const [memoText, setMemoText] = useState('');
  const [logOpen, setLogOpen] = useState(false);

  const { data: execution, isLoading } = useQuery({
    queryKey: ['sheetExecution', executionId],
    queryFn: () => api.getSheetExecution(Number(executionId)),
    enabled: !!executionId,
    refetchInterval: 10000,
  });

  const { data: logsData } = useQuery({
    queryKey: ['sheetExecutionLogs', executionId],
    queryFn: () => api.getSheetExecutionLogs(Number(executionId)),
    enabled: !!executionId && logOpen,
  });

  const checkMutation = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: number; checked: boolean }) =>
      api.updateSheetExecutionItem(Number(executionId), itemId, { checked }, currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] }),
  });

  // v3.2: cell_ref 단위 upsert — 상태/진행일/담당자/비고 모두 이걸로 처리
  const cellUpsertMutation = useMutation({
    mutationFn: ({ cellRef, body }: { cellRef: string; body: { checked?: boolean; value?: string; memo?: string } }) =>
      api.upsertSheetExecutionCell(Number(executionId), cellRef, body, currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] }),
  });

  const memoMutation = useMutation({
    mutationFn: ({ itemId, memo }: { itemId: number; memo: string }) =>
      api.updateSheetExecutionItem(Number(executionId), itemId, { memo }, currentUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] });
      setMemoDialog(null);
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => api.completeSheetExecution(Number(executionId), currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sheetExecution', executionId] }),
  });

  const handleCheckChange = (cellRef: string, checked: boolean) => {
    const item = (execution?.items || []).find((i: any) => i.cell_ref === cellRef);
    if (item) {
      checkMutation.mutate({ itemId: item.id, checked });
    }
  };

  // v3.2: 상태(여부성) 변경 핸들러
  //   - 상태 셀: value = O / X / N/A, checked는 O일 때 true
  //   - 진행일 셀: O 선택 시 오늘 날짜 자동 입력, X/N/A는 비움
  const handleStatusChange = (cellRef: string, status: StatusValue, rowIdx: number) => {
    const isO = status === 'O';
    cellUpsertMutation.mutate({
      cellRef,
      body: {
        value: status || '',
        checked: isO,
      },
    });

    // 진행일 컬럼이 있으면 연동
    const roles = execution?.template_structure?.column_roles;
    const progCol = roles?.progress_date?.col;
    const checkedAtCol = roles?.checked_at?.col;
    const targetCol = progCol ?? checkedAtCol;  // progress_date 우선, 없으면 checked_at
    if (targetCol !== undefined && targetCol >= 0) {
      const dateCellRef = makeCellRef(rowIdx, targetCol);
      cellUpsertMutation.mutate({
        cellRef: dateCellRef,
        body: { value: isO ? todayIso() : '' },
      });
    }
  };

  // v3.2: 담당자/비고/진행일 등 editable 컬럼 값 변경
  const handleValueChange = (cellRef: string, value: string) => {
    cellUpsertMutation.mutate({ cellRef, body: { value } });
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!execution) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">체크시트를 찾을 수 없습니다</Typography>
      </Box>
    );
  }

  const isCompleted = execution.status === 'completed';

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate(`${spacePath}/sheets`)}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={800}>{execution.title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
            <Chip
              label={isCompleted ? '완료' : '진행 중'}
              size="small"
              sx={{
                height: 22, fontWeight: 700, fontSize: '0.68rem',
                bgcolor: isCompleted ? alpha('#22C55E', 0.1) : alpha('#F59E0B', 0.1),
                color: isCompleted ? '#16A34A' : '#D97706',
              }}
            />
            {execution.equipment_name && (
              <Chip label={execution.equipment_name} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.68rem' }} />
            )}
            {execution.template_name && (
              <Typography variant="caption" color="text.secondary">{execution.template_name}</Typography>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
            onClick={() => setLogOpen(true)}
            sx={{ fontSize: '0.76rem' }}
          >
            변경 이력
          </Button>
          {!isCompleted && (
            <Button
              size="small"
              variant="contained"
              startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
              onClick={() => {
                if (confirm(`체크시트를 완료 처리하시겠습니까? (진행률: ${execution.progress}%)`)) {
                  completeMutation.mutate();
                }
              }}
              sx={{ fontSize: '0.76rem', bgcolor: '#22C55E' }}
            >
              완료 처리
            </Button>
          )}
        </Box>
      </Box>

      {/* Progress bar */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>
                {execution.checked_items} / {execution.total_items} 항목 완료
              </Typography>
              <Typography variant="caption" fontWeight={700} sx={{ color: execution.progress >= 100 ? '#22C55E' : '#2955FF' }}>
                {execution.progress}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={execution.progress}
              sx={{
                height: 8, borderRadius: 4,
                bgcolor: '#F3F4F6',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  bgcolor: execution.progress >= 100 ? '#22C55E' : '#2955FF',
                },
              }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            시작: {execution.started_at?.slice(0, 16).replace('T', ' ')}
          </Typography>
          {execution.completed_at && (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              완료: {execution.completed_at.slice(0, 16).replace('T', ' ')}
            </Typography>
          )}
        </Box>
      </Paper>

      {/* Sheet rendering — 유형별 분기 */}
      {execution.sheet_type === 'assignment_mapping' ? (
        <AssignmentMappingBoard
          executionId={Number(executionId)}
          mappings={execution.mappings || []}
          userId={currentUserId}
          readOnly={isCompleted}
        />
      ) : execution.template_structure ? (
        <SheetRenderer
          structure={execution.template_structure}
          executionItems={execution.items || []}
          onCheckChange={handleCheckChange}
          onStatusChange={handleStatusChange}
          onValueChange={handleValueChange}
          readOnly={isCompleted}
        />
      ) : (
        <Typography color="text.secondary">Sheet 구조를 불러올 수 없습니다</Typography>
      )}

      {/* Execution items quick view - memo capable items (inspection 유형만) */}
      {execution.sheet_type !== 'assignment_mapping' && (execution.items || []).length > 0 && (
        <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            체크 항목 ({execution.checked_items}/{execution.total_items})
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, maxHeight: 300, overflow: 'auto' }}>
            {(execution.items || []).map((item: any) => (
              <Box
                key={item.id}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, py: 0.4, px: 1,
                  borderRadius: 1, bgcolor: item.checked ? alpha('#22C55E', 0.04) : 'transparent',
                  '&:hover': { bgcolor: '#F9FAFB' },
                }}
              >
                <Chip
                  label={item.cell_ref}
                  size="small"
                  sx={{ height: 18, fontSize: '0.6rem', minWidth: 36, fontWeight: 600, bgcolor: '#F3F4F6' }}
                />
                <Typography variant="body2" sx={{
                  fontSize: '0.76rem', flex: 1,
                  textDecoration: item.checked ? 'line-through' : 'none',
                  color: item.checked ? '#9CA3AF' : 'inherit',
                }}>
                  {item.label || `(${item.cell_ref})`}
                </Typography>
                {item.memo && (
                  <Tooltip title={item.memo}>
                    <Chip label="메모" size="small" sx={{ height: 18, fontSize: '0.58rem', bgcolor: alpha('#F59E0B', 0.1), color: '#D97706' }} />
                  </Tooltip>
                )}
                {!isCompleted && (
                  <Tooltip title="메모 추가">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setMemoDialog({ itemId: item.id, cellRef: item.cell_ref, currentMemo: item.memo || '' });
                        setMemoText(item.memo || '');
                      }}
                    >
                      <NoteAddIcon sx={{ fontSize: 16, color: '#9CA3AF' }} />
                    </IconButton>
                  </Tooltip>
                )}
                {item.checked_at && (
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#9CA3AF' }}>
                    {item.checked_at.slice(0, 16).replace('T', ' ')}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Memo dialog */}
      <Dialog open={!!memoDialog} onClose={() => setMemoDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
          메모/특이사항 — {memoDialog?.cellRef}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth multiline rows={3}
            value={memoText}
            onChange={e => setMemoText(e.target.value)}
            placeholder="특이사항이나 메모를 입력하세요"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemoDialog(null)}>취소</Button>
          <Button
            variant="contained"
            onClick={() => memoDialog && memoMutation.mutate({ itemId: memoDialog.itemId, memo: memoText })}
            sx={{ bgcolor: '#2955FF' }}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      {/* Log dialog */}
      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>변경 이력</DialogTitle>
        <DialogContent>
          {(logsData?.logs || []).length === 0 ? (
            <Typography variant="body2" color="text.secondary">이력이 없습니다</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {(logsData?.logs || []).map((log: any) => (
                <Box key={log.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, borderBottom: '1px solid #F3F4F6' }}>
                  <Chip
                    label={log.action}
                    size="small"
                    sx={{
                      height: 20, fontSize: '0.6rem', fontWeight: 600,
                      bgcolor: log.action === 'check' ? alpha('#22C55E', 0.1) : log.action === 'complete' ? alpha('#2955FF', 0.1) : '#F3F4F6',
                      color: log.action === 'check' ? '#16A34A' : log.action === 'complete' ? '#2955FF' : '#6B7280',
                    }}
                  />
                  <Typography variant="body2" sx={{ fontSize: '0.76rem', flex: 1 }}>
                    {log.new_value || log.memo || '-'}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.62rem', color: '#9CA3AF' }}>
                    {log.created_at?.slice(0, 16).replace('T', ' ')}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
