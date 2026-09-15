// Word lists used by the ATS analyzer and CV parser (English + Arabic).

export const SECTION_ALIASES: Record<string, string[]> = {
  contact: [
    'contact', 'contact information', 'contact details', 'personal information', 'personal details',
    'معلومات الاتصال', 'بيانات التواصل', 'التواصل', 'معلومات التواصل', 'البيانات الشخصية', 'المعلومات الشخصية',
  ],
  summary: [
    'summary', 'professional summary', 'profile', 'professional profile', 'career summary', 'objective',
    'career objective', 'about me', 'about', 'executive summary', 'summary of qualifications',
    'الملخص', 'ملخص', 'الملخص المهني', 'ملخص مهني', 'نبذة', 'نبذة عني', 'نبذة مختصرة', 'الهدف الوظيفي',
    'الهدف المهني', 'الهدف', 'الملف الشخصي', 'الملف المهني',
  ],
  experience: [
    'experience', 'work experience', 'professional experience', 'employment history', 'work history',
    'employment', 'career history', 'relevant experience',
    'الخبرة', 'الخبرات', 'الخبرة العملية', 'الخبرات العملية', 'الخبرة المهنية', 'الخبرات المهنية',
    'السجل الوظيفي', 'التاريخ الوظيفي', 'الخبرات السابقة',
  ],
  education: [
    'education', 'academic background', 'education and training', 'academic qualifications', 'qualifications',
    'التعليم', 'المؤهلات العلمية', 'المؤهل العلمي', 'التحصيل العلمي', 'المؤهلات الأكاديمية', 'الدراسة',
  ],
  skills: [
    'skills', 'technical skills', 'core competencies', 'key skills', 'competencies', 'areas of expertise',
    'skills and abilities', 'core skills', 'expertise', 'top skills',
    'المهارات', 'المهارات التقنية', 'المهارات الفنية', 'الكفاءات', 'المهارات الأساسية', 'المهارات الرئيسية',
    'أهم المهارات', 'مجالات الخبرة',
  ],
  certifications: [
    'certifications', 'certificates', 'licenses', 'licenses and certifications', 'certifications and licenses',
    'courses', 'training', 'الشهادات', 'الشهادات المهنية', 'الدورات', 'الدورات التدريبية', 'التدريب',
    'الرخص والشهادات', 'التراخيص والشهادات',
  ],
  projects: ['projects', 'key projects', 'personal projects', 'selected projects', 'المشاريع', 'المشروعات', 'أبرز المشاريع'],
  languages: ['languages', 'language skills', 'اللغات', 'المهارات اللغوية'],
  awards: ['awards', 'honors', 'achievements', 'honors and awards', 'honors-awards', 'الجوائز', 'الإنجازات', 'الجوائز والتكريمات'],
  volunteer: ['volunteer', 'volunteering', 'volunteer experience', 'العمل التطوعي', 'التطوع'],
  publications: ['publications', 'المنشورات'],
  references: ['references', 'المراجع', 'المعرفون'],
};

export const ACTION_VERBS = new Set(
  `accelerated accomplished achieved acquired adapted addressed administered advanced advised advocated analyzed
  applied appointed approved architected arranged assembled assessed assisted attained audited authored automated
  balanced boosted briefed budgeted built calculated captured catalogued centralized chaired championed changed
  clarified coached collaborated collected combined commissioned communicated compiled completed composed computed
  conceived conceptualized conducted configured consolidated constructed consulted contracted contributed controlled
  converted coordinated corrected counseled created cultivated cut debugged decreased defined delegated delivered
  demonstrated deployed designed detected determined developed devised diagnosed directed discovered dispatched
  documented doubled drafted drove earned edited educated eliminated enabled encouraged engineered enhanced
  established estimated evaluated examined exceeded executed expanded expedited facilitated finalized forecasted
  formed formulated founded generated grew guided halved handled headed identified implemented improved increased
  influenced informed initiated innovated inspected installed instituted instructed integrated interviewed
  introduced invented investigated launched led lectured leveraged maintained managed marketed maximized measured
  mediated mentored merged migrated minimized modeled moderated modernized monitored motivated navigated negotiated
  operated optimized orchestrated organized originated outperformed overhauled oversaw partnered performed pioneered
  planned prepared presented prioritized processed produced programmed promoted proposed prototyped provided
  published purchased raised ran realigned rebuilt received recommended reconciled recruited redesigned reduced
  refactored refined regulated rehabilitated reinforced remodeled reorganized repaired replaced reported represented
  researched resolved restored restructured revamped reviewed revised revitalized saved scaled scheduled screened
  secured selected served shaped simplified sold solved spearheaded specified standardized steered streamlined
  strengthened structured supervised supported surpassed sustained synthesized systematized tailored taught tested
  tracked trained transformed translated tripled troubleshot unified upgraded utilized validated verified won wrote`
    .split(/\s+/)
    .filter(Boolean),
);

