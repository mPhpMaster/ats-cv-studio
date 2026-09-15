import type { Lang } from '../types';

/**
 * Starter job descriptions for the checker, so tailoring can be tried before a real posting is at hand.
 *
 * Written for this app rather than copied from job boards: real postings are someone else's text, and
 * pasting them into a shipped product would carry their wording with it. These are deliberately generic —
 * the UI says so — because a made-up posting can only ever be a rehearsal for the real one.
 *
 * Each one is shaped the way the checker reads a posting: the title on the first line, then requirements
 * dense with the concrete nouns (tools, methods, qualifications) that keyword matching looks for.
 */
export interface JobPreset {
  id: string;
  label: Record<Lang, string>;
  text: Record<Lang, string>;
}

export const JOB_PRESETS: JobPreset[] = [
  {
    id: 'frontend',
    label: { en: 'Frontend developer', ar: 'مطوّر واجهات أمامية' },
    text: {
      en: [
        'Senior Frontend Developer',
        '',
        'We are looking for a senior frontend developer to build and maintain responsive web applications.',
        '',
        'Responsibilities',
        '- Build accessible, responsive interfaces with React and TypeScript.',
        '- Turn designs into components, and keep a shared component library consistent.',
        '- Integrate REST and GraphQL APIs, and handle loading, error and empty states.',
        '- Improve Core Web Vitals: bundle size, lazy loading, caching and rendering performance.',
        '- Write unit and end-to-end tests, and review other developers’ pull requests.',
        '',
        'Requirements',
        '- 5+ years of frontend development, including 3+ with React.',
        '- Strong JavaScript, TypeScript, HTML and CSS.',
        '- Experience with state management, build tooling (Vite or Webpack) and Git.',
        '- Familiarity with accessibility standards (WCAG) and cross-browser testing.',
        '- Bachelor’s degree in computer science or equivalent experience.',
      ].join('\n'),
      ar: [
        'مطوّر واجهات أمامية أول',
        '',
        'نبحث عن مطوّر واجهات أمامية أول لبناء تطبيقات ويب متجاوبة وصيانتها.',
        '',
        'المهام',
        '- بناء واجهات متجاوبة وسهلة الوصول باستخدام React وTypeScript.',
        '- تحويل التصاميم إلى مكوّنات، والحفاظ على اتساق مكتبة المكوّنات المشتركة.',
        '- ربط واجهات REST وGraphQL، ومعالجة حالات التحميل والخطأ والفراغ.',
        '- تحسين مؤشرات الأداء: حجم الحزمة، والتحميل المؤجّل، والتخزين المؤقت، وسرعة العرض.',
        '- كتابة اختبارات الوحدة والاختبارات الشاملة، ومراجعة طلبات الدمج.',
        '',
        'المتطلبات',
        '- خبرة 5 سنوات فأكثر في تطوير الواجهات، منها 3 سنوات مع React.',
        '- إتقان JavaScript وTypeScript وHTML وCSS.',
        '- خبرة في إدارة الحالة وأدوات البناء (Vite أو Webpack) وGit.',
        '- معرفة بمعايير سهولة الوصول (WCAG) واختبار المتصفحات المختلفة.',
        '- بكالوريوس في علوم الحاسب أو خبرة معادلة.',
      ].join('\n'),
    },
  },
  {
    id: 'fullstack',
    label: { en: 'Full-stack developer', ar: 'مطوّر full-stack' },
    text: {
      en: [
        'Full Stack Developer',
        '',
        'We are looking for a full stack developer comfortable across both frontend and backend work.',
        '',
        'Responsibilities',
        '- Design, build and ship features end to end, from database schema to user interface.',
        '- Develop and document REST APIs, and model relational data.',
        '- Write automated tests and take part in code review.',
        '- Deploy through CI/CD pipelines and monitor services in production.',
        '- Work with product and design from concept through to release.',
        '',
        'Requirements',
        '- 4+ years building web applications.',
        '- Frontend: JavaScript or TypeScript with React, Vue or Angular.',
        '- Backend: Node.js, Python, PHP or Java, with SQL databases such as PostgreSQL or MySQL.',
        '- Experience with Git, Docker and a cloud platform (AWS, Azure or Google Cloud).',
        '- Bachelor’s degree in computer science, software engineering or equivalent experience.',
      ].join('\n'),
      ar: [
        'مطوّر full-stack',
        '',
        'نبحث عن مطوّر full-stack يتقن العمل على الواجهات الأمامية والخلفية معًا.',
        '',
        'المهام',
        '- تصميم الميزات وبناؤها وإطلاقها كاملةً، من بنية قاعدة البيانات إلى واجهة المستخدم.',
        '- تطوير واجهات REST وتوثيقها، ونمذجة البيانات العلائقية.',
        '- كتابة اختبارات آلية والمشاركة في مراجعة الشيفرة.',
        '- النشر عبر مسارات CI/CD ومراقبة الخدمات في بيئة الإنتاج.',
        '- العمل مع فريقي المنتج والتصميم من الفكرة حتى الإطلاق.',
        '',
        'المتطلبات',
        '- خبرة 4 سنوات فأكثر في بناء تطبيقات الويب.',
        '- الواجهة الأمامية: JavaScript أو TypeScript مع React أو Vue أو Angular.',
        '- الواجهة الخلفية: Node.js أو Python أو PHP أو Java، مع قواعد بيانات SQL مثل PostgreSQL أو MySQL.',
        '- خبرة في Git وDocker وإحدى منصات السحابة (AWS أو Azure أو Google Cloud).',
        '- بكالوريوس في علوم الحاسب أو هندسة البرمجيات أو خبرة معادلة.',
      ].join('\n'),
    },
  },
  {
    id: 'accountant',
    label: { en: 'Accountant', ar: 'محاسب' },
    text: {
      en: [
        'Senior Accountant',
        '',
        'We are looking for a senior accountant to own the monthly close and financial reporting.',
        '',
        'Responsibilities',
        '- Prepare monthly, quarterly and annual financial statements.',
        '- Run the month-end close: journal entries, accruals and account reconciliations.',
        '- Manage accounts payable and receivable, and monitor cash flow.',
        '- Prepare VAT and tax filings and support external audits.',
        '- Help build budgets and forecasts, and explain variances against them.',
        '',
        'Requirements',
        '- 5+ years in accounting, with experience owning a month-end close.',
        '- Bachelor’s degree in accounting or finance; CPA, ACCA or CMA is an advantage.',
        '- Strong Excel, and hands-on ERP experience (SAP, Oracle, QuickBooks or Xero).',
        '- Working knowledge of IFRS and local tax and VAT regulations.',
        '- Accuracy, and the ability to meet reporting deadlines.',
      ].join('\n'),
      ar: [
        'محاسب أول',
        '',
        'نبحث عن محاسب أول يتولّى الإقفال الشهري والتقارير المالية.',
        '',
        'المهام',
        '- إعداد القوائم المالية الشهرية والربعية والسنوية.',
        '- تنفيذ الإقفال الشهري: القيود اليومية والمستحقات وتسويات الحسابات.',
        '- إدارة الذمم الدائنة والمدينة، ومتابعة التدفق النقدي.',
        '- إعداد إقرارات ضريبة القيمة المضافة والضرائب ودعم التدقيق الخارجي.',
        '- المساعدة في إعداد الموازنات والتنبؤات وتفسير الانحرافات عنها.',
        '',
        'المتطلبات',
        '- خبرة 5 سنوات فأكثر في المحاسبة، تشمل تولّي الإقفال الشهري.',
        '- بكالوريوس محاسبة أو مالية؛ ويُفضّل CPA أو ACCA أو CMA.',
        '- إتقان Excel، وخبرة عملية بأنظمة ERP مثل SAP أو Oracle أو QuickBooks أو Xero.',
        '- إلمام بمعايير IFRS وأنظمة الضرائب وضريبة القيمة المضافة المحلية.',
        '- الدقة، والقدرة على الالتزام بمواعيد التقارير.',
      ].join('\n'),
    },
  },
  {
    id: 'marketing',
    label: { en: 'Digital marketing', ar: 'تسويق رقمي' },
    text: {
      en: [
        'Digital Marketing Specialist',
        '',
        'We are looking for a digital marketing specialist to plan and run campaigns across paid and organic channels.',
        '',
        'Responsibilities',
        '- Plan, launch and optimise paid campaigns on Google Ads and social platforms.',
        '- Own SEO: keyword research, on-page optimisation and content planning.',
        '- Run email marketing and marketing automation, including segmentation and A/B tests.',
        '- Report on CAC, ROAS, conversion rate and channel performance.',
        '- Work with design and content to produce campaign assets.',
        '',
        'Requirements',
        '- 3+ years in digital marketing with hands-on campaign ownership.',
        '- Google Analytics, Google Ads, Meta Ads Manager and an email platform such as Mailchimp or HubSpot.',
        '- Comfortable with spreadsheets and reporting on budget against results.',
        '- Bachelor’s degree in marketing, business or a related field.',
        '- Strong written communication in English; Arabic is an advantage.',
      ].join('\n'),
      ar: [
        'أخصائي تسويق رقمي',
        '',
        'نبحث عن أخصائي تسويق رقمي لتخطيط الحملات وتنفيذها عبر القنوات المدفوعة والمجانية.',
        '',
        'المهام',
        '- تخطيط الحملات المدفوعة وإطلاقها وتحسينها على Google Ads ومنصات التواصل.',
        '- تولّي تحسين محركات البحث: بحث الكلمات المفتاحية، وتحسين الصفحات، وتخطيط المحتوى.',
        '- إدارة التسويق بالبريد والأتمتة التسويقية، بما يشمل التقسيم واختبارات A/B.',
        '- إعداد تقارير عن تكلفة الاكتساب والعائد على الإنفاق الإعلاني ومعدل التحويل وأداء القنوات.',
        '- العمل مع فريقي التصميم والمحتوى لإنتاج مواد الحملات.',
        '',
        'المتطلبات',
        '- خبرة 3 سنوات فأكثر في التسويق الرقمي مع تولٍّ فعلي للحملات.',
        '- إتقان Google Analytics وGoogle Ads وMeta Ads Manager ومنصة بريد مثل Mailchimp أو HubSpot.',
        '- إتقان الجداول الحسابية وإعداد تقارير الميزانية مقابل النتائج.',
        '- بكالوريوس في التسويق أو إدارة الأعمال أو تخصص قريب.',
        '- مهارات كتابة قوية بالإنجليزية، والعربية ميزة إضافية.',
      ].join('\n'),
    },
  },
  {
    id: 'admin',
    label: { en: 'Administrative assistant', ar: 'مساعد إداري' },
    text: {
      en: [
        'Administrative Assistant',
        '',
        'We are looking for an organised administrative assistant to support daily office operations.',
        '',
        'Responsibilities',
        '- Manage calendars, schedule meetings and arrange travel.',
        '- Prepare correspondence, reports and presentations.',
        '- Maintain filing systems and keep records accurate and up to date.',
        '- Handle incoming calls and email, and greet visitors.',
        '- Track office supplies, process expense claims and support invoicing.',
        '',
        'Requirements',
        '- 2+ years in an administrative or office support role.',
        '- Strong Microsoft Office skills: Word, Excel, PowerPoint and Outlook.',
        '- Excellent written and spoken communication in Arabic and English.',
        '- Ability to prioritise and handle confidential information discreetly.',
        '- Diploma or bachelor’s degree in business administration or a related field.',
      ].join('\n'),
      ar: [
        'مساعد إداري',
        '',
        'نبحث عن مساعد إداري منظّم لدعم العمليات اليومية في المكتب.',
        '',
        'المهام',
        '- إدارة المواعيد وجدولة الاجتماعات وترتيب السفر.',
        '- إعداد المراسلات والتقارير والعروض التقديمية.',
        '- حفظ الملفات والحفاظ على دقة السجلات وتحديثها.',
        '- الرد على المكالمات والبريد الوارد واستقبال الزوّار.',
        '- متابعة لوازم المكتب ومعالجة مطالبات المصروفات ودعم إصدار الفواتير.',
        '',
        'المتطلبات',
        '- خبرة سنتين فأكثر في العمل الإداري أو الدعم المكتبي.',
        '- إتقان Microsoft Office: Word وExcel وPowerPoint وOutlook.',
        '- مهارات تواصل كتابية وشفهية ممتازة بالعربية والإنجليزية.',
        '- القدرة على ترتيب الأولويات والتعامل مع المعلومات السرية بتكتّم.',
        '- دبلوم أو بكالوريوس في إدارة الأعمال أو تخصص قريب.',
      ].join('\n'),
    },
  },
];

