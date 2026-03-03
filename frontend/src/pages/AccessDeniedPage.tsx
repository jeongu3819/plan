import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';
import { client } from '../api/client';

const AccessDeniedPage: React.FC = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    const base = client.defaults.baseURL || '';
    window.location.href = `${base}/auth/login`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 3,
        bgcolor: '#F9FAFB',
      }}
    >
      <LockOutlinedIcon sx={{ fontSize: 64, color: '#9CA3AF' }} />
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1D29' }}>
        접근 권한이 없습니다
      </Typography>
      <Typography variant="body1" sx={{ color: '#6B7280', textAlign: 'center', maxWidth: 400 }}>
        이 서비스에 접근하려면 관리자에게 등록 요청이 필요합니다.
        <br />
        담당 관리자에게 문의하여 계정 등록을 요청하세요.
      </Typography>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button variant="outlined" onClick={handleLogin} sx={{ textTransform: 'none' }}>
          다시 로그인
        </Button>
        <Button variant="contained" onClick={() => navigate(-1)} sx={{ textTransform: 'none' }}>
          이전 페이지
        </Button>
      </Box>
    </Box>
  );
};

export default AccessDeniedPage;
