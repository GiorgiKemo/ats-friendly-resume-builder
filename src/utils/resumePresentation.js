const normalizeText = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const isGenericResumeLabel = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return !normalized || [
    'untitled',
    'untitled resume',
    'resume',
    'my resume',
    'ats friendly resume',
  ].includes(normalized);
};

const sanitizeDerivedJobTitle = (value, fullName = '') => {
  if (!value) return '';

  let normalized = normalizeText(value);
  const safeFullName = normalizeText(fullName);

  const generatedForMatch = normalized.match(/^generated for\s+(.+?)\s+at\s+/i);
  if (generatedForMatch?.[1]) {
    normalized = generatedForMatch[1];
  }

  if (safeFullName) {
    const escapedFullName = safeFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized
      .replace(new RegExp(`^${escapedFullName}\\s*[-|:]\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*[-|:]\\s*${escapedFullName}$`, 'i'), '')
      .replace(new RegExp(escapedFullName, 'i'), '')
      .trim();
  }

  normalized = normalized
    .replace(/\b(ats[\s-]*friendly|resume|cv|builder)\b/gi, '')
    .replace(/^[\s\-:|]+|[\s\-:|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (isGenericResumeLabel(normalized)) {
    return '';
  }

  return normalized;
};

const pickFirstValue = (...values) => values.find((value) => normalizeText(value));

export const getResumeProfessionalLinks = (personalInfo = {}) => {
  const professionalLinks = personalInfo.professionalLinks || {};
  const candidates = [
    { key: 'linkedin', value: pickFirstValue(personalInfo.linkedin, professionalLinks.linkedin) },
    { key: 'github', value: pickFirstValue(personalInfo.github, professionalLinks.github) },
    { key: 'portfolio', value: pickFirstValue(personalInfo.website, personalInfo.portfolio, professionalLinks.portfolio) },
    { key: 'other', value: pickFirstValue(personalInfo.otherLink, personalInfo.other, professionalLinks.other) },
  ];

  const seen = new Set();
  const items = candidates
    .map((item) => ({ ...item, value: normalizeText(item.value) }))
    .filter((item) => {
      if (!item.value) return false;
      const dedupeKey = item.value.toLowerCase();
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });

  return {
    linkedin: items.find((item) => item.key === 'linkedin')?.value || '',
    github: items.find((item) => item.key === 'github')?.value || '',
    portfolio: items.find((item) => item.key === 'portfolio')?.value || '',
    other: items.find((item) => item.key === 'other')?.value || '',
    items,
    all: items.map((item) => item.value),
  };
};

export const getResumeDisplayJobTitle = (resume = {}) => {
  const personalInfo = resume.personalInfo || resume.personal_info || {};
  const fullName = personalInfo.fullName || personalInfo.full_name || '';

  const explicit = pickFirstValue(
    personalInfo.jobTitle,
    personalInfo.professionalTitle,
    personalInfo.headline,
  );
  if (explicit) {
    return normalizeText(explicit);
  }

  const workExperience = resume.workExperience || resume.work_experience || [];
  const latestRole = workExperience.find((job) => job?.current || job?.isCurrentRole || job?.isCurrent)
    || workExperience[0];
  const latestRoleTitle = pickFirstValue(
    latestRole?.jobTitle,
    latestRole?.title,
    latestRole?.position,
    latestRole?.role,
  );
  if (latestRoleTitle) {
    return normalizeText(latestRoleTitle);
  }

  const derivedFromTitle = sanitizeDerivedJobTitle(resume.title, fullName);
  if (derivedFromTitle) {
    return derivedFromTitle;
  }

  const derivedFromDescription = sanitizeDerivedJobTitle(resume.description, fullName);
  if (derivedFromDescription) {
    return derivedFromDescription;
  }

  return '';
};
