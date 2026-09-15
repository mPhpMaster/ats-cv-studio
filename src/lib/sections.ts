import { foldArabic, lightNormalize } from './arabic';
import { SECTION_ALIASES } from './dictionaries';

const headingKey = (s: string) =>
  foldArabic(lightNormalize(s))
    .toLowerCase()
    .replace(/[:：\-–_=*#|•.]+/g, ' ')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();

const ALIAS = new Map<string, string>();
for (const [section, aliases] of Object.entries(SECTION_ALIASES)) {
  for (const alias of aliases) ALIAS.set(headingKey(alias), section);
}

/** Recognize a section heading, including inline forms like "Skills: React, SQL". */
export function matchHeading(line: string): { section: string; rest: string } | null {
  const key = headingKey(line);
  if (key && key.split(' ').length <= 5) {
    const section = ALIAS.get(key);
    if (section) return { section, rest: '' };
  }
  const inline = line.match(/^([^:：]{2,40})[:：]\s*(.+)$/);
  if (inline) {
    const section = ALIAS.get(headingKey(inline[1]));
    if (section && section !== 'contact') return { section, rest: inline[2].trim() };
  }
  return null;
}

export function splitSections(lines: string[]): { header: string[]; sections: Map<string, string[]> } {
  const header: string[] = [];
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      current = sections.get(heading.section) ?? [];
      sections.set(heading.section, current);
      if (heading.rest) current.push(heading.rest);
    } else if (current) {
      current.push(line);
    } else {
      header.push(line);
    }
  }
  return { header, sections };
}

export function detectSections(lines: string[]): Set<string> {
  return new Set(splitSections(lines).sections.keys());
}
