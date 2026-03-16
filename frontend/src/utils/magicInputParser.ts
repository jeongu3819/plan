/**
 * Magic Input Parser — Client-side NLP extraction
 *
 * Parses a natural language task title to extract structured fields.
 * This runs locally (no AI call) for instant preview.
 * An optional AI endpoint can refine results if configured.
 */

export interface ParsedTaskInput {
  title: string;
  startDate: string | null;   // YYYY-MM-DD
  endDate: string | null;     // YYYY-MM-DD
  tags: string[];
  priority: 'low' | 'medium' | 'high' | null;
  confidence: number;         // 0-1
  rawText: string;
}

// ── Date phrase patterns (Korean + English) ──
const DATE_PATTERNS: { pattern: RegExp; resolver: () => { start?: string; end?: string } }[] = [
  {
    // "이번 달" / "this month"
    pattern: /(?:이번\s*달|this\s+month)/i,
    resolver: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: fmt(start), end: fmt(end) };
    },
  },
  {
    // "다음 달" / "next month"
    pattern: /(?:다음\s*달|next\s+month)/i,
    resolver: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      return { start: fmt(start), end: fmt(end) };
    },
  },
  {
    // "연말" / "year-end" / "year end"
    pattern: /(?:연말|year[\s-]*end)/i,
    resolver: () => {
      const now = new Date();
      return { end: `${now.getFullYear()}-12-31` };
    },
  },
  {
    // "다음 주" / "next week"
    pattern: /(?:다음\s*주|next\s+week)/i,
    resolver: () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const nextMon = new Date(now);
      nextMon.setDate(now.getDate() + (7 - dayOfWeek) + 1);
      const nextFri = new Date(nextMon);
      nextFri.setDate(nextMon.getDate() + 4);
      return { start: fmt(nextMon), end: fmt(nextFri) };
    },
  },
  {
    // "이번 주" / "this week"
    pattern: /(?:이번\s*주|this\s+week)/i,
    resolver: () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const fri = new Date(mon);
      fri.setDate(mon.getDate() + 4);
      return { start: fmt(mon), end: fmt(fri) };
    },
  },
  {
    // "내일" / "tomorrow"
    pattern: /(?:내일|tomorrow)/i,
    resolver: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return { end: fmt(d) };
    },
  },
  {
    // "오늘" / "today"
    pattern: /(?:오늘|today)/i,
    resolver: () => ({ end: fmt(new Date()) }),
  },
  {
    // "다음 금요일" / "next friday"
    pattern: /(?:다음\s*금요일|next\s+friday)/i,
    resolver: () => {
      const now = new Date();
      const daysUntilFri = ((5 - now.getDay() + 7) % 7) || 7;
      const d = new Date(now);
      d.setDate(now.getDate() + daysUntilFri);
      return { end: fmt(d) };
    },
  },
  {
    // Explicit date range: "2026.03.01 ~ 2026.12.31" or "2026-03-01~2026-12-31"
    pattern: /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~\-부터까지to]+\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
    resolver: function () {
      // This will be handled inline
      return {};
    },
  },
  {
    // Single date: "3/15" "03.15" "3월 15일"
    pattern: /(\d{1,2})[월./](\d{1,2})일?/,
    resolver: function () {
      return {};
    },
  },
];

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Tag extraction ──
function extractTags(text: string): { tags: string[]; cleaned: string } {
  const tags: string[] = [];
  const cleaned = text.replace(/#(\S+)/g, (_, tag) => {
    tags.push(tag);
    return '';
  });
  return { tags, cleaned: cleaned.trim() };
}

// ── Priority extraction ──
function extractPriority(text: string): { priority: ParsedTaskInput['priority']; cleaned: string } {
  const highPatterns = /(?:긴급|급한|중요|urgent|important|high\s*priority)/i;
  const lowPatterns = /(?:낮은|나중에|low\s*priority|when\s*possible)/i;

  if (highPatterns.test(text)) {
    return { priority: 'high', cleaned: text.replace(highPatterns, '').trim() };
  }
  if (lowPatterns.test(text)) {
    return { priority: 'low', cleaned: text.replace(lowPatterns, '').trim() };
  }
  return { priority: null, cleaned: text };
}

