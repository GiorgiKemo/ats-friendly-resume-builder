import { assertCommittedResume } from '../utils/resumeTailoringReview.js';
import { getSafeExternalUrl } from '../utils/urlSafety.js';
export { loadBrowserAgentSavedResume } from './browserAgentResumeArtifact.js';

const APP_SOURCE = 'resumeats-web';
const AGENT_SOURCE = 'resumeats-browser-agent';
const BRIDGE_TIMEOUT_MS = 1800;
const PRODUCTION_APP_URL = 'https://resumeats.cv';

export const SUPPORTED_ATS_PROVIDERS = [
  {
    id: 'greenhouse',
    label: 'Greenhouse',
    domains: ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'greenhouse.io'],
    patterns: [/greenhouse\.io/i],
  },
  {
    id: 'lever',
    label: 'Lever',
    domains: ['jobs.lever.co', 'lever.co'],
    patterns: [/lever\.co/i],
  },
  {
    id: 'workday',
    label: 'Workday',
    domains: ['myworkdayjobs.com', 'workday.com'],
    patterns: [/myworkdayjobs\.com/i, /workday\.com/i],
  },
  {
    id: 'ashby',
    label: 'Ashby',
    domains: ['jobs.ashbyhq.com', 'ashbyhq.com'],
    patterns: [/ashbyhq\.com/i],
  },
  {
    id: 'icims',
    label: 'iCIMS',
    domains: ['careers.icims.com', 'icims.com'],
    patterns: [/icims\.com/i],
  },
  {
    id: 'smartrecruiters',
    label: 'SmartRecruiters',
    domains: ['jobs.smartrecruiters.com', 'smartrecruiters.com'],
    patterns: [/smartrecruiters\.com/i],
  },
  {
    id: 'workable',
    label: 'Workable',
    domains: ['jobs.workable.com', 'workable.com'],
    patterns: [/workable\.com/i],
  },
  {
    id: 'bamboohr',
    label: 'BambooHR',
    domains: ['bamboohr.com'],
    patterns: [/bamboohr\.com/i],
  },
  {
    id: 'jobvite',
    label: 'Jobvite',
    domains: ['jobs.jobvite.com', 'jobvite.com'],
    patterns: [/jobvite\.com/i],
  },
  {
    id: 'bullhorn',
    label: 'Bullhorn',
    domains: [],
    patterns: [/bullhorn-oscp/i, /bullhorn/i],
  },
  {
    id: 'manatal',
    label: 'Manatal',
    domains: ['careers-page.com'],
    patterns: [/careers-page\.com/i, /manatal/i],
  },
  {
    id: 'traffit',
    label: 'Traffit',
    domains: ['traffit.com'],
    patterns: [/traffit\.com/i],
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    domains: ['linkedin.com'],
    patterns: [/linkedin\.com/i],
  },
  {
    id: 'indeed',
    label: 'Indeed',
    domains: ['indeed.com'],
    patterns: [/indeed\.com/i],
  },
  {
    id: 'google',
    label: 'Google Jobs',
    domains: ['google.com'],
    patterns: [/google\.[^/]+/i],
  },
];

const prettifySlug = (value = '') => decodeURIComponent(value)
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (match) => match.toUpperCase());

const buildBridgeRequest = (type, payload, timeoutMs = BRIDGE_TIMEOUT_MS) => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser agent is only available in the browser'));
  }

  return new Promise((resolve, reject) => {
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let timeoutId;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) window.clearTimeout(timeoutId);
    };

    const handleMessage = (event) => {
      const message = event.data;

      if (
        event.source !== window ||
        !message ||
        message.source !== AGENT_SOURCE ||
        message.target !== APP_SOURCE ||
        message.requestId !== requestId ||
        message.type !== `${type}:response`
      ) {
        return;
      }

      cleanup();

      if (message.success === false) {
        reject(new Error(message.error || 'Browser agent request failed'));
        return;
      }

      resolve(message.payload || {});
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Browser agent not detected. Load the extension and refresh this page.'));
    }, timeoutMs);

    window.addEventListener('message', handleMessage);
    window.postMessage(
      {
        source: APP_SOURCE,
        target: AGENT_SOURCE,
        type,
        requestId,
        payload,
      },
      window.origin
    );
  });
};

