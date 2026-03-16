/**
 * ZeroStateDashboard — Welcome screen when user has no projects.
 *
 * Shows categorized template cards for quick project creation.
 * Transitions seamlessly to the real dashboard once a project is created.
 */

import React, { useState } from 'react';
import { Box, Typography, Paper, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SprintIcon from '@mui/icons-material/Speed';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CampaignIcon from '@mui/icons-material/Campaign';
import CodeIcon from '@mui/icons-material/Code';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useNavigate } from 'react-router-dom';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  color: string;
  defaultTasks: { title: string; status: string; priority?: string }[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'pm-sprint',
    name: 'PM Sprint',
    description: '2주 단위 스프린트 관리. 백로그, 스프린트 플래닝, 회고까지.',
    category: 'PM',
    icon: <SprintIcon />,
    color: '#2955FF',
    defaultTasks: [
      { title: '스프린트 목표 정의', status: 'todo', priority: 'high' },
      { title: '백로그 정리 및 우선순위 설정', status: 'todo', priority: 'high' },
      { title: '데일리 스탠드업 진행', status: 'todo' },
      { title: '스프린트 리뷰 준비', status: 'todo' },
      { title: '회고(Retrospective) 진행', status: 'todo' },
    ],
  },
  {
    id: 'side-project',
    name: 'Side Project Launch',
    description: '사이드 프로젝트의 기획부터 런칭까지 한눈에.',
    category: 'Development',
    icon: <RocketLaunchIcon />,
    color: '#7C3AED',
    defaultTasks: [
      { title: '아이디어 검증 / 리서치', status: 'todo', priority: 'high' },
      { title: 'MVP 기능 정의', status: 'todo', priority: 'high' },
      { title: '디자인 프로토타입', status: 'todo' },
      { title: '개발 환경 셋업', status: 'todo' },
      { title: 'MVP 개발', status: 'todo' },
      { title: '베타 테스트', status: 'todo' },
      { title: '런칭 준비', status: 'todo' },
    ],
  },
  {
    id: 'weekly-report',
    name: 'Weekly Report',
    description: '주간 업무 보고 루틴. 매주 반복하는 업무를 체계적으로.',
    category: 'Report',
    icon: <CalendarMonthIcon />,
    color: '#059669',
    defaultTasks: [
      { title: '지난 주 성과 정리', status: 'todo' },
      { title: '이번 주 핵심 목표 설정', status: 'todo', priority: 'high' },
      { title: '이슈/리스크 체크', status: 'todo' },
      { title: '주간 보고서 작성', status: 'todo' },
      { title: '다음 주 플래닝', status: 'todo' },
    ],
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign',
    description: '마케팅 캠페인 기획, 실행, 성과 분석을 한 곳에서.',
    category: 'Marketing',
    icon: <CampaignIcon />,
    color: '#EA580C',
    defaultTasks: [
      { title: '캠페인 목표 및 KPI 설정', status: 'todo', priority: 'high' },
      { title: '타겟 오디언스 분석', status: 'todo' },
      { title: '콘텐츠 기획 및 제작', status: 'todo' },
      { title: '채널별 실행 계획', status: 'todo' },
      { title: '성과 분석 및 리포트', status: 'todo' },
    ],
  },
  {
    id: 'dev-feature',
    name: 'Feature Development',
    description: '새 기능 개발 프로세스. 설계-개발-테스트-배포.',
    category: 'Development',
    icon: <CodeIcon />,
    color: '#0891B2',
    defaultTasks: [
      { title: '기능 요구사항 정리', status: 'todo', priority: 'high' },
      { title: '기술 설계 문서 작성', status: 'todo', priority: 'high' },
      { title: '구현', status: 'todo' },
      { title: '코드 리뷰', status: 'todo' },
      { title: 'QA 테스트', status: 'todo' },
      { title: '배포 및 모니터링', status: 'todo' },
    ],
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: '데이터 분석 프로젝트. 수집-정제-분석-시각화.',
    category: 'Report',
    icon: <BarChartIcon />,
    color: '#DC2626',
    defaultTasks: [
      { title: '분석 목표 및 가설 수립', status: 'todo', priority: 'high' },
      { title: '데이터 수집 및 정제', status: 'todo' },
      { title: '탐색적 데이터 분석(EDA)', status: 'todo' },
      { title: '핵심 인사이트 도출', status: 'todo' },
      { title: '시각화 및 보고서 작성', status: 'todo' },
    ],
  },
];

