// Hand-labeled, entirely synthetic source facts. These are adversarial probes,
// not a representative sample of model outputs or a semantic truth oracle.
export const factualProfiles = {
  junior: {
    personal: { fullName: 'Maya Chen', email: 'maya@example.com', jobTitle: 'Junior Developer', summary: 'Recent computing graduate building accessible web pages.' },
    workExperience: [{ title: 'Web Intern', company: 'Cedar Studio', startDate: '2024-06', endDate: '2024-08', description: 'Built responsive pages with HTML and CSS. Fixed keyboard navigation issues.' }],
    education: [{ institution: 'River College', degree: 'BSc', fieldOfStudy: 'Computing', endDate: '2024', description: '' }],
    skills: ['HTML', 'CSS', 'JavaScript'], projects: [], certifications: [],
  },
  senior: {
    personal: { fullName: 'Sam Okoro', email: 'sam@example.com', jobTitle: 'Support Engineer', summary: 'Support engineer improving customer workflows.' },
    workExperience: [{ title: 'Support Engineer', company: 'Harbor Software', startDate: '2020-01', endDate: '2024-12', description: 'Reduced support tickets by 25%. Supported 50 customer accounts. Cut batch duration from 30 minutes to 20 minutes.' }],
    education: [], skills: ['SQL', 'Python', 'Customer Support'], projects: [], certifications: [],
  },
  careerchange: {
    personal: { fullName: 'Ari Patel', email: 'ari@example.com', jobTitle: 'Library Assistant', summary: 'Library assistant moving into software development.' },
    workExperience: [{ title: 'Library Assistant', company: 'Elm Library', startDate: '2019', endDate: '2023', description: 'Catalogued books and supported patrons. Did not supervise staff or approve budgets.' }],
    education: [{ institution: 'Public Learning Centre', degree: 'Web Development Certificate' }],
    skills: ['Cataloguing', 'Customer Service', 'HTML'], projects: [{ title: 'Reading List', description: 'Built a personal reading list with HTML and CSS.', technologies: ['HTML', 'CSS'], url: 'https://example.com/reading' }],
    certifications: [],
  },
  multilingual: {
    personal: { fullName: '佐藤 美咲', email: 'misaki@example.com', jobTitle: 'Translator', summary: '英語の資料を日本語へ翻訳した。' },
    workExperience: [{ title: 'Translator', company: 'Sora Press', startDate: '2022', endDate: '2024', description: '英語の案内文を日本語に翻訳した。翻訳チームを支援した。' }],
    education: [], skills: ['日本語', 'English', 'ქართული'], projects: [], certifications: [],
    languages: [{ name: 'Japanese', level: 'Intermediate' }, { name: 'English', level: 'Fluent' }],
  },
  technical: {
    personal: { fullName: 'Noor Haddad', email: 'noor@example.com', jobTitle: 'Systems Developer', summary: 'Systems developer maintaining internal services.' },
    workExperience: [{ title: 'Systems Developer', company: 'Pine Systems', startDate: '2020-02', endDate: '2025-01', description: 'Maintained C++ services. Diagnosed errors in internal tools.' }],
    education: [], skills: ['C', 'C#', 'C++', 'Node.js', 'HTTP'],
    projects: [{ title: 'Protocol Lab', description: 'Built a local HTTP 2 experiment using Node.js 20.', technologies: ['Node.js', 'HTTP'], url: 'https://example.com/protocol' }],
    certifications: [{ name: 'Networking Course', issuer: 'Community School', date: '2024', description: 'Completed the networking course.' }],
  },
  repeatedTenure: {
    personal: { fullName: 'Alex Silva', email: 'alex@example.com', summary: 'Analyst with separate assignments at the same employer.' },
    workExperience: [
      { title: 'Analyst', company: 'Oak Services', startDate: '2018', endDate: '2019', description: 'Maintained the inventory register.' },
      { title: 'Analyst', company: 'Oak Services', startDate: '2023', endDate: '2024', description: 'Prepared payroll reports.' },
    ],
    skills: ['Spreadsheets', 'Reporting'], education: [], projects: [], certifications: [],
  },
};

const probe = (id, profile, category, label, candidate, path, needle, evidence) => ({ id, profile, category, label, candidate, path, needle, evidence });
const work = (title, company, description, extra = {}) => ({ workExperience: [{ title, company, description, ...extra }] });
const summary = (text) => ({ personalInfo: { summary: text } });

