/**
 * SpaceAccessDenied — Shown when a user accesses a space URL without permission.
 * Allows requesting access, shows pending status.
 */

import React, { useState } from 'react';
import { Box, Typography, Button, Paper, Chip } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';

interface SpaceAccessDeniedProps {
  spaceId: number;
  spaceName: string;
  hasPendingRequest: boolean;
}

const SpaceAccessDenied: React.FC<SpaceAccessDeniedProps> = ({ spaceId, spaceName, hasPendingRequest }) => {
  const currentUserId = useAppStore(state => state.currentUserId);
  const [requested, setRequested] = useState(hasPendingRequest);
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    setLoading(true);
    try {
      await api.requestJoinSpace(spaceId, currentUserId);
      setRequested(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Paper
        sx={{
          p: 5, textAlign: 'center', borderRadius: 3, maxWidth: 420,
          border: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(12px)',
        }}
        elevation={0}
      >
        <LockOutlinedIcon sx={{ fontSize: 48, color: '#D1D5DB', mb: 2 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          접근 권한이 필요합니다
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280', mb: 0.5 }}>
          <strong>{spaceName}</strong> 공간에 접근하려면 권한이 필요합니다.
        </Typography>
        <Typography variant="caption" sx={{ color: '#9CA3AF', display: 'block', mb: 3 }}>
          공간 소유자 또는 관리자에게 접근 권한을 신청해주세요.
        </Typography>

        {requested ? (
          <Chip
            icon={<CheckCircleOutlineIcon sx={{ fontSize: '1rem !important' }} />}
            label="접근 권한 신청 완료 — 승인 대기 중"
            sx={{
              height: 32, fontSize: '0.8rem', fontWeight: 600,
              bgcolor: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0',
              '& .MuiChip-icon': { color: '#16A34A' },
            }}
          />
        ) : (
          <Button
            variant="contained"
            onClick={handleRequest}
            disabled={loading}
            sx={{ bgcolor: '#2955FF', textTransform: 'none', fontWeight: 700, px: 4 }}
          >
            {loading ? '신청 중...' : '접속 권한 신청하기'}
          </Button>
        )}
      </Paper>
    </Box>
  );
};

export default SpaceAccessDenied;
