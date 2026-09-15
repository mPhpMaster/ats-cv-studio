import { messages } from '../i18n';
import {
  CATEGORY_ORDER, type AnalysisResult, type CategoryKey, type CategoryScore, type Check, type CheckFix, type CVData,
  type Lang, type Severity,
} from '../types';
import { foldArabic, isArabicText, lightNormalize, stripArticle } from './arabic';
import { leadingActionVerb, listItems, parseCVText } from './cvParser';
import { splitLines, splitList } from './cvText';
import {
  countDateTokens, dateFormatKind, findRanges, formatYM, nowYM, parseDateToken, timeline, toMonths, type YM,
} from './dates';
import {
  ACTION_VERBS, ACTION_VERBS_AR, CLICHES, IRREGULAR_VERBS, LEADERSHIP_WORDS, PERSONAL_DATA_PATTERNS, SENIORITY_PATTERNS,
  SHORTENERS, SOFT_SKILLS, SUPERLATIVES, UNPROFESSIONAL_EMAIL, WEAK_PHRASES,
} from './dictionaries';
import { extractKeywords, isStopword, makeMatcher, normalize, termKey } from './keywords';
import { BULLET_RE, EMAIL_RE, LINKEDIN_RE, findPhone, findUrls, stripBullet } from './patterns';
import { splitSections } from './sections';
import type { SpellChecker } from './spell';

export interface SourceInfo {
  kind: 'builder' | 'pdf' | 'docx' | 'txt' | 'paste';
  fileName?: string;
  size?: number;
  pages?: number;
  tables?: number;
  images?: number;
  multiColumnLikely?: boolean;
}

export interface AnalyzeOptions {
  /** Language of the report messages. */
  lang?: Lang;
  /** Structured CV when available (builder); otherwise the text is parsed. */
  cv?: CVData;
  /** LinkedIn profile to compare against. */
  linkedin?: CVData | null;
  spell?: SpellChecker | null;
}

const QUANT_RE =
  /(\d+(\.\d+)?\s?%|[$€£¥]\s?\d|\b\d+(\.\d+)?\s?(k|m|bn|million|billion|thousand)\b|\b\d{2,}\b|\b\d+x\b|\d+(\.\d+)?\s?(الف|مليون|مليار)|(ريال|درهم|دينار|جنيه|دولار|يورو)\s?\d|\d\s?(ريال|درهم|دينار|جنيه|دولار|يورو))/iu;
const ICON_FONT_RE = /[-]/g; // private-use glyphs produced by icon fonts
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const FANCY_RE = /[★☆◆◇❖✦✧⇒→←↔♦♠♣♥☎✉⌂⚑۞]/g;
const FIRST_PERSON_EN = /\b(I|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself)\b(?![.'’-])/g;
// «لديّ» (I have) is checked apart from the rest, on text where ى is NOT folded into ي: folding turned
// «لدى» (at, as in «خبرة لدى شركة أرامكو») into «لدي» and counted it as a first-person pronoun.
const HAVE_AR = /(?<!\p{L})و?لدي(?!\p{L})/gu;
const FIRST_PERSON_AR = /(?<!\p{L})و?(انا|عملت|قمت|اعمل|امتلك|اسعي|ارغب|اهدف|خبرتي|مهاراتي)(?!\p{L})/gu;
const TEAM_SIZE_RE =
  /team of \d+|\d+\s*(?:engineers|developers|people|staff|employees|members|direct reports|reports|agents)|فريق(?:ا)?\s+(?:من|يضم)\s+\d+|\d+\s*(?:موظف|موظفين|مهندس|مهندسين|مطور|مطورين|اعضاء|أعضاء)/iu;

const AR_VERB_KEYS = new Set(ACTION_VERBS_AR.map((v) => stripArticle(foldArabic(v))));
const LEADERSHIP_KEYS = LEADERSHIP_WORDS.map((w) => stripArticle(foldArabic(w.toLowerCase())));

/** Base forms derived from the past-tense verb list, used to detect present-tense bullets. */
const BASE_VERBS = new Set<string>(Object.values(IRREGULAR_VERBS));
for (const v of ACTION_VERBS) {
  if (v.endsWith('ied')) BASE_VERBS.add(`${v.slice(0, -3)}y`);
  else if (v.endsWith('ed')) { BASE_VERBS.add(v.slice(0, -2)); BASE_VERBS.add(v.slice(0, -1)); }
}

const verbRoot = (word: string) => {
  let w = IRREGULAR_VERBS[word] ?? word;
  w = w.replace(/(ing|ed)$/, '');
  if (!w.endsWith('ss')) w = w.replace(/e?s$/, '');
  return w.replace(/e$/, '');
};
const VERB_ROOTS = new Set([...ACTION_VERBS, ...Object.values(IRREGULAR_VERBS)].map(verbRoot));

const isPresentVerb = (w: string) =>
  !ACTION_VERBS.has(w) && [w, w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/s$/, '')].some((x) => BASE_VERBS.has(x));

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round1 = (n: number) => Math.round(n * 10) / 10;

export { leadingActionVerb };

export function seniorityLevel(title: string): number | null {
  const t = foldArabic(lightNormalize(title));
  if (!t.trim()) return null;
  for (const { level, re } of SENIORITY_PATTERNS) if (re.test(t)) return level;
  return 2;
}

function requiredYears(jd: string): number | null {
  const t = foldArabic(normalize(jd));
  const m = t.match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?)/i) ?? t.match(/(\d{1,2})\s*\+?\s*(?:سنوات|سنه|سنين|اعوام|عام)/u);
  const n = m ? +m[1] : NaN;
  return n > 0 && n < 40 ? n : null;
}

