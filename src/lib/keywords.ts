import { ARABIC_RE, displayArabic, foldArabic, lightNormalize, stripArticle } from './arabic';
import { KNOWN_SKILLS, STOPWORDS } from './dictionaries';

const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}+#./-]*[\p{L}\p{N}+#]|\p{L}[+#]*/gu;

/** Lower-case, normalize digits/punctuation, and separate Latin terms glued to Arabic letters ("وReact"). */
export function normalize(text: string): string {
  return lightNormalize(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/(\p{Script=Arabic})(?=[a-z0-9])/gu, '$1 ')
    .replace(/([a-z0-9+#])(?=\p{Script=Arabic})/gu, '$1 ');
}

/** Matching key for one word: Arabic spelling variants folded and the definite article removed. */
export function termKey(word: string): string {
  const f = foldArabic(word);
  return ARABIC_RE.test(f) ? stripArticle(f) : f;
}

const phraseKey = (s: string) => normalize(s).split(/[\s-]+/).filter(Boolean).map(termKey).join(' ');

const STOP_KEYS = new Set([...STOPWORDS].map((w) => termKey(normalize(w))));

export const isStopword = (word: string) => STOP_KEYS.has(termKey(normalize(word)));

function tokenize(text: string): string[] {
  return (normalize(text).match(TOKEN_RE) ?? []).map((t) => t.replace(/[./-]+$/, ''));
}

function isUseful(token: string): boolean {
  const key = termKey(token);
  if (STOP_KEYS.has(key) || STOP_KEYS.has(token)) return false;
  if (/^\d+[a-z]?$/.test(token)) return false;
  if (ARABIC_RE.test(token)) return key.length >= 3;
  return !(token.length < 2 && !/[+#]/.test(token));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wordPattern(word: string, isLast: boolean): string {
  if (ARABIC_RE.test(word)) {
    // Allow attached conjunctions, prepositions and the article: و، ف، ب، ك، ل، ال
    return `(?:[وف]?[بكل]?ال|لل|[وفبكل])?${escapeRe(stripArticle(word))}`;
  }
  if (isLast && /^[a-z]{4,}$/.test(word)) {
    return word.endsWith('s') ? `${escapeRe(word.slice(0, -1))}s?` : `${escapeRe(word)}s?`;
  }
  return escapeRe(word);
}

const regexCache = new Map<string, RegExp>();
function termRegex(term: string): RegExp {
  let re = regexCache.get(term);
  if (!re) {
    const words = foldArabic(normalize(term)).split(/[\s-]+/).filter(Boolean);
    const body = words.map((w, i) => wordPattern(w, i === words.length - 1)).join('[\\s-]+');
    re = new RegExp(`(?<![\\p{L}\\p{N}+#])${body}(?![\\p{L}\\p{N}+#])`, 'u');
    regexCache.set(term, re);
  }
  return re;
}

/** Build a fast whole-word/phrase matcher over a text (tolerates plurals and Arabic prefixes). */
export function makeMatcher(text: string): (term: string) => boolean {
  const prepared = foldArabic(normalize(text));
  return (term) => termRegex(term).test(prepared);
}

export const containsTerm = (text: string, term: string) => makeMatcher(text)(term);

/**
 * Extract the most important keywords from a job description.
 * Ranks known skills and repeated terms/phrases above one-off words.
 */
export function extractKeywords(jobDescription: string, limit = 30): string[] {
  const text = normalize(jobDescription);
  const match = makeMatcher(jobDescription);
  const scores = new Map<string, number>();
  const labels = new Map<string, string>();
  const bigrams = new Set<string>();
  const bump = (key: string, label: string, by: number) => {
    scores.set(key, (scores.get(key) ?? 0) + by);
    if (!labels.has(key)) labels.set(key, label);
  };

  for (const skill of KNOWN_SKILLS) {
    if (match(skill)) bump(phraseKey(skill), skill, 5);
  }

  // Split into sentences/lines so bigrams never span punctuation (but keep "next.js", "asp.net").
  for (const chunk of text.split(/[\n;:,،؛؟()••!?|]+|\.(?=\s|$)|\s\/\s/)) {
    const tokens = tokenize(chunk);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!isUseful(t)) continue;
      const label = ARABIC_RE.test(t) ? displayArabic(t) : t;
      const key = phraseKey(t);
      bump(key, label, ARABIC_RE.test(t) || t.length > 2 ? 1 : 0.5);
      const next = tokens[i + 1];
      if (next && isUseful(next)) {
        const bigram = `${key} ${phraseKey(next)}`;
        bigrams.add(bigram);
        bump(bigram, `${label} ${ARABIC_RE.test(next) ? displayArabic(next) : next}`, 0.6);
      }
    }
  }

  const ranked = [...scores.entries()]
    .filter(([key, score]) => (bigrams.has(key) && scores.get(key)! < 5 ? score >= 1.2 : score >= 1))
    .sort((a, b) => b[1] - a[1]);

  const picked = ranked.slice(0, limit + 10).map(([key]) => key);
  // Drop single words that only appear as part of a chosen phrase ("frontend" within "frontend engineer").
  return picked
    .filter((key) => {
      if (key.includes(' ')) return true;
      const covering = picked.filter((p) => p !== key && p.split(' ').includes(key));
      if (!covering.length) return true;
      return (scores.get(key) ?? 0) > Math.max(...covering.map((p) => scores.get(p) ?? 0)) * 1.5 + 1;
    })
    .slice(0, limit)
    .map((key) => labels.get(key)!);
}
