import { BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { messages } from '../i18n';
import type { CVData } from '../types';
import { ARABIC_RE } from './arabic';
import { contactLine, dateRange, splitLines, splitList } from './cvText';
import { cvLang, getDesign } from './design';

interface RunOpts {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  color?: string;
}

export async function exportDocx(cv: CVData): Promise<Blob> {
  const lang = cvLang(cv);
  const rtl = lang === 'ar';
  const h = messages[lang].cv;
  const design = getDesign(cv);
  const compact = design.template === 'compact';
  const accent = design.template === 'modern' ? design.accent.replace('#', '') : '000000';
  const FONT = { ascii: design.font, hAnsi: design.font, cs: design.font, eastAsia: design.font };
  const base = compact ? 20 : 21; // half-points

  /** Split mixed text so Arabic segments are marked right-to-left and Latin/number segments are not. */
  const runs = (text: string, o: RunOpts = {}) => {
    const parts = rtl ? text.split(/([A-Za-z0-9@._%+#/:\-()]+(?:[ ]+[A-Za-z0-9@._%+#/:\-()]+)*)/) : [text];
    return parts.filter(Boolean).map((part) => new TextRun({
      text: part,
      bold: o.bold,
      boldComplexScript: o.bold,
      italics: o.italics,
      italicsComplexScript: o.italics,
      size: o.size ?? base,
      sizeComplexScript: o.size ?? base,
      color: o.color,
      font: FONT,
      rightToLeft: rtl && ARABIC_RE.test(part),
      language: rtl ? { value: 'en-US', bidirectional: 'ar-SA' } : undefined,
    }));
  };

  const para = (children: TextRun[], extra: { before?: number; after?: number } = {}) =>
    new Paragraph({ bidirectional: rtl, spacing: { before: extra.before ?? 0, after: extra.after ?? 0 }, children });

  const heading = (text: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      bidirectional: rtl,
      spacing: { before: compact ? 160 : 240, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: design.template === 'modern' ? accent : '444444', space: 2 } },
      children: runs(rtl ? text : text.toUpperCase(), { bold: true, size: compact ? 22 : 24, color: accent }),
    });

  const bullet = (text: string) =>
    new Paragraph({ bidirectional: rtl, bullet: { level: 0 }, spacing: { after: compact ? 20 : 40 }, children: runs(text) });

  const p = cv.personal;
  const children: Paragraph[] = [];
  children.push(para(runs(p.fullName || h.yourName, { bold: true, size: compact ? 32 : 36, color: accent })));
  if (p.title) children.push(para(runs(p.title, { size: 24 })));
  const contact = contactLine(cv);
  if (contact) children.push(para(runs(contact, { size: 20 }), { after: 120 }));

  if (cv.summary.trim()) children.push(heading(h.summary), para(runs(cv.summary.trim())));

  const entry = (title: string, org: string, meta: string, items: string[], first: boolean) => {
    children.push(para([
      ...runs(title, { bold: true, size: base + 1 }),
      ...(org ? runs(` – ${org}`, { size: base + 1 }) : []),
    ], { before: first ? 0 : compact ? 100 : 160 }));
    if (meta) children.push(para(runs(meta, { italics: true, size: 20 }), { after: 60 }));
    items.forEach((b) => children.push(bullet(b)));
  };

  if (cv.experience.length) {
    children.push(heading(h.experience));
    cv.experience.forEach((e, i) =>
      entry(e.jobTitle, e.company, [e.location, dateRange(e.startDate, e.endDate)].filter(Boolean).join(' | '), splitLines(e.bullets), i === 0));
  }

  if (cv.education.length) {
    children.push(heading(h.education));
    cv.education.forEach((e, i) =>
      entry(e.degree, e.school, [e.location, dateRange(e.startDate, e.endDate)].filter(Boolean).join(' | '), splitLines(e.details), i === 0));
  }

  const skills = splitList(cv.skills);
  if (skills.length) children.push(heading(h.skills), para(runs(skills.join(h.listSep))));

  const certs = cv.certifications.filter((c) => c.name);
  if (certs.length) {
    children.push(heading(h.certifications));
    certs.forEach((c) => children.push(bullet([c.name, c.issuer, c.date].filter(Boolean).join(' – '))));
  }

  const projects = cv.projects.filter((pr) => pr.name || pr.description);
  if (projects.length) {
    children.push(heading(h.projects));
    projects.forEach((pr) => {
      if (pr.name) children.push(para(runs([pr.name, pr.link].filter(Boolean).join(' | '), { bold: true })));
      splitLines(pr.description).forEach((d) => children.push(bullet(d)));
    });
  }

  const langs = splitList(cv.languages);
  if (langs.length) children.push(heading(h.languages), para(runs(langs.join(h.listSep))));

  const doc = new Document({
    creator: p.fullName || 'ATS CV Studio',
    title: `${p.fullName || 'CV'} – CV`,
    styles: { default: { document: { run: { font: design.font } } } },
    sections: [{
      properties: { page: { margin: { top: compact ? 800 : 1000, bottom: compact ? 800 : 1000, left: 1100, right: 1100 } } },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
