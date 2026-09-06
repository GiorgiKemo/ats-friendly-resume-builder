import { resumeQuantityTokens } from './resumeQuantities.js';

const toArray = (value) => (Array.isArray(value) ? value : []);

const hasText = (value) => value !== undefined && value !== null && `${value}`.trim() !== '';

const firstText = (...values) => values.find(hasText) || '';
const hasProse = (value) => typeof value === 'string' ? value.trim().length > 0
  : toArray(value).some((entry) => typeof entry === 'string' && entry.trim().length > 0);
const firstProse = (...values) => values.find(hasProse) || '';

// This checks literal quantities, not semantic truth. Candidate review is still required.
const supportedRewrite = (generated, fallback, evidence, allowSynthesis = false) => {
  const sourceProse = firstProse(fallback);
  if (!hasProse(generated) || (!hasProse(sourceProse) && !allowSynthesis)) return sourceProse;
  const sourceNumbers = new Set(resumeQuantityTokens(evidence));
  return resumeQuantityTokens(generated).every((token) => sourceNumbers.has(token)) ? generated : sourceProse;
};

// Numbers in structured identity, date, or technology fields are not achievements.
const numericEvidence = (item = {}) => [
  item.summary, item.professionalSummary, item.description, item.responsibilities,
  item.achievements, item.details,
].flatMap((value) => typeof value === 'string' ? [value] : toArray(value).filter((entry) => typeof entry === 'string'));

const normalize = (value = '') => `${value}`
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
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
  const sourceHeadline = typeof sourcePersonal.jobTitle === 'string' && sourcePersonal.jobTitle.trim() ? sourcePersonal.jobTitle : '';
  const withoutTargetPrefix = (value) => value.replace(/^(?:\s*target\s+role\s*:\s*)+/i, '').trim();
  const targetTitle = sanitizeTargetJobTitle(withoutTargetPrefix(typeof parsedJob.title === 'string' ? parsedJob.title : ''));
  // A vacancy is not a career fact. Only an explicit target may change the
  // headline, and a different role must remain visibly labeled as a target.
  const headline = targetTitle && normalize(targetTitle) !== normalize(withoutTargetPrefix(sourceHeadline))
    ? `Target role: ${targetTitle}` : sourceHeadline;

  const linkedin = firstText(sourcePersonal.linkedin, sourceLinks.linkedin);
  const github = firstText(sourcePersonal.github, sourceLinks.github);
  const portfolio = firstText(
    sourcePersonal.portfolio,
    sourcePersonal.website,
    sourceLinks.portfolio
  );
  const other = firstText(sourcePersonal.other, sourcePersonal.otherLink, sourceLinks.other);
  const sourceSummary = firstProse(sourcePersonal.summary, sourcePersonal.professionalSummary);
  const summaryEvidence = [numericEvidence(sourcePersonal), ...[
    source.workExperience, source.education, source.projects, source.certifications,
  ].flatMap((items) => toArray(items).map(numericEvidence))];

  return {
    ...sourcePersonal,
    fullName: firstText(sourcePersonal.fullName, sourcePersonal.full_name, sourcePersonal.name),
    email: firstText(sourcePersonal.email),
    phone: firstText(sourcePersonal.phone, sourcePersonal.phoneNumber),
    location: firstText(sourcePersonal.location),
    linkedin,
    github,
    website: portfolio,
    portfolio,
    other,
    jobTitle: headline,
    summary: supportedRewrite(firstProse(generated.summary, generated.professionalSummary), sourceSummary, summaryEvidence, true),
    professionalLinks: {
      linkedin,
      github,
      portfolio,
      other,
    },
  };
};

const itemKey = (item = {}, fields = []) => fields
  .map((aliases) => normalize(firstText(...aliases.map((field) => item?.[field]))))
  .join('|');

const findGeneratedMatch = (generatedItems, sourceItem, fields) => {
  const sourceKey = itemKey(sourceItem, fields);
  if (sourceKey.replace(/\|/g, '')) {
    const exact = toArray(generatedItems).find((item) => item && itemKey(item, fields) === sourceKey);
    if (exact) return exact;
  }

  // Never transfer achievements from an unrelated entry based on its array position.
  return {};
};

const workIdentityFields = [['jobTitle', 'title', 'position', 'role'], ['company', 'employer']];
const recordId = (item) => typeof item?.id === 'string' ? item.id.trim() : '';
const compatibleRecordIds = (source, generated) => !recordId(source) || !recordId(generated) || recordId(source) === recordId(generated);
const compatibleTenure = (source, generated) => ['startDate', 'endDate'].every((field) =>
  !hasText(generated[field]) || normalize(source[field]) === normalize(generated[field]))
  && (!Object.hasOwn(generated, 'current') || Boolean(source.current) === Boolean(generated.current));
