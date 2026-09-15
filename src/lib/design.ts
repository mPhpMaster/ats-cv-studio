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

export function getDesign(cv: CVData): Design {
  const lang = cvLang(cv);
  const d = { ...defaultDesign(lang), ...cv.design };
  if (!FONTS[lang].includes(d.font)) d.font = FONTS[lang][0];
  return d;
}
