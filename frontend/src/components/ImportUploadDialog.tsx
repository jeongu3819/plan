/**
 * ImportUploadDialog — CSV/XLSX upload for bulk project/task creation.
 *
 * Flow: File select → Column detect → Preview/Validate → Execute → Results
 */

import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton, Chip, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, AlertTitle, LinearProgress, Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadIcon from '@mui/icons-material/Download';
import DescriptionIcon from '@mui/icons-material/Description';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { readFile, parseImportData, generateSampleCSV, ImportPreview } from '../utils/importParser';

interface ImportUploadDialogProps {
  open: boolean;
  onClose: () => void;
  currentUserId: number;
}

type Step = 'upload' | 'preview' | 'executing' | 'result';

interface ImportResult {
  createdProjects: number;
  createdTasks: number;
  skippedRows: number;
  errors: string[];
}

const statusLabels: Record<string, { label: string; color: string }> = {
  todo: { label: 'To Do', color: '#6B7280' },
  in_progress: { label: 'In Progress', color: '#2955FF' },
  done: { label: 'Done', color: '#22C55E' },
  hold: { label: 'Hold', color: '#F59E0B' },
};

const ImportUploadDialog: React.FC<ImportUploadDialogProps> = ({ open, onClose, currentUserId }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileError, setFileError] = useState('');

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setPreview(null);
    setResult(null);
    setProgress(0);
    setFileError('');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    setFileName(file.name);

    try {
      const { headers, data } = await readFile(file);
      const parsed = parseImportData(headers, data);
      setPreview(parsed);
      setStep('preview');
    } catch (err: any) {
      setFileError(err.message || '파일을 읽을 수 없습니다.');
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecute = async () => {
    if (!preview) return;
    setStep('executing');
    setProgress(0);

    const validRows = preview.rows.filter(r => r.errors.length === 0 && r.project && r.task);
    const projectMap = new Map<string, number>(); // projectName → projectId
    const errors: string[] = [];
    let createdProjects = 0;
    let createdTasks = 0;
    let skippedRows = 0;

    const total = validRows.length;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setProgress(Math.round(((i + 1) / total) * 100));

      try {
        // Get or create project
        if (!projectMap.has(row.project)) {
          const project = await api.createProject({
            name: row.project,
            owner_id: currentUserId,
          });
          projectMap.set(row.project, project.id);
          createdProjects++;
        }

        const projectId = projectMap.get(row.project)!;

        // Create task
        await api.createTask({
          title: row.task,
          project_id: projectId,
          status: row.normalizedStatus as any,
          start_date: row.startDate || undefined,
          due_date: row.endDate || undefined,
          assignee_ids: currentUserId > 0 ? [currentUserId] : [],
          priority: 'medium',
        });
        createdTasks++;
      } catch (err: any) {
        errors.push(`${row.rowNumber}행: 생성 실패 - ${err.message || '알 수 없는 오류'}`);
        skippedRows++;
      }
    }

    // Add skipped rows from validation
    const invalidRows = preview.rows.filter(r => r.errors.length > 0);
    skippedRows += invalidRows.length;

    setResult({ createdProjects, createdTasks, skippedRows, errors });
    setStep('result');

    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleDownloadSample = () => {
    const csv = generateSampleCSV();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const allWarnings = preview?.rows.flatMap(r => r.warnings) || [];
  const allErrors = preview?.rows.flatMap(r => r.errors) || [];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3, maxHeight: '85vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudUploadIcon sx={{ color: '#2955FF', fontSize: 22 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
            파일에서 가져오기
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClose}><CloseIcon sx={{ fontSize: 20 }} /></IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <Box>
            {/* Upload area */}
            <Paper
              onClick={() => fileInputRef.current?.click()}
              sx={{
                p: 4, textAlign: 'center', borderRadius: 3,
                border: '2px dashed #C7D2FE', bgcolor: '#FAFBFF',
                cursor: 'pointer', transition: 'all 0.2s',
                '&:hover': { borderColor: '#2955FF', bgcolor: '#EEF2FF' },
                mb: 3,
              }}
              elevation={0}
            >
              <CloudUploadIcon sx={{ fontSize: 40, color: '#2955FF', mb: 1, opacity: 0.7 }} />
              <Typography variant="body1" sx={{ fontWeight: 600, color: '#374151', mb: 0.5 }}>
                CSV 또는 XLSX 파일을 선택하세요
              </Typography>
              <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                클릭하여 파일 선택
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </Paper>

            {fileError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{fileError}</Alert>
            )}

            {/* Column rules guide */}
            <Paper sx={{ p: 2.5, borderRadius: 2, border: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(255,255,255,0.8)' }} elevation={0}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 1.5, color: '#1A1D29' }}>
                컬럼 인식 규칙
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                {[
                  { label: 'Project (필수)', desc: 'project, 프로젝트', color: '#2955FF' },
                  { label: 'Task (필수)', desc: 'task, 업무, 작업, 태스크', color: '#7C3AED' },
                  { label: 'Schedule', desc: 'schedule, 일정', color: '#059669' },
                  { label: 'Status', desc: 'status, 상태', color: '#EA580C' },
                ].map(item => (
                  <Box key={item.label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: item.color, mt: 0.8, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem', color: item.color }}>{item.label}</Typography>
                      <Typography variant="caption" sx={{ display: 'block', fontSize: '0.65rem', color: '#6B7280' }}>{item.desc}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="caption" sx={{ fontSize: '0.68rem', color: '#6B7280', lineHeight: 1.8, display: 'block' }}>
                - 같은 project명의 행들은 하나의 프로젝트로 묶여 생성됩니다<br />
                - status 값: To do, In Progress, Done, Hold (대소문자 무관)<br />
                - 일정 예시: 3월~10월, 3/10~11/11, 3.2-12.2, 26년3월1일-26년10월20일
              </Typography>
            </Paper>

            {/* Sample download */}
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button
                size="small"
                startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                onClick={handleDownloadSample}
                sx={{ textTransform: 'none', color: '#6B7280', fontSize: '0.78rem', fontWeight: 600 }}
              >
                샘플 CSV 다운로드
              </Button>
            </Box>
          </Box>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && preview && (
          <Box>
            {/* File info */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <DescriptionIcon sx={{ color: '#2955FF', fontSize: 20 }} />
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{fileName}</Typography>
              <Button size="small" onClick={handleReset} sx={{ textTransform: 'none', fontSize: '0.72rem', color: '#9CA3AF' }}>
                다시 선택
              </Button>
            </Box>

            {/* Column detection result */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              {(['project', 'task', 'schedule', 'status'] as const).map(col => {
                const detected = preview.columns[col];
                return (
                  <Chip
                    key={col}
                    icon={detected ? <CheckCircleIcon sx={{ fontSize: '0.8rem !important' }} /> : <ErrorOutlineIcon sx={{ fontSize: '0.8rem !important' }} />}
                    label={`${col}: ${detected || '미감지'}`}
                    size="small"
                    sx={{
                      height: 24, fontSize: '0.68rem', fontWeight: 600,
                      bgcolor: detected ? '#F0FDF4' : '#FEF2F2',
                      color: detected ? '#16A34A' : '#DC2626',
                      border: `1px solid ${detected ? '#BBF7D0' : '#FECACA'}`,
                      '& .MuiChip-icon': { color: detected ? '#16A34A' : '#DC2626' },
                    }}
                  />
                );
              })}
            </Box>

            {/* Column errors */}
            {preview.columnErrors.length > 0 && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontSize: '0.82rem', fontWeight: 700 }}>필수 컬럼 누락</AlertTitle>
                {preview.columnErrors.map((e, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', fontSize: '0.72rem' }}>{e}</Typography>
                ))}
              </Alert>
            )}

            {/* Summary stats */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              {[
                { label: '생성 예정 프로젝트', value: preview.projectCount, color: '#2955FF' },
                { label: '생성 예정 태스크', value: preview.taskCount, color: '#22C55E' },
                { label: '오류', value: preview.errorCount, color: '#EF4444' },
                { label: '경고', value: preview.warningCount, color: '#F59E0B' },
              ].map(s => (
                <Box key={s.label} sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: s.color, fontSize: '1.2rem' }}>{s.value}</Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#6B7280' }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>

            {/* Warnings */}
            {allWarnings.length > 0 && (
              <Alert severity="warning" icon={<WarningAmberIcon sx={{ fontSize: 18 }} />} sx={{ mb: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontSize: '0.78rem', fontWeight: 700 }}>경고 ({allWarnings.length}건)</AlertTitle>
                <Box sx={{ maxHeight: 100, overflowY: 'auto' }}>
                  {allWarnings.map((w, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.6 }}>{w}</Typography>
                  ))}
                </Box>
              </Alert>
            )}

            {/* Errors */}
            {allErrors.length > 0 && (
              <Alert severity="error" icon={<ErrorOutlineIcon sx={{ fontSize: 18 }} />} sx={{ mb: 2, borderRadius: 2 }}>
                <AlertTitle sx={{ fontSize: '0.78rem', fontWeight: 700 }}>스킵 예정 ({allErrors.length}건)</AlertTitle>
                <Box sx={{ maxHeight: 100, overflowY: 'auto' }}>
                  {allErrors.map((e, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.6 }}>{e}</Typography>
                  ))}
                </Box>
              </Alert>
            )}

            {/* Preview table */}
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 2, maxHeight: 280 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F9FAFB', width: 40 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F9FAFB' }}>Project</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F9FAFB' }}>Task</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F9FAFB' }}>Schedule</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F9FAFB' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', bgcolor: '#F9FAFB', width: 50 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.rows.map(row => {
                    const hasError = row.errors.length > 0;
                    const hasWarning = row.warnings.length > 0;
                    const sl = statusLabels[row.normalizedStatus] || statusLabels.todo;
                    return (
                      <TableRow key={row.rowNumber} sx={{ bgcolor: hasError ? 'rgba(239,68,68,0.04)' : hasWarning ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                        <TableCell sx={{ fontSize: '0.68rem', color: '#9CA3AF' }}>{row.rowNumber}</TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{row.project || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.72rem' }}>{row.task || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.68rem', color: '#6B7280' }}>
                          {row.startDate && row.endDate
                            ? `${row.startDate} ~ ${row.endDate}`
                            : row.schedule || '-'}
                        </TableCell>
                        <TableCell>
                          <Chip label={sl.label} size="small" sx={{ height: 18, fontSize: '0.58rem', fontWeight: 600, bgcolor: `${sl.color}15`, color: sl.color }} />
                        </TableCell>
                        <TableCell>
                          {hasError && <ErrorOutlineIcon sx={{ fontSize: 14, color: '#EF4444' }} />}
                          {!hasError && hasWarning && <WarningAmberIcon sx={{ fontSize: 14, color: '#F59E0B' }} />}
                          {!hasError && !hasWarning && <CheckCircleIcon sx={{ fontSize: 14, color: '#22C55E' }} />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ── Step 3: Executing ── */}
        {step === 'executing' && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
              프로젝트와 태스크를 생성하고 있습니다...
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 8, borderRadius: 4, maxWidth: 400, mx: 'auto',
                bgcolor: '#E5E7EB',
                '& .MuiLinearProgress-bar': { bgcolor: '#2955FF', borderRadius: 4 },
              }}
            />
            <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#6B7280' }}>
              {progress}%
            </Typography>
          </Box>
        )}

        {/* ── Step 4: Result ── */}
        {step === 'result' && result && (
          <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: '#22C55E', mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                가져오기 완료
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mb: 3 }}>
              {[
                { label: '생성된 프로젝트', value: result.createdProjects, color: '#2955FF' },
                { label: '생성된 태스크', value: result.createdTasks, color: '#22C55E' },
                { label: '스킵된 행', value: result.skippedRows, color: '#EF4444' },
              ].map(s => (
                <Box key={s.label} sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: s.color }}>{s.value}</Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.68rem', color: '#6B7280' }}>{s.label}</Typography>
                </Box>
              ))}
            </Box>

            {result.errors.length > 0 && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                <AlertTitle sx={{ fontSize: '0.82rem', fontWeight: 700 }}>오류 목록</AlertTitle>
                {result.errors.map((e, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', fontSize: '0.68rem' }}>{e}</Typography>
                ))}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 'upload' && (
          <Button onClick={handleClose} sx={{ textTransform: 'none', color: '#6B7280' }}>닫기</Button>
        )}
        {step === 'preview' && (
          <>
            <Button onClick={handleReset} sx={{ textTransform: 'none', color: '#6B7280' }}>취소</Button>
            <Button
              variant="contained"
              onClick={handleExecute}
              disabled={preview!.columnErrors.length > 0 || preview!.taskCount === 0}
              sx={{ textTransform: 'none', bgcolor: '#2955FF', fontWeight: 700 }}
            >
              {preview!.taskCount}개 태스크 생성하기
            </Button>
          </>
        )}
        {step === 'result' && (
          <Button variant="contained" onClick={handleClose} sx={{ textTransform: 'none', bgcolor: '#2955FF' }}>
            확인
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportUploadDialog;
