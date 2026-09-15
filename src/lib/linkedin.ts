import JSZip from 'jszip';
import type { Certification, CVData, Education, Experience, Lang, Project } from '../types';
import { foldArabic, isArabicText } from './arabic';
import { builderDate, clean, listItems, looksLikeLocation, toBullets, wordCount } from './cvParser';
import { dateText, findRanges, formatYM, parseDateToken } from './dates';
import { DEGREE_HINT } from './dictionaries';
import { EMAIL_RE, findPhone, findUrls } from './patterns';
import { emptyCV, uid } from './sample';

export interface PdfLine {
  text: string;
  size: number;
}

export interface PdfColumns {
  sidebar: PdfLine[];
  main: PdfLine[];
}

const headingKey = (s: string) => foldArabic(s).toLowerCase().replace(/\s+/g, ' ').trim();
const keys = (list: string[]) => list.map(headingKey);

const SIDEBAR_HEADINGS: Record<string, string[]> = {
  contact: keys(['Contact', 'معلومات الاتصال', 'جهة الاتصال', 'بيانات الاتصال']),
  skills: keys(['Top Skills', 'أهم المهارات', 'المهارات الرئيسية', 'أبرز المهارات']),
  languages: keys(['Languages', 'اللغات']),
  certifications: keys(['Certifications', 'الشهادات', 'التراخيص والشهادات']),
  other: keys(['Honors-Awards', 'Publications', 'Patents', 'Volunteering', 'الجوائز والتكريمات', 'المنشورات', 'براءات الاختراع']),
};

const MAIN_HEADINGS: Record<string, string[]> = {
  summary: keys(['Summary', 'About', 'نبذة عني', 'نبذة', 'الملخص']),
  experience: keys(['Experience', 'الخبرة', 'الخبرات']),
  education: keys(['Education', 'التعليم']),
  other: keys(['Volunteer Experience', 'Honors-Awards', 'Publications', 'Projects', 'التطوع', 'المشاريع']),
};

const isFooter = (t: string) => /^page\s+\d+\s+of\s+\d+$/i.test(t) || /^صفحة\s+\d+\s+من\s+\d+$/.test(t);

function group(lines: PdfLine[], headings: Record<string, string[]>): { pre: PdfLine[]; groups: Map<string, PdfLine[]> } {
  const pre: PdfLine[] = [];
  const groups = new Map<string, PdfLine[]>();
  let current: PdfLine[] | null = null;
  for (const line of lines) {
    if (isFooter(line.text)) continue;
    const key = Object.entries(headings).find(([, list]) => list.includes(headingKey(line.text)))?.[0];
    if (key) {
      current = groups.get(key) ?? [];
      groups.set(key, current);
    } else if (current) {
      current.push(line);
    } else {
      pre.push(line);
    }
  }
  return { pre, groups };
}

