// What is asked of the AI, and what is taken from its reply. These guard data loss and data mix-ups that the
// user cannot see: an answer dropped, or one employer's achievements written under another.
import { loadApp, reporter } from './helpers.mjs';

const { ok, done, group } = reporter();
const app = await loadApp(['/src/lib/aiPrompt.ts', '/src/lib/analyzer.ts', '/src/lib/cvText.ts', '/src/lib/sample.ts']);
const { buildAiPrompt, applyAiResponse, gapLines, analyzeCV, cvToText, emptyCV, sampleCV } = app;

const role = (id, jobTitle, company, bullets) => ({ id, jobTitle, company, location: 'Dubai', startDate: '', endDate: '', bullets });
const baseCv = () => {
  const cv = emptyCV('en');
  cv.summary = 'S';
  cv.personal = { ...cv.personal, fullName: 'Sara Ahmed', email: 'sara@example.com', location: 'Dubai, UAE', nationality: '' };
  cv.experience = [role('a', 'Backend Developer', 'Acme', 'acme old'), role('b', 'Team Lead', 'Globex', 'globex old')];
  cv.education = [{ id: 'e1', degree: 'BSc', school: 'MIT', location: '', startDate: '', endDate: '', details: '' }];
  cv.languages = 'English, Arabic';
  return cv;
};
const reply = (obj) => JSON.stringify({ summary: 'S2', ...obj });
const bulletsOf = (cv, company) => cv.experience.find((e) => e.company === company)?.bullets;

