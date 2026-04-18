/**
 * TaskSheetPanel — Task Details 내부 Check Sheet 패널
 * - 해당 Task 에 연결된 SheetExecution 목록을 보여주고
 * - 템플릿을 선택해 새 실행을 시작한다 (task_id 를 자동으로 함께 보냄)
 */
import { useState } from 'react';
import {
  Box, Typography, Button, Chip, LinearProgress, Dialog,
  DialogTitle, DialogContent, DialogActions, FormControl,
  InputLabel, Select, MenuItem, alpha, Link,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAppStore } from '../../stores/useAppStore';
import { useNavigate } from 'react-router-dom';
import { useSpaceNav } from '../../hooks/useSpaceNav';
import type { SheetTemplate } from '../../types';

interface Props {
  taskId: number;
  projectId?: number;
  canEdit: boolean;
}

export default function TaskSheetPanel({ taskId, projectId, canEdit }: Props) {
  const currentUserId = useAppStore(state => state.currentUserId);
  const currentSpaceId = useAppStore(state => state.currentSpaceId);
  const navigate = useNavigate();
  const { spacePath } = useSpaceNav();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [execTitle, setExecTitle] = useState('');
  const [starting, setStarting] = useState(false);

  const { data: summary, refetch } = useQuery({
    queryKey: ['taskSheetSummary', taskId],
    queryFn: () => api.getTaskSheetSummary(taskId),
    enabled: !!taskId,
  });

  const { data: templatesData } = useQuery({
    queryKey: ['sheetTemplates', currentSpaceId],
    queryFn: () => api.getSheetTemplates(currentSpaceId!),
    enabled: !!currentSpaceId && pickerOpen,
  });
  const templates: SheetTemplate[] = templatesData?.templates || [];

  const active = summary?.active_executions || [];
  const completed = summary?.recent_completed || [];
  const hasAny = (summary?.total_executions || 0) > 0;

  const openPicker = () => {
    setSelectedTemplateId('');
    setExecTitle('');
    setPickerOpen(true);
  };

  const startExecution = async () => {
    if (!selectedTemplateId || !currentSpaceId) return;
    setStarting(true);
    try {
      const tpl = templates.find(t => t.id === selectedTemplateId);
      const exec = await api.createSheetExecution({
        template_id: Number(selectedTemplateId),
        task_id: taskId,
        project_id: projectId,
        title: execTitle.trim() || undefined,
      }, currentSpaceId, currentUserId);
      setPickerOpen(false);
      refetch();
      navigate(`${spacePath}/sheets/execution/${exec.id}`);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void tpl;
    } catch (e) {
      console.error(e);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', fontSize: '0.7rem' }}>
          <DescriptionIcon sx={{ fontSize: '0.8rem', mr: 0.5, verticalAlign: 'text-bottom', color: '#7C3AED' }} />
          Check Sheets ({summary?.total_executions || 0})
        </Typography>
        {canEdit && (
          <Button
            size="small"
            startIcon={<AddIcon sx={{ fontSize: '0.8rem' }} />}
            onClick={openPicker}
            sx={{ textTransform: 'none', fontSize: '0.7rem', color: '#7C3AED' }}
          >
            Sheet 실행 시작
          </Button>
        )}
      </Box>

      {!hasAny ? (
        <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
          연결된 Check Sheet 가 없습니다.{' '}
          <Link component="button" onClick={() => navigate(`${spacePath}/sheets`)} sx={{ fontSize: '0.7rem', color: '#7C3AED' }}>
            Sheet 관리로 이동
          </Link>
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
          {active.map((exec: any) => (
            <Box
              key={exec.id}
              onClick={() => navigate(`${spacePath}/sheets/execution/${exec.id}`)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5,
                cursor: 'pointer', bgcolor: '#FFFBEB', border: '1px solid #FDE68A',
                '&:hover': { bgcolor: '#FEF3C7' },
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 14, color: '#F59E0B', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {exec.title}
              </Typography>
              <Box sx={{ width: 60, flexShrink: 0 }}>
                <LinearProgress
                  variant="determinate" value={exec.progress}
                  sx={{ height: 4, borderRadius: 2, bgcolor: '#FDE68A', '& .MuiLinearProgress-bar': { bgcolor: '#F59E0B' } }}
                />
              </Box>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#D97706', flexShrink: 0, fontWeight: 700 }}>
                {exec.progress}%
              </Typography>
            </Box>
          ))}
          {completed.slice(0, 5).map((exec: any) => (
            <Box
              key={exec.id}
              onClick={() => navigate(`${spacePath}/sheets/execution/${exec.id}`)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 1.5, cursor: 'pointer',
                '&:hover': { bgcolor: '#F9FAFB' },
              }}
            >
              <CheckCircleOutlineIcon sx={{ fontSize: 14, color: '#22C55E', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontSize: '0.76rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6B7280' }}>
                {exec.title}
              </Typography>
              <Chip label="완료" size="small"
                sx={{ height: 16, fontSize: '0.55rem', bgcolor: alpha('#22C55E', 0.1), color: '#16A34A' }} />
            </Box>
          ))}
        </Box>
      )}

      {/* Template picker dialog */}
      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Check Sheet 실행 시작</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            이 Task 에 Sheet 실행본을 연결합니다. 실행 후 Task Details 에서 진행률을 볼 수 있습니다.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
            <InputLabel>Sheet 템플릿</InputLabel>
            <Select
              value={selectedTemplateId === '' ? '' : String(selectedTemplateId)}
              label="Sheet 템플릿"
              onChange={e => setSelectedTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value=""><em>선택</em></MenuItem>
              {templates.map(t => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.name} (체크 {t.checkable_count}개)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box>
            <Typography variant="caption" fontWeight={600}>실행 제목 (선택)</Typography>
            <input
              value={execTitle}
              onChange={e => setExecTitle(e.target.value)}
              placeholder="미입력 시 자동 생성"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '0.85rem', marginTop: 4 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPickerOpen(false)} sx={{ color: '#6B7280' }}>취소</Button>
          <Button
            variant="contained"
            onClick={startExecution}
            disabled={!selectedTemplateId || starting}
            sx={{ bgcolor: '#7C3AED' }}
          >
            {starting ? '실행 중…' : '실행 시작'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
