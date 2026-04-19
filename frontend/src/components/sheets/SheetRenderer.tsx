/**
 * SheetRenderer — Excel 원형 유사 렌더링 컴포넌트
 * 병합셀, 색상, 폰트, 테두리, 줄바꿈을 최대한 유지하여 웹에서 표시
 */
import { useMemo } from 'react';
import { Box, Checkbox, Typography, Tooltip } from '@mui/material';
import type { SheetStructure, SheetCell, SheetExecutionItem } from '../../types';

interface Props {
  structure: SheetStructure;
  executionItems?: SheetExecutionItem[];
  onCheckChange?: (cellRef: string, rowIdx: number, colIdx: number, checked: boolean) => void;
  onMemoChange?: (cellRef: string, rowIdx: number, colIdx: number, memo: string) => void;
  readOnly?: boolean;
}

const DEFAULT_COL_WIDTH = 80;
const DEFAULT_ROW_HEIGHT = 28;
const MIN_COL_WIDTH = 40;

function borderStyle(style?: string): string {
  if (!style) return 'none';
  if (style === 'thin') return '1px solid #D1D5DB';
  if (style === 'medium') return '2px solid #9CA3AF';
  if (style === 'thick') return '3px solid #6B7280';
  if (style === 'dashed') return '1px dashed #D1D5DB';
  if (style === 'dotted') return '1px dotted #D1D5DB';
  return '1px solid #D1D5DB';
}

export default function SheetRenderer({ structure, executionItems, onCheckChange, readOnly }: Props) {
  const { cells, merges, col_widths, row_heights, total_rows, total_cols, checkable_cells } = structure;

  // Build cell map for O(1) lookup
  const cellMap = useMemo(() => {
    const map = new Map<string, SheetCell>();
    for (const cell of cells) {
      map.set(`${cell.row}-${cell.col}`, cell);
    }
    return map;
  }, [cells]);

  // Build checkable set
  const checkableSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of (checkable_cells || [])) {
      set.add(`${c.row}-${c.col}`);
    }
    return set;
  }, [checkable_cells]);

  // Build execution items map
  const execItemMap = useMemo(() => {
    const map = new Map<string, SheetExecutionItem>();
    for (const item of (executionItems || [])) {
      map.set(`${item.row_idx}-${item.col_idx}`, item);
    }
    return map;
  }, [executionItems]);

  // Build hidden cells set (cells hidden by merges)
  const hiddenCells = useMemo(() => {
    const set = new Set<string>();
    for (const merge of (merges || [])) {
      for (let r = merge.startRow; r <= merge.endRow; r++) {
        for (let c = merge.startCol; c <= merge.endCol; c++) {
          if (r !== merge.startRow || c !== merge.startCol) {
            set.add(`${r}-${c}`);
          }
        }
      }
    }
    return set;
  }, [merges]);

  const colWidths = useMemo(() => {
    const widths: number[] = [];
    for (let c = 0; c < total_cols; c++) {
      const w = col_widths?.[c] || 8.43;
      widths.push(Math.max(MIN_COL_WIDTH, Math.round(w * 8)));
    }
    return widths;
  }, [col_widths, total_cols]);

  const rowHeights = useMemo(() => {
    const heights: number[] = [];
    for (let r = 0; r < total_rows; r++) {
      const h = row_heights?.[r] || 15;
      heights.push(Math.max(DEFAULT_ROW_HEIGHT, Math.round(h * 1.5)));
    }
    return heights;
  }, [row_heights, total_rows]);

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: 1, bgcolor: '#fff' }}>
      <Box sx={{ display: 'inline-block', minWidth: totalWidth }}>
        {Array.from({ length: total_rows }, (_, rowIdx) => (
          <Box
            key={rowIdx}
            sx={{ display: 'flex', minHeight: rowHeights[rowIdx] || DEFAULT_ROW_HEIGHT }}
          >
            {Array.from({ length: total_cols }, (_, colIdx) => {
              const key = `${rowIdx}-${colIdx}`;
              if (hiddenCells.has(key)) return null;

              const cell = cellMap.get(key);
              const isCheckable = checkableSet.has(key);
              const execItem = execItemMap.get(key);
              const rowSpan = cell?.rowSpan || 1;
              const colSpan = cell?.colSpan || 1;

              // Calculate width/height for merged cells
              let width = 0;
              for (let c = colIdx; c < colIdx + colSpan && c < total_cols; c++) {
                width += colWidths[c] || DEFAULT_COL_WIDTH;
              }
              let height = 0;
              for (let r = rowIdx; r < rowIdx + rowSpan && r < total_rows; r++) {
                height += rowHeights[r] || DEFAULT_ROW_HEIGHT;
              }

              const bg = cell?.bg || (rowIdx === 0 ? '#F9FAFB' : undefined);
              const font = cell?.font;
              const borders = cell?.borders;

              return (
                <Box
                  key={key}
                  sx={{
                    width, minWidth: width, height, minHeight: height,
                    display: 'flex', alignItems: 'center',
                    px: 0.5, py: 0.2,
                    bgcolor: bg || 'transparent',
                    borderRight: borderStyle(borders?.right || 'thin'),
                    borderBottom: borderStyle(borders?.bottom || 'thin'),
                    borderLeft: colIdx === 0 ? borderStyle(borders?.left || 'thin') : 'none',
                    borderTop: rowIdx === 0 ? borderStyle(borders?.top || 'thin') : 'none',
                    overflow: 'hidden',
                    position: 'relative',
                    justifyContent: cell?.align === 'center' ? 'center' : cell?.align === 'right' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {isCheckable ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', justifyContent: cell?.align === 'center' ? 'center' : 'flex-start' }}>
                      <Tooltip title={execItem?.memo || ''} placement="top" arrow>
                        <span>
                          <Checkbox
                            size="small"
                            checked={execItem?.checked ?? false}
                            disabled={readOnly}
                            onChange={(e) => onCheckChange?.(
                              checkable_cells?.find(c => c.row === rowIdx && c.col === colIdx)?.ref || key,
                              rowIdx, colIdx, e.target.checked
                            )}
                            sx={{ p: 0, '& .MuiSvgIcon-root': { fontSize: 18 } }}
                          />
                        </span>
                      </Tooltip>
                      {(execItem?.value || cell?.value) && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: font?.bold ? 700 : 500,
                            color: (execItem?.value || cell?.value || '').includes('미완료') ? '#DC2626'
                              : (execItem?.value || cell?.value || '').includes('완료') ? '#16A34A'
                              : font?.fontColor || '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {execItem?.value ?? cell?.value ?? ''}
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: font?.fontSize ? Math.min(font.fontSize, 12) * 0.75 + 'rem' : '0.72rem',
                        fontWeight: font?.bold ? 700 : 400,
                        fontStyle: font?.italic ? 'italic' : 'normal',
                        color: font?.fontColor || 'inherit',
                        whiteSpace: cell?.wrapText ? 'pre-wrap' : 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.3,
                        width: '100%',
                        textAlign: (cell?.align as any) || 'left',
                      }}
                    >
                      {cell?.value || ''}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