function bodySize(lines: PdfLine[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) {
    const s = Math.round(l.size * 2) / 2;
    counts.set(s, (counts.get(s) ?? 0) + l.text.length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
}

function isDateLine(text: string): boolean {
  const r = findRanges(text)[0];
  if (!r) return false;
  const rest = text.replace(r.raw, '').replace(/\([^)]*\)/g, '').replace(/[\s·-]/g, '');
  return rest.length <= 2;
}

function isDurationLine(text: string): boolean {
  const t = dateText(text).trim();
  return /^(\d+\s*(years?|yrs?|months?|mos?)\s*)+$/.test(t) || /^less than a year$/.test(t)
    || /^(\d+\s*(سنه|سنوات|سنتان|سنتين|شهر|شهرا|اشهر|شهور)\s*)+$/u.test(t);
}

function parseExperience(lines: PdfLine[], body: number, lang: Lang): Experience[] {
  const texts = lines.map((l) => l.text);
  const isDate = (i: number) => i >= 0 && i < texts.length && isDateLine(texts[i]);
  const isDur = (i: number) => i >= 0 && i < texts.length && isDurationLine(texts[i]);
  const bigger = (i: number) => i >= 0 && lines[i].size > body + 0.4;
  const dateIdx = texts.map((_, i) => i).filter(isDate);

  const headerStart = (k: number, prevDate: number) => {
    if (isDur(k - 2) && k - 3 > prevDate) return k - 3;
    if (k - 2 > prevDate && bigger(k - 2)) return k - 2;
    return k - 1;
  };

  const out: Experience[] = [];
  let lastCompany = '';
  dateIdx.forEach((k, n) => {
    const prevDate = n > 0 ? dateIdx[n - 1] : -1;
    const title = texts[k - 1] ?? '';
    let company = lastCompany;
    if (isDur(k - 2) && k - 3 > prevDate) company = texts[k - 3];
    else if (k - 2 > prevDate && (bigger(k - 2) || n === 0)) company = texts[k - 2];
    lastCompany = company;

    const nextStart = n + 1 < dateIdx.length ? headerStart(dateIdx[n + 1], k) : texts.length;
    let descStart = k + 1;
    let location = '';
    const candidate = texts[descStart];
    if (descStart < nextStart && candidate && wordCount(candidate) <= 6 && !/[.!?]$/.test(candidate)
      && (looksLikeLocation(candidate) || /[,،]/.test(candidate))) {
      location = candidate;
      descStart++;
    }
    const range = findRanges(texts[k])[0];
    out.push({
      id: uid(),
      jobTitle: title,
      company,
      location,
      startDate: builderDate(range.startText, lang),
      endDate: builderDate(range.endText, lang, range.present),
      bullets: toBullets(texts.slice(descStart, nextStart)).join('\n'),
    });
  });
  return out;
}

function parseEducation(lines: PdfLine[], body: number, lang: Lang): Education[] {
  const out: Education[] = [];
  let cur: Education | null = null;
  for (const l of lines) {
    const hasDegree = /·|\((?:19|20)\d{2}/.test(l.text) || DEGREE_HINT.test(l.text);
    if (l.size > body + 0.4 || !cur || (!hasDegree && cur.degree)) {
      cur = { id: uid(), degree: '', school: l.text, location: '', startDate: '', endDate: '', details: '' };
      out.push(cur);
      continue;
    }
    const inside = l.text.match(/\(([^)]*)\)\s*$/)?.[1] ?? '';
    const degreeText = clean(l.text.replace(/\([^)]*\)\s*$/, ''));
    cur.degree = [cur.degree, degreeText].filter(Boolean).join(' ');
    const range = findRanges(inside)[0];
    if (range) {
      cur.startDate = builderDate(range.startText, lang);
      cur.endDate = builderDate(range.endText, lang, range.present);
    } else {
      const years = inside.match(/(?:19|20)\d{2}/g);
      if (years) cur.endDate = years[years.length - 1];
    }
  }
  return out;
}

