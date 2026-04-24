import { jsPDF } from 'jspdf';
import { supabase } from './supabase';

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
export const syncBrowserAgentProfile = async (payload) => buildBridgeRequest('SYNC_PROFILE', payload);
export const queueBrowserAgentJobs = async (payload) => buildBridgeRequest('QUEUE_JOBS', payload);
export const startBrowserAgentRun = async () => buildBridgeRequest('START_RUN');
export const clearBrowserAgentQueue = async () => buildBridgeRequest('CLEAR_QUEUE');
export const getRecentBrowserAgentJobPosting = async () => buildBridgeRequest('GET_RECENT_JOB_POSTING', undefined, 5000);
export const captureActiveBrowserAgentJobPosting = async () => buildBridgeRequest('CAPTURE_ACTIVE_JOB_POSTING', undefined, 5000);

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
    const url = new URL(jobUrl);
    const provider = detectAtsProvider(jobUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const hostnameBase = url.hostname.replace(/^www\./, '');
    const companyFallback = prettifySlug(hostnameBase.split('.')[0] || 'company');

    if (!provider) {
      return {
        providerId: 'generic',
        providerLabel: 'Web Apply',
        company: companyFallback,
        title: prettifySlug(segments.at(-1) || segments[0] || 'job application') || 'Job Application',
        normalizedUrl: url.toString(),
      };
    }

    if (provider.id === 'greenhouse') {
      const companySegment = segments[0] || hostnameBase.split('.')[0] || 'company';
      return {
        providerId: provider.id,
        providerLabel: provider.label,
        company: prettifySlug(companySegment),
        title: 'Application via Greenhouse',
        normalizedUrl: url.toString(),
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
        normalizedUrl: url.toString(),
      };
    }

    const companySegment = segments[0] || hostnameBase.split('.')[0] || 'company';
    const titleSegment = segments.at(-1) || segments[1] || segments[0] || 'application';
    return {
      providerId: provider.id,
      providerLabel: provider.label,
      company: prettifySlug(companySegment),
      title: prettifySlug(titleSegment) || `Application via ${provider.label}`,
      normalizedUrl: url.toString(),
    };
  } catch {
    return null;
  }
};

export const getSupportedBrowserAgentJobs = (jobs = []) => (
  jobs
    .filter((job) => {
      const status = job.status || 'discovered';
      if (!job.job_url) return false;
      if (['replied', 'interview', 'rejected', 'skipped'].includes(status)) return false;
      if ((job.sent_via || '').toLowerCase() === 'browser_agent') return false;
      return ['discovered', 'queued', 'failed', 'applied', 'applying'].includes(status);
    })
    .map((job) => {
      const provider = detectAtsProvider(job.job_url);
      return {
        ...job,
        ats_provider: provider?.id || 'generic',
        ats_provider_label: provider?.label || 'Web Apply',
      };
    })
);

const normalizeList = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);

