/**
 * SheetUploadDialog — Excel/CSV 파일 업로드 다이얼로그
 */
import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Chip, LinearProgress,
  Select, MenuItem, FormControl, InputLabel, alpha,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import { api } from '../../api/client';

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
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFile(null);
    setName('');
    setDescription('');
    setCategory('general');
    setError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      if (!name) {
        setName(f.name.replace(/\.(xlsx|xls|csv)$/i, ''));
      }
      setError('');
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
      });
      onSuccess?.(result);
      resetForm();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
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

        {uploading && <LinearProgress sx={{ mb: 1 }} />}
        {error && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => { resetForm(); onClose(); }} sx={{ color: '#6B7280' }}>취소</Button>
        <Button
          variant="contained"
          disabled={!file || uploading}
          onClick={handleUpload}
          sx={{ bgcolor: '#2955FF' }}
        >
          {uploading ? '업로드 중...' : '업로드'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
