import { messages } from '../i18n';
import type { CVData } from '../types';
import { cvLang } from './design';

export const splitList = (s: string) => s.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
export const splitLines = (s: string) => s.split('\n').map((x) => x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
export const dateRange = (a: string, b: string) => [a, b].filter(Boolean).join(' – ');

export function contactItems(cv: CVData): string[] {
  const p = cv.personal;
  return [p.email, p.phone, p.location, p.linkedin, p.website].map((x) => x.trim()).filter(Boolean);
}

export const contactLine = (cv: CVData) => contactItems(cv).join(' | ');

/** Plain-text rendering of the CV — exactly what an ATS parser sees. */
export function cvToText(cv: CVData): string {
  const h = messages[cvLang(cv)].cv;
  const out: string[] = [];
  const p = cv.personal;
  if (p.fullName) out.push(p.fullName);
  if (p.title) out.push(p.title);
  const contact = contactLine(cv);
  if (contact) out.push(contact);

  const section = (title: string, body: string[]) => {
    if (body.length) out.push('', title.toUpperCase(), ...body);
  };

  section(h.summary, cv.summary.trim() ? [cv.summary.trim()] : []);

  section(h.experience, cv.experience.flatMap((e) => [
    '',
    [e.jobTitle, e.company].filter(Boolean).join(' – '),
    [e.location, dateRange(e.startDate, e.endDate)].filter(Boolean).join(' | '),
    ...splitLines(e.bullets).map((b) => `• ${b}`),
  ]).slice(1));

  section(h.education, cv.education.flatMap((e) => [
    '',
    [e.degree, e.school].filter(Boolean).join(' – '),
    [e.location, dateRange(e.startDate, e.endDate)].filter(Boolean).join(' | '),
    ...splitLines(e.details).map((b) => `• ${b}`),
  ]).slice(1));

  const skills = splitList(cv.skills);
  section(h.skills, skills.length ? [skills.join(h.listSep)] : []);

  section(h.certifications, cv.certifications
    .filter((c) => c.name)
    .map((c) => `• ${[c.name, c.issuer, c.date].filter(Boolean).join(' – ')}`));

  section(h.projects, cv.projects.filter((pr) => pr.name || pr.description).flatMap((pr) => [
    [pr.name, pr.link].filter(Boolean).join(' | '),
    ...splitLines(pr.description).map((b) => `• ${b}`),
  ].filter(Boolean)));

  const langs = splitList(cv.languages);
  section(h.languages, langs.length ? [langs.join(h.listSep)] : []);

  return out.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim();
}