export const pingBrowserAgent = async () => buildBridgeRequest('PING');
export const getBrowserAgentState = async () => buildBridgeRequest('GET_STATE');
export const getBrowserAgentQueue = async () => {
  const state = await getBrowserAgentState();
  return Array.isArray(state?.queue) ? state.queue : [];
};
export const syncBrowserAgentProfile = async (payload) => buildBridgeRequest('SYNC_PROFILE', payload ? { ...payload, documents: {} } : payload);
export const queueBrowserAgentJobs = async (payload) => buildBridgeRequest('QUEUE_JOBS', payload);
export const startBrowserAgentRun = async () => buildBridgeRequest('START_RUN');
export const clearBrowserAgentQueue = async () => buildBridgeRequest('CLEAR_QUEUE');
export const getRecentBrowserAgentJobPosting = async () => buildBridgeRequest('GET_RECENT_JOB_POSTING', undefined, 5000);
export const captureActiveBrowserAgentJobPosting = async () => buildBridgeRequest('CAPTURE_ACTIVE_JOB_POSTING', undefined, 5000);
export const getBrowserAgentResumeHandoff = async (handoffId) => buildBridgeRequest('GET_RESUME_HANDOFF', { handoffId }, 15000);
export const completeBrowserAgentResumeHandoff = async ({ handoffId, resumeId, expectedRevision }) => buildBridgeRequest('COMPLETE_RESUME_HANDOFF', { handoffId, resumeId, expectedRevision }, 60000);
export const cancelBrowserAgentResumeHandoff = async (handoffId) => buildBridgeRequest('CANCEL_RESUME_HANDOFF', { handoffId }, 15000);

export const detectAtsProvider = (jobUrl = '') => {
  if (!jobUrl) return null;

  try {
    const hostname = new URL(jobUrl).hostname.toLowerCase();
    return SUPPORTED_ATS_PROVIDERS.find((provider) => (
      provider.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
      || provider.patterns.some((pattern) => pattern.test(jobUrl))
    )) || null;
  } catch {
    return SUPPORTED_ATS_PROVIDERS.find((provider) => (
      provider.patterns.some((pattern) => pattern.test(jobUrl))
    )) || null;
  }
};

