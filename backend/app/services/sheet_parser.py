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

# 체크 가능 "값" 패턴 (빈 셀 제외 — 빈 셀만으로는 체크 의도를 확정할 수 없음)
CHECKABLE_VALUES = {"o", "O", "x", "X", "○", "●", "×", "✓", "✔", "☑", "☐", "□", "■", "△", "▲", "-"}

# 컬럼 헤더에서 "체크 컬럼"을 식별할 키워드
CHECK_HEADER_KEYWORDS = ("체크", "점검결과", "판정", "결과", "상태", "확인", "check", "status", "result", "ok/ng", "pass/fail")

# 컬럼 헤더에서 "라벨(점검항목) 컬럼"을 식별할 키워드
LABEL_HEADER_KEYWORDS = ("점검항목", "항목", "내용", "설명", "검사항목", "item", "description", "task")

# 실제 체크 값으로 많이 쓰이는 완료/미완료 계열 (한국어 체크시트 관행)
CHECK_STATE_VALUES = {"완료", "미완료", "진행", "진행 중", "진행중", "보류", "불가", "ok", "OK", "ng", "NG", "n/a", "N/A", "해당없음", "pass", "PASS", "fail", "FAIL", "양호", "불량"}


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


def _header_matches(header_text: str, keywords) -> bool:
    if not header_text:
        return False
    h = header_text.strip().lower()
    return any(k.lower() in h for k in keywords)


def _is_checkable_cell(value, col_header: str = "") -> bool:
    """
    셀이 체크 가능한 항목인지 판단.
    - 컬럼 헤더가 체크 키워드 포함 → 비어 있지 않은 셀 전부 체크 대상 (완료/미완료/OK/NG 등 포함)
    - 그렇지 않으면 값 자체가 체크 마크 문자거나 상태 키워드여야 함
    """
    if value is None:
        v = ""
    else:
        v = str(value).strip()

    if _header_matches(col_header, CHECK_HEADER_KEYWORDS):
        return v != "" or True  # 헤더가 명시적 체크 컬럼이면 행 자체가 체크 항목
    if not v:
        return False
    if v in CHECKABLE_VALUES:
        return True
    if v in CHECK_STATE_VALUES:
        return True
    return False


def _find_label_for_cell(ws, row_idx: int, col_idx: int, label_cols=None) -> str:
    """
    체크 셀에 대한 라벨 찾기.
    - label_cols 가 주어지면 그 컬럼들에서 같은 행 값을 우선 사용
    - 없으면 같은 행의 왼쪽 텍스트 셀을 스캔
    """
    if label_cols:
        for lc in label_cols:
            cell = ws.cell(row=row_idx, column=lc)
            v = cell.value
            if v is not None and str(v).strip():
                return str(v).strip()[:200]
    for c in range(col_idx - 1, 0, -1):
        cell = ws.cell(row=row_idx, column=c)
        v = cell.value
        if v is not None and str(v).strip():
            return str(v).strip()[:200]
    return ""


def _detect_header_row(ws, max_scan: int = 10) -> int:
    """
    헤더 행(1-based) 자동 감지:
    - 첫 10행 내에서 '문자열 비어있지 않은 셀 개수'가 최대인 행을 헤더 후보로
    - 동률이면 더 아래 행 선호 (보통 제목/요약 이후에 헤더가 옴)
    """
    best_row = 1
    best_count = -1
    scan_to = min(max_scan, ws.max_row or 0)
    for r in range(1, scan_to + 1):
        count = 0
        for c in range(1, (ws.max_column or 0) + 1):
            v = ws.cell(row=r, column=c).value
            if v is not None and isinstance(v, str) and v.strip():
                count += 1
        if count >= best_count:
            best_count = count
            best_row = r
    return best_row


def _build_column_headers(ws, header_row: int) -> dict:
    """header_row 의 각 컬럼 텍스트를 dict {col_idx(1-based): header_text} 로 반환"""
    headers = {}
    for c in range(1, (ws.max_column or 0) + 1):
        v = ws.cell(row=header_row, column=c).value
        if v is not None and str(v).strip():
            headers[c] = str(v).strip()
    return headers


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

    # CSV 의 첫 행을 헤더로 가정
    header_values = rows_data[0] if rows_data else []
    csv_check_cols = {
        c_idx for c_idx, h in enumerate(header_values)
        if _header_matches(h, CHECK_HEADER_KEYWORDS)
    }
    csv_label_cols = [
        c_idx for c_idx, h in enumerate(header_values)
        if _header_matches(h, LABEL_HEADER_KEYWORDS)
    ]

    for r_idx, row in enumerate(rows_data):
        for c_idx in range(max_cols):
            value = row[c_idx] if c_idx < len(row) else ""
            cells.append({
                "row": r_idx, "col": c_idx,
                "value": value, "type": "text",
            })
            if r_idx > 0:
                is_check = (c_idx in csv_check_cols) or _is_checkable_cell(value)
                if is_check:
                    label = ""
                    if csv_label_cols:
                        for lc in csv_label_cols:
                            lv = row[lc] if lc < len(row) else ""
                            if lv.strip():
                                label = lv.strip()[:200]
                                break
                    if not label:
                        for lc in range(c_idx - 1, -1, -1):
                            lv = row[lc] if lc < len(row) else ""
                            if lv.strip():
                                label = lv.strip()[:200]
                                break
                    checkable_cells.append({
                        "ref": f"{chr(65 + c_idx)}{r_idx + 1}" if c_idx < 26 else f"C{c_idx}R{r_idx + 1}",
                        "row": r_idx, "col": c_idx, "label": label,
                        "initial_value": value,
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

    total_rows = ws.max_row or 0
    total_cols = ws.max_column or 0

    # 헤더 행 자동 감지 + 체크/라벨 컬럼 식별
    header_row = _detect_header_row(ws) if total_rows > 0 else 1
    col_headers = _build_column_headers(ws, header_row)
    check_cols = {col for col, h in col_headers.items() if _header_matches(h, CHECK_HEADER_KEYWORDS)}
    label_cols_list = [col for col, h in col_headers.items() if _header_matches(h, LABEL_HEADER_KEYWORDS)]

    for r in range(1, total_rows + 1):
        for c in range(1, total_cols + 1):
            merge_info = merged_cells_map.get((r, c))
            if merge_info == "hidden":
                continue  # 병합된 숨겨진 셀은 건너뜀

            cell = ws.cell(row=r, column=c)
            value = cell.value
            if value is not None:
                if hasattr(value, "strftime"):
                    try:
                        value = value.strftime("%Y-%m-%d %H:%M") if hasattr(value, "hour") else value.strftime("%Y-%m-%d")
                    except Exception:
                        value = str(value)
                else:
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
            if r > header_row:
                is_check = False
                if c in check_cols:
                    # 명시적 체크 컬럼: 빈 칸도, "완료"/"미완료"/"OK" 도 전부 체크 항목
                    is_check = True
                else:
                    # 헤더 단서 없는 컬럼은 값 패턴으로만 판단
                    is_check = _is_checkable_cell(value)
                if is_check:
                    label = _find_label_for_cell(ws, r, c, label_cols_list)
                    col_letter = get_column_letter(c)
                    checkable_cells.append({
                        "ref": f"{col_letter}{r}",
                        "row": r - 1,
                        "col": c - 1,
                        "label": label,
                        "initial_value": value,  # 기존 "완료"/"미완료" 등 상태값 보존
                    })

    # 헤더 정보 (감지된 헤더 행 기준)
    headers = []
    for col, text in col_headers.items():
        headers.append({"col": col - 1, "value": text})

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
