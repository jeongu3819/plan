/**
 * SheetRenderer — Excel 원형 유사 렌더링 컴포넌트
 * 병합셀, 색상, 폰트, 테두리, 줄바꿈을 최대한 유지하여 웹에서 표시
 * v3.1: column_roles 기반 체크 + 점검일시 연동, checkedMap/checkedAtMap 직접 지원
 */
import { useMemo, useCallback, useState } from 'react';
import { Box, Checkbox, Typography, Tooltip, TextField, Select, MenuItem } from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { SheetStructure, SheetCell, SheetExecutionItem, ColumnRoleMapping } from '../../types';

// 여부성 상태 옵션 (내부값은 O/X/N/A 유지, UI 라벨은 진행/미진행/N/A)
export const STATUS_OPTIONS = ['O', 'X', 'N/A'] as const;
export type StatusValue = typeof STATUS_OPTIONS[number] | '';

/** 내부 상태값 → 사용자에게 보여줄 라벨 */
export function statusLabel(v: StatusValue): string {
  if (v === 'O') return '진행';
  if (v === 'X') return '미진행';
  if (v === 'N/A') return 'N/A';
  return '';
}

interface Props {
  structure: SheetStructure;
  executionItems?: SheetExecutionItem[];
  /** v3.1: 직접 체크 상태 전달 (cell_ref → checked) */
  checkedMap?: Map<string, boolean>;
  /** v3.1: 체크 시 점검일시 전달 (cell_ref → ISO string) */
  checkedAtMap?: Map<string, string>;
  /** v3.1: 컬럼 역할 매핑 (체크상태/점검일시/담당자 등) */
  columnRoles?: ColumnRoleMapping | null;
  onCheckChange?: (cellRef: string, checked: boolean) => void;
  /** v3.1: 텍스트/기타 컬럼 편집 지원 (cell_ref → value) */
  valueMap?: Map<string, string>;
  onValueChange?: (cellRef: string, value: string) => void;
  /** v3.2: 상태(여부성) 컬럼을 O/X/N/A dropdown으로 처리할 때 호출.
   *  onCheckChange 대신 이걸 제공하면 check_status 셀은 Select UI로 렌더된다. */
  onStatusChange?: (cellRef: string, status: StatusValue, rowIdx: number, colIdx: number) => void;
  readOnly?: boolean;
}

const DEFAULT_COL_WIDTH = 64; // ~8.43 in Excel
const DEFAULT_ROW_HEIGHT = 22; // ~15pt in Excel
const MIN_COL_WIDTH = 24;

function borderStyle(style?: string): string {
  if (!style) return 'none';
  if (style === 'thin') return '1px solid #D1D5DB';
  if (style === 'medium') return '2px solid #9CA3AF';
  if (style === 'thick') return '3px solid #4B5563';
  if (style === 'dashed') return '1px dashed #D1D5DB';
  if (style === 'dotted') return '1px dotted #D1D5DB';
  return '1px solid #D1D5DB';
}