const fmtYM = (d: YM) => formatYM(d);

// The Latin names are anchored on word boundaries: unanchored, "oman" matched inside Romania and Woman,
// which told the report a Bucharest CV was Gulf-targeted — and, since the interview shares this rule, asked
// that user for a nationality the same report would have penalised them for.
const GULF_RE = /\b(?:saudi|ksa|riyadh|jeddah|dammam|khobar|uae|emirat[a-z]*|dubai|abu ?dhabi|sharjah|qatar|doha|kuwait|bahrain|manama|oman|muscat)\b|السعوديه|الرياض|جده|الامارات|دبي|ابوظبي|الشارقه|قطر|الدوحه|الكويت|البحرين|سلطنه عمان|مسقط|صلاله/i;
// A bare «عمان» is deliberately absent: without diacritics it is both Oman (عُمان) and Amman (عَمّان), and as a
// location line it is far more often the Jordanian capital. «سلطنة عمان», مسقط, صلالة and the Latin "Oman" still count.

/**
 * Whether a CV is aimed at the Gulf, where nationality is routinely asked for and carries no penalty.
 * Exported so the interview asks for it in exactly the cases the report tolerates it — one rule, one place:
 * if these ever disagree, the interview would push the user to fill a field the report then marks against them.
 */
export const isGulfLocation = (location: string) => GULF_RE.test(foldArabic(normalize(location)));

