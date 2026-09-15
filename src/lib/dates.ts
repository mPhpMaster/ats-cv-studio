import { foldArabic, lightNormalize } from './arabic';

export interface YM {
  y: number;
  /** 1–12, or 0 when only the year is known */
  m: number;
}

export interface DateRange {
  raw: string;
  start: YM;
  end: YM;
  present: boolean;
  startText: string;
  endText: string;
}

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Folded spellings (see foldArabic) of Gulf/Egyptian and Levantine month names.
const AR_MONTHS: [string, number][] = [
  ['كانون الثاني', 1], ['كانون الاول', 12], ['تشرين الاول', 10], ['تشرين الثاني', 11],
  ['يناير', 1], ['فبراير', 2], ['مارس', 3], ['ابريل', 4], ['مايو', 5], ['يونيو', 6], ['يوليو', 7],
  ['اغسطس', 8], ['سبتمبر', 9], ['اكتوبر', 10], ['نوفمبر', 11], ['ديسمبر', 12],
  ['شباط', 2], ['اذار', 3], ['نيسان', 4], ['ايار', 5], ['حزيران', 6], ['تموز', 7], ['اب', 8], ['ايلول', 9],
];

const AR_MONTH_SRC = AR_MONTHS.map(([n]) => n.replace(' ', '\\s+')).join('|');
const EN_MONTH_SRC = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?,?';
const YEAR_SRC = '(?:19|20)\\d{2}';

export const DATE_TOKEN_SRC =
  `(?:(?:0?[1-9]|1[0-2])[/.-]${YEAR_SRC}|${EN_MONTH_SRC}\\s+${YEAR_SRC}|(?:${AR_MONTH_SRC})\\s*,?\\s*${YEAR_SRC}|${YEAR_SRC})`;
const PRESENT_SRC =
  '(?:present|current|currently|now|today|to date|ongoing|حتي الان|حتي تاريخه|الان|حاليا|الحالي|مستمر)';

const RANGE_SRC = `(?<![\\p{N}/])(${DATE_TOKEN_SRC})\\s*(?:-|–|—|to|until|till|الي|حتي)\\s*(${DATE_TOKEN_SRC}|${PRESENT_SRC})(?![\\p{N}])`;
const TOKEN_G = new RegExp(`(?<![\\p{L}\\p{N}/])${DATE_TOKEN_SRC}(?![\\p{N}])`, 'giu');

/** Lower-case, digit-normalized, Arabic-folded text used for all date matching. */
export const dateText = (s: string) => foldArabic(lightNormalize(s)).toLowerCase();

export function parseDateToken(token: string): YM | null {
  const t = dateText(token).trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return { y: +m[2], m: +m[1] };
  m = t.match(/^([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
  if (m) {
    const i = EN_MONTHS.indexOf(m[1]);
    return i >= 0 ? { y: +m[2], m: i + 1 } : null;
  }
  for (const [name, month] of AR_MONTHS) {
    const r = new RegExp(`^${name.replace(' ', '\\s+')}\\s*,?\\s*(\\d{4})$`);
    const am = t.match(r);
    if (am) return { y: +am[1], m: month };
  }
  m = t.match(/^(\d{4})$/);
  return m ? { y: +m[1], m: 0 } : null;
}

export function nowYM(): YM {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

export function findRanges(text: string): DateRange[] {
  const folded = dateText(text);
  const out: DateRange[] = [];
  for (const match of folded.matchAll(new RegExp(RANGE_SRC, 'giu'))) {
    const start = parseDateToken(match[1]);
    const endToken = match[2];
    const present = new RegExp(`^${PRESENT_SRC}$`, 'iu').test(endToken);
    const end = present ? nowYM() : parseDateToken(endToken);
    if (!start || !end) continue;
    // Map back to the original text by position (folding keeps string length).
    const idx = match.index ?? 0;
    const raw = lightNormalize(text).slice(idx, idx + match[0].length);
    out.push({
      raw,
      start: { y: start.y, m: start.m || 1 },
      end: { y: end.y, m: end.m || 12 },
      present,
      startText: match[1],
      endText: endToken,
    });
  }
  return out;
}

export type DateFormatKind = 'numeric' | 'month' | 'year';

export const dateFormatKind = (token: string): DateFormatKind =>
  /^\d{1,2}[/.-]\d{4}$/.test(token.trim()) ? 'numeric' : /^\d{4}$/.test(token.trim()) ? 'year' : 'month';

export function countDateTokens(text: string): { tokens: string[]; total: number; withMonth: number; years: number[] } {
  const tokens = [...dateText(text).matchAll(TOKEN_G)].map((m) => m[0]);
  return {
    tokens,
    total: tokens.length,
    withMonth: tokens.filter((t) => !/^\d{4}$/.test(t.trim())).length,
    years: tokens.map((t) => +(t.match(/(19|20)\d{2}/)?.[0] ?? 0)).filter(Boolean),
  };
}

export const hasPresent = (text: string) => new RegExp(`(?<!\\p{L})${PRESENT_SRC}(?!\\p{L})`, 'iu').test(dateText(text));

export const toMonths = (d: YM) => d.y * 12 + (d.m || 1);

export function formatYM(d: YM | null): string {
  if (!d) return '';
  return d.m ? `${String(d.m).padStart(2, '0')}/${d.y}` : String(d.y);
}

/** Merge overlapping ranges and return total months plus gaps longer than `minGap` months. */
export function timeline(ranges: DateRange[], minGap = 6) {
  const sorted = [...ranges].sort((a, b) => toMonths(a.start) - toMonths(b.start));
  const merged: { s: number; e: number }[] = [];
  const gaps: { from: YM; to: YM; months: number }[] = [];
  for (const r of sorted) {
    const s = toMonths(r.start);
    const e = toMonths(r.end);
    const last = merged[merged.length - 1];
    if (last && s <= last.e + 1) {
      last.e = Math.max(last.e, e);
    } else {
      if (last && s - last.e - 1 > minGap) {
        gaps.push({ from: fromMonths(last.e), to: fromMonths(s), months: s - last.e - 1 });
      }
      merged.push({ s, e });
    }
  }
  const months = merged.reduce((sum, r) => sum + (r.e - r.s + 1), 0);
  return { months, gaps };
}

function fromMonths(total: number): YM {
  const y = Math.floor((total - 1) / 12);
  return { y, m: total - y * 12 };
}