/** Parse the PDF produced by LinkedIn's "Save to PDF" (sidebar + main column). */
export function parseLinkedInPdf(pages: PdfColumns[], fullText: string): CVData | null {
  if (!/linkedin\.com\/in\//i.test(fullText.replace(/\s/g, ''))) return null;
  const side = group(pages.flatMap((p) => p.sidebar), SIDEBAR_HEADINGS);
  if (!side.groups.has('contact') && !side.groups.has('skills')) return null;

  const main = group(pages.flatMap((p) => p.main), MAIN_HEADINGS);
  const lang: Lang = isArabicText(main.pre.concat(...main.groups.values()).map((l) => l.text).join(' ')) ? 'ar' : 'en';
  const sep = lang === 'ar' ? '، ' : ', ';
  const cv = emptyCV(lang);
  const p = cv.personal;

  const contact = (side.groups.get('contact') ?? []).map((l) => l.text);
  const glued = contact.join('');
  // Emails rarely wrap, so read them line by line; URLs do wrap, so they are read from the glued text.
  p.email = contact.join(' ').match(EMAIL_RE)?.[0] ?? glued.match(EMAIL_RE)?.[0] ?? '';
  p.phone = findPhone(contact.join(' ')) ?? '';
  p.linkedin = glued.match(/(?:www\.)?linkedin\.com\/in\/[\w%-]+/i)?.[0]?.replace(/^www\./, '') ?? '';
  p.website = contact
    .filter((t) => /\((Portfolio|Personal|Company|Blog|Other|RSS)\)/i.test(t))
    .map((t) => t.replace(/\s*\([^)]*\)\s*$/, ''))
    .concat(findUrls(contact.join(' ')).filter((u) => !/linkedin\.com/i.test(u)))[0] ?? '';

  cv.skills = listItems((side.groups.get('skills') ?? []).map((l) => l.text)).join(sep);
  cv.languages = listItems((side.groups.get('languages') ?? []).map((l) => l.text)).join(sep);
  cv.certifications = (side.groups.get('certifications') ?? []).map((l) => ({ id: uid(), name: l.text, issuer: '', date: '' }));

  const body = bodySize([...main.groups.values()].flat());
  const [nameLine, ...intro] = main.pre;
  p.fullName = nameLine?.text ?? '';
  const locationLine = intro.length >= 2 ? intro[intro.length - 1].text : '';
  p.location = locationLine;
  const headline = intro.slice(0, locationLine ? -1 : undefined).map((l) => l.text).join(' ');
  p.title = clean(headline.split(/\s+\|\s+/)[0].replace(/\s+(at|@|لدى)\s+.+$/i, ''));

  cv.summary = (main.groups.get('summary') ?? []).map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  cv.experience = parseExperience(main.groups.get('experience') ?? [], body, lang);
  cv.education = parseEducation(main.groups.get('education') ?? [], body, lang);
  return cv;
}

// ---------------- LinkedIn profile link (desktop app reads the visible profile pages) ----------------

/** One list item from a LinkedIn "details" page: its own visible text lines plus nested items (e.g. roles at a company). */
export interface ScrapedEntry {
  lines: string[];
  children: ScrapedEntry[];
}

/** Data returned by the desktop app's LinkedIn window (electron/linkedin.cjs). */
export interface LinkedInScrape {
  url: string;
  name: string;
  headline: string;
  location: string;
  about: string;
  /** Visible lines under the name on LinkedIn's current profile layout (headline, location, badges). */
  topLines?: string[];
  experience?: ScrapedEntry[];
  education?: ScrapedEntry[];
  skills?: ScrapedEntry[];
  certifications?: ScrapedEntry[];
  languages?: ScrapedEntry[];
  projects?: ScrapedEntry[];
  contact: { emails: string[]; phones: string[]; websites: string[] };
}

export type LinkedInImportResult =
  | { ok: true; data: LinkedInScrape; usedBrowser?: string | null }
  | { ok: false; error: 'invalid-url' | 'busy' | 'cancelled' | 'timeout' | 'failed'; message?: string };

const SKILLS_LINE_RE = /^(skills|المهارات)\s*[:：]|\band \+\d+ skills?$|^\+\d+ skills?$|و\s*\+?\d+\s*مهار/i;
const WORK_MODE_RE = /\s*·\s*(on-site|hybrid|remote|في الموقع|هجين|عن بعد|عن بُعد)\s*$/i;
const EMPLOYMENT_RE = /\s*·\s*(full-time|part-time|contract|freelance|internship|self-employed|seasonal|apprenticeship|دوام كامل|دوام جزئي|عقد|عمل حر|تدريب داخلي|تدريب|موسمي)\s*$/i;
const ONLY_WORK_MODE_RE = /^(on-site|hybrid|remote|في الموقع|هجين|عن بعد|عن بُعد)$/i;
const ONLY_EMPLOYMENT_RE = /^(full-time|part-time|contract|freelance|internship|self-employed|seasonal|apprenticeship|دوام كامل|دوام جزئي|عقد|عمل حر|تدريب داخلي|تدريب|موسمي)$/i;
const ISSUED_RE = /^(issued|تاريخ الإصدار|صدرت|أُصدرت|اصدرت)\b/i;
const CREDENTIAL_RE = /^(credential id|show credential|معرّف الاعتماد|معرف الاعتماد|عرض الاعتماد)/i;
const ASSOCIATED_RE = /^(associated with|مرتبط بـ?|مرتبطة بـ?)/i;