export const parseDirectAtsJobUrl = (jobUrl = '') => {
  try {
    const normalizedUrl = getSafeExternalUrl(jobUrl);
    if (!normalizedUrl) return null;
    const url = new URL(normalizedUrl);
    const provider = detectAtsProvider(normalizedUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const hostnameBase = url.hostname.replace(/^www\./, '');
    const companyFallback = prettifySlug(hostnameBase.split('.')[0] || 'company');

    if (!provider) {
      return {
        providerId: 'generic',
        providerLabel: 'Web Apply',
        company: companyFallback,
        title: prettifySlug(segments.at(-1) || segments[0] || 'job application') || 'Job Application',
        normalizedUrl,
      };
    }

    if (provider.id === 'greenhouse') {
      const companySegment = segments[0] || hostnameBase.split('.')[0] || 'company';
      return {
        providerId: provider.id,
        providerLabel: provider.label,
        company: prettifySlug(companySegment),
        title: 'Application via Greenhouse',
        normalizedUrl,
      };
    }

    if (provider.id === 'lever') {
      const companySegment = segments[0] || hostnameBase.split('.')[0] || 'company';
      const titleSegment = segments[1] || 'application';
      return {
        providerId: provider.id,
        providerLabel: provider.label,
        company: prettifySlug(companySegment),
        title: prettifySlug(titleSegment) || 'Application via Lever',
        normalizedUrl,
      };
    }

    const companySegment = segments[0] || hostnameBase.split('.')[0] || 'company';
    const titleSegment = segments.at(-1) || segments[1] || segments[0] || 'application';
    return {
      providerId: provider.id,
      providerLabel: provider.label,
      company: prettifySlug(companySegment),
      title: prettifySlug(titleSegment) || `Application via ${provider.label}`,
      normalizedUrl,
    };
  } catch {
    return null;
  }
};

export const getSupportedBrowserAgentJobs = (jobs = []) => (
  jobs
    .filter((job) => {
      const status = job.status || 'discovered';
      if (!getSafeExternalUrl(job.job_url)) return false;
      if (['replied', 'interview', 'rejected', 'skipped'].includes(status)) return false;
      if ((job.sent_via || '').toLowerCase() === 'browser_agent') return false;
      return ['discovered', 'queued', 'failed', 'applied', 'applying'].includes(status);
    })
    .map((job) => {
      const provider = detectAtsProvider(job.job_url);
      return {
        ...job,
        job_url: getSafeExternalUrl(job.job_url),
        ats_provider: provider?.id || 'generic',
        ats_provider_label: provider?.label || 'Web Apply',
      };
    })
);

const asRecord = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeList = (items) => asArray(items).filter(Boolean);

const pickFirstNonEmpty = (...values) => values.find((value) => {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && `${value}`.trim() !== '';
});

const COUNTRY_CALLING_CODES = [
  '+1', '+7', '+20', '+27', '+30', '+31', '+32', '+33', '+34', '+36', '+39', '+40', '+41', '+43', '+44', '+45', '+46', '+47', '+48', '+49',
  '+51', '+52', '+53', '+54', '+55', '+56', '+57', '+58', '+60', '+61', '+62', '+63', '+64', '+65', '+66', '+81', '+82', '+84', '+86',
  '+90', '+91', '+92', '+93', '+94', '+95', '+98', '+212', '+213', '+216', '+218', '+220', '+221', '+222', '+223', '+224', '+225', '+226',
  '+227', '+228', '+229', '+230', '+231', '+232', '+233', '+234', '+235', '+236', '+237', '+238', '+239', '+240', '+241', '+242', '+243',
  '+244', '+245', '+246', '+248', '+249', '+250', '+251', '+252', '+253', '+254', '+255', '+256', '+257', '+258', '+260', '+261', '+262',
  '+263', '+264', '+265', '+266', '+267', '+268', '+269', '+290', '+291', '+297', '+298', '+299', '+350', '+351', '+352', '+353', '+354',
  '+355', '+356', '+357', '+358', '+359', '+370', '+371', '+372', '+373', '+374', '+375', '+376', '+377', '+378', '+380', '+381', '+382',
  '+383', '+385', '+386', '+387', '+389', '+420', '+421', '+423', '+500', '+501', '+502', '+503', '+504', '+505', '+506', '+507', '+508',
  '+509', '+590', '+591', '+592', '+593', '+594', '+595', '+596', '+597', '+598', '+599', '+670', '+672', '+673', '+674', '+675', '+676',
  '+677', '+678', '+679', '+680', '+681', '+682', '+683', '+685', '+686', '+687', '+688', '+689', '+690', '+691', '+692', '+850', '+852',
  '+853', '+855', '+856', '+880', '+886', '+960', '+961', '+962', '+963', '+964', '+965', '+966', '+967', '+968', '+970', '+971', '+972',
  '+973', '+974', '+975', '+976', '+977', '+992', '+993', '+994', '+995', '+996', '+998',
].sort((left, right) => right.length - left.length);

const extractPhoneCountryCode = (value = '') => {
  const compact = `${value}`.trim().replace(/[^\d+]/g, '');
  if (!compact.startsWith('+')) return '';
  return COUNTRY_CALLING_CODES.find((code) => compact.startsWith(code)) || compact.match(/^\+\d{1,3}/)?.[0] || '';
};

const splitName = (fullName = '') => {
  const parts = `${fullName}`.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};

const flattenSkills = (...collections) => {
  const seen = new Set();
  const skills = [];

  collections.flatMap((collection) => asArray(collection)).forEach((item) => {
    const value = typeof item === 'string'
      ? item
      : item?.name || item?.skill || item?.title || '';

    const normalized = `${value}`.trim();
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    skills.push(normalized);
  });

  return skills;
};

const normalizeTextContent = (value) => {
  if (value === undefined || value === null) return '';

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeTextContent(entry))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    const prioritizedValues = [
      value.text,
      value.content,
      value.value,
      value.description,
      value.summary,
      value.responsibilities,
      value.achievements,
      value.duties,
      value.details,
      value.notes,
    ];

    const normalized = prioritizedValues
      .map((entry) => normalizeTextContent(entry))
      .filter(Boolean)
      .join('\n');

    if (normalized) return normalized;

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
};

const normalizeWorkExperience = (items = []) => normalizeList(items).map((item) => ({
  company: item.company || item.employer || '',
  title: item.jobTitle || item.title || item.position || '',
  location: item.location || '',
  startDate: item.startDate || '',
  endDate: item.endDate || '',
  current: Boolean(item.current),
  description: normalizeTextContent(
    item.description
    || item.responsibilities
    || item.achievements
    || item.duties
    || item.summary
  ),
})).filter((item) => item.company || item.title || item.description);

const normalizeEducation = (items = []) => normalizeList(items).map((item) => ({
  institution: item.institution || item.school || '',
  degree: item.degree || '',
  fieldOfStudy: item.fieldOfStudy || item.field || '',
  startDate: item.startDate || '',
  endDate: item.endDate || '',
  description: normalizeTextContent(item.description || item.details || item.summary),
})).filter((item) => item.institution || item.degree || item.fieldOfStudy);

const normalizeProjects = (items = []) => normalizeList(items).map((item) => ({
  title: item.title || item.name || '',
  description: normalizeTextContent(item.description || item.details || item.summary),
  url: item.url || '',
})).filter((item) => item.title || item.description || item.url);

