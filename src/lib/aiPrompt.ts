import type { AnalysisResult, CVData, Lang } from '../types';
import { splitList } from './cvText';
import { cvLang } from './design';
import { uid } from './sample';

// "Enhance with AI": the app writes a prompt the user pastes into any AI assistant, then reads the assistant's JSON
// reply back. Only wording is taken from the reply — facts (names, contact details, employers, dates, degrees,
// certifications, languages) always stay exactly as the user entered them.

const toLines = (s: string) => s.split('\n').map((l) => l.replace(/^[-•*▪●]\s*/, '').trim()).filter(Boolean);
// Bracket-aware, so a skill like "SQL / NoSQL (MySQL, Database Design)" reaches the AI in one piece.
const toList = (s: string) => splitList(s);

function cvForPrompt(cv: CVData) {
  return {
    // Everything the CV holds goes to the assistant, empty fields included, so it can see exactly what is
    // missing. Only `design` (template, font, accent) is left out — it is styling, not CV content.
    language: cvLang(cv),
    personal: { ...cv.personal },
    summary: cv.summary,
    experience: cv.experience.map(({ jobTitle, company, location, startDate, endDate, bullets }) => ({
      jobTitle, company, location, startDate, endDate, bullets: toLines(bullets),
    })),
    education: cv.education.map(({ degree, school, location, startDate, endDate, details }) => ({
      degree, school, location, startDate, endDate, details: toLines(details),
    })),
    skills: toList(cv.skills),
    certifications: cv.certifications.map(({ name, issuer, date }) => ({ name, issuer, date })),
    projects: cv.projects.map(({ name, link, description }) => ({ name, link, description: toLines(description) })),
    languages: toList(cv.languages),
  };
}

const OUTPUT_SHAPE = `{
  "personal": { "fullName": "", "title": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
  "summary": "",
  "experience": [{ "jobTitle": "", "company": "", "location": "", "startDate": "", "endDate": "", "bullets": [""] }],
  "education": [{ "degree": "", "school": "", "location": "", "startDate": "", "endDate": "", "details": [""] }],
  "skills": [""],
  "certifications": [{ "name": "", "issuer": "", "date": "" }],
  "projects": [{ "name": "", "link": "", "description": [""] }],
  "languages": [""],
  "notes": [""]
}`;

/**
 * "enhance" rewrites the CV for ATS; "fix" only repairs the issues the report found;
 * "interview" has the assistant ask the user, one question at a time, for what is still missing.
 */
export type AiMode = 'enhance' | 'fix' | 'interview';

interface PromptInput {
  cv: CVData;
  /** Empty when the prompt should not tailor the CV to a job. */
  jobDescription: string;
  result: AnalysisResult;
  uiLang: Lang;
  mode?: AiMode;
}

/**
 * The report's open issues, worst first, as one readable line each. The limit is high on purpose: an issue that
 * never reaches the prompt can never be fixed, which used to cap the score on CVs with many findings.
 */
export function issueLines(result: AnalysisResult, limit = 40): string[] {
  return result.checks
    .filter((c) => c.severity === 'warn' || c.severity === 'fail')
    .sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned))
    .slice(0, limit)
    .map((c) => `- ${c.label}: ${(c.items.length ? c.items : [c.detail]).join(' ')}`);
}

const DIGIT = /[\d٠-٩۰-۹]/;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * What the CV is still missing, one readable line each. The interview asks only about these, so a section the
 * user already filled in is never questioned again.
 */
