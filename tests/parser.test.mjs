// Reading a CV: the fields that used to be lost on import, the sections the CV has no field for, and two
// scoring rules that misread ordinary Arabic and ordinary job titles.
import { loadApp, reporter } from './helpers.mjs';

const { ok, done, group } = reporter();
const app = await loadApp(['/src/lib/cvParser.ts', '/src/lib/analyzer.ts', '/src/lib/cvText.ts', '/src/lib/sample.ts']);
const { parseCVText, analyzeCV, seniorityLevel, isGulfLocation, cvToText, emptyCV, sampleCV } = app;

try {
  group('nationality');
  {
    const header = parseCVText('Sara Ahmed\nAccountant\nRiyadh, Saudi Arabia | Nationality: Palestinian\n\nSUMMARY\nAccountant with ten years of experience in audit and reporting for large firms in the region.');
    ok('read from the header line', header.personal.nationality === 'Palestinian', header.personal.nationality);
    // "Personal Details" is routed to the contact section, which the parser never used to read.
    const section = parseCVText('Sara Ahmed\nAccountant\nsara@example.com\n\nPERSONAL DETAILS\nNationality: Palestinian\nDate of birth: 1990\n\nEXPERIENCE\nAccountant\nAcme Ltd');
    ok('read from under a PERSONAL DETAILS heading', section.personal.nationality === 'Palestinian', section.personal.nationality);
    const ar = parseCVText('سارة أحمد\nمحاسبة\n\nالبيانات الشخصية\nالجنسية: فلسطينية\n\nالخبرة العملية\nمحاسبة\nشركة أكمي');
    ok('read from under «البيانات الشخصية»', ar.personal.nationality === 'فلسطينية', ar.personal.nationality);
    ok('never invented when absent', parseCVText('Sara Ahmed\n\nEXPERIENCE\nAccountant\nAcme Ltd').personal.nationality === '');
  }

  group('sections the CV has no field for become the user’s own');
  {
    const cv = parseCVText([
      'Sara Ahmed', 'Accountant', '', 'EXPERIENCE', 'Accountant', 'Acme Ltd', '- Closed the books monthly', '',
      'AWARDS', '• Employee of the Year 2024 — Acme', '• Best audit team 2022', '',
      'VOLUNTEERING', '• Taught accounting basics at a youth centre', '',
      'PUBLICATIONS', '• "Closing faster", Gulf Finance Review, 2023',
    ].join('\n'));
    ok('all three are kept, in order', (cv.extras ?? []).map((e) => e.title).join('|') === 'Awards|Volunteering|Publications', cv.extras);
    const awards = cv.extras.find((e) => e.title === 'Awards');
    ok('every line is kept and bullet glyphs stripped', awards.items.split('\n').length === 2 && !awards.items.includes('•'), awards.items);
    ok('the rest of the CV still parses', cv.experience.length === 1 && cv.personal.fullName === 'Sara Ahmed');
    const ar = parseCVText('سارة أحمد\nمحاسبة\n\nالجوائز\n• موظفة العام ٢٠٢٤\n\nالعمل التطوعي\n• تدريب الطلاب');
    ok('Arabic headings get Arabic titles', (ar.extras ?? []).map((e) => e.title).join('|') === 'الجوائز|العمل التطوعي', ar.extras);
    ok('a CV without them gets none', (parseCVText('Sara Ahmed\n\nEXPERIENCE\nAcme').extras ?? []).length === 0);
    ok('a heading with nothing under it adds nothing', (parseCVText('Sara\n\nAWARDS\n').extras ?? []).length === 0);
  }

  group('extra sections survive the round trip');
  {
    const cv = emptyCV('en');
    cv.personal.fullName = 'Sara Ahmed';
    cv.extras = [{ id: 'x', title: 'Awards', items: 'Employee of the Year 2024\nBest audit team 2022' }];
    const text = cvToText(cv);
    ok('the heading and items reach the text an ATS reads',
      text.includes('AWARDS') && text.includes('Employee of the Year 2024') && text.includes('Best audit team 2022'), text);
    ok('a section with no heading is left out', !cvToText({ ...cv, extras: [{ id: 'y', title: ' ', items: 'orphan' }] }).includes('orphan'));
    ok('a heading with no items is left out', !cvToText({ ...cv, extras: [{ id: 'z', title: 'Memberships', items: '  ' }] }).includes('MEMBERSHIPS'));
    ok('writing then reading keeps the award', (parseCVText(text).extras ?? []).some((e) => e.items.includes('Best audit team 2022')));
    const old = emptyCV('en');
    delete old.extras;
    ok('a CV saved before the field existed still renders', typeof cvToText(old) === 'string');
  }

  group('seniority');
  // "staff" is a junior grade outside engineering ladders, and lead generation is a marketing job.
  for (const [title, want] of [
    ['Staff Accountant', 2], ['Staff Nurse', 2], ['Lead Generation Specialist', 2], ['Principal Teacher', 2],
    ['Staff Software Engineer', 4], ['Tech Lead', 4], ['Lead Developer', 4], ['Principal Architect', 4],
    ['Engineering Manager', 4], ['Senior Accountant', 3], ['Director of Finance', 5], ['CTO', 6],
  ]) ok(`${title} → ${want}`, seniorityLevel(title) === want, seniorityLevel(title));

  group('Gulf locations');
  for (const [loc, want] of [
    ['الرياض', true], ['مسقط، سلطنة عمان', true], ['سلطنة عمان', true], ['Muscat, Oman', true], ['Dubai, UAE', true],
    // Without diacritics «عمان» is both Oman and Amman, and as a location line it is usually the Jordanian capital.
    ['عمان، الأردن', false], ['عمان', false], ['Amman, Jordan', false], ['Bucharest, Romania', false], ['Woman-owned business', false],
  ]) ok(`${loc} → ${want}`, isGulfLocation(loc) === want, isGulfLocation(loc));

  group('«لدى» is not a first-person pronoun');
  {
    const spellingOf = (result) => {
      let found = null;
      const walk = (o) => { if (!o || typeof o !== 'object' || found) return; if (o.id === 'spelling') { found = o; return; } Object.values(o).forEach(walk); };
      walk(result);
      return found;
    };
    const run = (sentence) => spellingOf(analyzeCV(
      `سارة أحمد\nمحاسبة\n\nالملخص\n${sentence}\n\nالخبرة العملية\nمحاسبة\nشركة أكمي\n- أغلقت الحسابات الشهرية`,
      '', { kind: 'paste' }, { lang: 'ar' },
    ));
    // The note reads «ضمائر المتكلم …»; a pattern that misses that plural makes this whole group vacuous.
    const flagged = (check) => (check?.items ?? []).some((i) => /ضمائر|ضمير/.test(String(i)));
    ok('the spelling check exists', Boolean(run('نص عادي.')));
    ok('«خبرة واسعة لدى شركة أرامكو» is not flagged', !flagged(run('محاسبة ذات خبرة واسعة لدى شركة أرامكو في التدقيق.')));
    ok('«لدي خبرة» is still flagged', flagged(run('لدي خبرة واسعة في إعداد التقارير المالية.')));
    ok('«لديّ خبرة» with a shadda is still flagged', flagged(run('لديّ خبرة واسعة في إعداد التقارير المالية.')));
  }

  group('the report still runs end to end');
  {
    const cv = sampleCV('en');
    cv.extras = [{ id: 'x', title: 'Awards', items: 'Employee of the Year 2024' }];
    const result = analyzeCV(cvToText(cv), '', { kind: 'builder' }, { lang: 'en', cv });
    ok('the sample CV scores', typeof result.score === 'number' && result.score > 0, result.score);
    ok('the score stays within 0–100', result.score >= 0 && result.score <= 100, result.score);
  }
} finally {
  await app.close();
}
done();
