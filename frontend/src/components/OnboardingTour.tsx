/**
 * OnboardingTour — Interactive guided walkthrough for template-created projects.
 *
 * Each step switches tabs AND triggers real UI actions:
 * - Opens Task Drawer, clicks Work Note button, highlights sections
 * - Clicks "주차별 진척사항" button
 * - Switches Roadmap views
 *
 * Uses data-tour attributes on target elements for programmatic clicks.
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
  action?: string;
  tips?: string[];
  highlightSelector?: string;  // data-tour selector to highlight
}

/** Click a DOM element by data-tour attribute */
const clickTourElement = (attr: string) => {
  const el = document.querySelector(`[data-tour="${attr}"]`) as HTMLElement;
  if (el) el.click();
};

/** Add/remove pulsing highlight to a DOM element */
const highlightElement = (attr: string, on: boolean) => {
  const el = document.querySelector(`[data-tour="${attr}"]`) as HTMLElement;
  if (!el) return;
  if (on) {
    el.style.outline = '3px solid #2955FF';
    el.style.outlineOffset = '4px';
    el.style.borderRadius = '8px';
    el.style.transition = 'outline 0.3s ease';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }
};

const STEPS: OnboardingStep[] = [
  // 1. Board 개요
  {
    tabIndex: 0,
    title: 'Board - 칸반 보드',
    description: 'Task를 드래그하여 상태를 변경하세요. 각 컬럼이 상태를 나타냅니다.',
    icon: '📋',
    action: 'closeDrawer',
  },
  // 2. Task 열기 → Status & Priority 보여주기
  {
    tabIndex: 0,
    title: 'Task 상세 - Status & Priority',
    description: 'Task를 클릭하면 상세 패널이 열립니다. Status와 Priority를 확인하세요.',
    icon: '📝',
    action: 'openFirstTask',
    highlightSelector: 'status-priority-section',
    tips: [
      'Status: To Do / In Progress / Done / Hold',
      'Priority: High / Medium / Low',
    ],
  },
  // 3. 작업노트 버튼 강조 + 클릭
  {
    tabIndex: 0,
    title: 'Task 상세 - 작업노트',
    description: '작업노트 버튼을 눌러 체크리스트를 확인하세요. 지금 열어볼게요!',
    icon: '✅',
    action: 'openWorkNote',
    tips: [
      '체크리스트를 체크하면 진행률이 자동으로 계산됩니다',
      '진행률이 Board 컬럼 배치에 직접 반영됩니다',
    ],
  },
  // 4. 작업노트 체크 → 50% 시연
  {
    tabIndex: 0,
    title: '작업노트 체크 → 진행률 자동 반영',
    description: '체크박스를 체크하면 진행률이 올라갑니다. 50% 이상이면 Board에서 "In Progress (50% 이상 진행)" 컬럼으로 자동 이동됩니다.',
    icon: '📊',
    action: 'checkWorkNoteItems',
    tips: [
      '0% → To Do 컬럼',
      '1~49% → In Progress 컬럼',
      '50% 이상 → In Progress (50% 이상 진행) 컬럼',
      '100% → Done 컬럼',
    ],
  },
  // 5. Board로 돌아와서 변경된 결과 확인
  {
    tabIndex: 0,
    title: 'Board - 자동 이동 확인',
    description: '작업노트 체크 결과가 Board에 바로 반영됩니다. 진행률에 따라 Task가 적절한 컬럼에 위치합니다.',
    icon: '🔄',
    action: 'closeAllAndShowBoard',
  },
  // 6. 주차별 진척사항
  {
    tabIndex: 0,
    title: '주차별 진척사항',
    description: '"주차별 진척사항" 버튼을 눌러 주차 단위 진행 현황을 확인합니다. 지금 열어볼게요!',
    icon: '📈',
    action: 'showWeeklyProgress',
  },
  // 7. Board로 복귀
  {
    tabIndex: 0,
    title: '보드로 돌아가기',
    description: '보드 뷰로 돌아왔습니다. 이어서 다른 뷰를 살펴보겠습니다.',
    icon: '📋',
    action: 'backToBoard',
  },
  // 8. List
  {
    tabIndex: 1,
    title: 'List - 테이블 뷰',
    description: '전체 Task를 테이블로 확인하세요. 컬럼 헤더를 클릭해 정렬할 수 있습니다.',
    icon: '📊',
  },
  // 9. Calendar
  {
    tabIndex: 2,
    title: 'Calendar - 달력 뷰',
    description: '마감일 기준으로 Task를 달력에서 확인합니다.',
    icon: '📅',
  },
  // 10. Roadmap
  {
    tabIndex: 3,
    title: 'Roadmap - 타임라인',
    description: 'Week / Month / Quarter 버튼으로 보기 단위를 전환하세요. "완료된 항목 숨기기"도 가능합니다.',
    icon: '🗺️',
    tips: [
      'Week: 주 단위 상세 일정',
      'Month: 월 단위 전체 일정',
      'Quarter: 분기 단위 장기 일정',
    ],
  },
  // 11. Messenger
  {
    tabIndex: 4,
    title: 'Messenger - 팀 협업',
    description: '@이름으로 팀원에게 멘션 알림을 보내세요. "@나를 언급" 페이지에서 모아 볼 수 있습니다.',
    icon: '💬',
  },
  // 12. Graph
  {
    tabIndex: 5,
    title: 'Graph - Sub Project 관리',
    description: 'Sub Project를 생성하고 Task를 드래그하여 연결하세요. 좌측 패널의 "서브프로젝트 추가"를 확인하세요.',
    icon: '🔗',
    tips: [
      'Sub Project는 여기서만 생성 가능',
      'Task 노드를 Sub Project 노드로 드래그하면 연결됩니다',
    ],
  },
];

const STEP_DURATION = 5500;

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
  const [prevHighlight, setPrevHighlight] = useState<string | null>(null);

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  const executeStep = useCallback((stepIdx: number) => {
    const s = STEPS[stepIdx];

    // Clear previous highlight
    if (prevHighlight) highlightElement(prevHighlight, false);

    // Switch tab
    onTabChange(s.tabIndex);

    // Execute action after tab renders
    if (s.action && onAction) {
      setTimeout(() => onAction(s.action!), 400);
    }

    // Highlight target element
    if (s.highlightSelector) {
      setTimeout(() => {
        highlightElement(s.highlightSelector!, true);
        setPrevHighlight(s.highlightSelector!);
      }, 800);
    } else {
      setPrevHighlight(null);
    }
  }, [onTabChange, onAction, prevHighlight]);

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
    if (prevHighlight) highlightElement(prevHighlight, false);
    setIsActive(false);
    if (onAction) onAction('closeAllAndShowBoard');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange, onAction, prevHighlight]);

  const handleDisablePermanently = useCallback(() => {
    if (prevHighlight) highlightElement(prevHighlight, false);
    setIsActive(false);
    localStorage.setItem('plan-a-onboarding-disabled', '1');
    if (onAction) onAction('closeAllAndShowBoard');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange, onAction, prevHighlight]);

  const handleNext = () => {
    setAutoPaused(true);
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
            p: 2.5, borderRadius: 3,
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
