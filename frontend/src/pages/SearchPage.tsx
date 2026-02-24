import React, { useState } from 'react';
import {
    Box, Typography, TextField, Button, Chip, Divider, Paper,
    CircularProgress, Accordion, AccordionSummary, AccordionDetails,
    IconButton, Stack, Drawer
} from '@mui/material';
import {
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    AutoAwesome as AutoAwesomeIcon,
    FilterList as FilterListIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    FolderOpen as FolderOpenIcon,
    ThumbUp as ThumbUpIcon,
    ThumbDown as ThumbDownIcon,
    History as HistoryIcon,
    Edit as EditIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAppStore } from '../stores/useAppStore';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { format, parseISO } from 'date-fns';
import { SearchResultProject, SearchSummaryResult } from '../types';

export default function SearchPage() {
    const currentUserId = useAppStore(state => state.currentUserId);
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const queryClient = useQueryClient();

    // ─── Search State ───
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const sortOrder = 'updated';
    const [historyOpen, setHistoryOpen] = useState(false);
    const [editingSummaryId, setEditingSummaryId] = useState<number | null>(null);
    const [editContent, setEditContent] = useState('');

    // ─── Queries & Mutations ───
    const {
        data: searchData,
        isLoading: isSearching,
        refetch: doSearch
    } = useQuery({
        queryKey: ['search', query, statusFilter, sortOrder, currentUserId],
        queryFn: () => api.searchProjects({
            query: query.trim(),
            status: statusFilter,
            sort: sortOrder
        }, currentUserId),
        enabled: false, // only run on manual trigger initially, or when filters change if desired
    });

    const generateSummaryMutation = useMutation({
        mutationFn: (projectIds: number[]) => api.generateSearchSummary({
            project_ids: projectIds,
            query: query.trim()
        }, currentUserId),
        onSuccess: () => {
            enqueueSnackbar('AI 요약이 생성되었습니다.', { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['searchSummaries'] });
        },
        onError: (err: any) => {
            enqueueSnackbar(err?.response?.data?.detail || '요약 생성에 실패했습니다.', { variant: 'error' });
        }
    });

    const submitFeedbackMutation = useMutation({
        mutationFn: (data: { summary_id: number; rating: string }) => api.submitSummaryFeedback(data, currentUserId),
        onSuccess: () => {
            enqueueSnackbar('피드백이 전송되었습니다. 감사합니다!', { variant: 'success' });
        }
    });

    const { data: historyData } = useQuery({
        queryKey: ['searchSummaries', currentUserId],
        queryFn: () => api.getSearchSummaries(currentUserId),
    });

    const saveCorrectionMutation = useMutation({
        mutationFn: (data: { summary_id: number; corrected_text: string }) => api.saveSummaryCorrection(data, currentUserId),
        onSuccess: () => {
            enqueueSnackbar('수정된 요약이 저장되었습니다.', { variant: 'success' });
            queryClient.invalidateQueries({ queryKey: ['searchSummaries'] });
            setEditingSummaryId(null);
        }
    });

    // ─── Handlers ───
    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        doSearch();
    };

    const handleGenerateSummary = () => {
        if (!searchData?.projects.length) return;
        const projectIds = searchData.projects.map(p => p.project.id);
        generateSummaryMutation.mutate(projectIds);
    };

    // Current summary state (we display the mutation result if available)
    const currentSummary = generateSummaryMutation.data;

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3, pb: 6 }}>
            {/* Header & Search Bar */}
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h4" sx={{ color: '#1A1D29', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <SearchIcon sx={{ fontSize: 32, color: '#2955FF' }} />
                        프로젝트 통합 검색
                    </Typography>
                    <Button
                        startIcon={<HistoryIcon />}
                        onClick={() => setHistoryOpen(true)}
                        sx={{ color: '#6B7280', '&:hover': { bgcolor: '#F3F4F6' } }}
                    >
                        요약 히스토리
                    </Button>
                </Box>
                <Typography variant="body1" sx={{ color: '#6B7280', mb: 3 }}>
                    자연어, 키워드, 상태 등 다양한 조건으로 프로젝트를 검색하고 AI 요약을 받아보세요.
                </Typography>

                <Paper
                    component="form"
                    onSubmit={handleSearch}
                    sx={{
                        p: '2px 4px', display: 'flex', alignItems: 'center', width: '100%',
                        borderRadius: 3, border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        transition: 'box-shadow 0.2s, border-color 0.2s',
                        '&:focus-within': { borderColor: '#2955FF', boxShadow: '0 4px 12px rgba(41,85,255,0.15)' }
                    }}
                >
                    <IconButton sx={{ p: '10px', color: '#6B7280' }} aria-label="search" onClick={handleSearch}>
                        <SearchIcon />
                    </IconButton>
                    <TextField
                        fullWidth
                        placeholder='태스크, 하위프로젝트, 내용 등 자유롭게 검색해보세요 (예: "결제 시스템 오류")'
                        variant="standard"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        InputProps={{ disableUnderline: true, sx: { fontSize: '1.05rem', py: 1.5 } }}
                    />
                    <Divider sx={{ height: 28, m: 0.5 }} orientation="vertical" />
                    <Button
                        type="submit"
                        variant="contained"
                        sx={{ m: 0.5, px: 3, py: 1, borderRadius: 2, bgcolor: '#2955FF' }}
                        disabled={isSearching}
                    >
                        {isSearching ? <CircularProgress size={24} color="inherit" /> : '검색'}
                    </Button>
                </Paper>

                {/* Filters */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                    <FilterListIcon sx={{ color: '#9CA3AF' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#4B5563', mr: 1 }}>상태 필터:</Typography>
                    {['all', 'todo', 'in_progress', 'done', 'hold'].map(status => (
                        <Chip
                            key={status}
                            label={status === 'all' ? '전체' : status === 'todo' ? '대기' : status === 'in_progress' ? '진행중' : status === 'done' ? '완료' : '보류'}
                            onClick={() => { setStatusFilter(status); setTimeout(doSearch, 0); }}
                            color={statusFilter === status ? 'primary' : 'default'}
                            variant={statusFilter === status ? 'filled' : 'outlined'}
                            sx={{ fontWeight: statusFilter === status ? 700 : 500 }}
                        />
                    ))}
                </Box>
            </Box>

            {/* Results Section */}
            {searchData && (
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, p: 2, bgcolor: '#F9FAFB', borderRadius: 2, border: '1px solid #E5E7EB' }}>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#1A1D29' }}>
                            검색 결과: <Box component="span" sx={{ color: '#2955FF', fontSize: '1.2em' }}>{searchData.total}</Box>개의 프로젝트
                        </Typography>
                        <Button
                            variant="outlined"
                            startIcon={<AutoAwesomeIcon />}
                            onClick={handleGenerateSummary}
                            disabled={searchData.total === 0 || generateSummaryMutation.isPending}
                            sx={{
                                borderColor: '#8B5CF6', color: '#8B5CF6', fontWeight: 700,
                                '&:hover': { borderColor: '#7C3AED', bgcolor: '#F5F3FF' }
                            }}
                        >
                            {generateSummaryMutation.isPending ? 'AI 요약 생성 중...' : '검색된 프로젝트 AI 요약'}
                        </Button>
                    </Box>

                    {searchData.total === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 10 }}>
                            <FolderOpenIcon sx={{ fontSize: 64, color: '#D1D5DB', mb: 2 }} />
                            <Typography variant="h6" sx={{ color: '#6B7280' }}>조건에 맞는 프로젝트가 없습니다.</Typography>
                        </Box>
                    ) : (
                        <Stack spacing={3}>
                            {searchData.projects.map((res: SearchResultProject) => {
                                const p = res.project;
                                const summary = currentSummary?.project_summaries.find((s: any) => s.project_id === p.id);

                                return (
                                    <Paper key={p.id} sx={{ p: 0, borderRadius: 3, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                                        {/* Project Card Header */}
                                        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <Box>
                                                    <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5, color: '#1A1D29', cursor: 'pointer', '&:hover': { color: '#2955FF' } }} onClick={() => navigate(`/project/${p.id}`)}>
                                                        {p.name}
                                                    </Typography>
                                                    <Typography variant="body2" sx={{ color: '#6B7280' }}>
                                                        {p.description || '설명 없음'}
                                                    </Typography>
                                                </Box>
                                                <Button size="small" variant="contained" color="primary" onClick={() => navigate(`/project/${p.id}`)} sx={{ borderRadius: 2 }}>
                                                    프로젝트 열기
                                                </Button>
                                            </Box>

                                            {/* Stats Row */}
                                            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <CircularProgress variant="determinate" value={res.progress} size={32} thickness={5} sx={{ color: res.progress === 100 ? '#22C55E' : '#2955FF' }} />
                                                    <Box>
                                                        <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', lineHeight: 1 }}>진행률</Typography>
                                                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1A1D29' }}>{res.progress}%</Typography>
                                                    </Box>
                                                </Box>
                                                <Divider orientation="vertical" flexItem />
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', lineHeight: 1 }}>Task 현황</Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1A1D29' }}>
                                                        총 {res.status_counts.total} (완료 {res.status_counts.done} / 진행중 {res.status_counts.in_progress})
                                                    </Typography>
                                                </Box>
                                                <Divider orientation="vertical" flexItem />
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', lineHeight: 1 }}>하위프로젝트</Typography>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#1A1D29' }}>{res.sub_projects.length}개</Typography>
                                                </Box>

                                                {res.overdue_tasks.length > 0 && (
                                                    <>
                                                        <Divider orientation="vertical" flexItem />
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <WarningIcon sx={{ fontSize: 18, color: '#EF4444' }} />
                                                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#EF4444' }}>지연 {res.overdue_tasks.length}건</Typography>
                                                        </Box>
                                                    </>
                                                )}
                                            </Box>
                                        </Box>

                                        {/* AI Summary Accordion */}
                                        {summary && (
                                            <Accordion elevation={0} sx={{ borderTop: '1px solid #E5E7EB', bgcolor: '#F5F3FF', m: 0, '&:before': { display: 'none' } }}>
                                                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 3, minHeight: 48, '& .MuiAccordionSummary-content': { my: 1.5 } }}>
                                                    <AutoAwesomeIcon sx={{ color: '#8B5CF6', mr: 1.5, fontSize: 20 }} />
                                                    <Typography sx={{ fontWeight: 700, color: '#5B21B6', flexGrow: 1 }}>AI 구조화 요약 결과</Typography>
                                                    {summary.one_liner && (
                                                        <Typography variant="body2" sx={{ color: '#6D28D9', mr: 2, fontStyle: 'italic' }}>"{summary.one_liner}"</Typography>
                                                    )}
                                                </AccordionSummary>
                                                <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
                                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 2 }}>
                                                        <Box sx={{ p: 2, bgcolor: '#FFFFFF', borderRadius: 2, border: '1px solid #EDE9FE' }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#8B5CF6', mb: 1, display: 'block' }}>진행상황</Typography>
                                                            <Typography variant="body2" sx={{ color: '#374151' }}>{summary.status_text}</Typography>
                                                        </Box>
                                                        <Box sx={{ p: 2, bgcolor: '#FFFFFF', borderRadius: 2, border: '1px solid #EDE9FE' }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#8B5CF6', mb: 1, display: 'block' }}>핵심일정</Typography>
                                                            <Typography variant="body2" sx={{ color: '#374151' }}>{summary.key_schedule}</Typography>
                                                        </Box>
                                                        {summary.risks && (
                                                            <Box sx={{ p: 2, bgcolor: '#FEF2F2', borderRadius: 2, border: '1px solid #FEE2E2', gridColumn: 'span 1' }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#EF4444', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <WarningIcon sx={{ fontSize: 14 }} /> 잠재 리스크
                                                                </Typography>
                                                                <Typography variant="body2" sx={{ color: '#991B1B' }}>{summary.risks}</Typography>
                                                            </Box>
                                                        )}
                                                        {summary.next_actions && (
                                                            <Box sx={{ p: 2, bgcolor: '#F0FDF4', borderRadius: 2, border: '1px solid #DCFCE7', gridColumn: '1 / -1' }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#16A34A', mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    <CheckCircleIcon sx={{ fontSize: 14 }} /> 다음 액션 제언
                                                                </Typography>
                                                                <Typography variant="body2" sx={{ color: '#166534', fontWeight: 500 }}>{summary.next_actions}</Typography>
                                                            </Box>
                                                        )}
                                                    </Box>

                                                    {/* Feedback Action */}
                                                    {currentSummary && (
                                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="caption" sx={{ color: '#6B7280' }}>이 요약이 도움이 되었나요?</Typography>
                                                            <IconButton size="small" onClick={() => submitFeedbackMutation.mutate({ summary_id: currentSummary.id, rating: 'up' })} disabled={submitFeedbackMutation.isPending}>
                                                                <ThumbUpIcon fontSize="small" sx={{ color: '#9CA3AF', '&:hover': { color: '#2955FF' } }} />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => submitFeedbackMutation.mutate({ summary_id: currentSummary.id, rating: 'down' })} disabled={submitFeedbackMutation.isPending}>
                                                                <ThumbDownIcon fontSize="small" sx={{ color: '#9CA3AF', '&:hover': { color: '#EF4444' } }} />
                                                            </IconButton>
                                                        </Box>
                                                    )}
                                                </AccordionDetails>
                                            </Accordion>
                                        )}
                                    </Paper>
                                );
                            })}
                        </Stack>
                    )}
                </Box>
            )}

            {/* History Drawer */}
            <Drawer anchor="right" open={historyOpen} onClose={() => setHistoryOpen(false)} PaperProps={{ sx: { width: 400, p: 3, bgcolor: '#F9FAFB' } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#1A1D29', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HistoryIcon sx={{ color: '#2955FF' }} /> 요약 히스토리
                    </Typography>
                    <IconButton onClick={() => setHistoryOpen(false)} size="small"><CloseIcon /></IconButton>
                </Box>

                {historyData?.summaries?.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#6B7280', textAlign: 'center', mt: 5 }}>저장된 요약 내역이 없습니다.</Typography>
                ) : (
                    <Stack spacing={2}>
                        {historyData?.summaries?.map((summaryItem: SearchSummaryResult) => (
                            <Paper key={summaryItem.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 600 }}>
                                        {format(parseISO(summaryItem.created_at), 'yyyy-MM-dd HH:mm')}
                                    </Typography>
                                    <Chip size="small" label={`검색어: ${summaryItem.query || '전체'}`} sx={{ height: 20, fontSize: '0.65rem' }} />
                                </Box>

                                {editingSummaryId === summaryItem.id ? (
                                    <Box sx={{ mt: 1 }}>
                                        <TextField
                                            fullWidth multiline minRows={4} maxRows={10}
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            sx={{ mb: 1, '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
                                        />
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                            <Button size="small" onClick={() => setEditingSummaryId(null)} sx={{ color: '#6B7280' }}>취소</Button>
                                            <Button
                                                size="small" variant="contained"
                                                onClick={() => saveCorrectionMutation.mutate({ summary_id: summaryItem.id, corrected_text: editContent })}
                                                disabled={saveCorrectionMutation.isPending}
                                            >
                                                저장
                                            </Button>
                                        </Box>
                                    </Box>
                                ) : (
                                    <Box>
                                        <Typography variant="body2" sx={{ color: '#4B5563', whiteSpace: 'pre-line', fontSize: '0.85rem', maxHeight: 200, overflowY: 'auto', p: 1, bgcolor: '#F3F4F6', borderRadius: 1 }}>
                                            {summaryItem.overall_summary}
                                        </Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                            <Typography variant="caption" sx={{ color: '#8B5CF6', fontStyle: 'italic' }}>
                                                {summaryItem.project_summaries.length}개 프로젝트 요약됨
                                            </Typography>
                                            <IconButton size="small" sx={{ p: 0.5 }} onClick={() => { setEditingSummaryId(summaryItem.id); setEditContent(summaryItem.overall_summary); }}>
                                                <EditIcon sx={{ fontSize: '1rem', color: '#6B7280' }} />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                )}
                            </Paper>
                        ))}
                    </Stack>
                )}
            </Drawer>
        </Box>
    );
}
