/**
 * SheetUploadDialog — Excel/CSV 파일 업로드 다이얼로그
 * v3.1: 업로드 후 ColumnRoleConfirmDialog 자동 오픈
 */
import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Chip, LinearProgress,
  Select, MenuItem, FormControl, InputLabel, alpha,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { api } from '../../api/client';
import ColumnRoleConfirmDialog from './ColumnRoleConfirmDialog';
import type { ColumnRoleMapping, SheetStructure } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  spaceId: number;
  userId: number;
  onSuccess?: (template: any) => void;
}

const CATEGORIES = [
  { value: 'check_sheet', label: 'Check Sheet' },
  { value: 'chemical_mgmt', label: '약품관리 Sheet' },
  { value: 'equipment_inspect', label: '설비 점검표' },
  { value: 'work_log', label: '작업 내역표' },
  { value: 'standard_form', label: '관리 표준 양식' },
  { value: 'general', label: '기타 운영표' },
];

export default function SheetUploadDialog({ open, onClose, spaceId, userId, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [inspecting, setInspecting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // v3.1: 역할 확인 모달
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [uploadedTemplate, setUploadedTemplate] = useState<any>(null);
  const [uploadedStructure, setUploadedStructure] = useState<SheetStructure | null>(null);

  const resetForm = () => {
    setFile(null);
    setName('');
    setDescription('');
    setCategory('general');
    setError('');
    setSheetNames([]);
    setSelectedSheet('');
    setUploadedTemplate(null);
    setUploadedStructure(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!name) {
      setName(f.name.replace(/\.(xlsx|xls|csv)$/i, ''));
    }
    setError('');
    setSheetNames([]);
    setSelectedSheet('');

    // CSV 는 시트 선택이 필요없음
    if (f.name.toLowerCase().endsWith('.csv')) return;

    setInspecting(true);
    try {
      const info = await api.inspectSheetFile(f);
      setSheetNames(info.sheet_names || []);
      setSelectedSheet(info.suggested || info.sheet_names?.[0] || '');
    } catch (err: any) {
      setError(err?.response?.data?.detail || '파일 열기 실패');
      setFile(null);
    } finally {
      setInspecting(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await api.uploadSheetTemplate(file, spaceId, userId, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        category,
        sheet_name: sheetNames.length > 1 && selectedSheet ? selectedSheet : undefined,
      });

      // v3.1: 업로드 성공 후 구조 가져와서 역할 확인 모달 열기
      setUploadedTemplate(result);
      try {
        const detail = await api.getSheetTemplate(result.id);
        setUploadedStructure(detail.structure || null);
      } catch {
        // 구조 조회 실패 시에도 계속 진행
        setUploadedStructure(null);
      }

      // 자동 인식된 role이 있으면 확인 모달 표시
      if (result.column_roles && Object.keys(result.column_roles).length > 0) {
        setRoleDialogOpen(true);
      } else {
        // role 감지가 안 된 경우 바로 완료
        onSuccess?.(result);
        resetForm();
        onClose();
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleRoleConfirm = async (roles: ColumnRoleMapping) => {
    if (uploadedTemplate?.id) {
      try {
        await api.confirmSheetRoles(uploadedTemplate.id, roles, userId);
      } catch {
        // 저장 실패시 무시 (다음에 다시 할 수 있음)
      }
    }
    onSuccess?.(uploadedTemplate);
    resetForm();
    onClose();
  };

  const handleRoleSkip = () => {
    setRoleDialogOpen(false);
    onSuccess?.(uploadedTemplate);
    resetForm();
    onClose();
  };

  return (
    <>
      <Dialog open={open && !roleDialogOpen} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Sheet 업로드
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            기존 Excel/CSV 파일을 업로드하면 원래 양식에 가까운 모습으로 플랫폼에서 사용할 수 있습니다.
          </Typography>

          {/* File drop area */}
          <Box
            onClick={() => fileRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: file ? '#22C55E' : '#D1D5DB',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: file ? alpha('#22C55E', 0.04) : '#FAFAFA',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#2955FF', bgcolor: alpha('#2955FF', 0.04) },
              mb: 2,
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              hidden
            />
            {file ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                <DescriptionIcon sx={{ color: '#22C55E' }} />
                <Typography variant="body2" fontWeight={600}>{file.name}</Typography>
                <Chip label={`${(file.size / 1024).toFixed(0)} KB`} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
              </Box>
            ) : (
              <>
                <CloudUploadIcon sx={{ fontSize: 40, color: '#D1D5DB', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  클릭하여 파일 선택 (.xlsx, .csv)
                </Typography>
              </>
            )}
          </Box>

          {inspecting && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              파일을 분석 중입니다…
            </Typography>
          )}
          {sheetNames.length > 1 && (
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <InputLabel>파싱할 시트</InputLabel>
              <Select
                value={selectedSheet}
                onChange={e => setSelectedSheet(e.target.value)}
                label="파싱할 시트"
              >
                {sheetNames.map(n => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            fullWidth size="small"
            label="Sheet 이름"
            value={name}
            onChange={e => setName(e.target.value)}
            sx={{ mb: 1.5 }}
          />

          <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
            <InputLabel>분류</InputLabel>
            <Select value={category} onChange={e => setCategory(e.target.value)} label="분류">
              {CATEGORIES.map(c => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth size="small"
            label="설명 (선택)"
            multiline rows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
            sx={{ mb: 1 }}
          />

          {/* v3.1: 자동 인식 안내 */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            p: 1, borderRadius: 1.5, bgcolor: alpha('#2955FF', 0.04),
            border: '1px solid', borderColor: alpha('#2955FF', 0.1),
          }}>
            <AutoFixHighIcon sx={{ fontSize: 16, color: '#2955FF' }} />
            <Typography variant="caption" sx={{ color: '#4B5563', fontSize: '0.68rem' }}>
              업로드 시 체크 상태, 점검일시, 담당자 등의 컬럼이 자동으로 인식됩니다.
            </Typography>
          </Box>

          {uploading && <LinearProgress sx={{ mt: 1, mb: 1 }} />}
          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { resetForm(); onClose(); }} sx={{ color: '#6B7280' }}>취소</Button>
          <Button
            variant="contained"
            disabled={!file || uploading || inspecting}
            onClick={handleUpload}
            sx={{ bgcolor: '#2955FF' }}
          >
            {uploading ? '업로드 중...' : '업로드'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* v3.1: 컬럼 역할 확인 모달 */}
      <ColumnRoleConfirmDialog
        open={roleDialogOpen}
        onClose={handleRoleSkip}
        structure={uploadedStructure}
        templateId={uploadedTemplate?.id || 0}
        autoRoles={uploadedTemplate?.column_roles}
        savedRoles={uploadedTemplate?.column_role_mapping}
        onConfirm={handleRoleConfirm}
      />
    </>
  );
}
