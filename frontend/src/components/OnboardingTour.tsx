/**
 * OnboardingTour — Interactive guided walkthrough for template-created projects.
 *
 * Shows a detailed step-by-step guide highlighting each feature of the platform.
 * Covers: Board, Task Details, Work Notes, Weekly Progress, List, Calendar,
 *         Roadmap (with view switching), Messenger, and Graph (subproject creation).
 *
 * Design: Coach-mark overlay with manual navigation + auto-advance option.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Paper, Fade, LinearProgress, Chip } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface OnboardingStep {
  tabIndex: number;
  tabName: string;
  title: string;
  description: string;
  icon: string;
  tips?: string[];
}

const STEPS: OnboardingStep[] = [
  // ── Board Overview ──
  {
    tabIndex: 0, tabName: 'Board',
    title: 'Board - 칸반 보드',
    description: 'Task를 To Do → In Progress → Done으로 드래그하여 상태를 관리하세요.',
    icon: '📋',
    tips: [
      'Task를 드래그하면 상태가 자동으로 변경됩니다',
      'Hold 컬럼으로 보류 처리도 가능합니다',
    ],
  },
  // ── Board: Progress-based auto-move ──
  {
    tabIndex: 0, tabName: 'Board',
    title: 'Board - 작업노트와 자동 이동',
    description: '각 Task의 작업노트(체크리스트)를 체크하면 진행률이 자동 계산됩니다.',
    icon: '✅',
    tips: [
      '진행률 50% 이상 → "In Progress (50% 이상 진행)" 컬럼으로 자동 이동',
      '진행률 100% → Done 컬럼으로 자동 이동',
      'Board를 새로고침하지 않아도 즉시 반영됩니다',
    ],
  },
  // ── Board: Weekly Progress ──
  {
    tabIndex: 0, tabName: 'Board',
    title: 'Board - 주차별 진척사항',
    description: '보드 우상단의 "주차별 진척사항" 버튼을 클릭하면 주차 단위 진행 현황을 확인할 수 있습니다.',
    icon: '📈',
    tips: [
      '이번 달 주차별로 Task 진행률을 한눈에 파악',
      '각 Task에 비고(remarks)를 메모할 수 있습니다',
    ],
  },
  // ── Task Details ──
  {
    tabIndex: 0, tabName: 'Board',
    title: 'Task 상세 정보',
    description: 'Board나 List에서 Task를 클릭하면 상세 패널이 열립니다. Task에는 다양한 속성을 설정할 수 있습니다.',
    icon: '📝',
    tips: [
      'Status: To Do / In Progress / Done / Hold',
      'Priority: High / Medium / Low',
      'Sub Project: Graph에서 생성한 하위 프로젝트에 연결',
      'Schedule: 시작일 ~ 마감일 설정',
      'Assignees: 프로젝트 멤버 중 담당자 지정',
    ],
  },
  // ── Task Details (continued) ──
  {
    tabIndex: 0, tabName: 'Board',
    title: 'Task - 작업노트 / 설명 / 첨부',
    description: 'Task 상세에서 작업노트, 설명, 첨부파일 등을 관리할 수 있습니다.',
    icon: '📎',
    tips: [
      '작업노트: 체크리스트 + 메모를 등록하면 진행률이 자동 계산됩니다',
      'Description: Task에 대한 상세 설명을 작성',
      'URL 첨부: 참고 링크를 추가',
      '파일 첨부: PDF, PPT, 이미지 등 업로드 가능',
    ],
  },
  // ── List View ──
  {
    tabIndex: 1, tabName: 'List',
    title: 'List - 테이블 뷰',
    description: 'Task를 테이블 형태로 한눈에 확인하고, 정렬/필터링으로 원하는 작업을 빠르게 찾을 수 있습니다.',
    icon: '📊',
    tips: [
      '컬럼 헤더를 클릭하면 정렬할 수 있습니다',
      'status/priority별 필터링도 가능합니다',
    ],
  },
  // ── Calendar ──
  {
    tabIndex: 2, tabName: 'Calendar',
    title: 'Calendar - 달력 뷰',
    description: '마감일 기반으로 Task를 달력에서 확인하세요.',
    icon: '📅',
    tips: [
      '날짜를 클릭하면 해당 일의 Task 목록을 볼 수 있습니다',
      '일정이 밀집된 날짜를 한눈에 파악할 수 있습니다',
    ],
  },
  // ── Roadmap Overview ──
  {
    tabIndex: 3, tabName: 'Roadmap',
    title: 'Roadmap - 타임라인',
    description: 'Task의 시작일~마감일을 타임라인으로 시각화합니다. 프로젝트 전체 일정을 파악하기 좋습니다.',
    icon: '🗺️',
    tips: [
      'Week / Month / Quarter 버튼으로 보기 단위를 전환하세요',
      '"완료된 항목 숨기기"로 진행 중인 항목에 집중할 수 있습니다',
      '프로젝트/서브프로젝트별 진행률이 자동 계산됩니다',
    ],
  },
  // ── Messenger ──
  {
    tabIndex: 4, tabName: 'Messenger',
    title: 'Messenger - 팀 협업',
    description: '프로젝트 담당자들과 실시간 대화를 나눠보세요.',
    icon: '💬',
    tips: [
      '@이름으로 팀원에게 멘션 알림을 보낼 수 있습니다',
      '멘션된 메시지는 "@나를 언급" 페이지에서 모아 볼 수 있습니다',
      '간단한 업무 공유나 질문에 활용하세요',
    ],
  },
  // ── Graph ──
  {
    tabIndex: 5, tabName: 'Graph',
    title: 'Graph - 구조 편집',
    description: 'Task 간의 관계를 네트워크 그래프로 시각화하고, Sub Project를 관리합니다.',
    icon: '🔗',
    tips: [
      'Sub Project는 여기서만 생성할 수 있습니다 (좌측 패널 "서브프로젝트 추가")',
      'Task를 Sub Project 노드로 드래그하면 하위에 연결됩니다',
      '프로젝트 → 서브프로젝트 → Task 구조를 시각적으로 편집하세요',
    ],
  },
];

const STEP_DURATION = 5000; // ms per step (longer for reading detailed tips)

interface OnboardingTourProps {
  onComplete: () => void;
  onTabChange: (tabIndex: number) => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, onTabChange }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  // Auto-advance timer (pauses when user interacts)
  useEffect(() => {
    if (!isActive || autoPaused) return;

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
  }, [currentStep, isActive, autoPaused]);

  // Sync tab when step changes while paused
  useEffect(() => {
    if (autoPaused) {
      onTabChange(step.tabIndex);
    }
  }, [currentStep, autoPaused]);

  const handleComplete = useCallback(() => {
    setIsActive(false);
    onTabChange(0); // Return to Board
    onComplete();
  }, [onComplete, onTabChange]);

  const handleDisablePermanently = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('plan-a-onboarding-disabled', '1');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange]);

  const handleNext = () => {
    setAutoPaused(true); // User took control
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    setAutoPaused(true);
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
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
          maxWidth: 520,
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
          {/* Progress bar */}
          <LinearProgress
            variant="determinate"
            value={autoPaused
              ? ((currentStep + 1) / totalSteps) * 100
              : ((currentStep + progress / 100) / totalSteps) * 100
            }
            sx={{
              height: 3,
              borderRadius: 2,
              mb: 2,
              bgcolor: '#E5E7EB',
              '& .MuiLinearProgress-bar': {
                bgcolor: '#2955FF',
                borderRadius: 2,
                transition: autoPaused ? 'transform 0.3s ease' : 'transform 0.05s linear',
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
              <Typography variant="body2" sx={{ fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.5, mb: step.tips ? 1 : 0 }}>
                {step.description}
              </Typography>

              {/* Tips */}
              {step.tips && step.tips.length > 0 && (
                <Box sx={{
                  bgcolor: '#F8FAFC', borderRadius: 1.5, p: 1.2,
                  border: '1px solid #E5E7EB',
                }}>
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

          {/* Actions */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                size="small"
                onClick={handleSkip}
                sx={{ textTransform: 'none', color: '#9CA3AF', fontSize: '0.72rem', fontWeight: 600, minWidth: 0 }}
              >
                닫기
              </Button>
              <Button
                size="small"
                onClick={handleDisablePermanently}
                sx={{ textTransform: 'none', color: '#D1D5DB', fontSize: '0.65rem', fontWeight: 500, minWidth: 0 }}
              >
                다시 보지 않기
              </Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {currentStep > 0 && (
                <Button
                  size="small"
                  onClick={handlePrev}
                  startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
                  sx={{
                    textTransform: 'none', fontSize: '0.72rem', fontWeight: 600,
                    color: '#6B7280', minWidth: 0,
                  }}
                >
                  이전
                </Button>
              )}
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
          </Box>
        </Paper>
      </Box>
    </Fade>
  );
};

export default OnboardingTour;
