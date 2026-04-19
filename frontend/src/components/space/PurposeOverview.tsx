import React from 'react';
import {
  Box, Typography, Paper, Chip, LinearProgress, Skeleton, alpha,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import DescriptionIcon from '@mui/icons-material/Description';
import type { SpacePurpose } from '../../types';

interface OverviewData {
  purpose: string;
  stats: {
    total_projects: number;
    total_tasks: number;
    my_tasks: number;
    todo: number;
    in_progress: number;
    done: number;
    hold: number;
    overdue: number;
  };
  overdue_tasks: any[];
  today_tasks: any[];
  high_priority_tasks: any[];
  in_progress_tasks: any[];
  week_done_count: number;
  next_week_tasks: any[];
  active_sheets: any[];
  recent_completed_sheets: any[];
  incomplete_carried_over?: any[];
  dev_in_progress?: any[];
  dev_done_recent?: any[];
}

interface Props {
  data: OverviewData | null;
  loading: boolean;
  purpose: SpacePurpose;
  onTaskClick?: (taskId: number, projectId: number) => void;
  onSheetClick?: (executionId: number) => void;
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center', borderColor: alpha(color, 0.3), minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.3 }}>
        {icon && <Box sx={{ color, display: 'flex', '& svg': { fontSize: 20 } }}>{icon}</Box>}
        <Typography variant="h4" fontWeight={800} sx={{ color }}>{value}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>{label}</Typography>
    </Paper>
  );
}

