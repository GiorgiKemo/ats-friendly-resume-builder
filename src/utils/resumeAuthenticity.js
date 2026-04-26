const toArray = (value) => (Array.isArray(value) ? value : []);

const hasText = (value) => value !== undefined && value !== null && `${value}`.trim() !== '';

const firstText = (...values) => values.find(hasText) || '';

const normalize = (value = '') => `${value}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const splitListValue = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(/[,;\n]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
};

const normalizeSkill = (skill) => {
  if (typeof skill === 'string') return skill.trim();
  return firstText(skill?.name, skill?.label, skill?.skill, skill?.title).trim();
};

const normalizeSkills = (...skillLists) => {
  const seen = new Set();
  const result = [];

  skillLists.flatMap(splitListValue).forEach((skill) => {
    const value = normalizeSkill(skill);
    const key = normalize(value);
    if (!value || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });

  return result;
};

const getProfilePersonal = (profile = {}) => profile.personal || profile.personalInfo || {};

const getProfessionalLinks = (personal = {}) => personal.professionalLinks || {};

export const sanitizeTargetJobTitle = (title = '') => {
  let cleaned = `${title || ''}`
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  cleaned = cleaned
    .replace(/\s+(?:at|@)\s+[^|,/()]+.*$/i, '')
    .replace(/\s+[|-]\s+[^|,/()]+.*$/i, '')
    .replace(/,\s*[^,]+$/i, '')
    .replace(/\s*\((?:remote|hybrid|onsite|on-site|[^)]*(?:warsaw|london|berlin|tbilisi|poland|georgia|usa|united states)[^)]*)\)\s*$/i, '')
    .trim();

  return cleaned || `${title || ''}`.trim();
};

const mergePersonalInfo = ({ generated = {}, source = {}, parsedJob = {} }) => {
  const sourcePersonal = getProfilePersonal(source);
  const sourceLinks = getProfessionalLinks(sourcePersonal);
  const generatedLinks = getProfessionalLinks(generated);
  const targetTitle = sanitizeTargetJobTitle(parsedJob.title || generated.jobTitle || sourcePersonal.jobTitle || '');

  const linkedin = firstText(generated.linkedin, generatedLinks.linkedin, sourcePersonal.linkedin, sourceLinks.linkedin);
  const github = firstText(generated.github, generatedLinks.github, sourcePersonal.github, sourceLinks.github);
  const portfolio = firstText(
    generated.portfolio,
    generated.website,
    generatedLinks.portfolio,
    sourcePersonal.portfolio,
    sourcePersonal.website,
    sourceLinks.portfolio
  );
  const other = firstText(generated.other, generatedLinks.other, sourcePersonal.other, sourcePersonal.otherLink, sourceLinks.other);

  return {
    ...generated,
    fullName: firstText(sourcePersonal.fullName, sourcePersonal.full_name, sourcePersonal.name, generated.fullName),
    email: firstText(sourcePersonal.email, generated.email),
    phone: firstText(sourcePersonal.phone, sourcePersonal.phoneNumber, generated.phone),
    location: firstText(sourcePersonal.location, generated.location),
    linkedin,
    github,
    website: portfolio,
    portfolio,
    other,
    jobTitle: targetTitle || firstText(sourcePersonal.jobTitle, generated.jobTitle),
    summary: firstText(generated.summary, generated.professionalSummary, sourcePersonal.summary, sourcePersonal.professionalSummary),
    professionalLinks: {
      linkedin,
      github,
      portfolio,
      other,
    },
  };
};

const itemKey = (item = {}, fields = []) => fields
  .map((field) => normalize(item[field]))
  .filter(Boolean)
  .join('|');

const findGeneratedMatch = (generatedItems, sourceItem, fields, index) => {
  const sourceKey = itemKey(sourceItem, fields);
  if (sourceKey) {
    const exact = generatedItems.find((item) => itemKey(item, fields) === sourceKey);
    if (exact) return exact;
  }

  return generatedItems[index] || {};
};

const mergeWorkExperience = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.title || item?.jobTitle || item?.company || item?.description));
  if (source.length === 0) return [];

  return source.map((item, index) => {
    const generated = findGeneratedMatch(generatedItems, item, ['title', 'jobTitle', 'company'], index);
    const title = firstText(item.jobTitle, item.title);

    return {
      ...generated,
      ...item,
      title,
      jobTitle: title,
      company: firstText(item.company, item.employer),
      location: firstText(item.location),
      startDate: firstText(item.startDate),
      endDate: firstText(item.endDate),
      current: Boolean(item.current),
      description: firstText(generated.description, generated.responsibilities, item.description, item.responsibilities, item.achievements),
      responsibilities: firstText(generated.responsibilities, generated.description, item.responsibilities, item.description, item.achievements),
    };
  });
};

const mergeEducation = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.institution || item?.school || item?.degree || item?.fieldOfStudy));
  if (source.length === 0) return [];

  return source.map((item, index) => {
    const generated = findGeneratedMatch(generatedItems, item, ['institution', 'school', 'degree'], index);

    return {
      ...generated,
      ...item,
      institution: firstText(item.institution, item.school),
      degree: firstText(item.degree),
      fieldOfStudy: firstText(item.fieldOfStudy, item.field),
      location: firstText(item.location),
      startDate: firstText(item.startDate),
      endDate: firstText(item.endDate),
      current: Boolean(item.current),
      description: firstText(item.description, generated.description),
    };
  });
};

const mergeProjects = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.title || item?.name || item?.description || item?.url));
  if (source.length === 0) return [];

  return source.map((item, index) => {
    const generated = findGeneratedMatch(generatedItems, item, ['title', 'name'], index);

    return {
      ...generated,
      ...item,
      title: firstText(item.title, item.name),
      url: firstText(item.url),
      description: firstText(generated.description, item.description, item.details),
      technologies: firstText(generated.technologies, item.technologies),
      startDate: firstText(item.startDate),
      endDate: firstText(item.endDate),
    };
  });
};

const mergeCertifications = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.name || item?.title || item?.issuer));
  if (source.length === 0) return [];

  return source.map((item, index) => {
    const generated = findGeneratedMatch(generatedItems, item, ['name', 'title', 'issuer'], index);

    return {
      ...generated,
      ...item,
      name: firstText(item.name, item.title),
      issuer: firstText(item.issuer),
      date: firstText(item.date, item.issueDate),
      description: firstText(generated.description, item.description),
    };
  });
};

export const enforceAuthenticResumeSections = (generatedResume = {}, sourceProfile = {}, parsedJob = {}) => {
  const sourcePersonal = getProfilePersonal(sourceProfile);
  const sourceSkills = normalizeSkills(sourceProfile.skills, sourcePersonal.skills);
  const generatedSkills = normalizeSkills(generatedResume.skills);

  return {
    ...generatedResume,
    personalInfo: mergePersonalInfo({
      generated: generatedResume.personalInfo || {},
      source: sourceProfile,
      parsedJob,
    }),
    workExperience: mergeWorkExperience(generatedResume.workExperience, sourceProfile.workExperience),
    education: mergeEducation(generatedResume.education, sourceProfile.education),
    projects: mergeProjects(generatedResume.projects, sourceProfile.projects),
    certifications: mergeCertifications(generatedResume.certifications, sourceProfile.certifications),
    skills: sourceSkills.length > 0 ? sourceSkills : generatedSkills,
  };
};
