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
import SavingsIcon from '@mui/icons-material/Savings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';

// ── Date helpers for template seed data ──
function relativeDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ── Template data types ──
export interface TemplateActivity {
  content: string;
  block_type: 'checkbox' | 'text';
  checked?: boolean;
}

export interface TemplateTask {
  title: string;
  description?: string;
  status: string;
  priority?: string;
  start_date?: string;
  due_date?: string;
  progress?: number;
  subproject?: string; // name of subproject this task belongs to
  activities?: TemplateActivity[]; // work notes / checklists
}

export interface TemplateSubProject {
  name: string;
  description?: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  color: string;
  defaultTasks: TemplateTask[];
  subProjects?: TemplateSubProject[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'pm-sprint',
    name: 'PM Sprint',
    description: '2주 단위 스프린트 관리. 백로그, 스프린트 플래닝, 회고까지.',
    category: 'PM',
    icon: <SprintIcon />,
    color: '#2955FF',
    subProjects: [
      { name: 'Sprint 1', description: '첫 번째 스프린트 (2주)' },
      { name: 'Sprint 2', description: '두 번째 스프린트 (2주)' },
    ],
    defaultTasks: [
      {
        title: '스프린트 목표 정의',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-10), due_date: relativeDate(-8),
        subproject: 'Sprint 1',
        activities: [
          { content: 'OKR 기반 스프린트 목표 수립', block_type: 'checkbox', checked: true },
          { content: '팀원 목표 공유 및 합의', block_type: 'checkbox', checked: true },
          { content: '스프린트 목표가 명확하게 정의되었습니다.', block_type: 'text' },
        ],
      },
      {
        title: '백로그 정리 및 우선순위 설정',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-9), due_date: relativeDate(-7),
        subproject: 'Sprint 1',
        activities: [
          { content: '유저 스토리 작성', block_type: 'checkbox', checked: true },
          { content: '스토리 포인트 추정', block_type: 'checkbox', checked: true },
          { content: '우선순위 정렬 (MoSCoW)', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '데일리 스탠드업 진행',
        status: 'in_progress', progress: 60,
        start_date: relativeDate(-7), due_date: relativeDate(7),
        subproject: 'Sprint 1',
        activities: [
          { content: '매일 15분 스탠드업 운영 중', block_type: 'text' },
          { content: '어제 한 일 / 오늘 할 일 / 블로커 공유', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '스프린트 리뷰 준비',
        status: 'todo', priority: 'medium',
        due_date: relativeDate(12),
        subproject: 'Sprint 1',
        activities: [
          { content: '데모 시나리오 작성', block_type: 'checkbox', checked: false },
          { content: '이해관계자 초대 발송', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '회고(Retrospective) 진행',
        status: 'todo',
        due_date: relativeDate(14),
        subproject: 'Sprint 1',
      },
      {
        title: 'Sprint 2 백로그 구성',
        status: 'todo', priority: 'high',
        start_date: relativeDate(14), due_date: relativeDate(16),
        subproject: 'Sprint 2',
      },
      {
        title: 'Sprint 2 개발 진행',
        status: 'todo',
        start_date: relativeDate(16), due_date: relativeDate(30),
        subproject: 'Sprint 2',
      },
    ],
  },
  {
    id: 'side-project',
    name: 'Side Project Launch',
    description: '사이드 프로젝트의 기획부터 런칭까지 한눈에.',
    category: 'Development',
    icon: <RocketLaunchIcon />,
    color: '#7C3AED',
    subProjects: [
      { name: '기획', description: '아이디어 검증 및 요구사항 정리' },
      { name: '개발', description: 'MVP 구현 및 테스트' },
      { name: '런칭', description: '배포 및 마케팅' },
    ],
    defaultTasks: [
      {
        title: '아이디어 검증 / 리서치',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-14), due_date: relativeDate(-10),
        subproject: '기획',
        activities: [
          { content: '경쟁 서비스 3개 분석 완료', block_type: 'checkbox', checked: true },
          { content: '타겟 사용자 인터뷰 5명', block_type: 'checkbox', checked: true },
          { content: '시장 규모 및 가능성 확인됨', block_type: 'text' },
        ],
      },
      {
        title: 'MVP 기능 정의',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-10), due_date: relativeDate(-7),
        subproject: '기획',
        activities: [
          { content: '핵심 기능 3가지 확정', block_type: 'checkbox', checked: true },
          { content: '화면 흐름도(Flow) 작성', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '디자인 프로토타입',
        status: 'in_progress', progress: 70,
        start_date: relativeDate(-7), due_date: relativeDate(3),
        subproject: '기획',
        activities: [
          { content: '와이어프레임 완성', block_type: 'checkbox', checked: true },
          { content: '디자인 시스템 구성', block_type: 'checkbox', checked: true },
          { content: '고해상도 목업 작업 중', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '개발 환경 셋업',
        status: 'done', progress: 100,
        start_date: relativeDate(-5), due_date: relativeDate(-3),
        subproject: '개발',
        activities: [
          { content: 'Repo 생성 및 CI/CD 설정', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: 'MVP 개발',
        status: 'in_progress', progress: 30,
        start_date: relativeDate(-3), due_date: relativeDate(20),
        subproject: '개발',
        activities: [
          { content: 'API 서버 기본 구조 완성', block_type: 'checkbox', checked: true },
          { content: '프론트엔드 라우팅 설정', block_type: 'checkbox', checked: true },
          { content: '핵심 기능 구현', block_type: 'checkbox', checked: false },
          { content: '인증/인가 구현', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '베타 테스트',
        status: 'todo',
        start_date: relativeDate(20), due_date: relativeDate(30),
        subproject: '런칭',
      },
      {
        title: '런칭 준비',
        status: 'todo',
        start_date: relativeDate(28), due_date: relativeDate(35),
        subproject: '런칭',
        activities: [
          { content: '랜딩 페이지 제작', block_type: 'checkbox', checked: false },
          { content: 'SNS 공유 콘텐츠 준비', block_type: 'checkbox', checked: false },
        ],
      },
    ],
  },
  {
    id: 'weekly-report',
    name: 'Weekly Report',
    description: '주간 업무 보고 루틴. 매주 반복하는 업무를 체계적으로.',
    category: 'Report',
    icon: <CalendarMonthIcon />,
    color: '#059669',
    subProjects: [
      { name: '이번 주', description: '현재 주차 업무' },
      { name: '다음 주', description: '다음 주 예정 업무' },
    ],
    defaultTasks: [
      {
        title: '지난 주 성과 정리',
        status: 'done', progress: 100,
        due_date: relativeDate(-2),
        subproject: '이번 주',
        activities: [
          { content: '완료 항목 10건 정리', block_type: 'checkbox', checked: true },
          { content: '주간 KPI 달성율: 85%', block_type: 'text' },
        ],
      },
      {
        title: '이번 주 핵심 목표 설정',
        status: 'in_progress', priority: 'high', progress: 50,
        start_date: relativeDate(-1), due_date: relativeDate(4),
        subproject: '이번 주',
        activities: [
          { content: '목표 1: 신규 기능 배포', block_type: 'checkbox', checked: true },
          { content: '목표 2: 코드 리뷰 완료', block_type: 'checkbox', checked: false },
          { content: '목표 3: 문서 업데이트', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '이슈/리스크 체크',
        status: 'in_progress', progress: 40,
        due_date: relativeDate(3),
        subproject: '이번 주',
      },
      {
        title: '주간 보고서 작성',
        status: 'todo',
        due_date: relativeDate(5),
        subproject: '이번 주',
      },
      {
        title: '다음 주 플래닝',
        status: 'todo',
        start_date: relativeDate(4), due_date: relativeDate(7),
        subproject: '다음 주',
      },
    ],
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign',
    description: '마케팅 캠페인 기획, 실행, 성과 분석을 한 곳에서.',
    category: 'Marketing',
    icon: <CampaignIcon />,
    color: '#EA580C',
    subProjects: [
      { name: '기획', description: '캠페인 전략 수립' },
      { name: '실행', description: '콘텐츠 제작 및 집행' },
      { name: '분석', description: '성과 측정 및 리포팅' },
    ],
    defaultTasks: [
      {
        title: '캠페인 목표 및 KPI 설정',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-14), due_date: relativeDate(-10),
        subproject: '기획',
        activities: [
          { content: 'CTR 목표: 3.5% 이상', block_type: 'checkbox', checked: true },
          { content: '전환율 목표: 1.2%', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '타겟 오디언스 분석',
        status: 'done', progress: 100,
        start_date: relativeDate(-12), due_date: relativeDate(-8),
        subproject: '기획',
        activities: [
          { content: '페르소나 3개 정의 완료', block_type: 'text' },
        ],
      },
      {
        title: '콘텐츠 기획 및 제작',
        status: 'in_progress', progress: 55,
        start_date: relativeDate(-5), due_date: relativeDate(10),
        subproject: '실행',
        activities: [
          { content: '카피라이팅 초안 완성', block_type: 'checkbox', checked: true },
          { content: '디자인 에셋 제작', block_type: 'checkbox', checked: true },
          { content: '영상 촬영 및 편집', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '채널별 실행 계획',
        status: 'todo',
        start_date: relativeDate(5), due_date: relativeDate(15),
        subproject: '실행',
      },
      {
        title: '성과 분석 및 리포트',
        status: 'todo',
        start_date: relativeDate(20), due_date: relativeDate(30),
        subproject: '분석',
      },
    ],
  },
  {
    id: 'dev-feature',
    name: 'Feature Development',
    description: '새 기능 개발 프로세스. 설계-개발-테스트-배포.',
    category: 'Development',
    icon: <CodeIcon />,
    color: '#0891B2',
    subProjects: [
      { name: '설계', description: '요구사항 및 기술 설계' },
      { name: '구현', description: '코딩 및 코드 리뷰' },
      { name: '품질', description: 'QA 및 배포' },
    ],
    defaultTasks: [
      {
        title: '기능 요구사항 정리',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-10), due_date: relativeDate(-7),
        subproject: '설계',
        activities: [
          { content: 'PRD 문서 작성 완료', block_type: 'checkbox', checked: true },
          { content: '이해관계자 리뷰 완료', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '기술 설계 문서 작성',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-7), due_date: relativeDate(-4),
        subproject: '설계',
        activities: [
          { content: 'API 스펙 정의', block_type: 'checkbox', checked: true },
          { content: 'DB 스키마 설계', block_type: 'checkbox', checked: true },
          { content: '아키텍처 다이어그램 작성', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '구현',
        status: 'in_progress', progress: 45,
        start_date: relativeDate(-4), due_date: relativeDate(10),
        subproject: '구현',
        activities: [
          { content: 'Backend API 개발', block_type: 'checkbox', checked: true },
          { content: 'Frontend UI 개발', block_type: 'checkbox', checked: false },
          { content: '연동 테스트', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '코드 리뷰',
        status: 'todo',
        start_date: relativeDate(10), due_date: relativeDate(13),
        subproject: '구현',
      },
      {
        title: 'QA 테스트',
        status: 'todo',
        start_date: relativeDate(13), due_date: relativeDate(18),
        subproject: '품질',
        activities: [
          { content: '테스트 케이스 작성', block_type: 'checkbox', checked: false },
          { content: '버그 리포트 정리', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '배포 및 모니터링',
        status: 'todo',
        start_date: relativeDate(18), due_date: relativeDate(20),
        subproject: '품질',
      },
    ],
  },
  {
    id: 'cost-reduction',
    name: '원가절감 Item',
    description: '원가절감 과제 관리. 발굴-검증-실행-효과확인까지 체계적으로.',
    category: 'Development',
    icon: <SavingsIcon />,
    color: '#0D9488',
    subProjects: [
      { name: '과제 발굴', description: '절감 아이템 발굴 및 선정' },
      { name: '검증/분석', description: '타당성 검토 및 비용 분석' },
      { name: '실행/적용', description: '개선 실행 및 모니터링' },
    ],
    defaultTasks: [
      {
        title: '현행 원가 구조 분석',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-21), due_date: relativeDate(-14),
        subproject: '과제 발굴',
        activities: [
          { content: '부품별 원가 비중 분석 완료', block_type: 'checkbox', checked: true },
          { content: '상위 10개 원가 항목 식별', block_type: 'checkbox', checked: true },
          { content: '전체 BOM 원가 중 상위 30% 항목이 총 원가의 78%를 차지함', block_type: 'text' },
        ],
      },
      {
        title: '절감 아이템 후보 리스트업',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-14), due_date: relativeDate(-10),
        subproject: '과제 발굴',
        activities: [
          { content: '대체 소재 검토 (3건)', block_type: 'checkbox', checked: true },
          { content: '공정 개선 아이디어 (5건)', block_type: 'checkbox', checked: true },
          { content: '물류비 절감 방안 (2건)', block_type: 'checkbox', checked: true },
          { content: '총 10건의 절감 후보 아이템 선정 완료', block_type: 'text' },
        ],
      },
      {
        title: '대체 소재 타당성 검토',
        status: 'in_progress', progress: 60,
        start_date: relativeDate(-10), due_date: relativeDate(5),
        subproject: '검증/분석',
        activities: [
          { content: '신규 소재 샘플 입수', block_type: 'checkbox', checked: true },
          { content: '품질 테스트 진행', block_type: 'checkbox', checked: true },
          { content: '내구성 테스트 결과 대기 중', block_type: 'checkbox', checked: false },
          { content: '현재 소재 대비 15% 원가 절감 기대', block_type: 'text' },
        ],
      },
      {
        title: '공정 개선 비용/효과 분석',
        status: 'in_progress', progress: 35,
        start_date: relativeDate(-5), due_date: relativeDate(10),
        subproject: '검증/분석',
        activities: [
          { content: '현행 공정 시간 측정', block_type: 'checkbox', checked: true },
          { content: '개선 공정 시뮬레이션', block_type: 'checkbox', checked: false },
          { content: '투자비 대비 ROI 산출', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '협력사 견적 비교',
        status: 'todo',
        start_date: relativeDate(5), due_date: relativeDate(15),
        subproject: '검증/분석',
        activities: [
          { content: 'A사 견적 요청', block_type: 'checkbox', checked: false },
          { content: 'B사 견적 요청', block_type: 'checkbox', checked: false },
          { content: '비교표 작성', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '1차 적용 및 양산 테스트',
        status: 'todo',
        start_date: relativeDate(15), due_date: relativeDate(35),
        subproject: '실행/적용',
      },
      {
        title: '절감 효과 측정 및 보고',
        status: 'todo',
        start_date: relativeDate(35), due_date: relativeDate(45),
        subproject: '실행/적용',
        activities: [
          { content: '절감 금액 집계', block_type: 'checkbox', checked: false },
          { content: '경영진 보고서 작성', block_type: 'checkbox', checked: false },
        ],
      },
    ],
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: '데이터 분석 프로젝트. 수집-정제-분석-시각화.',
    category: 'Report',
    icon: <BarChartIcon />,
    color: '#DC2626',
    subProjects: [
      { name: '데이터 준비', description: '수집 및 정제' },
      { name: '분석 및 시각화', description: '인사이트 도출' },
    ],
    defaultTasks: [
      {
        title: '분석 목표 및 가설 수립',
        status: 'done', priority: 'high', progress: 100,
        start_date: relativeDate(-10), due_date: relativeDate(-7),
        subproject: '데이터 준비',
        activities: [
          { content: '분석 목표: 이탈율 감소 요인 파악', block_type: 'text' },
          { content: '가설 3개 수립', block_type: 'checkbox', checked: true },
        ],
      },
      {
        title: '데이터 수집 및 정제',
        status: 'in_progress', progress: 55,
        start_date: relativeDate(-7), due_date: relativeDate(3),
        subproject: '데이터 준비',
        activities: [
          { content: 'DB 데이터 추출', block_type: 'checkbox', checked: true },
          { content: '결측치 처리', block_type: 'checkbox', checked: true },
          { content: '이상치 제거 진행 중', block_type: 'checkbox', checked: false },
        ],
      },
      {
        title: '탐색적 데이터 분석(EDA)',
        status: 'todo',
        start_date: relativeDate(3), due_date: relativeDate(10),
        subproject: '분석 및 시각화',
      },
      {
        title: '핵심 인사이트 도출',
        status: 'todo',
        start_date: relativeDate(10), due_date: relativeDate(15),
        subproject: '분석 및 시각화',
      },
      {
        title: '시각화 및 보고서 작성',
        status: 'todo',
        start_date: relativeDate(15), due_date: relativeDate(20),
        subproject: '분석 및 시각화',
      },
    ],
  },
];

// Category grouping
const CATEGORIES = [...new Set(PROJECT_TEMPLATES.map(t => t.category))];

interface ZeroStateDashboardProps {
  currentUserId: number;
}

/**
 * Shared template creation logic — creates project, subprojects, tasks, and activities.
 * Used by both ZeroStateDashboard and TemplateLibraryDialog.
 */
export async function createProjectFromTemplate(
  template: ProjectTemplate,
  projectName: string,
  currentUserId: number,
  spaceId?: number | null,
): Promise<{ id: number; name: string }> {
  // 1) Create project (with space_id if available)
  const project = await api.createProject({
    name: projectName,
    description: template.description,
    owner_id: currentUserId,
    space_id: spaceId || undefined,
  });

  // 2) Create subprojects and build name→id map
  const subProjectMap = new Map<string, number>();
  if (template.subProjects) {
    for (const sp of template.subProjects) {
      const created = await api.createSubProject(project.id, {
        name: sp.name,
        description: sp.description,
      });
      subProjectMap.set(sp.name, created.id);
    }
  }

  // 3) Create tasks with dates, progress, subproject assignment
  for (const task of template.defaultTasks) {
    const created = await api.createTask({
      title: task.title,
      description: task.description,
      project_id: project.id,
      status: task.status as any,
      priority: (task.priority as any) || 'medium',
      assignee_ids: [],
      start_date: task.start_date || undefined,
      due_date: task.due_date || undefined,
      progress: task.progress || 0,
      sub_project_id: task.subproject ? (subProjectMap.get(task.subproject) || undefined) : undefined,
    });

    // 4) Create work note activities
    if (task.activities && task.activities.length > 0) {
      for (const act of task.activities) {
        await api.createTaskActivity(created.id, {
          content: act.content,
          block_type: act.block_type,
          checked: act.checked ?? false,
        });
      }
    }
  }

  return project;
}

const ZeroStateDashboard: React.FC<ZeroStateDashboardProps> = ({ currentUserId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const spaceSlug = useAppStore(state => state.currentSpaceSlug);
  const currentSpaceId = useAppStore(state => state.currentSpaceId);
  const sp = (path: string) => spaceSlug ? `/space/${spaceSlug}${path}` : path;
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [customName, setCustomName] = useState('');

  const createProjectMutation = useMutation({
    mutationFn: async (template: ProjectTemplate) => {
      const name = customName.trim() || template.name;
      return createProjectFromTemplate(template, name, currentUserId, currentSpaceId);
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setSelectedTemplate(null);
      setCustomName('');
      // Navigate with onboarding flag for first-time template projects
      navigate(sp(`/project/${project.id}?onboarding=1`));
    },
  });

  const handleUseTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setCustomName(template.name);
  };

  const taskSummary = (template: ProjectTemplate) => {
    const total = template.defaultTasks.length;
    const subs = template.subProjects?.length || 0;
    const notes = template.defaultTasks.reduce((n, t) => n + (t.activities?.length || 0), 0);
    const parts: string[] = [`${total} tasks`];
    if (subs > 0) parts.push(`${subs} sub`);
    if (notes > 0) parts.push(`${notes} notes`);
    return parts.join(' · ');
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
              fontWeight: 700, fontSize: '0.7rem', color: '#9CA3AF',
              letterSpacing: '0.1em', mb: 1.5, display: 'block', px: 0.5,
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
                  p: 2.5, borderRadius: 3,
                  border: '1px solid rgba(0,0,0,0.06)',
                  bgcolor: 'rgba(255,255,255,0.7)',
                  backdropFilter: 'blur(8px)',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: `${template.color}50`,
                    boxShadow: `0 6px 20px ${template.color}15`,
                    transform: 'translateY(-2px)',
                  },
                }}
                elevation={0}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box sx={{
                    width: 36, height: 36, borderRadius: 2,
                    bgcolor: `${template.color}12`, color: template.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {React.cloneElement(template.icon as React.ReactElement, { sx: { fontSize: 20 } })}
                  </Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1A1D29' }}>
                    {template.name}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.5, mb: 1.5 }}>
                  {template.description}
                </Typography>
                <Chip
                  label={taskSummary(template)}
                  size="small"
                  sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: '#F3F4F6', color: '#6B7280' }}
                />
              </Paper>
            ))}
          </Box>
        </Box>
      ))}

      {/* Template creation dialog */}
      <Dialog open={!!selectedTemplate} onClose={() => { setSelectedTemplate(null); setCustomName(''); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0 }}>프로젝트 만들기</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {selectedTemplate && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 2,
                  bgcolor: `${selectedTemplate.color}12`, color: selectedTemplate.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {React.cloneElement(selectedTemplate.icon as React.ReactElement, { sx: { fontSize: 22 } })}
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedTemplate.name}</Typography>
                  <Typography variant="caption" sx={{ color: '#6B7280' }}>
                    {taskSummary(selectedTemplate)}
                  </Typography>
                </Box>
              </Box>
              <TextField
                label="프로젝트 이름" value={customName}
                onChange={e => setCustomName(e.target.value)} fullWidth size="small" sx={{ mb: 1 }}
              />
              <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '0.7rem' }}>
                {selectedTemplate.description}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setSelectedTemplate(null); setCustomName(''); }} sx={{ textTransform: 'none' }}>취소</Button>
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