/** Arabic achievement verbs and verbal nouns (masdar), as typically used to open CV bullets. */
export const ACTION_VERBS_AR = `
  قيادة قاد إدارة أدار تطوير طور تصميم صمم تنفيذ نفذ تحقيق حقق زيادة زاد رفع خفض تقليل قلل تحسين حسن بناء بنى
  إطلاق أطلق إشراف أشرف تنظيم نظم تدريب درب إعداد أعد تحليل حلل تأسيس أسس إنشاء أنشأ تنسيق نسق تحويل حول
  أتمتة برمجة برمج اختبار اختبر نشر تطبيق طبق تبسيط بسط توحيد وحد ترحيل رحل إعادة أعاد تفاوض إبرام أبرم
  كسب حصول حصل فوز فاز توفير وفر مضاعفة ضاعف توسيع وسع ابتكار ابتكر اقتراح اقترح مراجعة راجع تقييم قيم
  متابعة تابع معالجة عالج حل دمج دعم قدم تقديم كتابة كتب إنتاج أنتج بيع باع تسويق سوق استقطاب توظيف وظف
  إرشاد أرشد توجيه وجه ترأس رئاسة مساهمة ساهم تخطيط خطط تعزيز عزز رقمنة تسريع سرع قياس صيانة تشغيل شغل
  تركيب مراقبة راقب تدقيق دقق تصحيح صحح تعاون تحديث حدث إنجاز أنجز استحداث ضبط وضع إدخال أدخل`
  .split(/\s+/)
  .filter(Boolean);

export const LEADERSHIP_WORDS = [
  'led', 'managed', 'mentored', 'supervised', 'directed', 'oversaw', 'coached', 'headed', 'chaired', 'spearheaded',
  'قيادة', 'إدارة', 'إشراف', 'الإشراف', 'توجيه', 'ترأس', 'قاد', 'أدار', 'أشرف',
];

export const WEAK_PHRASES = [
  'responsible for', 'duties included', 'duties include', 'worked on', 'helped with', 'in charge of', 'tasked with',
  'was involved in', 'مسؤول عن', 'مسؤولة عن', 'كنت مسؤولا', 'قمت ب', 'عملت على', 'ساعدت في', 'المهام تشمل', 'من مهامي',
];

/** Quick fixes offered in the builder for weak bullet openings. */
export const WEAK_FIXES: { re: RegExp; to: string }[] = [
  { re: /^responsible for\s+/i, to: 'Managed ' },
  { re: /^in charge of\s+/i, to: 'Led ' },
  { re: /^worked on\s+/i, to: 'Developed ' },
  { re: /^helped(?:\s+(?:with|to))?\s+/i, to: 'Supported ' },
  { re: /^tasked with\s+/i, to: 'Delivered ' },
  { re: /^was involved in\s+/i, to: 'Contributed to ' },
  { re: /^duties included?:?\s+/i, to: '' },
  { re: /^(?:كنت\s+)?مسؤول(?:ة|ا|اً)?\s+عن\s+/u, to: 'إدارة ' },
  { re: /^عملت\s+على\s+/u, to: 'تطوير ' },
  { re: /^ساعدت\s+في\s+/u, to: 'دعم ' },
  { re: /^قمت\s+ب/u, to: '' },
];