/** 점검일시를 보기 좋은 형식으로 변환 */
function formatCheckedAt(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

export default function SheetRenderer({
  structure, executionItems,
  checkedMap: propCheckedMap,
  checkedAtMap: propCheckedAtMap,
  valueMap: propValueMap,
  columnRoles,
  onCheckChange, onValueChange, onStatusChange, readOnly,
}: Props) {
  const { cells, merges, col_widths, row_heights, total_rows, total_cols, checkable_cells } = structure;

  // columnRoles prop이 없으면 structure.column_roles를 자동 사용 (v3.2)
  const effectiveRoles: ColumnRoleMapping | null | undefined = columnRoles ?? (structure as any).column_roles;

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

  // Build execution items map (legacy path)
  const execItemMap = useMemo(() => {
    const map = new Map<string, SheetExecutionItem>();
    for (const item of (executionItems || [])) {
      map.set(`${item.row_idx}-${item.col_idx}`, item);
    }
    return map;
  }, [executionItems]);

  // Build checked state from modern checkedMap or legacy executionItems
  const checkedMap = useMemo<Map<string, boolean>>(() => {
    if (propCheckedMap && propCheckedMap.size > 0) return propCheckedMap;
    const map = new Map<string, boolean>();
    if (executionItems) {
      for (const item of executionItems) {
        map.set(item.cell_ref, item.checked);
      }
    }
    return map;
  }, [propCheckedMap, executionItems]);

  const checkedAtMap = useMemo<Map<string, string>>(() => {
    if (propCheckedAtMap && propCheckedAtMap.size > 0) return propCheckedAtMap;
    const map = new Map<string, string>();
    if (executionItems) {
      for (const item of executionItems) {
        if (item.checked_at) map.set(item.cell_ref, item.checked_at);
      }
    }
    return map;
  }, [propCheckedAtMap, executionItems]);

  const valueMap = useMemo<Map<string, string>>(() => {
    if (propValueMap) return propValueMap;
    const map = new Map<string, string>();
    if (executionItems) {
      for (const item of executionItems) {
        if (item.value) map.set(item.cell_ref, item.value);
      }
    }
    return map;
  }, [propValueMap, executionItems]);

  // v3.1: checked_at 컬럼 인덱스 (0-based)
  const checkedAtCol = effectiveRoles?.checked_at?.col ?? -1;

  // v3.2: 상태 컬럼 (0-based). 진행일 컬럼은 editableCols에서 처리.
  const statusCol = effectiveRoles?.check_status?.col ?? -1;

  // Editable columns
  const editableCols = useMemo(() => {
    const map = new Map<number, string>(); // colIdx -> editorType
    if (effectiveRoles && !readOnly) {
      if (effectiveRoles.assignee?.col !== undefined) map.set(effectiveRoles.assignee.col, effectiveRoles.assignee.editor_type || 'text');
      if (effectiveRoles.due_date?.col !== undefined) map.set(effectiveRoles.due_date.col, effectiveRoles.due_date.editor_type || 'date');
      if (effectiveRoles.planned_date?.col !== undefined) map.set(effectiveRoles.planned_date.col, effectiveRoles.planned_date.editor_type || 'date');
      if (effectiveRoles.progress_date?.col !== undefined) map.set(effectiveRoles.progress_date.col, effectiveRoles.progress_date.editor_type || 'date');
      if (effectiveRoles.remark?.col !== undefined) map.set(effectiveRoles.remark.col, effectiveRoles.remark.editor_type || 'text');
      if (effectiveRoles.cycle?.col !== undefined) map.set(effectiveRoles.cycle.col, effectiveRoles.cycle.editor_type || 'text');
    }
    return map;
  }, [effectiveRoles, readOnly]);

  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Build hidden cells set + reverse map to merge origin
  // hiddenMergeMap[key] = merge that hides this cell; needed to decide if a horizontal placeholder is required
  const { hiddenCells, hiddenMergeMap } = useMemo(() => {
    const set = new Set<string>();
    const map = new Map<string, { startRow: number; startCol: number; endRow: number; endCol: number }>();
    for (const merge of (merges || [])) {
      for (let r = merge.startRow; r <= merge.endRow; r++) {
        for (let c = merge.startCol; c <= merge.endCol; c++) {
          if (r !== merge.startRow || c !== merge.startCol) {
            const key = `${r}-${c}`;
            set.add(key);
            map.set(key, merge);
          }
        }
      }
    }
    return { hiddenCells: set, hiddenMergeMap: map };
  }, [merges]);

  const colWidths = useMemo(() => {
    const widths: number[] = [];
    for (let c = 0; c < total_cols; c++) {
      const w = col_widths?.[c] || 8.43;
      // Excel 8.43 chars -> ~64px
      widths.push(Math.max(MIN_COL_WIDTH, Math.round(w * 7.5)));
    }
    return widths;
  }, [col_widths, total_cols]);

  const rowHeights = useMemo(() => {
    const heights: number[] = [];
    for (let r = 0; r < total_rows; r++) {
      const h = row_heights?.[r] || 15;
      // Excel 15pt -> ~20px
      heights.push(Math.max(DEFAULT_ROW_HEIGHT, Math.round(h * 1.33)));
    }
    return heights;
  }, [row_heights, total_rows]);

  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  // Helper: get cell ref. v3.4 — 항상 A1 형식 통일.
  //   기존엔 checkable이 아닌 셀에 대해 `${row}-${col}` 폴백을 썼지만,
  //   백엔드는 A1 형식만 row_idx/col_idx로 정확히 파싱한다. 가상 컬럼(진행일자/비고)에
  //   값을 저장해도 위치를 잃지 않도록 항상 A1 형식으로 계산한다.
  const getCellRef = useCallback((row: number, col: number): string => {
    const c = (checkable_cells || []).find(cc => cc.row === row && cc.col === col);
    if (c?.ref) return c.ref;
    let s = '';
    let n = col + 1;
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return `${s}${row + 1}`;
  }, [checkable_cells]);

  // Helper: find if row has a checked item (for auto-fill checked_at column)
  const getRowCheckedAt = useCallback((rowIdx: number): string | undefined => {
    for (const c of (checkable_cells || [])) {
      if (c.row === rowIdx) {
        const at = checkedAtMap.get(c.ref);
        if (at) return at;
      }
    }
    return undefined;
  }, [checkable_cells, checkedAtMap]);

  return (
    <Box sx={{ overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: 1, bgcolor: '#f3f4f6', p: 2 }}>
      <Box sx={{ 
        display: 'inline-block', 
        minWidth: totalWidth, 
        bgcolor: '#fff', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
      }}>
        {Array.from({ length: total_rows }, (_, rowIdx) => (
          <Box
            key={rowIdx}
            // v3.4: row height를 minHeight로 변경 — 긴 텍스트(예: "check 항목")가
            //       wrap되면서 밑부분이 잘리던 문제 해결. 짧은 텍스트는 기존
            //       행 높이를 유지하고, 긴 텍스트는 셀이 자라면 행도 같이 자란다.
            sx={{ display: 'flex', minHeight: rowHeights[rowIdx] || DEFAULT_ROW_HEIGHT, alignItems: 'stretch' }}
          >
            {Array.from({ length: total_cols }, (_, colIdx) => {
              const key = `${rowIdx}-${colIdx}`;
              if (hiddenCells.has(key)) {
                // 세로 병합으로 위 행에서 시작된 셀이 아래 행을 가릴 때
                // 같은 행 컬럼 위치를 비워두면 그 다음 컬럼들이 왼쪽으로 밀려
                // 병합 영역 위로 텍스트가 겹쳐 보이게 됨. → 폭만 차지하는 placeholder 렌더링.
                const mg = hiddenMergeMap.get(key);
                if (mg && mg.startRow < rowIdx) {
                  const phWidth = colWidths[colIdx] || DEFAULT_COL_WIDTH;
                  return (
                    <Box
                      key={key}
                      aria-hidden
                      sx={{
                        width: phWidth,
                        minWidth: phWidth,
                        maxWidth: phWidth,
                        flexShrink: 0,
                        height: '100%',
                      }}
                    />
                  );
                }
                return null;
              }

              const cell = cellMap.get(key);
              const isCheckable = checkableSet.has(key);
              const execItem = execItemMap.get(key);
              const headerRowIdx = (structure as any).header_row_idx ?? 0;
              // v3.2: 상태(여부성) 셀 — O/X/N/A dropdown 대상
              const isStatusCell = !!onStatusChange && statusCol >= 0 && colIdx === statusCol && rowIdx > headerRowIdx;
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

              const bg = cell?.bg || 'transparent';
              const font = cell?.font;
              const borders = cell?.borders;

              // v3.1: 점검일시 컬럼이면 자동으로 체크 시간을 표시
              const isCheckedAtCol = checkedAtCol >= 0 && colIdx === checkedAtCol;
              const rowCheckedAt = isCheckedAtCol ? getRowCheckedAt(rowIdx) : undefined;

              // 현재 체크 상태 및 기타 수정값
              const cellRef = getCellRef(rowIdx, colIdx);
              const isChecked = checkedMap.get(cellRef) ?? execItem?.checked ?? false;
              const cellValue = valueMap.get(cellRef) ?? execItem?.value ?? cell?.value ?? '';

              // Editable 관련 — 상태셀은 Select로 처리하므로 inline 텍스트 에디터 제외
              const editorType = editingCell === cellRef ? editableCols.get(colIdx) : null;
              const isEditableHoverable =
                editableCols.has(colIdx) && rowIdx > headerRowIdx
                && !isCheckable && !isCheckedAtCol && !isStatusCell;

              // 안전한 fontSize 계산 (Excel pt -> css px 변환 유지)
              const fontSizePx = font?.fontSize ? Math.round(font.fontSize * 1.33) : 12;

              return (
                <Box
                  key={key}
                  onClick={() => {
                    if (isEditableHoverable && !readOnly) {
                      setEditingCell(cellRef);
                      setEditValue(cellValue);
                    }
                  }}
                  sx={{
                    width,
                    minWidth: width, minHeight: height,
                    maxWidth: width,
                    // v3.4: maxHeight 제거 — 긴 텍스트 셀이 자라도록 허용 (행도 함께 자람)
                    boxSizing: 'border-box',
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: cell?.align === 'center' ? 'center' : cell?.align === 'right' ? 'flex-end' : 'flex-start',
                    justifyContent: 'center', // 수직 중앙 정렬 기본 (Excel 기본은 bottom이지만, center가 웹에선 깔끔함)
                    py: 0.2, px: 0.5,
                    bgcolor: bg,
                    borderRight: borderStyle(borders?.right || 'thin'),
                    borderBottom: borderStyle(borders?.bottom || 'thin'),
                    borderLeft: colIdx === 0 ? borderStyle(borders?.left || 'thick') : 'none',
                    borderTop: rowIdx === 0 ? borderStyle(borders?.top || 'thick') : 'none',
                    overflow: 'hidden',
                    cursor: isEditableHoverable ? 'text' : 'default',
                    '&:hover': isEditableHoverable ? { bgcolor: 'rgba(41, 85, 255, 0.04)' } : {}, // editable hover 표시
                  }}
                >
                  {editorType ? (
                    <TextField
                      autoFocus
                      variant="standard"
                      size="small"
                      type={editorType === 'date' ? 'date' : 'text'}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => {
                        if (editValue !== cellValue) {
                          onValueChange?.(cellRef, editValue);
                        }
                        setEditingCell(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      InputProps={{
                        disableUnderline: true,
                        style: {
                          fontSize: `${fontSizePx}px`,
                          fontWeight: font?.bold ? 700 : 400,
                          color: font?.fontColor || '#111827',
                          width: '100%',
                          textAlign: (cell?.align as any) || 'left',
                        }
                      }}
                      sx={{ p: 0, m: 0, width: '100%' }}
                    />
                  ) : isStatusCell ? (
                    (() => {
                      // 현재 상태값: execItem.value > valueMap > parsed_status > raw > ''
                      const raw = (execItem?.value ?? valueMap.get(cellRef) ?? cell?.value ?? '').toString().trim();
                      const upper = raw.toUpperCase().replace(/\s/g, '');
                      let current: StatusValue = '';
                      if (upper === 'O' || upper === '○' || upper === '●' || upper === '완료' || upper === 'OK' || upper === 'PASS' || upper === '양호' || upper === '정상') current = 'O';
                      else if (upper === 'X' || upper === '×' || upper === '미완료' || upper === 'NG' || upper === 'FAIL' || upper === '불량' || upper === '이상') current = 'X';
                      else if (upper === 'N/A' || upper === 'NA' || upper === '해당없음') current = 'N/A';
                      else if (STATUS_OPTIONS.includes(raw as any)) current = raw as StatusValue;
                      const color = current === 'O' ? '#16A34A' : current === 'X' ? '#DC2626' : current === 'N/A' ? '#9CA3AF' : '#6B7280';
                      return (
                        <Tooltip title={execItem?.memo || ''} placement="top" arrow>
                          <Select
                            size="small"
                            value={current}
                            disabled={readOnly}
                            onChange={(e) => onStatusChange?.(cellRef, e.target.value as StatusValue, rowIdx, colIdx)}
                            variant="standard"
                            disableUnderline
                            displayEmpty
                            renderValue={(v) => (
                              <Box component="span" sx={{
                                fontSize: `${Math.max(fontSizePx, 12)}px`,
                                fontWeight: 700,
                                color,
                                opacity: current === 'N/A' ? 0.7 : 1,
                              }}>
                                {statusLabel(v as StatusValue) || '—'}
                              </Box>
                            )}
                            sx={{
                              width: '100%',
                              border: readOnly ? 'none' : '1px solid #E5E7EB',
                              borderRadius: '6px',
                              bgcolor: readOnly ? 'transparent' : '#FAFAFA',
                              transition: 'border-color 0.15s, background-color 0.15s, box-shadow 0.15s',
                              '&:hover': readOnly ? {} : {
                                bgcolor: '#F3F4F6',
                                borderColor: '#9CA3AF',
                              },
                              '&.Mui-focused, &:focus-within': readOnly ? {} : {
                                borderColor: '#2955FF',
                                bgcolor: '#fff',
                                boxShadow: '0 0 0 2px rgba(41, 85, 255, 0.12)',
                              },
                              '& .MuiSelect-select': {
                                p: '3px 22px 3px 8px !important',
                                textAlign: 'center',
                                minHeight: 'unset',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              },
                              '& .MuiSelect-icon': {
                                color: '#6B7280',
                                right: 4,
                                fontSize: 16,
                              },
                            }}
                            MenuProps={{ PaperProps: { sx: { mt: 0.5, borderRadius: 1.5, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' } } }}
                          >
                            <MenuItem value=""><em style={{ color: '#9CA3AF' }}>— 선택</em></MenuItem>
                            <MenuItem value="O" sx={{ fontWeight: 700, color: '#16A34A' }}>진행</MenuItem>
                            <MenuItem value="X" sx={{ fontWeight: 700, color: '#DC2626' }}>미진행</MenuItem>
                            <MenuItem value="N/A" sx={{ fontWeight: 700, color: '#9CA3AF' }}>N/A</MenuItem>
                          </Select>
                        </Tooltip>
                      );
                    })()
                  ) : isCheckable ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', justifyContent: cell?.align === 'center' ? 'center' : 'flex-start' }}>
                      <Tooltip title={execItem?.memo || ''} placement="top" arrow>
                        <span>
                          <Checkbox
                            size="small"
                            checked={isChecked}
                            disabled={readOnly}
                            onChange={(e) => onCheckChange?.(cellRef, e.target.checked)}
                            sx={{
                              p: 0, '& .MuiSvgIcon-root': { fontSize: 18 },
                              color: isChecked ? '#22C55E' : '#D1D5DB',
                              '&.Mui-checked': { color: '#22C55E' },
                            }}
                          />
                        </span>
                      </Tooltip>
                      {(execItem?.value || cell?.value) && (
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: `${fontSizePx}px`,
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
                  ) : isCheckedAtCol && rowCheckedAt ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, width: '100%', justifyContent: cell?.align === 'center' ? 'center' : 'flex-start' }}>
                      <AccessTimeIcon sx={{ fontSize: 12, color: '#2955FF', flexShrink: 0 }} />
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: '11px', color: '#2955FF', fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {formatCheckedAt(rowCheckedAt)}
                      </Typography>
                    </Box>
                  ) : (
                    <Tooltip title={String(cellValue || '').length > 60 ? cellValue : ''} placement="top" arrow enterDelay={500}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: `${fontSizePx}px`,
                          fontWeight: font?.bold ? 700 : 400,
                          fontStyle: font?.italic ? 'italic' : 'normal',
                          color: font?.fontColor || '#111827',
                          // v3.4: 항상 줄바꿈 허용 — 긴 텍스트가 잘리지 않게
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          lineHeight: 1.35,
                          width: '100%',
                          textAlign: (cell?.align as any) || 'left',
                          py: 0.2,
                        }}
                      >
                        {cellValue}
                      </Typography>
                    </Tooltip>
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
