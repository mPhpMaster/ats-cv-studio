import type { CVData, Design, Lang, TemplateId } from '../types';

export const TEMPLATES: TemplateId[] = ['classic', 'modern', 'compact'];

/** Standard fonts that every ATS and every recipient's machine can render. */
export const FONTS: Record<Lang, string[]> = {
  en: ['Calibri', 'Arial', 'Helvetica', 'Georgia', 'Cambria', 'Garamond', 'Times New Roman', 'Verdana'],
  ar: ['Arial', 'Tahoma', 'Segoe UI', 'Simplified Arabic', 'Traditional Arabic', 'Sakkal Majalla'],
};

export const ACCENTS = ['#1f2937', '#1f4e9c', '#0f766e', '#7c3aed', '#b91c1c', '#b45309'];

export const cvLang = (cv: CVData): Lang => cv.language ?? 'en';

export const defaultDesign = (lang: Lang): Design => ({
  template: 'classic',
  font: lang === 'ar' ? 'Arial' : 'Calibri',
  accent: '#1f4e9c',
});

/**
 * Always returns a complete, usable design — the single place that decides what a stored or imported one
 * means. Every field is validated, not just the font: an unknown template used to render as classic while
 * silently staying in the saved data, and an accent that was missing or not a hex colour reached
 * `exportDocx` as `design.accent.replace('#', '')` and threw, which the DOCX button reports as nothing
 * happening at all. Older CVs predate the whole `design` object, hence the optional type.
 */
export function getDesign(cv: CVData): Design {
  const lang = cvLang(cv);
  const fallback = defaultDesign(lang);
  const d = { ...fallback, ...cv.design };
  if (!FONTS[lang].includes(d.font)) d.font = FONTS[lang][0];
  if (!TEMPLATES.includes(d.template)) d.template = fallback.template;
  if (!/^#[0-9a-f]{6}$/i.test(d.accent ?? '')) d.accent = fallback.accent;
  return d;
}