export const CLICHES = [
  'hard worker', 'hard-working', 'hardworking', 'team player', 'go-getter', 'detail-oriented', 'detail oriented',
  'think outside the box', 'synergy', 'results-driven', 'results driven', 'self-starter', 'self starter',
  'dynamic', 'passionate', 'motivated individual', 'proven track record', 'best of breed', 'go-to person',
  'excellent communication skills', 'fast learner', 'quick learner', 'works well under pressure',
  'روح الفريق', 'العمل تحت الضغط', 'سريع التعلم', 'سريعة التعلم', 'مجتهد', 'مجتهدة', 'طموح', 'شغوف', 'شغوفة',
  'حسن المظهر', 'العمل ضمن فريق', 'مهارات تواصل ممتازة',
];

export const PERSONAL_DATA_PATTERNS: { key: string; re: RegExp }[] = [
  { key: 'dob', re: /\b(date of birth|d\.?o\.?b\.?|birth ?date|born on)\b/i },
  { key: 'marital', re: /\b(marital status|married|divorced)\b/i },
  { key: 'religion', re: /\breligion\b/i },
  { key: 'gender', re: /\b(gender|sex)\s*:/i },
  { key: 'nationality', re: /\bnationality\b/i },
  { key: 'age', re: /\bage\s*:\s*\d/i },
  { key: 'photo', re: /\b(photo|photograph)\b/i },
  // Arabic patterns run against folded text (see foldArabic).
  { key: 'dob', re: /تاريخ الميلاد|مواليد|تاريخ الولاده/u },
  { key: 'marital', re: /الحاله الاجتماعيه|(?<!\p{L})(متزوج|متزوجه|اعزب|عزباء|مطلق|مطلقه)(?!\p{L})/u },
  { key: 'religion', re: /الديانه|(?<!\p{L})الدين\s*:/u },
  { key: 'gender', re: /(?<!\p{L})(الجنس|النوع)\s*:/u },
  { key: 'nationality', re: /الجنسيه/u },
  { key: 'age', re: /(?<!\p{L})العمر\s*:\s*\d/u },
  { key: 'photo', re: /صوره شخصيه/u },
];

export const UNPROFESSIONAL_EMAIL =
  /(sexy|hot|cute|baby|babe|lover?|kiss|princess|prince|king|queen|angel|devil|killer|crazy|cool|party|gamer|ninja|xx|69|420|lol|boss)/i;

/** Seniority levels: 0 intern … 6 executive. Checked against job titles only. */
export const SENIORITY_PATTERNS: { level: number; re: RegExp }[] = [
  { level: 6, re: /\b(vp|vice president|chief|cto|ceo|cfo|coo|cio)\b|نائب الرئيس|الرئيس التنفيذي/iu },
  { level: 5, re: /\b(director|head of)\b|رئيس قسم|مدير عام|مدير اداره|مدير ادارة|رئيس ادار/iu },
  // "staff" alone is a junior grade (staff accountant, staff nurse) and is senior only in engineering ladders;
  // "lead generation" is a marketing job, and a "principal teacher" is not an executive.
  { level: 4, re: /\b(lead(?!\s+generation)|principal(?!\s+teachers?\b)|staff\s+(?:software\s+)?(?:engineer|scientist|architect|designer|data\s+scientist)|manager|supervisor)\b|قائد|رئيس فريق|(?<!\p{L})مدير|مشرف/iu },
  { level: 3, re: /\b(senior|sr\.?)\b|(?<!\p{L})(اول|اولى|اولي|كبير|كبيره|خبير)(?!\p{L})/iu },
  { level: 1, re: /\b(junior|jr\.?|entry[- ]level|graduate|assistant)\b|مبتدي|حديث التخرج|حديثي التخرج|مساعد/iu },
  { level: 0, re: /\b(intern|internship|trainee)\b|متدرب|تدريب صيفي/iu },
];

export const COMPANY_HINT =
  /\b(inc|llc|ltd|limited|corp|corporation|company|co\.|group|bank|university|hospital|agency|studio|solutions|technologies|systems|consulting|gmbh|plc|holding)\b|شركة|شركه|مجموعة|مجموعه|بنك|مؤسسة|مؤسسه|جامعة|جامعه|مستشفى|وزارة|وزاره|هيئة|هيئه/iu;

