export const BULLET_RE = /^\s*([••▪◦‣⁃\-*–·▪◦●○■□➢➤►▶✓✔]|\d+[.)])\s+/;
export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
export const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[a-z0-9_%-]+\/?/i;
const URL_RE_G =
  /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|me|co|ai|app|info|site|tech|page|ae|sa|eg|qa|kw|jo|uk|us|de|in)(?:\/[^\s|,()[\]<>"]*)?/gi;

export const stripBullet = (line: string) => line.replace(BULLET_RE, '').trim();

/** Phone numbers: 9–15 digits, excluding things that look like date ranges ("2014 - 2018"). */
export function findPhone(text: string): string | null {
  for (const m of text.matchAll(/\+?\d[\d\s().-]{7,}\d/g)) {
    const candidate = m[0].trim();
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    if (/^(19|20)\d{2}\s*[-–.]\s*(19|20)\d{2}$/.test(candidate)) continue;
    if (/^\d{1,2}[./-]\d{4}/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

export function findUrls(text: string): string[] {
  const withoutEmails = text.replace(new RegExp(EMAIL_RE.source, 'gi'), ' ');
  return [...withoutEmails.matchAll(URL_RE_G)].map((m) => m[0].replace(/[.)]+$/, ''));
}

export function findWebsite(text: string): string {
  return findUrls(text).find((u) => !/linkedin\.com/i.test(u)) ?? '';
}

export function hasContactInfo(line: string): boolean {
  return EMAIL_RE.test(line) || findPhone(line) !== null || findUrls(line).length > 0;
}
