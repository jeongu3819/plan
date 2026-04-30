/**
 * SheetRenderer — Excel 원형 유사 렌더링 컴포넌트
 * 병합셀, 색상, 폰트, 테두리, 줄바꿈을 최대한 유지하여 웹에서 표시
 * v3.1: column_roles 기반 체크 + 점검일시 연동, checkedMap/checkedAtMap 직접 지원
 */
import React, { useMemo, useCallback, useState } from 'react';
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
  /** v3.7: 양식 원본 preview 모드 — 진행 유/무 체크박스, 상태 dropdown, 점검일시 자동값을
   *  모두 숨기고 원본 셀 값만 표시한다. SheetTemplatePage 같은 양식 확인용 화면에서 사용.
   *  실제 점검 화면(SheetExecutionPopup)에서는 false로 두어야 한다. */
  templatePreview?: boolean;
  /** 실행본에서 숨김 처리된 컬럼 인덱스. template은 그대로 두고 렌더링 시점에만 가린다. */
  hiddenCols?: number[];
  /** 헤더 셀에 컬럼 삭제 버튼을 표시하고 클릭 시 호출. 미제공 시 버튼 숨김. */
  onDeleteColumn?: (colIdx: number) => void;
  /** 모든 일반 텍스트 셀(헤더 아래/체크/상태/점검일시/숨김 제외)을 자유 편집 허용 */
  freeTextEdit?: boolean;
}

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

/**
 * InlineCellEditor — 셀 편집 시 자체 state로 입력을 처리해
 * 키 입력마다 SheetRenderer 전체가 리렌더되지 않게 한다.
 */
interface InlineCellEditorProps {
  initialValue: string;
  editorType: 'text' | 'date' | string;
  fontSizePx: number;
  bold?: boolean;
  fontColor?: string;
  align?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}