export const TITLE_HINT =
  /(engineer|developer|manager|analyst|designer|specialist|consultant|director|lead|officer|assistant|coordinator|accountant|intern|administrator|architect|scientist|representative|executive|supervisor|teacher|nurse|technician|programmer|marketer|writer|editor|associate|مهندس|مطور|مطورة|مدير|محلل|مصمم|أخصائي|اخصائي|مستشار|مسؤول|منسق|محاسب|مساعد|متدرب|فني|مشرف|معلم|ممرض|مبرمج|كاتب)/iu;

export const DEGREE_HINT =
  /(bachelor|master|b\.?sc|m\.?sc|\bb\.?a\b|\bm\.?a\b|mba|ph\.?d|doctor|diploma|associate degree|degree|b\.?tech|m\.?tech|b\.?eng|high school|بكالوريوس|ماجستير|دكتوراه|دبلوم|ليسانس|الثانوية|ثانوية)/iu;

export const SCHOOL_HINT = /(university|college|school|institute|academy|polytechnic|جامعة|جامعه|كلية|كليه|معهد|أكاديمية|اكاديمية|مدرسة)/iu;

export const PLACE_HINT =
  /\b(remote|hybrid|uae|usa|uk|ksa|saudi|egypt|qatar|kuwait|oman|bahrain|jordan|lebanon|morocco|tunisia|algeria|iraq|india|pakistan|germany|france|canada|australia|dubai|abu dhabi|sharjah|riyadh|jeddah|dammam|cairo|alexandria|doha|amman|beirut|london|new york|bangalore|mumbai|delhi|united states|united kingdom|united arab emirates)\b|الإمارات|الامارات|السعودية|مصر|قطر|الكويت|عمان|عُمان|البحرين|الأردن|الاردن|لبنان|المغرب|تونس|الجزائر|العراق|دبي|أبوظبي|ابوظبي|الشارقة|الرياض|جدة|الدمام|القاهرة|الإسكندرية|الدوحة|بيروت|عن بعد/iu;

/** Irregular past-tense verbs mapped to their base form. */
export const IRREGULAR_VERBS: Record<string, string> = {
  led: 'lead', built: 'build', ran: 'run', wrote: 'write', grew: 'grow', drove: 'drive', won: 'win', sold: 'sell',
  taught: 'teach', oversaw: 'oversee', troubleshot: 'troubleshoot', made: 'make', took: 'take', brought: 'bring',
  began: 'begin', spent: 'spend', held: 'hold', sought: 'seek', understood: 'understand', chose: 'choose',
};

export const SOFT_SKILLS: { en: string; ar: string; terms: string[] }[] = [
  { en: 'Communication', ar: 'التواصل', terms: ['communication', 'communicate', 'communicator', 'التواصل', 'الاتصال'] },
  { en: 'Teamwork', ar: 'العمل الجماعي', terms: ['teamwork', 'team player', 'collaboration', 'collaborative', 'collaborate', 'العمل الجماعي', 'التعاون', 'العمل ضمن فريق'] },
  { en: 'Leadership', ar: 'القيادة', terms: ['leadership', 'القيادة', 'قيادة'] },
  { en: 'Problem solving', ar: 'حل المشكلات', terms: ['problem solving', 'problem-solving', 'troubleshooting', 'حل المشكلات'] },
  { en: 'Time management', ar: 'إدارة الوقت', terms: ['time management', 'prioritization', 'prioritize', 'إدارة الوقت', 'ترتيب الأولويات'] },
  { en: 'Adaptability', ar: 'المرونة', terms: ['adaptability', 'adaptable', 'flexibility', 'fast-paced', 'المرونة', 'التكيف'] },
  { en: 'Attention to detail', ar: 'الدقة', terms: ['attention to detail', 'detail-oriented', 'detail oriented', 'accuracy', 'الدقة', 'الاهتمام بالتفاصيل'] },
  { en: 'Analytical thinking', ar: 'التفكير التحليلي', terms: ['critical thinking', 'analytical', 'التفكير النقدي', 'التفكير التحليلي', 'مهارات تحليلية'] },
  { en: 'Negotiation', ar: 'التفاوض', terms: ['negotiation', 'negotiate', 'التفاوض'] },
  { en: 'Presentation', ar: 'مهارات العرض', terms: ['presentation', 'presenting', 'public speaking', 'مهارات العرض', 'العرض والتقديم', 'الخطابة'] },
  { en: 'Customer focus', ar: 'التركيز على العملاء', terms: ['customer focus', 'customer-focused', 'client-facing', 'التركيز على العملاء'] },
  { en: 'Creativity', ar: 'الإبداع', terms: ['creativity', 'creative', 'innovative', 'الإبداع', 'الابتكار'] },
  { en: 'Stakeholder management', ar: 'إدارة أصحاب المصلحة', terms: ['stakeholder management', 'stakeholders', 'أصحاب المصلحة'] },
  { en: 'Mentoring', ar: 'التوجيه', terms: ['mentoring', 'coaching', 'mentor', 'التوجيه', 'الإرشاد'] },
  { en: 'Ownership', ar: 'المبادرة', terms: ['ownership', 'accountability', 'self-motivated', 'proactive', 'المبادرة', 'تحمل المسؤولية'] },
];