function TaskList({ title, tasks, color, icon, onTaskClick, emptyText }: {
  title: string; tasks: any[]; color: string; icon: React.ReactNode;
  onTaskClick?: (taskId: number, projectId: number) => void; emptyText?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: alpha(color, 0.2), display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <Box sx={{ color, display: 'flex', '& svg': { fontSize: 18 } }}>{icon}</Box>
        <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.85rem' }}>{title}</Typography>
        {tasks.length > 0 && (
          <Chip label={tasks.length} size="small" sx={{ height: 20, fontSize: '0.72rem', fontWeight: 700, bgcolor: alpha(color, 0.1), color }} />
        )}
      </Box>
      {tasks.length === 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{emptyText || '항목 없음'}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, flexGrow: 1 }}>
          {tasks.slice(0, 8).map((t: any) => (
            <Box
              key={t.id}
              onClick={() => onTaskClick?.(t.id, t.project_id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, py: 0.8, px: 1,
                borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: alpha(color, 0.05) },
              }}
            >
              <Box sx={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                bgcolor: t.priority === 'high' ? '#EF4444' : t.priority === 'medium' ? '#F59E0B' : '#6B7280',
              }} />
              <Typography variant="body2" sx={{ fontSize: '0.81rem', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </Typography>
              {t.due_date && (
                <Typography variant="caption" sx={{ fontSize: '0.72rem', color: '#9CA3AF', flexShrink: 0 }}>
                  {t.due_date}
                </Typography>
              )}
              {t.progress > 0 && (
                <Box sx={{ width: 45, flexShrink: 0 }}>
                  <LinearProgress
                    variant="determinate" value={t.progress}
                    sx={{ height: 4, borderRadius: 1.5, bgcolor: '#F3F4F6', '& .MuiLinearProgress-bar': { bgcolor: color } }}
                  />
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

function SheetList({ title, sheets, color, onSheetClick }: {
  title: string; sheets: any[]; color: string; onSheetClick?: (id: number) => void;
}) {
  if (sheets.length === 0) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: alpha(color, 0.2), display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <DescriptionIcon sx={{ fontSize: 18, color }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.85rem' }}>{title}</Typography>
        <Chip label={sheets.length} size="small" sx={{ height: 20, fontSize: '0.72rem', fontWeight: 700, bgcolor: alpha(color, 0.1), color }} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, flexGrow: 1 }}>
        {sheets.map((s: any) => (
          <Box
            key={s.id}
            onClick={() => onSheetClick?.(s.id)}
            sx={{
              display: 'flex', flexDirection: 'column', py: 0.8, px: 1,
              borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: alpha(color, 0.05) },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontSize: '0.81rem', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {s.title}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.72rem', color: '#9CA3AF', flexShrink: 0, minWidth: 26, textAlign: 'right' }}>
                {s.progress}%
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ fontSize: '0.72rem', color: '#6B7280', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                 {s.project_name ? `${s.project_name} > ` : ''}{s.task_name || ''}
              </Typography>
              {s.equipment_name && (
                <Chip label={s.equipment_name} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
              )}
            </Box>
            <Box sx={{ width: '100%', mt: 0.5 }}>
              <LinearProgress
                variant="determinate" value={s.progress}
                sx={{ height: 4, borderRadius: 2, bgcolor: '#F3F4F6', '& .MuiLinearProgress-bar': { bgcolor: s.progress >= 100 ? '#22C55E' : color } }}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

// ========================================
// 목적별 레이아웃
// ========================================

function ProjectManagementOverview({ data, onTaskClick, onSheetClick }: { data: OverviewData; onTaskClick?: Props['onTaskClick']; onSheetClick?: Props['onSheetClick'] }) {
  const s = data.stats;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}>
        <StatCard label="전체 Task" value={s.total_tasks} color="#374151" />
        <StatCard label="진행 중" value={s.in_progress} color="#2955FF" icon={<PlayCircleOutlineIcon />} />
        <StatCard label="완료" value={s.done} color="#22C55E" icon={<CheckCircleOutlineIcon />} />
        <StatCard label="할 일" value={s.todo} color="#6B7280" icon={<ScheduleIcon />} />
        <StatCard label="지연" value={s.overdue} color="#EF4444" icon={<WarningAmberIcon />} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        <TaskList title="우선순위 높은 Task" tasks={data.high_priority_tasks} color="#EF4444" icon={<PriorityHighIcon />} onTaskClick={onTaskClick} />
        <TaskList title="지연 항목" tasks={data.overdue_tasks} color="#F59E0B" icon={<WarningAmberIcon />} onTaskClick={onTaskClick} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        <TaskList title="이번 주 예정" tasks={data.next_week_tasks} color="#2955FF" icon={<ScheduleIcon />} onTaskClick={onTaskClick} emptyText="다음 주 예정 없음" />
        <Box>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">이번 주 완료</Typography>
            <Typography variant="h4" fontWeight={800} sx={{ color: '#22C55E' }}>{data.week_done_count}</Typography>
          </Paper>
        </Box>
      </Box>
      <SheetList title="진행 중인 Sheet" sheets={data.active_sheets} color="#7C3AED" onSheetClick={onSheetClick} />
    </Box>
  );
}

function EquipmentOpsOverview({ data, onTaskClick, onSheetClick }: { data: OverviewData; onTaskClick?: Props['onTaskClick']; onSheetClick?: Props['onSheetClick'] }) {
  const s = data.stats;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
        <StatCard label="오늘 작업" value={data.today_tasks.length} color="#2955FF" icon={<ScheduleIcon />} />
        <StatCard label="진행 중" value={s.in_progress} color="#F59E0B" icon={<PlayCircleOutlineIcon />} />
        <StatCard label="미완료/이월" value={(data.incomplete_carried_over || []).length} color="#EF4444" icon={<WarningAmberIcon />} />
        <StatCard label="진행 중 Sheet" value={data.active_sheets.length} color="#7C3AED" icon={<DescriptionIcon />} />
      </Box>
      <TaskList title="오늘 해야 할 작업" tasks={data.today_tasks} color="#2955FF" icon={<ScheduleIcon />} onTaskClick={onTaskClick} emptyText="오늘 마감 작업 없음" />
      
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1 }}>
        <Box>
          <SheetList title="Check Sheet 현황" sheets={data.active_sheets} color="#16A34A" onSheetClick={onSheetClick} />
        </Box>
        <Box>
          <TaskList title="미완료/이월 작업" tasks={data.incomplete_carried_over || []} color="#EF4444" icon={<WarningAmberIcon />} onTaskClick={onTaskClick} emptyText="미완료 작업 없음" />
        </Box>
        <Box>
          <TaskList title="우선순위 높은 항목" tasks={data.high_priority_tasks} color="#F59E0B" icon={<PriorityHighIcon />} onTaskClick={onTaskClick} emptyText="우선순위 항목 없음" />
        </Box>
      </Box>

      <SheetList title="최근 완료된 점검" sheets={data.recent_completed_sheets} color="#22C55E" onSheetClick={onSheetClick} />
    </Box>
  );
}

function ProcessChangeOverview({ data, onTaskClick, onSheetClick }: { data: OverviewData; onTaskClick?: Props['onTaskClick']; onSheetClick?: Props['onSheetClick'] }) {
  const s = data.stats;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
        <StatCard label="전체 항목" value={s.total_tasks} color="#374151" />
        <StatCard label="진행 중 변경" value={s.in_progress} color="#9333EA" icon={<PlayCircleOutlineIcon />} />
        <StatCard label="검토 필요" value={s.overdue} color="#EF4444" icon={<WarningAmberIcon />} />
        <StatCard label="완료" value={s.done} color="#22C55E" icon={<CheckCircleOutlineIcon />} />
      </Box>
      <TaskList title="진행 중인 변경" tasks={data.in_progress_tasks} color="#9333EA" icon={<PlayCircleOutlineIcon />} onTaskClick={onTaskClick} />
      <TaskList title="재검토 필요 (지연)" tasks={data.overdue_tasks} color="#EF4444" icon={<WarningAmberIcon />} onTaskClick={onTaskClick} emptyText="재검토 필요 항목 없음" />
      <SheetList title="관련 Sheet" sheets={data.active_sheets} color="#7C3AED" onSheetClick={onSheetClick} />
    </Box>
  );
}

function SwDevOverview({ data, onTaskClick, onSheetClick: _onSheetClick }: { data: OverviewData; onTaskClick?: Props['onTaskClick']; onSheetClick?: Props['onSheetClick'] }) {
  const s = data.stats;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}>
        <StatCard label="전체" value={s.total_tasks} color="#374151" />
        <StatCard label="개발 중" value={s.in_progress} color="#EA580C" icon={<PlayCircleOutlineIcon />} />
        <StatCard label="대기" value={s.todo} color="#6B7280" icon={<ScheduleIcon />} />
        <StatCard label="완료" value={s.done} color="#22C55E" icon={<CheckCircleOutlineIcon />} />
        <StatCard label="이번 주 완료" value={data.week_done_count} color="#2955FF" icon={<AssignmentTurnedInIcon />} />
      </Box>
      <TaskList title="현재 개발 중" tasks={data.dev_in_progress || data.in_progress_tasks} color="#EA580C" icon={<PlayCircleOutlineIcon />} onTaskClick={onTaskClick} />
      <TaskList title="다음 개발 우선순위" tasks={data.high_priority_tasks} color="#F59E0B" icon={<PriorityHighIcon />} onTaskClick={onTaskClick} emptyText="대기 항목 없음" />
      <TaskList title="최근 완료" tasks={data.dev_done_recent || []} color="#22C55E" icon={<CheckCircleOutlineIcon />} onTaskClick={onTaskClick} emptyText="최근 완료 없음" />
    </Box>
  );
}

function IntegratedOpsOverview({ data, onTaskClick, onSheetClick }: { data: OverviewData; onTaskClick?: Props['onTaskClick']; onSheetClick?: Props['onSheetClick'] }) {
  const s = data.stats;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}>
        <StatCard label="내 Task" value={s.my_tasks} color="#2955FF" />
        <StatCard label="진행 중" value={s.in_progress} color="#F59E0B" icon={<PlayCircleOutlineIcon />} />
        <StatCard label="오늘 마감" value={data.today_tasks.length} color="#0891B2" icon={<ScheduleIcon />} />
        <StatCard label="지연" value={s.overdue} color="#EF4444" icon={<WarningAmberIcon />} />
        <StatCard label="프로젝트" value={s.total_projects} color="#374151" />
      </Box>
      <TaskList title="오늘 할 일" tasks={data.today_tasks} color="#0891B2" icon={<ScheduleIcon />} onTaskClick={onTaskClick} emptyText="오늘 마감 업무 없음" />
      <TaskList title="진행 중 업무" tasks={data.in_progress_tasks} color="#F59E0B" icon={<PlayCircleOutlineIcon />} onTaskClick={onTaskClick} />
      <SheetList title="진행 중 Sheet" sheets={data.active_sheets} color="#7C3AED" onSheetClick={onSheetClick} />
      <TaskList title="핵심 이슈 (우선순위 높음)" tasks={data.high_priority_tasks} color="#EF4444" icon={<PriorityHighIcon />} onTaskClick={onTaskClick} />
    </Box>
  );
}

// ========================================
// 메인 PurposeOverview 컴포넌트
// ========================================

export default function PurposeOverview({ data, loading, purpose, onTaskClick, onSheetClick }: Props) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}>
          {[...Array(5)].map((_, i) => <Skeleton key={i} variant="rounded" height={70} />)}
        </Box>
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={160} />
      </Box>
    );
  }

  if (!data) return null;

  const overviewMap: Record<string, React.ReactNode> = {
    project_management: <ProjectManagementOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
    equipment_ops: <EquipmentOpsOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
    process_change: <ProcessChangeOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
    sw_dev: <SwDevOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
    integrated_ops: <IntegratedOpsOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
    custom: <IntegratedOpsOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
  };

  return (
    <Box sx={{ mt: 1 }}>
      {overviewMap[purpose] || overviewMap.project_management}
    </Box>
  );
}