const InlineCellEditor = React.memo(function InlineCellEditor({
  initialValue, editorType, fontSizePx, bold, fontColor, align, onCommit, onCancel,
}: InlineCellEditorProps) {
  const [value, setValue] = useState<string>(initialValue);
  return (
    <TextField
      autoFocus
      variant="standard"
      size="small"
      multiline={editorType !== 'date'}
      rows={1}
      maxRows={10}
      type={editorType === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onCommit(value);
        else onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          (e.target as any).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setValue(initialValue);
          onCancel();
        }
      }}
      InputProps={{
        disableUnderline: true,
        style: {
          fontSize: `${fontSizePx}px`,
          fontWeight: bold ? 700 : 400,
          color: fontColor || '#111827',
          width: '100%',
          textAlign: (align as any) || 'left',
          lineHeight: 1.2,
        },
      }}
      helperText={editorType !== 'date' ? "Shift+Enter: 줄바꿈" : undefined}
      FormHelperTextProps={{ sx: { fontSize: '0.6rem', mt: 0, mb: -0.5, opacity: 0.6, position: 'absolute', bottom: -12 } }}
      sx={{ p: 0, m: 0, width: '100%' }}
    />
  );
});

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
  templatePreview,
  hiddenCols, onDeleteColumn, freeTextEdit,
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

  // 실행본에서 숨긴 컬럼 인덱스 (Set lookup)
  const hiddenColSet = useMemo(() => new Set<number>(hiddenCols || []), [hiddenCols]);

  // Build hidden cells set + merge origin lookup
  //  v3.5: HTML <table> + rowSpan/colSpan으로 렌더링하므로 hidden 셀은 그냥 skip하면 됨
  //        (브라우저 table layout이 자동으로 병합 영역을 처리)
  //  hiddenCols가 있으면 병합 origin을 첫 가시 컬럼으로 옮기고 colSpan을 가시 개수로 줄인다.
  const { hiddenCells, mergeAt } = useMemo(() => {
    const set = new Set<string>();
    const originMap = new Map<string, { rowSpan: number; colSpan: number }>();
    for (const merge of (merges || [])) {
      const rs = merge.endRow - merge.startRow + 1;
      let visibleCount = 0;
      let firstVisibleCol = -1;
      for (let c = merge.startCol; c <= merge.endCol; c++) {
        if (!hiddenColSet.has(c)) {
          visibleCount++;
          if (firstVisibleCol < 0) firstVisibleCol = c;
        }
      }
      if (visibleCount === 0 || firstVisibleCol < 0) {
        // 병합 전체가 가려진 경우 — 모두 hidden 처리
        for (let r = merge.startRow; r <= merge.endRow; r++) {
          for (let c = merge.startCol; c <= merge.endCol; c++) set.add(`${r}-${c}`);
        }
        continue;
      }
      originMap.set(`${merge.startRow}-${firstVisibleCol}`, { rowSpan: rs, colSpan: visibleCount });
      for (let r = merge.startRow; r <= merge.endRow; r++) {
        for (let c = merge.startCol; c <= merge.endCol; c++) {
          if (r === merge.startRow && c === firstVisibleCol) continue;
          set.add(`${r}-${c}`);
        }
      }
    }
    return { hiddenCells: set, mergeAt: originMap };
  }, [merges, hiddenColSet]);

  const colWidths = useMemo(() => {
    const widths: number[] = [];
    for (let c = 0; c < total_cols; c++) {
      const w = col_widths?.[c] || 8.43;
      // Excel 8.43 chars -> ~64px
      widths.push(Math.max(MIN_COL_WIDTH, Math.round(w * 7.5)));
    }
    return widths;
  }, [col_widths, total_cols]);

  // 보호 컬럼 (삭제 차단): 진행 상태/점검일시/진행일자
  const protectedColSet = useMemo(() => {
    const s = new Set<number>();
    if (effectiveRoles) {
      for (const key of ['check_status', 'checked_at', 'progress_date'] as const) {
        const col = effectiveRoles[key]?.col;
        if (typeof col === 'number' && col >= 0) s.add(col);
      }
    }
    return s;
  }, [effectiveRoles]);

  const rowHeights = useMemo(() => {
    const heights: number[] = [];
    for (let r = 0; r < total_rows; r++) {
      const h = row_heights?.[r] || 15;
      // Excel 15pt -> ~20px
      heights.push(Math.max(DEFAULT_ROW_HEIGHT, Math.round(h * 1.33)));
    }
    return heights;
  }, [row_heights, total_rows]);

  const totalWidth = colWidths.reduce((a, b, i) => (hiddenColSet.has(i) ? a : a + b), 0);

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

  // v3.5: 헤더 행 인덱스
  const headerRowIdx = (structure as any).header_row_idx ?? 0;

  return (
    <Box sx={{ overflow: 'auto', border: '1px solid #E5E7EB', borderRadius: 1, bgcolor: '#f3f4f6', p: 2 }}>
      <Box sx={{
        display: 'inline-block',
        minWidth: totalWidth,
        bgcolor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
      }}>
        {/*
          v3.5: HTML <table> 로 전환.
          이전 flex Box 구조는 병합셀 높이 = sum(static rowHeights)로 계산해서,
          긴 텍스트로 인해 한 행이 minHeight 이상으로 자라면 왼쪽 병합 셀과
          높이가 어긋났다. <table> + rowSpan/colSpan을 쓰면 브라우저 table layout
          알고리즘이 모든 셀의 높이를 함께 맞춰주기 때문에 어긋남이 사라진다.
        */}
        <table
          style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            width: totalWidth,
            margin: 0,
          }}
        >
          <colgroup>
            {colWidths.map((w, i) => (
              hiddenColSet.has(i) ? null : <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <tbody>
            {Array.from({ length: total_rows }, (_, rowIdx) => (
              <tr key={rowIdx} style={{ height: rowHeights[rowIdx] || DEFAULT_ROW_HEIGHT }}>
                {Array.from({ length: total_cols }, (_, colIdx) => {
                  const key = `${rowIdx}-${colIdx}`;
                  // 실행본에서 삭제(숨김)된 컬럼은 렌더 자체를 건너뛴다
                  if (hiddenColSet.has(colIdx)) return null;
                  // hidden cells are absorbed by their merge origin's rowSpan/colSpan
                  if (hiddenCells.has(key)) return null;

                  const cell = cellMap.get(key);
                  // v3.7: templatePreview 모드면 체크/상태/점검일시 모두 비활성 → 원본 셀 값만 표시
                  const isCheckable = !templatePreview && checkableSet.has(key);
                  const execItem = execItemMap.get(key);
                  // v3.2: 상태(여부성) 셀 — O/X/N/A dropdown 대상
                  const isStatusCell = !templatePreview && !!onStatusChange && statusCol >= 0 && colIdx === statusCol && rowIdx > headerRowIdx;

                  // 병합 origin 우선, 그다음 cell 자체의 span 사용
                  const merge = mergeAt.get(key);
                  const rowSpan = merge?.rowSpan ?? cell?.rowSpan ?? 1;
                  const colSpan = merge?.colSpan ?? cell?.colSpan ?? 1;

                  const bg = cell?.bg || 'transparent';
                  const font = cell?.font;
                  const borders = cell?.borders;

                  // v3.1: 점검일시 컬럼이면 자동으로 체크 시간을 표시
                  // v3.7: templatePreview 모드에선 자동 점검일시 표시 안 함 (원본 값만)
                  const isCheckedAtCol = !templatePreview && checkedAtCol >= 0 && colIdx === checkedAtCol;
                  const rowCheckedAt = isCheckedAtCol ? getRowCheckedAt(rowIdx) : undefined;

                  // 현재 체크 상태 및 기타 수정값
                  const cellRef = getCellRef(rowIdx, colIdx);
                  const isChecked = checkedMap.get(cellRef) ?? execItem?.checked ?? false;
                  const cellValue = valueMap.get(cellRef) ?? execItem?.value ?? cell?.value ?? '';

                  // Editable 관련 — 상태셀은 Select로 처리하므로 inline 텍스트 에디터 제외
                  // freeTextEdit: 헤더 아래 / 체크/상태/점검일시/숨김 이외 모든 일반 셀을 텍스트 편집 허용
                  const roleEditorType = editableCols.get(colIdx);
                  const freeEditable = !!freeTextEdit && !readOnly && rowIdx > headerRowIdx
                    && !isCheckable && !isCheckedAtCol && !isStatusCell;
                  const editorType = editingCell === cellRef
                    ? (roleEditorType || (freeEditable ? 'text' : null))
                    : null;
                  const isEditableHoverable =
                    rowIdx > headerRowIdx
                    && !isCheckable && !isCheckedAtCol && !isStatusCell
                    && (editableCols.has(colIdx) || freeEditable);

                  // 안전한 fontSize 계산 (Excel pt -> css px 변환 유지)
                  const fontSizePx = font?.fontSize ? Math.round(font.fontSize * 1.33) : 12;

                  const showDeleteBtn = !!onDeleteColumn && !readOnly && !templatePreview
                    && rowIdx === headerRowIdx
                    && !protectedColSet.has(colIdx);

                  const tdStyle: React.CSSProperties = {
                    padding: '2px 4px',
                    backgroundColor: bg,
                    borderRight: borderStyle(borders?.right || 'thin'),
                    borderBottom: borderStyle(borders?.bottom || 'thin'),
                    borderLeft: colIdx === 0 ? borderStyle(borders?.left || 'thick') : undefined,
                    borderTop: rowIdx === 0 ? borderStyle(borders?.top || 'thick') : undefined,
                    verticalAlign: 'middle',
                    textAlign: (cell?.align as any) || 'left',
                    cursor: isEditableHoverable ? 'text' : 'default',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                    position: showDeleteBtn ? 'relative' : undefined,
                    height: 'inherit',
                  };

                  return (
                    <td
                      key={key}
                      rowSpan={rowSpan}
                      colSpan={colSpan}
                      onClick={() => {
                        if (isEditableHoverable && !readOnly) {
                          setEditingCell(cellRef);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (isEditableHoverable) (e.currentTarget as HTMLTableCellElement).style.backgroundColor = 'rgba(41, 85, 255, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        if (isEditableHoverable) (e.currentTarget as HTMLTableCellElement).style.backgroundColor = bg;
                      }}
                      style={tdStyle}
                    >
                      {editorType ? (
                    <InlineCellEditor
                      initialValue={cellValue}
                      editorType={editorType}
                      fontSizePx={fontSizePx}
                      bold={font?.bold}
                      fontColor={font?.fontColor}
                      align={cell?.align}
                      onCommit={(v) => {
                        onValueChange?.(cellRef, v);
                        setEditingCell(null);
                      }}
                      onCancel={() => setEditingCell(null)}
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
                  {showDeleteBtn && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteColumn?.(colIdx); }}
                      title="이 컬럼 삭제"
                      style={{
                        position: 'absolute',
                        top: 1,
                        right: 1,
                        width: 16,
                        height: 16,
                        padding: 0,
                        border: 'none',
                        borderRadius: '50%',
                        background: 'rgba(239, 68, 68, 0.85)',
                        color: '#fff',
                        fontSize: 11,
                        lineHeight: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.55,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.55'; }}
                    >
                      ×
                    </button>
                  )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </Box>
  );
}