const matchesTenure = (source, generated) => compatibleRecordIds(source, generated)
  && ['startDate', 'endDate'].some((field) => hasText(generated[field]))
  && compatibleTenure(source, generated);

const findGeneratedWorkMatch = (generatedItems, sourceItem, sourceItems) => {
  const key = itemKey(sourceItem, workIdentityFields);
  if (!key.replace(/\|/g, '')) return {};
  const generated = toArray(generatedItems).filter((item) => item && typeof item === 'object');
  const candidates = generated.filter((item) => itemKey(item, workIdentityFields) === key);
  const peers = sourceItems.filter((item) => itemKey(item, workIdentityFields) === key);
  const id = recordId(sourceItem);

  // IDs identify a source record only when unique on both sides. A copied or
  // conflicting ID/date must never move prose across separate assignments.
  if (id && sourceItems.filter((item) => recordId(item) === id).length === 1) {
    const idMatches = generated.filter((item) => recordId(item) === id);
    if (idMatches.length) {
      return idMatches.length === 1 && candidates.includes(idMatches[0]) && compatibleTenure(sourceItem, idMatches[0])
        ? idMatches[0] : {};
    }
  }

  const dated = candidates.filter((item) => matchesTenure(sourceItem, item));
  if (dated.length === 1 && peers.filter((item) => matchesTenure(item, dated[0])).length === 1) return dated[0];

  // Existing unique roles may omit generated IDs/dates. Repeated roles require
  // unambiguous identity; array ordering is never used as evidence.
  return peers.length === 1 && candidates.length === 1
    && compatibleRecordIds(sourceItem, candidates[0]) && compatibleTenure(sourceItem, candidates[0])
    ? candidates[0] : {};
};

const mergeWorkExperience = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.title || item?.jobTitle || item?.position || item?.role || item?.company || item?.employer || item?.description || item?.responsibilities));
  if (source.length === 0) return [];

  return source.map((item) => {
    const generated = findGeneratedWorkMatch(generatedItems, item, source);
    const title = firstText(item.jobTitle, item.title, item.position, item.role);
    const sourceDescription = firstProse(item.description, item.responsibilities, item.achievements);

    return {
      ...item,
      title,
      jobTitle: title,
      company: firstText(item.company, item.employer),
      location: firstText(item.location),
      startDate: firstText(item.startDate),
      endDate: firstText(item.endDate),
      current: Boolean(item.current),
      description: supportedRewrite(firstProse(generated.description, generated.responsibilities), sourceDescription, numericEvidence(item)),
      responsibilities: supportedRewrite(firstProse(generated.responsibilities, generated.description), firstProse(item.responsibilities, sourceDescription), numericEvidence(item)),
    };
  });
};

const mergeEducation = (_generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.institution || item?.school || item?.degree || item?.fieldOfStudy));
  if (source.length === 0) return [];

  return source.map((item) => {
    return {
      ...item,
      institution: firstText(item.institution, item.school),
      degree: firstText(item.degree),
      fieldOfStudy: firstText(item.fieldOfStudy, item.field),
      location: firstText(item.location),
      startDate: firstText(item.startDate),
      endDate: firstText(item.endDate),
      current: Boolean(item.current),
      description: firstProse(item.description),
    };
  });
};

const mergeProjects = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.title || item?.name || item?.description || item?.url));
  if (source.length === 0) return [];

  return source.map((item) => {
    const generated = findGeneratedMatch(generatedItems, item, [['title', 'name']]);

    return {
      ...item,
      title: firstText(item.title, item.name),
      url: firstText(item.url),
      description: supportedRewrite(generated.description, firstProse(item.description, item.details), numericEvidence(item)),
      technologies: firstText(item.technologies),
      startDate: firstText(item.startDate),
      endDate: firstText(item.endDate),
    };
  });
};

const mergeCertifications = (generatedItems = [], sourceItems = []) => {
  const source = toArray(sourceItems).filter((item) => hasText(item?.name || item?.title || item?.issuer));
  if (source.length === 0) return [];

  return source.map((item) => {
    const generated = findGeneratedMatch(generatedItems, item, [['name', 'title'], ['issuer']]);

    return {
      ...item,
      name: firstText(item.name, item.title),
      issuer: firstText(item.issuer),
      date: firstText(item.date, item.issueDate),
      description: supportedRewrite(generated.description, firstProse(item.description), numericEvidence(item)),
    };
  });
};

export const enforceAuthenticResumeSections = (generatedResume = {}, sourceProfile = {}, parsedJob = {}) => {
  const sourcePersonal = getProfilePersonal(sourceProfile);
  const sourceSkills = normalizeSkills(sourceProfile.skills, sourcePersonal.skills);

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
    skills: sourceSkills,
  };
};