const flatLines = (e: ScrapedEntry): string[] => [...e.lines, ...e.children.flatMap(flatLines)];
/** LinkedIn date lines look like "Mar 2021 - Present · 3 yrs 7 mos"; the duration after "·" is ignored. */
const rangeIn = (line: string) => findRanges(line.split('·')[0])[0];

function roleFrom(lines: string[], lang: Lang, companyHint = ''): Experience | null {
  const di = lines.findIndex((l) => rangeIn(l));
  if (di < 0) return null;
  const range = rangeIn(lines[di]);
  const head = lines.slice(0, di).filter((l) => !isDurationLine(l) && !ONLY_EMPLOYMENT_RE.test(l));
  const title = head[0] ?? '';
  const company = companyHint || clean((head[1] ?? '').replace(EMPLOYMENT_RE, '').split(' · ')[0]);
  let rest = lines.slice(di + 1);
  let location = '';
  const first = rest[0];
  if (first && wordCount(first) <= 8 && !/[.!?]$/.test(first)
    && (WORK_MODE_RE.test(first) || ONLY_WORK_MODE_RE.test(first) || looksLikeLocation(first.replace(WORK_MODE_RE, '')))) {
    location = ONLY_WORK_MODE_RE.test(first) ? '' : clean(first.replace(WORK_MODE_RE, ''));
    rest = rest.slice(1);
  }
  rest = rest.filter((l) => !SKILLS_LINE_RE.test(l) && !ONLY_WORK_MODE_RE.test(l));
  return {
    id: uid(),
    jobTitle: title,
    company,
    location,
    startDate: builderDate(range.startText, lang),
    endDate: builderDate(range.endText, lang, range.present),
    bullets: descriptionBullets(rest.join('\n')),
  };
}

function scrapedExperience(entries: ScrapedEntry[], lang: Lang): Experience[] {
  const out: Experience[] = [];
  for (const entry of entries) {
    const roles = entry.children.filter((c) => flatLines(c).some((l) => rangeIn(l)));
    if (!entry.lines.some((l) => rangeIn(l)) && roles.length) {
      // A company with several roles: the item's own first line is the company, each nested item is a role.
      const company = clean((entry.lines[0] ?? '').replace(EMPLOYMENT_RE, ''));
      for (const role of roles) {
        const r = roleFrom(flatLines(role), lang, company);
        if (r) out.push(r);
      }
    } else {
      const r = roleFrom(flatLines(entry), lang);
      if (r) out.push(r);
    }
  }
  return out;
}

function scrapedEducation(entries: ScrapedEntry[], lang: Lang): Education[] {
  return entries
    .map((entry): Education => {
      const lines = flatLines(entry);
      const di = lines.findIndex((l) => rangeIn(l));
      const range = di >= 0 ? rangeIn(lines[di]) : undefined;
      const headEnd = di >= 0 ? di : Math.min(2, lines.length);
      return {
        id: uid(),
        school: lines[0] ?? '',
        degree: headEnd > 1 ? clean(lines[1]) : '',
        location: '',
        startDate: range ? builderDate(range.startText, lang) : '',
        endDate: range ? builderDate(range.endText, lang, range.present) : '',
        details: lines.slice(di >= 0 ? di + 1 : headEnd).filter((l) => !SKILLS_LINE_RE.test(l)).join('\n'),
      };
    })
    .filter((e) => e.school);
}