export const buildBrowserAgentProfile = async ({
  user,
  preferences,
  resume,
  userProfile,
  autoSubmit = true,
}) => {
  assertCommittedResume(resume);
  const profilePersonal = asRecord(userProfile?.personal);
  const applicationProfile = {
    ...asRecord(profilePersonal.applicationProfile),
    ...asRecord(userProfile?.applicationProfile),
  };
  const resumePersonal = asRecord(resume?.personalInfo);
  const professionalLinks = asRecord(profilePersonal.professionalLinks);
  const fullName = pickFirstNonEmpty(
    resumePersonal.fullName,
    resumePersonal.full_name,
    profilePersonal.fullName,
    profilePersonal.full_name,
    profilePersonal.name,
    applicationProfile.fullName,
    applicationProfile.name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
    ''
  ) || '';
  const { firstName, lastName } = splitName(fullName);
  const email = pickFirstNonEmpty(resumePersonal.email, profilePersonal.email, user?.email, '') || '';
  const phone = pickFirstNonEmpty(
    resumePersonal.phone,
    resumePersonal.phoneNumber,
    profilePersonal.phone,
    profilePersonal.phoneNumber,
    applicationProfile.phone,
    applicationProfile.phoneNumber,
    ''
  ) || '';
  const location = pickFirstNonEmpty(resumePersonal.location, profilePersonal.location, applicationProfile.location, '') || '';
  const linkedin = pickFirstNonEmpty(resumePersonal.linkedin, professionalLinks.linkedin, '') || '';
  const github = pickFirstNonEmpty(professionalLinks.github, '') || '';
  const portfolio = pickFirstNonEmpty(professionalLinks.portfolio, professionalLinks.other, '') || '';
  const website = pickFirstNonEmpty(professionalLinks.portfolio, professionalLinks.other, '') || '';
  const workExperience = normalizeWorkExperience([
    ...asArray(resume?.workExperience),
    ...asArray(userProfile?.workExperience),
  ]);
  const education = normalizeEducation([
    ...asArray(resume?.education),
    ...asArray(userProfile?.education),
  ]);
  const projects = normalizeProjects([
    ...asArray(resume?.projects),
    ...asArray(userProfile?.projects),
  ]);
  const skills = flattenSkills(resume?.skills, userProfile?.skills, preferences?.skills);
  const primaryExperience = workExperience[0] || {};
  const highestEducation = education[0] || {};
  const locationParts = `${location}`.split(',').map((entry) => entry.trim()).filter(Boolean);
  const inferredCity = locationParts[0] || '';
  const inferredCountry = locationParts.at(-1) || '';
  const phoneCountryCode = extractPhoneCountryCode(applicationProfile.phoneCountryCode)
    || extractPhoneCountryCode(phone)
    || '';
  const configuredAppUrl = `${import.meta.env.VITE_APP_URL || ''}`.trim();
  const appUrl = /^https?:\/\//i.test(configuredAppUrl)
    ? configuredAppUrl.replace(/\/$/, '')
    : (typeof window !== 'undefined' && /^https?:\/\//i.test(window.location.origin)
      ? window.location.origin.replace(/\/$/, '')
      : PRODUCTION_APP_URL);

  return {
    version: '2026-09-04',
    generatedAt: new Date().toISOString(),
    candidate: {
      userId: user?.id || '',
      fullName,
      firstName,
      lastName,
      email,
      phone,
      location,
      currentTitle: primaryExperience.title || '',
      currentCompany: primaryExperience.company || '',
      linkedin,
      github,
      portfolio,
      website,
    },
    personal: {
      fullName,
      firstName,
      lastName,
      email,
      phone,
      location,
      linkedin,
      github,
      portfolio,
      website,
      professionalLinks,
    },
    personalInfo: {
      ...resumePersonal,
      fullName: resumePersonal.fullName || fullName,
      email: resumePersonal.email || email,
      phone: resumePersonal.phone || phone,
      location: resumePersonal.location || location,
      linkedin: resumePersonal.linkedin || linkedin,
      github: resumePersonal.github || github,
      portfolio: resumePersonal.portfolio || portfolio,
      website: resumePersonal.website || website,
    },
    preferences: {
      jobTitles: normalizeList(preferences?.job_titles),
      remotePreference: preferences?.remote_preference || 'any',
      experienceLevel: preferences?.experience_level || 'mid',
      locations: normalizeList(preferences?.locations),
      dailyLimit: preferences?.daily_limit || 10,
    },
    skills,
    experience: workExperience,
    education,
    projects,
    answers: {
      workAuthorization: applicationProfile.workAuthorization || '',
      requiresSponsorship: applicationProfile.requiresSponsorship || '',
      currentCompany: primaryExperience.company || '',
      currentTitle: primaryExperience.title || '',
      highestEducation: applicationProfile.highestEducation || `${highestEducation.degree || ''} ${highestEducation.fieldOfStudy || ''}`.trim(),
      yearsOfExperience: applicationProfile.yearsOfExperience || '',
      preferredWorkSetup: applicationProfile.preferredWorkSetup || preferences?.remote_preference || 'any',
      salaryExpectation: applicationProfile.salaryExpectation || '',
      preferredLocations: normalizeList(preferences?.locations),
      noticePeriod: applicationProfile.noticePeriod || '',
      fullName,
      firstName,
      lastName,
      email,
      phone,
      phoneCountryCode,
      city: applicationProfile.city || inferredCity,
      stateProvince: applicationProfile.stateProvince || '',
      country: applicationProfile.country || inferredCountry,
      school: applicationProfile.school || highestEducation.institution || '',
      degreePursuing: applicationProfile.degreePursuing || '',
      relevantCourses: applicationProfile.relevantCourses || '',
      heardAbout: applicationProfile.heardAbout || '',
      referredByEmployee: applicationProfile.referredByEmployee || '',
      referralName: applicationProfile.referralName || '',
      currentEmployee: applicationProfile.currentEmployee || '',
      previousEmployee: applicationProfile.previousEmployee || '',
      previousEmploymentDetails: applicationProfile.previousEmploymentDetails || '',
      backgroundCheckConsent: applicationProfile.backgroundCheckConsent || '',
      privacyConsent: applicationProfile.privacyConsent || '',
      accommodationRequest: applicationProfile.accommodationRequest || '',
      gender: applicationProfile.gender || '',
      raceEthnicity: applicationProfile.raceEthnicity || '',
      hispanicLatino: applicationProfile.hispanicLatino || '',
      veteranStatus: applicationProfile.veteranStatus || '',
      disabilityStatus: applicationProfile.disabilityStatus || '',
      linkedinUrl: linkedin,
      githubUrl: github,
      portfolioUrl: portfolio,
      websiteUrl: website,
    },
    // Resume documents are selected separately and held as short-lived,
    // revision-bound session artifacts. Profile sync never creates a PDF.
    documents: {},
    automation: {
      autoSubmit,
      source: 'resumeats',
      supportedProviders: SUPPORTED_ATS_PROVIDERS.map((provider) => provider.id),
    },
    integration: {
      appUrl,
    },
  };
};

