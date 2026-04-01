/**
 * OnboardingTour — Interactive guided walkthrough for template-created projects.
 *
 * Each step switches tabs AND triggers real UI actions:
 * - Opens Task Drawer, clicks Work Note, checks checkboxes
 * - Clicks Roadmap Week/Month/Quarter buttons, hide-done toggle
 * - Opens Graph subproject dialog
 * - Types @mention in Messenger
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
  highlightSelector?: string;
}

const clickEl = (attr: string) => {
  const el = document.querySelector(`[data-tour="${attr}"]`) as HTMLElement;
  if (el) el.click();
};

const highlightEl = (attr: string, on: boolean) => {
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
  // ── Board ──
  {
    tabIndex: 0,
    title: 'Board - 칸반 보드',
    description: 'Task를 드래그하여 To Do → In Progress → Done으로 상태를 변경하세요.',
    icon: '📋',
    action: 'closeDrawer',
  },
  // ── Task Drawer 열기 ──
  {
    tabIndex: 0,
    title: 'Task 상세 패널',
    description: 'Task를 클릭하면 상세 패널이 열립니다. 지금 열어볼게요!',
    icon: '📝',
    action: 'openFirstTask',
    highlightSelector: 'status-priority-section',
    tips: [
      'Sub Project: Graph에서 생성한 하위 프로젝트 연결',
      'Assignees / Schedule / Due Date / Description 설정 가능',
      'URL 첨부 / 파일 업로드 지원',
    ],
  },
  // ── Status 드롭다운 열기 ──
  {
    tabIndex: 0,
    title: 'Status 종류 확인',
    description: 'Status 필드를 열어 어떤 상태가 있는지 확인합니다.',
    icon: '🔵',
    action: 'openStatusDropdown',
    tips: [
      'To Do: 아직 시작하지 않은 작업',
      'In Progress: 진행 중인 작업',
      'Done: 완료된 작업',
      'Hold: 보류 중인 작업',
    ],
  },
  // ── Priority 드롭다운 열기 ──
  {
    tabIndex: 0,
    title: 'Priority 종류 확인',
    description: 'Priority 필드를 열어 우선순위 옵션을 확인합니다.',
    icon: '🔴',
    action: 'openPriorityDropdown',
    tips: [
      'High: 긴급 / 중요 작업',
      'Medium: 일반 작업 (기본값)',
      'Low: 낮은 우선순위',
    ],
  },
  // ── URL 첨부 시연 ──
  {
    tabIndex: 0,
    title: 'URL 첨부 방법',
    description: 'URL 첨부 "+" 버튼을 누르고, 주소와 이름을 입력한 뒤 Add를 누르면 첨부됩니다. 지금 해볼게요!',
    icon: '🔗',
    action: 'demoUrlAttach',
  },
  // ── Work Note 열기 ──
  {
    tabIndex: 0,
    title: '작업노트 열기',
    description: '작업노트 버튼을 눌러 체크리스트를 확인합니다. 지금 열어볼게요!',
    icon: '✅',
    action: 'openWorkNote',
    tips: [
      '체크리스트를 체크하면 진행률이 자동 계산됩니다',
      '진행률이 Board 컬럼 배치에 직접 반영됩니다',
    ],
  },
  // ── Work Note 체크 → 50% 시연 ──
  {
    tabIndex: 0,
    title: '체크박스 체크 → 50% 이상 진행',
    description: '체크박스 절반을 체크하여 진행률을 50% 이상으로 만들어 보겠습니다.',
    icon: '📊',
    action: 'checkHalfItems',
    tips: [
      '50% 이상 → Board "In Progress (50% 이상 진행)" 컬럼으로 자동 이동',
      '100% → Done 컬럼으로 자동 이동',
    ],
  },
  // ── Board 변화 확인 ──
  {
    tabIndex: 0,
    title: 'Board - 자동 이동 확인',
    description: '작업노트 체크 결과가 Board에 즉시 반영됩니다. "In Progress (50% 이상 진행)" 컬럼을 확인하세요!',
    icon: '🔄',
    action: 'closeAllAndShowBoard',
  },
  // ── 주차별 진척사항 ──
  {
    tabIndex: 0,
    title: '주차별 진척사항',
    description: '"주차별 진척사항" 버튼을 눌러 주차 단위 진행 현황을 봅니다. 지금 열어볼게요!',
    icon: '📈',
    action: 'showWeeklyProgress',
  },
  // ── Board 복귀 ──
  {
    tabIndex: 0,
    title: '보드로 복귀',
    description: '보드 뷰로 돌아왔습니다.',
    icon: '📋',
    action: 'backToBoard',
  },
  // ── List ──
  {
    tabIndex: 1,
    title: 'List - 테이블 뷰',
    description: '전체 Task를 테이블로 확인하세요. 컬럼 헤더를 클릭해 정렬할 수 있습니다.',
    icon: '📊',
  },
  // ── Calendar ──
  {
    tabIndex: 2,
    title: 'Calendar - 달력 뷰',
    description: '마감일 기준으로 Task를 달력에서 확인합니다.',
    icon: '📅',
  },
  // ── Roadmap: Week ──
  {
    tabIndex: 3,
    title: 'Roadmap - Week 보기',
    description: 'Roadmap의 Week 보기입니다. 주 단위 상세 일정을 확인하세요.',
    icon: '🗺️',
    action: 'roadmapWeek',
  },
  // ── Roadmap: Month ──
  {
    tabIndex: 3,
    title: 'Roadmap - Month 보기',
    description: 'Month 보기로 전환합니다. 월 단위 전체 일정을 파악할 수 있습니다.',
    icon: '🗺️',
    action: 'roadmapMonth',
  },
  // ── Roadmap: Quarter ──
  {
    tabIndex: 3,
    title: 'Roadmap - Quarter 보기',
    description: 'Quarter 보기로 전환합니다. 분기 단위 장기 일정에 적합합니다.',
    icon: '🗺️',
    action: 'roadmapQuarter',
  },
  // ── Roadmap: 완료 숨기기 ──
  {
    tabIndex: 3,
    title: 'Roadmap - 완료된 항목 숨기기',
    description: '"완료된 항목 숨기기" 버튼을 눌러봅니다. 진행 중인 항목에 집중할 수 있습니다.',
    icon: '👁️',
    action: 'roadmapToggleHideDone',
    highlightSelector: 'roadmap-hide-done',
  },
  // ── Messenger + @멘션 ──
  {
    tabIndex: 4,
    title: 'Messenger - @멘션 기능',
    description: '@이름으로 팀원을 멘션하면 왼쪽 사이드바 "@나를 언급" 페이지에서 확인할 수 있습니다.',
    icon: '💬',
    action: 'messengerMentionDemo',
    tips: [
      '"@개발자1" 처럼 입력하면 해당 멤버에게 알림',
      '멘션된 메시지는 "@나를 언급" 페이지에 모아서 표시',
    ],
  },
  // ── Graph: Sub Project 생성 (다이얼로그 열기 + 입력 + Create) ──
  {
    tabIndex: 5,
    title: 'Graph - Sub Project 생성',
    description: 'Sub Project 생성 버튼을 누르고, 이름/설명을 입력한 뒤 Create를 눌러 생성합니다. 지금 해볼게요!',
    icon: '🔗',
    action: 'graphCreateSubProject',
    highlightSelector: 'graph-add-subproject',
  },
  // ── Graph: Task를 Sub Project에 연결 (실제 API 호출) ──
  {
    tabIndex: 5,
    title: 'Graph - Task를 Sub Project에 연결',
    description: '첫 번째 Task를 방금 만든 Sub Project에 연결합니다. 그래프가 업데이트되는 것을 확인하세요!',
    icon: '🔗',
    action: 'graphAssignTaskToSubProject',
    tips: [
      '실제로는 Task 노드를 드래그하여 Sub Project 위에 놓으면 연결됩니다',
      'Task Details에서 Sub Project 드롭다운으로도 연결 가능',
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
  const [prevHighlight, setPrevHighlight] = useState<string | null>(null);

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  const executeStep = useCallback((stepIdx: number) => {
    const s = STEPS[stepIdx];
    if (prevHighlight) highlightEl(prevHighlight, false);

    onTabChange(s.tabIndex);

    if (s.action && onAction) {
      setTimeout(() => onAction(s.action!), 400);
    }

    if (s.highlightSelector) {
      setTimeout(() => {
        highlightEl(s.highlightSelector!, true);
        setPrevHighlight(s.highlightSelector!);
      }, 900);
    } else {
      setPrevHighlight(null);
    }
  }, [onTabChange, onAction, prevHighlight]);

  useEffect(() => {
    if (!isActive) return;
    executeStep(currentStep);
    if (autoPaused) return;

    setProgress(0);
    const pi = setInterval(() => {
      setProgress(prev => prev >= 100 ? 100 : prev + (100 / (STEP_DURATION / 50)));
    }, 50);
    const timer = setTimeout(() => {
      if (currentStep < totalSteps - 1) setCurrentStep(prev => prev + 1);
      else handleComplete();
    }, STEP_DURATION);

    return () => { clearTimeout(timer); clearInterval(pi); };
  }, [currentStep, isActive, autoPaused]);

  const cleanup = useCallback(() => {
    if (prevHighlight) highlightEl(prevHighlight, false);
  }, [prevHighlight]);

  const handleComplete = useCallback(() => {
    cleanup();
    setIsActive(false);
    if (onAction) onAction('closeAllAndShowBoard');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange, onAction, cleanup]);

  const handleDisable = useCallback(() => {
    cleanup();
    setIsActive(false);
    localStorage.setItem('plan-a-onboarding-disabled', '1');
    if (onAction) onAction('closeAllAndShowBoard');
    onTabChange(0);
    onComplete();
  }, [onComplete, onTabChange, onAction, cleanup]);

  const handleNext = () => {
    setAutoPaused(true);
    if (currentStep < totalSteps - 1) setCurrentStep(prev => prev + 1);
    else handleComplete();
  };

  const handlePrev = () => {
    setAutoPaused(true);
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  if (!isActive) return null;

  return (
    <Fade in={isActive}>
      <Box sx={{
        position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1300, maxWidth: 500, width: '92%',
      }}>
        <Paper elevation={8} sx={{
          p: 2.5, borderRadius: 3,
          bgcolor: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(41, 85, 255, 0.15)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
        }}>
          <LinearProgress variant="determinate"
            value={autoPaused ? ((currentStep + 1) / totalSteps) * 100 : ((currentStep + progress / 100) / totalSteps) * 100}
            sx={{
              height: 3, borderRadius: 2, mb: 2, bgcolor: '#E5E7EB',
              '& .MuiLinearProgress-bar': { bgcolor: '#2955FF', borderRadius: 2,
                transition: autoPaused ? 'transform 0.3s ease' : 'transform 0.05s linear' },
            }}
          />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ fontSize: '1.8rem', lineHeight: 1, flexShrink: 0, mt: 0.3 }}>{step.icon}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1A1D29' }}>
                  {step.title}
                </Typography>
                <Chip label={`${currentStep + 1}/${totalSteps}`} size="small"
                  sx={{ height: 16, fontSize: '0.55rem', fontWeight: 700, bgcolor: '#EEF2FF', color: '#2955FF' }} />
              </Box>
              <Typography variant="body2" sx={{ fontSize: '0.78rem', color: '#6B7280', lineHeight: 1.5, mb: step.tips ? 1 : 0 }}>
                {step.description}
              </Typography>
              {step.tips && (
                <Box sx={{ bgcolor: '#F8FAFC', borderRadius: 1.5, p: 1.2, border: '1px solid #E5E7EB' }}>
                  {step.tips.map((tip, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 0.8, alignItems: 'flex-start', mb: i < step.tips!.length - 1 ? 0.5 : 0 }}>
                      <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#2955FF', mt: 0.7, flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#4B5563', lineHeight: 1.5 }}>{tip}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button size="small" onClick={() => handleComplete()}
                sx={{ textTransform: 'none', color: '#9CA3AF', fontSize: '0.72rem', fontWeight: 600, minWidth: 0 }}>닫기</Button>
              <Button size="small" onClick={handleDisable}
                sx={{ textTransform: 'none', color: '#D1D5DB', fontSize: '0.65rem', fontWeight: 500, minWidth: 0 }}>다시 보지 않기</Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {currentStep > 0 && (
                <Button size="small" onClick={handlePrev} startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
                  sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', minWidth: 0 }}>이전</Button>
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
