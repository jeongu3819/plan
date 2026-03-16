/**
 * OnboardingTour — Lightweight guided walkthrough for template-created projects.
 *
 * Shows an auto-advancing spotlight overlay that highlights each tab in ProjectPage,
 * explaining what each view does. Users can skip at any time.
 *
 * Design choice: Coach-mark overlay with timed auto-advance.
 * Why: Safest for the current architecture — no route changes, no forced navigation,
 *      no state manipulation. Just a visual overlay on the current page.
 * How to disable: Remove the `?onboarding=1` URL param check, or set
 *      sessionStorage['plan-a-onboarding-done'] = '1'.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Paper, Fade, LinearProgress, Chip } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

interface OnboardingStep {
  tabIndex: number;
  tabName: string;
  title: string;
  description: string;
  icon: string;
}

const STEPS: OnboardingStep[] = [
  {
    tabIndex: 0, tabName: 'Board',
    title: 'Board',
    description: 'Task를 To Do → In Progress → Done으로 드래그하여 상태를 관리하세요. 진행률이 50%를 넘으면 다음 단계로 자동 이동됩니다.',
    icon: '📋',
  },
  {
    tabIndex: 1, tabName: 'List',
    title: 'List',
    description: 'Task를 테이블 형태로 한눈에 확인하고, 정렬/필터링으로 원하는 작업을 빠르게 찾을 수 있습니다.',
    icon: '📊',
  },
  {
    tabIndex: 2, tabName: 'Calendar',
    title: 'Calendar',
    description: '마감일 기반으로 Task를 달력에서 확인하세요. 날짜를 클릭하면 해당 일의 Task 목록을 볼 수 있습니다.',
    icon: '📅',
  },
  {
    tabIndex: 3, tabName: 'Roadmap',
    title: 'Roadmap',
    description: 'Task의 시작일~마감일을 타임라인으로 시각화합니다. 프로젝트 전체 일정을 파악하기 좋습니다.',
    icon: '🗺️',
  },
  {
    tabIndex: 4, tabName: 'Notes',
    title: '작업 노트',
    description: '프로젝트 관련 메모, 회의록, 아이디어를 자유롭게 기록하세요. @멘션으로 팀원에게 알림을 보낼 수 있습니다.',
    icon: '📝',
  },
  {
    tabIndex: 5, tabName: 'Graph',
    title: 'Graph',
    description: 'Task 간의 관계를 네트워크 그래프로 시각화합니다. 프로젝트 구조를 직관적으로 파악할 수 있습니다.',
    icon: '🔗',
  },
];

const STEP_DURATION = 2500; // ms per step

interface OnboardingTourProps {
  onComplete: () => void;
  onTabChange: (tabIndex: number) => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, onTabChange }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(true);

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  // Auto-advance timer
  useEffect(() => {
    if (!isActive) return;

    // Switch tab
    onTabChange(step.tabIndex);

    // Progress animation
    setProgress(0);
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + (100 / (STEP_DURATION / 50));
      });
    }, 50);

    // Auto-advance
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
  }, [currentStep, isActive]);

  const handleComplete = useCallback(() => {
    setIsActive(false);
    sessionStorage.setItem('plan-a-onboarding-done', '1');
    onTabChange(0); // Return to Board
    onComplete();
  }, [onComplete, onTabChange]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
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
          maxWidth: 480,
          width: '90%',
        }}
      >
        <Paper
          elevation={8}
          sx={{
            p: 2.5,
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(41, 85, 255, 0.15)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          }}
        >
          {/* Progress bar */}
          <LinearProgress
            variant="determinate"
            value={((currentStep + progress / 100) / totalSteps) * 100}
            sx={{
              height: 3,
              borderRadius: 2,
              mb: 2,
              bgcolor: '#E5E7EB',
              '& .MuiLinearProgress-bar': {
                bgcolor: '#2955FF',
                borderRadius: 2,
                transition: 'transform 0.05s linear',
              },
            }}
          />

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            {/* Step icon */}
            <Box sx={{
              fontSize: '1.8rem',
              lineHeight: 1,
              flexShrink: 0,
              mt: 0.3,
            }}>
              {step.icon}
            </Box>

            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D29' }}>
                  {step.title}
                </Typography>
                <Chip
                  label={`${currentStep + 1}/${totalSteps}`}
                  size="small"
                  sx={{
                    height: 16, fontSize: '0.55rem', fontWeight: 700,
                    bgcolor: '#EEF2FF', color: '#2955FF',
                  }}
                />
              </Box>
              <Typography variant="body2" sx={{ fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.5 }}>
                {step.description}
              </Typography>
            </Box>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Button
              size="small"
              onClick={handleSkip}
              startIcon={<SkipNextIcon sx={{ fontSize: 16 }} />}
              sx={{ textTransform: 'none', color: '#9CA3AF', fontSize: '0.75rem', fontWeight: 600 }}
            >
              건너뛰기
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleNext}
              endIcon={currentStep < totalSteps - 1 ? <ArrowForwardIcon sx={{ fontSize: 14 }} /> : <AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              sx={{
                textTransform: 'none', fontSize: '0.78rem', fontWeight: 700,
                bgcolor: '#2955FF', borderRadius: 2, px: 2,
              }}
            >
              {currentStep < totalSteps - 1 ? '다음' : '시작하기'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Fade>
  );
};

export default OnboardingTour;
