/**
 * Import Parser — CSV/XLSX file parsing for bulk project/task creation.
 *
 * Pipeline:
 * 1. Read file (CSV/XLSX)
 * 2. XLSX merged cell expansion
 * 3. Cell value normalization (trim, strip quotes)
 * 4. Forward fill for group columns (project, schedule, status)
 * 5. Schedule parsing (diverse Korean/Excel patterns)
 * 6. Status normalization
 * 7. Row-level validation with clear error messages
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// ── Column name aliases ──
const PROJECT_ALIASES = ['project', '프로젝트'];
const TASK_ALIASES = ['task', '업무', '작업', '태스크'];
const SCHEDULE_ALIASES = ['schedule', '일정'];
const STATUS_ALIASES = ['status', '상태'];

// Columns to apply forward fill (merged cell fallback)
const FORWARD_FILL_ALIASES = [PROJECT_ALIASES, SCHEDULE_ALIASES, STATUS_ALIASES];

// ── Status normalization map ──
const STATUS_MAP: Record<string, string> = {
  'todo': 'todo',
  'to do': 'todo',
  'to-do': 'todo',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  'inprogress': 'in_progress',
  'progress': 'in_progress',
  '진행중': 'in_progress',
  '진행 중': 'in_progress',
  'done': 'done',
  '완료': 'done',
  'hold': 'hold',
  '보류': 'hold',
  '대기': 'hold',
};

export interface ImportRow {
  rowNumber: number;
  project: string;
  task: string;
  schedule: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  normalizedStatus: string;
  warnings: string[];
  errors: string[];
}

export interface ImportPreview {
  columns: {
    project: string | null;
    task: string | null;
    schedule: string | null;
    status: string | null;
  };
  rows: ImportRow[];
  projectCount: number;
  taskCount: number;
  errorCount: number;
  warningCount: number;
  columnErrors: string[];
}

// ══════════════════════════════════════════════════
// Step helpers
// ══════════════════════════════════════════════════

// ── Detect column by aliases (case-insensitive, trimmed) ──
function findColumn(headers: string[], aliases: string[]): string | null {
  for (const h of headers) {
    const normalized = h.trim().toLowerCase();
    if (aliases.includes(normalized)) return h;
  }
  return null;
}

// ── Normalize a single cell value ──
// Strips leading single-quotes, trims whitespace
function normalizeCellValue(value: unknown): string {
  let s = String(value ?? '').trim();
  // Remove leading single-quotes (Excel text prefix: ', '', etc.)
  s = s.replace(/^'+/, '');
  return s.trim();
}

// ── XLSX merged cell expansion ──
// Fills merged regions with the top-left cell's value
function applyMergedCellValues(sheet: XLSX.WorkSheet): void {
  const merges = sheet['!merges'];
  if (!merges || merges.length === 0) return;

  for (const merge of merges) {
    // Get the value from the top-left cell of the merge range
    const topLeftAddr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const topLeftCell = sheet[topLeftAddr];
    const value = topLeftCell ? topLeftCell.v : '';

    // Fill all cells in the merge range
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue; // skip top-left itself
        const addr = XLSX.utils.encode_cell({ r, c });
        sheet[addr] = { t: 's', v: value };
      }
    }
  }
}

// ── Forward fill for group columns ──
// When a cell is empty, carry forward the previous non-empty value
function forwardFillRows(
  data: Record<string, string>[],
  headers: string[],
  columnAliasGroups: string[][],
): void {
  // Find which actual header names need forward fill
  const fillColumns: string[] = [];
  for (const aliases of columnAliasGroups) {
    const col = findColumn(headers, aliases);
    if (col) fillColumns.push(col);
  }

  const lastValues: Record<string, string> = {};

  for (const row of data) {
    for (const col of fillColumns) {
      const val = normalizeCellValue(row[col]);
      if (val && val !== '-') {
        lastValues[col] = val;
        row[col] = val;
      } else if (!val && lastValues[col]) {
        // Empty cell — fill from previous row
        row[col] = lastValues[col];
      }
    }
  }
}

// ── Normalize status value ──
export function normalizeStatus(value: string): string | null {
  const key = value.trim().toLowerCase().replace(/[\s\-_]+/g, ' ');
  return STATUS_MAP[key] || null;
}

// ── Parse schedule string to start/end dates ──
function p(v: string | number): string {
  return String(v).padStart(2, '0');
}

function normalizeYear(y: string): string {
  const n = parseInt(y);
  if (n < 100) return String(2000 + n);
  return String(n);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseSchedule(raw: string): { start: string | null; end: string | null; error?: string } {
  if (!raw) return { start: null, end: null };

  // Pre-process: normalize cell value (strip quotes, trim)
  let text = normalizeCellValue(raw);

  // "-" or empty → no schedule (NOT an error)
  if (!text || text === '-') {
    return { start: null, end: null };
  }

  // ── Pattern 0: ~YY.M월 or ~YYYY.M월 (today → end of that month) ──
  const tildeYM = text.match(/^~\s*(\d{2,4})[.](\d{1,2})월?$/);
  if (tildeYM) {
    const year = normalizeYear(tildeYM[1]);
    const month = parseInt(tildeYM[2]);
    if (month >= 1 && month <= 12) {
      const lastDay = new Date(parseInt(year), month, 0).getDate();
      return {
        start: todayStr(),
        end: `${year}-${p(month)}-${p(lastDay)}`,
      };
    }
  }

  // ── Pattern 0b: YY.M월 without tilde (standalone, e.g. "26.12월") → today ~ end of month ──
  const standaloneYM = text.match(/^(\d{2,4})[.](\d{1,2})월?$/);
  if (standaloneYM) {
    const year = normalizeYear(standaloneYM[1]);
    const month = parseInt(standaloneYM[2]);
    if (month >= 1 && month <= 12) {
      const lastDay = new Date(parseInt(year), month, 0).getDate();
      return {
        start: todayStr(),
        end: `${year}-${p(month)}-${p(lastDay)}`,
      };
    }
  }

  // ── Pattern 1: "26년3월1일-26년10월20일" / "2026년3월1일-2026년10월20일" ──
  const koreanYearFull = text.match(
    /(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일?\s*[-~]\s*(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일?/
  );
  if (koreanYearFull) {
    return {
      start: `${normalizeYear(koreanYearFull[1])}-${p(koreanYearFull[2])}-${p(koreanYearFull[3])}`,
      end: `${normalizeYear(koreanYearFull[4])}-${p(koreanYearFull[5])}-${p(koreanYearFull[6])}`,
    };
  }

  // ── Pattern 2: "3월2일부터10월20일" / "3월10일~11월11일" ──
  const koreanDateRange = text.match(
    /(\d{1,2})월\s*(\d{1,2})일?\s*(?:부터|에서)?\s*[-~]?\s*(\d{1,2})월\s*(\d{1,2})일?\s*(?:까지)?/
  );
  if (koreanDateRange) {
    const year = new Date().getFullYear();
    return {
      start: `${year}-${p(koreanDateRange[1])}-${p(koreanDateRange[2])}`,
      end: `${year}-${p(koreanDateRange[3])}-${p(koreanDateRange[4])}`,
    };
  }

  // ── Pattern 3: "3월~10월" month range ──
  const koreanMonthRange = text.match(
    /(\d{1,2})월\s*(?:부터|에서)?\s*[-~]?\s*(\d{1,2})월\s*(?:까지)?/
  );
  if (koreanMonthRange) {
    const year = new Date().getFullYear();
    const sm = parseInt(koreanMonthRange[1]);
    const em = parseInt(koreanMonthRange[2]);
    if (sm >= 1 && sm <= 12 && em >= 1 && em <= 12) {
      const lastDay = new Date(year, em, 0).getDate();
      return {
        start: `${year}-${p(sm)}-01`,
        end: `${year}-${p(em)}-${p(lastDay)}`,
      };
    }
  }

  // ── Pattern 4: "2026.03.01~2026.10.20" full date range ──
  const fullDateRange = text.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[-~]\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/
  );
  if (fullDateRange) {
    return {
      start: `${fullDateRange[1]}-${p(fullDateRange[2])}-${p(fullDateRange[3])}`,
      end: `${fullDateRange[4]}-${p(fullDateRange[5])}-${p(fullDateRange[6])}`,
    };
  }

  // ── Pattern 5: "3/10-11/11" or "3.2-12.2" (M/D range) ──
  const mdRange = text.match(
    /(\d{1,2})[./](\d{1,2})\s*[-~]\s*(\d{1,2})[./](\d{1,2})/
  );
  if (mdRange) {
    const year = new Date().getFullYear();
    return {
      start: `${year}-${p(mdRange[1])}-${p(mdRange[2])}`,
      end: `${year}-${p(mdRange[3])}-${p(mdRange[4])}`,
    };
  }

  // ── Pattern 6: "3~10" simple month range ──
  const simpleRange = text.match(/^(\d{1,2})\s*[-~]\s*(\d{1,2})$/);
  if (simpleRange) {
    const sm = parseInt(simpleRange[1]);
    const em = parseInt(simpleRange[2]);
    if (sm >= 1 && sm <= 12 && em >= 1 && em <= 12) {
      const year = new Date().getFullYear();
      const lastDay = new Date(year, em, 0).getDate();
      return {
        start: `${year}-${p(sm)}-01`,
        end: `${year}-${p(em)}-${p(lastDay)}`,
      };
    }
  }

  return { start: null, end: null, error: `일정 형식을 해석할 수 없습니다: "${raw}"` };
}

// ══════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════

// ── Read file (CSV or XLSX) and return header + rows ──
export async function readFile(file: File): Promise<{ headers: string[]; data: Record<string, string>[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const headers = result.meta.fields || [];
          // Normalize all cell values
          const data = result.data.map(row => {
            const out: Record<string, string> = {};
            for (const key of headers) {
              out[key] = normalizeCellValue(row[key]);
            }
            return out;
          });
          // Forward fill for group columns
          forwardFillRows(data, headers, FORWARD_FILL_ALIASES);
          resolve({ headers, data });
        },
        error: (err) => reject(new Error(`CSV 파싱 실패: ${err.message}`)),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Step 2: Expand merged cells BEFORE converting to JSON
    applyMergedCellValues(sheet);

    const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

    // Normalize all cell values
    const data = jsonData.map(row => {
      const out: Record<string, string> = {};
      for (const key of headers) {
        out[key] = normalizeCellValue(row[key]);
      }
      return out;
    });

    // Forward fill as additional fallback (in case merge detection missed anything)
    forwardFillRows(data, headers, FORWARD_FILL_ALIASES);

    return { headers, data };
  }

  throw new Error('지원하지 않는 파일 형식입니다. CSV 또는 XLSX 파일만 업로드할 수 있습니다.');
}

// ── Parse and validate file data ──
export function parseImportData(headers: string[], data: Record<string, string>[]): ImportPreview {
  const projectCol = findColumn(headers, PROJECT_ALIASES);
  const taskCol = findColumn(headers, TASK_ALIASES);
  const scheduleCol = findColumn(headers, SCHEDULE_ALIASES);
  const statusCol = findColumn(headers, STATUS_ALIASES);

  const columnErrors: string[] = [];
  if (!projectCol) columnErrors.push('project 컬럼을 찾을 수 없습니다. (project, 프로젝트)');
  if (!taskCol) columnErrors.push('task 컬럼을 찾을 수 없습니다. (task, 업무, 작업, 태스크)');

  const rows: ImportRow[] = [];
  const projectNames = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  data.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based, +1 for header row
    const projectVal = projectCol ? normalizeCellValue(row[projectCol]) : '';
    const taskVal = taskCol ? normalizeCellValue(row[taskCol]) : '';
    const scheduleVal = scheduleCol ? normalizeCellValue(row[scheduleCol]) : '';
    const statusVal = statusCol ? normalizeCellValue(row[statusCol]) : '';

    const warnings: string[] = [];
    const errors: string[] = [];

    // Validate project (after forward fill, only truly missing rows should error)
    if (!projectVal) {
      errors.push(`${rowNum}행: project 값이 비어 있어 스킵됩니다.`);
    }

    // Validate task
    if (!taskVal) {
      errors.push(`${rowNum}행: task 값이 비어 있어 스킵됩니다.`);
    }

    // Parse schedule — "-" and empty are normal (no warning)
    const parsed = parseSchedule(scheduleVal);
    const startDate = parsed.start;
    const endDate = parsed.end;
    if (parsed.error) {
      warnings.push(`${rowNum}행: ${parsed.error}`);
    }

    // Normalize status
    let normalizedStatus = 'todo';
    if (statusVal && statusVal !== '-') {
      const ns = normalizeStatus(statusVal);
      if (ns) {
        normalizedStatus = ns;
      } else {
        warnings.push(`${rowNum}행: status 값이 유효하지 않습니다: "${statusVal}" → 기본값 To Do로 처리`);
      }
    }

    if (projectVal) projectNames.add(projectVal);
    if (errors.length > 0) errorCount++;
    warningCount += warnings.length;

    rows.push({
      rowNumber: rowNum,
      project: projectVal,
      task: taskVal,
      schedule: scheduleVal,
      status: statusVal,
      startDate,
      endDate,
      normalizedStatus,
      warnings,
      errors,
    });
  });

  const validRows = rows.filter(r => r.errors.length === 0);

  return {
    columns: {
      project: projectCol,
      task: taskCol,
      schedule: scheduleCol,
      status: statusCol,
    },
    rows,
    projectCount: projectNames.size,
    taskCount: validRows.length,
    errorCount,
    warningCount,
    columnErrors,
  };
}

// ── Generate sample CSV content for download ──
export function generateSampleCSV(): string {
  return `project,task,schedule,status
원가절감 프로젝트,공정별 분석 정리,26년3월1일-26년10월20일,In Progress
원가절감 프로젝트,대체 소재 검토,3/10-11/11,To do
원가절감 프로젝트,효과 측정 보고,~26.12월,To do
원가절감 프로젝트,현행 원가 분석,-,Done
마케팅 캠페인,타겟 분석,3월~10월,Done
마케팅 캠페인,콘텐츠 제작,3월2일부터10월20일,In Progress
마케팅 캠페인,성과 리포트,6~12,To do`;
}
