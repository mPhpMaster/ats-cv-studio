// Helpers for handling Arabic text in matching and analysis.

export const ARABIC_RE = /\p{Script=Arabic}/u;

/**
 * Remove diacritics/tatweel and convert Arabic-Indic digits, percent and decimal signs to ASCII.
 * Arabic punctuation (، ؛ ؟) is kept so imported text is not altered.
 */
export function lightNormalize(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٪/g, '%')
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/**
 * Fold common spelling variants (hamza forms, taa marbuta, alef maqsura) so they compare equal. Also folds the
 * Persian/Urdu look-alikes (ی ھ ک) that PDF fonts often emit for Arabic ي ه ك.
 */
export function foldArabic(s: string): string {
  return s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىیئ]/g, 'ي')
    .replace(/[ةھ]/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/ؤ/g, 'و');
}

/** Letters used by Persian/Urdu but not Arabic; their presence means look-alike letters are intentional. */
export const PERSIAN_ONLY_RE = /[پچژگ]/;

/** Replace Persian/Urdu look-alike letters with the Arabic letters an Arabic reader (and ATS search) expects. */
export function arabicLetterForms(s: string): string {
  return s.replace(/ی/g, 'ي').replace(/ھ/g, 'ه').replace(/ک/g, 'ك');
}

/** Strip the definite article and attached prepositions: "والتسويق" → "تسويق". Expects folded input. */
export function stripArticle(word: string): string {
  const m = word.match(/^(?:[وف]?[بكل]?ال|لل)(.{3,})$/);
  return m ? m[1] : word;
}

/** Display form for an extracted Arabic token: keep "ال" but drop attached conjunctions/prepositions. */
export function displayArabic(word: string): string {
  if (/^[وفبك]ال/.test(word)) return word.slice(1);
  if (/^لل/.test(word) && word.length > 4) return `ال${word.slice(2)}`;
  return word;
}

export function isArabicText(s: string): boolean {
  const ar = (s.match(/\p{Script=Arabic}/gu) ?? []).length;
  const latin = (s.match(/[A-Za-z]/g) ?? []).length;
  return ar > latin;
}