export function gapLines(cv: CVData, uiLang: Lang, limit = 14): string[] {
  const ar = uiLang === 'ar';
  const out: string[] = [];

  const contact: string[] = [];
  const need = (value: string, en: string, arabic: string) => { if (!value.trim()) contact.push(ar ? arabic : en); };
  need(cv.personal.fullName, 'full name', 'الاسم الكامل');
  need(cv.personal.title, 'professional title', 'المسمى المهني');
  need(cv.personal.email, 'email address', 'البريد الإلكتروني');
  need(cv.personal.phone, 'phone number', 'رقم الهاتف');
  need(cv.personal.location, 'city and country', 'المدينة والدولة');
  need(cv.personal.linkedin, 'LinkedIn URL', 'رابط LinkedIn');
  if (contact.length) out.push(ar ? `- بيانات ناقصة: ${contact.join('، ')}` : `- Missing details: ${contact.join(', ')}`);

  if (wordCount(cv.summary) < 25) {
    out.push(cv.summary.trim()
      ? (ar
        ? '- الملخص المهني قصير جدًا: يحتاج سنوات الخبرة وأهم المهارات وإنجازًا بارزًا'
        : '- The professional summary is too short: it needs years of experience, core skills and one key achievement')
      : (ar ? '- لا يوجد ملخص مهني' : '- There is no professional summary'));
  }

  if (!cv.experience.length) {
    out.push(ar
      ? '- لا توجد أي خبرة عملية: نحتاج المسمى الوظيفي وجهة العمل والتواريخ وأبرز الإنجازات'
      : '- There is no work experience yet: we need the job title, employer, dates and main achievements');
  } else {
    cv.experience.forEach((e, i) => {
      const label = [e.jobTitle, e.company].filter(Boolean).join(' – ') || (ar ? `الوظيفة رقم ${i + 1}` : `position #${i + 1}`);
      const gaps: string[] = [];
      if (!e.jobTitle.trim()) gaps.push(ar ? 'المسمى الوظيفي' : 'the job title');
      if (!e.company.trim()) gaps.push(ar ? 'اسم جهة العمل' : 'the employer name');
      if (!e.startDate.trim() || !e.endDate.trim()) gaps.push(ar ? 'تواريخ البداية والنهاية (شهر/سنة)' : 'the start and end dates (MM/YYYY)');
      const bullets = toLines(e.bullets);
      if (bullets.length < 3) {
        gaps.push(ar
          ? `إنجازات إضافية (لديها ${bullets.length} والمطلوب 3 على الأقل)`
          : `more achievement bullets (has ${bullets.length}, needs at least 3)`);
      }
      if (bullets.length && !bullets.some((l) => DIGIT.test(l))) {
        gaps.push(ar ? 'رقم واحد على الأقل يقيس الأثر' : 'at least one number that measures the impact');
      }
      if (gaps.length) out.push(ar ? `- ${label}: ${gaps.join('، ')}` : `- ${label}: ${gaps.join(', ')}`);
    });
  }

  if (!cv.education.length) {
    out.push(ar
      ? '- لا يوجد مؤهل علمي: نحتاج الدرجة والجامعة وسنة التخرج'
      : '- There is no education entry: we need the degree, school and graduation year');
  }
  const skills = toList(cv.skills);
  if (skills.length < 8) {
    out.push(ar
      ? `- المهارات قليلة (${skills.length}): نحتاج المهارات التقنية والأدوات التي تستخدمها فعلًا`
      : `- Too few skills (${skills.length}): we need the technical skills and tools actually used`);
  }
  if (!toList(cv.languages).length) out.push(ar ? '- اللغات غير مذكورة' : '- Languages are not listed');
  if (!cv.certifications.length) out.push(ar ? '- لا توجد شهادات مهنية مذكورة (إن وُجدت)' : '- No certifications listed (if any exist)');

  return out.slice(0, limit);
}

