/* global chrome */

(() => {
  const UI_SETTINGS_KEY = 'resumeatsBrowserAgentUi';
  const DEFAULT_UI_SETTINGS = {
    enabled: true,
    disabledHosts: [],
  };
  const PRIVATE_NETWORK_HOST_PATTERNS = [
    /^10(?:\.\d{1,3}){3}$/i,
    /^127(?:\.\d{1,3}){3}$/i,
    /^192\.168(?:\.\d{1,3}){2}$/i,
    /^172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/i,
    /\.local$/i,
  ];
  const APP_HOST_PATTERNS = [
    /(^|\.)resumeats\.cv$/i,
    /^localhost$/i,
    /^127\.0\.0\.1$/i,
  ];

  const hostname = window.location.hostname || '';
  const normalizeHostKey = (value = '') => `${value}`.trim().toLowerCase();
  const sanitizeUiSettings = (value = {}) => ({
    enabled: value?.enabled !== false,
    disabledHosts: Array.from(new Set(
      (Array.isArray(value?.disabledHosts) ? value.disabledHosts : [])
        .map((entry) => normalizeHostKey(entry))
        .filter(Boolean)
    )),
  });
  const readUiSettings = async () => {
    try {
      const stored = await chrome.storage.local.get(UI_SETTINGS_KEY);
      return sanitizeUiSettings(stored?.[UI_SETTINGS_KEY] || DEFAULT_UI_SETTINGS);
    } catch {
      return sanitizeUiSettings(DEFAULT_UI_SETTINGS);
    }
  };
  const writeUiSettings = async (valueOrUpdater) => {
    const current = await readUiSettings();
    const nextValue = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(current)
      : valueOrUpdater;
    const next = sanitizeUiSettings(nextValue);
    await chrome.storage.local.set({ [UI_SETTINGS_KEY]: next });
    return next;
  };
  const isWidgetEnabledForHost = (settings, host = hostname) => (
    settings?.enabled !== false
    && !settings?.disabledHosts?.includes(normalizeHostKey(host))
  );

  if (
    APP_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
    || PRIVATE_NETWORK_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
  ) {
    return;
  }

  const PROVIDERS = [
    { id: 'greenhouse', label: 'Greenhouse', test: (url) => /greenhouse\.io/i.test(url) },
    { id: 'lever', label: 'Lever', test: (url) => /lever\.co/i.test(url) },
    { id: 'workday', label: 'Workday', test: (url) => /myworkdayjobs\.com|workday\.com/i.test(url) },
    { id: 'ashby', label: 'Ashby', test: (url) => /ashbyhq\.com/i.test(url) },
    { id: 'icims', label: 'iCIMS', test: (url) => /icims\.com/i.test(url) },
    { id: 'smartrecruiters', label: 'SmartRecruiters', test: (url) => /smartrecruiters\.com/i.test(url) },
    { id: 'workable', label: 'Workable', test: (url) => /workable\.com/i.test(url) },
    { id: 'bamboohr', label: 'BambooHR', test: (url) => /bamboohr\.com/i.test(url) },
    { id: 'jobvite', label: 'Jobvite', test: (url) => /jobvite\.com/i.test(url) },
    { id: 'bullhorn', label: 'Bullhorn', test: (url) => /bullhorn-oscp|bullhorn/i.test(url) },
    { id: 'manatal', label: 'Manatal', test: (url) => /careers-page\.com|manatal/i.test(url) },
    { id: 'traffit', label: 'Traffit', test: (url) => /traffit\.com/i.test(url) },
    { id: 'linkedin', label: 'LinkedIn', test: (url) => /linkedin\.com/i.test(url) },
    { id: 'indeed', label: 'Indeed', test: (url) => /indeed\.com/i.test(url) },
    { id: 'google', label: 'Google Jobs', test: (url) => /google\.[^/]+/i.test(url) },
  ];

  const provider = PROVIDERS.find((entry) => entry.test(window.location.href))?.id || 'generic';
  const normalize = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanText = (value = '') => `${value}`
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const escapeHtml = (value = '') => cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const LOCATION_KEYWORDS = /\b(remote|hybrid|onsite|on-site|[A-Z][a-z]+,\s*[A-Z]{2}\b|[A-Z][a-z]+\s+[A-Z][a-z]+)\b/;
  const STOP_WORDS = new Set([
    'and', 'for', 'the', 'with', 'from', 'that', 'this', 'your', 'our', 'you', 'will',
    'into', 'about', 'have', 'has', 'are', 'not', 'job', 'role', 'work', 'team', 'their',
    'them', 'who', 'what', 'when', 'where', 'why', 'how', 'its', 'per', 'using', 'use',
    'need', 'needs', 'want', 'wants', 'must', 'nice', 'plus', 'more', 'all', 'any',
  ]);
  const TECH_SIGNAL_PATTERNS = [
    { label: 'JavaScript', pattern: /\bjavascript\b/i },
    { label: 'TypeScript', pattern: /\btypescript\b/i },
    { label: 'React', pattern: /\breact(?:\.js)?\b/i },
    { label: 'Next.js', pattern: /\bnext(?:\.js)?\b/i },
    { label: 'Node.js', pattern: /\bnode(?:\.js)?\b/i },
    { label: 'Python', pattern: /\bpython\b/i },
    { label: 'Java', pattern: /\bjava\b/i },
    { label: 'C#', pattern: /\bc#\b|c sharp/i },
    { label: 'Go', pattern: /\bgolang\b|\bgo\b/i },
    { label: 'PHP', pattern: /\bphp\b/i },
    { label: 'Ruby', pattern: /\bruby\b/i },
    { label: 'SQL', pattern: /\bsql\b/i },
    { label: 'PostgreSQL', pattern: /\bpostgres(?:ql)?\b/i },
    { label: 'MongoDB', pattern: /\bmongodb\b/i },
    { label: 'AWS', pattern: /\baws\b|amazon web services/i },
    { label: 'Azure', pattern: /\bazure\b/i },
    { label: 'GCP', pattern: /\bgcp\b|google cloud/i },
    { label: 'Docker', pattern: /\bdocker\b/i },
    { label: 'Kubernetes', pattern: /\bkubernetes\b|\bk8s\b/i },
    { label: 'CI/CD', pattern: /\bci\/cd\b|continuous integration|continuous delivery/i },
    { label: 'GraphQL', pattern: /\bgraphql\b/i },
    { label: 'REST APIs', pattern: /\brest(?:ful)?\b|\bapi\b/i },
    { label: 'Figma', pattern: /\bfigma\b/i },
    { label: 'Product', pattern: /\bproduct\b/i },
    { label: 'Design Systems', pattern: /\bdesign systems?\b/i },
    { label: 'Project Management', pattern: /\bproject management\b/i },
    { label: 'Agile', pattern: /\bagile\b/i },
    { label: 'Scrum', pattern: /\bscrum\b/i },
    { label: 'Customer Support', pattern: /\bcustomer support\b|\bcustomer success\b/i },
    { label: 'Sales', pattern: /\bsales\b/i },
    { label: 'Marketing', pattern: /\bmarketing\b/i },
    { label: 'Excel', pattern: /\bexcel\b/i },
    { label: 'Communication', pattern: /\bcommunication\b/i },
    { label: 'Leadership', pattern: /\bleadership\b/i },
  ];
  const SALARY_PATTERN = /(?:\$|USD|EUR|GBP|PLN)\s?[\d,.Kk]+(?:\s*[-–to]+\s*(?:\$|USD|EUR|GBP|PLN)?\s?[\d,.Kk]+)?(?:\s*(?:\/|per)\s*(?:year|month|hour|yr|mo|hr))?/i;

  const PROVIDER_SELECTORS = {
    greenhouse: {
      title: ['h1.app-title', 'h1'],
      company: ['[data-qa="company-name"]', '.company-name'],
      location: ['[data-qa="location"]', '.location'],
      description: ['#content', '.opening', '.content', 'main'],
    },
    lever: {
      title: ['.posting-headline h2', '.posting-headline h1', 'h2', 'h1'],
      company: ['.main-header-text', '.company', '.posting-categories .sort-by-time'],
      location: ['.posting-categories .location', '.posting-categories .sort-by-location', '.location'],
      description: ['.posting-page', '.section-wrapper.page-full-width', '.main', 'main'],
    },
    linkedin: {
      title: ['.job-details-jobs-unified-top-card__job-title h1', '.top-card-layout__title', 'h1'],
      company: ['.job-details-jobs-unified-top-card__company-name a', '.topcard__org-name-link', '.jobs-unified-top-card__company-name'],
      location: ['.job-details-jobs-unified-top-card__primary-description-container', '.topcard__flavor--bullet', '.jobs-unified-top-card__bullet'],
      description: ['.jobs-description', '.jobs-box__html-content', '.jobs-description-content__text', 'main'],
    },
    indeed: {
      title: ['h1.jobsearch-JobInfoHeader-title', 'h1'],
      company: ['[data-company-name="true"]', '.jobsearch-CompanyInfoWithoutHeaderImage div', '.icl-u-lg-mr--sm'],
      location: ['#jobLocationText', '.jobsearch-JobInfoHeader-subtitle div'],
      description: ['#jobDescriptionText', '.jobsearch-jobDescriptionText', 'main'],
    },
    workday: {
      title: ['h2[data-automation-id="jobPostingHeader"]', 'h1', 'h2'],
      company: ['div[data-automation-id="company"]', 'div[data-automation-id="jobPostingCompany"]'],
      location: ['div[data-automation-id="locations"]', 'div[data-automation-id="jobPostingLocation"]'],
      description: ['div[data-automation-id="jobPostingDescription"]', 'main'],
    },
    bullhorn: {
      title: ['.job-header .job-title', '.job-title', 'span.job-title', '[class*="job-title"]'],
      company: ['.company-name', '.header-title'],
      location: ['.job-info-container', '.job-location', '[class*="job-location"]'],
      description: ['.job-description-text', '.job-container', 'main'],
    },
    manatal: {
      title: ['.single-job-title', '.single-job-header-row .single-job-title', 'h4.single-job-title'],
      company: ['.company-name', '.single-job-company', '.header-title'],
      location: ['.job-location', '.single-job-location', '[class*="job-location"]'],
      description: ['.single-job-card', '.single-job-content', 'main'],
    },
    traffit: {
      title: ['.job-title', '[class*="job-title"]', 'h1', 'h2'],
      company: ['.company-name', '[class*="company"]'],
      location: ['.job-location', '[class*="location"]'],
      description: ['main', 'article', '[role="main"]', '.job-description', '.form__job-offer'],
    },
    generic: {
      title: ['h1', '[data-testid*="job-title"]', '[class*="job-title"]', '[class*="posting-title"]'],
      company: ['[data-testid*="company"]', '[class*="company"]', '[class*="employer"]'],
      location: ['[data-testid*="location"]', '[class*="location"]', '[class*="remote"]'],
      description: ['main', 'article', '[role="main"]', '.job-description', '#job-description', '.posting', '.description'],
    },
  };

  const queryFirstText = (selectors = []) => {
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector))
        .filter((node) => !!node && !!cleanText(node.textContent || '') && (node === document.body || isVisible(node)));

      if (nodes.length === 0) continue;

      const bestNode = nodes.sort((left, right) => cleanText(right.textContent || '').length - cleanText(left.textContent || '').length)[0];
      const text = cleanText(bestNode?.textContent || '');
      if (text) return text;
    }

    return '';
  };

  const extractMetaText = (...names) => {
    for (const name of names) {
      const selector = `meta[name="${name}"], meta[property="${name}"], meta[itemprop="${name}"]`;
      const content = cleanText(document.querySelector(selector)?.getAttribute('content') || '');
      if (content) return content;
    }

    return '';
  };

  const parseJsonLd = () => {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent || '{}');
        const candidates = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed['@graph'])
            ? parsed['@graph']
            : [parsed];

        const jobPosting = candidates.find((entry) => {
          const type = entry?.['@type'];
          if (Array.isArray(type)) return type.includes('JobPosting');
          return type === 'JobPosting';
        });

        if (jobPosting) return jobPosting;
      } catch {
        // Ignore invalid JSON-LD blocks.
      }
    }

    return null;
  };

  const stripHtml = (value = '') => {
    if (!value) return '';
    const element = document.createElement('div');
    element.innerHTML = value;
    return cleanText(element.textContent || '');
  };

  const compactLine = (value = '') => cleanText(value).replace(/\s*\|\s*/g, ' | ');

  const deriveTitleFromDocumentTitle = (value = '') => {
    const normalized = compactLine(value)
      .replace(/^job application for\s+/i, '')
      .replace(/\s+at\s+[^|]+$/i, '')
      .trim();

    if (/^apply now\s+\|/i.test(normalized)) {
      return '';
    }

    return cleanupTitle(normalized);
  };

  const deriveCompanyFromDocumentTitle = (value = '') => {
    const normalized = compactLine(value).trim();
    const atMatch = normalized.match(/\bat\s+([^|]+)$/i);
    if (atMatch?.[1]) {
      return cleanupCompany(atMatch[1]);
    }

    const pipeMatch = normalized.match(/\|\s*([^|]+)$/);
    if (pipeMatch?.[1] && !/^(apply now|job application|current openings)$/i.test(pipeMatch[1].trim())) {
      return cleanupCompany(pipeMatch[1]);
    }

    return '';
  };

  const cleanupTitle = (value = '') => {
    const normalized = compactLine(value)
      .replace(/\s+[|-]\s+(remote|hybrid|onsite|on-site)\b.*$/i, '')
      .replace(/\s+[|-]\s+[A-Z][A-Za-z.&'()/-]+(?:\s+[A-Z][A-Za-z.&'()/-]+){0,4}$/g, '')
      .trim();

    return normalized.length > 120 ? normalized.slice(0, 120).trim() : normalized;
  };

  const cleanupCompany = (value = '') => {
    const normalized = compactLine(value)
      .replace(/\b(?:is hiring|is looking|careers?)\b.*$/i, '')
      .trim();

    return normalized.length > 80 ? normalized.slice(0, 80).trim() : normalized;
  };

  const cleanupLocation = (value = '') => compactLine(value).slice(0, 120).trim();

  const extractSalaryText = (text = '') => cleanText((text.match(SALARY_PATTERN) || [])[0] || '');

  const buildDescriptionFromSelectors = (selectors = []) => {
    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter((node) => !!node && !!cleanText(node.textContent || ''))
      .map((node) => cleanText(node.textContent || ''))
      .filter((text) => text.length > 200)
      .sort((left, right) => right.length - left.length);

    return candidates[0] || '';
  };

  const extractDomJobPosting = () => {
    const selectors = PROVIDER_SELECTORS[provider] || PROVIDER_SELECTORS.generic;
    const fallbackSelectors = PROVIDER_SELECTORS.generic;
    const documentTitle = deriveTitleFromDocumentTitle(document.title || '');
    const pageText = cleanText(document.body?.innerText || '');
    const title = cleanupTitle(
      queryFirstText(selectors.title)
      || queryFirstText(fallbackSelectors.title)
      || extractMetaText('og:title', 'twitter:title', 'title')
      || documentTitle
    );
    const company = cleanupCompany(
      queryFirstText(selectors.company)
      || queryFirstText(fallbackSelectors.company)
      || extractMetaText('og:site_name', 'application-name')
      || deriveCompanyFromDocumentTitle(document.title || '')
    );
    const location = cleanupLocation(
      queryFirstText(selectors.location)
      || queryFirstText(fallbackSelectors.location)
      || (LOCATION_KEYWORDS.test(pageText) ? (pageText.match(LOCATION_KEYWORDS) || [])[0] : '')
    );
    const description = cleanText(
      buildDescriptionFromSelectors(selectors.description)
      || buildDescriptionFromSelectors(fallbackSelectors.description)
      || extractMetaText('description', 'og:description', 'twitter:description')
      || pageText.slice(0, 12000)
    );
    const salary = extractSalaryText(pageText);

    return { title, company, location, description, salary };
  };

  const extractJsonLdJobPosting = () => {
    const jsonLd = parseJsonLd();
    if (!jsonLd) return null;

    const organization = jsonLd.hiringOrganization?.name
      || jsonLd.hiringOrganization?.legalName
      || '';
    const jobLocation = Array.isArray(jsonLd.jobLocation) ? jsonLd.jobLocation[0] : jsonLd.jobLocation;
    const address = jobLocation?.address || jsonLd.applicantLocationRequirements?.address || {};
    const location = [
      address.addressLocality,
      address.addressRegion,
      address.addressCountry,
    ].filter(Boolean).join(', ') || (jsonLd.jobLocationType || '');
    const employmentType = Array.isArray(jsonLd.employmentType)
      ? jsonLd.employmentType.join(', ')
      : (jsonLd.employmentType || '');
    const salary = cleanText(
      jsonLd.baseSalary?.value?.minValue && jsonLd.baseSalary?.value?.maxValue
        ? `${jsonLd.baseSalary.value.minValue} - ${jsonLd.baseSalary.value.maxValue}`
        : `${jsonLd.baseSalary?.value?.value || jsonLd.baseSalary?.value || ''}`
    );

    return {
      title: cleanupTitle(jsonLd.title || ''),
      company: cleanupCompany(organization),
      location: cleanupLocation(location),
      employmentType: cleanText(employmentType),
      description: stripHtml(jsonLd.description || ''),
      salary,
      datePosted: cleanText(jsonLd.datePosted || ''),
      source: 'jsonld',
    };
  };

  const buildJobPostingSnapshot = () => {
    const jsonLdJob = extractJsonLdJobPosting();
    const domJob = extractDomJobPosting();
    const pageText = cleanText(document.body?.innerText || '');

    const title = jsonLdJob?.title || domJob.title;
    const company = jsonLdJob?.company || domJob.company;
    const location = jsonLdJob?.location || domJob.location;
    const employmentType = cleanText(jsonLdJob?.employmentType || '');
    const description = cleanText(jsonLdJob?.description || domJob.description);
    const salary = cleanText(jsonLdJob?.salary || domJob.salary || extractSalaryText(description || pageText));

    if (!title && !description) {
      return null;
    }

    return {
      title,
      company,
      location,
      employmentType,
      salary,
      description: description.slice(0, 18000),
      provider,
      providerLabel: PROVIDERS.find((entry) => entry.id === provider)?.label || 'Web Apply',
      url: window.location.href,
      source: jsonLdJob?.source || 'dom',
      capturedAt: new Date().toISOString(),
    };
  };

  const uniqueValues = (items = []) => Array.from(new Set(items.filter(Boolean)));

  const tokenize = (value = '') => cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  const normalizeSkill = (value = '') => normalize(value).replace(/[^a-z0-9+#./ -]+/g, '');

  const overlapRatio = (left = [], right = []) => {
    if (left.length === 0 || right.length === 0) return 0;

    const rightSet = new Set(right);
    const matches = left.filter((entry) => rightSet.has(entry));
    return matches.length / Math.max(left.length, right.length);
  };

  const extractTechSignals = (value = '') => uniqueValues(
    TECH_SIGNAL_PATTERNS
      .filter((entry) => entry.pattern.test(value))
      .map((entry) => entry.label)
  );

  const collectCandidateRoles = (profile = null) => uniqueValues([
    profile?.candidate?.currentTitle || '',
    ...(Array.isArray(profile?.preferences?.jobTitles) ? profile.preferences.jobTitles : []),
  ].map((entry) => cleanText(entry)));

  const collectCandidateSkills = (profile = null) => uniqueValues([
    ...(Array.isArray(profile?.skills) ? profile.skills : []),
    profile?.candidate?.currentTitle || '',
    profile?.answers?.currentTitle || '',
  ].map((entry) => cleanText(entry)));

  const extractExperienceYears = (value = '') => {
    const patterns = [
      /(\d+)\s*(?:\+|plus)?\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi,
      /experience\s+(?:of\s+)?(\d+)\s*(?:\+|plus)?\s*(?:years?|yrs?)/gi,
      /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)\s+(?:of\s+)?experience/gi,
    ];

    const values = [];

    patterns.forEach((pattern) => {
      let match = pattern.exec(value);
      while (match) {
        const lower = Number.parseInt(match[1], 10);
        const upper = Number.parseInt(match[2], 10);
        if (Number.isFinite(upper)) values.push(Math.max(lower, upper));
        else if (Number.isFinite(lower)) values.push(lower);
        match = pattern.exec(value);
      }
    });

    return values.length ? Math.max(...values) : null;
  };

  const buildJobFitAnalysis = (jobPosting, profile) => {
    if (!jobPosting || !profile) return null;

    const jobText = cleanText([
      jobPosting.title,
      jobPosting.company,
      jobPosting.location,
      jobPosting.employmentType,
      jobPosting.description,
    ].filter(Boolean).join('\n'));
    const jobRoleTokens = uniqueValues(tokenize(jobPosting.title || ''));
    const candidateRoles = collectCandidateRoles(profile);
    const candidateRoleTokens = uniqueValues(candidateRoles.flatMap((entry) => tokenize(entry)));
    const titleAlignment = candidateRoleTokens.length
      ? Math.max(...candidateRoles.map((role) => overlapRatio(jobRoleTokens, tokenize(role))))
      : 0.48;

    const candidateSkills = collectCandidateSkills(profile);
    const candidateSkillTokens = uniqueValues(candidateSkills.flatMap((entry) => [normalizeSkill(entry), ...tokenize(entry)]));
    const detectedSignals = extractTechSignals(jobText);
    const matchedSkills = detectedSignals.filter((signal) => {
      const normalized = normalizeSkill(signal);
      return candidateSkillTokens.some((entry) => entry === normalized || normalized.includes(entry) || entry.includes(normalized));
    });
    const missingSkills = detectedSignals.filter((signal) => !matchedSkills.includes(signal));
    const skillAlignment = detectedSignals.length
      ? matchedSkills.length / detectedSignals.length
      : 0.56;

    const preferredLocations = Array.isArray(profile?.preferences?.locations)
      ? profile.preferences.locations.map((entry) => normalize(entry))
      : [];
    const locationText = normalize([jobPosting.location, jobPosting.description].filter(Boolean).join(' '));
    let locationAlignment = 0.58;
    if (/remote/.test(locationText)) {
      locationAlignment = ['remote', 'any'].includes(profile?.preferences?.remotePreference) ? 1 : 0.68;
    } else if (preferredLocations.length > 0) {
      locationAlignment = preferredLocations.some((entry) => locationText.includes(entry)) ? 1 : 0.34;
    }

    const requiredYears = extractExperienceYears(jobPosting.description || '');
    const candidateYears = Number.parseInt(profile?.answers?.yearsOfExperience || `${profile?.experience?.length || ''}`, 10);
    let experienceAlignment = 0.6;
    if (Number.isFinite(requiredYears) && Number.isFinite(candidateYears)) {
      if (candidateYears >= requiredYears) experienceAlignment = 1;
      else if (candidateYears + 1 >= requiredYears) experienceAlignment = 0.78;
      else if (candidateYears + 2 >= requiredYears) experienceAlignment = 0.58;
      else experienceAlignment = 0.34;
    }

    const rawScore = (
      titleAlignment * 0.3 +
      skillAlignment * 0.42 +
      locationAlignment * 0.14 +
      experienceAlignment * 0.14
    ) * 100;
    const score = Math.max(22, Math.min(96, Math.round(rawScore)));
    const label = score >= 82
      ? 'Strong Match'
      : score >= 68
        ? 'Good Fit'
        : score >= 52
          ? 'Possible Fit'
          : 'Stretch Role';

    const strengths = [];
    if (titleAlignment >= 0.55 && candidateRoles[0]) {
      strengths.push(`Role alignment with ${candidateRoles[0]}`);
    }
    if (matchedSkills.length > 0) {
      strengths.push(`Matched ${matchedSkills.slice(0, 3).join(', ')}`);
    }
    if (locationAlignment >= 0.95) {
      strengths.push('Location preference matches this role');
    }
    if (experienceAlignment >= 0.78) {
      strengths.push('Experience requirement looks realistic');
    }

    const gaps = [];
    if (missingSkills.length > 0) {
      gaps.push(`Highlight ${missingSkills.slice(0, 3).join(', ')}`);
    }
    if (locationAlignment <= 0.35) {
      gaps.push('Location preference may be off');
    }
    if (experienceAlignment <= 0.4) {
      gaps.push('Experience requirement may need reframing');
    }

    const recommendedRoute = score >= 70 ? '/#/quick-resume' : '/#/ai-generator';
    const recommendedLabel = score >= 70 ? 'Quick Resume' : 'AI Generator';

    return {
      score,
      label,
      matchedSkills: matchedSkills.slice(0, 6),
      missingSkills: missingSkills.slice(0, 6),
      signals: detectedSignals.slice(0, 8),
      strengths: strengths.slice(0, 3),
      gaps: gaps.slice(0, 3),
      recommendedRoute,
      recommendedLabel,
      summary: score >= 70
        ? 'You already have a credible base for this role. Import it into ResumeATS and tailor quickly.'
        : 'This role needs stronger tailoring. Push it into the AI flow before applying.',
    };
  };

  const enrichJobPostingSnapshot = async (jobPosting) => {
    if (!jobPosting) return null;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SYNCED_PROFILE' });
      const profile = response?.profile || null;

      if (!profile) {
        return {
          ...jobPosting,
          analysis: null,
        };
      }

      return {
        ...jobPosting,
        analysis: buildJobFitAnalysis(jobPosting, profile),
      };
    } catch {
      return {
        ...jobPosting,
        analysis: null,
      };
    }
  };

  const persistJobPostingSnapshot = async (jobPosting) => {
    if (!jobPosting) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'JOB_PAGE_SEEN',
        payload: {
          provider,
          url: window.location.href,
          jobPosting,
        },
      });
    } catch {
      // Ignore persistence errors inside the passive page widget.
    }
  };

  const createFloatingWidget = (initialSnapshot = null) => {
    if (document.getElementById('resumeats-job-widget-host')) {
      return null;
    }

    const host = document.createElement('div');
    host.id = 'resumeats-job-widget-host';
    const shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .dock {
          position: fixed;
          right: 0;
          top: 24%;
          z-index: 2147483646;
          display: flex;
          align-items: center;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #f8fafc;
          pointer-events: auto;
        }

        .launcher {
          border: 0;
          cursor: pointer;
          width: 74px;
          height: 168px;
          margin-right: -16px;
          padding: 12px 10px;
          border-radius: 28px 0 0 28px;
          background:
            radial-gradient(circle at 25% 20%, rgba(110, 231, 255, 0.9), rgba(110, 231, 255, 0) 34%),
            linear-gradient(160deg, #0f766e 0%, #155eef 52%, #4f46e5 100%);
          box-shadow: 0 22px 50px rgba(15, 23, 42, 0.32);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          transition: transform 220ms ease, box-shadow 220ms ease, filter 220ms ease;
        }

        .launcher:hover {
          transform: translateX(-4px);
          box-shadow: 0 28px 60px rgba(15, 23, 42, 0.4);
          filter: saturate(1.05);
        }

        .launcher::before {
          content: "";
          position: absolute;
          inset: 10px 12px;
          border-radius: 22px 0 0 22px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          opacity: 0.75;
        }

        .launcher::after {
          content: "";
          position: absolute;
          inset: 18px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.5);
          transform: scale(0.76);
          opacity: 0;
          animation: pulse-ring 2.8s ease-out infinite;
        }

        .dock[data-scanning="true"] .launcher::after {
          animation-duration: 1.05s;
          opacity: 1;
        }

        .orb {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.24);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }

        .orb svg {
          width: 20px;
          height: 20px;
          color: white;
          transition: transform 280ms ease;
        }

        .dock[data-scanning="true"] .orb svg {
          animation: spin 1s linear infinite;
        }

        .launcher-copy {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 11px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.94);
          text-align: center;
          line-height: 1.1;
        }

        .signal {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #6ee7b7;
          box-shadow: 0 0 0 0 rgba(110, 231, 183, 0.6);
          animation: pulse-dot 2.4s ease-out infinite;
        }

        .panel {
          width: 320px;
          margin-right: 10px;
          padding: 16px;
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.93)),
            linear-gradient(120deg, rgba(30, 64, 175, 0.15), rgba(20, 184, 166, 0.15));
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: 0 30px 70px rgba(2, 6, 23, 0.44);
          transform: translateX(24px) scale(0.96);
          opacity: 0;
          pointer-events: none;
          transition: transform 240ms ease, opacity 240ms ease;
          backdrop-filter: blur(18px);
        }

        .dock[data-open="true"] .panel {
          transform: translateX(0) scale(1);
          opacity: 1;
          pointer-events: auto;
        }

        .panel-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.15);
          color: #93c5fd;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .eyebrow span:last-child {
          color: #e2e8f0;
          letter-spacing: 0.08em;
        }

        .close {
          border: 0;
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
          width: 32px;
          height: 32px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .headline {
          margin-top: 14px;
        }

        .title {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #f8fafc;
        }

        .subtitle {
          margin: 6px 0 0;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.45;
        }

        .status {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(15, 118, 110, 0.16);
          border: 1px solid rgba(45, 212, 191, 0.18);
          color: #ccfbf1;
          font-size: 13px;
          line-height: 1.45;
        }

        .dock[data-scanning="true"] .status {
          background: rgba(37, 99, 235, 0.14);
          border-color: rgba(96, 165, 250, 0.24);
          color: #dbeafe;
        }

        .summary {
          margin-top: 14px;
          display: grid;
          gap: 10px;
        }

        .summary-card {
          padding: 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(148, 163, 184, 0.12);
        }

        .summary-label {
          color: #94a3b8;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .summary-value {
          margin-top: 6px;
          color: #f8fafc;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.45;
        }

        .meta-grid {
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr 1fr;
          margin-top: 10px;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
        }

        .action {
          border: 0;
          border-radius: 16px;
          padding: 12px 14px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 180ms ease, filter 180ms ease, opacity 180ms ease;
        }

        .action:hover {
          transform: translateY(-1px);
          filter: brightness(1.05);
        }

        .action.primary {
          background: linear-gradient(135deg, #14b8a6, #2563eb);
          color: #f8fafc;
          box-shadow: 0 14px 30px rgba(20, 184, 166, 0.22);
        }

        .action.secondary {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(148, 163, 184, 0.18);
          color: #e2e8f0;
        }

        .progress {
          margin-top: 10px;
          height: 7px;
          width: 100%;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.16);
          overflow: hidden;
          opacity: 0;
          transform: scaleY(0.8);
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .dock[data-scanning="true"] .progress {
          opacity: 1;
          transform: scaleY(1);
        }

        .progress::before {
          content: "";
          display: block;
          height: 100%;
          width: 42%;
          border-radius: inherit;
          background: linear-gradient(90deg, #22d3ee, #60a5fa, #14b8a6);
          transform: translateX(-120%);
          animation: slide-bar 1.1s ease-in-out infinite;
        }

        @keyframes pulse-ring {
          0% { transform: scale(0.78); opacity: 0; }
          25% { opacity: 0.55; }
          100% { transform: scale(1.32); opacity: 0; }
        }

        @keyframes pulse-dot {
          0% { box-shadow: 0 0 0 0 rgba(110, 231, 183, 0.55); }
          100% { box-shadow: 0 0 0 12px rgba(110, 231, 183, 0); }
        }

        @keyframes slide-bar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(280%); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="dock" data-open="false" data-scanning="false">
        <div class="panel">
          <div class="panel-top">
            <div class="eyebrow">
              <span>ResumeATS</span>
              <span>Job Scan</span>
            </div>
            <button class="close" type="button" aria-label="Close widget">×</button>
          </div>
          <div class="headline">
            <h2 class="title">Analyze this job</h2>
            <p class="subtitle">Capture the role, company, and description from this page, then open ResumeATS with cleaner job details.</p>
          </div>
          <div class="status">Ready to scan this job page.</div>
          <div class="progress" aria-hidden="true"></div>
          <div class="summary"></div>
          <div class="actions">
            <button class="action primary scan" type="button">Analyze Job</button>
            <button class="action secondary open-app" type="button">Open ResumeATS</button>
          </div>
        </div>
        <button class="launcher" type="button" aria-label="Open ResumeATS job scan widget">
          <div class="orb">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.5 4.75a7.75 7.75 0 1 0 5.29 13.42l3.46 3.46"></path>
              <path d="M10.5 7.75v5.25l3.25 1.75"></path>
            </svg>
          </div>
          <div class="launcher-copy">Analyze Job</div>
          <div class="signal"></div>
        </button>
      </div>
    `;

    const dock = shadow.querySelector('.dock');
    const launcher = shadow.querySelector('.launcher');
    const closeButton = shadow.querySelector('.close');
    const scanButton = shadow.querySelector('.scan');
    const openAppButton = shadow.querySelector('.open-app');
    const statusEl = shadow.querySelector('.status');
    const summaryEl = shadow.querySelector('.summary');

    let isOpen = false;
    let isScanning = false;
    let lastSnapshot = initialSnapshot;

    const renderSummary = (snapshot) => {
      if (!snapshot) {
        summaryEl.innerHTML = `
          <div class="summary-card">
            <div class="summary-label">Detection</div>
            <div class="summary-value">No structured job details have been captured yet.</div>
          </div>
        `;
        return;
      }

        summaryEl.innerHTML = `
        <div class="summary-card">
          <div class="summary-label">Role</div>
          <div class="summary-value">${escapeHtml(snapshot.title || 'Unknown role')}</div>
        </div>
        <div class="meta-grid">
          <div class="summary-card">
            <div class="summary-label">Company</div>
            <div class="summary-value">${escapeHtml(snapshot.company || 'Unknown company')}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Location</div>
            <div class="summary-value">${escapeHtml(snapshot.location || 'Not detected')}</div>
          </div>
        </div>
      `;
    };

    const render = () => {
      dock.dataset.open = isOpen ? 'true' : 'false';
      dock.dataset.scanning = isScanning ? 'true' : 'false';
      renderSummary(lastSnapshot);
    };

    const setStatus = (message) => {
      statusEl.textContent = message;
    };

    const scanCurrentJob = async ({ openPanel = true } = {}) => {
      if (isScanning) return;

      isScanning = true;
      if (openPanel) isOpen = true;
      setStatus('Scanning this job page and extracting structured details...');
      render();

      try {
        await delay(420);
        const snapshot = getMeaningfulJobPostingSnapshot();

        if (!snapshot) {
          throw new Error('This page does not expose enough job data yet. Scroll the posting or wait for it to finish loading, then try again.');
        }

        lastSnapshot = snapshot;
        await persistJobPostingSnapshot(snapshot);
        setStatus(`Captured ${snapshot.title || 'job details'} and saved them for ResumeATS.`);
      } catch (error) {
        setStatus(error?.message || 'Could not analyze this job page.');
      } finally {
        isScanning = false;
        render();
      }
    };

    const openResumeAts = async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'OPEN_RESUMEATS_IMPORT' });
        setStatus('Opened ResumeATS. Use Import Latest Job in Quick Resume or the AI Generator.');
      } catch (error) {
        setStatus(error?.message || 'Could not open ResumeATS.');
      }
    };

    launcher.addEventListener('click', () => {
      isOpen = !isOpen;
      render();
    });

    closeButton.addEventListener('click', () => {
      isOpen = false;
      render();
    });

    scanButton.addEventListener('click', () => {
      scanCurrentJob({ openPanel: true });
    });

    openAppButton.addEventListener('click', openResumeAts);

    let lastSeenUrl = window.location.href;
    window.setInterval(() => {
      if (window.location.href === lastSeenUrl) return;
      lastSeenUrl = window.location.href;
      const nextSnapshot = getMeaningfulJobPostingSnapshot();
      if (nextSnapshot) {
        lastSnapshot = nextSnapshot;
        persistJobPostingSnapshot(nextSnapshot);
        if (!isScanning) {
          setStatus(`Detected ${nextSnapshot.title || 'a new job'} on this page.`);
        }
        render();
      }
    }, 1200);

    if (initialSnapshot) {
      setStatus(`Detected ${initialSnapshot.title || 'this job'} on the page. Analyze it to refresh the snapshot.`);
    }

    render();
    return { scanCurrentJob };
  };

  // Keep a reference to the legacy widget implementation while the new companion UI ships.
  void createFloatingWidget;

  const createFloatingWidgetV2 = (initialSnapshot = null) => {
    if (document.getElementById('resumeats-job-widget-host-v2')) {
      return null;
    }

    const host = document.createElement('div');
    host.id = 'resumeats-job-widget-host-v2';
    const shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .dock {
          --score: 0;
          position: fixed;
          right: 0;
          top: 22%;
          z-index: 2147483646;
          display: flex;
          align-items: center;
          font-family: "Sora", "Segoe UI", system-ui, sans-serif;
          color: #e2e8f0;
          pointer-events: auto;
        }

        .panel {
          width: 360px;
          margin-right: 12px;
          border-radius: 28px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background:
            radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 34%),
            radial-gradient(circle at bottom right, rgba(34, 197, 94, 0.14), transparent 30%),
            linear-gradient(180deg, rgba(8, 15, 32, 0.98), rgba(10, 18, 37, 0.94));
          box-shadow: 0 26px 64px rgba(2, 6, 23, 0.42);
          backdrop-filter: blur(24px);
          overflow: hidden;
          transform: translateX(28px) scale(0.97);
          opacity: 0;
          pointer-events: none;
          transition: transform 220ms ease, opacity 220ms ease;
        }

        .dock[data-open="true"] .panel {
          transform: translateX(0) scale(1);
          opacity: 1;
          pointer-events: auto;
        }

        .panel-shell {
          padding: 18px;
        }

        .panel-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.16);
          color: #bfdbfe;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .eyebrow-dot,
        .launcher-signal {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
          animation: pulse-dot 2.2s ease-out infinite;
        }

        .panel-title {
          margin: 14px 0 0;
          font-size: 24px;
          line-height: 1.05;
          font-weight: 700;
          letter-spacing: -0.05em;
          color: #f8fafc;
        }

        .panel-copy {
          margin: 8px 0 0;
          font-size: 13px;
          line-height: 1.5;
          color: #94a3b8;
        }

        .icon-button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(255, 255, 255, 0.04);
          color: #e2e8f0;
          cursor: pointer;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
        }

        .icon-button:hover {
          transform: translateY(-1px);
          border-color: rgba(96, 165, 250, 0.35);
          background: rgba(37, 99, 235, 0.12);
        }

        .icon-button svg {
          width: 16px;
          height: 16px;
        }

        .status {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 18px;
          border: 1px solid rgba(45, 212, 191, 0.15);
          background: rgba(20, 184, 166, 0.12);
          color: #ccfbf1;
          font-size: 13px;
          line-height: 1.45;
        }

        .status[data-tone="busy"] {
          border-color: rgba(96, 165, 250, 0.18);
          background: rgba(37, 99, 235, 0.12);
          color: #dbeafe;
        }

        .status[data-tone="warning"] {
          border-color: rgba(248, 113, 113, 0.18);
          background: rgba(248, 113, 113, 0.1);
          color: #fecaca;
        }

        .hero {
          margin-top: 16px;
          padding: 16px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(148, 163, 184, 0.12);
          display: grid;
          gap: 16px;
        }

        .score-block {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 16px;
          align-items: center;
        }

        .score-ring {
          width: 92px;
          height: 92px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 50% 50%, rgba(8, 15, 32, 0.98) 54%, transparent 56%),
            conic-gradient(from 180deg, #38bdf8 calc(var(--score) * 1%), rgba(255, 255, 255, 0.08) 0);
          position: relative;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .score-ring::before {
          content: "";
          position: absolute;
          inset: 8px;
          border-radius: inherit;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .score-value {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.06em;
          color: #f8fafc;
          text-align: center;
        }

        .score-caption {
          margin-top: 2px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #94a3b8;
          text-align: center;
        }

        .score-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .score-headline {
          margin-top: 8px;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.04em;
          color: #f8fafc;
        }

        .score-summary {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.48;
          color: #cbd5e1;
        }

        .identity-title {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.3;
          letter-spacing: -0.03em;
          color: #f8fafc;
        }

        .identity-meta {
          margin-top: 6px;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.45;
        }

        .badge-row,
        .signal-row,
        .footer-links {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .badge,
        .signal {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(255, 255, 255, 0.04);
          color: #dbeafe;
          font-size: 12px;
          font-weight: 600;
        }

        .signal {
          color: #e2e8f0;
        }

        .section {
          margin-top: 16px;
        }

        .section-label {
          margin-bottom: 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #94a3b8;
        }

        .insight-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 16px;
        }

        .insight-card {
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          background: rgba(255, 255, 255, 0.04);
        }

        .insight-card[data-tone="good"] {
          background: rgba(20, 184, 166, 0.09);
        }

        .insight-card[data-tone="warn"] {
          background: rgba(37, 99, 235, 0.08);
        }

        .insight-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: #cbd5e1;
        }

        .insight-list {
          display: grid;
          gap: 8px;
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.42;
          color: #e2e8f0;
        }

        .insight-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .insight-item::before {
          content: "";
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          margin-top: 6px;
          border-radius: 999px;
          background: #38bdf8;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
        }

        .action,
        .text-link {
          cursor: pointer;
          transition: transform 180ms ease, border-color 180ms ease, filter 180ms ease, background 180ms ease;
        }

        .action:hover,
        .text-link:hover {
          transform: translateY(-1px);
          filter: brightness(1.04);
        }

        .action {
          min-height: 44px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          padding: 0 14px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .action.primary {
          border: 0;
          color: #eff6ff;
          background: linear-gradient(135deg, #2563eb, #14b8a6);
          box-shadow: 0 14px 28px rgba(37, 99, 235, 0.22);
        }

        .action.secondary {
          background: rgba(255, 255, 255, 0.04);
          color: #e2e8f0;
        }

        .text-link {
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          background: rgba(255, 255, 255, 0.03);
          color: #bfdbfe;
          font-size: 12px;
          font-weight: 600;
        }

        .progress {
          position: relative;
          height: 6px;
          width: 100%;
          margin-top: 16px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.16);
          overflow: hidden;
          opacity: 0;
          transform: scaleY(0.8);
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .dock[data-scanning="true"] .progress {
          opacity: 1;
          transform: scaleY(1);
        }

        .progress::before {
          content: "";
          display: block;
          width: 34%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #38bdf8, #14b8a6, #22c55e);
          transform: translateX(-120%);
          animation: scan-bar 1.15s ease-in-out infinite;
        }

        .launcher {
          position: relative;
          width: 62px;
          height: 156px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 12px 10px;
          margin-right: -12px;
          border: 0;
          border-radius: 26px 0 0 26px;
          cursor: pointer;
          color: #f8fafc;
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.88)),
            linear-gradient(180deg, rgba(37, 99, 235, 0.24), rgba(56, 189, 248, 0.18));
          border-left: 1px solid rgba(148, 163, 184, 0.18);
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
          box-shadow: 0 20px 54px rgba(2, 6, 23, 0.36);
          overflow: hidden;
        }

        .launcher::before {
          content: "";
          position: absolute;
          inset: 9px 8px;
          border-radius: 18px 0 0 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .launcher-core {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.18);
          border: 1px solid rgba(147, 197, 253, 0.3);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .launcher-core svg {
          width: 18px;
          height: 18px;
        }

        .dock[data-scanning="true"] .launcher-core svg {
          animation: spin 1s linear infinite;
        }

        .launcher-copy {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.9);
        }

        .muted {
          color: #94a3b8;
        }

        @keyframes scan-bar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }

        @keyframes pulse-dot {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45); }
          100% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .eyebrow-dot,
          .launcher-signal,
          .progress::before,
          .dock[data-scanning="true"] .launcher-core svg {
            animation: none !important;
          }

          .panel,
          .action,
          .text-link,
          .icon-button {
            transition: none !important;
          }
        }
      </style>
      <div class="dock" data-open="false" data-scanning="false">
        <div class="panel">
          <div class="panel-shell">
            <div class="panel-top">
              <div>
                <div class="eyebrow">
                  <span class="eyebrow-dot" aria-hidden="true"></span>
                  <span>ResumeATS Companion</span>
                </div>
                <h2 class="panel-title">Scan this job in context</h2>
                <p class="panel-copy">Capture the posting, judge fit against your synced ResumeATS profile, then move into the right flow without leaving the browser.</p>
              </div>
              <button class="icon-button close" type="button" aria-label="Close job companion">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M6 6l12 12"></path>
                  <path d="M18 6L6 18"></path>
                </svg>
              </button>
            </div>

            <div class="status" data-tone="idle">Ready to analyze this role.</div>

            <div class="hero">
              <div class="score-block">
                <div class="score-ring">
                  <div>
                    <div class="score-value">--</div>
                    <div class="score-caption">Match</div>
                  </div>
                </div>
                <div>
                  <div class="score-label">Job Read</div>
                  <div class="score-headline">Not analyzed yet</div>
                  <div class="score-summary">Scan the page to calculate a fit score and decide whether to jump into Quick Resume, the AI flow, or direct autofill.</div>
                </div>
              </div>

              <div>
                <div class="identity-title">Waiting for a visible job posting</div>
                <div class="identity-meta">Role, company, location, and platform details will appear here after scan.</div>
              </div>

              <div class="badge-row"></div>
            </div>

            <div class="section">
              <div class="section-label">Detected Signals</div>
              <div class="signal-row"></div>
            </div>

            <div class="insight-grid">
              <div class="insight-card" data-tone="good">
                <div class="insight-title">Strengths</div>
                <div class="insight-list strengths-list">
                  <div class="muted">Run analysis to surface your strongest positioning points.</div>
                </div>
              </div>
              <div class="insight-card" data-tone="warn">
                <div class="insight-title">Gaps</div>
                <div class="insight-list gaps-list">
                  <div class="muted">Potential gaps will show up here so you know when to use the AI tailoring flow.</div>
                </div>
              </div>
            </div>

            <div class="actions">
              <button class="action primary analyze" type="button">Scan & Analyze</button>
              <button class="action secondary autofill" type="button">Autofill Form</button>
              <button class="action secondary recommendation" type="button">Open Quick Resume</button>
              <button class="action secondary companion" type="button">Open Companion</button>
            </div>

            <div class="footer-links">
              <button class="text-link open-quick" type="button">Quick Resume</button>
              <button class="text-link open-ai" type="button">AI Generator</button>
              <button class="text-link open-auto-apply" type="button">Auto-Apply</button>
              <button class="text-link open-dashboard" type="button">Dashboard</button>
            </div>

            <div class="progress" data-tone="busy" aria-hidden="true"><div class="progress-fill"></div></div>
          </div>
        </div>

        <button class="launcher" type="button" aria-label="Open ResumeATS job companion">
          <div class="launcher-core">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.5 4.75a7.75 7.75 0 1 0 5.29 13.42l3.46 3.46"></path>
              <path d="M10.5 7.75v5.25l3.25 1.75"></path>
            </svg>
          </div>
          <div class="launcher-copy">Scan Job</div>
          <div class="launcher-signal"></div>
        </button>
      </div>
    `;

    const dock = shadow.querySelector('.dock');
    const launcher = shadow.querySelector('.launcher');
    const closeButton = shadow.querySelector('.close');
    const analyzeButton = shadow.querySelector('.analyze');
    const autofillButton = shadow.querySelector('.autofill');
    const recommendationButton = shadow.querySelector('.recommendation');
    const companionButton = shadow.querySelector('.companion');
    const statusEl = shadow.querySelector('.status');
    const scoreRingEl = shadow.querySelector('.score-ring');
    const scoreValueEl = shadow.querySelector('.score-value');
    const scoreHeadlineEl = shadow.querySelector('.score-headline');
    const scoreSummaryEl = shadow.querySelector('.score-summary');
    const identityTitleEl = shadow.querySelector('.identity-title');
    const identityMetaEl = shadow.querySelector('.identity-meta');
    const badgeRowEl = shadow.querySelector('.badge-row');
    const signalRowEl = shadow.querySelector('.signal-row');
    const strengthsListEl = shadow.querySelector('.strengths-list');
    const gapsListEl = shadow.querySelector('.gaps-list');
    const openQuickButton = shadow.querySelector('.open-quick');
    const openAiButton = shadow.querySelector('.open-ai');
    const openAutoApplyButton = shadow.querySelector('.open-auto-apply');
    const openDashboardButton = shadow.querySelector('.open-dashboard');

    let isOpen = false;
    let isScanning = false;
    let lastSnapshot = initialSnapshot;

    const setStatus = (message, tone = 'idle') => {
      statusEl.textContent = message;
      statusEl.dataset.tone = tone;
    };

    const renderPills = (container, items, emptyCopy) => {
      if (!items || items.length === 0) {
        container.innerHTML = `<div class="muted">${escapeHtml(emptyCopy)}</div>`;
        return;
      }

      container.innerHTML = items
        .map((item) => `<span class="${container === signalRowEl ? 'signal' : 'badge'}">${escapeHtml(item)}</span>`)
        .join('');
    };

    const renderInsightList = (container, items, emptyCopy) => {
      if (!items || items.length === 0) {
        container.innerHTML = `<div class="muted">${escapeHtml(emptyCopy)}</div>`;
        return;
      }

      container.innerHTML = items
        .map((item) => `<div class="insight-item"><span>${escapeHtml(item)}</span></div>`)
        .join('');
    };

    const renderSnapshot = (snapshot) => {
      const analysis = snapshot?.analysis || null;
      const score = analysis?.score || 0;

      scoreRingEl.style.setProperty('--score', `${score}`);
      scoreValueEl.textContent = analysis ? `${score}` : '--';
      scoreHeadlineEl.textContent = analysis?.label || 'Not analyzed yet';
      scoreSummaryEl.textContent = analysis?.summary || 'Scan the page to calculate a fit score and decide whether to jump into Quick Resume, the AI flow, or direct autofill.';

      identityTitleEl.textContent = snapshot?.title || 'Waiting for a visible job posting';
      identityMetaEl.textContent = [
        snapshot?.company || '',
        snapshot?.location || '',
        snapshot?.providerLabel || '',
      ].filter(Boolean).join(' • ') || 'Role, company, location, and platform details will appear here after scan.';

      renderPills(
        badgeRowEl,
        [
          snapshot?.providerLabel || '',
          snapshot?.employmentType || '',
          snapshot?.salary || '',
        ].filter(Boolean),
        'Job facts will appear here after the first scan.'
      );

      renderPills(
        signalRowEl,
        analysis?.signals || [],
        'No meaningful skill or tooling signals detected yet.'
      );

      renderInsightList(
        strengthsListEl,
        analysis?.strengths || [],
        'Run analysis to surface your strongest positioning points.'
      );

      renderInsightList(
        gapsListEl,
        analysis?.gaps || [],
        'Potential gaps will show up here so you know when to use the AI tailoring flow.'
      );

      recommendationButton.textContent = analysis?.recommendedLabel
        ? `Open ${analysis.recommendedLabel}`
        : 'Open Quick Resume';
    };

    const render = () => {
      dock.dataset.open = isOpen ? 'true' : 'false';
      dock.dataset.scanning = isScanning ? 'true' : 'false';
      renderSnapshot(lastSnapshot);
    };

    const openResumeRoute = async (route, successMessage) => {
      try {
        await chrome.runtime.sendMessage({
          type: 'OPEN_RESUMEATS_ROUTE',
          payload: { route },
        });
        if (successMessage) setStatus(successMessage, 'idle');
      } catch (error) {
        setStatus(error?.message || 'Could not open ResumeATS.', 'warning');
      }
    };

    const openSidePanel = async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
        setStatus('Opened the ResumeATS companion panel.', 'idle');
      } catch (error) {
        setStatus(error?.message || 'Could not open the companion panel.', 'warning');
      }
    };

    const autofillCurrentApplication = async () => {
      setStatus('Trying to autofill the current application form…', 'busy');

      try {
        const response = await chrome.runtime.sendMessage({ type: 'AUTOFILL_ACTIVE_TAB' });
        const filledCount = response?.result?.filledCount || 0;
        setStatus(`Autofilled ${filledCount} field${filledCount === 1 ? '' : 's'} on the current page.`, 'idle');
      } catch (error) {
        setStatus(error?.message || 'Could not autofill the current page.', 'warning');
      }
    };

    const scanCurrentJob = async ({ openPanel = true } = {}) => {
      if (isScanning) return;

      isScanning = true;
      if (openPanel) isOpen = true;
      setStatus('Reading the page, structuring the posting, and comparing it to your synced ResumeATS profile…', 'busy');
      render();

      try {
        await delay(320);
        const snapshot = getMeaningfulJobPostingSnapshot();

        if (!snapshot) {
          throw new Error('This page does not expose enough job data yet. Scroll the posting or wait for it to finish loading, then try again.');
        }

        lastSnapshot = await enrichJobPostingSnapshot(snapshot);
        await persistJobPostingSnapshot(lastSnapshot);
        setStatus(`Captured ${lastSnapshot.title || 'this role'} and saved a scored snapshot for ResumeATS.`, 'idle');
      } catch (error) {
        setStatus(error?.message || 'Could not analyze this job page.', 'warning');
      } finally {
        isScanning = false;
        render();
      }
    };

    launcher.addEventListener('click', () => {
      isOpen = !isOpen;
      render();
    });

    closeButton.addEventListener('click', () => {
      isOpen = false;
      render();
    });

    analyzeButton.addEventListener('click', () => {
      scanCurrentJob({ openPanel: true });
    });

    autofillButton.addEventListener('click', autofillCurrentApplication);
    companionButton.addEventListener('click', openSidePanel);
    recommendationButton.addEventListener('click', () => {
      const route = lastSnapshot?.analysis?.recommendedRoute || '/#/quick-resume';
      openResumeRoute(route, 'Opened the recommended ResumeATS flow for this role.');
    });
    openQuickButton.addEventListener('click', () => openResumeRoute('/#/quick-resume', 'Opened Quick Resume.'));
    openAiButton.addEventListener('click', () => openResumeRoute('/#/ai-generator', 'Opened the AI Generator.'));
    openAutoApplyButton.addEventListener('click', () => openResumeRoute('/#/auto-apply', 'Opened Auto-Apply.'));
    openDashboardButton.addEventListener('click', () => openResumeRoute('/#/dashboard', 'Opened your ResumeATS dashboard.'));

    let lastSeenUrl = window.location.href;
    window.setInterval(() => {
      if (window.location.href === lastSeenUrl) return;
      lastSeenUrl = window.location.href;

      const nextSnapshot = getMeaningfulJobPostingSnapshot();
      if (!nextSnapshot) return;

      lastSnapshot = {
        ...nextSnapshot,
        analysis: null,
      };
      persistJobPostingSnapshot(lastSnapshot);
      if (!isScanning) {
        setStatus(`Detected a new job page: ${nextSnapshot.title || 'Untitled role'}.`, 'idle');
      }
      render();
    }, 1200);

    if (initialSnapshot) {
      setStatus(`Detected ${initialSnapshot.title || 'this job'} on the page. Run a scan to score the fit.`, 'idle');
    }

    render();
    return { scanCurrentJob };
  };

  void createFloatingWidgetV2;

  const createFloatingWidgetV3 = (initialSnapshot = null) => {
    if (document.getElementById('resumeats-job-widget-host-v3')) {
      return null;
    }

    const POSITION_STORAGE_KEY = 'resumeats_job_widget_position_v7';
    const EDGE_GAP = 14;
    const EDGE_STICK = 18;
    const MIN_VISIBLE_LAUNCHER = 20;
    const DRAG_THRESHOLD = 6;
    const DEFAULT_POSITION = { snap: 'left', offset: 0.22 };
    const VALID_SNAP_VALUES = ['left', 'right', 'top', 'bottom'];
    const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
    const normalizeDockPosition = (value) => ({
      snap: VALID_SNAP_VALUES.includes(value?.snap) ? value.snap : DEFAULT_POSITION.snap,
      offset: clampNumber(typeof value?.offset === 'number' ? value.offset : DEFAULT_POSITION.offset, 0, 1),
    });
    const readDockPosition = () => {
      try {
        return normalizeDockPosition(JSON.parse(window.localStorage.getItem(POSITION_STORAGE_KEY) || 'null'));
      } catch {
        return DEFAULT_POSITION;
      }
    };
    const writeDockPosition = (value) => {
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(normalizeDockPosition(value)));
      } catch {
        // Ignore storage failures in the content script.
      }
    };

    const host = document.createElement('div');
    host.id = 'resumeats-job-widget-host-v3';
    const shadow = host.attachShadow({ mode: 'open' });
    const mountHost = () => {
      const container = document.body || document.documentElement;
      if (!container) return false;
      if (host.parentNode !== container) {
        container.appendChild(host);
      }
      return true;
    };
    mountHost();

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .dock {
          --score: 0;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 2147483646;
          display: block;
          font-family: "Manrope", "SF Pro Display", "Avenir Next", "Segoe UI", sans-serif;
          color: #f5f8ff;
          pointer-events: none;
          will-change: left, top;
          transition:
            left 220ms cubic-bezier(0.22, 1, 0.36, 1),
            top 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .dock[data-dragging="true"],
        .dock[data-dragging="true"] * {
          cursor: grabbing !important;
          user-select: none !important;
        }

        .dock[data-dragging="true"] {
          transition: none !important;
        }

        .panel,
        .launcher {
          pointer-events: auto;
        }

        .panel {
          position: absolute;
          width: 344px;
          max-height: min(500px, calc(100vh - 28px));
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            radial-gradient(circle at top left, rgba(76, 125, 255, 0.18), transparent 34%),
            radial-gradient(circle at top right, rgba(25, 212, 189, 0.1), transparent 18%),
            linear-gradient(180deg, rgba(13, 20, 35, 0.97), rgba(11, 18, 31, 0.94));
          box-shadow: 0 26px 52px rgba(2, 6, 23, 0.28);
          backdrop-filter: blur(24px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease, transform 180ms ease;
          overflow: hidden;
        }

        .dock[data-snap="right"] .panel {
          right: calc(100% + 10px);
          top: 50%;
          transform: translate3d(12px, -50%, 0) scale(0.98);
        }

        .dock[data-snap="left"] .panel {
          left: calc(100% + 10px);
          top: 50%;
          transform: translate3d(-12px, -50%, 0) scale(0.98);
        }

        .dock[data-snap="top"] .panel {
          top: calc(100% + 10px);
          left: 50%;
          transform: translate3d(-50%, -12px, 0) scale(0.98);
        }

        .dock[data-snap="bottom"] .panel {
          bottom: calc(100% + 10px);
          left: 50%;
          transform: translate3d(-50%, 12px, 0) scale(0.98);
        }

        .dock[data-open="true"] .panel {
          opacity: 1;
          pointer-events: auto;
        }

        .dock[data-open="true"][data-snap="right"] .panel {
          transform: translate3d(0, -50%, 0) scale(1);
        }

        .dock[data-open="true"][data-snap="left"] .panel {
          transform: translate3d(0, -50%, 0) scale(1);
        }

        .dock[data-open="true"][data-snap="top"] .panel {
          transform: translate3d(-50%, 0, 0) scale(1);
        }

        .dock[data-open="true"][data-snap="bottom"] .panel {
          transform: translate3d(-50%, 0, 0) scale(1);
        }

        .panel-shell {
          position: relative;
          padding: 16px;
          overflow: auto;
          max-height: min(500px, calc(100vh - 28px));
        }

        .panel-shell::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 96px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent),
            radial-gradient(circle at 14% 18%, rgba(76, 125, 255, 0.18), transparent 32%);
          pointer-events: none;
        }

        .panel-head {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 30px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(118, 154, 255, 0.18);
          background: rgba(76, 125, 255, 0.12);
          color: #dce6ff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          box-shadow: 0 10px 24px rgba(2, 6, 23, 0.16);
        }

        .eyebrow-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #0ea872;
          box-shadow: 0 0 0 0 rgba(14, 168, 114, 0.34);
          animation: pulse-dot 2.1s ease-out infinite;
        }

        .title {
          margin: 10px 0 0;
          font-size: 24px;
          line-height: 0.94;
          font-weight: 800;
          letter-spacing: -0.065em;
          color: #f5f8ff;
        }

        .copy {
          margin: 7px 0 0;
          max-width: 220px;
          color: #8fa1c5;
          font-size: 11px;
          line-height: 1.55;
        }

        .head-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .drag-chip,
        .icon-button,
        .action,
        .text-link {
          appearance: none;
          border: 0;
          font: inherit;
        }

        .drag-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.06);
          color: #dce6ff;
          font-size: 11px;
          font-weight: 800;
          cursor: grab;
          touch-action: none;
          box-shadow: 0 12px 24px rgba(2, 6, 23, 0.14);
        }

        .drag-dot-grid,
        .launcher-grip {
          width: 18px;
          height: 8px;
          flex: 0 0 auto;
          border-radius: 999px;
          background:
            radial-gradient(circle, rgba(100, 116, 139, 0.95) 1px, transparent 1.2px) 0 0 / 6px 6px;
          opacity: 0.72;
        }

        .icon-button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.06);
          color: #dce6ff;
          cursor: pointer;
          box-shadow: 0 12px 24px rgba(2, 6, 23, 0.14);
          transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
        }

        .icon-button svg {
          width: 15px;
          height: 15px;
        }

        .icon-button:hover,
        .action:hover,
        .text-link:hover,
        .launcher:hover {
          transform: translateY(-1px);
        }

        .icon-button:hover {
          border-color: rgba(118, 154, 255, 0.24);
          background: rgba(255, 255, 255, 0.1);
        }

        .status {
          position: relative;
          z-index: 1;
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(118, 154, 255, 0.16);
          background: rgba(255, 255, 255, 0.05);
          color: #dce6ff;
          font-size: 11px;
          line-height: 1.4;
          font-weight: 700;
        }

        .status[data-tone="busy"] {
          border-color: rgba(118, 154, 255, 0.18);
          background: rgba(76, 125, 255, 0.15);
        }

        .status[data-tone="warning"] {
          border-color: rgba(245, 177, 75, 0.22);
          background: rgba(245, 177, 75, 0.12);
          color: #ffe0a5;
        }

        .summary-card {
          display: grid;
          gap: 12px;
          margin-top: 12px;
          padding: 14px;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
            rgba(7, 14, 27, 0.62);
          box-shadow: 0 14px 28px rgba(2, 6, 23, 0.16);
        }

        .identity-line {
          display: grid;
          gap: 5px;
        }

        .identity-title {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.28;
          letter-spacing: -0.045em;
          color: #f5f8ff;
        }

        .identity-meta {
          font-size: 12px;
          line-height: 1.5;
          color: #8fa1c5;
        }

        .score-row {
          display: grid;
          grid-template-columns: 78px 1fr;
          gap: 14px;
          align-items: center;
        }

        .score-ring {
          width: 78px;
          height: 78px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          position: relative;
          background:
            radial-gradient(circle at 50% 50%, rgba(10, 17, 32, 0.96) 56%, transparent 58%),
            conic-gradient(from 180deg, #4b7cff calc(var(--score) * 1%), rgba(143, 161, 197, 0.18) 0);
          box-shadow:
            inset 0 0 0 8px rgba(255, 255, 255, 0.04),
            0 16px 28px rgba(2, 6, 23, 0.22);
        }

        .score-value {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.06em;
          text-align: center;
          color: #f5f8ff;
        }

        .score-caption {
          margin-top: 2px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-align: center;
          color: #8fa1c5;
        }

        .score-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #8fa1c5;
        }

        .score-headline {
          margin-top: 6px;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: #f5f8ff;
        }

        .score-summary {
          margin-top: 5px;
          font-size: 12px;
          line-height: 1.52;
          color: #8fa1c5;
        }

        .pill-row,
        .signal-row,
        .link-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pill,
        .signal-pill {
          display: inline-flex;
          align-items: center;
          min-height: 29px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(118, 154, 255, 0.18);
          background: rgba(76, 125, 255, 0.12);
          color: #dce6ff;
          font-size: 11px;
          font-weight: 700;
        }

        .signal-pill {
          background: rgba(25, 212, 189, 0.12);
          border-color: rgba(25, 212, 189, 0.18);
          color: #c8fff6;
        }

        .section {
          margin-top: 14px;
        }

        .section-label {
          margin-bottom: 9px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #8fa1c5;
        }

        .insight-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 14px;
        }

        .insight-card {
          padding: 13px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
            rgba(7, 14, 27, 0.62);
        }

        .insight-card[data-tone="good"] {
          background:
            linear-gradient(180deg, rgba(25, 212, 189, 0.12), rgba(25, 212, 189, 0.04)),
            rgba(7, 14, 27, 0.62);
        }

        .insight-card[data-tone="warn"] {
          background:
            linear-gradient(180deg, rgba(76, 125, 255, 0.12), rgba(76, 125, 255, 0.04)),
            rgba(7, 14, 27, 0.62);
        }

        .insight-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #dce6ff;
        }

        .insight-list {
          display: grid;
          gap: 8px;
          margin-top: 9px;
          font-size: 12px;
          line-height: 1.5;
          color: #c7d4f3;
        }

        .insight-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .insight-item::before {
          content: "";
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          margin-top: 6px;
          border-radius: 999px;
          background: #19d4bd;
        }

        .muted {
          color: #8fa1c5;
          font-size: 12px;
          line-height: 1.45;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-top: 12px;
        }

        .action {
          min-height: 40px;
          border-radius: 15px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0 14px;
          background: rgba(255, 255, 255, 0.06);
          color: #f5f8ff;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 14px 26px rgba(2, 6, 23, 0.16);
          transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
        }

        .action.primary {
          border: 0;
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.22), transparent 24%),
            linear-gradient(135deg, #4c7dff, #19d4bd);
          color: white;
          box-shadow: 0 18px 30px rgba(39, 87, 228, 0.28);
        }

        .action.secondary:hover,
        .text-link:hover {
          border-color: rgba(118, 154, 255, 0.24);
          background: rgba(255, 255, 255, 0.1);
        }

        .link-row {
          margin-top: 10px;
        }

        .text-link {
          min-height: 31px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.06);
          color: #c7d4f3;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
        }

        .progress {
          position: relative;
          width: 100%;
          height: 4px;
          margin-top: 12px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.18);
          overflow: hidden;
          opacity: 0;
          transform: scaleY(0.82);
          transition: opacity 150ms ease, transform 150ms ease;
        }

        .dock[data-progress="true"] .progress {
          opacity: 1;
          transform: scaleY(1);
        }

        .progress-fill {
          position: absolute;
          inset: 0 auto 0 0;
          width: 0%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #315efb, #60a5fa, #11b37f);
          box-shadow: 0 0 16px rgba(49, 94, 251, 0.32);
          transition: width 180ms ease;
        }

        .progress[data-tone="warning"] .progress-fill {
          background: linear-gradient(90deg, #f59e0b, #fbbf24);
          box-shadow: 0 0 16px rgba(245, 158, 11, 0.3);
        }

        .progress[data-tone="success"] .progress-fill {
          background: linear-gradient(90deg, #2563eb, #10b981);
        }

        .launcher {
          position: relative;
          display: grid;
          place-items: center;
          width: 58px;
          height: 68px;
          padding: 0;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            radial-gradient(circle at 28% 18%, rgba(255, 255, 255, 0.28), transparent 30%),
            linear-gradient(160deg, #0b1325 0%, #2353db 56%, #19cfbf 100%);
          color: white;
          box-shadow:
            0 18px 34px rgba(2, 6, 23, 0.24),
            inset 0 1px 0 rgba(255, 255, 255, 0.24);
          cursor: grab;
          transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
          touch-action: none;
        }

        .launcher::before,
        .launcher::after {
          content: "";
          position: absolute;
          pointer-events: none;
        }

        .launcher::before {
          z-index: -1;
          opacity: 0.95;
        }

        .launcher::after {
          inset: -10px;
          z-index: -2;
          border-radius: 28px;
          background: radial-gradient(circle at center, rgba(44, 102, 255, 0.28), transparent 72%);
          filter: blur(12px);
          opacity: 0.72;
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .dock[data-open="true"] .launcher {
          transform: scale(1.02);
          box-shadow:
            0 20px 38px rgba(15, 23, 42, 0.24),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .dock[data-open="true"] .launcher::after {
          opacity: 1;
          transform: scale(1.04);
        }

        .dock[data-snap="left"] .launcher {
          border-radius: 0 24px 24px 0;
        }

        .dock[data-snap="left"] .launcher::before {
          left: -16px;
          top: 12px;
          bottom: 12px;
          width: 24px;
          border-radius: 0 18px 18px 0;
          background: linear-gradient(90deg, rgba(10, 17, 32, 0.02), rgba(33, 72, 207, 0.38), rgba(21, 201, 187, 0.82));
        }

        .dock[data-snap="right"] .launcher {
          border-radius: 24px 0 0 24px;
        }

        .dock[data-snap="right"] .launcher::before {
          right: -16px;
          top: 12px;
          bottom: 12px;
          width: 24px;
          border-radius: 18px 0 0 18px;
          background: linear-gradient(270deg, rgba(10, 17, 32, 0.02), rgba(33, 72, 207, 0.38), rgba(21, 201, 187, 0.82));
        }

        .dock[data-snap="top"] .launcher {
          border-radius: 0 0 20px 20px;
        }

        .dock[data-snap="top"] .launcher::before {
          left: 9px;
          right: 9px;
          top: -16px;
          height: 24px;
          border-radius: 0 0 16px 16px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(29, 78, 216, 0.32), rgba(20, 184, 166, 0.7));
        }

        .dock[data-snap="bottom"] .launcher {
          border-radius: 20px 20px 0 0;
        }

        .dock[data-snap="bottom"] .launcher::before {
          left: 9px;
          right: 9px;
          bottom: -16px;
          height: 24px;
          border-radius: 16px 16px 0 0;
          background: linear-gradient(0deg, rgba(15, 23, 42, 0.02), rgba(29, 78, 216, 0.32), rgba(20, 184, 166, 0.7));
        }

        .launcher-core {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          border-radius: inherit;
          background: transparent;
          color: white;
          box-shadow: none;
        }

        .launcher-core svg {
          width: 26px;
          height: 26px;
        }

        .dock[data-scanning="true"] .launcher-core svg {
          animation: spin 1s linear infinite;
        }

        @keyframes pulse-dot {
          0% { box-shadow: 0 0 0 0 rgba(14, 168, 114, 0.34); }
          100% { box-shadow: 0 0 0 11px rgba(14, 168, 114, 0); }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
          .panel {
            width: min(320px, calc(100vw - 28px));
          }

          .score-row,
          .insight-grid,
          .actions {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .eyebrow-dot,
          .dock[data-scanning="true"] .launcher-core svg {
            animation: none !important;
          }

          .panel,
          .launcher,
          .icon-button,
          .action,
          .text-link {
            transition: none !important;
          }
        }
      </style>
      <div class="dock" data-open="false" data-scanning="false" data-snap="right" data-dragging="false">
        <div class="panel">
          <div class="panel-shell">
            <div class="panel-head">
              <div>
                <div class="eyebrow">
                  <span class="eyebrow-dot" aria-hidden="true"></span>
                  <span>ResumeATS</span>
                </div>
                <h2 class="title">Read the role.</h2>
                <p class="copy">Capture the posting, score the fit, and jump into the right action.</p>
              </div>
              <div class="head-actions">
                <button class="drag-chip drag-panel" type="button" aria-label="Drag and snap widget">
                  <span class="drag-dot-grid" aria-hidden="true"></span>
                    <span>Dock</span>
                </button>
                <button class="icon-button site-toggle" type="button" aria-label="Hide widget on this site" title="Hide widget on this site">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12c2.5-4 5.25-6 8-6s5.5 2 8 6c-2.5 4-5.25 6-8 6s-5.5-2-8-6Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M4 4l16 16"></path>
                  </svg>
                </button>
                <button class="icon-button close" type="button" aria-label="Close job companion">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M6 6l12 12"></path>
                    <path d="M18 6L6 18"></path>
                  </svg>
                </button>
              </div>
            </div>

              <div class="status" data-tone="idle">Ready to scan.</div>

            <div class="summary-card">
              <div class="identity-line">
                  <div class="identity-title">Waiting for a job</div>
                  <div class="identity-meta">Title, company, location, and platform appear here after the first scan.</div>
              </div>

              <div class="score-row">
                <div class="score-ring">
                  <div>
                    <div class="score-value">--</div>
                    <div class="score-caption">Match</div>
                  </div>
                </div>
                <div>
                    <div class="score-label">Current Read</div>
                    <div class="score-headline">Not analyzed yet</div>
                    <div class="score-summary">Scan once to decide whether to tailor, autofill, or open the AI flow.</div>
                </div>
              </div>

              <div class="pill-row"></div>
            </div>

            <div class="section">
                <div class="section-label">Signals</div>
              <div class="signal-row"></div>
            </div>

            <div class="insight-grid">
              <div class="insight-card" data-tone="good">
                <div class="insight-title">Strengths</div>
                <div class="insight-list strengths-list">
                  <div class="muted">Run analysis to surface the strongest matching signals.</div>
                </div>
              </div>
              <div class="insight-card" data-tone="warn">
                <div class="insight-title">Gaps</div>
                <div class="insight-list gaps-list">
                    <div class="muted">Potential gaps show up here when this role needs deeper tailoring.</div>
                </div>
              </div>
            </div>

            <div class="actions">
                <button class="action primary analyze" type="button">Analyze</button>
                <button class="action secondary autofill" type="button">Autofill</button>
                <button class="action secondary recommendation" type="button">Open Resume</button>
                <button class="action secondary companion" type="button">Open Panel</button>
            </div>

            <div class="link-row">
              <button class="text-link open-quick" type="button">Quick Resume</button>
              <button class="text-link open-ai" type="button">AI Generator</button>
              <button class="text-link open-auto-apply" type="button">Auto-Apply</button>
              <button class="text-link open-dashboard" type="button">Dashboard</button>
            </div>

            <div class="progress" data-tone="busy" aria-hidden="true"><div class="progress-fill"></div></div>
          </div>
        </div>

        <button class="launcher" type="button" aria-label="Open ResumeATS job companion">
          <div class="launcher-core">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7.25 4.75h7l2.75 2.75v9.25a2 2 0 0 1-2 2h-7.75a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"></path>
              <path d="M14.25 4.75v3h2.75"></path>
              <path d="M8.5 10.5h6.5"></path>
              <path d="M8.5 13.5h4.5"></path>
              <path d="m8.4 16.1 1.45 1.45 3.2-3.35"></path>
            </svg>
          </div>
        </button>
      </div>
    `;

    const dock = shadow.querySelector('.dock');
    const launcher = shadow.querySelector('.launcher');
    const dragPanelButton = shadow.querySelector('.drag-panel');
    const siteToggleButton = shadow.querySelector('.site-toggle');
    const closeButton = shadow.querySelector('.close');
    const analyzeButton = shadow.querySelector('.analyze');
    const autofillButton = shadow.querySelector('.autofill');
    const recommendationButton = shadow.querySelector('.recommendation');
    const companionButton = shadow.querySelector('.companion');
    const statusEl = shadow.querySelector('.status');
    const progressEl = shadow.querySelector('.progress');
    const progressFillEl = shadow.querySelector('.progress-fill');
    const scoreRingEl = shadow.querySelector('.score-ring');
    const scoreValueEl = shadow.querySelector('.score-value');
    const scoreHeadlineEl = shadow.querySelector('.score-headline');
    const scoreSummaryEl = shadow.querySelector('.score-summary');
    const identityTitleEl = shadow.querySelector('.identity-title');
    const identityMetaEl = shadow.querySelector('.identity-meta');
    const pillRowEl = shadow.querySelector('.pill-row');
    const signalRowEl = shadow.querySelector('.signal-row');
    const strengthsListEl = shadow.querySelector('.strengths-list');
    const gapsListEl = shadow.querySelector('.gaps-list');
    const openQuickButton = shadow.querySelector('.open-quick');
    const openAiButton = shadow.querySelector('.open-ai');
    const openAutoApplyButton = shadow.querySelector('.open-auto-apply');
    const openDashboardButton = shadow.querySelector('.open-dashboard');

    let isOpen = false;
    let isScanning = false;
    let lastSnapshot = initialSnapshot;
    let dockPosition = readDockPosition();
    let dragState = null;
    let hasForcedVisibilityReset = false;
    let dragCleanup = null;
    let hasBeenDestroyed = false;
    let locationWatchId = null;
    let hostWatchId = null;
    let progressInterval = null;
    let progressHideTimeout = null;
    let progressState = {
      active: false,
      value: 0,
      tone: 'busy',
    };

    const ensureHostMounted = () => {
      if (hasBeenDestroyed) return false;
      try {
        return mountHost();
      } catch {
        return false;
      }
    };

    const setStatus = (message, tone = 'idle') => {
      statusEl.textContent = message;
      statusEl.dataset.tone = tone;
    };

    const clearProgressTimers = () => {
      if (progressInterval) {
        window.clearInterval(progressInterval);
        progressInterval = null;
      }

      if (progressHideTimeout) {
        window.clearTimeout(progressHideTimeout);
        progressHideTimeout = null;
      }
    };

    const renderProgress = () => {
      dock.dataset.progress = progressState.active ? 'true' : 'false';
      progressEl.dataset.tone = progressState.tone;
      progressFillEl.style.width = `${Math.max(0, Math.min(100, progressState.value))}%`;
    };

    const startProgress = (tone = 'busy') => {
      clearProgressTimers();
      progressState = {
        active: true,
        value: 12,
        tone,
      };
      renderProgress();
      progressInterval = window.setInterval(() => {
        progressState.value = Math.min(
          progressState.value + (progressState.value < 48 ? 11 : progressState.value < 74 ? 6 : 2),
          88,
        );
        renderProgress();
      }, 260);
    };

    const settleProgress = (tone = 'success') => {
      clearProgressTimers();
      progressState = {
        active: true,
        value: 100,
        tone,
      };
      renderProgress();
      progressHideTimeout = window.setTimeout(() => {
        progressState = {
          active: false,
          value: 0,
          tone: 'busy',
        };
        renderProgress();
      }, tone === 'warning' ? 1400 : 800);
    };

    const renderPills = (container, items, emptyCopy, className) => {
      if (!items || items.length === 0) {
        container.innerHTML = `<div class="muted">${escapeHtml(emptyCopy)}</div>`;
        return;
      }

      container.innerHTML = items
        .map((item) => `<span class="${className}">${escapeHtml(item)}</span>`)
        .join('');
    };

    const renderInsightList = (container, items, emptyCopy) => {
      if (!items || items.length === 0) {
        container.innerHTML = `<div class="muted">${escapeHtml(emptyCopy)}</div>`;
        return;
      }

      container.innerHTML = items
        .map((item) => `<div class="insight-item"><span>${escapeHtml(item)}</span></div>`)
        .join('');
    };

    const resetDockPosition = () => {
      dockPosition = { ...DEFAULT_POSITION };
      writeDockPosition(dockPosition);
    };

    const getViewportMetrics = () => {
      const viewportWidth = Math.max(1, document.documentElement?.clientWidth || window.innerWidth);
      const viewportHeight = Math.max(1, document.documentElement?.clientHeight || window.innerHeight);
      const rightGutter = Math.max(0, window.innerWidth - viewportWidth);
      const bottomGutter = Math.max(0, window.innerHeight - viewportHeight);

      return {
        viewportWidth,
        viewportHeight,
        rightGutter,
        bottomGutter,
        rightStick: rightGutter > 0 ? 0 : EDGE_STICK,
        bottomStick: bottomGutter > 0 ? 0 : EDGE_STICK,
      };
    };

    const isLauncherVisible = () => {
      const { viewportWidth, viewportHeight } = getViewportMetrics();
      const rect = launcher.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right >= MIN_VISIBLE_LAUNCHER &&
        rect.left <= viewportWidth - MIN_VISIBLE_LAUNCHER &&
        rect.bottom >= MIN_VISIBLE_LAUNCHER &&
        rect.top <= viewportHeight - MIN_VISIBLE_LAUNCHER
      );
    };

    const applyDockPosition = () => {
      dock.dataset.snap = dockPosition.snap;

      const {
        viewportWidth,
        viewportHeight,
        rightStick,
        bottomStick,
      } = getViewportMetrics();
      const rect = launcher.getBoundingClientRect();
      const availableWidth = Math.max(0, viewportWidth - rect.width - EDGE_GAP * 2);
      const availableHeight = Math.max(0, viewportHeight - rect.height - EDGE_GAP * 2);
      const minLeft = -EDGE_STICK;
      const maxLeft = Math.max(minLeft, viewportWidth - rect.width + rightStick);
      const minTop = -EDGE_STICK;
      const maxTop = Math.max(minTop, viewportHeight - rect.height + bottomStick);

      let left = EDGE_GAP;
      let top = EDGE_GAP;

      if (dockPosition.snap === 'left') {
        left = -EDGE_STICK;
        top = EDGE_GAP + availableHeight * dockPosition.offset;
      } else if (dockPosition.snap === 'right') {
        left = viewportWidth - rect.width + rightStick;
        top = EDGE_GAP + availableHeight * dockPosition.offset;
      } else if (dockPosition.snap === 'top') {
        left = EDGE_GAP + availableWidth * dockPosition.offset;
        top = -EDGE_STICK;
      } else {
        left = EDGE_GAP + availableWidth * dockPosition.offset;
        top = viewportHeight - rect.height + bottomStick;
      }

      dock.style.left = `${Math.round(clampNumber(left, minLeft, maxLeft))}px`;
      dock.style.top = `${Math.round(clampNumber(top, minTop, maxTop))}px`;

      window.requestAnimationFrame(() => {
        if (isLauncherVisible() || hasForcedVisibilityReset) return;
        hasForcedVisibilityReset = true;
        resetDockPosition();
        applyDockPosition();
        window.requestAnimationFrame(() => {
          hasForcedVisibilityReset = false;
        });
      });
    };

    const persistDockPosition = () => {
      writeDockPosition(dockPosition);
      window.requestAnimationFrame(applyDockPosition);
    };

    const snapDockToNearestEdge = () => {
      const {
        viewportWidth,
        viewportHeight,
      } = getViewportMetrics();
      const rect = launcher.getBoundingClientRect();
      const distances = [
        { snap: 'left', value: rect.left },
        { snap: 'right', value: Math.abs(viewportWidth - rect.right) },
        { snap: 'top', value: rect.top },
        { snap: 'bottom', value: Math.abs(viewportHeight - rect.bottom) },
      ].sort((a, b) => a.value - b.value);

      const nextSnap = distances[0]?.snap || DEFAULT_POSITION.snap;

      if (nextSnap === 'left' || nextSnap === 'right') {
        const availableHeight = Math.max(1, viewportHeight - rect.height - EDGE_GAP * 2);
        dockPosition = {
          snap: nextSnap,
          offset: clampNumber((rect.top - EDGE_GAP) / availableHeight, 0, 1),
        };
      } else {
        const availableWidth = Math.max(1, viewportWidth - rect.width - EDGE_GAP * 2);
        dockPosition = {
          snap: nextSnap,
          offset: clampNumber((rect.left - EDGE_GAP) / availableWidth, 0, 1),
        };
      }

      persistDockPosition();
    };

    const renderSnapshot = (snapshot) => {
      const analysis = snapshot?.analysis || null;
      const score = analysis?.score || 0;
      const isApplicationPage = looksLikeApplicationForm() || Boolean(findApplyEntryButton());

      scoreRingEl.style.setProperty('--score', `${score}`);
      scoreValueEl.textContent = analysis ? `${score}` : '--';
      scoreHeadlineEl.textContent = analysis?.label || (isApplicationPage ? 'Form detected' : 'Ready to scan');
      scoreSummaryEl.textContent = analysis?.summary || (
        isApplicationPage
          ? 'This page looks like an application flow. Use Autofill once the fields you need are visible.'
          : 'Open any real job page and run a scan.'
      );

      identityTitleEl.textContent = snapshot?.title || (isApplicationPage ? 'Application flow is open' : 'ResumeATS is docked');
      identityMetaEl.textContent = [
        snapshot?.company || '',
        snapshot?.location || '',
        snapshot?.providerLabel || '',
      ].filter(Boolean).join(' | ') || (
        isApplicationPage
          ? 'The extension can stay here while you autofill or move into ResumeATS.'
          : 'The launcher stays ready on public pages the moment you open a real role.'
      );

      renderPills(
        pillRowEl,
        [
          snapshot?.providerLabel || '',
          snapshot?.employmentType || '',
          snapshot?.salary || '',
        ].filter(Boolean),
        'Role facts appear here after the first scan.',
        'pill'
      );

      renderPills(
        signalRowEl,
        analysis?.signals || [],
        'No strong signals detected yet.',
        'signal-pill'
      );

      renderInsightList(
        strengthsListEl,
        analysis?.strengths || [],
        isApplicationPage
          ? 'Autofill can still work here before a full job analysis exists.'
          : 'Analyze a role to surface the strongest matching signals.'
      );

      renderInsightList(
        gapsListEl,
        analysis?.gaps || [],
        isApplicationPage
          ? 'Potential answer gaps show up after you analyze the related posting.'
          : 'Potential gaps appear here after the first real job scan.'
      );

      recommendationButton.textContent = analysis?.recommendedLabel
        ? `Open ${analysis.recommendedLabel}`
        : isApplicationPage
          ? 'Autofill now'
          : 'Open ResumeATS';
    };

    const render = () => {
      if (hasBeenDestroyed) return;
      ensureHostMounted();
      dock.dataset.open = isOpen ? 'true' : 'false';
      dock.dataset.scanning = isScanning ? 'true' : 'false';
      renderSnapshot(lastSnapshot);
      renderProgress();
      window.requestAnimationFrame(applyDockPosition);
    };

    const teardownWidget = () => {
      if (hasBeenDestroyed) return;
      hasBeenDestroyed = true;
      if (locationWatchId) {
        window.clearInterval(locationWatchId);
        locationWatchId = null;
      }
      if (hostWatchId) {
        window.clearInterval(hostWatchId);
        hostWatchId = null;
      }
      clearProgressTimers();
      dragCleanup?.();
      window.removeEventListener('resize', applyDockPosition);
      host.remove();
    };

    const hideWidgetOnCurrentSite = async () => {
      const hostKey = normalizeHostKey(hostname);
      await writeUiSettings((settings) => ({
        ...settings,
        disabledHosts: settings.disabledHosts.includes(hostKey)
          ? settings.disabledHosts
          : [...settings.disabledHosts, hostKey],
      }));
    };

    const openResumeRoute = async (route, successMessage) => {
      try {
        await chrome.runtime.sendMessage({
          type: 'OPEN_RESUMEATS_ROUTE',
          payload: { route },
        });
        if (successMessage) setStatus(successMessage, 'idle');
      } catch (error) {
        setStatus(error?.message || 'Could not open ResumeATS.', 'warning');
      }
    };

    const openSidePanel = async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
        setStatus('Opened the ResumeATS side panel.', 'idle');
      } catch (error) {
        setStatus(error?.message || 'Could not open the side panel.', 'warning');
      }
    };

    const autofillCurrentApplication = async () => {
      startProgress('busy');
      setStatus('Autofilling the current form...', 'busy');

      try {
        const response = await chrome.runtime.sendMessage({ type: 'AUTOFILL_ACTIVE_TAB' });
        const filledCount = response?.result?.filledCount || 0;
        if (filledCount > 0) {
          isOpen = false;
          setStatus(`Autofilled ${filledCount} field${filledCount === 1 ? '' : 's'} on the current page.`, 'idle');
          settleProgress('success');
        } else {
          setStatus('No matching fields were found yet. Scroll or expand the form, then try again.', 'warning');
          settleProgress('warning');
        }
      } catch (error) {
        setStatus(error?.message || 'Could not autofill the current page.', 'warning');
        settleProgress('warning');
      } finally {
        render();
      }
    };

    const scanCurrentJob = async ({ openPanel = true } = {}) => {
      if (isScanning) return;

      isScanning = true;
      if (openPanel) isOpen = true;
      startProgress('busy');
      setStatus('Reading the page and scoring the fit...', 'busy');
      render();

      try {
        await delay(320);
        const snapshot = getMeaningfulJobPostingSnapshot();

        if (!snapshot) {
          throw new Error('This page does not expose enough job data yet. Scroll the posting or wait for it to finish loading, then try again.');
        }

        lastSnapshot = await enrichJobPostingSnapshot(snapshot);
        await persistJobPostingSnapshot(lastSnapshot);
        setStatus(`Captured ${lastSnapshot.title || 'this role'} and saved a scored snapshot for ResumeATS.`, 'idle');
        settleProgress('success');
      } catch (error) {
        setStatus(error?.message || 'Could not analyze this job page.', 'warning');
        settleProgress('warning');
      } finally {
        isScanning = false;
        render();
      }
    };

    const beginDrag = (event, { toggleOnTap = false } = {}) => {
      if (event.button !== 0) return;

      dragCleanup?.();
      const rect = dock.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: Number.parseFloat(dock.style.left) || rect.left,
        originTop: Number.parseFloat(dock.style.top) || rect.top,
        moved: false,
        toggleOnTap,
        target: event.currentTarget,
      };

      dock.dataset.dragging = 'true';
      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener('pointermove', moveDrag, true);
      window.addEventListener('pointerup', endDrag, true);
      window.addEventListener('pointercancel', cancelDrag, true);
      dragCleanup = () => {
        window.removeEventListener('pointermove', moveDrag, true);
        window.removeEventListener('pointerup', endDrag, true);
        window.removeEventListener('pointercancel', cancelDrag, true);
        dragCleanup = null;
      };
      event.preventDefault();
      event.stopPropagation();
    };

    const moveDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const {
        viewportWidth,
        viewportHeight,
        rightStick,
        bottomStick,
      } = getViewportMetrics();
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;

      if (!dragState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
        dragState.moved = true;
      }

      if (!dragState.moved) return;

      const rect = launcher.getBoundingClientRect();
      const nextLeft = clampNumber(
        dragState.originLeft + deltaX,
        -EDGE_STICK,
        Math.max(-EDGE_STICK, viewportWidth - rect.width + rightStick)
      );
      const nextTop = clampNumber(
        dragState.originTop + deltaY,
        -EDGE_STICK,
        Math.max(-EDGE_STICK, viewportHeight - rect.height + bottomStick)
      );

      dock.style.left = `${Math.round(nextLeft)}px`;
      dock.style.top = `${Math.round(nextTop)}px`;
    };

    const endDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const { moved, toggleOnTap } = dragState;
      dock.dataset.dragging = 'false';
      dragState.target?.releasePointerCapture?.(event.pointerId);
      dragCleanup?.();
      dragState = null;

      if (moved) {
        snapDockToNearestEdge();
        return;
      }

      if (toggleOnTap) {
        isOpen = !isOpen;
        render();
      }
    };

    const cancelDrag = (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      dock.dataset.dragging = 'false';
      dragState.target?.releasePointerCapture?.(event.pointerId);
      dragCleanup?.();
      dragState = null;
      render();
    };

    const wireDragSurface = (element, options) => {
      element.addEventListener('pointerdown', (event) => beginDrag(event, options));
    };

    wireDragSurface(launcher, { toggleOnTap: true });
    wireDragSurface(dragPanelButton, { toggleOnTap: false });

    launcher.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      isOpen = !isOpen;
      render();
    });

    launcher.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetDockPosition();
      render();
    });

    closeButton.addEventListener('click', () => {
      isOpen = false;
      render();
    });

    analyzeButton.addEventListener('click', () => {
      scanCurrentJob({ openPanel: true });
    });

    autofillButton.addEventListener('click', autofillCurrentApplication);
    companionButton.addEventListener('click', openSidePanel);
    recommendationButton.addEventListener('click', () => {
      if (!lastSnapshot && (looksLikeApplicationForm() || findApplyEntryButton())) {
        autofillCurrentApplication();
        return;
      }

      const route = lastSnapshot?.analysis?.recommendedRoute || '/#/dashboard';
      openResumeRoute(route, 'Opened the recommended ResumeATS flow for this page.');
    });
    openQuickButton.addEventListener('click', () => openResumeRoute('/#/quick-resume', 'Opened Quick Resume.'));
    openAiButton.addEventListener('click', () => openResumeRoute('/#/ai-generator', 'Opened the AI Generator.'));
    openAutoApplyButton.addEventListener('click', () => openResumeRoute('/#/auto-apply', 'Opened Auto-Apply.'));
    openDashboardButton.addEventListener('click', () => openResumeRoute('/#/dashboard', 'Opened your ResumeATS dashboard.'));
    siteToggleButton.addEventListener('click', async () => {
      setStatus(`Hiding ResumeATS Companion on ${hostname}...`, 'idle');
      try {
        await hideWidgetOnCurrentSite();
      } catch (error) {
        setStatus(error?.message || 'Could not hide the widget on this site.', 'warning');
      }
    });
    window.addEventListener('resize', applyDockPosition);

    const refreshPageContext = ({ persist = false } = {}) => {
      const nextSnapshot = getMeaningfulJobPostingSnapshot();

      if (!nextSnapshot) {
        lastSnapshot = null;
        if (!isScanning) {
          setStatus(
            looksLikeApplicationForm() || findApplyEntryButton()
              ? 'Application form detected. Autofill is ready.'
              : 'ResumeATS is docked here. Open a job or application page and hit Analyze.',
            'idle'
          );
        }
        render();
        return true;
      }

      lastSnapshot = {
        ...nextSnapshot,
        analysis: null,
      };

      if (persist) {
        persistJobPostingSnapshot(lastSnapshot);
      }

      if (!isScanning) {
        setStatus(`Detected ${nextSnapshot.title || 'a new role'}.`, 'idle');
      }

      render();
      return true;
    };

    const shouldRefreshSnapshot = (nextSnapshot) => {
      if (!nextSnapshot) return false;
      if (!lastSnapshot) return true;
      if (lastSnapshot.analysis) return false;

      const currentTitle = cleanText(lastSnapshot.title || '');
      const nextTitle = cleanText(nextSnapshot.title || '');
      const currentLocation = cleanText(lastSnapshot.location || '');
      const nextLocation = cleanText(nextSnapshot.location || '');
      const currentDescriptionLength = cleanText(lastSnapshot.description || '').length;
      const nextDescriptionLength = cleanText(nextSnapshot.description || '').length;

      return (
        nextSnapshot.url !== lastSnapshot.url
        || (nextTitle && nextTitle !== currentTitle)
        || (nextLocation && nextLocation !== currentLocation)
        || nextDescriptionLength > currentDescriptionLength + 180
      );
    };

    let lastSeenUrl = window.location.href;
    locationWatchId = window.setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastSeenUrl) {
        lastSeenUrl = currentUrl;
        refreshPageContext({ persist: true });
        return;
      }

      const nextSnapshot = getMeaningfulJobPostingSnapshot();
      if (shouldRefreshSnapshot(nextSnapshot)) {
        lastSnapshot = {
          ...nextSnapshot,
          analysis: null,
        };

        persistJobPostingSnapshot(lastSnapshot);

        if (!isScanning) {
          setStatus(`Detected ${nextSnapshot.title || 'this role'}. Run a scan.`, 'idle');
        }

        render();
      }
    }, 1200);
    hostWatchId = window.setInterval(() => {
      ensureHostMounted();
    }, 900);

    if (initialSnapshot) {
      setStatus(`Detected ${initialSnapshot.title || 'this role'}. Run a scan.`, 'idle');
    } else if (looksLikeApplicationForm()) {
      setStatus('Application form detected. Autofill is ready.', 'idle');
    } else {
      setStatus('ResumeATS is docked here. Open a job or application page and hit Analyze.', 'idle');
    }

    render();
    return {
      scanCurrentJob,
      refreshPageContext,
      ensureMounted: ensureHostMounted,
      isMounted: () => host.isConnected,
      teardown: teardownWidget,
    };
  };

  const getLabelText = (field) => {
    const parts = [];

    if (field.id) {
      try {
        const linkedLabel = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (linkedLabel?.textContent) parts.push(linkedLabel.textContent);
      } catch {
        // Ignore invalid CSS escape cases.
      }
    }

    const wrappingLabel = field.closest('label');
    if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);

    const parentLabel = field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);

    if (field.getAttribute('aria-label')) parts.push(field.getAttribute('aria-label'));
    if (field.getAttribute('placeholder')) parts.push(field.getAttribute('placeholder'));
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);

    return normalize(parts.join(' '));
  };

  const getFieldsetLegendText = (field) => cleanText(
    field?.closest('fieldset')?.querySelector('legend')?.textContent || ''
  );

  const getGroupQuestionLabel = (field) => {
    const fieldsetLegend = getFieldsetLegendText(field);
    if (fieldsetLegend) {
      return normalize(fieldsetLegend);
    }

    return getLabelText(field);
  };

  const isVisible = (field) => {
    if (field.type === 'file') return true;
    return !!(field.offsetWidth || field.offsetHeight || field.getClientRects().length);
  };

  const isEnabled = (element) => Boolean(element && !element.disabled && element.getAttribute('aria-disabled') !== 'true');

  const getElementText = (element) => normalize(
    element?.textContent
    || element?.value
    || element?.getAttribute?.('aria-label')
    || element?.getAttribute?.('title')
    || ''
  );

  const dispatchFieldEvents = (field) => {
    ['input', 'change', 'blur'].forEach((eventName) => {
      field.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
  };

  const setFieldValue = (field, value) => {
    if (!field || value === undefined || value === null || value === '') return false;
    if (!isVisible(field)) return false;

    const tag = field.tagName.toLowerCase();

    if (tag === 'select') {
      const wanted = normalize(value);
      const option = Array.from(field.options).find((entry) => (
        normalize(entry.textContent || '').includes(wanted)
        || normalize(entry.value || '').includes(wanted)
        || wanted.includes(normalize(entry.textContent || ''))
      ));

      if (!option) return false;

      field.value = option.value;
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'checkbox') {
      const shouldCheck = /^(true|yes|1)$/i.test(`${value}`);
      field.checked = shouldCheck;
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'radio') {
      const wanted = normalize(value);
      const candidates = Array.from(document.querySelectorAll(`input[type="radio"][name="${field.name}"]`));
      const target = candidates.find((entry) => {
        const candidateValue = normalize(entry.value || '');
        return candidateValue === wanted;
      }) || candidates.find((entry) => {
        const label = getLabelText(entry);
        return label.includes(wanted) || wanted.includes(normalize(entry.value || ''));
      });

      if (!target) return false;

      candidates.forEach((entry) => {
        entry.checked = entry === target;
      });

      if (!target.checked) {
        target.checked = true;
      }

      dispatchFieldEvents(target);
      return true;
    }

    field.focus();
    field.value = value;
    dispatchFieldEvents(field);
    return true;
  };

  const uploadResumeFile = async (input, profile) => {
    const fileUrl = profile?.documents?.resumePdfUrl;
    if (!fileUrl || !input) return false;

    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Could not download the signed resume PDF');

    const blob = await response.blob();
    const file = new File(
      [blob],
      profile?.documents?.resumeFilename || 'ResumeATS_Resume.pdf',
      { type: 'application/pdf' }
    );

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    dispatchFieldEvents(input);
    return true;
  };

  const buildCandidatePitch = (profile) => {
    const candidate = profile?.candidate || {};
    const topSkills = Array.isArray(profile?.skills)
      ? profile.skills.filter(Boolean).slice(0, 4)
      : [];
    const latestExperience = profile?.experience?.[0];
    const experienceSummary = cleanText(
      latestExperience?.description
      || profile?.projects?.[0]?.description
      || ''
    );

    const intro = [
      candidate.currentTitle ? `I am a ${candidate.currentTitle}` : 'I am a candidate',
      candidate.currentCompany ? `currently working at ${candidate.currentCompany}` : '',
      candidate.location ? `based in ${candidate.location}` : '',
    ].filter(Boolean).join(' ');

    const skills = topSkills.length > 0
      ? `My strongest areas include ${topSkills.join(', ')}.`
      : '';
    const summary = experienceSummary
      ? experienceSummary.split(/\n+/).map((entry) => entry.replace(/^(?:[-*]|\u2022|\u00e2\u20ac\u00a2)\s*/, '').trim()).filter(Boolean)[0] || ''
      : '';

    return cleanText([intro, skills, summary].filter(Boolean).join(' ')).slice(0, 900);
  };

  const resolveFieldValue = (meta, profile) => {
    const candidate = profile?.candidate || {};
    const answers = profile?.answers || {};
    const education = profile?.education?.[0] || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const candidatePitch = buildCandidatePitch(profile);

    if (/first name|given name/.test(meta)) return candidate.firstName;
    if (/last name|surname|family name/.test(meta)) return candidate.lastName;
    if (/full name|your name|applicant name/.test(meta)) return candidate.fullName;
    if (/email/.test(meta)) return candidate.email;
    if (/phone|mobile|cell/.test(meta)) return candidate.phone;
    if (/city/.test(meta)) return locationParts[0] || candidate.location;
    if (/country|region/.test(meta)) return locationParts.at(-1) || candidate.location;
    if (/location|city|address/.test(meta)) return candidate.location;
    if (/linkedin/.test(meta)) return candidate.linkedin || answers.linkedinUrl;
    if (/github/.test(meta)) return candidate.github || answers.githubUrl;
    if (/portfolio/.test(meta)) return candidate.portfolio || answers.portfolioUrl;
    if (/website|personal site/.test(meta)) return candidate.website || answers.websiteUrl;
    if (/current company|employer/.test(meta)) return answers.currentCompany;
    if (/current title|job title|current role/.test(meta)) return answers.currentTitle;
    if (/work authorization|authorized to work|legally authorized/.test(meta)) return answers.workAuthorization;
    if (/sponsor|sponsorship/.test(meta)) return answers.requiresSponsorship;
    if (/years.*experience|experience.*years/.test(meta)) return answers.yearsOfExperience;
    if (/salary|compensation|expected pay|pay expectation/.test(meta)) return answers.salaryExpectation;
    if (/work setup|work model|remote|hybrid|on-site|onsite/.test(meta)) return answers.preferredWorkSetup;
    if (/school|university|college/.test(meta)) return education.institution;
    if (/degree/.test(meta)) return education.degree;
    if (/cover letter|message to the hiring team|about you|tell us about yourself|why (?:are you interested|this role|do you want)/.test(meta)) return candidatePitch;
    if (/summary|professional summary|candidate summary/.test(meta)) return candidatePitch;
    if (/available|start date|notice period/.test(meta)) return answers.noticePeriod || 'Two weeks notice';

    return null;
  };

  const SIMPLE_FIELD_PATTERNS = [
    /first name|given name/,
    /last name|surname|family name/,
    /full name|your name|applicant name/,
    /email/,
    /phone|mobile|cell/,
    /city/,
    /country|region/,
    /location|address/,
    /linkedin/,
    /github/,
    /portfolio/,
    /website|personal site/,
    /current company|employer/,
    /current title|job title|current role/,
    /work authorization|authorized to work|legally authorized/,
    /sponsor|sponsorship/,
    /years.*experience|experience.*years/,
    /school|university|college/,
    /degree/,
    /available|start date|notice period/,
    /resume|cv/,
  ];

  const isSimpleStructuredField = (meta) => SIMPLE_FIELD_PATTERNS.some((pattern) => pattern.test(meta));

  const getFieldOptions = (field) => {
    if (!field) return [];

    if (field.tagName.toLowerCase() === 'select') {
      return Array.from(field.options)
        .map((option) => cleanText(option.textContent || option.value || ''))
        .filter(Boolean)
        .filter((option) => !/^(select|choose|pick|please select)$/i.test(option));
    }

    if (field.type === 'radio' && field.name) {
      return Array.from(document.querySelectorAll(`input[type="radio"][name="${field.name}"]`))
        .map((entry) => cleanText(entry.value || entry.closest('label')?.textContent || getLabelText(entry) || ''))
        .filter(Boolean);
    }

    if (field.type === 'checkbox') {
      return ['Yes', 'No'];
    }

    return [];
  };

  const shouldUseAiForField = (field, meta) => {
    if (!field || !meta) return false;
    if (field.type === 'hidden' || field.type === 'file' || field.type === 'password' || field.type === 'search') return false;

    const tag = field.tagName.toLowerCase();
    const options = getFieldOptions(field);

    if (
      /cover letter|message to the hiring team|about you|tell us about yourself|why (?:are you interested|this role|do you want)|why should we hire you|why are you a fit|additional information|anything else/i.test(meta)
    ) {
      return true;
    }

    if ((tag === 'textarea' || field.type === 'textarea') && !/address|portfolio|website|linkedin|github/.test(meta)) {
      return true;
    }

    if (options.length > 0 && !isSimpleStructuredField(meta)) {
      return true;
    }

    if (isSimpleStructuredField(meta)) {
      return false;
    }

    return (
      meta.length >= 28
      || /experience with|familiarity with|eligibility|willing to|relocate|remote|onsite|hybrid|salary|compensation|clearance|language|citizenship|visa|pronoun|gender|veteran|disability/.test(meta)
    );
  };

  const buildAiFieldDescriptor = (field, index) => {
    const tag = field.tagName.toLowerCase();
    const label = field.type === 'radio' || field.type === 'checkbox'
      ? getGroupQuestionLabel(field)
      : getLabelText(field);
    return {
      id: field.name
        ? `${field.type || tag}:${field.name}`
        : `${field.type || tag}:${field.id || index}`,
      label: label.slice(0, 320),
      kind: field.type === 'radio' || field.type === 'checkbox'
        ? 'choice'
        : tag === 'select'
          ? 'select'
          : tag === 'textarea'
            ? 'textarea'
            : 'text',
      required: field.required || field.getAttribute('aria-required') === 'true',
      placeholder: cleanText(field.getAttribute('placeholder') || '').slice(0, 180),
      options: getFieldOptions(field).slice(0, 12),
    };
  };

  const requestAiFieldAnswers = async ({ profile, job, questions }) => {
    if (!Array.isArray(questions) || questions.length === 0) {
      return [];
    }

    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_APPLICATION_ANSWERS',
      payload: {
        profile,
        job,
        questions,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Could not generate AI answers for this application.');
    }

    return Array.isArray(response?.result?.answers)
      ? response.result.answers
      : Array.isArray(response?.result?.result?.answers)
        ? response.result.result.answers
        : [];
  };

  const findResumeInput = () => (
    Array.from(document.querySelectorAll('input[type="file"]')).find((input) => {
      const meta = getLabelText(input);
      return /resume|cv/.test(meta);
    }) || null
  );

  const getVisibleFormFields = () => (
    Array.from(document.querySelectorAll('input, textarea, select'))
      .filter((field) => field && !field.disabled && isVisible(field))
  );

  const looksLikeApplicationForm = () => {
    const fields = getVisibleFormFields();
    const informativeFields = fields.filter((field) => {
      if (field.type === 'hidden') return false;
      if (field.type === 'search') return false;
      const meta = getLabelText(field);
      return /name|email|phone|location|linkedin|portfolio|website|resume|cv|cover letter|school|degree|experience|authorization|sponsorship|salary|compensation|notice period|relocat|visa|work permit/.test(meta);
    });
    const professionalSignals = informativeFields.filter((field) => {
      const meta = getLabelText(field);
      return /linkedin|portfolio|website|resume|cv|cover letter|school|degree|experience|authorization|sponsorship|salary|compensation|notice period|relocat|visa|work permit/.test(meta);
    });

    if (findResumeInput()) {
      return true;
    }

    if (professionalSignals.length >= 1 && informativeFields.length >= 2) {
      return true;
    }

    return informativeFields.length >= 4
      && /apply|submit|continue|next|review|start application|complete application/.test(normalize(document.body?.innerText || ''));
  };

  const findPrimaryAction = (patterns, exclusions = []) => {
    const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]'));
    return candidates.find((entry) => {
      const text = getElementText(entry);
      if (!text || !isEnabled(entry)) return false;
      if (exclusions.some((pattern) => pattern.test(text))) return false;
      return patterns.some((pattern) => pattern.test(text));
    }) || null;
  };

  const findSubmitButton = () => findPrimaryAction(
    [/submit application/, /^submit$/, /^apply$/, /apply now/, /continue to submit/, /finish application/, /complete application/, /review and submit/],
    [/save/, /cancel/, /back/, /filter/, /coupon/]
  );

  const findApplyEntryButton = () => findPrimaryAction(
    [/apply now/, /^apply$/, /start application/, /continue application/, /easy apply/, /apply on company site/, /view application/, /continue/],
    [/applied/, /save/, /filter/, /coupon/, /sign in with/, /log in/]
  );

  const isLikelyJobPostingPage = (snapshot = null) => {
    if (!snapshot) return false;
    if (provider !== 'generic') return true;

    const titleText = cleanText(snapshot.title || '');
    const descriptionText = cleanText(snapshot.description || '');
    const combinedText = cleanText([
      titleText,
      snapshot.company,
      snapshot.location,
      snapshot.employmentType,
      descriptionText,
    ].filter(Boolean).join('\n'));

    const roleSignal = /\b(engineer|developer|designer|manager|specialist|analyst|consultant|architect|coordinator|associate|recruiter|officer|director|lead|intern|technician|administrator|executive|editor|producer|scientist|writer|accountant|marketer|sales|support)\b/i.test(titleText);
    const sectionSignal = /\b(job description|about the role|responsibilities|requirements|qualifications|preferred qualifications|what you'll do|what you will do|what we're looking for|what we are looking for|about you|benefits|perks|equal opportunity)\b/i.test(combinedText);
    const employmentSignal = /\b(full[- ]time|part[- ]time|contract|temporary|internship|remote|hybrid|on[- ]site)\b/i.test(combinedText);
    const salarySignal = Boolean(extractSalaryText(combinedText));
    const applySignal = Boolean(findApplyEntryButton() || findSubmitButton());
    const signalCount = [roleSignal, sectionSignal, employmentSignal, salarySignal, applySignal].filter(Boolean).length;

    return signalCount >= 2 && (titleText.length >= 5 || descriptionText.length >= 400);
  };

  const getMeaningfulJobPostingSnapshot = () => {
    const snapshot = buildJobPostingSnapshot();
    return isLikelyJobPostingPage(snapshot) ? snapshot : null;
  };

  const findConfirmation = () => {
    const text = normalize(document.body?.innerText || '');
    return /application submitted|thanks for applying|thank you for applying|your application has been submitted|application received/.test(text);
  };

  const navigateToApplyTarget = async () => {
    const applyEntry = findApplyEntryButton();
    if (!applyEntry) return false;

    const href = applyEntry.getAttribute('href')
      || applyEntry.dataset?.href
      || applyEntry.closest('a')?.getAttribute('href')
      || '';

    if (href && !/^javascript:/i.test(href) && !href.startsWith('#')) {
      const absoluteUrl = new URL(href, window.location.href).toString();
      window.location.href = absoluteUrl;
      return true;
    }

    applyEntry.click();
    return true;
  };

  const autofillVisibleFields = async (profile) => {
    const fields = getVisibleFormFields();
    let filledCount = 0;
    const processedRadioNames = new Set();
    const aiCandidates = [];
    const jobSnapshot = getMeaningfulJobPostingSnapshot();

    for (const [index, field] of fields.entries()) {
      const meta = getLabelText(field);
      if (!meta || field.type === 'file') continue;
      if (field.type === 'radio' && processedRadioNames.has(field.name || '')) continue;
      if (field.type === 'radio' && field.name) {
        processedRadioNames.add(field.name);
      }

      const fallbackValue = resolveFieldValue(meta, profile);
      if (shouldUseAiForField(field, meta)) {
        aiCandidates.push({
          field,
          descriptor: buildAiFieldDescriptor(field, index),
          fallbackValue,
        });
        continue;
      }

      if (fallbackValue === null || fallbackValue === undefined || fallbackValue === '') continue;

      if (setFieldValue(field, fallbackValue)) {
        filledCount += 1;
      }
    }

    if (aiCandidates.length > 0) {
      let aiAnswers = [];

      try {
        aiAnswers = await requestAiFieldAnswers({
          profile,
          job: jobSnapshot,
          questions: aiCandidates.map((entry) => entry.descriptor),
        });
      } catch {
        aiAnswers = [];
      }

      const answerMap = new Map(
        aiAnswers
          .filter((entry) => entry && entry.id)
          .map((entry) => [entry.id, `${entry.answer || ''}`.trim()])
      );

      for (const candidate of aiCandidates) {
        const aiValue = answerMap.get(candidate.descriptor.id);
        const resolvedValue = aiValue || candidate.fallbackValue;

        if (!resolvedValue) continue;
        if (setFieldValue(candidate.field, resolvedValue)) {
          filledCount += 1;
        }
      }
    }

    const resumeInput = findResumeInput();
    if (resumeInput && !resumeInput.files?.length) {
      const uploaded = await uploadResumeFile(resumeInput, profile);
      if (uploaded) filledCount += 1;
    }

    return filledCount;
  };

  const autofillApplication = async ({ profile, autoSubmit }) => {
    if (!looksLikeApplicationForm()) {
      const navigated = await navigateToApplyTarget();

      if (navigated) {
        return {
          ok: true,
          pendingNavigation: true,
          submitted: false,
          provider,
          filledCount: 0,
        };
      }
    }

    let filledCount = 0;

    try {
      filledCount = await autofillVisibleFields(profile);
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Resume upload failed',
        provider,
        filledCount,
      };
    }

    if (!autoSubmit) {
      return {
        ok: true,
        submitted: false,
        provider,
        filledCount,
      };
    }

    if (findConfirmation()) {
      return {
        ok: true,
        submitted: true,
        provider,
        filledCount,
      };
    }

    const submitButton = findSubmitButton();
    if (!submitButton) {
      const navigated = await navigateToApplyTarget();
      if (navigated) {
        return {
          ok: true,
          pendingNavigation: true,
          submitted: false,
          provider,
          filledCount,
        };
      }

      return {
        ok: false,
        error: 'Could not find an Apply or Submit action on this page',
        provider,
        filledCount,
      };
    }

    submitButton.click();
    await delay(1500);

    return {
      ok: true,
      submitted: findConfirmation() || true,
      provider,
      filledCount,
    };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'EXTRACT_JOB_POSTING') {
      (async () => {
        const jobPosting = getMeaningfulJobPostingSnapshot();

        if (!jobPosting) {
          sendResponse({ ok: false, error: 'No job posting details were detected on this page', provider });
          return;
        }

        const enrichedSnapshot = await enrichJobPostingSnapshot(jobPosting);
        sendResponse({ ok: true, jobPosting: enrichedSnapshot, provider });
      })();

      return true;
    }

    if (message?.type !== 'AUTOFILL_APPLICATION') return undefined;

    autofillApplication(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || 'Unknown autofill error',
        provider,
      }));

    return true;
  });

  let widgetController = null;

  const notifyPageReady = (jobPostingSnapshot = null) => {
    chrome.runtime.sendMessage({
      type: 'JOB_PAGE_READY',
      payload: {
        provider,
        url: window.location.href,
        hasJobPosting: Boolean(jobPostingSnapshot),
        isApplicationForm: looksLikeApplicationForm(),
      },
    });
  };

  const syncWidgetMount = async () => {
    const settings = await readUiSettings();
    const jobPostingSnapshot = getMeaningfulJobPostingSnapshot();

    if (!isWidgetEnabledForHost(settings)) {
      widgetController?.teardown?.();
      widgetController = null;
      return;
    }

    if (widgetController && !widgetController.isMounted?.()) {
      widgetController.teardown?.();
      widgetController = null;
    }

    if (!widgetController) {
      document.getElementById('resumeats-job-widget-host-v3')?.remove();
      widgetController = createFloatingWidgetV3(jobPostingSnapshot);
    } else {
      widgetController.ensureMounted?.();
      widgetController.refreshPageContext({ persist: false });
    }

    if (jobPostingSnapshot) {
      await persistJobPostingSnapshot(jobPostingSnapshot);
    }

    notifyPageReady(jobPostingSnapshot);
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes?.[UI_SETTINGS_KEY]) {
      return;
    }

    syncWidgetMount().catch(() => {
      // Ignore storage-driven remount failures in the content script.
    });
  });

  syncWidgetMount().catch(() => {
    // Ignore bootstrap failures in the content script.
  });
})();
