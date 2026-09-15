import type { CVData, Lang } from '../types';
import { defaultDesign } from './design';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const emptyCV = (lang: Lang = 'en'): CVData => ({
  language: lang,
  design: defaultDesign(lang),
  personal: { fullName: '', title: '', email: '', phone: '', location: '', linkedin: '', website: '' },
  summary: '',
  experience: [],
  education: [],
  skills: '',
  certifications: [],
  projects: [],
  languages: '',
});

// The samples are written to pass every check without a job description (100/100): 450+ words, 3–6 bullets per role,
// every listed skill shown in use, varied verbs and wording, and a number in each achievement.
const sampleEn = (): CVData => ({
  ...emptyCV('en'),
  personal: {
    fullName: 'Sara Ahmed',
    title: 'Senior Frontend Developer',
    email: 'sara.ahmed@example.com',
    phone: '+971 50 123 4567',
    location: 'Dubai, UAE',
    linkedin: 'linkedin.com/in/sara-ahmed',
    website: 'github.com/saraahmed',
  },
  summary:
    'Senior Frontend Developer with 7 years of experience building fast, accessible web applications with React, TypeScript and Next.js. Led teams of up to 5 engineers, shipped a design system adopted across the company and improved checkout conversion by 14% through performance work, careful testing and close collaboration with product managers and designers. Known for turning complex requirements into simple, reliable interfaces and for raising engineering standards across every team.',
  experience: [
    {
      id: uid(),
      jobTitle: 'Senior Frontend Developer',
      company: 'Noon Tech',
      location: 'Dubai, UAE',
      startDate: '03/2021',
      endDate: 'Present',
      bullets: [
        'Led a team of 5 engineers to rebuild the checkout in React and TypeScript, increasing conversion by 14% and average order value by 6% across 9 A/B tests',
        'Reduced page load time by 42% through code splitting, image optimization and caching, keeping Lighthouse scores above 95 on 20 key screens',
        'Built a shared component library with Tailwind CSS used by 12 product teams, cutting UI development time by 30%',
        'Implemented CI/CD pipelines with GitHub Actions and Git branch protection, shortening releases from 2 days to 3 hours',
        'Designed a GraphQL layer over 6 REST API services, removing 40% of duplicate network calls on mobile',
        'Mentored 4 junior developers through weekly code reviews and pairing sessions; 2 of them were promoted within a year',
      ].join('\n'),
    },
    {
      id: uid(),
      jobTitle: 'Frontend Developer',
      company: 'Careem',
      location: 'Dubai, UAE',
      startDate: '06/2018',
      endDate: '02/2021',
      bullets: [
        'Developed customer-facing booking features in React and Redux for an app with 2M+ monthly users in 10 cities',
        'Wrote unit and integration tests with Jest, raising test coverage from 35% to 80%',
        'Collaborated with designers to deliver WCAG 2.1 AA accessible interfaces in 3 languages, including full right-to-left support for Arabic',
        'Migrated 150+ legacy JavaScript, HTML and CSS templates to reusable components, trimming bundle weight by 25%',
        'Created a Node.js service for server-side rendering that grew search traffic by 18% in 6 months',
        'Automated visual regression checks for 60 views, lowering production bugs by 35%',
      ].join('\n'),
    },
  ],
  education: [
    {
      id: uid(),
      degree: 'B.Sc. Computer Science',
      school: 'American University of Sharjah',
      location: 'Sharjah, UAE',
      startDate: '09/2014',
      endDate: '06/2018',
      details: 'GPA 3.7/4.0',
    },
  ],
  skills: 'JavaScript, TypeScript, React, Next.js, Redux, HTML, CSS, Tailwind CSS, Node.js, REST API, GraphQL, Jest, CI/CD, Git, Agile, Scrum',
  certifications: [
    { id: uid(), name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services', date: '2023' },
    { id: uid(), name: 'Certified ScrumMaster (CSM)', issuer: 'Scrum Alliance', date: '2022' },
  ],
  projects: [
    {
      id: uid(),
      name: 'Open-source form validation library',
      link: 'github.com/saraahmed/formkit',
      description: [
        'Maintained a TypeScript validation library with 1,500+ GitHub stars and 40 contributors from 15 countries',
        'Published 12 releases with detailed release notes and 98% test coverage',
      ].join('\n'),
    },
    {
      id: uid(),
      name: 'Accessible dashboard starter',
      link: '',
      description: 'Launched an accessible dashboard starter kit that other teams have downloaded more than 8,000 times',
    },
    {
      id: uid(),
      name: 'Community talks',
      link: '',
      description: 'Presented 6 talks on web performance and accessibility at Dubai meetups with 300+ attendees',
    },
  ],
  languages: 'English (Fluent), Arabic (Native)',
});

const sampleAr = (): CVData => ({
  ...emptyCV('ar'),
  personal: {
    fullName: 'سارة أحمد',
    title: 'مطورة واجهات أمامية أولى',
    email: 'sara.ahmed@example.com',
    phone: '+971 50 123 4567',
    location: 'دبي، الإمارات العربية المتحدة',
    linkedin: 'linkedin.com/in/sara-ahmed',
    website: 'github.com/saraahmed',
  },
  summary:
    'مطورة واجهات أمامية أولى بخبرة 7 سنوات في بناء تطبيقات ويب سريعة وسهلة الاستخدام بتقنيات React وTypeScript وNext.js. قيادة فرق تضم حتى 5 مهندسين، وإطلاق نظام تصميم تعتمد عليه الشركة بأكملها، ورفع معدل التحويل في صفحة الدفع 14% من خلال تحسين الأداء والاختبار الدقيق والتعاون الوثيق مع مديري المنتجات والمصممين. تتميز بتحويل المتطلبات المعقدة إلى حلول بسيطة وموثوقة، ورفع معايير الجودة الهندسية في كل فريق تنضم إليه.',
  experience: [
    {
      id: uid(),
      jobTitle: 'مطورة واجهات أمامية أولى',
      company: 'نون تك',
      location: 'دبي، الإمارات',
      startDate: '03/2021',
      endDate: 'حتى الآن',
      bullets: [
        'قيادة فريق من 5 مهندسين لإعادة بناء صفحة الدفع بتقنيتي React وTypeScript، ليرتفع معدل التحويل 14% ومتوسط قيمة الطلب 6% في 9 اختبارات A/B',
        'خفض زمن تحميل الصفحات 42% عبر تقسيم الشيفرة وضغط الصور والتخزين المؤقت، مع الحفاظ على نتائج Lighthouse فوق 95 في 20 شاشة رئيسية',
        'بناء مكتبة مكونات مشتركة بإطار Tailwind CSS يعتمد عليها 12 فريقًا، فانخفض وقت تطوير الواجهات 30%',
        'تطبيق مسارات CI/CD بواسطة GitHub Actions مع حماية فروع Git، وتقليص مدة الإصدار من يومين إلى 3 ساعات',
        'تصميم طبقة GraphQL فوق 6 خدمات REST API ألغت 40% من طلبات الشبكة المكررة على الجوال',
        'توجيه 4 مطورين مبتدئين بمراجعات أسبوعية للشيفرة وجلسات برمجة ثنائية، تمت ترقية اثنين منهم خلال عام',
      ].join('\n'),
    },
    {
      id: uid(),
      jobTitle: 'مطورة واجهات أمامية',
      company: 'كريم',
      location: 'دبي، الإمارات',
      startDate: '06/2018',
      endDate: '02/2021',
      bullets: [
        'تطوير ميزات حجز للعملاء بمكتبتي React وRedux لتطبيق يضم أكثر من 2 مليون مستخدم شهريًا في 10 مدن',
        'كتابة اختبارات الوحدات والتكامل بأداة Jest، ورفع نسبة تغطية الشيفرة من 35% إلى 80%',
        'التعاون مع المصممين لتقديم واجهات متوافقة مع معايير الوصول WCAG 2.1 AA بثلاث لغات، مع دعم كامل للكتابة من اليمين إلى اليسار',
        'ترحيل أكثر من 150 قالبًا قديمًا مكتوبًا بلغات JavaScript وHTML وCSS إلى مكونات قابلة لإعادة الاستخدام، مع تقليل حجم الحزم 25%',
        'إنشاء خدمة Node.js للعرض من جانب الخادم زادت زيارات محركات البحث بنسبة 18% خلال 6 أشهر',
        'أتمتة فحوص الانحدار البصري لـ 60 شاشة، ما قلل أخطاء الإنتاج بنسبة 35%',
      ].join('\n'),
    },
  ],
  education: [
    {
      id: uid(),
      degree: 'بكالوريوس علوم الحاسوب',
      school: 'الجامعة الأمريكية في الشارقة',
      location: 'الشارقة، الإمارات',
      startDate: '09/2014',
      endDate: '06/2018',
      details: 'المعدل التراكمي 3.7 من 4.0',
    },
  ],
  skills: 'JavaScript، TypeScript، React، Next.js، Redux، HTML، CSS، Tailwind CSS، Node.js، REST API، GraphQL، Jest، CI/CD، Git، Agile، Scrum',
  certifications: [
    { id: uid(), name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services', date: '2023' },
    { id: uid(), name: 'Certified ScrumMaster (CSM)', issuer: 'Scrum Alliance', date: '2022' },
  ],
  projects: [
    {
      id: uid(),
      name: 'مكتبة مفتوحة المصدر للتحقق من النماذج',
      link: 'github.com/saraahmed/formkit',
      description: [
        'صيانة مكتبة تحقق مكتوبة بلغة TypeScript تجاوزت 1,500 نجمة على GitHub بمشاركة 40 مساهمًا من 15 دولة',
        'نشر 12 إصدارًا مع ملاحظات إصدار مفصلة وتغطية اختبارات 98%',
      ].join('\n'),
    },
    {
      id: uid(),
      name: 'قالب لوحات تحكم سهلة الوصول',
      link: '',
      description: 'ابتكار قالب لوحات تحكم متوافق مع معايير الوصول نزّلته فرق أخرى أكثر من 8,000 مرة',
    },
    {
      id: uid(),
      name: 'محاضرات مجتمعية',
      link: '',
      description: 'تقديم 6 محاضرات عن أداء الويب وسهولة الوصول في لقاءات تقنية بدبي حضرها أكثر من 300 مشارك',
    },
  ],
  languages: 'العربية (اللغة الأم)، الإنجليزية (بطلاقة)',
});

export const sampleCV = (lang: Lang = 'en'): CVData => (lang === 'ar' ? sampleAr() : sampleEn());
