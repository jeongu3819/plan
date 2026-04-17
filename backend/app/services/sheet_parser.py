"""
Excel/CSV → Sheet 구조 파싱 서비스
- 병합셀 구조 유지
- 색상 정보 추출
- 체크 가능 셀 자동 감지 (O/X/빈칸/체크마크 패턴)
- 수식은 결과값 기준 표시
- 줄바꿈/섹션/제목 유지
"""

import io
import csv
import logging
from typing import Tuple, Optional

logger = logging.getLogger("sheet_parser")

# 체크 가능 값으로 판단하는 패턴
CHECKABLE_VALUES = {"", "o", "O", "x", "X", "○", "●", "×", "✓", "✔", "☑", "☐", "□", "■", "△", "▲", "-"}


def _color_to_hex(color) -> Optional[str]:
    """openpyxl Color 객체 → #RRGGBB 문자열"""
    if color is None:
        return None
    try:
        if color.type == "rgb" and color.rgb and color.rgb != "00000000":
            rgb = str(color.rgb)
            if len(rgb) == 8:
                return f"#{rgb[2:]}"
            elif len(rgb) == 6:
                return f"#{rgb}"
        if color.type == "theme":
            return None  # 테마 색상은 클라이언트에서 처리
        if color.type == "indexed":
            return None
    except Exception:
        pass
    return None


def _get_cell_bg_color(cell) -> Optional[str]:
    """셀 배경색 추출"""
    try:
        fill = cell.fill
        if fill and fill.fgColor:
            c = _color_to_hex(fill.fgColor)
            if c and c != "#000000":
                return c
        if fill and fill.bgColor:
            c = _color_to_hex(fill.bgColor)
            if c and c != "#000000":
                return c
    except Exception:
        pass
    return None


def _get_cell_font_info(cell) -> dict:
    """셀 폰트 정보 추출"""
    info = {}
    try:
        font = cell.font
        if font:
            if font.bold:
                info["bold"] = True
            if font.italic:
                info["italic"] = True
            if font.size:
                info["fontSize"] = font.size
            color = _color_to_hex(font.color)
            if color:
                info["fontColor"] = color
    except Exception:
        pass
    return info


def _get_cell_borders(cell) -> dict:
    """셀 테두리 정보"""
    borders = {}
    try:
        b = cell.border
        for side_name in ("top", "bottom", "left", "right"):
            side = getattr(b, side_name, None)
            if side and side.style:
                borders[side_name] = side.style
    except Exception:
        pass
    return borders


def _is_checkable_cell(value, col_header: str = "") -> bool:
    """셀이 체크 가능한 항목인지 판단"""
    if value is None:
        return False
    s = str(value).strip()
    if s in CHECKABLE_VALUES:
        return True
    return False


def _find_label_for_cell(ws, row_idx: int, col_idx: int) -> str:
    """체크 셀에 대한 라벨 찾기 — 같은 행의 왼쪽 텍스트 셀"""
    for c in range(col_idx - 1, 0, -1):
        cell = ws.cell(row=row_idx, column=c)
        v = cell.value
        if v is not None and str(v).strip():
            return str(v).strip()[:200]
    return ""