export function buildAiPrompt({ cv, jobDescription, result, uiLang, mode = 'enhance' }: PromptInput): string {
  const arabicCv = cvLang(cv) === 'ar';
  const job = jobDescription.trim();
  const issues = issueLines(result);
  const json = JSON.stringify(cvForPrompt(cv), null, 2);

  if (mode === 'fix') {
    const language = uiLang === 'ar' ? (arabicCv ? 'العربية' : 'الإنجليزية') : (arabicCv ? 'Arabic' : 'English');
    return uiLang === 'ar'
      ? [
        'أنت خبير في كتابة السير الذاتية ومتخصص في أنظمة تتبع المتقدمين (ATS).',
        'أصلح كل ملاحظة مذكورة أدناه. لا تمسّ ما لا تتناوله الملاحظات، لكن نفّذ ما تتطلبه الملاحظة كاملًا — بما في ذلك إطالة الأقسام عند الحاجة.',
        '',
        'القواعد',
        '1. حافظ على صحة كل معلومة: لا تخترع جهات عمل أو مسميات أو تواريخ أو شهادات أو أرقامًا.',
        '2. أعِد كل سطر لا تتناوله أي ملاحظة كما هو حرفيًا كما ورد في JSON.',
        '3. لا تغيّر أبدًا: الاسم وبيانات التواصل وجهات العمل والمسميات والتواريخ والمؤهلات والشهادات.',
        '4. إذا طلبت الملاحظة «المزيد» (عدد كلمات قليل، نقاط قليلة، مهارة بلا دليل، قيادة ضعيفة) فيجب أن توسّع فعلًا: أعد كتابة النقاط المعنية أطول وأغنى، وأضف نقاطًا لأي وظيفة لديها أقل من ثلاث، معتمدًا فقط على العمل الموصوف أصلًا في السيرة. بلوغ الهدف المذكور في الملاحظة هو الإصلاح، والاكتفاء بالقليل ليس إصلاحًا.',
        '5. إذا ذكرت الملاحظة مهارات أو كلمات مفتاحية ناقصة، فادمج كل واحدة منها في نقطة تنطبق عليها فعلًا، وأضفها إلى قائمة المهارات. ولا تدّعِ مهارة لا تدعمها السيرة.',
        '6. إن كانت الملاحظة تتطلب رقمًا أو حجم فريق أو بيان تواصل غير موجود في الأصل فلا تخترعه، واكتب سؤالًا في "notes" ليضيفه المستخدم.',
        `7. اكتب كل نصوص السيرة باللغة ${language}، وأبقِ التواريخ كما هي تمامًا.`,
        '8. في "notes" اكتب سطرًا قصيرًا لكل ملاحظة يوضح ما غيّرته، أو سبب تعذّر إصلاحها.',
        ...(job ? ['9. عند إصلاح ملاحظات المواءمة، استخدم كلمات الوظيفة المستهدفة بصياغتها نفسها حيث تنطبق فعلًا.'] : []),
        '',
        'الملاحظات المطلوب إصلاحها',
        ...(issues.length ? issues : ['- لا توجد ملاحظات.']),
        '',
        ...(job ? ['الوظيفة المستهدفة', job, ''] : []),
        'السيرة الذاتية (JSON)',
        json,
        '',
        'المخرجات',
        'أجب بكائن JSON واحد فقط (بدون markdown أو أي تعليق) وبنفس المفاتيح الإنجليزية في هذا الهيكل تمامًا:',
        OUTPUT_SHAPE,
      ].join('\n')
      : [
        'You are an expert CV writer and ATS (Applicant Tracking System) specialist.',
        'Fix every issue listed below. Leave untouched anything the issues do not cover, but do whatever an issue actually requires — including making sections longer.',
        '',
        'RULES',
        '1. Keep every fact true. Do not invent employers, job titles, dates, degrees, certifications or numbers.',
        '2. Return every line that no listed issue touches exactly as it appears in the CV JSON, word for word.',
        '3. Never change: names, contact details, employers, job titles, dates, degrees or certifications.',
        '4. When an issue asks for MORE (too few words, too few bullets, a skill with no evidence, weak leadership), you must genuinely expand: rewrite the affected bullets longer and richer, and add bullets to any role that has fewer than three, using only work the CV already describes. Reaching the target stated in the issue is the fix; staying short is not.',
        '5. When an issue lists missing skills or keywords, weave each one into a bullet where it is genuinely true, and add it to the skills list. Never claim a skill the CV does not support.',
        '6. If an issue needs a number, a team size or a contact detail that is not in the original, do not invent one — add a question to "notes" so the user can supply it.',
        `7. Write all CV text in ${language}. Keep dates exactly as given.`,
        '8. In "notes", add one short line per issue saying what you changed, or why it could not be fixed.',
        ...(job ? ['9. When fixing tailoring issues, use the target job\'s exact wording wherever it truthfully applies.'] : []),
        '',
        'ISSUES TO FIX',
        ...(issues.length ? issues : ['- No issues reported.']),
        '',
        ...(job ? ['TARGET JOB', job, ''] : []),
        'CV (JSON)',
        json,
        '',
        'OUTPUT',
        'Reply with ONLY one JSON object (no markdown, no commentary) using exactly this structure:',
        OUTPUT_SHAPE,
      ].join('\n');
  }

  if (mode === 'interview') {
    const language = uiLang === 'ar' ? (arabicCv ? 'العربية' : 'الإنجليزية') : (arabicCv ? 'Arabic' : 'English');
    const gaps = gapLines(cv, uiLang);
    return uiLang === 'ar'
      ? [
        'أنت خبير في كتابة السير الذاتية ومتخصص في أنظمة تتبع المتقدمين (ATS). ستُجري معي مقابلة قصيرة لإكمال سيرتي الذاتية.',
        '',
        'طريقة إجراء المقابلة',
        '1. اسألني سؤالًا واحدًا فقط في كل رسالة، ثم توقّف وانتظر إجابتي. لا تجمع سؤالين معًا ولا تكمل قبل أن أرد.',
        '2. اسأل فقط عن النواقص المذكورة في قائمة «النواقص» أدناه. لا تسألني إطلاقًا عن أي معلومة موجودة في JSON — اعتبرها نهائية وصحيحة.',
        '3. ابدأ كل سؤال برقمه مثل (١/ن) حيث ن هو عدد النواقص، لأعرف كم بقي.',
        '4. اجعل كل سؤال قصيرًا ومحددًا يمكن الرد عليه بسطر واحد، واذكر مثالًا للإجابة عند الحاجة.',
        '5. إن أجبت «تخطي» فانتقل مباشرة إلى السؤال التالي دون إلحاح.',
        '6. لا تخترع أي معلومة: استخدم إجاباتي فقط. إن لم أعطك رقمًا فلا تضع رقمًا من عندك.',
        '7. يمكنك إعادة صياغة إجابتي لتصبح نقطة إنجاز قوية تبدأ بفعل، لكن دون تغيير الحقائق.',
        `8. اكتب نصوص السيرة النهائية باللغة ${language}، وأبقِ التواريخ بصيغة شهر/سنة.`,
        '9. بعد إجابتي عن السؤال الأخير فقط، أرسل كائن JSON واحدًا يدمج إجاباتي مع السيرة الحالية. لا ترسل JSON قبل ذلك إطلاقًا.',
        '10. اذكر في "notes" أي نقص بقي بلا إجابة.',
        '',
        'النواقص (اسأل عنها فقط، واحدًا تلو الآخر)',
        ...(gaps.length ? gaps : ['- لا توجد نواقص واضحة؛ اسألني عن أرقام تقيس أثر إنجازاتي.']),
        ...(issues.length ? ['', 'ملاحظات تقرير ATS (اسأل عنها أيضًا إن كان إصلاحها يحتاج معلومة مني)', ...issues] : []),
        '',
        ...(job ? ['الوظيفة المستهدفة (استرشد بها في صياغة الأسئلة)', job, ''] : []),
        'السيرة الذاتية الحالية (JSON)',
        json,
        '',
        'المخرجات النهائية (بعد آخر سؤال فقط)',
        'أجب بكائن JSON واحد فقط (بدون markdown أو أي تعليق) وبنفس المفاتيح الإنجليزية في هذا الهيكل تمامًا:',
        OUTPUT_SHAPE,
        '',
        'ابدأ الآن بالسؤال الأول فقط.',
      ].join('\n')
      : [
        'You are an expert CV writer and ATS (Applicant Tracking System) specialist. You are going to interview me to complete my CV.',
        '',
        'HOW TO RUN THE INTERVIEW',
        '1. Ask me ONE question per message, then stop and wait for my answer. Never ask two questions at once and never continue before I reply.',
        '2. Ask ONLY about the items in the GAPS list below. Never ask about anything already present in the CV JSON — treat it as final and correct.',
        '3. Start each question with its number, like (1/N) where N is the number of gaps, so I can see how many are left.',
        '4. Keep each question short and specific, answerable in one line. Give an example answer when it helps.',
        '5. If I answer "skip", move straight to the next question without pressing me.',
        '6. Never invent anything. Use only my answers. If I give you no number, do not supply one yourself.',
        '7. You may rewrite my answer into a strong achievement bullet starting with an action verb, but never change the facts.',
        `8. Write the final CV text in ${language}. Keep dates in MM/YYYY form.`,
        '9. ONLY after I answer the last question, reply with one JSON object merging my answers into the existing CV. Never output JSON before that point.',
        '10. List any gap that stayed unanswered in "notes".',
        '',
        'GAPS (ask about these only, one at a time)',
        ...(gaps.length ? gaps : ['- No obvious gaps; ask me for numbers that measure the impact of my achievements.']),
        ...(issues.length ? ['', 'ATS REPORT ISSUES (also ask about these when fixing one needs information from me)', ...issues] : []),
        '',
        ...(job ? ['TARGET JOB (use it to steer your questions)', job, ''] : []),
        'CURRENT CV (JSON)',
        json,
        '',
        'FINAL OUTPUT (only after the last question)',
        'Reply with ONLY one JSON object (no markdown, no commentary) using exactly this structure:',
        OUTPUT_SHAPE,
        '',
        'Start now with the first question only.',
      ].join('\n');
  }

  if (uiLang === 'ar') {
    const language = arabicCv ? 'العربية' : 'الإنجليزية';
    return [
      'أنت خبير في كتابة السير الذاتية ومتخصص في أنظمة تتبع المتقدمين (ATS).',
      `حسّن السيرة الذاتية أدناه لترتفع درجتها في فرز أنظمة ATS وتكون مقنعة لمسؤولي التوظيف.${job ? ' وواءمها مع الوظيفة المستهدفة.' : ''}`,
      '',
      'القواعد',
      '1. حافظ على صحة كل معلومة: لا تخترع جهات عمل أو مسميات أو تواريخ أو شهادات أو أرقامًا. أبقِ الإدخالات نفسها بالترتيب نفسه.',
      '2. يمكنك إعادة صياغة: المسمى المهني (فقط إن كان دقيقًا)، الملخص، نقاط الإنجازات، قائمة المهارات، وأوصاف المشاريع.',
      '3. الملخص: من 2 إلى 4 جمل تذكر سنوات الخبرة وأهم المهارات وإنجازًا بارزًا، بدون ضمائر المتكلم.',
      '4. النقاط: من 3 إلى 6 لكل وظيفة، تبدأ كل منها بفعل إنجاز قوي، بحد أقصى 30 كلمة، مع نتيجة قابلة للقياس. إن لم يكن الرقم موجودًا في الأصل فلا تخترعه، واكتب سؤالًا في "notes" ليضيف المستخدم الرقم الحقيقي.',
      '5. المهارات: اذكر فقط المهارات التي تدعمها السيرة، واذكر كل مهارة مهمة في نقطة واحدة على الأقل حيث يكون ذلك صحيحًا.',
      '6. تجنب العبارات المستهلكة وضمائر المتكلم والبيانات الشخصية (العمر، الحالة الاجتماعية، الصورة).',
      `7. اكتب كل نصوص السيرة باللغة ${language}، وأبقِ التواريخ كما هي تمامًا.`,
      ...(job ? ['8. استخدم الكلمات المفتاحية الواردة في الوظيفة المستهدفة بصياغتها نفسها حيث تنطبق فعلًا.'] : []),
      '',
      ...(issues.length ? ['مشكلات ATS الحالية المطلوب إصلاحها', ...issues, ''] : []),
      ...(job ? ['الوظيفة المستهدفة', job, ''] : []),
      'السيرة الذاتية (JSON)',
      json,
      '',
      'المخرجات',
      'أجب بكائن JSON واحد فقط (بدون markdown أو أي تعليق) وبنفس المفاتيح الإنجليزية في هذا الهيكل تمامًا:',
      OUTPUT_SHAPE,
    ].join('\n');
  }

  const language = arabicCv ? 'Arabic' : 'English';
  return [
    'You are an expert CV writer and ATS (Applicant Tracking System) specialist.',
    `Improve the CV below so it scores higher in ATS screening and persuades recruiters.${job ? ' Tailor it to the target job.' : ''}`,
    '',
    'RULES',
    '1. Keep every fact true. Do not invent employers, job titles, dates, degrees, certifications or numbers. Keep the same entries in the same order.',
    '2. You may rewrite: the professional title (only when accurate), the summary, achievement bullets, the skills list and project descriptions.',
    '3. Summary: 2–4 sentences with years of experience, core skills and one key achievement. No first-person pronouns.',
    '4. Bullets: 3–6 per role, each starting with a strong past-tense action verb, at most 30 words, with a measurable result. If a number is not in the original, do not make one up — add a question to "notes" so the user can supply the real figure.',
    '5. Skills: list only skills the CV supports, and mention each important skill in at least one bullet where it is true.',
    '6. Avoid clichés (hard worker, team player, results-driven), first-person pronouns and personal data (age, marital status, photo).',
    `7. Write all CV text in ${language}. Keep dates exactly as given.`,
    ...(job ? ['8. Use the exact keywords from the target job wherever they truthfully apply.'] : []),
    '',
    ...(issues.length ? ['CURRENT ATS ISSUES TO FIX', ...issues, ''] : []),
    ...(job ? ['TARGET JOB', job, ''] : []),
    'CV (JSON)',
    json,
    '',
    'OUTPUT',
    'Reply with ONLY one JSON object (no markdown, no commentary) using exactly this structure:',
    OUTPUT_SHAPE,
  ].join('\n');
}