/**
 * Parse a natural language input string into structured task fields.
 */
export function parseTaskInput(rawText: string): ParsedTaskInput {
  if (!rawText.trim()) {
    return { title: '', startDate: null, endDate: null, tags: [], priority: null, confidence: 0, rawText };
  }

  let text = rawText.trim();
  let startDate: string | null = null;
  let endDate: string | null = null;
  let confidence = 0.3; // baseline

  // 1) Extract tags
  const { tags, cleaned: afterTags } = extractTags(text);
  text = afterTags;
  if (tags.length > 0) confidence += 0.1;

  // 2) Extract priority
  const { priority, cleaned: afterPriority } = extractPriority(text);
  text = afterPriority;
  if (priority) confidence += 0.1;

  // 3) Extract explicit date range first
  const rangeMatch = text.match(
    /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~\-부터까지to]+\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/
  );
  if (rangeMatch) {
    startDate = `${rangeMatch[1]}-${rangeMatch[2].padStart(2, '0')}-${rangeMatch[3].padStart(2, '0')}`;
    endDate = `${rangeMatch[4]}-${rangeMatch[5].padStart(2, '0')}-${rangeMatch[6].padStart(2, '0')}`;
    text = text.replace(rangeMatch[0], '').trim();
    confidence += 0.3;
  } else {
    // Try phrase-based date patterns
    for (const dp of DATE_PATTERNS) {
      if (dp.pattern.test(text)) {
        const resolved = dp.resolver();
        if (resolved.start) startDate = resolved.start;
        if (resolved.end) endDate = resolved.end;
        text = text.replace(dp.pattern, '').trim();
        confidence += 0.2;
        break; // only match first date pattern
      }
    }
  }

  // 4) Extract single date (M/D or M월D일)
  if (!startDate && !endDate) {
    const singleMatch = text.match(/(\d{1,2})[월./](\d{1,2})일?/);
    if (singleMatch) {
      const year = new Date().getFullYear();
      const month = singleMatch[1].padStart(2, '0');
      const day = singleMatch[2].padStart(2, '0');
      endDate = `${year}-${month}-${day}`;
      text = text.replace(singleMatch[0], '').trim();
      confidence += 0.15;
    }
  }

  // 5) Clean up title — remove "~", "부터", "까지", extra spaces
  let title = text
    .replace(/\s*[~부터까지에서에서까지from\s]+$/i, '')
    .replace(/^\s*[~부터까지에서에서까지from\s]+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If title is empty after extraction, use the raw text
  if (!title) title = rawText.trim();

  confidence = Math.min(1, confidence);

  return { title, startDate, endDate, tags, priority, confidence, rawText };
}

/**
 * AI System Prompt for server-side Magic Input parsing.
 * Include this when calling the AI endpoint for refined parsing.
 */
export const MAGIC_INPUT_SYSTEM_PROMPT = `You are a task parser. Convert the user's natural language input into a structured JSON object.

Current date context: ${new Date().toISOString().slice(0, 10)}

Output STRICT JSON only with these fields:
{
  "title": "string - the extracted task title",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "tags": ["array of strings without # prefix"],
  "assignee": "string or null - name if mentioned",
  "priority": "low | medium | high | null",
  "confidence": 0.0-1.0,
  "rawText": "original input"
}

Rules:
- If unsure about a field, set it to null. Never hallucinate.
- Preserve the original meaning of the title.
- Parse relative dates: "이번 달" = this month, "연말" = year-end, "다음 주" = next week, "내일" = tomorrow, "다음 금요일" = next friday
- Tags start with # in the input.
- Return ONLY valid JSON, no markdown or explanation.`;

/**
 * Expected AI response JSON schema (for documentation).
 */
export const MAGIC_INPUT_SCHEMA = {
  title: 'string',
  startDate: 'YYYY-MM-DD | null',
  endDate: 'YYYY-MM-DD | null',
  tags: ['string'],
  assignee: 'string | null',
  priority: 'low | medium | high | null',
  confidence: 'number (0-1)',
  rawText: 'string',
};
