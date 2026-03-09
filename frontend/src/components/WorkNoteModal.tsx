import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Dialog, Box, Typography, IconButton, LinearProgress, TextField,
    Tooltip, ToggleButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import SubjectIcon from '@mui/icons-material/Subject';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
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

const COLORS = ['#374151', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6'];

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
    onBlur: (block: TaskActivity, value: string) => void;
    onFocus: (id: number) => void;
    onKeyDown: (e: React.KeyboardEvent, block: TaskActivity, index: number) => void;
    onToggleType: (block: TaskActivity) => void;
    onToggleBold: (block: TaskActivity) => void;
    onSetColor: (block: TaskActivity, color: string) => void;
    onDelete: (id: number) => void;
    onInsertAfter: (index: number, type: 'checkbox' | 'text') => void;
    blockRefs: React.MutableRefObject<Map<number, HTMLInputElement>>;
}

const SortableBlock: React.FC<SortableBlockProps> = ({
    block, index, canEdit, focusedBlockId,
    onCheck, onBlur, onFocus, onKeyDown, onToggleType, onToggleBold, onSetColor, onDelete, onInsertAfter,
    blockRefs,
}) => {
    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging,
    } = useSortable({ id: block.id, disabled: !canEdit });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : 'auto' as any,
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
                    {block.block_type === 'checkbox' ? (
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

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TextField
                        inputRef={(el: HTMLInputElement | null) => {
                            if (el) blockRefs.current.set(block.id, el);
                            else blockRefs.current.delete(block.id);
                        }}
                        variant="standard"
                        fullWidth
                        multiline
                        defaultValue={block.content}
                        key={`${block.id}-${block.content}`}
                        placeholder={block.block_type === 'checkbox' ? '체크리스트 항목...' : '메모를 작성하세요...'}
                        onBlur={e => onBlur(block, e.target.value)}
                        onFocus={() => onFocus(block.id)}
                        onKeyDown={e => canEdit && onKeyDown(e, block, index)}
                        disabled={!canEdit}
                        InputProps={{
                            disableUnderline: true,
                            sx: {
                                fontSize: '0.9rem',
                                lineHeight: 1.6,
                                py: 0.3,
                                textDecoration: block.block_type === 'checkbox' && block.checked ? 'line-through' : 'none',
                                color: block.block_type === 'checkbox' && block.checked
                                    ? '#9CA3AF'
                                    : block.style?.color || '#374151',
                                fontWeight: block.style?.bold ? 700 : 400,
                            },
                        }}
                    />
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
                        <Tooltip title="굵게" arrow>
                            <IconButton
                                size="small"
                                onClick={() => onToggleBold(block)}
                                sx={{ color: block.style?.bold ? '#2955FF' : '#9CA3AF', p: 0.4 }}
                            >
                                <FormatBoldIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ display: 'flex', gap: 0.2, mx: 0.3 }}>
                            {COLORS.map(c => (
                                <Box
                                    key={c}
                                    onClick={() => onSetColor(block, c)}
                                    sx={{
                                        width: 12, height: 12, borderRadius: '50%',
                                        bgcolor: c, cursor: 'pointer',
                                        border: (block.style?.color || '#374151') === c ? '2px solid #2955FF' : '1px solid #E5E7EB',
                                        transition: 'transform 0.1s',
                                        '&:hover': { transform: 'scale(1.3)' },
                                    }}
                                />
                            ))}
                        </Box>
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
        </Box>
    );
};

/* ── Main Modal ── */
const WorkNoteModal: React.FC<WorkNoteModalProps> = ({ open, onClose, taskId, taskTitle, canEdit }) => {
    const queryClient = useQueryClient();
    const [focusedBlockId, setFocusedBlockId] = useState<number | null>(null);
    const blockRefs = useRef<Map<number, HTMLInputElement>>(new Map());
    const pendingFocusRef = useRef<number | null>(null);

    const { data: blocks = [] } = useQuery<TaskActivity[]>({
        queryKey: ['activities', taskId],
        queryFn: () => api.getTaskActivities(taskId),
        enabled: open && !!taskId,
    });

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['activities', taskId] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
                    if (el) el.focus();
                }, 50);
                pendingFocusRef.current = null;
            }
        }
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
            e.preventDefault();
            const orderIndex = block.order_index + 1;
            createMut.mutate({ content: '', block_type: block.block_type, order_index: orderIndex });
        }
        if (e.key === 'Backspace') {
            const input = e.target as HTMLInputElement;
            if (input.value === '' && blocks.length > 1) {
                e.preventDefault();
                if (index > 0) {
                    const prevId = blocks[index - 1].id;
                    setTimeout(() => {
                        const el = blockRefs.current.get(prevId);
                        if (el) {
                            el.focus();
                            el.setSelectionRange(el.value.length, el.value.length);
                        }
                    }, 50);
                }
                deleteMut.mutate(block.id);
            }
        }
    };

    const toggleBold = (block: TaskActivity) => {
        updateMut.mutate({
            id: block.id,
            style: { ...block.style, bold: !block.style?.bold },
        });
    };

    const setColor = (block: TaskActivity, color: string) => {
        updateMut.mutate({
            id: block.id,
            style: { ...block.style, color: color === '#374151' ? undefined : color },
        });
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

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth={false}
            PaperProps={{
                sx: {
                    width: '720px',
                    maxWidth: '90vw',
                    height: '85vh',
                    maxHeight: '85vh',
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
                    <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
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
                                onBlur={(b, val) => {
                                    if (val !== b.content) updateMut.mutate({ id: b.id, content: val });
                                }}
                                onFocus={setFocusedBlockId}
                                onKeyDown={handleKeyDown}
                                onToggleType={toggleBlockType}
                                onToggleBold={toggleBold}
                                onSetColor={setColor}
                                onDelete={(id) => deleteMut.mutate(id)}
                                onInsertAfter={insertAfter}
                                blockRefs={blockRefs}
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
        </Dialog>
    );
};

export default WorkNoteModal;
