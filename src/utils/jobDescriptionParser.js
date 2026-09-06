/**
 * Job description parser
 * Extracts structured metadata from raw job text or imported browser-extension snapshots.
 */
import '../../browser-agent/vacancy-experience.js';

const DEFAULT_PARSE_RESULT = {
  title: '',
  company: '',
  location: '',
  employmentType: '',
  salary: '',
  roleCategory: 'general',
  experience: {
    years: null,
    level: 'unknown',
    requirementText: '',
  },
};

const TITLE_PATTERNS = [
  /^job title:[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
  /^title:[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
  /^position:[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
  /^role:[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
  /^opening(?: for)?:[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
  /^(?:we(?:'re| are)\s+(?:hiring|looking for|seeking)|join us as)\s+(?:an?\s+)?([^,\n]+?)(?:\s+(?:to|who|with)\b|\.(?=\s|$)|[,\n]|$)/im,
];

const COMPANY_PATTERNS = [
  /^(?:company|hiring organization|organization|employer):[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
];

const LOCATION_PATTERNS = [
  /^(?:location|job location):[ \t]*["']?([^"\n]+?)["']?(?:\n|$)/im,
  /^based in\s+([^.\n]+)/im,
];

const EMPLOYMENT_TYPES = [
  { value: 'full-time', pattern: /\bfull[\s-]?time\b/i },
  { value: 'part-time', pattern: /\bpart[\s-]?time\b/i },
  { value: 'contract', pattern: /\bcontract(?:or)?\b/i },
  { value: 'temporary', pattern: /\btemporary\b/i },
  { value: 'internship', pattern: /\bintern(ship)?\b/i },
  { value: 'freelance', pattern: /\bfreelance\b/i },
];

const ROLE_KEYWORDS = [
  'engineer',
  'developer',
  'designer',
  'manager',
  'director',
  'lead',
  'analyst',
  'specialist',
  'architect',
  'consultant',
  'administrator',
  'coordinator',
  'scientist',
  'recruiter',
  'marketer',
  'writer',
  'executive',
  'officer',
  'intern',
  'associate',
  'president', 'assistant', 'nurse', 'physician', 'doctor', 'accountant',
  'attorney', 'teacher', 'driver', 'technician', 'machinist', 'operator',
  'therapist', 'pharmacist', 'researcher', 'representative', 'worker',
  'barista', 'chef', 'cook', 'electrician', 'plumber', 'mechanic',
];

const CORPORATE_HINTS = /\b(inc|llc|ltd|corp|corporation|company|co\.|gmbh|plc|technologies|tech|systems|labs|studio|group|solutions)\b/i;
const GENERIC_LINE_PATTERNS = [
  /^job description$/i,
  /^about (the )?role$/i,
  /^about (the )?company$/i,
  /^summary$/i,
  /^overview$/i,
  /^responsibilities$/i,
  /^requirements$/i,
  /^qualifications$/i,
  /^preferred qualifications$/i,
  /^benefits$/i,
  /^apply(?: now| for this job)?$/i,
  /^what you'll do$/i,
  /^what you will do$/i,
  /^what we're looking for$/i,
];
const LOCATION_HINTS = /\b(remote|hybrid|onsite|on-site|relocation|united states|usa|europe|georgia|poland|germany|canada|uk|united kingdom)\b/i;
const SALARY_PATTERN = /((?:\$|USD|EUR|GBP|PLN)\s?[\d,.Kk]+(?:\s*(?:-|–|to)\s*(?:\$|USD|EUR|GBP|PLN)?\s?[\d,.Kk]+)?(?:\s*(?:\/|per)\s*(?:year|month|hour|yr|mo|hr))?)/i;

const normalizeWhitespace = (value = '') => `${value}`
  .replace(/\u00a0/g, ' ')
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]{2,}/g, ' ')
  .trim();

const sanitizeLine = (value = '') => normalizeWhitespace(value)
  .replace(/^[\s>*#\-\u2022]+/, '')
  .replace(/^["']|["']$/g, '')
  .replace(/[|:,-]+$/g, '')
  .trim();

const isGenericLine = (value = '') => GENERIC_LINE_PATTERNS.some((pattern) => pattern.test(value));

const looksLikeSentence = (value = '') => {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 12 || /[?!]|\.(?:\s|$)/.test(value)
    || /^(?:you\b|we\b|our\b|work\b|collaborate\b|partner\b|report\b|build\b|create\b|develop\b|present\b|experience\s+(?:with|working|of|in)\b|must\b|describe\b|design\s+(?:the|a|an|thoughtful|accessible)\b)/i.test(value);
};

const containsRoleKeyword = (value = '') => ROLE_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(value));

const looksLikeCompany = (value = '') => {
  if (!value || value.length > 80) return false;
  if (containsRoleKeyword(value) && !CORPORATE_HINTS.test(value)) return false;
  if (isGenericLine(value)) return false;
  if (looksLikeSentence(value)) return false;
  if (LOCATION_HINTS.test(value)) return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;

  const titleCaseScore = words.filter((word) => /^[A-Z][A-Za-z0-9&.'()/-]*$/.test(word)).length;
  return CORPORATE_HINTS.test(value) || titleCaseScore >= Math.max(1, words.length - 1);
};

const cleanupTitle = (value = '') => sanitizeLine(value)
  .replace(/^(job title|title|position|role|opening)\s*:\s*/i, '')
  .replace(/^(?:we(?:'re| are)\s+(?:hiring|looking for|seeking)|join us as)\s+(?:an?\s+)?/i, '')
  .replace(/\s+(?:at|@)\s+.+$/i, '')
  .replace(/\s+[|-]\s+(remote|hybrid|onsite|on-site)\b.*$/i, '')
  .trim()
  .slice(0, 120)
  .trim();

const cleanupCompany = (value = '') => sanitizeLine(value)
  .replace(/^(company|hiring organization|organization|employer)\s*:\s*/i, '')
  .trim()
  .slice(0, 80)
  .trim();

const cleanupLocation = (value = '') => sanitizeLine(value)
  .replace(/^(location|job location)\s*:\s*/i, '')
  .trim()
  .slice(0, 120)
  .trim();

const getMeaningfulLines = (description = '') => {
  const seen = new Set();

  return normalizeWhitespace(description)
    .split('\n')
    .map((line) => sanitizeLine(line))
    .filter((line) => line && line.length >= 2)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
};

const pickLabeledValue = (patterns, text, cleanup) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanup(match?.[1] || '');
    if (value) return value;
  }
  return '';
};

const scoreTitleCandidate = (candidate, index) => {
  const value = cleanupTitle(candidate);
  if (!value) return Number.NEGATIVE_INFINITY;
  if (isGenericLine(value)) return Number.NEGATIVE_INFINITY;
  if (looksLikeSentence(value) || !containsRoleKeyword(value)) return Number.NEGATIVE_INFINITY;
  if (/^(?:in|for|about|to)\s+(?:your|our|the|this)\b|\b(?:you|your|we|our)\b|:/.test(value.toLowerCase())) return Number.NEGATIVE_INFINITY;
  if (/^(?:company|location|employment type|salary|benefits)\s*:/i.test(value)) return Number.NEGATIVE_INFINITY;
  if (looksLikeCompany(value) && !containsRoleKeyword(value)) return Number.NEGATIVE_INFINITY;

  let score = 0;

  if (containsRoleKeyword(value)) score += 10;
  if (/\b(senior|staff|principal|lead|junior|intern|manager|director|vp|head|chief)\b/i.test(value)) score += 4;
  if (!looksLikeSentence(value)) score += 3;
  if (value.split(/\s+/).length <= 6) score += 2;
  if (index === 0) score += 8;
  else if (index <= 2) score += 5;
  else if (index <= 5) score += 2;
  if (/^[A-Z]/.test(value)) score += 1;
  if (LOCATION_HINTS.test(value)) score -= 4;
  if (/\b(apply|click|join our team|benefits|responsibilities|requirements)\b/i.test(value)) score -= 5;

  return score;
};

const extractTitleFromLines = (lines = []) => {
  let best = { value: '', score: Number.NEGATIVE_INFINITY };

  lines.slice(0, 12).forEach((line, index) => {
    // A leading role header may share a line with the employer or introductory
    // sentence. Split only header separators, not C++, C#, .NET or title slashes.
    const header = line.split(/\.(?=\s+[A-Z])/)[0].replace(/\.$/, '');
    const parts = header.split(/\s+(?:\||-|—|@|at)\s+/i);
    const isCompanyPair = parts.length > 1 && parts.some((part) => CORPORATE_HINTS.test(part) && looksLikeCompany(part));
    const variants = isCompanyPair || /\s+(?:\||@|at)\s+/i.test(header) ? parts : [header];

    variants.forEach((variant) => {
      const score = scoreTitleCandidate(variant, index);
      if (score > best.score && !(CORPORATE_HINTS.test(variant) && looksLikeCompany(variant))) {
        best = { value: cleanupTitle(variant), score };
      }
    });
  });

  return best.score > 0 ? best.value : '';
};

const extractCompanyFromLines = (lines = [], title = '') => {
  const titleKey = title.toLowerCase();

  for (let index = 0; index < Math.min(lines.length, 12); index += 1) {
    const line = lines[index];
    const normalized = line.toLowerCase();

    if (normalized === titleKey) continue;
    if (isGenericLine(line.replace(/:$/, ''))) break;

    if (/\s+(?:\||-|—|@|at)\s+/i.test(line)) {
      const header = line.split(/\.(?=\s+[A-Z])/)[0].replace(/\.$/, '');
      const [left, right] = header.split(/\s+(?:\||-|—|@|at)\s+/i, 2);
      if (cleanupTitle(left).toLowerCase() === titleKey && looksLikeCompany(right)
        && (CORPORATE_HINTS.test(right) || /\s+(?:\||@|at)\s+/i.test(header))) {
        return cleanupCompany(right);
      }
      if (cleanupTitle(right).toLowerCase() === titleKey && looksLikeCompany(left)
        && (CORPORATE_HINTS.test(left) || /\s+(?:\||@|at)\s+/i.test(header))) {
        return cleanupCompany(left);
      }
    }

    if (looksLikeCompany(line) && !containsRoleKeyword(line)) {
      return cleanupCompany(line);
    }
  }

  return '';
};

const extractLocationFromLines = (lines = []) => {
  for (const line of lines.slice(0, 12)) {
    if (!line || isGenericLine(line)) continue;
    if (/^(?:remote|hybrid|onsite|on-site)\b/i.test(line) && line.split(/\s+/).length <= 8 && !looksLikeSentence(line)) {
      return cleanupLocation(line);
    }
    if (!looksLikeSentence(line) && line.split(',').length === 2 && line.split(',').every((part) => part.trim().split(/\s+/).length <= 4)
      && /^[A-Z][A-Za-z.' -]+,\s*[A-Z][A-Za-z.' -]+$/.test(line)) {
      return cleanupLocation(line);
    }
  }

  return '';
};

const extractEmploymentType = (text = '') => {
  for (const option of EMPLOYMENT_TYPES) {
    if (option.pattern.test(text)) {
      return option.value;
    }
  }
  return '';
};

const extractSalary = (text = '') => cleanText((text.match(SALARY_PATTERN) || [])[0] || '');

function cleanText(value = '') {
  return normalizeWhitespace(value);
}

function extractExperienceYears(text) {
  return globalThis.ResumeATSVacancyExperience.extractExperienceRequirement(text);
}

function determineRoleCategory(jobTitle) {
  const lowerDesc = cleanText(jobTitle).toLowerCase();

  if (/\b(?:designer|ux|ui)\b/.test(lowerDesc)) return 'designer';
  if (/\b(?:product manager|product owner)\b/.test(lowerDesc)) return 'product';

  if (lowerDesc.includes('customer service') ||
      lowerDesc.includes('customer support') ||
      lowerDesc.includes('customer experience')) {
    return 'customer_service';
  }

  if (lowerDesc.includes('software') ||
      lowerDesc.includes('developer') ||
      lowerDesc.includes('engineering') ||
      lowerDesc.includes('programming') ||
      lowerDesc.includes('code')) {
    return 'developer';
  }

  if (lowerDesc.includes('data') ||
      lowerDesc.includes('analyst') ||
      lowerDesc.includes('analytics') ||
      lowerDesc.includes('business intelligence')) {
    return 'analyst';
  }

  if (lowerDesc.includes('marketing') ||
      lowerDesc.includes('social media') ||
      lowerDesc.includes('content') ||
      lowerDesc.includes('growth')) {
    return 'marketer';
  }

  if (lowerDesc.includes('sales') ||
      lowerDesc.includes('account executive') ||
      lowerDesc.includes('business development')) {
    return 'sales';
  }

  if (lowerDesc.includes('product manager') ||
      lowerDesc.includes('product owner')) {
    return 'product';
  }

  if (lowerDesc.includes('manager') ||
      lowerDesc.includes('director') ||
      lowerDesc.includes('lead')) {
    return 'manager';
  }

  return 'general';
}

function determineExperienceLevel(years, jobTitle) {
  const lowerText = cleanText(jobTitle).toLowerCase();

  if (/^executive assistant\b|\b(?:assistant|coordinator)\s+(?:to|for)\b/.test(lowerText)) return 'unknown';
  if (/\b(chief|head|director|vice president|vp)\b/.test(lowerText) || /^executive\b/.test(lowerText)) {
    return 'executive';
  }

  if (/\b(senior|lead|principal|staff|architect)\b/.test(lowerText)) {
    return 'senior';
  }

  if (/\b(junior|entry|intern|internship|associate|trainee|apprentice)\b/.test(lowerText)) {
    return 'entry';
  }

  if (years === null) {
    return 'unknown';
  }

  if (years <= 2) return 'entry';
  if (years <= 5) return 'mid';
  return 'senior';
}

export const formatJobExperience = (experience) => {
  const level = ['entry', 'mid', 'senior', 'executive'].includes(experience?.level) ? experience.level : '';
  const requirement = experience?.requirementText || (Number.isFinite(experience?.years) ? `${experience.years} years` : '');
  return requirement ? `${requirement}${level ? ` (${level})` : ''}` : level || 'Not specified';
};

export const parseJobDescription = (jobDescription) => {
  if (!jobDescription) {
    return { ...DEFAULT_PARSE_RESULT, experience: { ...DEFAULT_PARSE_RESULT.experience } };
  }

  const text = cleanText(jobDescription);
  const lines = getMeaningfulLines(text);

  const metadataText = text.split('\n').map((line) => line.replace(/^[\s>*#\u2022-]+/, '')).join('\n');
  const labeledTitle = pickLabeledValue(TITLE_PATTERNS, metadataText, cleanupTitle);
  const title = labeledTitle || extractTitleFromLines(lines);
  const company = pickLabeledValue(COMPANY_PATTERNS, metadataText, cleanupCompany) || extractCompanyFromLines(lines, title);
  const location = pickLabeledValue(LOCATION_PATTERNS, metadataText, cleanupLocation) || extractLocationFromLines(lines);
  const employmentType = extractEmploymentType(text);
  const salary = extractSalary(text);
  const experience = extractExperienceYears(text);
  const experienceLevel = determineExperienceLevel(experience.years, title);
  const roleCategory = determineRoleCategory(title);

  return {
    title,
    company,
    location,
    employmentType,
    salary,
    roleCategory,
    experience: {
      ...experience,
      level: experienceLevel,
    },
  };
};
