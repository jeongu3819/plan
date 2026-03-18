/**
 * SpaceAccessDenied — Shown when:
 * 1. User accesses a space URL without permission (specific space mode)
 * 2. User has no spaces at all (noSpaceMode — neutral empty state)
 */

import React, { useState } from 'react';
import { Box, Typography, Button, Paper, Chip } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';

interface SpaceAccessDeniedProps {
  spaceId: number;
  spaceName: string;
  hasPendingRequest: boolean;
  noSpaceMode?: boolean;
  onCreateSpace?: () => void;
}

const SpaceAccessDenied: React.FC<SpaceAccessDeniedProps> = ({
  spaceId, spaceName, hasPendingRequest, noSpaceMode, onCreateSpace,
}) => {
  const currentUserId = useAppStore(state => state.currentUserId);
  const currentSpaceSlug = useAppStore(state => state.currentSpaceSlug);
  const [requested, setRequested] = useState(hasPendingRequest);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRequest = async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      await api.requestJoinSpace(spaceId, currentUserId);
      setRequested(true);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const goToSpaceList = () => {
    // 공간이 없는 상태(noSpaceMode)에서는 항상 /spaces로 이동
    // 공간이 있으면 현재 공간 컨텍스트 유지
    const path = noSpaceMode ? '/spaces' : (currentSpaceSlug ? `/space/${currentSpaceSlug}/spaces` : '/spaces');
    navigate(path);
  };

  // ── 공간 미소속 사용자를 위한 중립 안내 ──
  if (noSpaceMode) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Paper
          sx={{
            p: 5, textAlign: 'center', borderRadius: 3, maxWidth: 440,
            border: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(12px)',
          }}
          elevation={0}
        >
          <WorkspacesIcon sx={{ fontSize: 48, color: '#2955FF', mb: 2, opacity: 0.6 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            프로젝트를 생성하려면 공간이 필요합니다
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', mb: 3 }}>
            공간 소유자 또는 관리자에게 접근 권한을 신청하거나, 새 공간을 만들어 보세요.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
            <Button
              variant="outlined"
              startIcon={<WorkspacesIcon sx={{ fontSize: 16 }} />}
              onClick={goToSpaceList}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', borderColor: '#D1D5DB', color: '#374151', borderRadius: 2 }}
            >
              공간 목록으로
            </Button>
            {onCreateSpace && (
              <Button
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={onCreateSpace}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', bgcolor: '#2955FF', borderRadius: 2 }}
              >
                새 공간 만들기
              </Button>
            )}
          </Box>
        </Paper>
      </Box>
    );
  }

  // ── 특정 공간 접근 권한 없음 ──
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Paper
        sx={{
          p: 5, textAlign: 'center', borderRadius: 3, maxWidth: 440,
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
          공간 소유자 또는 관리자에게 접근 권한을 신청하거나, 새 공간을 만들어 보세요.
        </Typography>

        {requested ? (
          <Chip
            icon={<CheckCircleOutlineIcon sx={{ fontSize: '1rem !important' }} />}
            label="접근 권한 신청 완료 — 승인 대기 중"
            sx={{
              height: 32, fontSize: '0.8rem', fontWeight: 600,
              bgcolor: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0',
              '& .MuiChip-icon': { color: '#16A34A' },
              mb: 2,
            }}
          />
        ) : (
          <Button
            variant="contained"
            onClick={handleRequest}
            disabled={loading}
            sx={{ bgcolor: '#2955FF', textTransform: 'none', fontWeight: 700, px: 4, mb: 2 }}
          >
            {loading ? '신청 중...' : '접속 권한 신청하기'}
          </Button>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<WorkspacesIcon sx={{ fontSize: 14 }} />}
            onClick={goToSpaceList}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderColor: '#D1D5DB', color: '#374151' }}
          >
            공간 목록으로
          </Button>
          {onCreateSpace && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={onCreateSpace}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderColor: '#2955FF', color: '#2955FF' }}
            >
              새 공간 만들기
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default SpaceAccessDenied;
