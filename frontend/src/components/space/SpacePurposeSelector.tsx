import React from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent,
  alpha,
} from '@mui/material';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import ScienceIcon from '@mui/icons-material/Science';
import CodeIcon from '@mui/icons-material/Code';
import HubIcon from '@mui/icons-material/Hub';
import TuneIcon from '@mui/icons-material/Tune';
import type { SpacePurpose } from '../../types';

interface Props {
  value: SpacePurpose;
  onChange: (purpose: SpacePurpose) => void;
}

const PURPOSE_OPTIONS: {
  key: SpacePurpose;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: 'project_management',
    label: '프로젝트 관리',
    desc: 'PM 중심의 일정/진행 관리',
    icon: <FolderSpecialIcon />,
    color: '#2955FF',
  },
  {
    key: 'equipment_ops',
    label: '설비 운영',
    desc: '설비 점검/PM/약품 관리',
    icon: <PrecisionManufacturingIcon />,
    color: '#16A34A',
  },
  {
    key: 'process_change',
    label: '공정 변경/이력',
    desc: 'Recipe 변경 이력 관리',
    icon: <ScienceIcon />,
    color: '#9333EA',
  },
  {
    key: 'sw_dev',
    label: 'SW 개발',
    desc: '기능 단위 개발 흐름 관리',
    icon: <CodeIcon />,
    color: '#EA580C',
  },
  {
    key: 'integrated_ops',
    label: '통합 운영',
    desc: '직군 혼합 협업 운영',
    icon: <HubIcon />,
    color: '#0891B2',
  },
  {
    key: 'custom',
    label: '직접 구성',
    desc: '필요한 기능을 직접 선택',
    icon: <TuneIcon />,
    color: '#64748B',
  },
];

export default function SpacePurposeSelector({ value, onChange }: Props) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
        공간 운영 목적
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        {PURPOSE_OPTIONS.map((opt) => {
          const selected = value === opt.key;
          return (
            <Card
              key={opt.key}
              variant="outlined"
              sx={{
                borderColor: selected ? opt.color : 'divider',
                borderWidth: selected ? 2 : 1,
                bgcolor: selected ? alpha(opt.color, 0.06) : 'background.paper',
                transition: 'all 0.15s',
              }}
            >
              <CardActionArea onClick={() => onChange(opt.key)} sx={{ p: 1.2 }}>
                <CardContent sx={{ p: '0 !important', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <Box sx={{ color: selected ? opt.color : 'text.secondary', display: 'flex' }}>
                      {opt.icon}
                    </Box>
                    <Typography variant="body2" fontWeight={selected ? 700 : 500} sx={{ color: selected ? opt.color : 'text.primary' }}>
                      {opt.label}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
                    {opt.desc}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
    </Box>
  );
}
