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

/**
 * Parse schedule string to start/end dates.
 *
 * Design principle: NEVER return an error. If we can extract any date info, use it.
 * If we can't parse anything, return null/null silently — the task is still created.
 *
 * Strategy:
 * 1. Try specific range patterns (two dates in one string)
 * 2. Try single-date/month patterns (→ today ~ that date)
 * 3. Fallback: extract any year/month numbers from the string generically
 */
export function parseSchedule(raw: string): { start: string | null; end: string | null } {
  if (!raw) return { start: null, end: null };

  let text = normalizeCellValue(raw);
  // Remove leading ~ (means "from now until")
  const hasTilde = text.startsWith('~');
  if (hasTilde) text = text.slice(1).trim();

  // "-" or empty → no schedule
  if (!text || text === '-') return { start: null, end: null };

  const now = new Date();
  const currentYear = now.getFullYear();

  // ═══ RANGE PATTERNS (two endpoints) ═══

  // R1: "26년3월1일-26년10월20일" / "2026년3월1일~2026년10월20일"
  const r1 = text.match(
    /(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일?\s*[-~]\s*(\d{2,4})년\s*(\d{1,2})월\s*(\d{1,2})일?/
  );
  if (r1) return {
    start: `${normalizeYear(r1[1])}-${p(r1[2])}-${p(r1[3])}`,
    end: `${normalizeYear(r1[4])}-${p(r1[5])}-${p(r1[6])}`,
  };

  // R2: "3월10일~11월11일" / "3월2일부터10월20일"
  const r2 = text.match(
    /(\d{1,2})월\s*(\d{1,2})일?\s*(?:부터|에서)?\s*[-~]?\s*(\d{1,2})월\s*(\d{1,2})일?\s*(?:까지)?/
  );
  if (r2) return {
    start: `${currentYear}-${p(r2[1])}-${p(r2[2])}`,
    end: `${currentYear}-${p(r2[3])}-${p(r2[4])}`,
  };

  // R3: "3월~10월" month-month range
  const r3 = text.match(
    /(\d{1,2})월\s*(?:부터|에서)?\s*[-~]?\s*(\d{1,2})월\s*(?:까지)?/
  );
  if (r3) {
    const sm = parseInt(r3[1]), em = parseInt(r3[2]);
    if (sm >= 1 && sm <= 12 && em >= 1 && em <= 12) {
      return {
        start: `${currentYear}-${p(sm)}-01`,
        end: `${currentYear}-${p(em)}-${p(new Date(currentYear, em, 0).getDate())}`,
      };
    }
  }

  // R4: "2026.03.01~2026.10.20" / "2026-03-01~2026-10-20"
  const r4 = text.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[-~]\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/
  );
  if (r4) return {
    start: `${r4[1]}-${p(r4[2])}-${p(r4[3])}`,
    end: `${r4[4]}-${p(r4[5])}-${p(r4[6])}`,
  };

  // R5: "3/10-11/11" / "3.2-12.2" M/D-M/D
  const r5 = text.match(
    /(\d{1,2})[./](\d{1,2})\s*[-~]\s*(\d{1,2})[./](\d{1,2})/
  );
  if (r5) return {
    start: `${currentYear}-${p(r5[1])}-${p(r5[2])}`,
    end: `${currentYear}-${p(r5[3])}-${p(r5[4])}`,
  };

  // R6: "3~10" simple number range → month range
  const r6 = text.match(/^(\d{1,2})\s*[-~]\s*(\d{1,2})$/);
  if (r6) {
    const sm = parseInt(r6[1]), em = parseInt(r6[2]);
    if (sm >= 1 && sm <= 12 && em >= 1 && em <= 12) {
      return {
        start: `${currentYear}-${p(sm)}-01`,
        end: `${currentYear}-${p(em)}-${p(new Date(currentYear, em, 0).getDate())}`,
      };
    }
  }

  // ═══ SINGLE ENDPOINT PATTERNS (→ today ~ that date) ═══

  // S1: "YY.M월" / "YY/M월" / "YYYY.M월" e.g. "26.12월", "26/8월", "2026.12월"
  const s1 = text.match(/(\d{2,4})[./](\d{1,2})월?/);
  if (s1) {
    const year = normalizeYear(s1[1]);
    const month = parseInt(s1[2]);
    if (month >= 1 && month <= 12) {
      return {
        start: todayStr(),
        end: `${year}-${p(month)}-${p(new Date(parseInt(year), month, 0).getDate())}`,
      };
    }
  }

  // S2: "12월" / "8월" — standalone month → today ~ end of that month (current year)
  const s2 = text.match(/^(\d{1,2})월$/);
  if (s2) {
    const month = parseInt(s2[1]);
    if (month >= 1 && month <= 12) {
      return {
        start: todayStr(),
        end: `${currentYear}-${p(month)}-${p(new Date(currentYear, month, 0).getDate())}`,
      };
    }
  }

  // S3: "M월D일" single date → today ~ that date
  const s3 = text.match(/(\d{1,2})월\s*(\d{1,2})일?/);
  if (s3) {
    const m = parseInt(s3[1]), d = parseInt(s3[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return { start: todayStr(), end: `${currentYear}-${p(m)}-${p(d)}` };
    }
  }

  // ═══ GENERIC FALLBACK: extract any year/month from the string ═══
  // Try to find YY or YYYY followed by month number
  const gYear = text.match(/(\d{2,4})/);
  const gMonth = text.match(/(\d{1,2})\s*월/) || (gYear ? text.replace(gYear[0], '').match(/(\d{1,2})/) : null);

  if (gMonth) {
    const month = parseInt(gMonth[1]);
    if (month >= 1 && month <= 12) {
      const year = gYear ? normalizeYear(gYear[1]) : String(currentYear);
      // If extracted year looks like a month (1-12), use current year instead
      const yearNum = parseInt(year);
      const finalYear = yearNum < 2000 && yearNum <= 12 ? String(currentYear) : year;
      return {
        start: todayStr(),
        end: `${finalYear}-${p(month)}-${p(new Date(parseInt(finalYear), month, 0).getDate())}`,
      };
    }
  }

  // Nothing found — return null/null silently (task still gets created, just without dates)
  return { start: null, end: null };
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

    // Parse schedule — never produces errors, task always gets created
    const parsed = parseSchedule(scheduleVal);
    const startDate = parsed.start;
    const endDate = parsed.end;

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