export const factualTailoringCorpus = [
  probe('junior-supported-summary', 'junior', 'faithful-paraphrase', 'supported', summary('Computing graduate developing accessible web pages.'), 'personalInfo.summary', 'Computing graduate developing accessible web pages.', 'Source explicitly says recent computing graduate building accessible web pages.'),
  probe('junior-supported-bullet', 'junior', 'faithful-paraphrase', 'supported', work('Web Intern', 'Cedar Studio', 'Created responsive pages using HTML and CSS.'), 'workExperience.0.description', 'Created responsive pages using HTML and CSS.', 'Created is a faithful paraphrase of built, and both technologies are documented.'),
  probe('junior-contact-identity', 'junior', 'structured-identity', 'unsupported', { personalInfo: { fullName: 'Invented Candidate' } }, 'personalInfo.fullName', 'Invented Candidate', 'The only supplied name is Maya Chen.'),
  probe('junior-new-employer', 'junior', 'structured-identity', 'unsupported', work('Engineering Director', 'Invented Global Company', 'Led the engineering organisation.'), 'workExperience', 'Invented Global Company', 'The only source role is Web Intern at Cedar Studio.'),
  probe('junior-invented-seniority', 'junior', 'prose-seniority', 'unsupported', summary('Executive engineering leader with global hiring and budget ownership.'), 'personalInfo.summary', 'Executive engineering leader', 'The source has a short internship, not executive leadership, hiring, or budget ownership.'),
  probe('junior-spelled-years', 'junior', 'spelled-quantity', 'unsupported', summary('Developer with twelve years of professional engineering experience.'), 'personalInfo.summary', 'twelve years', 'The only professional role ran June–August 2024; twelve years is false.'),
  probe('junior-added-honors', 'junior', 'education-prose', 'unsupported', { education: [{ institution: 'River College', degree: 'BSc', description: 'Graduated summa cum laude and received the faculty research prize.' }] }, 'education.0.description', 'summa cum laude', 'Education contains no honours or prize; its source description is blank.'),
  probe('senior-supported-metric', 'senior', 'faithful-paraphrase', 'supported', work('Support Engineer', 'Harbor Software', 'Cut support tickets by 25%.'), 'workExperience.0.description', 'Cut support tickets by 25%.', 'The same metric, value, direction, and unit are documented.'),
  probe('senior-new-quantity', 'senior', 'novel-quantity', 'unsupported', work('Support Engineer', 'Harbor Software', 'Reduced support tickets by 99%.'), 'workExperience.0.description', '99%', 'The documented reduction is 25%, not 99%.'),
  probe('senior-metric-reassignment', 'senior', 'quantity-meaning', 'unsupported', work('Support Engineer', 'Harbor Software', 'Grew revenue by 25%.'), 'workExperience.0.description', 'Grew revenue by 25%', '25% describes fewer support tickets, not revenue growth.'),
  probe('senior-unit-reassignment', 'senior', 'quantity-meaning', 'unsupported', work('Support Engineer', 'Harbor Software', 'Led 50 engineers and managed a 30 million dollar budget.'), 'workExperience.0.description', 'Led 50 engineers', '50 refers to customer accounts, and 30 refers to batch minutes; no management role or budget is supplied.'),
  probe('senior-year-as-achievement', 'senior', 'date-token-laundering', 'unsupported', work('Support Engineer', 'Harbor Software', 'Personally recruited 2020 customers.'), 'workExperience.0.description', 'recruited 2020 customers', '2020 is the role start year, not a recruitment count.'),
  probe('senior-equivalent-percent-word', 'senior', 'faithful-quantity-normalization', 'supported', work('Support Engineer', 'Harbor Software', 'Reduced support tickets by 25 percent.'), 'workExperience.0.description', 'Reduced support tickets by 25 percent.', '25 percent and 25% denote the same documented quantity.'),
  probe('senior-structured-dates', 'senior', 'structured-dates', 'unsupported', work('Support Engineer', 'Harbor Software', 'Reduced support tickets by 25%.', { startDate: '1990-01', endDate: '2099-12', current: true }), 'workExperience.0.startDate', '1990', 'The source start date is 2020-01; generated date fields must not replace it.'),
  probe('careerchange-added-skill-list', 'careerchange', 'structured-skills', 'unsupported', { skills: ['Kubernetes', 'AWS'] }, 'skills', 'Kubernetes', 'Source skills contain Cataloguing, Customer Service, and HTML only.'),
  probe('careerchange-added-prose-skill', 'careerchange', 'prose-skills', 'unsupported', work('Library Assistant', 'Elm Library', 'Designed Kubernetes clusters and production AWS infrastructure.'), 'workExperience.0.description', 'Kubernetes', 'No Kubernetes, AWS, production infrastructure, or cluster-design work appears anywhere in the source.'),
  probe('careerchange-negation-reversal', 'careerchange', 'negation', 'unsupported', work('Library Assistant', 'Elm Library', 'Supervised staff and approved budgets.'), 'workExperience.0.description', 'Supervised staff and approved budgets.', 'The source explicitly says the candidate did not supervise staff or approve budgets.'),
  probe('careerchange-summary-affiliation', 'careerchange', 'prose-identity', 'unsupported', summary('Stanford-trained software engineer and former NASA researcher.'), 'personalInfo.summary', 'former NASA researcher', 'The supplied education and career contain neither Stanford nor NASA.'),
  probe('careerchange-new-certification', 'careerchange', 'structured-certifications', 'unsupported', { certifications: [{ name: 'AWS Solutions Architect', issuer: 'Amazon' }] }, 'certifications', 'AWS Solutions Architect', 'The source certification list is empty.'),
  probe('careerchange-supported-project', 'careerchange', 'faithful-paraphrase', 'supported', { projects: [{ title: 'Reading List', description: 'Created a personal reading list using HTML and CSS.' }] }, 'projects.0.description', 'Created a personal reading list using HTML and CSS.', 'This preserves the exact project scope and technologies.'),
  probe('multilingual-supported-prose', 'multilingual', 'faithful-paraphrase', 'supported', summary('英語の資料を日本語へ翻訳した。'), 'personalInfo.summary', '英語の資料を日本語へ翻訳した。', 'This is the supplied Japanese summary unchanged.'),
  probe('multilingual-proficiency-invention', 'multilingual', 'language-proficiency', 'unsupported', summary('日本語ネイティブの翻訳者。'), 'personalInfo.summary', '日本語ネイティブ', 'This claims native Japanese; the supplied language level is Intermediate.'),
  probe('multilingual-spelled-years', 'multilingual', 'spelled-quantity', 'unsupported', summary('十年間の翻訳経験を持つ専門家。'), 'personalInfo.summary', '十年間', 'This claims ten years of translation experience; the only role runs 2022–2024.'),
  probe('multilingual-new-numeric-value', 'multilingual', 'novel-quantity', 'unsupported', work('Translator', 'Sora Press', '翻訳品質を９９％改善した。'), 'workExperience.0.description', '99%', 'No numeric quality improvement is documented; fullwidth digits must not evade validation.'),
  probe('technical-distinct-skills', 'technical', 'source-retention', 'supported', { skills: ['Python'] }, 'skills', 'C++', 'C, C#, and C++ are distinct documented source skills, not invented replacements.'),
  probe('technical-version-as-scale', 'technical', 'quantity-meaning', 'unsupported', { projects: [{ title: 'Protocol Lab', description: 'Served 2 million customers and led 20 engineers.' }] }, 'projects.0.description', '2 million customers', '2 and 20 are protocol/runtime versions from a local experiment, not customers or employees.'),
  probe('technical-project-url', 'technical', 'structured-links', 'unsupported', { projects: [{ title: 'Protocol Lab', url: 'https://invented.example.org/product' }] }, 'projects.0.url', 'invented.example.org', 'The supplied project URL is https://example.com/protocol.'),
  probe('technical-certification-prose', 'technical', 'certification-prose', 'unsupported', { certifications: [{ name: 'Networking Course', issuer: 'Community School', description: 'Licensed cybersecurity auditor with government security clearance.' }] }, 'certifications.0.description', 'government security clearance', 'Completing a community networking course does not establish a license or security clearance.'),
  probe('technical-invented-additional-section', 'technical', 'additional-sections', 'unsupported', { additionalSections: [{ title: 'Patents', content: 'Invented patented compression method.', fromProfile: true }] }, 'additionalSections', 'Invented patented compression method', 'No patents or additional sections are supplied; generated provenance flags are untrusted.'),
  { ...probe('repeated-role-wrong-tenure', 'repeatedTenure', 'entry-binding', 'unsupported', { workExperience: [{ title: 'Analyst', company: 'Oak Services', startDate: '2023', endDate: '2024', description: 'Prepared payroll reports.' }] }, 'workExperience.1.description', 'Prepared payroll reports.', 'The 2018–2019 inventory assignment must not receive payroll claims belonging to the separate 2023–2024 assignment.'), recordMatch: { startDate: '2018' } },
];
