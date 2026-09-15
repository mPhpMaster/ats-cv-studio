import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser.js';
import type { CVData } from '../types';
import type { SourceInfo } from './analyzer';
import { PERSIAN_ONLY_RE, arabicLetterForms, isArabicText } from './arabic';
import { parseLinkedInPdf, type PdfColumns, type PdfLine } from './linkedin';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type ParseErrorCode = 'doc' | 'image' | 'unsupported';

export class ParseError extends Error {
  code: ParseErrorCode;
  constructor(code: ParseErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface ParsedFile {
  text: string;
  source: SourceInfo;
  /** Structured data when the file was recognized as a LinkedIn profile PDF. */
  linkedin?: CVData;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  size: number;
}

type Dir = 'R' | 'L' | 'N';

/** Strong direction of a text run: Arabic letters (R), Latin letters/digits (L), or neutral punctuation (N). */
function dirOf(s: string): Dir {
  const ar = (s.match(/\p{Script=Arabic}/gu) ?? []).length;
  const lt = (s.match(/[A-Za-z0-9]/g) ?? []).length;
  if (!ar && !lt) return 'N';
  return ar >= lt ? 'R' : 'L';
}

/**
 * Put a row's items into logical (reading) order. pdf.js returns glyph runs positioned visually, so text written
 * against the row's base direction — an Arabic phrase in an English line, or an email inside an Arabic line — must be
 * reversed back, otherwise "دبي، الإمارات" comes out letter-reversed.
 */
function logicalOrder(row: Item[], rtl: boolean): Item[] {
  const visual = [...row].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
  const base: Dir = rtl ? 'R' : 'L';
  const strong = visual.map((i) => dirOf(i.str));
  // Neutrals between two runs of the same direction join them; otherwise they follow the base direction (as in Unicode bidi).
  const resolved = strong.map((d, i) => {
    if (d !== 'N') return d;
    const prev = strong.slice(0, i).reverse().find((x) => x !== 'N');
    const next = strong.slice(i + 1).find((x) => x !== 'N');
    return prev && prev === next ? prev : base;
  });
  const out: Item[] = [];
  for (let i = 0; i < visual.length;) {
    let j = i;
    while (j < visual.length && resolved[j] === resolved[i]) j++;
    const run = visual.slice(i, j);
    out.push(...(resolved[i] === base ? run : run.reverse()));
    i = j;
  }
  return out;
}

/** Group text items into visual rows by baseline, like a simple ATS parser would. */
function buildLines(items: Item[], pageWidth: number, pageRtl: boolean, fixArabicLetters: boolean) {
  const rows: Item[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - item.y) < 3);
    if (row) row.push(item);
    else rows.push([item]);
  }

  const lines: PdfLine[] = [];
  let split = 0;
  for (const row of rows) {
    const rowText = row.map((i) => i.str).join('');
    // On an Arabic page every row containing Arabic is right-to-left, even when Latin text (emails, URLs) dominates it.
    const rtl = /\p{Script=Arabic}/u.test(rowText) && (pageRtl || isArabicText(rowText));

    const visual = [...row].sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    let splitRow = false;
    for (let k = 1; k < visual.length; k++) {
      const prev = visual[k - 1];
      const item = visual[k];
      const gap = rtl ? prev.x - (item.x + item.w) : item.x - (prev.x + prev.w);
      const edge = rtl ? item.x + item.w : item.x;
      // A wide gap whose next text starts mid-page suggests a second column.
      if (gap > pageWidth * 0.08 && edge > pageWidth * 0.25 && edge < pageWidth * 0.75) splitRow = true;
    }
    if (splitRow) split++;

    let text = '';
    let prev: Item | null = null;
    for (const item of logicalOrder(row, rtl)) {
      if (prev) {
        const gap = Math.max(item.x - (prev.x + prev.w), prev.x - (item.x + item.w));
        if (gap > item.size * 0.15 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' ';
      }
      text += item.str;
      prev = item;
    }
    // NFKC maps Arabic presentation forms (ﺳﺎرة) and ligatures (ﬁ) back to ordinary letters that ATS keyword search
    // matches. Some fonts' forms decompose to Persian look-alikes (ی ھ), so those are mapped to Arabic ي ه on Arabic pages.
    const normalized = text.normalize('NFKC');
    const clean = (fixArabicLetters ? arabicLetterForms(normalized) : normalized).replace(/\s+/g, ' ').trim();
    if (clean) lines.push({ text: clean, size: Math.max(...row.map((i) => i.size)) });
  }
  return { lines, rows: rows.length, split };
}

async function parsePdf(file: File): Promise<ParsedFile> {
  // pdf.js keeps every parsed page, font and its worker-side document alive until told otherwise; without this
  // each uploaded or compared PDF stayed in memory for the rest of the session. The loading task is what
  // destroys it, and destroying the task also covers a file that fails to open.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return await readPdf(await task.promise, file);
  } finally {
    void task.destroy();
  }
}

