/**
 * SheetTemplatePage — Sheet 템플릿 관리 (업로드/목록/미리보기)
 */
import { useState } from 'react';
import {
  Box, Typography, Paper, Button, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, Tooltip, alpha,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DescriptionIcon from '@mui/icons-material/Description';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';
import { useSpaceNav } from '../hooks/useSpaceNav';
import SheetUploadDialog from '../components/sheets/SheetUploadDialog';
import SheetRenderer from '../components/sheets/SheetRenderer';
import type { SheetTemplate } from '../types';

const CATEGORY_LABELS: Record<string, string> = {
  check_sheet: 'Check Sheet',
  chemical_mgmt: '약품관리',
  equipment_inspect: '설비 점검',
  work_log: '작업 내역',
  standard_form: '관리 표준',
  general: '기타',
};

const CATEGORY_COLORS: Record<string, string> = {
  check_sheet: '#16A34A',
  chemical_mgmt: '#9333EA',
  equipment_inspect: '#EA580C',
  work_log: '#2955FF',
  standard_form: '#0891B2',
  general: '#6B7280',
};

export default function SheetTemplatePage() {
  const currentUserId = useAppStore(state => state.currentUserId);
  const currentSpaceId = useAppStore(state => state.currentSpaceId);
  const navigate = useNavigate();
  const { spacePath } = useSpaceNav();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [startDialogTemplate, setStartDialogTemplate] = useState<SheetTemplate | null>(null);
  const [execTitle, setExecTitle] = useState('');
  const [execEquipment, setExecEquipment] = useState('');

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['sheetTemplates', currentSpaceId],
    queryFn: () => api.getSheetTemplates(currentSpaceId!),
    enabled: !!currentSpaceId,
  });

  const templates: SheetTemplate[] = templatesData?.templates || [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteSheetTemplate(id, currentUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sheetTemplates'] }),
  });

  const handlePreview = async (template: SheetTemplate) => {
    setPreviewLoading(true);
    try {
      const detail = await api.getSheetTemplate(template.id);
      setPreviewTemplate(detail);
    } catch (e) {
      console.error(e);
    }
    setPreviewLoading(false);
  };

  const handleStartExecution = async () => {
    if (!startDialogTemplate || !currentSpaceId) return;
    try {
      const exec = await api.createSheetExecution({
        template_id: startDialogTemplate.id,
        title: execTitle.trim() || undefined,
        equipment_name: execEquipment.trim() || undefined,
      }, currentSpaceId, currentUserId);
      setStartDialogTemplate(null);
      setExecTitle('');
      setExecEquipment('');
      navigate(`${spacePath}/sheets/execution/${exec.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Sheets</Typography>
          <Typography variant="body2" color="text.secondary">
            Excel 양식을 업로드하여 Check Sheet, 점검표, 운영표로 사용하세요
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => navigate(`${spacePath}/sheets/history`)}
            sx={{ fontSize: '0.8rem' }}
          >
            실행 이력
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setUploadOpen(true)}
            sx={{ bgcolor: '#2955FF', fontSize: '0.8rem' }}
          >
            Sheet 업로드
          </Button>
        </Box>
      </Box>

      {/* Template list */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : templates.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" fontWeight={600}>
            등록된 Sheet가 없습니다
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            기존 Excel 파일을 업로드하면 바로 사용할 수 있습니다
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setUploadOpen(true)} sx={{ bgcolor: '#2955FF' }}>
            첫 Sheet 업로드
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
          {templates.map(t => {
            const catColor = CATEGORY_COLORS[t.category || 'general'] || '#6B7280';
            return (
              <Paper
                key={t.id}
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1, borderColor: alpha(catColor, 0.3) }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <DescriptionIcon sx={{ color: catColor, mt: 0.3 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </Typography>
                    {t.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 0.5 }}>
                        {t.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip label={CATEGORY_LABELS[t.category || 'general'] || t.category} size="small"
                    sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha(catColor, 0.1), color: catColor }} />
                  <Chip label={`${t.row_count}행 x ${t.col_count}열`} size="small" sx={{ height: 20, fontSize: '0.62rem' }} />
                  <Chip label={`체크 ${t.checkable_count}개`} size="small" sx={{ height: 20, fontSize: '0.62rem', bgcolor: alpha('#22C55E', 0.1), color: '#16A34A' }} />
                </Box>
                {t.original_filename && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    원본: {t.original_filename}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', gap: 0.5, mt: 'auto', pt: 0.5 }}>
                  <Tooltip title="미리보기">
                    <IconButton size="small" onClick={() => handlePreview(t)}>
                      <VisibilityIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  </Tooltip>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
                    onClick={() => { setStartDialogTemplate(t); setExecTitle(`${t.name} - ${new Date().toISOString().slice(0, 10)}`); }}
                    sx={{ fontSize: '0.72rem', bgcolor: catColor, flexGrow: 1 }}
                  >
                    실행
                  </Button>
                  <Tooltip title="삭제">
                    <IconButton size="small" onClick={() => { if (confirm('이 템플릿을 삭제하시겠습니까?')) deleteMutation.mutate(t.id); }}>
                      <DeleteOutlineIcon sx={{ fontSize: 18, color: '#EF4444' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Upload dialog */}
      <SheetUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        spaceId={currentSpaceId || 0}
        userId={currentUserId}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['sheetTemplates'] })}
      />

      {/* Preview dialog */}
      <Dialog open={!!previewTemplate} onClose={() => setPreviewTemplate(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          {previewTemplate?.name || 'Sheet 미리보기'}
        </DialogTitle>
        <DialogContent>
          {previewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : previewTemplate?.structure ? (
            <SheetRenderer structure={previewTemplate.structure} readOnly />
          ) : (
            <Typography color="text.secondary">구조 데이터가 없습니다</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewTemplate(null)}>닫기</Button>
        </DialogActions>
      </Dialog>

      {/* Start execution dialog */}
      <Dialog open={!!startDialogTemplate} onClose={() => setStartDialogTemplate(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Sheet 실행 시작</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {startDialogTemplate?.name}을(를) 실행합니다. 체크 항목: {startDialogTemplate?.checkable_count}개
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Typography variant="caption" fontWeight={600}>실행 제목</Typography>
              <input
                value={execTitle}
                onChange={e => setExecTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '0.85rem' }}
              />
            </Box>
            <Box>
              <Typography variant="caption" fontWeight={600}>관련 설비 (선택)</Typography>
              <input
                value={execEquipment}
                onChange={e => setExecEquipment(e.target.value)}
                placeholder="예: K08, CMP-01"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: '0.85rem' }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStartDialogTemplate(null)} sx={{ color: '#6B7280' }}>취소</Button>
          <Button variant="contained" onClick={handleStartExecution} sx={{ bgcolor: '#2955FF' }}>실행 시작</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
