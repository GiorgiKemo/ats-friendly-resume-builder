/**
 * Job description parser
 * Extracts structured metadata from raw job text or imported browser-extension snapshots.
 */

const DEFAULT_PARSE_RESULT = {
  title: '',
  company: '',
  location: '',
  employmentType: '',
  salary: '',
  roleCategory: 'general',
  experience: {
    years: null,
    level: 'mid',
  },
};

const TITLE_PATTERNS = [
  /job title:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /title:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /position:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /role:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /opening(?: for)?:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /(?:we(?:'re| are)\s+(?:hiring|looking for|seeking)|join us as)\s+(?:an?\s+)?([^.,\n]+?)(?:\s+(?:to|who|with)\b|[.,\n]|$)/i,
];

const COMPANY_PATTERNS = [
  /company:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /hiring organization:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /organization:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /employer:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /(?:about|at|for|with)\s+([A-Z][A-Za-z0-9&.'()/-]+(?:\s+[A-Z][A-Za-z0-9&.'()/-]+){0,5})(?:\s+(?:is|are|seeks|seeking|looking|hiring|offers|builds)\b|[,\n.])/m,
];

const LOCATION_PATTERNS = [
  /location:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /job location:\s*["']?([^"\n]+?)["']?(?:\n|$)/i,
  /based in\s+([^.\n]+)/i,
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
  'sales',
  'support',
  'success',
  'product',
  'operations',
  'executive',
  'officer',
  'intern',
  'associate',
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
  /^apply now$/i,
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
  return words.length > 9 || /[.?!]/.test(value);
};

const containsRoleKeyword = (value = '') => ROLE_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(value));

const looksLikeCompany = (value = '') => {
  if (!value || value.length > 80) return false;
  if (containsRoleKeyword(value)) return false;
  if (isGenericLine(value)) return false;
  if (LOCATION_HINTS.test(value)) return false;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;

  const titleCaseScore = words.filter((word) => /^[A-Z][A-Za-z0-9&.'()/-]*$/.test(word)).length;
  return CORPORATE_HINTS.test(value) || titleCaseScore >= Math.max(1, words.length - 1);
};

const cleanupTitle = (value = '') => sanitizeLine(value)
  .replace(/^(job title|title|position|role|opening)\s*:\s*/i, '')
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
    const variants = [line];

    if (line.includes(' | ')) variants.push(...line.split('|'));
    if (line.includes(' - ')) variants.push(...line.split(' - '));
    if (line.includes(' @ ')) variants.push(...line.split(' @ '));

    variants.forEach((variant) => {
      const score = scoreTitleCandidate(variant, index);
      if (score > best.score) {
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

    if (line.includes(' - ')) {
      const [left, right] = line.split(/\s+-\s+/, 2);
      if (cleanupTitle(left).toLowerCase() === titleKey && looksLikeCompany(right)) {
        return cleanupCompany(right);
      }
      if (cleanupTitle(right).toLowerCase() === titleKey && looksLikeCompany(left)) {
        return cleanupCompany(left);
      }
    }

    if (looksLikeCompany(line)) {
      return cleanupCompany(line);
    }
  }

  return '';
};

const extractLocationFromLines = (lines = []) => {
  for (const line of lines.slice(0, 12)) {
    if (!line || isGenericLine(line)) continue;
    if (/\b(remote|hybrid|onsite|on-site)\b/i.test(line)) {
      return cleanupLocation(line);
    }
    if (/^[A-Z][A-Za-z.' -]+,\s*[A-Z]{2}\b/.test(line) || /^[A-Z][A-Za-z.' -]+,\s*[A-Z][A-Za-z.' -]+$/.test(line)) {
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
  if (!text) return null;

  const patterns = [
    /(\d+)\s*(?:\+|plus)?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi,
    /experience\s+(?:of\s+)?(\d+)\s*(?:\+|plus)?\s*(?:years?|yrs?)/gi,
    /(\d+)\s*[-–to]+\s*(\d+)\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi,
  ];

  const values = [];

  patterns.forEach((pattern) => {
    let match = pattern.exec(text);
    while (match) {
      const first = Number.parseInt(match[1], 10);
      const second = Number.parseInt(match[2], 10);
      if (Number.isFinite(second)) {
        values.push(Math.max(first, second));
      } else if (Number.isFinite(first)) {
        values.push(first);
      }
      match = pattern.exec(text);
    }
  });

  if (values.length === 0) return null;
  return Math.max(...values);
}

function determineRoleCategory(jobDescription) {
  const lowerDesc = cleanText(jobDescription).toLowerCase();

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

function determineExperienceLevel(years, jobTitle, jobDescription) {
  const lowerText = cleanText(`${jobTitle} ${jobDescription}`).toLowerCase();

  if (/\b(chief|head|director|vice president|vp|executive)\b/.test(lowerText)) {
    return 'executive';
  }

  if (/\b(senior|lead|principal|staff|architect)\b/.test(lowerText)) {
    return 'senior';
  }

  if (/\b(junior|entry|intern|internship|associate|trainee|apprentice)\b/.test(lowerText)) {
    return 'entry';
  }

  if (years === null) {
    return 'mid';
  }

  if (years <= 2) return 'entry';
  if (years <= 5) return 'mid';
  if (years <= 10) return 'senior';
  return 'executive';
}

export const parseJobDescription = (jobDescription) => {
  if (!jobDescription) {
    return { ...DEFAULT_PARSE_RESULT };
  }

  const text = cleanText(jobDescription);
  const lines = getMeaningfulLines(text);

  const labeledTitle = pickLabeledValue(TITLE_PATTERNS, text, cleanupTitle);
  const title = labeledTitle || extractTitleFromLines(lines);
  const company = pickLabeledValue(COMPANY_PATTERNS, text, cleanupCompany) || extractCompanyFromLines(lines, title);
  const location = pickLabeledValue(LOCATION_PATTERNS, text, cleanupLocation) || extractLocationFromLines(lines);
  const employmentType = extractEmploymentType(text);
  const salary = extractSalary(text);
  const experienceYears = extractExperienceYears(text);
  const experienceLevel = determineExperienceLevel(experienceYears, title, text);
  const roleCategory = determineRoleCategory(`${title}\n${text}`);

  return {
    title,
    company,
    location,
    employmentType,
    salary,
    roleCategory,
    experience: {
      years: experienceYears,
      level: experienceLevel,
    },
  };
};