/**
 * Asks an AI to write a posting for a title the user typed. Kept next to the presets because it answers the
 * same need — and because the instructions matter: a description invented for tailoring must read like a real
 * posting, or the keyword matching it feeds is measuring nothing.
 */
export function buildJobDescriptionPrompt(title: string, lang: Lang): string {
  const clean = title.trim();
  return lang === 'ar'
    ? [
      `اكتب إعلان وظيفة واقعيًا لمسمى: ${clean}`,
      '',
      'القواعد',
      '1. ابدأ بالمسمى الوظيفي في السطر الأول وحده.',
      '2. ثم فقرة تعريفية قصيرة، ثم قسم «المهام» وقسم «المتطلبات» بنقاط.',
      '3. اذكر الأدوات والتقنيات والمؤهلات بأسمائها الصريحة كما تُكتب في إعلانات الوظائف الحقيقية.',
      '4. اذكر سنوات الخبرة المطلوبة والشهادات المعتادة لهذا المسمى.',
      '5. لا تذكر اسم شركة بعينها ولا راتبًا ولا موقعًا جغرافيًا.',
      '6. أجب بنصّ الإعلان فقط، بلا مقدمات ولا تعليق ولا تنسيق markdown.',
    ].join('\n')
    : [
      `Write a realistic job posting for this title: ${clean}`,
      '',
      'RULES',
      '1. Start with the job title alone on the first line.',
      '2. Then a short intro paragraph, then a "Responsibilities" section and a "Requirements" section, both as bullets.',
      '3. Name the tools, technologies and qualifications explicitly, the way real postings do.',
      '4. State the years of experience expected and the certifications usual for this role.',
      '5. Do not name a specific company, a salary or a location.',
      '6. Reply with the posting text only — no preamble, no commentary, no markdown.',
    ].join('\n');
}
