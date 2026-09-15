import type { Certification, CVData, Education, Experience, Lang, Project } from '../types';
import { foldArabic, isArabicText, lightNormalize, stripArticle } from './arabic';
import { findRanges, formatYM, parseDateToken, type DateRange } from './dates';
import { ACTION_VERBS, ACTION_VERBS_AR, COMPANY_HINT, DEGREE_HINT, PLACE_HINT, SCHOOL_HINT, TITLE_HINT } from './dictionaries';
import { BULLET_RE, EMAIL_RE, LINKEDIN_RE, findPhone, findUrls, findWebsite, hasContactInfo, stripBullet } from './patterns';
import { emptyCV, uid } from './sample';
import { splitSections } from './sections';

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
export const clean = (s: string) => s.replace(/^[\s|,،;:–—·-]+|[\s|,،;:–—·-]+$/g, '').trim();
const YEAR_RE = /(?<!\d)(?:19|20)\d{2}(?!\d)/;

export const presentWord = (lang: Lang) => (lang === 'ar' ? 'حتى الآن' : 'Present');

const AR_VERB_KEYS = new Set(ACTION_VERBS_AR.map((v) => stripArticle(foldArabic(v))));

/** Returns a normalized key for the action verb that opens a statement, or null. */
export function leadingActionVerb(statement: string): string | null {
  const word = lightNormalize(stripBullet(statement)).match(/^\p{L}+/u)?.[0] ?? '';
  const lower = word.toLowerCase();
  if (ACTION_VERBS.has(lower)) return lower;
  const f = foldArabic(word);
  const noWaw = f.replace(/^و(?=.{3,})/, '');
  for (const candidate of [f, noWaw, stripArticle(f), stripArticle(noWaw)]) {
    if (AR_VERB_KEYS.has(candidate)) return candidate;
  }
  return null;
}

/**
 * True when a line reads like an achievement statement rather than a job/degree heading. PDFs often drop bullet
 * glyphs, so the last bullet of one role must not be mistaken for the title of the next role.
 */
function looksLikeStatement(line: string): boolean {
  return BULLET_RE.test(line) || wordCount(line) > 12 || /[.!?]$/.test(line)
    || leadingActionVerb(line) !== null || (/\d/.test(line) && wordCount(line) > 5);
}

/** Convert any recognized date token to the builder's MM/YYYY (or YYYY) format. */
export function builderDate(token: string, lang: Lang, present = false): string {
  if (present) return presentWord(lang);
  return formatYM(parseDateToken(token)) || token.trim();
}

export function looksLikeLocation(s: string): boolean {
  const v = clean(s);
  if (!v || /\d{3,}/.test(v) || hasContactInfo(v) || wordCount(v) > 6) return false;
  if (TITLE_HINT.test(v) || COMPANY_HINT.test(v)) return false;
  if (PLACE_HINT.test(v)) return true;
  return /^[\p{L} .'-]+[,،]\s*[\p{L} .'-]+$/u.test(v) && wordCount(v) <= 4;
}