const pickFirstNonEmpty = (...values) => values.find((value) => {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && `${value}`.trim() !== '';
});

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

  collections.flat().forEach((item) => {
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

const buildResumeTextLines = (resume, profile) => {
  const resumePersonal = resume?.personalInfo || {};
  const profilePersonal = profile?.personal || {};
  const links = profilePersonal.professionalLinks || {};
  const name = pickFirstNonEmpty(resumePersonal.fullName, profilePersonal.fullName, '') || '';
  const email = pickFirstNonEmpty(resumePersonal.email, profilePersonal.email, '') || '';
  const phone = pickFirstNonEmpty(resumePersonal.phone, profilePersonal.phone, '') || '';
  const location = pickFirstNonEmpty(resumePersonal.location, profilePersonal.location, '') || '';
  const linkedin = pickFirstNonEmpty(resumePersonal.linkedin, links.linkedin, '') || '';
  const github = pickFirstNonEmpty(links.github, '') || '';
  const portfolio = pickFirstNonEmpty(links.portfolio, '') || '';

  const lines = [];

  if (name) lines.push(name.toUpperCase());

  const contactBits = [email, phone, location, linkedin, github, portfolio].filter(Boolean);
  if (contactBits.length > 0) {
    lines.push(contactBits.join(' | '));
    lines.push('');
  }

  const workExperience = normalizeWorkExperience([
    ...(resume?.workExperience || []),
    ...(profile?.workExperience || []),
  ]);

  if (workExperience.length > 0) {
    lines.push('EXPERIENCE');
    lines.push('---');
    workExperience.slice(0, 5).forEach((item) => {
      lines.push(`${item.title}${item.company ? ` at ${item.company}` : ''}${item.startDate ? ` (${item.startDate} - ${item.endDate || (item.current ? 'Present' : '')})` : ''}`);
      if (item.description) {
        item.description
          .split(/\n+/)
          .map((entry) => entry.replace(/^(?:[-*]|\u2022|\u00e2\u20ac\u00a2)\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 4)
          .forEach((entry) => lines.push(`- ${entry}`));
      }
      lines.push('');
    });
  }

  const education = normalizeEducation([
    ...(resume?.education || []),
    ...(profile?.education || []),
  ]);

  if (education.length > 0) {
    lines.push('EDUCATION');
    lines.push('---');
    education.slice(0, 4).forEach((item) => {
      lines.push(`${item.degree}${item.fieldOfStudy ? `, ${item.fieldOfStudy}` : ''}${item.institution ? ` - ${item.institution}` : ''}`);
      if (item.description) lines.push(item.description);
      lines.push('');
    });
  }

  const skills = flattenSkills(resume?.skills, profile?.skills);
  if (skills.length > 0) {
    lines.push('SKILLS');
    lines.push('---');
    lines.push(skills.join(', '));
    lines.push('');
  }

  const projects = normalizeProjects([
    ...(resume?.projects || []),
    ...(profile?.projects || []),
  ]);

  if (projects.length > 0) {
    lines.push('PROJECTS');
    lines.push('---');
    projects.slice(0, 4).forEach((item) => {
      lines.push(`${item.title}${item.url ? ` - ${item.url}` : ''}`);
      if (item.description) lines.push(item.description);
      lines.push('');
    });
  }

  return lines.filter((line) => line !== undefined && line !== null);
};

const createResumePdfBlob = (resume, profile) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const lines = buildResumeTextLines(resume, profile);
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginLeft = 48;
  const maxWidth = pdf.internal.pageSize.getWidth() - marginLeft * 2;
  let y = 56;

  lines.forEach((line, index) => {
    const isHeaderDivider = line === '---';
    const isName = index === 0;
    const isSectionHeader = !isName && line === line.toUpperCase() && line.length > 2 && !line.includes('|') && line !== '---';

    if (isHeaderDivider) {
      pdf.setDrawColor(180);
      pdf.line(marginLeft, y, pdf.internal.pageSize.getWidth() - marginLeft, y);
      y += 14;
      return;
    }

    if (line.trim() === '') {
      y += 8;
      return;
    }

    const fontSize = isName ? 18 : isSectionHeader ? 12 : 10;
    pdf.setFont('helvetica', isName || isSectionHeader ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);

    const renderedLines = pdf.splitTextToSize(
      line.replace(/[^\x20-\x7E]/g, ''),
      maxWidth
    );

    renderedLines.forEach((renderedLine) => {
      if (y > pageHeight - 48) {
        pdf.addPage();
        y = 56;
      }

      pdf.text(renderedLine, marginLeft, y);
      y += isName ? 22 : 14;
    });
  });

  return pdf.output('blob');
};

const ensureResumePdfSignedUrl = async (resume, profile) => {
  if (!resume?.id) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const path = `${user.id}/${resume.id}.pdf`;
  const bucket = supabase.storage.from('resumes');

  const pdfBlob = createResumePdfBlob(resume, profile);
  const uploadResult = await bucket.upload(path, pdfBlob, {
    contentType: 'application/pdf',
    upsert: true,
  });

  if (uploadResult.error) {
    throw uploadResult.error;
  }

  const signedResult = await bucket.createSignedUrl(path, 60 * 60 * 6);
  if (signedResult.error) throw signedResult.error;
  return signedResult.data?.signedUrl || null;
};

export const buildBrowserAgentProfile = async ({
  user,
  preferences,
  resume,
  userProfile,
  autoSubmit = true,
}) => {
  const profilePersonal = userProfile?.personal || {};
  const applicationProfile = {
    ...(profilePersonal.applicationProfile || {}),
    ...(userProfile?.applicationProfile || {}),
  };
  const resumePersonal = resume?.personalInfo || {};
  const professionalLinks = profilePersonal.professionalLinks || {};
  const fullName = pickFirstNonEmpty(
    resumePersonal.fullName,
    profilePersonal.fullName,
    user?.user_metadata?.full_name,
    ''
  ) || '';
  const { firstName, lastName } = splitName(fullName);
  const email = pickFirstNonEmpty(resumePersonal.email, profilePersonal.email, user?.email, '') || '';
  const phone = pickFirstNonEmpty(resumePersonal.phone, profilePersonal.phone, '') || '';
  const location = pickFirstNonEmpty(resumePersonal.location, profilePersonal.location, '') || '';
  const linkedin = pickFirstNonEmpty(resumePersonal.linkedin, professionalLinks.linkedin, '') || '';
  const github = pickFirstNonEmpty(professionalLinks.github, '') || '';
  const portfolio = pickFirstNonEmpty(professionalLinks.portfolio, professionalLinks.other, '') || '';
  const website = pickFirstNonEmpty(professionalLinks.portfolio, professionalLinks.other, '') || '';
  const workExperience = normalizeWorkExperience([
    ...(resume?.workExperience || []),
    ...(userProfile?.workExperience || []),
  ]);
  const education = normalizeEducation([
    ...(resume?.education || []),
    ...(userProfile?.education || []),
  ]);
  const projects = normalizeProjects([
    ...(resume?.projects || []),
    ...(userProfile?.projects || []),
  ]);
  const skills = flattenSkills(resume?.skills, userProfile?.skills, preferences?.skills);
  const primaryExperience = workExperience[0] || {};
  const highestEducation = education[0] || {};
  const locationParts = `${location}`.split(',').map((entry) => entry.trim()).filter(Boolean);
  const inferredCity = locationParts[0] || '';
  const inferredCountry = locationParts.at(-1) || '';
  const resumePdfUrl = await ensureResumePdfSignedUrl(resume, userProfile);
  const configuredAppUrl = `${import.meta.env.VITE_APP_URL || ''}`.trim();
  const appUrl = /^https?:\/\//i.test(configuredAppUrl)
    ? configuredAppUrl.replace(/\/$/, '')
    : (typeof window !== 'undefined' && /^https?:\/\//i.test(window.location.origin)
      ? window.location.origin.replace(/\/$/, '')
      : PRODUCTION_APP_URL);

  return {
    version: '2026-04-06',
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
      workAuthorization: applicationProfile.workAuthorization || 'Yes',
      requiresSponsorship: applicationProfile.requiresSponsorship || 'No',
      currentCompany: primaryExperience.company || '',
      currentTitle: primaryExperience.title || '',
      highestEducation: applicationProfile.highestEducation || `${highestEducation.degree || ''} ${highestEducation.fieldOfStudy || ''}`.trim(),
      yearsOfExperience: applicationProfile.yearsOfExperience || `${workExperience.length}`,
      preferredWorkSetup: applicationProfile.preferredWorkSetup || preferences?.remote_preference || 'any',
      salaryExpectation: applicationProfile.salaryExpectation || (preferences?.salary_min
        ? `${preferences.salary_min}${preferences.salary_max ? `-${preferences.salary_max}` : '+'}`
        : ''),
      preferredLocations: normalizeList(preferences?.locations),
      noticePeriod: applicationProfile.noticePeriod || '',
      city: applicationProfile.city || inferredCity,
      stateProvince: applicationProfile.stateProvince || '',
      country: applicationProfile.country || inferredCountry,
      school: applicationProfile.school || highestEducation.institution || '',
      degreePursuing: applicationProfile.degreePursuing || '',
      relevantCourses: applicationProfile.relevantCourses || '',
      heardAbout: applicationProfile.heardAbout || 'LinkedIn',
      referredByEmployee: applicationProfile.referredByEmployee || 'No',
      referralName: applicationProfile.referralName || '',
      currentEmployee: applicationProfile.currentEmployee || 'No',
      previousEmployee: applicationProfile.previousEmployee || 'No',
      previousEmploymentDetails: applicationProfile.previousEmploymentDetails || '',
      backgroundCheckConsent: applicationProfile.backgroundCheckConsent || 'Yes',
      privacyConsent: applicationProfile.privacyConsent || 'Yes',
      accommodationRequest: applicationProfile.accommodationRequest || '',
      gender: applicationProfile.gender || 'Prefer not to answer',
      hispanicLatino: applicationProfile.hispanicLatino || 'Prefer not to answer',
      veteranStatus: applicationProfile.veteranStatus || 'Prefer not to answer',
      disabilityStatus: applicationProfile.disabilityStatus || 'Prefer not to answer',
      linkedinUrl: linkedin,
      githubUrl: github,
      portfolioUrl: portfolio,
      websiteUrl: website,
    },
    documents: {
      resumeId: resume?.id || '',
      resumeFilename: `${fullName || 'ResumeATS_Candidate'}_Resume.pdf`.replace(/\s+/g, '_'),
      resumePdfUrl,
    },
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
