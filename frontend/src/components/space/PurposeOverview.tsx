import React from 'react';
import {
  Box, Typography, Paper, Chip, LinearProgress, Skeleton, alpha, Tooltip,
  Switch, FormControlLabel, IconButton, Collapse,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { SpacePurpose } from '../../types';

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return d.toISOString().slice(0, 10);
}

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
  // v3.11: 100% 인데 status="in_progress" 인 시트 — "완료된 항목 숨기기 OFF" 시 표시
  near_completed_sheets?: any[];
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
  visibleWidgets?: string[];
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2, textAlign: 'center', borderColor: alpha(color, 0.3), minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.6, mb: 0.4 }}>
        {icon && <Box sx={{ color, display: 'flex', '& svg': { fontSize: 24 } }}>{icon}</Box>}
        <Typography variant="h3" fontWeight={800} sx={{ color, fontSize: '2rem', lineHeight: 1.1 }}>{value}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.88rem', fontWeight: 600 }}>{label}</Typography>
    </Paper>
  );
}

export function TaskList({ title, tasks, color, icon, onTaskClick, emptyText }: {
  title: string; tasks: any[]; color: string; icon: React.ReactNode;
  onTaskClick?: (taskId: number, projectId: number) => void; emptyText?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2, borderColor: alpha(color, 0.2), display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1.75 }}>
        <Box sx={{ color, display: 'flex', '& svg': { fontSize: 22 } }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem' }}>{title}</Typography>
        {tasks.length > 0 && (
          <Chip label={tasks.length} size="small" sx={{ height: 22, fontSize: '0.8rem', fontWeight: 700, bgcolor: alpha(color, 0.1), color }} />
        )}
      </Box>
      {tasks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.88rem' }}>{emptyText || '항목 없음'}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.9, flexGrow: 1 }}>
          {tasks.slice(0, 8).map((t: any) => (
            <Box
              key={t.id}
              onClick={() => onTaskClick?.(t.id, t.project_id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, py: 0.9, px: 1,
                borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: alpha(color, 0.05) },
              }}
            >
              <Box sx={{
                width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                bgcolor: t.priority === 'high' ? '#EF4444' : t.priority === 'medium' ? '#F59E0B' : '#6B7280',
              }} />
              <Typography variant="body1" sx={{ fontSize: '0.92rem', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                {t.title}
              </Typography>
              {t.due_date && (
                <Typography variant="caption" sx={{ fontSize: '0.8rem', color: '#9CA3AF', flexShrink: 0 }}>
                  {t.due_date}
                </Typography>
              )}
              {t.progress > 0 && (
                <Box sx={{ width: 50, flexShrink: 0 }}>
                  <LinearProgress
                    variant="determinate" value={t.progress}
                    sx={{ height: 5, borderRadius: 1.5, bgcolor: '#F3F4F6', '& .MuiLinearProgress-bar': { bgcolor: color } }}
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

export function SheetList({ title, sheets, color, onSheetClick, emptyText, hideIfEmpty }: {
  title: string; sheets: any[]; color: string; onSheetClick?: (id: number) => void;
  emptyText?: string; hideIfEmpty?: boolean;
}) {
  if (sheets.length === 0 && hideIfEmpty) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 2, borderColor: alpha(color, 0.2), display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1.75 }}>
        <DescriptionIcon sx={{ fontSize: 22, color }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem' }}>{title}</Typography>
        {sheets.length > 0 && (
          <Chip label={sheets.length} size="small" sx={{ height: 22, fontSize: '0.8rem', fontWeight: 700, bgcolor: alpha(color, 0.1), color }} />
        )}
      </Box>
      {sheets.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.88rem' }}>{emptyText || '진행 중인 체크시트가 없습니다'}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1 }}>
          {sheets.map((s: any) => {
            const isDone = s.progress >= 100 || s.status === 'completed';
            const lastTs = s.completed_at || s.started_at;
            return (
              <Box
                key={s.id}
                onClick={() => onSheetClick?.(s.id)}
                sx={{
                  display: 'flex', flexDirection: 'column', gap: 0.6, py: 0.9, px: 1.1,
                  borderRadius: 1.5, cursor: 'pointer',
                  border: `1px solid ${alpha(color, 0.12)}`,
                  bgcolor: alpha(color, 0.02),
                  '&:hover': { bgcolor: alpha(color, 0.06), borderColor: alpha(color, 0.3) },
                  transition: 'all 0.15s',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body1" sx={{ fontSize: '0.92rem', flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {s.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.82rem', fontWeight: 700,
                      color: isDone ? '#16A34A' : color,
                      flexShrink: 0, minWidth: 34, textAlign: 'right',
                    }}
                  >
                    {s.progress}%
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  {s.project_name ? (
                    <Tooltip title={`프로젝트: ${s.project_name}`} placement="top">
                      <Chip
                        icon={<FolderIcon sx={{ fontSize: '0.85rem !important' }} />}
                        label={s.project_name}
                        size="small"
                        sx={{
                          height: 22, fontSize: '0.76rem', fontWeight: 600,
                          bgcolor: alpha('#2955FF', 0.08), color: '#2955FF',
                          maxWidth: 160,
                          '& .MuiChip-label': { px: 0.7, overflow: 'hidden', textOverflow: 'ellipsis' },
                          '& .MuiChip-icon': { color: '#2955FF', ml: 0.4 },
                        }}
                      />
                    </Tooltip>
                  ) : (
                    <Chip label="프로젝트 미연결" size="small"
                      sx={{ height: 22, fontSize: '0.74rem', bgcolor: '#F3F4F6', color: '#9CA3AF' }} />
                  )}
                  {s.task_name && (
                    <Tooltip title={`태스크: ${s.task_name}`} placement="top">
                      <Chip
                        icon={<AssignmentOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />}
                        label={s.task_name}
                        size="small"
                        sx={{
                          height: 22, fontSize: '0.76rem', fontWeight: 600,
                          bgcolor: alpha('#7C3AED', 0.08), color: '#7C3AED',
                          maxWidth: 180,
                          '& .MuiChip-label': { px: 0.7, overflow: 'hidden', textOverflow: 'ellipsis' },
                          '& .MuiChip-icon': { color: '#7C3AED', ml: 0.4 },
                        }}
                      />
                    </Tooltip>
                  )}
                  {s.equipment_name && (
                    <Chip label={s.equipment_name} size="small"
                      sx={{ height: 22, fontSize: '0.74rem' }} />
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                  <LinearProgress
                    variant="determinate" value={Math.min(s.progress || 0, 100)}
                    sx={{
                      flexGrow: 1, height: 6, borderRadius: 3, bgcolor: '#F3F4F6',
                      '& .MuiLinearProgress-bar': { bgcolor: isDone ? '#22C55E' : color, borderRadius: 3 },
                    }}
                  />
                  {lastTs && (
                    <Typography variant="caption" sx={{ fontSize: '0.74rem', color: '#9CA3AF', flexShrink: 0 }}>
                      {formatRelativeTime(lastTs)}
                    </Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}

// v3.9: Project 단위 grouping 으로 묶어서 보여주는 Check Sheet 현황 카드.
//   - 완료된 항목 숨기기 토글 (기본 ON: progress<100 만 표시)
//   - Project 별 active/completed 카운트 + 평균 진행률 + expand/collapse
//   - 각 group 은 5개까지 자연스럽게 보이고 그 이상은 내부 세로 스크롤로 확인 가능
export function ProjectGroupedSheetList({
  title,
  activeSheets,
  nearCompletedSheets,
  completedSheets,
  color,
  onSheetClick,
  emptyText,
  flat,
}: {
  title: string;
  activeSheets: any[];
  // v3.11: 100% 도달했지만 아직 status="in_progress" 인 시트
  nearCompletedSheets?: any[];
  completedSheets?: any[];
  color: string;
  onSheetClick?: (id: number) => void;
  emptyText?: string;
  /** flat: 외곽 Paper/패딩 제거 — Dashboard 위젯 안에 배치될 때 박스-인-박스 회피용 */
  flat?: boolean;
}) {
  const [hideCompleted, setHideCompleted] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  // 표시 대상 시트:
  //   - 완료 숨기기 ON: active(progress<100) 만
  //   - 완료 숨기기 OFF: active + near_completed(100%/in_progress) + recent_completed
  //     "진행 중 Sheet" 카드 카운트는 active_sheets.length 그대로 사용하므로 분리되어 있음.
  const displaySheets = React.useMemo(() => {
    if (hideCompleted) return activeSheets;
    const seen = new Set<number>();
    const merged: any[] = [];
    for (const s of [...activeSheets, ...(nearCompletedSheets || []), ...(completedSheets || [])]) {
      if (s && !seen.has(s.id)) { seen.add(s.id); merged.push(s); }
    }
    return merged;
  }, [activeSheets, nearCompletedSheets, completedSheets, hideCompleted]);

  // project_id 기준 grouping (null 은 "프로젝트 미연결" 한 그룹)
  const groups = React.useMemo(() => {
    const map = new Map<string, { key: string; projectId: number | null; projectName: string; sheets: any[] }>();
    for (const s of displaySheets) {
      const pid = s.project_id ?? null;
      const key = pid === null ? 'none' : `p-${pid}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          projectId: pid,
          projectName: s.project_name || '프로젝트 미연결',
          sheets: [],
        });
      }
      map.get(key)!.sheets.push(s);
    }
    // 각 group 내부: 진행 중 먼저, 진행률 높은 순
    const arr = Array.from(map.values());
    for (const g of arr) {
      g.sheets.sort((a, b) => {
        const aDone = (a.progress ?? 0) >= 100 || a.status === 'completed' ? 1 : 0;
        const bDone = (b.progress ?? 0) >= 100 || b.status === 'completed' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (b.progress ?? 0) - (a.progress ?? 0);
      });
    }
    // 그룹 정렬: 진행 중 시트가 많은 group 우선, 미연결은 항상 끝
    arr.sort((a, b) => {
      if (a.projectId === null && b.projectId !== null) return 1;
      if (a.projectId !== null && b.projectId === null) return -1;
      const aActive = a.sheets.filter(s => (s.progress ?? 0) < 100 && s.status === 'in_progress').length;
      const bActive = b.sheets.filter(s => (s.progress ?? 0) < 100 && s.status === 'in_progress').length;
      return bActive - aActive;
    });
    return arr;
  }, [displaySheets]);

  const computeGroupStats = React.useCallback((sheets: any[]) => {
    const active = sheets.filter(s => (s.progress ?? 0) < 100 && s.status === 'in_progress').length;
    const completed = sheets.filter(s => (s.progress ?? 0) >= 100 || s.status === 'completed').length;
    const sumProgress = sheets.reduce((acc, s) => acc + Math.min(100, s.progress ?? 0), 0);
    const avg = sheets.length === 0 ? 0 : Math.round(sumProgress / sheets.length);
    return { active, completed, avg };
  }, []);

  const totalActive = activeSheets.length;
  const totalCompleted = completedSheets?.length || 0;

  const Wrapper: React.ElementType = flat ? Box : Paper;
  const wrapperSx = flat
    ? { p: 0, display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'transparent' }
    : { p: 1.75, borderRadius: 2, borderColor: alpha(color, 0.2), display: 'flex', flexDirection: 'column', height: '100%' };
  const wrapperProps = flat ? {} : { variant: 'outlined' as const };

  return (
    <Wrapper {...wrapperProps} sx={wrapperSx}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 1.25, flexWrap: 'wrap' }}>
        <DescriptionIcon sx={{ fontSize: 22, color }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '1rem' }}>{title}</Typography>
        <Chip label={`진행 중 ${totalActive}`} size="small" sx={{ height: 22, fontSize: '0.74rem', fontWeight: 700, bgcolor: alpha(color, 0.1), color }} />
        {totalCompleted > 0 && (
          <Chip label={`완료 ${totalCompleted}`} size="small" sx={{ height: 22, fontSize: '0.74rem', fontWeight: 600, bgcolor: alpha('#22C55E', 0.1), color: '#16A34A' }} />
        )}
        <Box sx={{ flexGrow: 1 }} />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
            />
          }
          label={<Typography variant="caption" sx={{ fontSize: '0.74rem', color: '#6B7280' }}>완료된 항목 숨기기</Typography>}
          sx={{ ml: 0, mr: 0 }}
        />
      </Box>

      {groups.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.88rem' }}>
          {emptyText || '진행 중인 체크시트가 없습니다'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, flexGrow: 1 }}>
          {groups.map((g) => {
            const stats = computeGroupStats(g.sheets);
            const isOpen = expanded[g.key] ?? false;
            // flat 모드(Dashboard widget 안): 외곽 SortableWidget Paper 가 이미 카드 역할을 하므로
            // group 단위 border/bg 를 제거해 박스-인-박스 회피. divider 만 얇게 남김.
            const groupBoxSx = flat
              ? {
                  borderBottom: `1px solid ${alpha(color, 0.1)}`,
                  bgcolor: 'transparent',
                  overflow: 'hidden' as const,
                  '&:last-child': { borderBottom: 'none' },
                }
              : {
                  border: `1px solid ${alpha(color, 0.15)}`,
                  borderRadius: 1.5,
                  bgcolor: alpha(color, 0.02),
                  overflow: 'hidden' as const,
                };
            return (
              <Box key={g.key} sx={groupBoxSx}>
                <Box
                  onClick={() => setExpanded((prev) => ({ ...prev, [g.key]: !isOpen }))}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1, py: 0.9, px: 1.1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha(color, 0.06) },
                    transition: 'background-color 0.15s',
                  }}
                >
                  <FolderIcon sx={{ fontSize: 18, color: g.projectId === null ? '#9CA3AF' : '#2955FF' }} />
                  <Typography variant="body1" sx={{ fontSize: '0.9rem', fontWeight: 700, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.projectName}
                  </Typography>
                  <Chip label={`진행 ${stats.active}`} size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700, bgcolor: alpha(color, 0.1), color }} />
                  {stats.completed > 0 && (
                    <Chip label={`완료 ${stats.completed}`} size="small" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: alpha('#22C55E', 0.1), color: '#16A34A' }} />
                  )}
                  <Box sx={{ width: 60, flexShrink: 0 }}>
                    <LinearProgress
                      variant="determinate"
                      value={stats.avg}
                      sx={{
                        height: 5, borderRadius: 2, bgcolor: '#F3F4F6',
                        '& .MuiLinearProgress-bar': { bgcolor: stats.avg >= 100 ? '#22C55E' : color, borderRadius: 2 },
                      }}
                    />
                  </Box>
                  <Typography variant="caption" sx={{ fontSize: '0.74rem', fontWeight: 700, color: stats.avg >= 100 ? '#16A34A' : color, minWidth: 28, textAlign: 'right' }}>
                    {stats.avg}%
                  </Typography>
                  <IconButton size="small" sx={{ p: 0.25 }} aria-label={isOpen ? '접기' : '펼치기'}>
                    {isOpen ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Box>
                <Collapse in={isOpen} unmountOnExit>
                  {/* v3.9: 5개까지 자연스럽게 보이고, 6개 이상이면 내부 세로 스크롤로 확인 가능
                      (대략 한 줄 ~52px → 5줄 = ~260px). drag-scroll 도 트랙패드/마우스 휠로 자연 동작. */}
                  <Box sx={{ maxHeight: 260, overflowY: 'auto', borderTop: `1px solid ${alpha(color, 0.1)}`, p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {g.sheets.map((s) => {
                      const isDone = (s.progress ?? 0) >= 100 || s.status === 'completed';
                      // flat 모드: 박스-인-박스 회피 위해 row 외곽 border + 흰 bg 제거.
                      const sheetRowSx = flat
                        ? {
                            display: 'flex', alignItems: 'center', gap: 1,
                            py: 0.6, px: 0.9, borderRadius: 1, cursor: 'pointer',
                            bgcolor: 'transparent',
                            '&:hover': { bgcolor: alpha(color, 0.06) },
                            transition: 'background-color 0.15s',
                          }
                        : {
                            display: 'flex', alignItems: 'center', gap: 1,
                            py: 0.6, px: 0.9, borderRadius: 1, cursor: 'pointer',
                            border: `1px solid ${alpha(color, 0.1)}`,
                            bgcolor: 'background.paper',
                            '&:hover': { bgcolor: alpha(color, 0.04), borderColor: alpha(color, 0.3) },
                            transition: 'all 0.15s',
                          };
                      return (
                        <Box
                          key={s.id}
                          onClick={() => onSheetClick?.(s.id)}
                          sx={sheetRowSx}
                        >
                          <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 600, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.title}
                          </Typography>
                          {s.task_name && (
                            <Tooltip title={`태스크: ${s.task_name}`} placement="top">
                              <Chip
                                icon={<AssignmentOutlinedIcon sx={{ fontSize: '0.78rem !important' }} />}
                                label={s.task_name}
                                size="small"
                                sx={{
                                  height: 18, fontSize: '0.68rem', fontWeight: 600,
                                  bgcolor: alpha('#7C3AED', 0.08), color: '#7C3AED',
                                  maxWidth: 140,
                                  '& .MuiChip-label': { px: 0.5, overflow: 'hidden', textOverflow: 'ellipsis' },
                                  '& .MuiChip-icon': { color: '#7C3AED', ml: 0.3 },
                                }}
                              />
                            </Tooltip>
                          )}
                          <Box sx={{ width: 50, flexShrink: 0 }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(s.progress ?? 0, 100)}
                              sx={{
                                height: 4, borderRadius: 2, bgcolor: '#F3F4F6',
                                '& .MuiLinearProgress-bar': { bgcolor: isDone ? '#22C55E' : color, borderRadius: 2 },
                              }}
                            />
                          </Box>
                          <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 700, color: isDone ? '#16A34A' : color, minWidth: 28, textAlign: 'right' }}>
                            {s.progress ?? 0}%
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}
    </Wrapper>
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
      {(data.active_sheets.length > 0 || (data.near_completed_sheets || []).length > 0 || data.recent_completed_sheets.length > 0) && (
        <ProjectGroupedSheetList
          title="Check Sheet 현황"
          activeSheets={data.active_sheets}
          nearCompletedSheets={data.near_completed_sheets}
          completedSheets={data.recent_completed_sheets}
          color="#7C3AED"
          onSheetClick={onSheetClick}
        />
      )}
    </Box>
  );
}

function EquipmentOpsOverview({ data, onTaskClick, onSheetClick, visibleWidgets = [] }: { data: OverviewData; onTaskClick?: Props['onTaskClick']; onSheetClick?: Props['onSheetClick']; visibleWidgets?: string[] }) {
  const s = data.stats;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
        <StatCard label="오늘 작업" value={data.today_tasks.length} color="#2955FF" icon={<ScheduleIcon />} />
        <StatCard label="진행 중" value={s.in_progress} color="#F59E0B" icon={<PlayCircleOutlineIcon />} />
        <StatCard label="미완료/이월" value={(data.incomplete_carried_over || []).length} color="#EF4444" icon={<WarningAmberIcon />} />
        <StatCard label="진행 중 Sheet" value={data.active_sheets.length} color="#7C3AED" icon={<DescriptionIcon />} />
      </Box>
      {visibleWidgets.includes('today_tasks') && (
        <TaskList title="오늘 해야 할 작업" tasks={data.today_tasks} color="#2955FF" icon={<ScheduleIcon />} onTaskClick={onTaskClick} emptyText="오늘 마감 작업 없음" />
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          gap: 1.5,
          alignItems: 'stretch',
        }}
      >
        {visibleWidgets.includes('check_sheets') && (
          <ProjectGroupedSheetList
            title="Check Sheet 현황"
            activeSheets={data.active_sheets}
            nearCompletedSheets={data.near_completed_sheets}
            completedSheets={data.recent_completed_sheets}
            color="#16A34A"
            onSheetClick={onSheetClick}
            emptyText="진행 중인 체크시트가 없습니다"
          />
        )}
        {visibleWidgets.includes('incomplete_tasks') && (
          <TaskList title="미완료/이월 작업" tasks={data.incomplete_carried_over || []} color="#EF4444" icon={<WarningAmberIcon />} onTaskClick={onTaskClick} emptyText="미완료 작업 없음" />
        )}
        {visibleWidgets.includes('high_priority') && (
          <TaskList title="우선순위 높은 항목" tasks={data.high_priority_tasks} color="#F59E0B" icon={<PriorityHighIcon />} onTaskClick={onTaskClick} emptyText="우선순위 항목 없음" />
        )}
      </Box>

      <SheetList title="최근 완료된 점검" sheets={data.recent_completed_sheets} color="#22C55E" onSheetClick={onSheetClick} hideIfEmpty />
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
      <SheetList title="관련 Sheet" sheets={data.active_sheets} color="#7C3AED" onSheetClick={onSheetClick} hideIfEmpty />
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
      <SheetList title="진행 중 Sheet" sheets={data.active_sheets} color="#7C3AED" onSheetClick={onSheetClick} hideIfEmpty />
      <TaskList title="핵심 이슈 (우선순위 높음)" tasks={data.high_priority_tasks} color="#EF4444" icon={<PriorityHighIcon />} onTaskClick={onTaskClick} />
    </Box>
  );
}

// ========================================
// 메인 PurposeOverview 컴포넌트
// ========================================

export default function PurposeOverview({ data, loading, purpose, onTaskClick, onSheetClick, visibleWidgets = [] }: Props) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1 }}>
          {[...Array(5)].map((_, i) => <Skeleton key={i} variant="rounded" height={86} />)}
        </Box>
        <Skeleton variant="rounded" height={180} />
        <Skeleton variant="rounded" height={180} />
      </Box>
    );
  }

  if (!data) return null;

  const overviewMap: Record<string, React.ReactNode> = {
    project_management: <ProjectManagementOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} />,
    equipment_ops: <EquipmentOpsOverview data={data} onTaskClick={onTaskClick} onSheetClick={onSheetClick} visibleWidgets={visibleWidgets} />,
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