export function analyzeCV(cvText: string, jobDescription: string, source: SourceInfo, opts: AnalyzeOptions = {}): AnalysisResult {
  const lang = opts.lang ?? 'en';
  const L = messages[lang];
  const t = L.analyzer;
  const list = L.list;
  const q = L.quote;

  const text = lightNormalize(cvText.replace(/\r/g, ''));
  const folded = foldArabic(normalize(text));
  const match = makeMatcher(text);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*/gu) ?? []).length;
  const arabic = isArabicText(text);
  const { header, sections } = splitSections(lines);
  const structured = opts.cv ?? parseCVText(text);
  const isBuilder = source.kind === 'builder';
  const uploaded = source.kind === 'pdf' || source.kind === 'docx' || source.kind === 'txt';
  const hasJD = jobDescription.trim().length > 40;
  const checks: Check[] = [];

  const add = (
    id: string, category: CategoryKey, weight: number, ratio: number, okDetail: string, tip: string, items: string[],
    extra: { issues?: number; fixes?: CheckFix[] } = {},
  ) => {
    const issues = extra.issues ?? items.length;
    const r = clamp01(ratio);
    const severity: Severity = issues === 0 ? 'pass' : r >= 0.45 ? 'warn' : 'fail';
    const earned = issues === 0 ? weight : round1(Math.min(0.9, r) * weight);
    checks.push({ id, category, label: t.labels[id] ?? id, weight, earned, severity, detail: issues ? tip : okDetail, items, issues, fixes: extra.fixes });
  };
  const notApplicable = (id: string, category: CategoryKey) =>
    checks.push({ id, category, label: t.labels[id] ?? id, weight: 0, earned: 0, severity: 'na', detail: t.needsJd, items: [], issues: 0 });

  // ---------- Shared measurements ----------
  const readable = text.replace(/\s/g, '').length;
  const icons = (text.match(ICON_FONT_RE) ?? []).length;
  const emoji = (text.match(EMOJI_RE) ?? []).length;
  const fancy = (text.match(FANCY_RE) ?? []).length;
  const garbled = (text.match(/�/g) ?? []).length;
  const spaced = (text.match(/(?:^|\s)(?:\p{L}\s){4,}\p{L}(?=\s|$)/gmu) ?? []).length;

  let parseRate = 100;
  // Pasted or plain text has no layout to lose; only real files are penalized for thin extraction.
  const fromFile = source.kind === 'pdf' || source.kind === 'docx';
  if (!isBuilder) {
    if (readable < 150 && fromFile) {
      parseRate = Math.round((readable / 150) * 20);
    } else {
      if (source.multiColumnLikely) parseRate -= 18;
      if (source.tables) parseRate -= Math.min(15, 6 + source.tables * 3);
      if (source.images) parseRate -= Math.min(8, source.images * 4);
      parseRate -= Math.min(8, icons * 2) + Math.min(10, garbled * 2) + Math.min(10, spaced * 3);
      if (readable < 600 && fromFile) parseRate -= 15;
      parseRate = Math.max(5, Math.min(100, parseRate));
    }
  }

  const email = text.match(EMAIL_RE)?.[0] ?? '';
  const phone = findPhone(text);
  const linkedinUrl = text.match(LINKEDIN_RE)?.[0] ?? '';
  const topText = lines.slice(0, 8).join(' ');

  const bulletLines = lines.filter((l) => BULLET_RE.test(l));
  // DOCX/PDF lists may lose their bullet glyphs, so fall back to sentence-like lines.
  const statements = (bulletLines.length >= 3 ? bulletLines : lines.filter((l) => l.split(/\s+/).length >= 6)).map(stripBullet);
  const verbs = statements.map(leadingActionVerb);
  const startsWithVerb = verbs.filter(Boolean) as string[];
  const quantified = statements.filter((s) => QUANT_RE.test(foldArabic(lightNormalize(s)).replace(/(19|20)\d{2}/g, '')));

  const summaryText = (sections.get('summary') ?? []).join(' ');
  const summaryWords = (summaryText.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const found = new Set(sections.keys());
  const sectionName = (s: string) => t.sectionNames[s] ?? s;

  const experienceLines = sections.get('experience') ?? lines;
  const ranges = findRanges(experienceLines.join('\n'));
  const tl = timeline(ranges);
  const years = ranges.length ? round1(tl.months / 12) : null;
  const dates = countDateTokens(text);

  const personalKeys = [...new Set(PERSONAL_DATA_PATTERNS.filter((p) => p.re.test(folded) || p.re.test(text)).map((p) => p.key))];

  const cvTitle = structured.personal.title || structured.experience[0]?.jobTitle || '';
  const cvLevel = seniorityLevel(cvTitle);
  const jdTitle = hasJD ? jobDescription.split('\n').map((l) => l.trim()).find((l) => l.length > 2 && l.length < 70) ?? '' : '';
  const jdLevel = jdTitle ? seniorityLevel(jdTitle) : null;
  const seniorContext = (jdLevel ?? 0) >= 3 || (cvLevel ?? 0) >= 3 || (years ?? 0) >= 5;
  const skills = sections.get('skills') ? listItems(sections.get('skills')!) : splitList(structured.skills);

  // ================= ATS essentials =================
  {
    const ext = source.fileName?.split('.').pop()?.toLowerCase() ?? '';
    const items: string[] = [];
    if (ext === 'txt') items.push(t.fileTxt);
    if ((source.size ?? 0) > 2 * 1024 * 1024) items.push(t.fileLarge(((source.size ?? 0) / 1048576).toFixed(1)));
    if ((source.pages ?? 0) > 3) items.push(t.pagesMany(source.pages ?? 0));
    const size = source.size ? `${Math.max(1, Math.round(source.size / 1024))} KB` : '';
    const ok = isBuilder ? t.fileFormatBuilder : uploaded ? t.fileFormatOk(ext.toUpperCase(), size) : t.fileFormatPaste;
    add('fileFormat', 'essentials', 6, 1 - items.length * 0.35, ok, t.fileFormatTip, items);
  }
  {
    const items: string[] = [];
    if (source.tables) items.push(t.tables(source.tables));
    if (source.images) items.push(t.images(source.images));
    if (source.multiColumnLikely) items.push(t.columns);
    if (icons) items.push(t.icons(icons));
    if (emoji) items.push(t.emoji(emoji));
    if (fancy) items.push(t.fancy(fancy));
    const ratio = 1 - (source.tables ? 0.4 : 0) - (source.images ? 0.3 : 0) - (source.multiColumnLikely ? 0.5 : 0)
      - (icons ? 0.3 : 0) - Math.min(0.3, (emoji + fancy) * 0.1);
    add('design', 'essentials', 10, ratio, isBuilder ? t.designBuilder : t.designOk, t.designTip, items);
  }
  {
    const items: string[] = [];
    if (!email) {
      items.push(t.emailMissing);
    } else {
      const local = email.split('@')[0];
      if (UNPROFESSIONAL_EMAIL.test(local) || (local.replace(/\D/g, '').length >= 5 && !/\p{L}{3,}/u.test(local))) {
        items.push(t.emailUnprofessional(email));
      }
    }
    add('emailAddress', 'essentials', 5, email ? 0.4 : 0, t.emailOk(email), t.emailTip, items);
  }
  {
    const items: string[] = [];
    if (!linkedinUrl) items.push(/linked\s?in/i.test(text) ? t.linkedinHidden : t.linkedinMissing);
    else if (/[-/](?:[0-9a-f]{6,}|\d{5,})\/?$/i.test(linkedinUrl)) items.push(t.linkedinSlug(linkedinUrl));
    add('headerLinks', 'essentials', 5, linkedinUrl ? 0.6 : 0.3, t.linksOk, t.linksTip, items);
  }
  if (isBuilder || (uploaded && source.fileName)) {
    const items: string[] = [];
    if (!isBuilder && source.fileName) {
      const nameWords = (structured.personal.fullName || header[0] || '').match(/\p{L}{2,}/gu) ?? [];
      const fileKey = foldArabic(source.fileName.toLowerCase());
      if (!nameWords.some((w) => fileKey.includes(foldArabic(w.toLowerCase())))) items.push(t.fileNameBad(source.fileName));
    }
    add('fileName', 'essentials', 3, 0.5, isBuilder ? t.fileNameBuilder : t.fileNameOk, t.fileNameTip, items);
  }
  {
    const items: string[] = [];
    const kinds = new Set(dates.tokens.map(dateFormatKind));
    const nonYear = [...kinds].filter((k) => k !== 'year');
    if (!dates.total && (sections.has('experience') || structured.experience.length)) items.push(t.datesNone);
    if (nonYear.length > 1) items.push(t.datesMixed(list(nonYear.map((k) => t.formatNames[k]))));
    if (dates.total && nonYear.length === 0) items.push(t.datesYearsOnly);
    const undated = structured.experience.filter((e) => !e.startDate && !e.endDate).length;
    if (undated && dates.total) items.push(t.datesMissingRoles(undated));
    const backwards = ranges.filter((r) => toMonths(r.end) < toMonths(r.start)).length;
    if (backwards) items.push(t.datesEndBeforeStart(backwards));
    const future = ranges.filter((r) => toMonths(r.start) > toMonths(nowYM())).length;
    if (future) items.push(t.datesFuture(future));
    const shortLinks = findUrls(text).filter((u) => SHORTENERS.test(u));
    if (shortLinks.length) items.push(t.shortLinks(list(shortLinks)));
    add('datesLinks', 'essentials', 6, 1 - items.length * 0.3, t.datesOk(dates.total), t.datesTip, items);
  }

  // ================= Content =================
  {
    const items: string[] = [];
    if (!isBuilder) {
      if (readable < 150) items.push(t.parseEmpty);
      else if (parseRate < 95) items.push(t.parseLow(parseRate));
      if (garbled) items.push(t.garbled(garbled));
      if (spaced) items.push(t.spacedLetters(spaced));
    }
    add('parseRate', 'content', 12, readable < 150 ? 0 : (parseRate - 50) / 45, t.parseOk(words, parseRate), t.parseTip, items);
  }
  {
    const items: string[] = [];
    const n = statements.length;
    if (!n) {
      items.push(t.noStatements);
    } else {
      if (quantified.length / n < 0.4) items.push(t.quantLow(quantified.length, n));
      if (startsWithVerb.length / n < 0.7) items.push(t.verbsLow(startsWithVerb.length, n));
    }
    const weak = WEAK_PHRASES.filter((p) => folded.includes(foldArabic(normalize(p))));
    if (weak.length) items.push(t.weakPhrases(list(weak.map(q))));
    const ratio = n ? (Math.min(1, quantified.length / n / 0.4) + Math.min(1, startsWithVerb.length / n / 0.7)) / 2 - weak.length * 0.1 : 0;
    add('quantifying', 'content', 12, ratio, t.quantOk(quantified.length, n), t.quantTip, items);
  }
  {
    const items: string[] = [];
    const verbCounts = new Map<string, { n: number; label: string }>();
    statements.forEach((s, i) => {
      const v = verbs[i];
      if (!v) return;
      const entry = verbCounts.get(v) ?? { n: 0, label: lightNormalize(s).match(/^\p{L}+/u)?.[0] ?? v };
      entry.n++;
      verbCounts.set(v, entry);
    });
    const repeatedVerbs = [...verbCounts.values()].filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);
    if (repeatedVerbs.length) items.push(t.repeatedVerbs(list(repeatedVerbs.map((x) => `${q(x.label)} ×${x.n}`))));

    const skillKeys = new Set(skills.flatMap((s) => normalize(s).split(/\s+/)).map(termKey));
    const freq = new Map<string, { n: number; label: string }>();
    for (const s of [...statements, summaryText]) {
      for (const w of lightNormalize(s).match(/\p{L}[\p{L}'’-]{3,}/gu) ?? []) {
        const key = termKey(w.toLowerCase());
        if (isStopword(w) || skillKeys.has(key) || verbCounts.has(key) || VERB_ROOTS.has(verbRoot(w.toLowerCase()))) continue;
        const entry = freq.get(key) ?? { n: 0, label: w };
        entry.n++;
        freq.set(key, entry);
      }
    }
    const overused = [...freq.values()].filter((x) => x.n >= 5).sort((a, b) => b.n - a.n).slice(0, 5);
    if (overused.length) items.push(t.repeatedWords(list(overused.map((x) => `${q(x.label)} ×${x.n}`))));
    add('repetition', 'content', 6, 1 - (repeatedVerbs.length + overused.length) * 0.2, t.repetitionOk, t.repetitionTip, items,
      { issues: repeatedVerbs.length + overused.length });
  }
  {
    const items: string[] = [];
    const fixes: CheckFix[] = [];
    let issues = 0;
    const spell = opts.spell;
    if (spell) {
      const plain = text
        .replace(new RegExp(EMAIL_RE.source, 'gi'), ' ')
        .replace(/(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+\S*/g, ' ');
      const allow = new Set(normalize(jobDescription).match(/[a-z]+/g) ?? []);
      const bad: string[] = [];
      // Every distinct word is looked up once. `bad.includes` scanned the list for each word, and a repeated
      // word went back to the dictionary every time — quadratic on a long CV, and it ran on every keystroke.
      const checked = new Set<string>();
      const consider = (raw: string) => {
        const w = raw.replace(/['’]s$/, '').replace(/['’]$/, '');
        if (w.length < 3 || checked.has(w)) return;
        checked.add(w);
        if (allow.has(w.toLowerCase()) || spell.correct(w) || spell.correct(w.toLowerCase())) return;
        bad.push(w);
      };
      // Lowercase words anywhere (capitalized words are usually names, companies or products)…
      for (const m of plain.matchAll(/(?<![\p{L}\p{N}'’_-])[a-z][a-z'’]{2,}(?![\p{L}\p{N}_-])/gu)) consider(m[0]);
      // …plus the capitalized first word of each bullet, which is almost always a verb.
      for (const s of statements) {
        const first = s.match(/^[A-Z][a-z]{2,}(?![\p{L}\p{N}.-])/u)?.[0];
        if (first) consider(first);
      }
      const shown = bad.slice(0, 12);
      if (shown.length) {
        issues += shown.length;
        for (const w of shown.slice(0, 8)) {
          const s = spell.suggest(w);
          if (s && s.toLowerCase() !== w) fixes.push({ from: w, to: s });
        }
        items.push(t.misspelled(list(shown.map((w) => {
          const f = fixes.find((x) => x.from === w);
          return f ? `${w} → ${f.to}` : w;
        }))));
      }
    }
    // Same line only: a word ending one line and starting the next ("…Sharjah\nSharjah, UAE") is not a typo.
    const doubled = [...new Set([...text.matchAll(/(?<!\p{L})(\p{L}{2,})[^\S\n]+\1(?!\p{L})/giu)].map((m) => m[1].toLowerCase()))];
    if (doubled.length) {
      issues += doubled.length;
      items.push(t.doubledWords(list(doubled.map((d) => `${d} ${d}`))));
    }
    if (source.kind !== 'pdf') {
      const before = (text.match(/[^\S\n]+[,.;:!?،؛](?=\s|$)/g) ?? []).length;
      if (before) { issues++; items.push(t.spaceBeforePunct(before)); }
    }
    const lowerI = (text.match(/(?<![\p{L}\p{N}'’.-])i(?![\p{L}\p{N}'’.-])/gu) ?? []).length;
    if (lowerI) { issues++; items.push(t.lowercaseI(lowerI)); }
    const pronouns = (text.match(FIRST_PERSON_EN) ?? []).length + (folded.match(FIRST_PERSON_AR) ?? []).length
      + (normalize(text).replace(/[یئ]/g, 'ي').match(HAVE_AR) ?? []).length;
    if (pronouns) { issues++; items.push(t.pronouns(pronouns)); }
    if (arabic) {
      const latinCommas = (cvText.match(/\p{Script=Arabic}\s*,\s*\p{Script=Arabic}/gu) ?? []).length;
      if (latinCommas) { issues++; items.push(t.latinCommaInArabic(latinCommas)); }
    }
    add('spelling', 'content', 8, 1 - issues * 0.12, spell || arabic ? t.spellingOk : t.spellingOkNoDict, t.spellingTip, items, { issues, fixes });
  }
  {
    const items: string[] = [];
    const bulletsOnly = bulletLines.length >= 3 ? bulletLines : [];
    const symbols = [...new Set(bulletsOnly.map((l) => l.match(BULLET_RE)?.[1] ?? '').filter((s) => s && !/^\d/.test(s)))];
    if (symbols.length > 1) items.push(t.mixedSymbols(symbols.join(' ')));
    const stmts = bulletsOnly.map(stripBullet);
    const withDot = stmts.filter((s) => /[.!。]$/.test(s)).length;
    const without = stmts.length - withDot;
    if (stmts.length >= 3 && Math.min(withDot, without) >= 1) items.push(t.mixedEndings(withDot, without));
    const latin = stmts.filter((s) => /^[A-Za-z]/.test(s));
    const lower = latin.filter((s) => /^[a-z]/.test(s)).length;
    if (lower && lower < latin.length) items.push(t.lowercaseStart(lower));
    let past = 0;
    let present = 0;
    for (const s of stmts) {
      const w = (s.match(/^[A-Za-z]+/)?.[0] ?? '').toLowerCase();
      if (!w) continue;
      if (ACTION_VERBS.has(w)) past++;
      else if (isPresentVerb(w)) present++;
    }
    if (past >= 2 && present >= 2) items.push(t.mixedTense(present));
    const long = statements.filter((s) => s.split(/\s+/).length > 35).length;
    if (long) items.push(t.longBullets(long));
    const roles = structured.experience.filter((e) => e.jobTitle || e.company);
    const few = roles.filter((e) => splitLines(e.bullets).length < 2).length;
    const many = roles.filter((e) => splitLines(e.bullets).length > 8).length;
    if (few) items.push(t.fewBullets(few));
    if (many) items.push(t.manyBullets(many));
    add('bulletsConsistency', 'content', 6, 1 - items.length * 0.25, t.consistencyOk, t.consistencyTip, items);
  }

  // ================= Sections =================
  {
    const items: string[] = [];
    const core = ['summary', 'experience', 'education', 'skills'];
    const missing = core.filter((s) => !found.has(s));
    if (missing.length) items.push(t.missingSections(list(missing.map(sectionName))));
    if (summaryWords && summaryWords < 15) items.push(t.summaryShort(summaryWords));
    if (summaryWords > 120) items.push(t.summaryLong(summaryWords));
    const minWords = arabic ? 250 : 300;
    if (words < minWords) items.push(t.lengthShort(words));
    else if (words > 1000) items.push(t.lengthLong(words));
    add('essentialSections', 'sections', 12, (core.length - missing.length) / core.length - (items.length - (missing.length ? 1 : 0)) * 0.1,
      t.sectionsOk(list([...found].map(sectionName))), t.sectionsTip, items);
  }
  {
    const items: string[] = [];
    if (!structured.personal.fullName) items.push(t.missingName);
    if (!email) items.push(t.missingEmail);
    if (!phone) items.push(t.missingPhone);
    if (!structured.personal.location) items.push(t.missingLocation);
    if ((email || phone) && !(EMAIL_RE.test(topText) || findPhone(topText))) items.push(t.contactNotTop);
    if (source.kind === 'docx' && (!email || !phone)) items.push(t.contactInHeader);
    add('contactInfo', 'sections', 8, 1 - items.length * 0.25, t.contactOk, t.contactTip, items);
  }
  {
    const items: string[] = [];
    const order = [...sections.keys()];
    const idx = (k: string) => order.indexOf(k);
    if (idx('summary') > -1 && idx('experience') > -1 && idx('summary') > idx('experience')) items.push(t.summaryAfterExperience);
    if (idx('education') > -1 && idx('experience') > -1 && idx('education') < idx('experience') && (years ?? 0) >= 2) items.push(t.educationFirst);
    // Compare END dates: a CV is reverse-chronological by when each role ended. Start dates legitimately
    // zig-zag when part-time or freelance work ran concurrently with a longer main role.
    if (ranges.slice(1).some((r, i) => toMonths(r.end) > toMonths(ranges[i].end))) items.push(t.rolesOrder);
    add('sectionsOrder', 'sections', 5, 1 - items.length * 0.35, t.orderOk, t.orderTip, items);
  }

  // ================= HR red flags =================
  {
    const items: string[] = [];
    const cliches = CLICHES.filter((c) => match(c));
    const superlatives = SUPERLATIVES.filter((c) => match(c));
    if (cliches.length) items.push(t.cliches(list(cliches.map(q))));
    if (superlatives.length) items.push(t.superlatives(list(superlatives.map(q))));
    if (skills.length > 40) items.push(t.tooManySkills(skills.length));
    const issues = cliches.length + superlatives.length + (skills.length > 40 ? 1 : 0);
    add('credibility', 'redFlags', 5, 1 - cliches.length * 0.15 - superlatives.length * 0.2 - (skills.length > 40 ? 0.3 : 0),
      t.credibilityOk, t.credibilityTip, items, { issues });
  }
  {
    const items: string[] = [];
    const past = ranges.filter((r) => !r.present);
    const short = past.filter((r) => toMonths(r.end) - toMonths(r.start) + 1 < 12).length;
    if (ranges.length >= 3 && short >= 2) items.push(t.shortStints(short, ranges.length));
    let overlaps = 0;
    for (let i = 0; i < past.length; i++) {
      for (let j = i + 1; j < past.length; j++) {
        const overlap = Math.min(toMonths(past[i].end), toMonths(past[j].end)) - Math.max(toMonths(past[i].start), toMonths(past[j].start));
        if (overlap > 3) overlaps++;
      }
    }
    if (overlaps) items.push(t.overlaps(overlaps));
    if (ranges.length && !ranges.some((r) => r.present)) {
      const since = toMonths(nowYM()) - Math.max(...ranges.map((r) => toMonths(r.end)));
      if (since > 6) items.push(t.sinceLastRole(since));
    }
    add('interviewRisks', 'redFlags', 5, 1 - items.length * 0.3, t.risksOk, t.risksTip, items);
  }
  {
    const lvl = cvLevel ?? (years === null ? 2 : years < 2 ? 1 : years < 5 ? 2 : years < 10 ? 3 : 4);
    const [minW, maxW] = ([[200, 500], [250, 600], [400, 800], [450, 1000], [500, 1100], [500, 1100], [500, 1100]] as const)[lvl];
    const quantTarget = [20, 25, 30, 40, 45, 50, 50][lvl];
    const roles = structured.experience.map((e) => splitLines(e.bullets).length).filter((n) => n > 0);
    const avg = roles.length ? round1(roles.reduce((a, b) => a + b, 0) / roles.length) : 0;
    const skillCount = skills.length;
    const qp = statements.length ? Math.round((quantified.length / statements.length) * 100) : 0;
    const items: string[] = [];
    if (words < minW || words > maxW) items.push(t.benchWords(words, minW, maxW));
    if (roles.length && (avg < 3 || avg > 6)) items.push(t.benchBullets(avg));
    if (statements.length && qp < quantTarget) items.push(t.benchQuant(qp, quantTarget));
    if (skillCount < 6 || skillCount > 25) items.push(t.benchSkills(skillCount));
    const levelName = t.levelNames[lvl];
    add('peerBenchmark', 'redFlags', 5, 1 - items.length * 0.2, t.benchOk(levelName), t.benchTip(levelName), items);
  }
  {
    const items: string[] = [];
    const li = opts.linkedin;
    if (li) {
      const fold = (s: string) => foldArabic(lightNormalize(s)).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
      const same = (a: string, b: string) => {
        const x = fold(a);
        const y = fold(b);
        return Boolean(x && y && (x.includes(y) || y.includes(x)));
      };
      const wordSet = (s: string) => new Set(fold(s).split(' ').filter((w) => w.length > 2));
      const cutoff = nowYM().y - 10;
      let matchedRoles = 0;
      for (const role of li.experience.slice(0, 6)) {
        const liStart = parseDateToken(role.startDate);
        if (liStart && liStart.y < cutoff) continue;
        const cvRole = structured.experience.find((e) => same(e.company, role.company));
        if (!cvRole) {
          items.push(t.linkedinRoleMissing([role.jobTitle, role.company].filter(Boolean).join(' – ')));
          continue;
        }
        matchedRoles++;
        const a = wordSet(cvRole.jobTitle);
        const b = wordSet(role.jobTitle);
        if (b.size && [...b].filter((w) => a.has(w)).length / b.size < 0.5) {
          items.push(t.linkedinTitleMismatch(cvRole.jobTitle, role.jobTitle, role.company));
        }
        const cvStart = parseDateToken(cvRole.startDate);
        if (cvStart && liStart && Math.abs(toMonths({ y: cvStart.y, m: cvStart.m || 1 }) - toMonths({ y: liStart.y, m: liStart.m || 1 })) > 2) {
          items.push(t.linkedinDateMismatch(role.company, cvRole.startDate, role.startDate));
        }
      }
      add('linkedinMatch', 'redFlags', 4, 1 - items.length * 0.25, t.linkedinMatchOk(matchedRoles), t.linkedinMatchTip, items);
    } else {
      if (!linkedinUrl) items.push(t.linkedinNoUrl);
      add('linkedinMatch', 'redFlags', 4, 0.5, t.linkedinCompareHint, t.linkedinMatchTip, items);
    }
  }

  // ================= Discrimination =================
  {
    const items: string[] = [];
    const oldest = dates.years.length ? Math.min(...dates.years) : null;
    if (oldest && oldest < nowYM().y - 20) items.push(t.oldDates(oldest));
    const stated = folded.match(/(\d{2})\s*\+?\s*(?:years?|yrs?|سنه|سنوات|عاما|عام)/u);
    if (stated && +stated[1] >= 20 && +stated[1] < 60) items.push(t.ageStated(+stated[1]));
    const dobAge = personalKeys.filter((k) => k === 'dob' || k === 'age');
    if (dobAge.length) items.push(t.dobAge(list(dobAge.map((k) => t.personalNames[k]))));
    add('ageism', 'discrimination', 4, 1 - items.length * 0.35, t.ageOk, t.ageTip, items);
  }
  {
    const items: string[] = [];
    if (ranges.length >= 2 && tl.gaps.length) {
      items.push(t.gaps(list(tl.gaps.map((g) => t.gapItem(fmtYM(g.from), fmtYM(g.to), g.months)))));
    } else if (!ranges.length && structured.experience.length >= 2) {
      items.push(t.gapsUnknown);
    }
    const issues = ranges.length >= 2 ? tl.gaps.length : items.length;
    add('employmentGaps', 'discrimination', 5, tl.gaps.some((g) => g.months > 12) ? 0.3 : 0.6, t.gapsOk, t.gapsTip, items, { issues });
  }
  {
    const items: string[] = [];
    // Nationality is expected on Gulf CVs and routinely asked for, so it is not a red flag there.
    // It stays flagged for CVs aimed elsewhere, where recruiters are told to leave it off.
    const gulfTargeted = arabic || isGulfLocation(structured.personal.location ?? '');
    const allowed = gulfTargeted ? ['dob', 'age', 'photo', 'nationality'] : ['dob', 'age', 'photo'];
    const other = personalKeys.filter((k) => !allowed.includes(k));
    if (other.length) items.push(t.personalFound(list(other.map((k) => t.personalNames[k]))));
    if (!isBuilder && ((source.images ?? 0) > 0 || personalKeys.includes('photo'))) items.push(t.photoFound);
    add('personalDetails', 'discrimination', 5, 1 - items.length * 0.45, t.personalOk, t.personalTip, items);
  }

  // ================= Seniority =================
  {
    const items: string[] = [];
    const roles = structured.experience
      .map((e) => ({ e, start: parseDateToken(e.startDate), level: seniorityLevel(e.jobTitle) }))
      .filter((r): r is { e: typeof r.e; start: YM; level: number } => r.start !== null && r.level !== null)
      .sort((a, b) => toMonths(a.start) - toMonths(b.start));
    let promotions = 0;
    for (let i = 1; i < roles.length; i++) {
      const d = roles[i].level - roles[i - 1].level;
      if (d > 0) promotions++;
      if (d < 0 && items.length < 2) items.push(t.regression(roles[i - 1].e.jobTitle, roles[i].e.jobTitle));
    }
    if (roles.length >= 3 && (years ?? 0) >= 6 && promotions === 0) items.push(t.noProgression(years ?? 0));
    const req = hasJD ? requiredYears(jobDescription) : null;
    if (req && years !== null && years < req) items.push(t.yearsBelow(years, req));
    add('careerProgression', 'seniority', 5, 1 - items.length * 0.3,
      years === null ? t.yearsUnknownInfo : t.progressionOk(years, promotions), t.progressionTip, items);
  }
  {
    const items: string[] = [];
    const evidence = makeMatcher([...(sections.get('experience') ?? []), ...(sections.get('projects') ?? []), summaryText].join('\n'));
    // A compound entry such as "PHP / Laravel" or "SQL / NoSQL (MySQL, Database Design)" never appears
    // verbatim in a bullet, so match its parts too — otherwise every grouped skill reads as unsupported.
    const skillParts = (s: string) => s.split(/\s*[/&]\s*|\s*[(),]\s*/).map((p) => p.trim()).filter((p) => p.length > 1);
    const supported_ = (s: string) => evidence(s) || skillParts(s).some((part) => evidence(part));
    const unsupported = skills.filter((s) => !supported_(s));
    const supported = skills.length - unsupported.length;
    if (!skills.length) items.push(t.noSkills);
    else if (unsupported.length / skills.length > 0.4) items.push(t.unsupportedSkills(list(unsupported.slice(0, 8))));
    add('skillEvidence', 'seniority', 5, skills.length ? supported / skills.length / 0.6 : 0,
      t.evidenceOk(supported, skills.length), t.evidenceTip, items);
  }
  {
    const items: string[] = [];
    const leadership = statements.filter((s) => {
      const f = foldArabic(lightNormalize(s).toLowerCase());
      return LEADERSHIP_KEYS.some((k) => new RegExp(`(?<!\\p{L})(?:و|ال|وال)?${k}(?!\\p{L})`, 'u').test(f));
    }).length;
    const teamSize = TEAM_SIZE_RE.test(text);
    if (seniorContext) {
      if (leadership < 2) items.push(t.leadershipLow(leadership));
      if (!teamSize) items.push(t.noTeamSize);
    }
    add('leadershipSignals', 'seniority', 4, seniorContext ? leadership / 2 - (teamSize ? 0 : 0.2) : 1,
      seniorContext ? t.leadershipOk(leadership) : t.leadershipJunior, t.leadershipTip, items);
  }

  // ================= Tailoring =================
  let matched: string[] = [];
  let missing: string[] = [];
  let matchRate: number | null = null;
  if (!hasJD) {
    for (const id of ['hardSkills', 'softSkills', 'actionVerbs', 'tailoredTitle']) notApplicable(id, 'tailoring');
  } else {
    const jdMatch = makeMatcher(jobDescription);
    const softKeys = new Set(SOFT_SKILLS.flatMap((g) => g.terms.map((x) => foldArabic(normalize(x)))));
    const keywords = extractKeywords(jobDescription).filter((k) => !softKeys.has(foldArabic(normalize(k))));
    matched = keywords.filter((k) => match(k));
    missing = keywords.filter((k) => !matched.includes(k));
    matchRate = keywords.length ? matched.length / keywords.length : 0;
    const pct = Math.round(matchRate * 100);
    const below = matchRate < 0.75;
    add('hardSkills', 'tailoring', 25, matchRate / 0.75, t.hardOk(matched.length, keywords.length), t.hardTip,
      below && missing.length ? [t.hardMissing(list(missing), matched.length, keywords.length, pct)] : [],
      { issues: below ? missing.length : 0 });

    const softLabel = (g: (typeof SOFT_SKILLS)[number]) => (lang === 'ar' ? g.ar : g.en);
    const softInJd = SOFT_SKILLS.filter((g) => g.terms.some((term) => jdMatch(term)));
    const softMissing = softInJd.filter((g) => !g.terms.some((term) => match(term)));
    add('softSkills', 'tailoring', 5, softInJd.length ? 1 - softMissing.length / softInJd.length : 1,
      softInJd.length ? t.softOk(list(softInJd.map(softLabel))) : t.softNone, t.softTip,
      softMissing.length ? [t.softMissing(list(softMissing.map(softLabel)))] : [], { issues: softMissing.length });

    const jdVerbs = new Map<string, { label: string; n: number }>();
    const bump = (key: string, label: string) => {
      const entry = jdVerbs.get(key) ?? { label, n: 0 };
      entry.n++;
      jdVerbs.set(key, entry);
    };
    for (const w of normalize(jobDescription).match(/[a-z]{4,}/g) ?? []) {
      if (VERB_ROOTS.has(verbRoot(w))) bump(verbRoot(w), w);
    }
    for (const w of foldArabic(normalize(jobDescription)).match(/\p{Script=Arabic}{3,}/gu) ?? []) {
      const key = stripArticle(w.replace(/^و(?=.{3,})/, ''));
      if (AR_VERB_KEYS.has(key)) bump(key, w);
    }
    const topVerbs = [...jdVerbs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    const cvKeys = new Set([
      ...(normalize(text).match(/[a-z]{3,}/g) ?? []).map(verbRoot),
      ...(folded.match(/\p{Script=Arabic}{3,}/gu) ?? []).map((w) => stripArticle(w.replace(/^و(?=.{3,})/, ''))),
    ]);
    const verbsMissing = topVerbs.filter(([key]) => !cvKeys.has(key)).map(([, v]) => v.label);
    const verbRatio = topVerbs.length ? (topVerbs.length - verbsMissing.length) / topVerbs.length : 1;
    add('actionVerbs', 'tailoring', 5, verbRatio / 0.6,
      topVerbs.length ? t.verbsJdOk(list(topVerbs.map(([, v]) => v.label))) : t.verbsJdNone, t.verbsJdTip,
      verbRatio < 0.6 && verbsMissing.length ? [t.verbsJdMissing(list(verbsMissing))] : [],
      { issues: verbRatio < 0.6 ? verbsMissing.length : 0 });

    const items: string[] = [];
    const generic = new Set(['job', 'title', 'position', 'role', 'the', 'and', 'for', 'hiring', 'senior', 'junior', 'urgent', 'remote',
      'مطلوب', 'وظيفه', 'مسمي', 'عاجل', 'فرصه']);
    const titleWords = (foldArabic(normalize(jdTitle)).match(/[\p{L}+#]{3,}/gu) ?? []).map((w) => stripArticle(w)).filter((w) => !generic.has(w));
    const headline = makeMatcher([structured.personal.title, ...header.slice(0, 3), summaryText].join('\n'));
    const hits = titleWords.filter((w) => headline(w));
    if (titleWords.length && hits.length < titleWords.length) items.push(t.titleMissing(jdTitle));
    const levelGap = cvLevel !== null && jdLevel !== null ? Math.abs(cvLevel - jdLevel) : 0;
    if (levelGap >= 1 && cvLevel !== null && jdLevel !== null) items.push(t.levelMismatch(t.levelNames[cvLevel], t.levelNames[jdLevel]));
    add('tailoredTitle', 'tailoring', 6, (titleWords.length ? hits.length / titleWords.length : 1) - levelGap * 0.2,
      t.titleOk(jdTitle), t.titleTip, items);
  }

  // ================= Totals =================
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const categories: CategoryScore[] = CATEGORY_ORDER.map((key) => {
    const cs = checks.filter((c) => c.category === key);
    const w = cs.reduce((s, c) => s + c.weight, 0);
    return {
      key,
      score: w ? Math.round((cs.reduce((s, c) => s + c.earned, 0) / w) * 100) : null,
      issues: cs.reduce((s, c) => s + c.issues, 0),
    };
  });

  return {
    score: total ? Math.round((earned / total) * 100) : 0,
    parseRate,
    categories,
    checks,
    keywords: { matched, missing, matchRate },
    stats: {
      words,
      bullets: bulletLines.length,
      quantified: quantified.length,
      actionVerbs: startsWithVerb.length,
      yearsExperience: years,
    },
  };
}
