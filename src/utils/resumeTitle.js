import { parseJobDescription } from './jobDescriptionParser.js';
import { getResumeDisplayJobTitle } from './resumePresentation.js';
import { sanitizeTargetJobTitle } from './resumeAuthenticity.js';

const normalizeText = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const GENERIC_TITLES = new Set([
  '',
  'untitled resume',
  'resume',
  'my resume',
  'ats friendly resume',
  'ai generated resume',
  'generated resume',
]);

const INVALID_ROLE_TITLES = new Set([
  'job description',
  'description',
  'overview',
  'summary',
  'about the role',
  'responsibilities',
  'requirements',
  'qualifications',
  'about us',
  'about the company',
]);

const isGenericTitle = (value) => GENERIC_TITLES.has(normalizeText(value).toLowerCase());

const cleanupRoleTitle = (value) => {
  let normalized = normalizeText(value)
    .replace(/^(job title|position|role)\s*:\s*/i, '')
    .replace(/^generated for\s*:\s*/i, '')
    .replace(/\bresume\b$/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[|:,-]+$/g, '')
    .trim();

  if (!normalized) return '';

  if (INVALID_ROLE_TITLES.has(normalized.toLowerCase())) {
    return '';
  }

  if (normalized.length > 80) {
    normalized = normalized.slice(0, 80).trim();
  }

  return normalized;
};

const cleanupCompanyName = (value) => {
  const normalized = normalizeText(value)
    .replace(/^company\s*:\s*/i, '')
    .replace(/[|:,-]+$/g, '')
    .trim();

  if (!normalized) return '';
  if (normalized.length > 60) {
    return normalized.slice(0, 60).trim();
  }

  return normalized;
};

export const extractCompanyFromJobDescription = (jobDescription = '') => {
  const rawDescription = typeof jobDescription === 'string' ? jobDescription.trim() : '';
  const description = normalizeText(jobDescription);
  if (!rawDescription && !description) return '';

  const parsedJob = parseJobDescription(rawDescription || description);
  const parsedCompany = cleanupCompanyName(parsedJob?.company || '');
  if (parsedCompany) {
    return parsedCompany;
  }

  const patterns = [
    /company:\s*["']?([^"',\n.]+)["']?/i,
    /(?:at|for|with)\s+([A-Z][A-Za-z0-9&.'()/-]+(?:\s+[A-Z][A-Za-z0-9&.'()/-]+){0,4})(?:\s+(?:is|are|seeks|seeking|looking|hiring|to)\b|[,\n.])/m,
  ];

  for (const pattern of patterns) {
    const match = rawDescription.match(pattern);
    const company = cleanupCompanyName(match?.[1] || '');
    if (company) {
      return company;
    }
  }

  return '';
};

const buildRoleBasedTitle = (roleTitle, companyName) => {
  if (roleTitle && companyName) {
    return `${roleTitle} - ${companyName}`;
  }

  if (roleTitle) {
    return `${roleTitle} Resume`;
  }

  if (companyName) {
    return `${companyName} Resume`;
  }

  return '';
};

export const deriveResumeTitle = (resume = {}, jobDescription = '') => {
  const explicitTitle = normalizeText(resume.title);
  if (explicitTitle && !isGenericTitle(explicitTitle)) {
    return explicitTitle;
  }

  const rawJobDescription = typeof jobDescription === 'string' ? jobDescription.trim() : '';
  const normalizedJobDescription = normalizeText(jobDescription);
  if (normalizedJobDescription) {
    const parsedJob = parseJobDescription(rawJobDescription || normalizedJobDescription);
    const parsedRoleTitle = cleanupRoleTitle(sanitizeTargetJobTitle(parsedJob?.title));
    const companyName = cleanupCompanyName(parsedJob?.company) || extractCompanyFromJobDescription(rawJobDescription || normalizedJobDescription);
    const generatedTitle = buildRoleBasedTitle(parsedRoleTitle, companyName);
    if (generatedTitle) {
      return generatedTitle;
    }
  }

  const derivedRoleTitle = cleanupRoleTitle(getResumeDisplayJobTitle(resume));
  if (derivedRoleTitle) {
    return `${derivedRoleTitle} Resume`;
  }

  const personalInfo = resume.personalInfo || resume.personal_info || {};
  const fullName = normalizeText(personalInfo.fullName || personalInfo.full_name || '');
  if (fullName) {
    return `${fullName} Resume`;
  }

  return 'Untitled Resume';
};