export const buildBrowserAgentQueue = (jobs = []) => (
  getSupportedBrowserAgentJobs(jobs).map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.job_url,
    provider: job.ats_provider,
    providerLabel: job.ats_provider_label,
    location: job.location || '',
    matchScore: job.match_score || 0,
  }))
);

export const getBrowserAgentReadiness = ({
  browserAgentState,
  selectedResume,
  userProfile,
  jobs,
}) => {
  const supportedJobs = getSupportedBrowserAgentJobs(jobs);
  const hasProfile = Boolean(
    userProfile?.personal?.fullName ||
    userProfile?.personal?.email ||
    userProfile?.workExperience?.length ||
    userProfile?.skills?.length
  );

  return {
    extensionInstalled: Boolean(browserAgentState?.installed),
    hasSelectedResume: Boolean(selectedResume?.id),
    hasProfile,
    supportedJobsCount: supportedJobs.length,
  };
};

const cleanImportedText = (value = '') => `${value}`
  .replace(/\r/g, '')
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const buildImportedJobDescription = (jobPosting = {}) => {
  const title = cleanImportedText(jobPosting.title || '');
  const company = cleanImportedText(jobPosting.company || '');
  const location = cleanImportedText(jobPosting.location || '');
  const employmentType = cleanImportedText(jobPosting.employmentType || '');
  const salary = cleanImportedText(jobPosting.salary || '');
  const provider = cleanImportedText(jobPosting.providerLabel || jobPosting.provider || '');
  const url = cleanImportedText(jobPosting.url || '');
  const description = cleanImportedText(jobPosting.description || '');

  const lines = [
    title ? `Job Title: ${title}` : '',
    company ? `Company: ${company}` : '',
    location ? `Location: ${location}` : '',
    employmentType ? `Employment Type: ${employmentType}` : '',
    salary ? `Salary: ${salary}` : '',
    provider ? `Source: ${provider}` : '',
    url ? `Job URL: ${url}` : '',
    '',
    'Job Description:',
    description,
  ].filter(Boolean);

  return lines.join('\n').trim();
};
