import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Dialog, Box, Typography, IconButton, LinearProgress,
    Tooltip, ToggleButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import SubjectIcon from '@mui/icons-material/Subject';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { TaskActivity } from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ImagePreviewModal from './ImagePreviewModal';

const COLORS = ['#374151', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6'];

/** Restore a previously saved selection range */
const restoreSelection = (range: Range | null) => {
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
};

interface WorkNoteModalProps {
    open: boolean;
    onClose: () => void;
    taskId: number;
    taskTitle: string;
    canEdit: boolean;
}

/* ── Sortable Block Item ── */
interface SortableBlockProps {
    block: TaskActivity;
    index: number;
    canEdit: boolean;
    focusedBlockId: number | null;
    onCheck: (block: TaskActivity) => void;
    onContentChange: (block: TaskActivity, html: string) => void;
    onFocus: (id: number) => void;
    onKeyDown: (e: React.KeyboardEvent, block: TaskActivity, index: number) => void;
    onToggleType: (block: TaskActivity) => void;
    onDelete: (id: number) => void;
    onInsertAfter: (index: number, type: 'checkbox' | 'text') => void;
    blockRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
    showColorPicker: number | null;
    onShowColorPicker: (id: number | null) => void;
    savedSelection: React.MutableRefObject<Range | null>;
    onImageClick: (src: string, alt?: string) => void;
}

/** Format checked_at date for display */
const formatCheckedDate = (checkedAt?: string | null): string => {
    if (!checkedAt) return '';
    const d = new Date(checkedAt);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}/${day}`;
};

const SortableBlock: React.FC<SortableBlockProps> = ({
    block, index, canEdit, focusedBlockId,
    onCheck, onContentChange, onFocus, onKeyDown, onToggleType, onDelete, onInsertAfter,
    blockRefs, showColorPicker, onShowColorPicker, savedSelection,
    onImageClick,
}) => {
    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging,
    } = useSortable({ id: block.id, disabled: !canEdit });
    const contentRef = useRef<HTMLDivElement>(null);
    const lastSavedContent = useRef(block.content);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : 'auto' as any,
    };

    // Sync content from server only when block.content actually changes externally
    useEffect(() => {
        if (contentRef.current && block.content !== lastSavedContent.current) {
            contentRef.current.innerHTML = block.content || '';
            lastSavedContent.current = block.content;
        }
    }, [block.content]);

    // Initialize content on mount
    useEffect(() => {
        if (contentRef.current && !contentRef.current.innerHTML && block.content) {
            contentRef.current.innerHTML = block.content;
        }
    }, []);

    const handleBlur = () => {
        if (!contentRef.current) return;
        const html = contentRef.current.innerHTML;
        // Normalize: treat <br> only or empty as ''
        const normalized = html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim();
        const content = normalized === '' ? '' : html;
        if (content !== lastSavedContent.current) {
            lastSavedContent.current = content;
            onContentChange(block, content);
        }
    };

    const handleKeyDownInternal = (e: React.KeyboardEvent) => {
        // Ctrl+B for bold on selected text
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            document.execCommand('bold', false);
            return;
        }
        onKeyDown(e, block, index);
    };

    // Register ref for focus management
    useEffect(() => {
        if (contentRef.current) {
            blockRefs.current.set(block.id, contentRef.current);
        }
        return () => { blockRefs.current.delete(block.id); };
    }, [block.id]);

    // Save selection on any selection change while this block is focused
    useEffect(() => {
        const handler = () => {
            if (focusedBlockId === block.id && contentRef.current) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && contentRef.current.contains(sel.anchorNode)) {
                    savedSelection.current = sel.getRangeAt(0).cloneRange();
                }
            }
        };
        document.addEventListener('selectionchange', handler);
        return () => document.removeEventListener('selectionchange', handler);
    }, [focusedBlockId, block.id]);

    const isCheckbox = block.block_type === 'checkbox';
    const isEmpty = !block.content || block.content.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim() === '';

    // ── 이미지 / 테이블 hover-overlay 리사이즈 toolbar ──
    const [hoveredImg, setHoveredImg] = useState<{ el: HTMLImageElement; rect: DOMRect } | null>(null);
    const [hoveredTable, setHoveredTable] = useState<{ el: HTMLTableElement; rect: DOMRect } | null>(null);
    const hideTimerRef = useRef<number | null>(null);
    const cancelHideTimer = () => {
        if (hideTimerRef.current !== null) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    };
    const scheduleHide = () => {
        cancelHideTimer();
        hideTimerRef.current = window.setTimeout(() => {
            setHoveredImg(null);
            setHoveredTable(null);
        }, 250);
    };
    useEffect(() => () => cancelHideTimer(), []);
    // 스크롤되면 toolbar 위치가 stale → 숨김
    useEffect(() => {
        if (!hoveredImg && !hoveredTable) return;
        const handler = () => {
            setHoveredImg(null);
            setHoveredTable(null);
        };
        window.addEventListener('scroll', handler, true);
        return () => window.removeEventListener('scroll', handler, true);
    }, [hoveredImg, hoveredTable]);

    const handleEditorMouseOver = (e: React.MouseEvent) => {
        if (!canEdit) return;
        const target = e.target as HTMLElement;
        if (target instanceof HTMLImageElement) {
            cancelHideTimer();
            setHoveredImg({ el: target, rect: target.getBoundingClientRect() });
            setHoveredTable(null);
            return;
        }
        const table = target.closest('table') as HTMLTableElement | null;
        if (table) {
            cancelHideTimer();
            setHoveredTable({ el: table, rect: table.getBoundingClientRect() });
            setHoveredImg(null);
        }
    };
    const handleEditorMouseOut = (e: React.MouseEvent) => {
        if (!canEdit) return;
        const target = e.target as HTMLElement;
        if (target instanceof HTMLImageElement) {
            scheduleHide();
            return;
        }
        const table = target.closest('table');
        if (table) {
            const related = e.relatedTarget as HTMLElement | null;
            if (!related || !table.contains(related)) {
                scheduleHide();
            }
        }
    };

    const resizeImage = (img: HTMLImageElement, action: 'shrink' | 'grow' | 'fit' | 'reset') => {
        if (action === 'reset') {
            img.style.width = '';
            img.style.height = '';
            img.removeAttribute('data-note-width');
        } else if (action === 'fit') {
            img.style.width = '100%';
            img.style.height = 'auto';
            img.setAttribute('data-note-width', '100%');
        } else {
            const current = img.offsetWidth || img.naturalWidth || 200;
            const delta = action === 'shrink' ? -50 : 50;
            const next = Math.max(50, Math.min(2000, current + delta));
            img.style.width = `${next}px`;
            img.style.height = 'auto';
            img.setAttribute('data-note-width', String(next));
        }
        // 변경된 HTML을 즉시 저장 → 새로고침 후에도 유지
        if (contentRef.current) {
            const html = contentRef.current.innerHTML;
            lastSavedContent.current = html;
            onContentChange(block, html);
        }
        // toolbar 위치 갱신 (이미지 크기 변경 후)
        requestAnimationFrame(() => {
            setHoveredImg(prev => prev ? { el: img, rect: img.getBoundingClientRect() } : null);
        });
    };

    const resizeTable = (table: HTMLTableElement, action: 'fit' | 'natural' | 'wrap' | 'fontUp' | 'fontDown') => {
        if (action === 'fit') {
            table.setAttribute('data-fit-mode', 'fit');
        } else if (action === 'natural') {
            table.removeAttribute('data-fit-mode');
        } else if (action === 'wrap') {
            const wrapped = table.getAttribute('data-wrap-text') === 'true';
            if (wrapped) table.removeAttribute('data-wrap-text');
            else table.setAttribute('data-wrap-text', 'true');
        } else {
            // 폰트 +/- (transform scale 미사용, font-size 직접 조정)
            const computed = window.getComputedStyle(table).fontSize;
            const px = parseFloat(computed) || 14;
            const next = action === 'fontUp' ? Math.min(22, px + 1) : Math.max(10, px - 1);
            table.style.fontSize = `${next}px`;
        }
        if (contentRef.current) {
            const html = contentRef.current.innerHTML;
            lastSavedContent.current = html;
            onContentChange(block, html);
        }
        requestAnimationFrame(() => {
            setHoveredTable(prev => prev ? { el: table, rect: table.getBoundingClientRect() } : null);
        });
    };

    return (
        <Box ref={setNodeRef} style={style}>
            <Box
                sx={{
                    display: 'flex', alignItems: 'flex-start', gap: 0.5,
                    py: 0.4, px: 0.5, mx: -0.5, borderRadius: 1.5,
                    transition: 'background 0.15s',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                    '&:hover .block-actions': { opacity: 1 },
                    '&:hover .drag-handle': { opacity: 1 },
                    '&:hover .insert-btn': { opacity: 1 },
                }}
            >
                {/* Drag handle */}
                {canEdit && (
                    <Box
                        className="drag-handle"
                        {...attributes}
                        {...listeners}
                        sx={{
                            display: 'flex', alignItems: 'center', pt: 0.7,
                            cursor: 'grab', opacity: 0, transition: 'opacity 0.15s',
                            '&:active': { cursor: 'grabbing' },
                        }}
                    >
                        <DragIndicatorIcon sx={{ fontSize: '0.9rem', color: '#C0C4CC' }} />
                    </Box>
                )}

                {/* Checkbox / type indicator */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', pt: 0.6,
                    minWidth: 28, justifyContent: 'center',
                }}>
                    {isCheckbox ? (
                        <IconButton
                            size="small"
                            onClick={() => canEdit && onCheck(block)}
                            disabled={!canEdit}
                            sx={{ p: 0.3 }}
                        >
                            {block.checked
                                ? <CheckCircleOutlineIcon sx={{ fontSize: '1.2rem', color: '#22C55E' }} />
                                : <RadioButtonUncheckedIcon sx={{ fontSize: '1.2rem', color: '#D1D5DB' }} />
                            }
                        </IconButton>
                    ) : (
                        <SubjectIcon sx={{ fontSize: '1rem', color: '#D1D5DB', mt: 0.2 }} />
                    )}
                </Box>

                {/* Content - Rich text editable */}
                <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <Box
                        ref={contentRef}
                        contentEditable={canEdit}
                        suppressContentEditableWarning
                        onBlur={handleBlur}
                        onFocus={() => onFocus(block.id)}
                        onKeyDown={e => canEdit && handleKeyDownInternal(e)}
                        onClick={(e) => {
                            // 이미지 클릭 → 라이트박스로 확대 보기
                            const target = e.target as HTMLElement;
                            if (target instanceof HTMLImageElement) {
                                e.preventDefault();
                                e.stopPropagation();
                                onImageClick(target.src, target.alt);
                            }
                        }}
                        onMouseOver={handleEditorMouseOver}
                        onMouseOut={handleEditorMouseOut}
                        data-placeholder={isCheckbox ? '체크리스트 항목...' : '메모를 작성하세요...'}
                        sx={{
                            fontSize: '0.9rem',
                            lineHeight: 1.8,
                            py: 0.3,
                            px: 0.5,
                            minHeight: '1.8em',
                            outline: 'none',
                            borderRadius: 1,
                            transition: 'background 0.15s',
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                            // 큰 image/table 등은 잘리지 않고 가로 스크롤로 노출
                            overflowX: 'auto',
                            textDecoration: isCheckbox && block.checked ? 'line-through' : 'none',
                            opacity: isCheckbox && block.checked ? 0.5 : 1,
                            color: '#374151',
                            '&:focus': {
                                bgcolor: 'rgba(41,85,255,0.03)',
                            },
                            '&:empty::before': {
                                content: 'attr(data-placeholder)',
                                color: '#D1D5DB',
                                pointerEvents: 'none',
                            },
                            '& b, & strong': { fontWeight: 700 },
                            // 이미지: 원본 크기 유지, 큰 이미지는 가로 스크롤로 표시 (라이트박스로 확대 가능)
                            '& img': {
                                maxWidth: 'none',
                                height: 'auto',
                                cursor: 'zoom-in',
                                borderRadius: 1,
                                display: 'block',
                                my: 0.5,
                            },
                            // 테이블: 원본 폭 유지, 셀 내용 줄바꿈 안 함 → 가로 스크롤로 노출
                            '& table': {
                                width: 'max-content',
                                maxWidth: 'none',
                                borderCollapse: 'collapse',
                                my: 0.5,
                                fontSize: '0.85rem',
                            },
                            '& th, & td': {
                                border: '1px solid #E5E7EB',
                                padding: '6px 10px',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'top',
                            },
                            '& th': {
                                bgcolor: '#F9FAFB',
                                fontWeight: 600,
                            },
                        }}
                    />
                    {/* Shift+Enter hint for checkbox blocks */}
                    {isCheckbox && canEdit && focusedBlockId === block.id && isEmpty && (
                        <Typography
                            variant="caption"
                            sx={{
                                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                                color: '#D1D5DB', fontSize: '0.65rem', pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            Shift+Enter 줄바꿈
                        </Typography>
                    )}
                    {/* Checked date display */}
                    {isCheckbox && block.checked && block.checked_at && (
                        <Typography
                            variant="caption"
                            sx={{
                                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                                color: '#9CA3AF', fontSize: '0.65rem', pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {formatCheckedDate(block.checked_at)}
                        </Typography>
                    )}
                </Box>

                {/* Block actions */}
                {canEdit && (
                    <Box
                        className="block-actions"
                        sx={{
                            display: 'flex', alignItems: 'center', gap: 0,
                            opacity: focusedBlockId === block.id ? 1 : 0,
                            transition: 'opacity 0.15s',
                            pt: 0.3,
                            position: 'relative',
                        }}
                    >
                        <Tooltip title={block.block_type === 'checkbox' ? '텍스트로 변환' : '체크박스로 변환'} arrow>
                            <IconButton size="small" onClick={() => onToggleType(block)} sx={{ color: '#9CA3AF', p: 0.4 }}>
                                {block.block_type === 'checkbox'
                                    ? <SubjectIcon sx={{ fontSize: '0.85rem' }} />
                                    : <CheckBoxOutlinedIcon sx={{ fontSize: '0.85rem' }} />
                                }
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="굵게 (Ctrl+B)" arrow>
                            <IconButton
                                size="small"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    restoreSelection(savedSelection.current);
                                    setTimeout(() => document.execCommand('bold', false), 0);
                                }}
                                sx={{ color: '#9CA3AF', p: 0.4, '&:hover': { color: '#2955FF' } }}
                            >
                                <FormatBoldIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="텍스트 색상" arrow>
                            <IconButton
                                size="small"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onShowColorPicker(showColorPicker === block.id ? null : block.id);
                                }}
                                sx={{ color: '#9CA3AF', p: 0.4, '&:hover': { color: '#2955FF' } }}
                            >
                                <FormatColorTextIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                        {/* Color picker dropdown */}
                        {showColorPicker === block.id && (
                            <Box sx={{
                                position: 'absolute', top: '100%', right: 0, zIndex: 20,
                                display: 'flex', gap: 0.4, p: 0.8,
                                bgcolor: '#fff', borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                                border: '1px solid #E5E7EB',
                            }}>
                                {COLORS.map(c => (
                                    <Box
                                        key={c}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            restoreSelection(savedSelection.current);
                                            setTimeout(() => {
                                                document.execCommand('foreColor', false, c);
                                                onShowColorPicker(null);
                                            }, 0);
                                        }}
                                        sx={{
                                            width: 16, height: 16, borderRadius: '50%',
                                            bgcolor: c, cursor: 'pointer',
                                            border: '1px solid #E5E7EB',
                                            transition: 'transform 0.1s',
                                            '&:hover': { transform: 'scale(1.3)' },
                                        }}
                                    />
                                ))}
                            </Box>
                        )}
                        <Tooltip title="삭제" arrow>
                            <IconButton
                                size="small"
                                onClick={() => onDelete(block.id)}
                                sx={{ color: '#D1D5DB', '&:hover': { color: '#EF4444' }, p: 0.4 }}
                            >
                                <DeleteOutlineIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </Box>

            {/* Insert between button */}
            {canEdit && (
                <Box
                    className="insert-btn"
                    sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity 0.15s',
                        height: 0, position: 'relative', zIndex: 5,
                        '&:hover': { opacity: '1 !important' },
                    }}
                >
                    <Box sx={{
                        position: 'absolute', display: 'flex', alignItems: 'center', gap: 0.5,
                    }}>
                        <Box sx={{ width: 60, height: '1px', bgcolor: '#E5E7EB' }} />
                        <Tooltip title="여기에 항목 추가" arrow>
                            <IconButton
                                size="small"
                                onClick={() => onInsertAfter(index, 'checkbox')}
                                sx={{
                                    width: 18, height: 18, bgcolor: '#EEF2FF', border: '1px solid #C7D2FE',
                                    '&:hover': { bgcolor: '#C7D2FE' },
                                }}
                            >
                                <AddIcon sx={{ fontSize: '0.7rem', color: '#2955FF' }} />
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ width: 60, height: '1px', bgcolor: '#E5E7EB' }} />
                    </Box>
                </Box>
            )}

            {/* 이미지 hover 리사이즈 toolbar — 이미지 위에 떠 있는 컨트롤 */}
            {canEdit && hoveredImg && (
                <Box
                    onMouseEnter={cancelHideTimer}
                    onMouseLeave={scheduleHide}
                    onMouseDown={(e) => e.preventDefault()}
                    sx={{
                        position: 'fixed',
                        top: Math.max(4, hoveredImg.rect.top + 4),
                        left: hoveredImg.rect.right - 4,
                        transform: 'translateX(-100%)',
                        zIndex: 1500,
                        display: 'flex', alignItems: 'center', gap: 0.25,
                        px: 0.5, py: 0.25, borderRadius: 999,
                        bgcolor: 'rgba(30,30,30,0.92)',
                        backdropFilter: 'blur(6px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                    }}
                >
                    <Tooltip title="축소 (-50px)" arrow>
                        <IconButton size="small" onClick={() => resizeImage(hoveredImg.el, 'shrink')}
                            sx={{ color: '#fff', p: 0.4 }}>
                            <RemoveIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="확대 (+50px)" arrow>
                        <IconButton size="small" onClick={() => resizeImage(hoveredImg.el, 'grow')}
                            sx={{ color: '#fff', p: 0.4 }}>
                            <AddIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                    </Tooltip>
                    <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.25)', mx: 0.25 }} />
                    <Tooltip title="컨테이너 폭에 맞춤" arrow>
                        <IconButton size="small" onClick={() => resizeImage(hoveredImg.el, 'fit')}
                            sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 32, borderRadius: 999 }}>
                            100%
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="원본 크기로 복원" arrow>
                        <IconButton size="small" onClick={() => resizeImage(hoveredImg.el, 'reset')}
                            sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 32, borderRadius: 999 }}>
                            원본
                        </IconButton>
                    </Tooltip>
                </Box>
            )}
        </Box>
    );
};

/* ── Main Modal ── */
const WorkNoteModal: React.FC<WorkNoteModalProps> = ({ open, onClose, taskId, taskTitle, canEdit }) => {
    const queryClient = useQueryClient();
    const [focusedBlockId, setFocusedBlockId] = useState<number | null>(null);
    const [showColorPicker, setShowColorPicker] = useState<number | null>(null);
    const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const pendingFocusRef = useRef<number | null>(null);
    const savedSelection = useRef<Range | null>(null);
    // 이미지 라이트박스
    const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
    const handleImageClick = useCallback((src: string, alt?: string) => {
        setPreviewImage({ src, alt });
    }, []);

    const { data: blocks = [] } = useQuery<TaskActivity[]>({
        queryKey: ['activities', taskId],
        queryFn: () => api.getTaskActivities(taskId),
        enabled: open && !!taskId,
    });

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['activities', taskId] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        // 체크박스 변경으로 progress가 바뀌므로 로드맵/통계도 갱신
        queryClient.invalidateQueries({ queryKey: ['roadmap'] });
        queryClient.invalidateQueries({ queryKey: ['globalRoadmap'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, [queryClient, taskId]);

    const createMut = useMutation({
        mutationFn: (data: { content: string; block_type: string; checked?: boolean; style?: any; order_index?: number }) =>
            api.createTaskActivity(taskId, data),
        onSuccess: (newBlock) => {
            pendingFocusRef.current = newBlock.id;
            invalidate();
        },
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...data }: { id: number } & Partial<TaskActivity>) =>
            api.updateTaskActivity(id, data),
        onSuccess: invalidate,
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => api.deleteTaskActivity(id),
        onSuccess: invalidate,
    });

    const reorderMut = useMutation({
        mutationFn: (order: number[]) => api.reorderTaskActivities(taskId, order),
        onSuccess: invalidate,
    });

    // Focus newly created block
    useEffect(() => {
        if (pendingFocusRef.current && blocks.length > 0) {
            const targetId = pendingFocusRef.current;
            const found = blocks.find(b => b.id === targetId);
            if (found) {
                setTimeout(() => {
                    const el = blockRefs.current.get(targetId);
                    if (el) {
                        el.focus();
                        // Place cursor at end
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                    }
                }, 50);
                pendingFocusRef.current = null;
            }
        }
    }, [blocks]);

    const [copied, setCopied] = useState(false);
    const handleCopyAll = useCallback(() => {
        const text = blocks.map(b => {
            const plain = b.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
            if ((b.block_type || 'checkbox') === 'checkbox') {
                return `${b.checked ? '[x]' : '[ ]'} ${plain}`;
            }
            return plain;
        }).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [blocks]);

    const checkboxBlocks = blocks.filter(b => (b.block_type || 'checkbox') === 'checkbox');
    const checkedCount = checkboxBlocks.filter(b => b.checked).length;
    const totalCheckboxes = checkboxBlocks.length;
    const progress = totalCheckboxes > 0 ? Math.round(checkedCount / totalCheckboxes * 100) : 0;

    const addBlock = (type: 'checkbox' | 'text') => {
        createMut.mutate({ content: '', block_type: type });
    };

    const insertAfter = (index: number, type: 'checkbox' | 'text') => {
        const afterBlock = blocks[index];
        const orderIndex = (afterBlock?.order_index ?? 0) + 1;
        createMut.mutate({ content: '', block_type: type, order_index: orderIndex });
    };

    const handleKeyDown = (e: React.KeyboardEvent, block: TaskActivity, index: number) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // Checkbox blocks: Enter creates a new checkbox block
            if (block.block_type === 'checkbox') {
                e.preventDefault();
                const orderIndex = block.order_index + 1;
                createMut.mutate({ content: '', block_type: 'checkbox', order_index: orderIndex });
            }
            // Text blocks: Enter = natural new line (don't prevent default)
        }
        if (e.key === 'Backspace') {
            const el = e.target as HTMLDivElement;
            const text = el.textContent || '';
            if (text === '' && blocks.length > 1) {
                e.preventDefault();
                if (index > 0) {
                    const prevId = blocks[index - 1].id;
                    setTimeout(() => {
                        const prevEl = blockRefs.current.get(prevId);
                        if (prevEl) {
                            prevEl.focus();
                            // Place cursor at end
                            const range = document.createRange();
                            range.selectNodeContents(prevEl);
                            range.collapse(false);
                            const sel = window.getSelection();
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                        }
                    }, 50);
                }
                deleteMut.mutate(block.id);
            }
        }
    };

    const handleContentChange = (block: TaskActivity, html: string) => {
        updateMut.mutate({ id: block.id, content: html });
    };

    const toggleBlockType = (block: TaskActivity) => {
        updateMut.mutate({
            id: block.id,
            block_type: block.block_type === 'checkbox' ? 'text' : 'checkbox',
            checked: false,
        });
    };

    // DnD
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = blocks.findIndex(b => b.id === active.id);
        const newIndex = blocks.findIndex(b => b.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const newOrder = arrayMove(blocks.map(b => b.id), oldIndex, newIndex);
        reorderMut.mutate(newOrder);
    };

    // Close color picker when clicking outside
    useEffect(() => {
        if (showColorPicker === null) return;
        const handler = () => setShowColorPicker(null);
        // Use mousedown so it doesn't conflict with onMouseDown handlers that stopPropagation
        const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handler);
        };
    }, [showColorPicker]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            PaperProps={{
                sx: {
                    width: '820px',
                    maxWidth: '92vw',
                    height: '90vh',
                    maxHeight: '90vh',
                    borderRadius: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                },
            }}
        >
            {/* Header */}
            <Box sx={{
                px: 3, py: 2.5,
                borderBottom: '1px solid #E5E7EB',
                bgcolor: '#FAFBFC',
                flexShrink: 0,
            }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box sx={{ flex: 1, mr: 2 }}>
                        <Typography variant="caption" sx={{
                            fontWeight: 600, color: '#9CA3AF', fontSize: '0.65rem',
                            textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                            Work Note
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.3, mt: 0.3 }}>
                            {taskTitle}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title={copied ? '복사됨!' : '전체 복사'}>
                            <IconButton size="small" onClick={handleCopyAll} sx={{ color: copied ? '#22C55E' : '#9CA3AF' }}>
                                <ContentCopyIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={onClose}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>

                {/* Progress bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                            flex: 1, height: 6, borderRadius: 3,
                            bgcolor: '#E5E7EB',
                            '& .MuiLinearProgress-bar': {
                                bgcolor: progress >= 100 ? '#22C55E' : '#2955FF',
                                borderRadius: 3,
                            },
                        }}
                    />
                    <Typography variant="caption" sx={{
                        fontWeight: 700, fontSize: '0.75rem', minWidth: 48, textAlign: 'right',
                        color: progress >= 100 ? '#22C55E' : '#6B7280',
                    }}>
                        {totalCheckboxes > 0 ? `${checkedCount}/${totalCheckboxes}` : '0/0'}
                    </Typography>
                </Box>
            </Box>

            {/* Body - Block Editor */}
            <Box sx={{
                flex: 1, overflowY: 'auto', px: 3, py: 2,
                '&::-webkit-scrollbar': { width: 4 },
                '&::-webkit-scrollbar-thumb': { bgcolor: '#D1D5DB', borderRadius: 2 },
            }}>
                {blocks.length === 0 && !createMut.isPending && (
                    <Box sx={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', py: 8, color: '#9CA3AF',
                    }}>
                        <SubjectIcon sx={{ fontSize: 48, mb: 1.5, opacity: 0.3 }} />
                        <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 0.5 }}>
                            작업 노트가 비어있습니다
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#D1D5DB' }}>
                            아래 버튼으로 체크리스트 또는 메모를 추가하세요
                        </Typography>
                    </Box>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                        {blocks.map((block, index) => (
                            <SortableBlock
                                key={block.id}
                                block={block}
                                index={index}
                                canEdit={canEdit}
                                focusedBlockId={focusedBlockId}
                                onCheck={(b) => updateMut.mutate({ id: b.id, checked: !b.checked })}
                                onContentChange={handleContentChange}
                                onFocus={setFocusedBlockId}
                                onKeyDown={handleKeyDown}
                                onToggleType={toggleBlockType}
                                onDelete={(id) => deleteMut.mutate(id)}
                                onInsertAfter={insertAfter}
                                blockRefs={blockRefs}
                                showColorPicker={showColorPicker}
                                onShowColorPicker={setShowColorPicker}
                                savedSelection={savedSelection}
                                onImageClick={handleImageClick}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </Box>

            {/* Footer - Add buttons */}
            {canEdit && (
                <Box sx={{
                    px: 3, py: 1.5,
                    borderTop: '1px solid #F3F4F6',
                    bgcolor: '#FAFBFC',
                    display: 'flex', alignItems: 'center', gap: 1,
                    flexShrink: 0,
                }}>
                    <Tooltip title="체크리스트 추가" arrow>
                        <ToggleButton
                            value="checkbox"
                            size="small"
                            onClick={() => addBlock('checkbox')}
                            sx={{
                                border: '1px solid #E5E7EB', borderRadius: 2, px: 1.5, py: 0.5,
                                textTransform: 'none', fontSize: '0.75rem', color: '#6B7280',
                                '&:hover': { bgcolor: '#EEF2FF', borderColor: '#2955FF', color: '#2955FF' },
                            }}
                        >
                            <CheckBoxOutlinedIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} />
                            체크리스트
                        </ToggleButton>
                    </Tooltip>
                    <Tooltip title="텍스트 메모 추가" arrow>
                        <ToggleButton
                            value="text"
                            size="small"
                            onClick={() => addBlock('text')}
                            sx={{
                                border: '1px solid #E5E7EB', borderRadius: 2, px: 1.5, py: 0.5,
                                textTransform: 'none', fontSize: '0.75rem', color: '#6B7280',
                                '&:hover': { bgcolor: '#EEF2FF', borderColor: '#2955FF', color: '#2955FF' },
                            }}
                        >
                            <SubjectIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} />
                            텍스트
                        </ToggleButton>
                    </Tooltip>

                    <Box sx={{ flex: 1 }} />

                    {totalCheckboxes > 0 && (
                        <Typography variant="caption" sx={{
                            fontWeight: 600, fontSize: '0.7rem',
                            color: progress >= 100 ? '#22C55E' : '#6B7280',
                        }}>
                            진행률 {progress}%
                        </Typography>
                    )}
                </Box>
            )}

            {/* 이미지 라이트박스 — 이미지 클릭 시 확대/축소 보기 */}
            <ImagePreviewModal
                src={previewImage?.src ?? null}
                alt={previewImage?.alt}
                onClose={() => setPreviewImage(null)}
            />
        </Dialog>
    );
};

export default WorkNoteModal;
