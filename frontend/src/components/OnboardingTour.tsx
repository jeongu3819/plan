/**
 * OnboardingTour — Interactive guided walkthrough for template-created projects.
 *
 * Each step switches tabs AND triggers real UI actions (open task drawer,
 * switch roadmap view, etc.) so users see the actual feature in action.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Paper, Fade, LinearProgress, Chip } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface OnboardingStep {
  tabIndex: number;
  title: string;
  description: string;
  icon: string;
  action?: string;  // Action to trigger on entering this step
  tips?: string[];
}

const STEPS: OnboardingStep[] = [
  {
    tabIndex: 0,
    title: 'Board - 칸반 보드',
    description: 'Task를 드래그하여 To Do → In Progress → Done으로 상태를 변경하세요.',
    icon: '📋',
    action: 'closeDrawer',
    tips: [
      '작업노트 체크 진행률 50% 이상 → "In Progress (50% 이상)" 자동 이동',
      '진행률 100% → Done으로 자동 이동',
    ],
  },
  {
    tabIndex: 0,
    title: 'Task 상세 정보',
    description: 'Task를 클릭하면 상세 패널이 열립니다. 지금 열어볼게요!',
    icon: '📝',
    action: 'openFirstTask',
    tips: [
      'Status: To Do / In Progress / Done / Hold',
      'Priority: High / Medium / Low',
      'Sub Project: Graph 탭에서 생성한 하위 프로젝트 연결',
      'Assignees: 멤버 중 담당자 지정',
      'Schedule: 시작일 ~ 마감일 설정',
    ],
  },
  {
    tabIndex: 0,
    title: 'Task - 작업노트 / 첨부',
    description: '상세 패널에서 작업노트, 설명, 첨부파일을 확인하세요.',
    icon: '📎',
    tips: [
      '작업노트: 체크리스트 체크 → 진행률 자동 계산 → Board 컬럼 이동',
      'Description: 상세 설명 작성',
      'URL / 파일 첨부: 참고자료 링크 및 파일 업로드',
    ],
  },
  {
    tabIndex: 0,
    title: '주차별 진척사항',
    description: '보드 우상단 "주차별 진척사항" 버튼을 확인하세요. 주차 단위 진행 현황을 볼 수 있습니다.',
    icon: '📈',
    action: 'closeDrawer',
  },
  {
    tabIndex: 1,
    title: 'List - 테이블 뷰',
    description: '전체 Task를 테이블로 확인하세요. 컬럼 헤더를 클릭해 정렬할 수 있습니다.',
    icon: '📊',
  },
  {
    tabIndex: 2,
    title: 'Calendar - 달력 뷰',
    description: '마감일 기준으로 Task를 달력에서 확인하세요. 날짜를 클릭하면 해당 일의 Task를 볼 수 있습니다.',
    icon: '📅',
  },
  {
    tabIndex: 3,
    title: 'Roadmap - 타임라인',
    description: 'Task의 시작일~마감일을 타임라인으로 봅니다. Week/Month/Quarter 버튼으로 보기를 전환해보세요.',
    icon: '🗺️',
    tips: [
      '"완료된 항목 숨기기"로 진행 중인 항목에 집중',
      'Week / Month / Quarter 전환 가능',
    ],
  },
  {
    tabIndex: 4,
    title: 'Messenger - 팀 협업',
    description: '프로젝트 팀원과 실시간 대화를 나눌 수 있습니다. @이름으로 멘션 알림을 보내세요.',
    icon: '💬',
  },
  {
    tabIndex: 5,
    title: 'Graph - 구조 편집',
    description: 'Sub Project를 생성하고 Task를 드래그하여 연결하세요. 좌측 패널에서 "서브프로젝트 추가"를 확인하세요.',
    icon: '🔗',
    tips: [
      'Sub Project는 여기서만 생성 가능 (좌측 패널)',
      'Task를 Sub Project 노드로 드래그하여 연결',
    ],
  },
];

const STEP_DURATION = 5000;

export interface OnboardingTourProps {
  onComplete: () => void;
  onTabChange: (tabIndex: number) => void;
  onAction?: (action: string) => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, onTabChange, onAction }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  // Execute step action + switch tab
  const executeStep = useCallback((stepIdx: number) => {
    const s = STEPS[stepIdx];
    onTabChange(s.tabIndex);
    if (s.action && onAction) {
      setTimeout(() => onAction(s.action!), 300); // slight delay for tab to render
    }
  }, [onTabChange, onAction]);

  // Auto-advance timer
  useEffect(() => {
    if (!isActive) return;

    executeStep(currentStep);

    if (autoPaused) return;

    setProgress(0);
    const progressInterval = setInterval(() => {
      setProgress(prev => prev >= 100 ? 100 : prev + (100 / (STEP_DURATION / 50)));
    }, 50);

    const timer = setTimeout(() => {
      if (currentStep < totalSteps - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        handleComplete();
      }
    }, STEP_DURATION);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [currentStep, isActive, autoPaused]);

  const handleComplete = useCallback(() => {
    setIsActive(false);
    if (onAction) onAction('closeDrawer');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange, onAction]);

  const handleDisablePermanently = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('plan-a-onboarding-disabled', '1');
    if (onAction) onAction('closeDrawer');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange, onAction]);

  const handleNext = () => {
    setAutoPaused(true);
    if (currentStep < totalSteps - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      executeStep(next);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    setAutoPaused(true);
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      executeStep(prev);
    }
  };

  if (!isActive) return null;

  return (
    <Fade in={isActive}>
      <Box
        sx={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1300,
          maxWidth: 500,
          width: '92%',
        }}
      >
        <Paper
          elevation={8}
          sx={{
            p: 2.5,
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(41, 85, 255, 0.15)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          }}
        >
          <LinearProgress
            variant="determinate"
            value={autoPaused
              ? ((currentStep + 1) / totalSteps) * 100
              : ((currentStep + progress / 100) / totalSteps) * 100
            }
            sx={{
              height: 3, borderRadius: 2, mb: 2, bgcolor: '#E5E7EB',
              '& .MuiLinearProgress-bar': {
                bgcolor: '#2955FF', borderRadius: 2,
                transition: autoPaused ? 'transform 0.3s ease' : 'transform 0.05s linear',
              },
            }}
          />

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0, mt: 0.3 }}>
              {step.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D29' }}>
                  {step.title}
                </Typography>
                <Chip
                  label={`${currentStep + 1}/${totalSteps}`}
                  size="small"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#EEF2FF', color: '#2955FF' }}
                />
              </Box>
              <Typography variant="body2" sx={{ fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.5, mb: step.tips ? 1 : 0 }}>
                {step.description}
              </Typography>
              {step.tips && step.tips.length > 0 && (
                <Box sx={{ bgcolor: '#F8FAFC', borderRadius: 1.5, p: 1.2, border: '1px solid #E5E7EB' }}>
                  {step.tips.map((tip, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-start', mb: i < step.tips!.length - 1 ? 0.5 : 0 }}>
                      <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#2955FF', mt: 0.7, flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#4B5563', lineHeight: 1.5 }}>
                        {tip}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button size="small" onClick={() => handleComplete()}
                sx={{ textTransform: 'none', color: '#9CA3AF', fontSize: '0.72rem', fontWeight: 600, minWidth: 0 }}>
                닫기
              </Button>
              <Button size="small" onClick={handleDisablePermanently}
                sx={{ textTransform: 'none', color: '#D1D5DB', fontSize: '0.65rem', fontWeight: 500, minWidth: 0 }}>
                다시 보지 않기
              </Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {currentStep > 0 && (
                <Button size="small" onClick={handlePrev}
                  startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
                  sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', minWidth: 0 }}>
                  이전
                </Button>
              )}
              <Button size="small" variant="contained" onClick={handleNext}
                endIcon={currentStep < totalSteps - 1 ? <ArrowForwardIcon sx={{ fontSize: 14 }} /> : <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                sx={{ textTransform: 'none', fontSize: '0.78rem', fontWeight: 700, bgcolor: '#2955FF', borderRadius: 2, px: 2 }}>
                {currentStep < totalSteps - 1 ? '다음' : '시작하기'}
              </Button>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Fade>
  );
};

export default OnboardingTour;
