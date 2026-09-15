export type Lang = 'en' | 'ar';

export type TemplateId = 'classic' | 'modern' | 'compact';

export interface Design {
  template: TemplateId;
  font: string;
  accent: string;
}

export interface Personal {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  /** Common on Gulf CVs, discouraged in the US/EU — the report treats it accordingly. */
  nationality: string;
  linkedin: string;
  website: string;
}

export interface Experience {
  id: string;
  jobTitle: string;
  company: string;
  location: string;
  startDate: string; // "MM/YYYY"
  endDate: string; // "MM/YYYY" or "Present"
  bullets: string; // one bullet per line
}

export interface Education {
  id: string;
  degree: string;
  school: string;
  location: string;
  startDate: string;
  endDate: string;
  details: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface Project {
  id: string;
  name: string;
  link: string;
  description: string;
}

export interface CVData {
  language?: Lang;
  design?: Design;
  personal: Personal;
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: string; // comma separated
  certifications: Certification[];
  projects: Project[];
  languages: string; // comma separated
}

export type Severity = 'pass' | 'warn' | 'fail' | 'na';

export interface CheckFix {
  from: string;
  to: string;
}

export type CategoryKey =
  | 'essentials' | 'content' | 'sections' | 'redFlags' | 'discrimination' | 'seniority' | 'tailoring';

export const CATEGORY_ORDER: CategoryKey[] = [
  'essentials', 'content', 'sections', 'redFlags', 'discrimination', 'seniority', 'tailoring',
];

export interface Check {
  id: string;
  category: CategoryKey;
  label: string;
  severity: Severity;
  detail: string;
  weight: number;
  earned: number;
  /** Number of problems found (drives the "N issues" badge). */
  issues: number;
  /** Individual findings, already localized. */
  items: string[];
  /** One-click replacements the builder can apply (e.g. spelling). */
  fixes?: CheckFix[];
}

export interface CategoryScore {
  key: CategoryKey;
  /** 0–100, or null when the category could not be evaluated (e.g. tailoring without a job description). */
  score: number | null;
  issues: number;
}

export interface AnalysisResult {
  score: number;
  parseRate: number;
  categories: CategoryScore[];
  checks: Check[];
  keywords: {
    matched: string[];
    missing: string[];
    matchRate: number | null;
  };
  stats: {
    words: number;
    bullets: number;
    quantified: number;
    actionVerbs: number;
    yearsExperience: number | null;
  };
}