try {
  group('replies land on the entry they belong to');
  {
    const swapped = applyAiResponse(baseCv(), reply({ experience: [
      { jobTitle: 'Team Lead', company: 'Globex', bullets: ['GLOBEX NEW'] },
      { jobTitle: 'Backend Developer', company: 'Acme', bullets: ['ACME NEW'] },
    ] }), 'enhance');
    // Same count, different order: pairing by position alone wrote Globex's achievements under Acme, with the
    // company name left in place, so nothing looked wrong.
    ok('a reordered reply keeps each achievement with its employer',
      bulletsOf(swapped.cv, 'Acme') === 'ACME NEW' && bulletsOf(swapped.cv, 'Globex') === 'GLOBEX NEW', swapped.cv.experience);

    const polished = applyAiResponse(baseCv(), reply({ experience: [
      { jobTitle: 'Senior Backend Developer', company: 'Acme', bullets: ['ACME NEW'] },
      { jobTitle: 'Engineering Team Lead', company: 'Globex', bullets: ['GLOBEX NEW'] },
    ] }), 'enhance');
    ok('a reworded job title still pairs by company',
      bulletsOf(polished.cv, 'Acme') === 'ACME NEW' && !polished.warnings.includes('experience'), polished.cv.experience);

    const invented = applyAiResponse(baseCv(), reply({ experience: [
      { jobTitle: 'Backend Developer', company: 'Acme', bullets: ['ACME NEW'] },
      { jobTitle: 'Invented', company: 'Initech', bullets: ['INITECH'] },
    ] }), 'enhance');
    ok('an unknown employer never lands on a real one', bulletsOf(invented.cv, 'Globex') === 'globex old', invented.cv.experience);
    ok('and the user is warned', invented.warnings.includes('experience'), invented.warnings);
  }

  group('translation rewrites what should be translated');
  {
    const cv = { ...baseCv(), language: 'ar' };
    cv.projects = [{ id: 'p', name: 'Payroll app', link: '', description: 'old' }];
    const r = applyAiResponse(cv, reply({
      personal: { location: 'دبي، الإمارات' },
      experience: [
        { jobTitle: 'مطوّر خلفيات', company: 'Acme', bullets: ['إنجاز أكمي'] },
        { jobTitle: 'قائد فريق', company: 'Globex', bullets: ['إنجاز جلوبكس'] },
      ],
      education: [{ degree: 'بكالوريوس', school: 'MIT', details: ['تفصيل'] }],
      projects: [{ name: 'تطبيق الرواتب', description: ['وصف'] }],
      languages: ['الإنجليزية', 'العربية'],
    }), 'translate');
    ok('job titles are translated', r.cv.experience[0].jobTitle === 'مطوّر خلفيات', r.cv.experience[0].jobTitle);
    ok('degrees are translated', r.cv.education[0].degree === 'بكالوريوس', r.cv.education[0].degree);
    ok('company and university names are left alone', r.cv.experience[0].company === 'Acme' && r.cv.education[0].school === 'MIT');
    ok('locations and languages are translated', r.cv.personal.location === 'دبي، الإمارات' && r.cv.languages === 'الإنجليزية، العربية', r.cv.languages);
    ok('translated bullets land by position', bulletsOf(r.cv, 'Globex') === 'إنجاز جلوبكس', r.cv.experience);
    ok('a translated project name still pairs', r.cv.projects[0].description === 'وصف');
    ok('the email is untouched', r.cv.personal.email === 'sara@example.com');
    const blank = applyAiResponse(cv, reply({ experience: [{ jobTitle: '', company: 'Acme', bullets: [] }] }), 'translate');
    ok('a blank translated title keeps the original', blank.cv.experience[0].jobTitle === 'Backend Developer');
  }

  group('a pasted reply fills blanks but never overwrites');
  for (const mode of ['enhance', 'fix', 'interview']) {
    const r = applyAiResponse(baseCv(), reply({
      personal: { nationality: 'Palestinian', website: 'github.com/sara', email: 'other@example.com', fullName: 'Someone Else' },
    }), mode);
    ok(`${mode}: a blank nationality is filled from the reply`, r.cv.personal.nationality === 'Palestinian', r.cv.personal.nationality);
    ok(`${mode}: a blank website is filled`, r.cv.personal.website === 'github.com/sara');
    ok(`${mode}: a written email is kept`, r.cv.personal.email === 'sara@example.com');
    ok(`${mode}: a written name is kept`, r.cv.personal.fullName === 'Sara Ahmed');
  }

  group('what the interview is told to ask about');
  {
    const cv = emptyCV('en');
    cv.personal.fullName = 'Sara Ahmed';
    cv.personal.location = 'Riyadh, Saudi Arabia';
    const gaps = gapLines(cv, 'en').join('\n');
    ok('an empty CV has gaps to ask about', gapLines(cv, 'en').length > 0);
    ok('the website is asked about', /website|github/i.test(gaps), gaps);
    ok('nationality is asked about for a Gulf CV', /nationality/i.test(gaps), gaps);
    const euro = { ...cv, personal: { ...cv.personal, location: 'Berlin, Germany' } };
    ok('...but not for a European one', !/nationality/i.test(gapLines(euro, 'en').join('\n')), gapLines(euro, 'en'));

    const result = analyzeCV(cvToText(cv), '', { kind: 'builder' }, { lang: 'en', cv });
    const prompt = buildAiPrompt({ cv, jobDescription: '', result, uiLang: 'en', mode: 'interview' });
    ok('the assistant is told to offer answer options', /OPTIONS:/.test(prompt), 'no OPTIONS rule');
    ok('one question at a time', /ONE question/i.test(prompt));
    ok('the output shape asks for nationality back', prompt.includes('"nationality"'));
    for (const mode of ['enhance', 'fix', 'translate', 'interview']) {
      const p = buildAiPrompt({ cv, jobDescription: '', result, uiLang: 'en', mode });
      ok(`${mode} mode asks for the full CV shape back`, p.includes('"experience"') && p.includes('"personal"'), mode);
    }
  }

  group('the interview may add what the user supplied');
  {
    const cv = emptyCV('en');
    const filled = applyAiResponse(cv, reply({
      personal: { fullName: 'Sara Ahmed', email: 'sara@example.com' },
      experience: [{ jobTitle: 'Accountant', company: 'Aramco', bullets: ['Closed books'] }],
      certifications: [{ name: 'CPA', issuer: 'AICPA', date: '2022' }],
    }), 'interview');
    ok('an empty CV is filled from the answers', filled.cv.personal.fullName === 'Sara Ahmed' && filled.cv.experience.length === 1, filled.cv.personal);
    ok('a new certification is added', filled.cv.certifications.some((c) => c.name === 'CPA'), filled.cv.certifications);
    const sample = sampleCV('en');
    const untouched = applyAiResponse(sample, reply({ experience: [] }), 'enhance');
    ok('a reply that lists nothing never empties the CV', untouched.cv.experience.length === sample.experience.length);
  }
} finally {
  await app.close();
}
done();