export type AiErrorCode = 'no-json' | 'invalid';

export class AiResponseError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Find and parse the JSON object in an AI reply (plain, fenced in ```json, or surrounded by commentary). */
export function extractJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const candidate of [fenced, text]) {
    if (!candidate) continue;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    const raw = candidate.slice(start, end + 1);
    for (const attempt of [raw, raw.replace(/,\s*([}\]])/g, '$1')]) {
      try {
        const value = JSON.parse(attempt);
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
      } catch { /* try the next form */ }
    }
  }
  throw new AiResponseError(text.includes('{') ? 'invalid' : 'no-json');
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const lines = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : toLines(str(v));
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : toList(str(v));
const objects = (v: unknown): Obj[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Obj[]) : [];
const same = (a: unknown, b: string) => str(a).toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** Pair each original entry with the AI's entry: by position when counts match, otherwise by matching fields. */
function pair<T>(original: T[], ai: Obj[], matches: (o: T, a: Obj) => boolean): { matched: (Obj | undefined)[]; mismatch: boolean } {
  if (ai.length === original.length) return { matched: ai, mismatch: false };
  return { matched: original.map((o) => ai.find((a) => matches(o, a))), mismatch: ai.length > 0 };
}

export interface AiApplyResult {
  cv: CVData;
  notes: string[];
  warnings: ('experience' | 'projects')[];
}

export function applyAiResponse(original: CVData, reply: string, mode: AiMode = 'enhance'): AiApplyResult {
  const d = extractJsonObject(reply);
  if (!('summary' in d) && !('experience' in d) && !('skills' in d)) throw new AiResponseError('invalid');
  const sep = cvLang(original) === 'ar' ? '، ' : ', ';
  const warnings: AiApplyResult['warnings'] = [];
  // The interview collects facts the user supplied themselves, so it may fill empty fields and add new entries.
  // It still never overwrites anything the user already wrote.
  const fill = mode === 'interview';
  /** Keep what the user wrote; take the AI's value only for a field they left empty. */
  const keep = (mine: string, theirs: unknown) => (fill && !mine.trim() ? str(theirs) || mine : mine);
  const extras = (ai: Obj[], matched: (Obj | undefined)[]) => (fill ? ai.filter((a) => !matched.includes(a)) : []);

  const personal = d.personal && typeof d.personal === 'object' ? (d.personal as Obj) : {};
  const aiExp = objects(d.experience);
  const exp = pair(original.experience, aiExp, (o, a) => same(a.company, o.company) && same(a.jobTitle, o.jobTitle));
  if (exp.mismatch && !fill) warnings.push('experience');
  const aiProj = objects(d.projects);
  const proj = pair(original.projects, aiProj, (o, a) => same(a.name, o.name));
  if (proj.mismatch && !fill) warnings.push('projects');
  const aiEdu = objects(d.education);
  const edu = pair(original.education, aiEdu, (o, a) => same(a.school, o.school));
  const skills = list(d.skills);

  const cv: CVData = {
    ...original,
    personal: {
      ...original.personal,
      title: str(personal.title) || original.personal.title,
      fullName: keep(original.personal.fullName, personal.fullName),
      email: keep(original.personal.email, personal.email),
      phone: keep(original.personal.phone, personal.phone),
      location: keep(original.personal.location, personal.location),
      linkedin: keep(original.personal.linkedin, personal.linkedin),
      website: keep(original.personal.website, personal.website),
    },
    summary: str(d.summary) || original.summary,
    experience: [
      ...original.experience.map((e, i) => {
        const a = exp.matched[i];
        const bullets = lines(a?.bullets);
        return {
          ...e,
          jobTitle: keep(e.jobTitle, a?.jobTitle),
          company: keep(e.company, a?.company),
          location: keep(e.location, a?.location),
          startDate: keep(e.startDate, a?.startDate),
          endDate: keep(e.endDate, a?.endDate),
          bullets: bullets.length ? bullets.join('\n') : e.bullets,
        };
      }),
      ...extras(aiExp, exp.matched)
        .filter((a) => str(a.jobTitle) || str(a.company))
        .map((a) => ({
          id: uid(),
          jobTitle: str(a.jobTitle), company: str(a.company), location: str(a.location),
          startDate: str(a.startDate), endDate: str(a.endDate), bullets: lines(a.bullets).join('\n'),
        })),
    ],
    education: [
      ...original.education.map((e, i) => {
        const a = edu.matched[i];
        const details = lines(a?.details);
        return {
          ...e,
          degree: keep(e.degree, a?.degree),
          school: keep(e.school, a?.school),
          location: keep(e.location, a?.location),
          startDate: keep(e.startDate, a?.startDate),
          endDate: keep(e.endDate, a?.endDate),
          details: details.length ? details.join('\n') : e.details,
        };
      }),
      ...extras(aiEdu, edu.matched)
        .filter((a) => str(a.degree) || str(a.school))
        .map((a) => ({
          id: uid(),
          degree: str(a.degree), school: str(a.school), location: str(a.location),
          startDate: str(a.startDate), endDate: str(a.endDate), details: lines(a.details).join('\n'),
        })),
    ],
    skills: skills.length ? skills.join(sep) : original.skills,
    certifications: fill
      ? [
        ...original.certifications,
        ...objects(d.certifications)
          .filter((a) => str(a.name) && !original.certifications.some((c) => same(a.name, c.name)))
          .map((a) => ({ id: uid(), name: str(a.name), issuer: str(a.issuer), date: str(a.date) })),
      ]
      : original.certifications,
    projects: [
      ...original.projects.map((p, i) => {
        const description = lines(proj.matched[i]?.description);
        return description.length ? { ...p, description: description.join('\n') } : p;
      }),
      ...extras(aiProj, proj.matched)
        .filter((a) => str(a.name))
        .map((a) => ({ id: uid(), name: str(a.name), link: str(a.link), description: lines(a.description).join('\n') })),
    ],
    languages: keep(original.languages, list(d.languages).join(sep)),
  };
  return { cv, notes: lines(d.notes), warnings };
}
