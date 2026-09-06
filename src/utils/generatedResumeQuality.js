const ATS_SAFE_FONTS = new Set([
  'Arial',
  'Calibri',
  'Times New Roman',
  'Helvetica',
  'Garamond',
  'Georgia',
  'Verdana',
  'Tahoma',
]);

const LENGTH_LIMITS = {
  concise: {
    skillsMax: 15,
    workBulletsMax: 3,
    projectBulletsMax: 2,
    summaryMaxChars: 550,
  },
  standard: {
    skillsMax: 25,
    workBulletsMax: 5,
    projectBulletsMax: 3,
    summaryMaxChars: 700,
  },
  comprehensive: {
    skillsMax: 35,
    workBulletsMax: 6,
    projectBulletsMax: 4,
    summaryMaxChars: 850,
  },
};

const PLACEHOLDER_PATTERN = /\b(undefined|null|nan|not specified|n\/a|your name|lorem ipsum)\b/i;
const UNSAFE_FINAL_TEXT_PATTERN = /<\/?[a-z][^>]*>|~~[^~]+~~|[\u200B-\u200D\uFEFF]|[\u{1F300}-\u{1FAFF}]/iu;

const toArray = (value) => (Array.isArray(value) ? value : []);

const hasText = (value) => value !== undefined && value !== null && `${value}`.trim() !== '';

const firstText = (...values) => values.find(hasText) || '';

const decodeCommonEntities = (value) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#039;/gi, "'");

const normalizeCharacters = (value) => decodeCommonEntities(`${value || ''}`)
  .normalize('NFKC')
  .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
  .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
  .replace(/[\u2013\u2014\u2212]/g, '-')
  .replace(/\u00A0/g, ' ')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu, '');

