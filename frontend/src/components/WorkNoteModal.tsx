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
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import type { TaskActivity, Task } from '../types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL } from '../api/client';

/** 백엔드가 돌려준 root-relative URL(/api/...)을 절대 URL로 보정.
 *  - 이미 절대 URL(http://, https://, data:, blob:) 이면 그대로.
 *  - WorkNote 는 5173(Vite) 에서 동작하지만 백엔드는 8085 라 prepend 필요. */
const toAbsoluteAttachmentUrl = (url: string): string => {
    if (!url) return url;
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    const baseUrl = API_URL.replace(/\/api\/?$/, '');
    return url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`;
};

/** 기존에 root-relative 로 저장된 <img src="/api/..."> 들을 in-place 로 절대 URL 로 보정.
 *  innerHTML 자체는 보존돼야 저장 시 의도치 않은 diff 가 나지 않음. 그래서 src 가 이미
 *  절대 URL 인 경우는 건드리지 않는다. */
const normalizeImagesInRoot = (root: HTMLElement) => {
    const imgs = root.querySelectorAll('img');
    imgs.forEach((img) => {
        const raw = img.getAttribute('src') || '';
        if (!raw) return;
        if (/^(https?:|data:|blob:)/i.test(raw)) return;
        img.setAttribute('src', toAbsoluteAttachmentUrl(raw));
    });
};
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ImagePreviewModal from './ImagePreviewModal';
import { useAppStore } from '../stores/useAppStore';

const COLORS = ['#374151', '#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#8B5CF6'];

/** Restore a previously saved selection range */
const restoreSelection = (range: Range | null) => {
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
};

/**
 * 클립보드 붙여넣기 이미지 압축/리사이즈.
 * - 1MB 미만이면 원본 그대로 (확장자만 보정).
 * - 큰 이미지: 긴 변 1920px 로 축소, JPEG q=0.85 (PNG 알파 감지 시 PNG 유지).
 * - 실패하면 원본 Blob 을 File 로 감싸서 반환 (절대 throw 하지 않음).
 */
async function compressPastedImage(blob: Blob, timestamp: number): Promise<File> {
    const SMALL_BYTES = 1024 * 1024; // 1MB
    const MAX_EDGE = 1920;
    const QUALITY = 0.85;
    const sourceType = blob.type || 'image/png';
    const fallbackExt = sourceType.includes('jpeg') || sourceType.includes('jpg') ? 'jpg' : 'png';
    const fallback = new File([blob], `work-note-paste-${timestamp}.${fallbackExt}`, { type: sourceType });
    if (blob.size <= SMALL_BYTES) return fallback;
    try {
        const url = URL.createObjectURL(blob);
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('image decode failed'));
                img.src = url;
            });
            const w = image.naturalWidth || image.width;
            const h = image.naturalHeight || image.height;
            if (!w || !h) return fallback;
            const longEdge = Math.max(w, h);
            const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
            const tw = Math.max(1, Math.round(w * scale));
            const th = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext('2d');
            if (!ctx) return fallback;
            ctx.drawImage(image, 0, 0, tw, th);
            // PNG 원본은 알파를 보존(투명 배경 캡처 대비). 그 외엔 JPEG 로 압축.
            const isPng = sourceType.includes('png');
            const outType = isPng ? 'image/png' : 'image/jpeg';
            const outExt = isPng ? 'png' : 'jpg';
            const outBlob: Blob | null = await new Promise((resolve) =>
                canvas.toBlob((b) => resolve(b), outType, QUALITY)
            );
            if (!outBlob) return fallback;
            // 압축 결과가 더 크면 (이미 작은 PNG 등) 원본 사용.
            if (outBlob.size >= blob.size) return fallback;
            return new File([outBlob], `work-note-paste-${timestamp}.${outExt}`, { type: outType });
        } finally {
            URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('compressPastedImage failed, using original:', e);
        return fallback;
    }
}

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
    taskId: number;
    isUploading: boolean;
    setIsUploading: (val: boolean) => void;
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
    onImageClick, taskId, isUploading, setIsUploading,
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
            normalizeImagesInRoot(contentRef.current);
            lastSavedContent.current = block.content;
        }
    }, [block.content]);

    // Initialize content on mount
    useEffect(() => {
        if (contentRef.current && !contentRef.current.innerHTML && block.content) {
            contentRef.current.innerHTML = block.content;
            normalizeImagesInRoot(contentRef.current);
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
    const [selectedImg, setSelectedImg] = useState<{ el: HTMLImageElement; rect: DOMRect } | null>(null);
    const dragRef = useRef<{ startX: number; startWidth: number; el: HTMLImageElement } | null>(null);
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
            if (!selectedImg) setHoveredImg(null);
            setHoveredTable(null);
        }, 250);
    };
    useEffect(() => () => cancelHideTimer(), []);

    useEffect(() => {
        if (!hoveredImg && !hoveredTable && !selectedImg) return;
        const handler = () => {
            if (selectedImg?.el) {
                setSelectedImg({ el: selectedImg.el, rect: selectedImg.el.getBoundingClientRect() });
            } else {
                setHoveredImg(null);
            }
            setHoveredTable(null);
        };
        window.addEventListener('scroll', handler, true);
        return () => window.removeEventListener('scroll', handler, true);
    }, [hoveredImg, hoveredTable, selectedImg]);

    useEffect(() => {
        if (!selectedImg) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest('[data-img-toolbar="1"]')) return;
            if (t.closest('[data-img-resize-handle="1"]')) return;
            if (t === selectedImg.el) return;
            setSelectedImg(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [selectedImg]);

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

    const persistContent = useCallback(() => {
        if (!contentRef.current) return;
        const html = contentRef.current.innerHTML;
        lastSavedContent.current = html;
        onContentChange(block, html);
    }, [block, onContentChange]);

    const applyTableState = (table: HTMLTableElement) => {
        const fit = table.getAttribute('data-fit-mode') === 'fit';
        const wrap = table.getAttribute('data-wrap-text') === 'true';
        if (fit) {
            table.style.width = '100%';
            table.style.maxWidth = '100%';
            table.style.tableLayout = 'fixed';
        } else {
            table.style.width = '';
            table.style.maxWidth = '';
            table.style.tableLayout = '';
        }
        const cellWrap = fit || wrap;
        const cells = table.querySelectorAll('th, td');
        cells.forEach((c) => {
            const cell = c as HTMLElement;
            if (cellWrap) {
                cell.style.whiteSpace = 'normal';
                cell.style.wordBreak = 'break-word';
                cell.style.overflowWrap = 'anywhere';
            } else {
                cell.style.whiteSpace = '';
                cell.style.wordBreak = '';
                cell.style.overflowWrap = '';
            }
        });
    };

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
        if (!canEdit) return;

        // 1. Try HTML Table paste from Excel or web
        const htmlData = e.clipboardData.getData('text/html');
        if (htmlData) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlData, 'text/html');
            const table = doc.querySelector('table');
            if (table) {
                e.preventDefault();
                const cleanTable = document.createElement('table');
                cleanTable.className = 'work-note-table';
                cleanTable.innerHTML = table.innerHTML;
                
                // Strip scripts and dangerous attributes
                const scripts = cleanTable.querySelectorAll('script');
                scripts.forEach(s => s.remove());
                const allNodes = cleanTable.querySelectorAll('*');
                allNodes.forEach(node => {
                    Array.from(node.attributes).forEach(attr => {
                        if (attr.name.toLowerCase().startsWith('on')) {
                            node.removeAttribute(attr.name);
                        }
                    });
                });

                cleanTable.style.borderCollapse = 'collapse';
                cleanTable.setAttribute('data-fit-mode', 'fit'); // Default to width fit
                const cells = cleanTable.querySelectorAll('th, td');
                cells.forEach(c => {
                    const cell = c as HTMLElement;
                    cell.style.border = '1px solid #E5E7EB';
                    cell.style.padding = '8px';
                });
                applyTableState(cleanTable);

                const sel = window.getSelection();
                const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
                if (range && contentRef.current && contentRef.current.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    range.insertNode(cleanTable);
                    range.setStartAfter(cleanTable);
                    range.collapse(true);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                } else if (contentRef.current) {
                    contentRef.current.appendChild(cleanTable);
                }
                persistContent();
                return;
            }
        }

        // 2. Try TSV plain text paste
        const plainData = e.clipboardData.getData('text/plain');
        if (plainData) {
            const rows = plainData.split(/\r?\n/).filter(r => r.trim() !== '');
            const isTsv = rows.length >= 1 && rows.some(r => r.includes('\t'));
            if (isTsv) {
                e.preventDefault();
                const cleanTable = document.createElement('table');
                cleanTable.className = 'work-note-table';
                cleanTable.style.borderCollapse = 'collapse';
                cleanTable.setAttribute('data-fit-mode', 'fit');
                
                const tbody = document.createElement('tbody');
                rows.forEach(row => {
                    const tr = document.createElement('tr');
                    row.split('\t').forEach(cell => {
                        const td = document.createElement('td');
                        td.textContent = cell;
                        td.style.border = '1px solid #E5E7EB';
                        td.style.padding = '8px';
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                cleanTable.appendChild(tbody);
                applyTableState(cleanTable);

                const sel = window.getSelection();
                const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
                if (range && contentRef.current && contentRef.current.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    range.insertNode(cleanTable);
                    range.setStartAfter(cleanTable);
                    range.collapse(true);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                } else if (contentRef.current) {
                    contentRef.current.appendChild(cleanTable);
                }
                persistContent();
                return;
            }
        }

        const items = Array.from(e.clipboardData?.items || []);
        const imageItems = items.filter((it) => it.type && it.type.startsWith('image/'));
        if (imageItems.length === 0) return;
        e.preventDefault();

        setIsUploading(true);
        let pendingCount = imageItems.length;

        imageItems.forEach(async (item) => {
            const fileBlob = item.getAsFile();
            if (!fileBlob) {
                pendingCount -= 1;
                if (pendingCount <= 0) setIsUploading(false);
                return;
            }

            const timestamp = Date.now();
            const file = await compressPastedImage(fileBlob, timestamp);

            try {
                const currentUserId = useAppStore.getState().currentUserId || 1;
                const response = await api.uploadTaskFile(taskId, file, currentUserId);
                const imageUrl = toAbsoluteAttachmentUrl(response.url);

                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = '붙여넣은 이미지';

                const sel = window.getSelection();
                const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
                if (range && contentRef.current && contentRef.current.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    range.insertNode(img);
                    range.setStartAfter(img);
                    range.collapse(true);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                } else if (contentRef.current) {
                    contentRef.current.appendChild(img);
                }
            } catch (err: any) {
                console.error('Image upload failed:', err);
                const status = err?.response?.status;
                const detail = err?.response?.data?.detail;
                let msg = '이미지 업로드에 실패했습니다.';
                if (status === 401 || status === 403) {
                    msg = '이미지 업로드 권한이 없습니다.';
                } else if (status === 413) {
                    msg = '이미지 용량이 너무 커서 업로드할 수 없습니다. (서버 한도 초과)';
                } else if (status === 404) {
                    msg = '대상 작업을 찾을 수 없어 업로드할 수 없습니다.';
                } else if (status && status >= 500) {
                    msg = '서버 오류로 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.';
                } else if (!status) {
                    msg = '네트워크 오류로 업로드에 실패했습니다.';
                }
                if (detail && typeof detail === 'string') msg += `\n사유: ${detail}`;
                alert(msg);
            } finally {
                pendingCount -= 1;
                if (pendingCount <= 0) {
                    setIsUploading(false);
                    persistContent();
                }
            }
        });
    }, [canEdit, taskId, persistContent, setIsUploading]);

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
        persistContent();
        requestAnimationFrame(() => {
            const rect = img.getBoundingClientRect();
            setHoveredImg(prev => prev ? { el: img, rect } : null);
            setSelectedImg(prev => prev && prev.el === img ? { el: img, rect } : prev);
        });
    };

    const startImageDragResize = useCallback((startEvent: React.PointerEvent, img: HTMLImageElement) => {
        startEvent.preventDefault();
        startEvent.stopPropagation();
        const startWidth = img.offsetWidth || img.naturalWidth || 200;
        dragRef.current = { startX: startEvent.clientX, startWidth, el: img };
        (startEvent.target as HTMLElement).setPointerCapture?.(startEvent.pointerId);

        const onMove = (e: PointerEvent) => {
            const ref = dragRef.current;
            if (!ref) return;
            const dx = e.clientX - ref.startX;
            const next = Math.max(50, Math.min(2000, Math.round(ref.startWidth + dx)));
            ref.el.style.width = `${next}px`;
            ref.el.style.height = 'auto';
            ref.el.setAttribute('data-note-width', String(next));
            const rect = ref.el.getBoundingClientRect();
            setSelectedImg({ el: ref.el, rect });
            setHoveredImg(prev => prev ? { el: ref.el, rect } : prev);
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            const ref = dragRef.current;
            dragRef.current = null;
            if (ref) {
                persistContent();
            }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [persistContent]);

    const resizeTable = (table: HTMLTableElement, action: 'fit' | 'natural' | 'wrap' | 'fontUp' | 'fontDown') => {
        if (action === 'fit') {
            table.setAttribute('data-fit-mode', 'fit');
            applyTableState(table);
        } else if (action === 'natural') {
            table.removeAttribute('data-fit-mode');
            applyTableState(table);
        } else if (action === 'wrap') {
            const wrapped = table.getAttribute('data-wrap-text') === 'true';
            if (wrapped) table.removeAttribute('data-wrap-text');
            else table.setAttribute('data-wrap-text', 'true');
            applyTableState(table);
        } else {
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

    useEffect(() => {
        if (!contentRef.current) return;
        const tables = contentRef.current.querySelectorAll<HTMLTableElement>('table[data-fit-mode], table[data-wrap-text]');
        tables.forEach((t) => applyTableState(t));
    }, [block.content]);

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

                <Box sx={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <Box
                        ref={contentRef}
                        contentEditable={canEdit && !isUploading}
                        suppressContentEditableWarning
                        onBlur={handleBlur}
                        onFocus={() => onFocus(block.id)}
                        onKeyDown={e => canEdit && handleKeyDownInternal(e)}
                        onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target instanceof HTMLImageElement) {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelHideTimer();
                                const rect = target.getBoundingClientRect();
                                setSelectedImg({ el: target, rect });
                                setHoveredImg({ el: target, rect });
                            }
                        }}
                        onDoubleClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target instanceof HTMLImageElement) {
                                e.preventDefault();
                                e.stopPropagation();
                                onImageClick(target.src, target.alt);
                            }
                        }}
                        onMouseOver={handleEditorMouseOver}
                        onMouseOut={handleEditorMouseOut}
                        onPaste={handlePaste}
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
                            '& img': {
                                maxWidth: 'none',
                                height: 'auto',
                                cursor: 'pointer',
                                borderRadius: 1,
                                display: 'block',
                                my: 0.5,
                                userSelect: 'none',
                                WebkitUserDrag: 'none',
                            },
                            '& table': {
                                width: 'max-content',
                                maxWidth: 'none',
                                borderCollapse: 'collapse',
                                my: 0.5,
                                fontSize: '0.85rem',
                            },
                            '& table[data-fit-mode="fit"]': {
                                width: '100%',
                            },
                            '& th, & td': {
                                border: '1px solid #E5E7EB',
                                padding: '6px 10px',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'top',
                            },
                            '& table[data-fit-mode="fit"] th, & table[data-fit-mode="fit"] td': {
                                whiteSpace: 'normal',
                            },
                            '& table[data-wrap-text="true"] th, & table[data-wrap-text="true"] td': {
                                whiteSpace: 'normal',
                            },
                            '& th': {
                                bgcolor: '#F9FAFB',
                                fontWeight: 600,
                            },
                        }}
                    />
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

            {canEdit && (() => {
                const active = selectedImg ?? hoveredImg;
                if (!active) return null;
                return (
                    <Box
                        data-img-toolbar="1"
                        onMouseEnter={cancelHideTimer}
                        onMouseLeave={scheduleHide}
                        onMouseDown={(e) => e.preventDefault()}
                        sx={{
                            position: 'fixed',
                            top: Math.max(4, active.rect.top + 4),
                            left: active.rect.right - 4,
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
                            <IconButton size="small" onClick={() => resizeImage(active.el, 'shrink')}
                                sx={{ color: '#fff', p: 0.4 }}>
                                <RemoveIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="확대 (+50px)" arrow>
                            <IconButton size="small" onClick={() => resizeImage(active.el, 'grow')}
                                sx={{ color: '#fff', p: 0.4 }}>
                                <AddIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.25)', mx: 0.25 }} />
                        <Tooltip title="컨테이너 폭에 맞춤" arrow>
                            <IconButton size="small" onClick={() => resizeImage(active.el, 'fit')}
                                sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 32, borderRadius: 999 }}>
                                100%
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="원본 크기로 복원" arrow>
                            <IconButton size="small" onClick={() => resizeImage(active.el, 'reset')}
                                sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 32, borderRadius: 999 }}>
                                원본
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.25)', mx: 0.25 }} />
                        <Tooltip title="확대 보기" arrow>
                            <IconButton size="small"
                                onClick={() => onImageClick(active.el.src, active.el.alt)}
                                sx={{ color: '#fff', p: 0.4 }}>
                                <ZoomOutMapIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            })()}

            {canEdit && selectedImg && (
                <>
                    <Box
                        sx={{
                            position: 'fixed',
                            top: selectedImg.rect.top - 2,
                            left: selectedImg.rect.left - 2,
                            width: selectedImg.rect.width + 4,
                            height: selectedImg.rect.height + 4,
                            border: '2px solid #2955FF',
                            borderRadius: 1,
                            pointerEvents: 'none',
                            zIndex: 1499,
                            boxSizing: 'border-box',
                        }}
                    />
                    <Box
                        data-img-resize-handle="1"
                        onPointerDown={(e) => startImageDragResize(e, selectedImg.el)}
                        onMouseDown={(e) => e.preventDefault()}
                        sx={{
                            position: 'fixed',
                            top: selectedImg.rect.bottom - 8,
                            left: selectedImg.rect.right - 8,
                            width: 16, height: 16,
                            bgcolor: '#2955FF',
                            border: '2px solid #fff',
                            borderRadius: 0.5,
                            cursor: 'nwse-resize',
                            zIndex: 1501,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                            touchAction: 'none',
                        }}
                    />
                </>
            )}

            {canEdit && hoveredTable && (() => {
                const fitMode = hoveredTable.el.getAttribute('data-fit-mode') === 'fit';
                const wrapped = hoveredTable.el.getAttribute('data-wrap-text') === 'true';
                const activeSx = { bgcolor: 'rgba(255,255,255,0.18)' };
                return (
                    <Box
                        onMouseEnter={cancelHideTimer}
                        onMouseLeave={scheduleHide}
                        onMouseDown={(e) => e.preventDefault()}
                        sx={{
                            position: 'fixed',
                            top: Math.max(4, hoveredTable.rect.top + 4),
                            left: hoveredTable.rect.right - 4,
                            transform: 'translateX(-100%)',
                            zIndex: 1500,
                            display: 'flex', alignItems: 'center', gap: 0.25,
                            px: 0.5, py: 0.25, borderRadius: 999,
                            bgcolor: 'rgba(30,30,30,0.92)',
                            backdropFilter: 'blur(6px)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                        }}
                    >
                        <Tooltip title="컨테이너 폭에 맞춤" arrow>
                            <IconButton size="small" onClick={() => resizeTable(hoveredTable.el, 'fit')}
                                sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 44, borderRadius: 999, ...(fitMode ? activeSx : {}) }}>
                                폭맞춤
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="원본 폭(가로 스크롤)" arrow>
                            <IconButton size="small" onClick={() => resizeTable(hoveredTable.el, 'natural')}
                                sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 36, borderRadius: 999, ...(!fitMode ? activeSx : {}) }}>
                                원본
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.25)', mx: 0.25 }} />
                        <Tooltip title="셀 내용 줄바꿈" arrow>
                            <IconButton size="small" onClick={() => resizeTable(hoveredTable.el, 'wrap')}
                                sx={{ color: '#fff', p: 0.4, fontSize: '0.65rem', fontWeight: 700, minWidth: 44, borderRadius: 999, ...(wrapped ? activeSx : {}) }}>
                                줄바꿈
                            </IconButton>
                        </Tooltip>
                        <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.25)', mx: 0.25 }} />
                        <Tooltip title="글씨 작게" arrow>
                            <IconButton size="small" onClick={() => resizeTable(hoveredTable.el, 'fontDown')}
                                sx={{ color: '#fff', p: 0.4 }}>
                                <RemoveIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="글씨 크게" arrow>
                            <IconButton size="small" onClick={() => resizeTable(hoveredTable.el, 'fontUp')}
                                sx={{ color: '#fff', p: 0.4 }}>
                                <AddIcon sx={{ fontSize: '0.85rem' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            })()}
        </Box>
    );
};

/* ── Main Modal ── */
const WorkNoteModal: React.FC<WorkNoteModalProps> = ({ open, onClose, taskId, taskTitle, canEdit }) => {
    const queryClient = useQueryClient();
    const [focusedBlockId, setFocusedBlockId] = useState<number | null>(null);
    const [showColorPicker, setShowColorPicker] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const pendingFocusRef = useRef<number | null>(null);
    const savedSelection = useRef<Range | null>(null);
    const [previewImage, setPreviewImage] = useState<{ src: string; alt?: string } | null>(null);
    const handleImageClick = useCallback((src: string, alt?: string) => {
        setPreviewImage({ src, alt });
    }, []);

    const PAPER_KEY = 'workNote.paperSize.v1';
    const [paperSize, setPaperSize] = useState<{ w: number; h: number }>(() => {
        try {
            const saved = localStorage.getItem(PAPER_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (typeof parsed?.w === 'number' && typeof parsed?.h === 'number') return parsed;
            }
        } catch { /* ignore */ }
        return { w: 820, h: Math.round(window.innerHeight * 0.9) };
    });

    const paperDragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
    const startPaperResize = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        paperDragRef.current = {
            startX: e.clientX, startY: e.clientY,
            startW: paperSize.w, startH: paperSize.h,
        };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const onMove = (ev: PointerEvent) => {
            const ref = paperDragRef.current;
            if (!ref) return;
            const dw = ev.clientX - ref.startX;
            const dh = ev.clientY - ref.startY;
            const nextW = Math.max(420, Math.min(window.innerWidth - 24, ref.startW + dw));
            const nextH = Math.max(360, Math.min(window.innerHeight - 24, ref.startH + dh));
            setPaperSize({ w: nextW, h: nextH });
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            paperDragRef.current = null;
            try { localStorage.setItem(PAPER_KEY, JSON.stringify(paperSize)); } catch { /* ignore */ }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [paperSize]);

    useEffect(() => {
        try { localStorage.setItem(PAPER_KEY, JSON.stringify(paperSize)); } catch { /* ignore */ }
    }, [paperSize.w, paperSize.h]);

    const { data: blocks = [] } = useQuery<TaskActivity[]>({
        queryKey: ['activities', taskId],
        queryFn: () => api.getTaskActivities(taskId),
        enabled: open && !!taskId,
    });

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['activities', taskId] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['roadmap'] });
        queryClient.invalidateQueries({ queryKey: ['globalRoadmap'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, [queryClient, taskId]);

    const applyTaskSync = useCallback((response: any) => {
        const tProgress: number | null | undefined = response?.task_progress;
        const tStatus: string | null | undefined = response?.task_status;
        if (typeof tProgress !== 'number' && typeof tStatus !== 'string') return;
        queryClient.setQueriesData<Task[]>(
            { queryKey: ['tasks'] },
            (old) => Array.isArray(old)
                ? old.map(t => {
                    if (t.id !== taskId) return t;
                    const patch: Partial<Task> = {};
                    if (typeof tProgress === 'number') patch.progress = tProgress;
                    if (typeof tStatus === 'string') patch.status = tStatus as Task['status'];
                    return { ...t, ...patch };
                })
                : old,
        );
        const sel = useAppStore.getState().selectedTask;
        if (sel && sel.id === taskId) {
            const patch: Partial<Task> = {};
            if (typeof tProgress === 'number') patch.progress = tProgress;
            if (typeof tStatus === 'string') patch.status = tStatus as Task['status'];
            useAppStore.setState({ selectedTask: { ...sel, ...patch } });
        }
    }, [queryClient, taskId]);

    const createMut = useMutation({
        mutationFn: (data: { content: string; block_type: string; checked?: boolean; style?: any; order_index?: number }) =>
            api.createTaskActivity(taskId, data),
        onSuccess: (newBlock: any) => {
            pendingFocusRef.current = newBlock.id;
            applyTaskSync(newBlock);
            invalidate();
        },
        onError: (err) => {
            alert('노트 블록 생성 실패: ' + (err instanceof Error ? err.message : String(err)));
        }
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...data }: { id: number } & Partial<TaskActivity>) =>
            api.updateTaskActivity(id, data),
        onSuccess: (response: any) => {
            applyTaskSync(response);
            invalidate();
        },
        onError: (err) => {
            alert('노트 블록 저장 실패. 이미지 용량이 너무 크거나 네트워크 문제일 수 있습니다.\n에러: ' + (err instanceof Error ? err.message : String(err)));
        }
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => api.deleteTaskActivity(id),
        onSuccess: invalidate,
    });

    const reorderMut = useMutation({
        mutationFn: (order: number[]) => api.reorderTaskActivities(taskId, order),
        onSuccess: invalidate,
    });

    useEffect(() => {
        if (pendingFocusRef.current && blocks.length > 0) {
            const targetId = pendingFocusRef.current;
            const found = blocks.find(b => b.id === targetId);
            if (found) {
                setTimeout(() => {
                    const el = blockRefs.current.get(targetId);
                    if (el) {
                        el.focus();
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
    const handleCopyAll = useCallback(async () => {
        // HTML: <table>, <img>, 스타일 그대로 보존. 외부 (Excel/Word/Notion) 에 붙여넣어도 표 유지.
        // src 는 절대 URL 로 정규화해야 다른 origin (Excel 등) 에서도 이미지 fetch 가능.
        const buildBlockHtml = (b: typeof blocks[number]): string => {
            const isCheckbox = (b.block_type || 'checkbox') === 'checkbox';
            const tmp = document.createElement('div');
            tmp.innerHTML = b.content || '';
            tmp.querySelectorAll('img').forEach((img) => {
                const raw = img.getAttribute('src') || '';
                if (raw && !/^(https?:|data:)/i.test(raw)) {
                    img.setAttribute('src', toAbsoluteAttachmentUrl(raw));
                }
                img.removeAttribute('crossorigin');
            });
            const inner = tmp.innerHTML;
            if (isCheckbox) {
                const mark = b.checked ? '☑' : '☐';
                return `<div>${mark}&nbsp;${inner}</div>`;
            }
            return `<div>${inner}</div>`;
        };
        const html = `<div>${blocks.map(buildBlockHtml).join('')}</div>`;

        // Plain text fallback (외부 에디터가 text/plain 만 받는 경우 + 일반 메모장).
        const buildBlockText = (b: typeof blocks[number]): string => {
            const tmp = document.createElement('div');
            tmp.innerHTML = b.content || '';
            const plain = (tmp.textContent || '').replace(/\u00A0/g, ' ').trim();
            if ((b.block_type || 'checkbox') === 'checkbox') {
                return `${b.checked ? '[x]' : '[ ]'} ${plain}`;
            }
            return plain;
        };
        const text = blocks.map(buildBlockText).join('\n');

        const flash = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };

        try {
            if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                const item = new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                });
                await navigator.clipboard.write([item]);
                flash();
                return;
            }
        } catch (err) {
            // ClipboardItem 미지원 또는 권한 거부 시 fallback
            console.warn('clipboard.write failed, falling back to writeText:', err);
        }
        try {
            await navigator.clipboard.writeText(text);
            flash();
        } catch (err) {
            console.error('clipboard.writeText failed:', err);
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
            if (block.block_type === 'checkbox') {
                e.preventDefault();
                const orderIndex = block.order_index + 1;
                createMut.mutate({ content: '', block_type: 'checkbox', order_index: orderIndex });
            }
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

    useEffect(() => {
        if (showColorPicker === null) return;
        const handler = () => setShowColorPicker(null);
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
                    width: paperSize.w + 'px',
                    maxWidth: '98vw',
                    height: paperSize.h + 'px',
                    maxHeight: '98vh',
                    borderRadius: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    position: 'relative',
                },
            }}
        >
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

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ flex: 1, position: 'relative' }}>
                        <LinearProgress
                            variant="determinate"
                            value={progress}
                            sx={{
                                height: 6, borderRadius: 3,
                                bgcolor: '#E5E7EB',
                                '& .MuiLinearProgress-bar': {
                                    bgcolor: progress >= 100 ? '#22C55E' : '#2955FF',
                                    borderRadius: 3,
                                },
                            }}
                        />
                        {isUploading && (
                            <LinearProgress 
                                sx={{ 
                                    position: 'absolute', top: 0, left: 0, right: 0, height: 6, borderRadius: 3,
                                    '& .MuiLinearProgress-bar': { bgcolor: '#F59E0B' }
                                }} 
                            />
                        )}
                    </Box>
                    <Typography variant="caption" sx={{
                        fontWeight: 700, fontSize: '0.75rem', minWidth: 48, textAlign: 'right',
                        color: progress >= 100 ? '#22C55E' : '#6B7280',
                    }}>
                        {isUploading ? '업로드 중...' : (totalCheckboxes > 0 ? `${checkedCount}/${totalCheckboxes}` : '0/0')}
                    </Typography>
                </Box>
            </Box>

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
                                taskId={taskId}
                                isUploading={isUploading}
                                setIsUploading={setIsUploading}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </Box>

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

            <ImagePreviewModal
                src={previewImage?.src ?? null}
                alt={previewImage?.alt}
                onClose={() => setPreviewImage(null)}
            />

            <Box
                onPointerDown={startPaperResize}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="작업노트 크기 조절"
                sx={{
                    position: 'absolute',
                    right: 4, bottom: 4,
                    width: 16, height: 16,
                    cursor: 'nwse-resize',
                    zIndex: 10,
                    background: `linear-gradient(135deg, transparent 0 50%, #9CA3AF 50% 60%, transparent 60% 70%, #9CA3AF 70% 80%, transparent 80% 90%, #9CA3AF 90% 100%)`,
                    borderRadius: '0 0 12px 0',
                    touchAction: 'none',
                    opacity: 0.7,
                    '&:hover': { opacity: 1 },
                }}
            />
        </Dialog>
    );
};

export default WorkNoteModal;