export const SUPERLATIVES = [
  'world-class', 'best-in-class', 'best in class', 'guru', 'ninja', 'rockstar', 'rock star', 'visionary', 'unparalleled',
  'extraordinary', 'exceptional', 'outstanding', 'flawless', 'perfectionist', 'second to none',
  'استثنائي', 'استثنائية', 'لا مثيل', 'عالمي المستوى', 'خبير في جميع',
];

export const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly)\b/i;

/** Industry words the English dictionary does not know, so they are not reported as misspellings. */
export const TECH_WORDS = `javascript typescript nodejs frontend backend fullstack devops api apis sql nosql mysql postgresql
  mongodb redis graphql kubernetes docker aws azure gcp github gitlab jira confluence figma photoshop illustrator excel
  powerpoint saas paas b2b b2c kpi kpis roi seo sem crm erp ux ui qa ci cd html css sass scss json xml yaml linux unix
  macos ios android kotlin swift flutter django flask laravel symfony vue nuxt nextjs reactjs redux tailwind webpack vite
  babel eslint jest cypress selenium pytest junit microservices serverless blockchain fintech edtech ecommerce omnichannel
  onboarding offboarding upskilling reskilling cybersecurity dataset datasets dashboard dashboards workflow workflows
  analytics tableau looker bigquery snowflake databricks hadoop kafka airflow terraform ansible jenkins nginx oauth jwt
  sdk sdks npm yarn pnpm repo repos codebase refactoring refactored scalability stakeholder stakeholders roadmap roadmaps
  scrum agile kanban sprint sprints okr okrs gpa bsc msc mba phd cv linkedin gmail hotmail outlook whatsapp tiktok
  instagram youtube wcag accessibility frontend backend chatbot chatbots automations upsell upselling cross-functional
  hackathon hackathons internship internships mentorship mentees mentee`
  .split(/\s+/)
  .filter(Boolean);

export const KNOWN_SKILLS = [
  'machine learning', 'deep learning', 'data analysis', 'data science', 'data visualization', 'project management',
  'product management', 'customer service', 'customer success', 'business development', 'supply chain',
  'financial analysis', 'financial modeling', 'risk management', 'quality assurance', 'software development',
  'web development', 'front end', 'back end', 'full stack', 'ci/cd',
  'unit testing', 'test automation', 'rest api', 'restful api', 'microservices', 'cloud computing', 'google cloud',
  'amazon web services', 'power bi', 'google analytics', 'digital marketing', 'content marketing', 'social media',
  'search engine optimization', 'user experience', 'user interface', 'ux design', 'ui design', 'agile', 'scrum',
  'kanban', 'lean six sigma', 'six sigma', 'stakeholder management', 'change management', 'account management',
  'sales management', 'budget management', 'vendor management', 'public speaking', 'problem solving',
  'critical thinking', 'natural language processing', 'computer vision', 'version control', 'object oriented',
  'node.js', 'react.js', 'vue.js', 'next.js', 'c++', 'c#', '.net', 'asp.net', 'sql server', 'microsoft excel',
  'microsoft office', 'ms office', 'accounts payable', 'accounts receivable', 'general ledger', 'data entry',
  'network security', 'information security', 'cyber security', 'cybersecurity', 'penetration testing',
  'technical support', 'help desk', 'root cause analysis', 'continuous improvement', 'process improvement',
  'human resources', 'talent acquisition', 'employee relations', 'performance management', 'patient care',
  'electronic health records', 'autocad', 'solidworks', 'sap', 'salesforce', 'hubspot', 'jira', 'confluence',
  'إدارة المشاريع', 'خدمة العملاء', 'تحليل البيانات', 'علم البيانات', 'التسويق الرقمي', 'المحاسبة', 'إدارة المبيعات',
  'الموارد البشرية', 'تطوير الأعمال', 'سلاسل الإمداد', 'إدارة المخاطر', 'ضبط الجودة', 'ضمان الجودة',
  'التخطيط الاستراتيجي', 'حل المشكلات', 'التفكير النقدي', 'الذكاء الاصطناعي', 'تعلم الآلة', 'الأمن السيبراني',
  'تجربة المستخدم', 'واجهة المستخدم', 'وسائل التواصل الاجتماعي', 'إدارة الفريق', 'التحليل المالي',
  'النمذجة المالية', 'إعداد الميزانيات', 'التدقيق الداخلي', 'علاقات العملاء', 'المبيعات', 'التسويق',
];