def parse_excel_to_structure(
    file_bytes: bytes,
    filename: str,
    target_sheet: Optional[str] = None,
) -> Tuple[dict, dict]:
    """
    Excel/CSV → (structure, meta) 반환

    structure: {
        cells: [{row, col, value, type, bg, font, borders, rowSpan, colSpan}],
        merges: [{startRow, startCol, endRow, endCol}],
        col_widths: [float, ...],
        row_heights: [float, ...],
        total_rows: int,
        total_cols: int,
        checkable_cells: [{ref, row, col, label}],
        headers: [{col, value}],
    }
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "csv":
        return _parse_csv(file_bytes)
    elif ext in ("xlsx", "xls"):
        return _parse_xlsx(file_bytes, target_sheet)
    else:
        raise ValueError(f"지원하지 않는 파일 형식: .{ext} (xlsx, csv만 지원)")


def _parse_csv(file_bytes: bytes) -> Tuple[dict, dict]:
    """CSV 파싱"""
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows_data = list(reader)

    if not rows_data:
        return {"cells": [], "merges": [], "total_rows": 0, "total_cols": 0, "checkable_cells": [], "headers": []}, \
               {"row_count": 0, "col_count": 0, "checkable_count": 0, "sheet_name": None}

    max_cols = max(len(r) for r in rows_data)
    cells = []
    checkable_cells = []

    for r_idx, row in enumerate(rows_data):
        for c_idx in range(max_cols):
            value = row[c_idx] if c_idx < len(row) else ""
            cells.append({
                "row": r_idx, "col": c_idx,
                "value": value, "type": "text",
            })
            if r_idx > 0 and _is_checkable_cell(value):
                label = ""
                for lc in range(c_idx - 1, -1, -1):
                    lv = row[lc] if lc < len(row) else ""
                    if lv.strip():
                        label = lv.strip()[:200]
                        break
                checkable_cells.append({
                    "ref": f"{chr(65 + c_idx)}{r_idx + 1}" if c_idx < 26 else f"C{c_idx}R{r_idx + 1}",
                    "row": r_idx, "col": c_idx, "label": label,
                })

    headers = []
    if rows_data:
        for c_idx, v in enumerate(rows_data[0]):
            if v.strip():
                headers.append({"col": c_idx, "value": v.strip()})

    structure = {
        "cells": cells,
        "merges": [],
        "col_widths": [],
        "row_heights": [],
        "total_rows": len(rows_data),
        "total_cols": max_cols,
        "checkable_cells": checkable_cells,
        "headers": headers,
    }
    meta = {
        "row_count": len(rows_data),
        "col_count": max_cols,
        "checkable_count": len(checkable_cells),
        "sheet_name": None,
    }
    return structure, meta


def _parse_xlsx(file_bytes: bytes, target_sheet: Optional[str] = None) -> Tuple[dict, dict]:
    """XLSX 파싱 (openpyxl)"""
    import openpyxl
    from openpyxl.utils import get_column_letter

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)

    if target_sheet and target_sheet in wb.sheetnames:
        ws = wb[target_sheet]
    else:
        ws = wb.active
    sheet_name = ws.title

    # 병합 셀 정보
    merges = []
    merged_cells_map = {}  # (row, col) -> merge info
    for mg in ws.merged_cells.ranges:
        merge_info = {
            "startRow": mg.min_row - 1,  # 0-based
            "startCol": mg.min_col - 1,
            "endRow": mg.max_row - 1,
            "endCol": mg.max_col - 1,
        }
        merges.append(merge_info)
        for r in range(mg.min_row, mg.max_row + 1):
            for c in range(mg.min_col, mg.max_col + 1):
                if r == mg.min_row and c == mg.min_col:
                    merged_cells_map[(r, c)] = {
                        "rowSpan": mg.max_row - mg.min_row + 1,
                        "colSpan": mg.max_col - mg.min_col + 1,
                    }
                else:
                    merged_cells_map[(r, c)] = "hidden"

    # 열 너비
    col_widths = []
    for c in range(1, ws.max_column + 1 if ws.max_column else 1):
        letter = get_column_letter(c)
        dim = ws.column_dimensions.get(letter)
        col_widths.append(round(dim.width, 1) if dim and dim.width else 8.43)

    # 행 높이
    row_heights = []
    for r in range(1, ws.max_row + 1 if ws.max_row else 1):
        dim = ws.row_dimensions.get(r)
        row_heights.append(round(dim.height, 1) if dim and dim.height else 15.0)

    cells = []
    checkable_cells = []
    header_row_idx = None

    total_rows = ws.max_row or 0
    total_cols = ws.max_column or 0

    for r in range(1, total_rows + 1):
        for c in range(1, total_cols + 1):
            merge_info = merged_cells_map.get((r, c))
            if merge_info == "hidden":
                continue  # 병합된 숨겨진 셀은 건너뜀

            cell = ws.cell(row=r, column=c)
            value = cell.value
            if value is not None:
                value = str(value)
            else:
                value = ""

            cell_data = {
                "row": r - 1,  # 0-based
                "col": c - 1,
                "value": value,
                "type": "text",
            }

            # 병합 span
            if isinstance(merge_info, dict):
                cell_data["rowSpan"] = merge_info["rowSpan"]
                cell_data["colSpan"] = merge_info["colSpan"]

            # 배경색
            bg = _get_cell_bg_color(cell)
            if bg:
                cell_data["bg"] = bg

            # 폰트
            font_info = _get_cell_font_info(cell)
            if font_info:
                cell_data["font"] = font_info

            # 테두리
            borders = _get_cell_borders(cell)
            if borders:
                cell_data["borders"] = borders

            # 정렬
            try:
                if cell.alignment:
                    if cell.alignment.horizontal:
                        cell_data["align"] = cell.alignment.horizontal
                    if cell.alignment.wrap_text:
                        cell_data["wrapText"] = True
            except Exception:
                pass

            cells.append(cell_data)

            # 체크 가능 셀 감지 (헤더 행 이후만)
            if r > 1 and _is_checkable_cell(value):
                label = _find_label_for_cell(ws, r, c)
                col_letter = get_column_letter(c)
                checkable_cells.append({
                    "ref": f"{col_letter}{r}",
                    "row": r - 1,
                    "col": c - 1,
                    "label": label,
                })

    # 헤더 감지 (1행)
    headers = []
    if total_rows > 0:
        for c in range(1, total_cols + 1):
            cell = ws.cell(row=1, column=c)
            v = cell.value
            if v is not None and str(v).strip():
                headers.append({"col": c - 1, "value": str(v).strip()})

    wb.close()

    structure = {
        "cells": cells,
        "merges": merges,
        "col_widths": col_widths,
        "row_heights": row_heights,
        "total_rows": total_rows,
        "total_cols": total_cols,
        "checkable_cells": checkable_cells,
        "headers": headers,
    }
    meta = {
        "row_count": total_rows,
        "col_count": total_cols,
        "checkable_count": len(checkable_cells),
        "sheet_name": sheet_name,
    }
    return structure, meta