/** Turn description lines into bullets, re-joining lines that were wrapped by the PDF layout. */
export function toBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const isBullet = BULLET_RE.test(raw);
    const line = stripBullet(raw);
    if (!line) continue;
    const prev = out[out.length - 1];
    if (!isBullet && prev !== undefined && /^[a-z(&]/.test(line) && !/[.!?]$/.test(prev)) {
      out[out.length - 1] = `${prev} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

interface RawEntry {
  heads: string[];
  range: DateRange;
  body: string[];
  location: string;
}

/** Group section lines into entries anchored on date ranges. */
function parseDated(lines: string[]): RawEntry[] {
  const entries: RawEntry[] = [];
  let pending: string[] = [];
  let current: RawEntry | null = null;
  for (const line of lines) {
    const range = findRanges(line)[0];
    if (range) {
      const rest = clean(lightNormalize(line).replace(range.raw, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' '));
      const tail: string[] = [];
      while (pending.length && tail.length < 2) {
        const last = pending[pending.length - 1];
        if (looksLikeStatement(last)) break;
        tail.unshift(pending.pop()!);
      }
      if (current) current.body.push(...pending);
      pending = [];
      current = { heads: [...tail, ...(rest ? [rest] : [])], range, body: [], location: '' };
      entries.push(current);
      continue;
    }
    if (!current) {
      pending.push(line);
      continue;
    }
    if (!current.body.length && !pending.length && !current.location && looksLikeLocation(line)) {
      current.location = clean(line);
      continue;
    }
    if (BULLET_RE.test(line)) {
      current.body.push(...pending, line);
      pending = [];
      continue;
    }
    pending.push(line);
  }
  if (current) current.body.push(...pending);
  return entries;
}

function splitHeads(heads: string[]): { first: string; second: string; location: string } {
  let parts = heads
    .flatMap((h) => h.split(/\s+[|–—]\s+|\s+-\s+|\s+at\s+|\s+@\s+|\s*\|\s*|\s+لدى\s+|\s+·\s+/i))
    .map(clean)
    .filter(Boolean);
  let location = '';
  const li = parts.findIndex((p) => looksLikeLocation(p));
  if (li >= 0 && parts.length > 1) location = parts.splice(li, 1)[0];
  if (parts.length === 1 && /[,،]/.test(parts[0])) {
    const [a, ...b] = parts[0].split(/[,،]\s*/);
    if (b.length && wordCount(a) <= 6) parts = [a, b.join(', ')];
  }
  return { first: parts[0] ?? '', second: parts.slice(1).join(' – '), location };
}

function toExperience(lines: string[], lang: Lang): Experience[] {
  const entries = parseDated(lines);
  if (!entries.length) {
    if (!lines.length) return [];
    const [first, ...rest] = lines;
    const h = splitHeads([stripBullet(first)]);
    return [{
      id: uid(), jobTitle: h.first, company: h.second, location: h.location, startDate: '', endDate: '',
      bullets: toBullets(rest).join('\n'),
    }];
  }
  return entries.map((e) => {
    const h = splitHeads(e.heads);
    let title = h.first;
    let company = h.second;
    if ((COMPANY_HINT.test(title) && !COMPANY_HINT.test(company)) || (TITLE_HINT.test(company) && !TITLE_HINT.test(title))) {
      [title, company] = [company, title];
    }
    return {
      id: uid(),
      jobTitle: title,
      company,
      location: e.location || h.location,
      startDate: builderDate(e.range.startText, lang),
      endDate: builderDate(e.range.endText, lang, e.range.present),
      bullets: toBullets(e.body).join('\n'),
    };
  });
}

const blankEducation = (): Education => ({ id: uid(), degree: '', school: '', location: '', startDate: '', endDate: '', details: '' });

function toEducation(lines: string[], lang: Lang): Education[] {
  const entries = parseDated(lines);
  if (entries.length) {
    return entries.map((e) => {
      const h = splitHeads(e.heads);
      let degree = h.first;
      let school = h.second;
      if ((SCHOOL_HINT.test(degree) && !SCHOOL_HINT.test(school)) || (DEGREE_HINT.test(school) && !DEGREE_HINT.test(degree))) {
        [degree, school] = [school, degree];
      }
      return {
        ...blankEducation(),
        degree,
        school,
        location: e.location || h.location,
        startDate: builderDate(e.range.startText, lang),
        endDate: builderDate(e.range.endText, lang, e.range.present),
        details: toBullets(e.body).join('\n'),
      };
    });
  }

  const out: Education[] = [];
  let cur: Education | null = null;
  for (const raw of lines) {
    const line = stripBullet(raw);
    const year = line.match(new RegExp(YEAR_RE.source, 'g'))?.pop() ?? '';
    const text = clean(line.replace(new RegExp(`\\(?${YEAR_RE.source}\\)?`, 'g'), ''));
    const isDegree = DEGREE_HINT.test(text);
    const isSchool = SCHOOL_HINT.test(text);
    if (isDegree || isSchool) {
      if (!cur || (isDegree && cur.degree) || (!isDegree && isSchool && cur.school)) {
        cur = blankEducation();
        out.push(cur);
      }
      const h = splitHeads([text]);
      if (isDegree && isSchool && h.second) {
        if (DEGREE_HINT.test(h.first)) { cur.degree = h.first; cur.school = h.second; } else { cur.school = h.first; cur.degree = h.second; }
      } else if (isDegree) {
        cur.degree = text;
      } else {
        cur.school = text;
      }
      if (year) cur.endDate = year;
    } else if (cur) {
      if (!cur.location && looksLikeLocation(text)) cur.location = text;
      else if (text) cur.details = [cur.details, text].filter(Boolean).join('\n');
      if (year && !cur.endDate) cur.endDate = year;
    }
  }
  return out;
}

export function listItems(lines: string[]): string[] {
  const items = lines
    .flatMap((l) => stripBullet(l).replace(/^[^:：()]{2,30}[:：]\s*/, '').split(/\s*[,،;|•·▪]\s*|\s{3,}|\t/))
    .map(clean)
    .filter((s) => s && s.length <= 60);
  return [...new Set(items)];
}

function toCerts(lines: string[]): Certification[] {
  return lines.map(stripBullet).filter(Boolean).map((line) => {
    const year = line.match(YEAR_RE)?.[0] ?? '';
    const parts = clean(line.replace(new RegExp(`\\(?${YEAR_RE.source}\\)?`, 'g'), ''))
      .split(/\s+[|–—-]\s+|\s*[,،]\s+|\s+·\s+/)
      .map(clean)
      .filter(Boolean);
    return { id: uid(), name: parts[0] ?? line, issuer: parts.slice(1).join(' – '), date: year };
  });
}

function toProjects(lines: string[]): Project[] {
  const out: Project[] = [];
  let cur: Project | null = null;
  for (const raw of lines) {
    const bullet = BULLET_RE.test(raw);
    const line = stripBullet(raw);
    if (!line) continue;
    if (!bullet && wordCount(line) <= 8 && !/[.!?]$/.test(line)) {
      const link = findUrls(line)[0] ?? '';
      cur = { id: uid(), name: clean(line.replace(link, '')), link, description: '' };
      out.push(cur);
    } else {
      if (!cur) {
        cur = { id: uid(), name: '', link: '', description: '' };
        out.push(cur);
      }
      cur.description = [cur.description, line].filter(Boolean).join('\n');
    }
  }
  return out;
}

/** Heuristically map the plain text of any CV into the builder's structured fields. */
export function parseCVText(raw: string): CVData {
  const text = lightNormalize(raw.replace(/\r/g, ''));
  const lang: Lang = isArabicText(text) ? 'ar' : 'en';
  const sep = lang === 'ar' ? '، ' : ', ';
  const lines = text
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l && !/^page \d+ of \d+$/i.test(l));
  const { header, sections } = splitSections(lines);
  const cv = emptyCV(lang);
  const p = cv.personal;

  p.email = text.match(EMAIL_RE)?.[0] ?? '';
  p.phone = findPhone(text) ?? '';
  p.linkedin = (text.match(LINKEDIN_RE)?.[0] ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  p.website = findWebsite(text).replace(/^https?:\/\//, '');

  const head = (header.length ? header : lines.slice(0, 4)).slice(0, 10);
  const plainHead = head.filter((l) => !hasContactInfo(l));
  p.fullName = plainHead.find((l) => wordCount(l) <= 5 && !/\d/.test(l) && !looksLikeLocation(l)) ?? '';
  const afterName = plainHead.slice(plainHead.indexOf(p.fullName) + 1);
  p.title = afterName.find((l) => wordCount(l) <= 12 && !looksLikeLocation(l)) ?? '';
  const segments = head
    .flatMap((l) => l.split(/\s*[|•·▪◦]\s*|\t|\s{3,}/))
    .map((s) => clean(s.replace(/^[\p{L} ]{2,15}[:：]\s*/u, '')))
    .filter(Boolean);
  p.location = segments.find((s) => s !== p.fullName && s !== p.title && looksLikeLocation(s)) ?? '';

  const summary = sections.get('summary') ?? head.filter((l) => wordCount(l) >= 12 && l !== p.title);
  cv.summary = summary.map(stripBullet).join(' ').trim();
  cv.experience = toExperience(sections.get('experience') ?? [], lang);
  cv.education = toEducation(sections.get('education') ?? [], lang);
  cv.skills = listItems(sections.get('skills') ?? []).join(sep);
  cv.languages = listItems(sections.get('languages') ?? []).join(sep);
  cv.certifications = toCerts(sections.get('certifications') ?? []);
  cv.projects = toProjects(sections.get('projects') ?? []);
  return cv;
}

export function hasContent(cv: CVData): boolean {
  return Boolean(cv.personal.fullName || cv.summary || cv.experience.length || cv.education.length || cv.skills);
}