export const STOPWORDS = new Set(
  `a about above across after again against all almost also am among an and any are aren't as at be because been
  before being below between both but by can cannot could did do does doing down during each either else etc ever
  every few for from further get gets getting give given go going good great had has have having he her here hers
  him his how however i if in into is isn't it its itself just least less let like likely made make makes making
  many may me might more most much must my need needed needs neither no nor not now of off often on once only or
  other others our ours out over own per perhaps please rather really same shall she should since so some such
  than that the their theirs them then there these they this those though through thus to too toward under until
  up upon us use used uses using very via want was we well were what when where whether which while who whom whose
  why will with within without would yet you your yours
  ability able accordance additional apply applicant applicants application applications area areas
  based benefits best candidate candidates company companies competitive day days description desired duties
  environment equal employer employment ensure excellent experience experienced familiarity field full help high
  highly ideal including include includes join job knowledge level location looking member members minimum new
  offer opportunity opportunities part plus position preferred provide qualifications qualified related
  required requirement requirements responsibilities responsibility role salary skill skills strong successful
  support team teams time understanding week work working world year years one two three four five six seven
  eight nine ten around e.g i.e bachelor's master's degree
  build building builds write writing writes create creating develop developing manage managing lead leading
  deliver delivering drive driving collaborate collaborating optimize optimizing seeking seek hire hiring
  ensuring maintain maintaining perform performing assist assisting handle handling take taking own owning
  contribute contributing grow growing various multiple key ideally must-have nice-to-have hands-on proven solid
  deep passion passionate self fast-paced paced dynamic exciting today
  في من إلى الى على عن مع هذا هذه ذلك تلك التي الذي الذين هو هي هم نحن أنت أو و ثم كما لدى لدينا لديه يجب أن إن
  كان كانت تكون يكون قد لقد كل بعض أي غير بين حتى خلال عند مثل ضمن حول بعد قبل أكثر أقل جدا أيضا ليس لا ما
  متى أين كيف لم لن سوف ذات عبر وفق حيث إذا منذ دون لكن بل
  خبرة خبرات سنوات سنة سنتين عام أعوام المرشح المرشحين مرشح الوظيفة وظيفة العمل عمل فريق القدرة قدرة مهارات
  مهارة المتطلبات متطلبات المسؤوليات مسؤوليات المؤهلات مؤهلات مطلوب مطلوبة يفضل ممتاز ممتازة جيد جيدة قوية قوي
  معرفة الشركة شركة نبحث الانضمام بيئة فرصة راتب مزايا الدوام دوام كامل جزئي التقديم الإعلان يتمتع تتمتع
  يمتلك تمتلك امتلاك درجة بكالوريوس ماجستير الحد الأدنى أدنى قادر قادرة مجال ذو ذوي متميز متميزة مناسب مناسبة
  شخص يرجى إرسال السيرة الذاتية`
    .split(/\s+/)
    .filter(Boolean),
);