/** Map the visible text of a LinkedIn profile (read by the desktop app) into CV fields. */
export function parseLinkedInScrape(data: LinkedInScrape): CVData {
  const all = [data.name, data.headline, data.about, ...(data.experience ?? []).flatMap(flatLines)].join(' ');
  const lang: Lang = isArabicText(all) ? 'ar' : 'en';
  const sep = lang === 'ar' ? '، ' : ', ';
  const cv = emptyCV(lang);
  const p = cv.personal;

  p.fullName = clean(data.name);
  // Current layout: pick headline and location from the lines under the name, skipping badges and buttons.
  const TOP_NOISE = /^(·|•|\d+(st|nd|rd|th)|you|he\/him|she\/her|they\/them|open to work|contact info|message|follow|connect|more|\d[\d,+]*\s*(followers|connections)|verified|premium|معلومات الاتصال|متاح للعمل|رسالة|متابعة|تواصل|المزيد|\d[\d,+]*\s*(متابع|متابعين|اتصال|اتصالات))/i;
  // LinkedIn also shows calls to action under the name ("Verify in 2 minutes", "Get verified", "Add verification badge").
  const TOP_PROMPT = /verif|\b\d+\s*(minutes?|mins?)\b|add (a )?(section|verification)|enhance profile|تحقق|توثيق|وثّق|وثق|شارة|دقيق/i;
  const isTopNoise = (l: string) => TOP_NOISE.test(l) || TOP_PROMPT.test(l);
  const topLines = (data.topLines ?? []).map(clean).filter((l) => l.length > 2 && !isTopNoise(l) && l !== p.fullName);
  // On the current layout the page reports topLines, so choose the headline from the filtered lines, not the raw first one.
  const headline = data.topLines?.length
    ? topLines[0] ?? ''
    : data.headline && !isTopNoise(clean(data.headline)) ? data.headline : '';
  p.title = clean((headline ?? '').split(/\s+\|\s+/)[0].replace(/\s+(at|@|لدى|في)\s+.+$/i, ''));
  p.location = clean(data.location)
    || topLines.slice(1).find((l) => looksLikeLocation(l) || (/[,،]/.test(l) && wordCount(l) <= 6 && !/[.!?]$/.test(l)))
    || '';
  p.linkedin = (data.url.match(/linkedin\.com\/in\/[^/?#]+/i)?.[0] ?? '').replace(/\/$/, '');
  p.email = data.contact?.emails?.find((e) => EMAIL_RE.test(e)) ?? '';
  p.phone = data.contact?.phones?.[0] ?? '';
  p.website = (data.contact?.websites?.[0] ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  cv.summary = (data.about ?? '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

  cv.experience = scrapedExperience(data.experience ?? [], lang);
  cv.education = scrapedEducation(data.education ?? [], lang);

  const skills = (data.skills ?? [])
    .map((e) => clean(e.lines[0] ?? ''))
    .filter((s) => s && s.length <= 60 && !rangeIn(s) && !SKILLS_LINE_RE.test(s));
  cv.skills = [...new Set(skills)].join(sep);

  cv.languages = (data.languages ?? [])
    .map((e) => (e.lines[1] ? `${e.lines[0]} (${e.lines[1]})` : e.lines[0] ?? ''))
    .filter(Boolean)
    .join(sep);

  cv.certifications = (data.certifications ?? [])
    .map((e): Certification => {
      const lines = flatLines(e);
      const issued = lines.find((l) => ISSUED_RE.test(l)) ?? '';
      const issuer = lines[1] && !ISSUED_RE.test(lines[1]) && !CREDENTIAL_RE.test(lines[1]) ? lines[1] : '';
      return { id: uid(), name: lines[0] ?? '', issuer, date: issued.match(/(?:19|20)\d{2}/)?.[0] ?? '' };
    })
    .filter((c) => c.name);

  cv.projects = (data.projects ?? [])
    .map((e): Project => {
      const [name = '', ...rest] = flatLines(e);
      const body = rest.filter((l) => !rangeIn(l) && !ASSOCIATED_RE.test(l) && !SKILLS_LINE_RE.test(l));
      const link = body.map((l) => findUrls(l)[0]).find(Boolean) ?? '';
      return { id: uid(), name, link, description: descriptionBullets(body.filter((l) => !link || !l.includes(link)).join('\n')) };
    })
    .filter((pr) => pr.name);

  return cv;
}

// ---------------- LinkedIn data export (ZIP / CSV) ----------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function table(text: string | undefined, requiredColumn: string): Record<string, string>[] {
  if (!text) return [];
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const h = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === requiredColumn.toLowerCase()));
  if (h < 0) return [];
  const head = rows[h].map((c) => c.trim());
  return rows
    .slice(h + 1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const baseName = (path: string) => (path.split('/').pop() ?? path).toLowerCase().replace(/\.csv$/, '').replace(/[\s_-]+/g, '');

const exportDate = (value: string, lang: Lang) => (value ? formatYM(parseDateToken(value)) || value : '');

const descriptionBullets = (d: string) =>
  toBullets(d.split(/\n+|(?<=[.!?])\s+(?=\p{Lu}|[•\-–])/u).map((s) => s.trim()).filter(Boolean)).join('\n');

/** Parse LinkedIn's "Get a copy of your data" archive (ZIP) or its individual CSV files. */
export async function parseLinkedInExport(files: File[]): Promise<CVData | null> {
  const csv = new Map<string, string>();
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      await Promise.all(
        Object.values(zip.files)
          .filter((entry) => !entry.dir && /\.csv$/i.test(entry.name))
          .map(async (entry) => csv.set(baseName(entry.name), await entry.async('string'))),
      );
    } else if (/\.csv$/i.test(file.name)) {
      csv.set(baseName(file.name), await file.text());
    }
  }

  const profile = table(csv.get('profile'), 'First Name')[0];
  const positions = table(csv.get('positions'), 'Company Name');
  if (!profile && !positions.length) return null;

  const lang: Lang = isArabicText([...csv.values()].join(' ')) ? 'ar' : 'en';
  const sep = lang === 'ar' ? '، ' : ', ';
  const cv = emptyCV(lang);
  const p = cv.personal;

  if (profile) {
    p.fullName = [profile['First Name'], profile['Last Name']].filter(Boolean).join(' ');
    p.title = profile['Headline'] ?? '';
    p.location = profile['Geo Location'] ?? '';
    cv.summary = profile['Summary'] ?? '';
    p.website = findUrls(profile['Websites'] ?? '')[0] ?? '';
  }
  const emails = table(csv.get('emailaddresses'), 'Email Address');
  p.email = (emails.find((e) => /yes/i.test(e['Primary'] ?? '')) ?? emails[0])?.['Email Address'] ?? '';
  p.phone = table(csv.get('phonenumbers'), 'Number')[0]?.['Number'] ?? '';

  cv.experience = positions.map((r): Experience => ({
    id: uid(),
    jobTitle: r['Title'] ?? '',
    company: r['Company Name'] ?? '',
    location: r['Location'] ?? '',
    startDate: exportDate(r['Started On'] ?? '', lang),
    endDate: r['Finished On'] ? exportDate(r['Finished On'], lang) : builderDate('', lang, true),
    bullets: descriptionBullets(r['Description'] ?? ''),
  }));

  cv.education = table(csv.get('education'), 'School Name').map((r): Education => ({
    id: uid(),
    degree: r['Degree Name'] ?? '',
    school: r['School Name'] ?? '',
    location: '',
    startDate: exportDate(r['Start Date'] ?? '', lang),
    endDate: exportDate(r['End Date'] ?? '', lang),
    details: r['Notes'] ?? '',
  }));

  cv.skills = table(csv.get('skills'), 'Name').map((r) => r['Name']).filter(Boolean).join(sep);
  cv.languages = table(csv.get('languages'), 'Name')
    .map((r) => (r['Proficiency'] ? `${r['Name']} (${r['Proficiency']})` : r['Name']))
    .filter(Boolean)
    .join(sep);
  cv.certifications = table(csv.get('certifications'), 'Name').map((r): Certification => ({
    id: uid(),
    name: r['Name'] ?? '',
    issuer: r['Authority'] ?? '',
    date: (r['Started On'] ?? '').match(/(?:19|20)\d{2}/)?.[0] ?? '',
  }));
  cv.projects = table(csv.get('projects'), 'Title').map((r): Project => ({
    id: uid(),
    name: r['Title'] ?? '',
    link: r['Url'] ?? '',
    description: descriptionBullets(r['Description'] ?? ''),
  }));
  return cv;
}