export const normalizeResumeTerm = (value = '') => normalizeCharacters(value)
  .toLowerCase()
  .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeForSearch = (value = '') => normalizeCharacters(value)
  .toLowerCase()
  .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanTextBlock = (value = '') => normalizeCharacters(value)
  .replace(/<\/(?:p|div|li|br)>/gi, '\n')
  .replace(/<(?:br|p|div|li)\b[^>]*>/gi, '\n')
  // Strip presentation-only tags, not comparison prose or semantic <del>/<s> text.
  .replace(/<\/?(?:p|div|li|br|ul|ol|b|strong|em|i|u|span|a|blockquote|pre|code|h[1-6]|table|thead|tbody|tfoot|tr|th|td)\b[^>]*>/gi, ' ')
  .replace(/^[ \t]*#{1,6}\s+/gm, '')
  .replace(/`([^`\n]+)`/g, '$1')
  .replace(/(?<!\w)(\*\*|__)(?=\S)([^\n]*?\S)\1(?!\w)/g, '$2')
  .replace(/(^|[\s(])([*_])(?=\S)([^*_\n]*?\S)\2(?=$|[\s.,;!?)])/g, '$1$3')
  .replace(/[ \t]+/g, ' ')
  .replace(/[ \t]*\n[ \t]*/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const cleanSingleLine = (value = '') => cleanTextBlock(value)
  .replace(/\s+/g, ' ')
  .trim();

const isUsefulText = (value) => {
  const text = cleanSingleLine(value);
  return text.length > 0 && !PLACEHOLDER_PATTERN.test(text);
};

const stripBulletPrefix = (value = '') => cleanSingleLine(value)
  .replace(/^\s*(?:[-*+]|\d+[.)]|[\u2022\u25CF\u25E6\u2043\u2219])\s+/, '')
  .trim();

const splitSentences = (value = '') => {
  const sentenceMatches = cleanSingleLine(value).split(/(?<=[.!?])\s+(?=\p{Lu})/u);
  return sentenceMatches.map((sentence) => sentence.trim()).filter(Boolean);
};

const uniqueByNormalized = (items = [], limit = Infinity) => {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const value = cleanSingleLine(item);
    const key = normalizeResumeTerm(value);
    if (!value || !key || seen.has(key) || PLACEHOLDER_PATTERN.test(value)) return;
    seen.add(key);
    result.push(value);
  });

  return result.slice(0, limit);
};

const normalizeBullets = (value) => {
  const cleaned = cleanTextBlock(value);
  if (!cleaned) return '';

  let lines = cleaned
    .split('\n')
    .map(stripBulletPrefix)
    .filter(Boolean);

  if (lines.length <= 1) {
    lines = splitSentences(lines[0] || cleaned);
  }

  // Prose is not a bag of keywords: punctuation can carry units, scope or negation.
  // Retain complete text and exact-case wording; never truncate away a later caveat.
  return [...new Set(lines)]
    .map((line) => `- ${line}`)
    .join('\n');
};

const skillText = (skill) => {
  if (typeof skill === 'string') return skill;
  if (!skill || typeof skill !== 'object') return '';
  return firstText(skill.name, skill.skill, skill.label, skill.title);
};

const splitSkillValue = (value) => {
  if (Array.isArray(value)) return value.flatMap(splitSkillValue);
  if (typeof value === 'string') {
    return value.split(/[,;|\n]/).map((item) => item.trim());
  }
  return [value];
};

const collectKeywordTerms = (keywordAnalysis = {}) => uniqueByNormalized([
  ...toArray(keywordAnalysis.keywords),
  ...toArray(keywordAnalysis.technical_skills),
  ...toArray(keywordAnalysis.technicalSkills),
  ...toArray(keywordAnalysis.soft_skills),
  ...toArray(keywordAnalysis.softSkills),
  ...toArray(keywordAnalysis.tools_software),
  ...toArray(keywordAnalysis.toolsSoftware),
], 80);

const termAppearsInText = (term, text) => {
  const cleanTerm = cleanSingleLine(term);
  if (!cleanTerm) return false;

  const searchableText = normalizeForSearch(text);
  const searchableTerm = normalizeForSearch(cleanTerm);
  if (!searchableTerm) return false;

  return new RegExp(`(?<![\\p{L}\\p{N}+#])${escapeRegExp(searchableTerm)}(?![\\p{L}\\p{N}+#])`, 'iu').test(searchableText);
};

const scoreSkillForJob = (skill, context) => {
  const term = cleanSingleLine(skill);
  if (!term) return 0;

  let score = 0;
  if (termAppearsInText(term, context.jobDescription)) score += 5;
  if (termAppearsInText(term, context.keywordText)) score += 4;
  if (termAppearsInText(term, context.focusSkills)) score += 3;
  if (term.length <= 35) score += 1;
  return score;
};

const normalizeSkillsForAts = (skills = [], context, limits) => {
  const deduped = uniqueByNormalized(splitSkillValue(skills).map(skillText), 120)
    .filter((skill) => skill.length <= 70);

  return deduped
    .map((skill, originalIndex) => ({
      skill,
      originalIndex,
      score: scoreSkillForJob(skill, context),
    }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .slice(0, limits.skillsMax)
    .map((item) => item.skill);
};

const dateScore = (item = {}) => {
  if (item.current) return Number.MAX_SAFE_INTEGER;
  const dateValue = firstText(item.endDate, item.startDate);
  const parsed = Date.parse(dateValue);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeWorkExperience = (workExperience = []) => toArray(workExperience)
  .filter((job) => job && (isUsefulText(job.title || job.jobTitle) || isUsefulText(job.company)))
  .map((job) => {
    const title = cleanSingleLine(firstText(job.title, job.jobTitle));
    const description = normalizeBullets(
      firstText(job.description, job.responsibilities, job.achievements)
    );

    return {
      ...job,
      title,
      jobTitle: title,
      company: cleanSingleLine(firstText(job.company, job.employer)),
      location: cleanSingleLine(job.location),
      startDate: cleanSingleLine(job.startDate),
      endDate: cleanSingleLine(job.endDate),
      current: Boolean(job.current),
      description,
      responsibilities: description,
    };
  })
  .sort((a, b) => dateScore(b) - dateScore(a));

const normalizeEducation = (education = []) => toArray(education)
  .filter((item) => item && (
    isUsefulText(item.institution || item.school) ||
    isUsefulText(item.degree) ||
    isUsefulText(item.fieldOfStudy || item.field)
  ))
  .map((item) => ({
    ...item,
    institution: cleanSingleLine(firstText(item.institution, item.school)),
    degree: cleanSingleLine(item.degree),
    fieldOfStudy: cleanSingleLine(firstText(item.fieldOfStudy, item.field)),
    location: cleanSingleLine(item.location),
    startDate: cleanSingleLine(item.startDate),
    endDate: cleanSingleLine(item.endDate),
    current: Boolean(item.current),
    description: cleanSingleLine(item.description),
  }));

const normalizeCertifications = (certifications = []) => toArray(certifications)
  .filter((item) => item && isUsefulText(item.name || item.title || item.issuer))
  .map((item) => ({
    ...item,
    name: cleanSingleLine(firstText(item.name, item.title)),
    issuer: cleanSingleLine(item.issuer),
    date: cleanSingleLine(firstText(item.date, item.issueDate)),
    description: cleanSingleLine(item.description),
  }));

const normalizeProjects = (projects = []) => toArray(projects)
  .filter((item) => item && (isUsefulText(item.title || item.name) || isUsefulText(item.description)))
  .map((item) => ({
    ...item,
    title: cleanSingleLine(firstText(item.title, item.name)),
    description: normalizeBullets(item.description),
    technologies: cleanSingleLine(
      Array.isArray(item.technologies) ? item.technologies.map(cleanSingleLine).filter(Boolean).join(', ') : item.technologies
    ),
    startDate: cleanSingleLine(item.startDate),
    endDate: cleanSingleLine(item.endDate),
    current: Boolean(item.current),
    url: cleanSingleLine(item.url),
  }));

const normalizeKeywordAnalysis = (keywordAnalysis = {}, fallbackAnalysis = {}) => {
  if (!keywordAnalysis || typeof keywordAnalysis !== 'object') return {};

  return {
    ...fallbackAnalysis,
    ...keywordAnalysis,
    source: keywordAnalysis.source || fallbackAnalysis.source,
    keywords: uniqueByNormalized([
      ...toArray(keywordAnalysis.keywords),
      ...toArray(keywordAnalysis.extractedKeywords),
      ...toArray(fallbackAnalysis.keywords),
      ...toArray(fallbackAnalysis.extractedKeywords),
    ], 18),
    technical_skills: uniqueByNormalized([
      ...toArray(keywordAnalysis.technical_skills),
      ...toArray(keywordAnalysis.technicalSkills),
      ...toArray(fallbackAnalysis.technical_skills),
      ...toArray(fallbackAnalysis.technicalSkills),
    ], 18),
    soft_skills: uniqueByNormalized([
      ...toArray(keywordAnalysis.soft_skills),
      ...toArray(keywordAnalysis.softSkills),
      ...toArray(fallbackAnalysis.soft_skills),
      ...toArray(fallbackAnalysis.softSkills),
    ], 18),
    key_responsibilities: uniqueByNormalized([
      ...toArray(keywordAnalysis.key_responsibilities),
      ...toArray(keywordAnalysis.keyResponsibilities),
      ...toArray(fallbackAnalysis.key_responsibilities),
      ...toArray(fallbackAnalysis.keyResponsibilities),
    ], 10),
    ats_tips: uniqueByNormalized([
      ...toArray(keywordAnalysis.ats_tips),
      ...toArray(keywordAnalysis.atsTips),
      ...toArray(fallbackAnalysis.ats_tips),
      ...toArray(fallbackAnalysis.atsTips),
    ], 8),
    required_experience: cleanSingleLine(firstText(
      keywordAnalysis.required_experience,
      keywordAnalysis.requiredExperience,
      fallbackAnalysis.required_experience,
      fallbackAnalysis.requiredExperience
    )),
    industry_specific_advice: cleanSingleLine(firstText(
      keywordAnalysis.industry_specific_advice,
      keywordAnalysis.industrySpecificAdvice,
      fallbackAnalysis.industry_specific_advice,
      fallbackAnalysis.industrySpecificAdvice
    )),
    job_category: cleanSingleLine(firstText(
      keywordAnalysis.job_category,
      keywordAnalysis.jobCategory,
      fallbackAnalysis.job_category,
      fallbackAnalysis.jobCategory
    )),
  };
};

const normalizeLanguageValue = (language) => {
  if (typeof language === 'string') return cleanSingleLine(language);
  if (!language || typeof language !== 'object') return '';

  const name = cleanSingleLine(firstText(language.name, language.language, language.title));
  const level = cleanSingleLine(firstText(language.level, language.proficiency));
  return [name, level].filter(Boolean).join(' - ');
};

const normalizeAdditionalSections = (sourceProfile = {}) => {
  const sourceSections = toArray(sourceProfile.additionalSections)
    .filter((section) => section && typeof section === 'object')
    .map((section) => ({
      ...section,
      title: cleanSingleLine(section.title || section.name),
      content: normalizeBullets(firstText(section.content, section.description)),
    }))
    .filter((section) => isUsefulText(section.title) && isUsefulText(section.content));

  const languages = uniqueByNormalized(toArray(sourceProfile.languages).map(normalizeLanguageValue), 20);

  const supportedSections = [...sourceSections];
  if (languages.length > 0) {
    supportedSections.push({
      title: 'Languages',
      content: languages.join(', '),
    });
  }

  return supportedSections;
};

const flattenResumeText = (resume = {}) => [
  resume.personalInfo?.fullName,
  resume.personalInfo?.jobTitle,
  resume.personalInfo?.summary,
  ...toArray(resume.skills),
  ...toArray(resume.workExperience).flatMap((job) => [
    job.title,
    job.company,
    job.location,
    job.description,
    job.responsibilities,
  ]),
  ...toArray(resume.education).flatMap((item) => [
    item.institution,
    item.degree,
    item.fieldOfStudy,
    item.description,
  ]),
  ...toArray(resume.projects).flatMap((item) => [
    item.title,
    item.description,
    item.technologies,
  ]),
  ...toArray(resume.certifications).flatMap((item) => [
    item.name,
    item.issuer,
    item.description,
  ]),
].filter(Boolean).join('\n');

const buildAtsQualityReport = (resume, context) => {
  const resumeText = flattenResumeText(resume);
  const keywordTerms = collectKeywordTerms(resume.keywordAnalysis);
  const matchedKeywords = keywordTerms.filter((term) => termAppearsInText(term, resumeText));
  const missingKeywords = keywordTerms.filter((term) => !termAppearsInText(term, resumeText)).slice(0, 20);
  const keywordCoverage = keywordTerms.length > 0 ? matchedKeywords.length / keywordTerms.length : 1;
  const workWithBullets = toArray(resume.workExperience)
    .filter((job) => toArray(job.description?.split('\n')).filter((line) => line.trim().startsWith('- ')).length >= 2)
    .length;

  const checks = [
    {
      id: 'ats-safe-layout',
      passed: resume.selectedTemplate === 'ats-friendly' && ATS_SAFE_FONTS.has(resume.selectedFont),
    },
    {
      id: 'standard-contact',
      passed: isUsefulText(resume.personalInfo?.fullName) && isUsefulText(resume.personalInfo?.email),
    },
    {
      id: 'target-headline',
      passed: isUsefulText(resume.personalInfo?.jobTitle),
    },
    {
      id: 'summary',
      passed: isUsefulText(resume.personalInfo?.summary) && resume.personalInfo.summary.length <= context.limits.summaryMaxChars,
    },
    {
      id: 'skills',
      passed: toArray(resume.skills).length >= Math.min(3, context.limits.skillsMax),
    },
    {
      id: 'experience-bullets',
      passed: toArray(resume.workExperience).length === 0 || workWithBullets === toArray(resume.workExperience).length,
    },
    {
      id: 'keyword-coverage',
      passed: keywordCoverage >= 0.45 || matchedKeywords.length >= 8 || keywordTerms.length === 0,
    },
    {
      id: 'parser-safe-text',
      passed: !UNSAFE_FINAL_TEXT_PATTERN.test(resumeText),
    },
  ];

  return {
    score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100),
    checks,
    keywordCoverage: Number(keywordCoverage.toFixed(2)),
    matchedKeywords: matchedKeywords.slice(0, 30),
    missingKeywords,
    warnings: [
      ...(resume.personalInfo?.summary?.length > context.limits.summaryMaxChars
        ? ['Review the summary length; all supplied wording was preserved to avoid dropping qualifications.'] : []),
      ...(toArray(resume.workExperience).some((job) => job.description.split('\n').length > context.limits.workBulletsMax) ||
        toArray(resume.projects).some((project) => project.description.split('\n').length > context.limits.projectBulletsMax)
        ? ['Review the bullet count; all supplied wording was preserved to avoid dropping qualifications.'] : []),
      ...(missingKeywords.length > 0 ? ['Review missing keywords and add only those that truthfully match the candidate.'] : []),
      ...(UNSAFE_FINAL_TEXT_PATTERN.test(resumeText) ? ['Parser-hostile characters remain in the resume text.'] : []),
    ],
  };
};

export const hardenGeneratedResumeForAts = (resume = {}, options = {}) => {
  const limits = LENGTH_LIMITS[options.length] || LENGTH_LIMITS.standard;
  const keywordAnalysis = normalizeKeywordAnalysis(
    resume.keywordAnalysis || options.keywordAnalysis || {},
    options.fallbackKeywordAnalysis || {}
  );
  const keywordText = collectKeywordTerms(keywordAnalysis).join(' ');
  const context = {
    jobDescription: options.jobDescription || '',
    focusSkills: options.focusSkills || '',
    keywordText,
  };

  const selectedFont = cleanSingleLine(resume.selectedFont);
  const personalInfo = resume.personalInfo || {};
  const hardened = {
    ...resume,
    personalInfo: {
      ...personalInfo,
      fullName: cleanSingleLine(personalInfo.fullName),
      email: cleanSingleLine(personalInfo.email),
      phone: cleanSingleLine(personalInfo.phone),
      location: cleanSingleLine(personalInfo.location),
      linkedin: cleanSingleLine(personalInfo.linkedin),
      github: cleanSingleLine(personalInfo.github),
      portfolio: cleanSingleLine(firstText(personalInfo.portfolio, personalInfo.website)),
      website: cleanSingleLine(firstText(personalInfo.website, personalInfo.portfolio)),
      other: cleanSingleLine(personalInfo.other),
      jobTitle: cleanSingleLine(personalInfo.jobTitle),
      summary: cleanSingleLine(personalInfo.summary || personalInfo.professionalSummary),
      professionalLinks: {
        ...(personalInfo.professionalLinks || {}),
        linkedin: cleanSingleLine(firstText(personalInfo.professionalLinks?.linkedin, personalInfo.linkedin)),
        github: cleanSingleLine(firstText(personalInfo.professionalLinks?.github, personalInfo.github)),
        portfolio: cleanSingleLine(firstText(personalInfo.professionalLinks?.portfolio, personalInfo.portfolio, personalInfo.website)),
        other: cleanSingleLine(firstText(personalInfo.professionalLinks?.other, personalInfo.other)),
      },
    },
    selectedTemplate: 'ats-friendly',
    selectedFont: ATS_SAFE_FONTS.has(selectedFont) ? selectedFont : 'Arial',
    skills: normalizeSkillsForAts(resume.skills, context, limits),
    workExperience: normalizeWorkExperience(resume.workExperience),
    education: normalizeEducation(resume.education),
    projects: normalizeProjects(resume.projects),
    certifications: normalizeCertifications(resume.certifications),
    additionalSections: normalizeAdditionalSections(options.sourceProfile),
    keywordAnalysis,
  };

  hardened.atsQuality = buildAtsQualityReport(hardened, {
    limits,
    jobDescription: options.jobDescription || '',
  });

  return hardened;
};
