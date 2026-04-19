/**
 * SheetTemplatePage — Check Sheet 양식 저장소
 * 이 페이지는 "양식을 보관하는 곳"입니다. 엔지니어는 Task Details 에서 양식을 연결하여 체크합니다.
 */
import { useState } from 'react';
import {
  Box, Typography, Paper, Button, Chip, IconButton, Dialog,
  DialogContent, Tooltip, alpha,
  CircularProgress, AppBar, Toolbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
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
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  const openPreview = async (template: SheetTemplate) => {
    setPreviewLoading(true);
    setPreviewTemplate({ id: template.id, name: template.name });
    try {
      const detail = await api.getSheetTemplate(template.id);
      setPreviewTemplate(detail);
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewTemplate(null);
    setPreviewLoading(false);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Check Sheet 양식</Typography>
          <Typography variant="body2" color="text.secondary">
            Excel 양식을 업로드해서 보관합니다. 실제 점검은 Task Details 에서 이 양식을 연결해 진행합니다.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setUploadOpen(true)}
          sx={{ bgcolor: '#2955FF', fontSize: '0.8rem' }}
        >
          양식 업로드
        </Button>
      </Box>

      {/* Usage hint */}
      <Paper variant="outlined" sx={{ p: 1.2, mb: 2, borderRadius: 2, bgcolor: alpha('#2955FF', 0.04), borderColor: alpha('#2955FF', 0.2), display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <InfoOutlinedIcon sx={{ fontSize: 16, color: '#2955FF', mt: 0.2 }} />
        <Typography variant="caption" sx={{ color: '#1E40AF', lineHeight: 1.5 }}>
          카드를 클릭하면 양식이 실제 모습대로 열립니다. 엔지니어가 점검을 진행하려면 Task Details 의 <b>Check Sheets</b> 패널에서 이 양식을 연결하세요.
        </Typography>
      </Paper>

      {/* Template list */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : templates.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <DescriptionIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" fontWeight={600}>
            등록된 양식이 없습니다
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            기존 Excel 파일을 업로드하면 바로 Task 에서 사용할 수 있습니다
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setUploadOpen(true)} sx={{ bgcolor: '#2955FF' }}>
            첫 양식 업로드
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
                onClick={() => openPreview(t)}
                sx={{
                  p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1,
                  borderColor: alpha(catColor, 0.3),
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  '&:hover': {
                    borderColor: catColor,
                    boxShadow: `0 4px 12px ${alpha(catColor, 0.15)}`,
                    transform: 'translateY(-2px)',
                  },
                }}
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
                  <Chip label={`${t.row_count}행 × ${t.col_count}열`} size="small" sx={{ height: 20, fontSize: '0.62rem' }} />
                  <Chip label={`체크 ${t.checkable_count}개`} size="small" sx={{ height: 20, fontSize: '0.62rem', bgcolor: alpha('#22C55E', 0.1), color: '#16A34A' }} />
                </Box>
                {t.original_filename && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    원본: {t.original_filename}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 'auto', pt: 0.5 }}>
                  <Tooltip title="양식 삭제">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('이 양식을 삭제하시겠습니까?\n(이 양식을 사용 중인 Task 의 체크 진행 기록도 함께 삭제됩니다)')) {
                          deleteMutation.mutate(t.id);
                        }
                      }}
                    >
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

      {/* Preview dialog — full screen so Excel-like layout fits */}
      <Dialog open={!!previewTemplate} onClose={closePreview} fullScreen PaperProps={{ sx: { bgcolor: '#F9FAFB' } }}>
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#fff', color: '#111', borderBottom: '1px solid #E5E7EB' }}>
          <Toolbar variant="dense" sx={{ gap: 1 }}>
            <DescriptionIcon sx={{ color: '#2955FF' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={800} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {previewTemplate?.name || '양식 미리보기'}
              </Typography>
              {previewTemplate?.original_filename && (
                <Typography variant="caption" color="text.secondary">
                  원본: {previewTemplate.original_filename}
                  {previewTemplate.sheet_name && ` · 시트: ${previewTemplate.sheet_name}`}
                </Typography>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
              이 화면은 양식 확인용입니다. 실제 점검은 Task Details 에서 진행하세요.
            </Typography>
            <IconButton onClick={closePreview}><CloseIcon /></IconButton>
          </Toolbar>
        </AppBar>
        <DialogContent sx={{ p: 2 }}>
          {previewLoading || !previewTemplate?.structure ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
              {previewLoading ? <CircularProgress /> : (
                <Typography color="text.secondary">구조 데이터가 없습니다</Typography>
              )}
            </Box>
          ) : (
            <SheetRenderer structure={previewTemplate.structure} readOnly />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