// Category grouping
const CATEGORIES = [...new Set(PROJECT_TEMPLATES.map(t => t.category))];

interface ZeroStateDashboardProps {
  currentUserId: number;
}

const ZeroStateDashboard: React.FC<ZeroStateDashboardProps> = ({ currentUserId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [customName, setCustomName] = useState('');

  const createProjectMutation = useMutation({
    mutationFn: async (template: ProjectTemplate) => {
      const name = customName.trim() || template.name;
      // 1) Create project
      const project = await api.createProject({
        name,
        description: template.description,
        owner_id: currentUserId,
      });
      // 2) Create default tasks
      for (const task of template.defaultTasks) {
        await api.createTask({
          title: task.title,
          project_id: project.id,
          status: task.status as any,
          priority: (task.priority as any) || 'medium',
          assignee_ids: [],
        });
      }
      return project;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setSelectedTemplate(null);
      setCustomName('');
      navigate(`/project/${project.id}`);
    },
  });

  const handleUseTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setCustomName(template.name);
  };

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', mt: 2 }}>
      {/* Welcome Header */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <AssignmentIcon sx={{ fontSize: 48, color: '#2955FF', mb: 1.5, opacity: 0.8 }} />
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1D29', mb: 1 }}>
          시작하기
        </Typography>
        <Typography variant="body2" sx={{ color: '#6B7280', maxWidth: 420, mx: 'auto', lineHeight: 1.6 }}>
          템플릿을 선택해서 빠르게 시작하거나,
          사이드바에서 직접 프로젝트를 만들어보세요.
        </Typography>
      </Box>

      {/* Template Cards by Category */}
      {CATEGORIES.map(category => (
        <Box key={category} sx={{ mb: 3 }}>
          <Typography
            variant="overline"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: '#9CA3AF',
              letterSpacing: '0.1em',
              mb: 1.5,
              display: 'block',
              px: 0.5,
            }}
          >
            {category}
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
              gap: 2,
            }}
          >
            {PROJECT_TEMPLATES.filter(t => t.category === category).map(template => (
              <Paper
                key={template.id}
                onClick={() => handleUseTemplate(template)}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  border: '1px solid rgba(0,0,0,0.06)',
                  bgcolor: 'rgba(255,255,255,0.7)',
                  backdropFilter: 'blur(8px)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: `${template.color}50`,
                    boxShadow: `0 6px 20px ${template.color}15`,
                    transform: 'translateY(-2px)',
                  },
                }}
                elevation={0}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: `${template.color}12`,
                      color: template.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {React.cloneElement(template.icon as React.ReactElement, {
                      sx: { fontSize: 20 },
                    })}
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1A1D29' }}>
                      {template.name}
                    </Typography>
                  </Box>
                </Box>
                <Typography
                  variant="body2"
                  sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.5, mb: 1.5 }}
                >
                  {template.description}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Chip
                    label={`${template.defaultTasks.length} tasks`}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      bgcolor: '#F3F4F6',
                      color: '#6B7280',
                    }}
                  />
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      ))}

      {/* Template creation dialog */}
      <Dialog
        open={!!selectedTemplate}
        onClose={() => { setSelectedTemplate(null); setCustomName(''); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0 }}>
          프로젝트 만들기
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {selectedTemplate && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: `${selectedTemplate.color}12`,
                    color: selectedTemplate.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {React.cloneElement(selectedTemplate.icon as React.ReactElement, {
                    sx: { fontSize: 22 },
                  })}
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {selectedTemplate.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#6B7280' }}>
                    {selectedTemplate.defaultTasks.length}개 기본 Task 포함
                  </Typography>
                </Box>
              </Box>
              <TextField
                label="프로젝트 이름"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                fullWidth
                size="small"
                sx={{ mb: 1 }}
              />
              <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                {selectedTemplate.description}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setSelectedTemplate(null); setCustomName(''); }} sx={{ textTransform: 'none' }}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={() => selectedTemplate && createProjectMutation.mutate(selectedTemplate)}
            disabled={createProjectMutation.isPending}
            sx={{ textTransform: 'none', bgcolor: selectedTemplate?.color || '#2955FF' }}
          >
            {createProjectMutation.isPending ? '생성 중...' : '생성하기'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ZeroStateDashboard;
