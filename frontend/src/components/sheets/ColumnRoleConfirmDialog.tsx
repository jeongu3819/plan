/**
 * ColumnRoleConfirmDialog — 업로드 직후 컬럼 역할 자동 인식 결과 확인 모달
 * 사용자는 "확인만" 하거나, 틀리면 드롭다운으로 수정
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Select, MenuItem, FormControl,
  Chip, alpha,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import type { ColumnRoleMapping, ColumnRoleInfo, SheetStructure } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  structure: SheetStructure | null;
  templateId: number;
  autoRoles?: ColumnRoleMapping | null;  // 시스템이 추정한 역할
  savedRoles?: ColumnRoleMapping | null; // 이전에 저장된 역할 (같은 양식)
  onConfirm: (roles: ColumnRoleMapping) => void;
}

const ROLE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  check_status: { label: '체크 상태', description: '완료/미완료 등 점검 상태', color: '#22C55E' },
  checked_at: { label: '실제 점검일시', description: '점검이 수행된 날짜/시간', color: '#2955FF' },
  assignee: { label: '담당자', description: '점검 수행 담당자', color: '#8B5CF6' },
  due_date: { label: '예정일', description: '점검 예정 날짜', color: '#F59E0B' },
  remark: { label: '비고', description: '특이사항/메모', color: '#6B7280' },
};

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.8) return { text: '높음', color: '#22C55E' };
  if (c >= 0.5) return { text: '보통', color: '#F59E0B' };
  return { text: '낮음', color: '#EF4444' };
}

export default function ColumnRoleConfirmDialog({
  open, onClose, structure, autoRoles, savedRoles, onConfirm,
}: Props) {
  const [roles, setRoles] = useState<ColumnRoleMapping>({});

  // 헤더 목록 (드롭다운에서 선택 가능)
  const headers = useMemo(() => {
    if (!structure?.headers) return [];
    return structure.headers.map(h => ({ col: h.col, value: h.value }));
  }, [structure]);

  // 초기값: savedRoles > autoRoles > structure.column_roles
  useEffect(() => {
    if (!open) return;
    const base = savedRoles || autoRoles || structure?.column_roles || {};
    setRoles({ ...base });
  }, [open, savedRoles, autoRoles, structure]);

  const handleColChange = (role: string, colIdx: number) => {
    const header = headers.find(h => h.col === colIdx);
    setRoles(prev => ({
      ...prev,
      [role]: colIdx >= 0 ? {
        col: colIdx,
        header: header?.value || '',
        confidence: 1.0, // 사용자가 직접 선택
      } : undefined,
    }));
  };

  const handleConfirm = () => {
    onConfirm(roles);
    onClose();
  };

  const isSaved = !!savedRoles;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, overflow: 'visible' } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoFixHighIcon sx={{ color: '#2955FF', fontSize: 20 }} />
        컬럼 역할 자동 인식 결과
        {isSaved && (
          <Chip
            label="이전 매핑 적용됨"
            size="small"
            sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600, bgcolor: alpha('#22C55E', 0.1), color: '#16A34A' }}
          />
        )}
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block', lineHeight: 1.5 }}>
          시스템이 업로드한 시트의 컬럼 역할을 자동으로 추정했습니다.
          맞으면 <b>확인 후 저장</b>을 누르세요. 틀리면 드롭다운에서 수정하세요.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          {Object.entries(ROLE_LABELS).map(([roleKey, { label, description, color }]) => {
            const info = (roles as any)?.[roleKey] as ColumnRoleInfo | undefined;
            const conf = info ? confidenceLabel(info.confidence) : null;

            return (
              <Box key={roleKey} sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                p: 1.5, borderRadius: 2,
                border: '1px solid',
                borderColor: info ? alpha(color, 0.3) : '#E5E7EB',
                bgcolor: info ? alpha(color, 0.03) : 'transparent',
              }}>
                <Box sx={{
                  width: 6, height: 36, borderRadius: 3,
                  bgcolor: info ? color : '#E5E7EB',
                  flexShrink: 0,
                }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem', color: '#1A1D29' }}>
                    {label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.68rem' }}>
                    {description}
                  </Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={info?.col ?? -1}
                    onChange={e => handleColChange(roleKey, Number(e.target.value))}
                    sx={{ fontSize: '0.78rem', borderRadius: 1.5 }}
                    displayEmpty
                  >
                    <MenuItem value={-1}><em>미지정</em></MenuItem>
                    {headers.map(h => (
                      <MenuItem key={h.col} value={h.col}>
                        {h.value}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {conf && (
                  <Chip
                    label={`신뢰도: ${conf.text}`}
                    size="small"
                    sx={{
                      height: 18, fontSize: '0.58rem', fontWeight: 600,
                      bgcolor: alpha(conf.color, 0.1), color: conf.color,
                      flexShrink: 0,
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ color: '#6B7280' }}>
          건너뛰기
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          startIcon={<CheckCircleOutlineIcon sx={{ fontSize: 16 }} />}
          sx={{ bgcolor: '#2955FF', fontWeight: 600 }}
        >
          확인 후 저장
        </Button>
      </DialogActions>
    </Dialog>
  );
}