async function readPdf(pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>, file: File): Promise<ParsedFile> {
  const textLines: string[] = [];
  const pages: { items: Item[]; width: number; pageRtl: boolean; fixLetters: boolean }[] = [];
  let images = 0;
  let rowsTotal = 0;
  let rowsSplit = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    const items: Item[] = (content.items as PdfTextItem[])
      .filter((i) => typeof i.str === 'string' && i.str.trim())
      .map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        w: i.width,
        size: Math.hypot(i.transform[2], i.transform[3]) || 10,
      }));

    const pageText = items.map((i) => i.str).join('');
    const pageRtl = isArabicText(pageText);
    const fixLetters = /\p{Script=Arabic}/u.test(pageText) && !PERSIAN_ONLY_RE.test(pageText.normalize('NFKC'));
    const all = buildLines(items, width, pageRtl, fixLetters);
    rowsTotal += all.rows;
    rowsSplit += all.split;
    textLines.push(...all.lines.map((l) => l.text), '');
    pages.push({ items, width, pageRtl, fixLetters });

    const ops = await page.getOperatorList();
    for (const fn of ops.fnArray) {
      if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) images++;
    }
    page.cleanup();
  }

  const text = textLines.join('\n');
  // The sidebar/main split exists only for LinkedIn's own PDF export, which always carries a linkedin.com/in/
  // link and is refused by parseLinkedInPdf without one. Every other PDF used to be laid out three times per page.
  const columns: PdfColumns[] = /linkedin\.com\/in\//i.test(text.replace(/\s/g, ''))
    ? pages.map(({ items, width, pageRtl, fixLetters }) => {
      const sidebarEdge = width * 0.33;
      return {
        sidebar: buildLines(items.filter((i) => i.x < sidebarEdge), width, pageRtl, fixLetters).lines,
        main: buildLines(items.filter((i) => i.x >= sidebarEdge), width, pageRtl, fixLetters).lines,
      };
    })
    : [];
  return {
    text,
    source: {
      kind: 'pdf',
      fileName: file.name,
      pages: pdf.numPages,
      images,
      tables: 0,
      multiColumnLikely: rowsTotal >= 10 && rowsSplit / rowsTotal > 0.3,
    },
    linkedin: parseLinkedInPdf(columns, text) ?? undefined,
  };
}

async function parseDocx(file: File): Promise<ParsedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const html = await mammoth.convertToHtml({ arrayBuffer });
  // Rebuild text from the HTML so list items keep a bullet marker (raw text extraction drops them).
  const dom = new DOMParser().parseFromString(html.value, 'text/html');
  dom.querySelectorAll('li').forEach((li) => li.prepend('• '));
  dom.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
  dom.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, tr').forEach((el) => el.append('\n'));
  dom.querySelectorAll('td, th').forEach((el) => el.append('\t'));
  const text = (dom.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return {
    text,
    source: {
      kind: 'docx',
      fileName: file.name,
      tables: (html.value.match(/<table/g) ?? []).length,
      images: (html.value.match(/<img/g) ?? []).length,
    },
  };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  const withSize = (parsed: ParsedFile): ParsedFile => ({ ...parsed, source: { ...parsed.source, size: file.size } });
  if (name.endsWith('.pdf')) return withSize(await parsePdf(file));
  if (name.endsWith('.docx')) return withSize(await parseDocx(file));
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: await file.text(), source: { kind: 'txt', fileName: file.name, size: file.size } };
  }
  if (name.endsWith('.doc')) throw new ParseError('doc');
  if (/\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(name)) throw new ParseError('image');
  throw new ParseError('unsupported');
}
