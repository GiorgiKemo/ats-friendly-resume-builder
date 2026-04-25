/* global chrome */

(() => {
  const UI_SETTINGS_KEY = 'resumeatsBrowserAgentUi';
  const THEME_STORAGE_KEY = 'resumeatsExtensionTheme';
  const isTopFrame = window.top === window;
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
  const PHONE_FIELD_PATTERN = /phone|mobile|cell|telephone|tel\b|contact number|contact no|whatsapp|numer telefonu|telefon|telefone|telefono|num[e\u00e9]ro/i;
  const RESUME_UPLOAD_PATTERN = /resume|cv|curriculum|attachment|upload|select the attachment|zalacznik|za\u0142\u0105cznik|plik|dodaj plik/i;
  const AUTOFILL_RETRY_DELAYS_MS = [1500, 2500, 4000, 6000];

  const hostname = window.location.hostname || '';
  const normalizeHostKey = (value = '') => `${value}`.trim().toLowerCase();
  const isExtensionWidgetHost = (node) => /^resumeats-job-widget-host/i.test(
    `${node?.id || node?.host?.id || ''}`.trim()
  );
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
    { id: 'rippling', label: 'Rippling', test: (url) => /ats\.rippling\.com|ats\.us1\.rippling\.com/i.test(url) },
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
  const pickProfileValue = (...values) => values
    .map((value) => cleanText(value ?? ''))
    .find(Boolean) || '';
  const splitFullName = (fullName = '') => {
    const parts = cleanText(fullName).split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' '),
    };
  };
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
    const compact = cleanText(value).replace(/[^\d+]/g, '');
    if (!compact.startsWith('+')) return '';
    return COUNTRY_CALLING_CODES.find((code) => compact.startsWith(code)) || compact.match(/^\+\d{1,3}/)?.[0] || '';
  };
  const resolvePhoneCountryCode = (answers = {}, candidate = {}) => (
    extractPhoneCountryCode(answers.phoneCountryCode || answers.countryCallingCode)
    || extractPhoneCountryCode(candidate.phone || answers.phone)
  );
  const DEMOGRAPHIC_ALIASES = [
    { match: /^(male|man|men|m)$/i, aliases: ['male', 'man', 'men', 'm'] },
    { match: /^(female|woman|women|f)$/i, aliases: ['female', 'woman', 'women', 'f'] },
    { match: /^(non[-\s]?binary|nonbinary|gender non[-\s]?conforming)$/i, aliases: ['non binary', 'nonbinary', 'gender non conforming'] },
    { match: /prefer not|decline|choose not|do not wish|not disclose|rather not/i, aliases: ['prefer not', 'decline', 'choose not', 'do not wish', 'not disclose', 'rather not'] },
    { match: /^(white|caucasian)$/i, aliases: ['white', 'caucasian'] },
    { match: /black|african american/i, aliases: ['black', 'african american'] },
    { match: /^asian$/i, aliases: ['asian'] },
    { match: /american indian|alaska native|native american/i, aliases: ['american indian', 'alaska native', 'native american'] },
    { match: /native hawaiian|pacific islander/i, aliases: ['native hawaiian', 'pacific islander'] },
    { match: /two or more|multiple races|multiracial/i, aliases: ['two or more', 'multiple races', 'multiracial'] },
    { match: /hispanic|latino|latina|latinx/i, aliases: ['hispanic', 'latino', 'latina', 'latinx'] },
  ];
  const scoreAliasMatch = (option, desired) => {
    const desiredAlias = DEMOGRAPHIC_ALIASES.find((entry) => entry.match.test(desired));
    if (!desiredAlias) return 0;
    const optionTokens = new Set(option.split(/[^a-z0-9]+/).filter(Boolean));
    return desiredAlias.aliases.some((alias) => {
      const normalizedAlias = normalize(alias);
      return normalizedAlias.includes(' ')
        ? option.includes(normalizedAlias)
        : optionTokens.has(normalizedAlias);
    }) ? 91 : 0;
  };
  const buildNormalizedCandidate = (profile = {}) => {
    const candidate = profile?.candidate || {};
    const personal = profile?.personal || profile?.personalInfo || {};
    const nestedPersonal = profile?.profile?.personal || profile?.profile?.personalInfo || {};
    const resumePersonal = profile?.resume?.personalInfo || {};
    const answers = profile?.answers || {};
    const professionalLinks = personal.professionalLinks || nestedPersonal.professionalLinks || {};
    const locationFromAnswers = [
      answers.city,
      answers.stateProvince || answers.state,
      answers.country,
    ].filter(Boolean).join(', ');
    const fullName = pickProfileValue(
      candidate.fullName,
      candidate.name,
      candidate.full_name,
      personal.fullName,
      personal.name,
      nestedPersonal.fullName,
      resumePersonal.fullName,
      answers.fullName
    );
    const split = splitFullName(fullName);
    const firstName = pickProfileValue(
      candidate.firstName,
      candidate.givenName,
      personal.firstName,
      nestedPersonal.firstName,
      resumePersonal.firstName,
      answers.firstName,
      split.firstName
    );
    const lastName = pickProfileValue(
      candidate.lastName,
      candidate.familyName,
      candidate.surname,
      personal.lastName,
      nestedPersonal.lastName,
      resumePersonal.lastName,
      answers.lastName,
      split.lastName
    );

    return {
      ...candidate,
      fullName: fullName || [firstName, lastName].filter(Boolean).join(' '),
      firstName,
      lastName,
      email: pickProfileValue(candidate.email, personal.email, nestedPersonal.email, resumePersonal.email, answers.email),
      phone: pickProfileValue(candidate.phone, candidate.phoneNumber, personal.phone, personal.phoneNumber, nestedPersonal.phone, resumePersonal.phone, answers.phone),
      location: pickProfileValue(candidate.location, personal.location, nestedPersonal.location, resumePersonal.location, answers.location, locationFromAnswers),
      linkedin: pickProfileValue(candidate.linkedin, professionalLinks.linkedin, personal.linkedin, nestedPersonal.linkedin, resumePersonal.linkedin, answers.linkedinUrl),
      github: pickProfileValue(candidate.github, professionalLinks.github, personal.github, nestedPersonal.github, resumePersonal.github, answers.githubUrl),
      portfolio: pickProfileValue(candidate.portfolio, professionalLinks.portfolio, professionalLinks.other, personal.portfolio, nestedPersonal.portfolio, resumePersonal.portfolio, answers.portfolioUrl),
      website: pickProfileValue(candidate.website, professionalLinks.website, professionalLinks.portfolio, personal.website, nestedPersonal.website, resumePersonal.website, answers.websiteUrl),
      currentTitle: pickProfileValue(candidate.currentTitle, candidate.jobTitle, answers.currentTitle),
      currentCompany: pickProfileValue(candidate.currentCompany, answers.currentCompany),
    };
  };
  const buildPageBridgeProfile = (profile = {}) => {
    const candidate = buildNormalizedCandidate(profile);
    const answers = profile?.answers && typeof profile.answers === 'object' ? { ...profile.answers } : {};
    return {
      candidate,
      personal: {
        fullName: candidate.fullName,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
        linkedin: candidate.linkedin,
        github: candidate.github,
        portfolio: candidate.portfolio,
        website: candidate.website,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
      },
      personalInfo: {
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
        linkedin: candidate.linkedin,
        github: candidate.github,
        portfolio: candidate.portfolio,
        website: candidate.website,
      },
      answers,
    };
  };
  const getMissingProfileFieldForMeta = (meta, profile = {}) => {
    const candidate = buildNormalizedCandidate(profile);
    if (/first name|given name/.test(meta) && !candidate.firstName) return 'first name';
    if (/last name|surname|family name/.test(meta) && !candidate.lastName) return 'last name';
    if (/full name|your name|applicant name/.test(meta) && !candidate.fullName) return 'full name';
    if (/email|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/.test(meta) && !candidate.email) return 'email';
    if (PHONE_FIELD_PATTERN.test(meta) && !candidate.phone) return 'phone number';
    if (/location|city|address/.test(meta) && !candidate.location) return 'location';
    return '';
  };
  const formatMissingProfileFields = (fields = []) => Array.from(new Set(fields.filter(Boolean))).join(', ');
  const escapeHtml = (value = '') => cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const getDefaultTheme = () => (
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const normalizeTheme = (value) => (value === 'light' || value === 'dark' ? value : getDefaultTheme());
  const readExtensionTheme = async () => {
    try {
      const stored = await chrome.storage.local.get(THEME_STORAGE_KEY);
      return normalizeTheme(stored?.[THEME_STORAGE_KEY]);
    } catch {
      return getDefaultTheme();
    }
  };
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
    rippling: {
      title: ['[data-testid*="job-title"]', '[class*="job-title"]', 'h1', 'h2'],
      company: ['[data-testid*="company"]', '[class*="company"]'],
      location: ['[data-testid*="location"]', '[class*="location"]'],
      description: ['main', '[role="main"]', 'article', '[class*="job"]'],
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

  const ROLE_TITLE_PATTERN = /\b(engineer|developer|designer|manager|specialist|analyst|consultant|architect|coordinator|associate|recruiter|officer|director|lead|intern|technician|administrator|executive|editor|producer|scientist|writer|accountant|marketer|sales|support)\b/i;
  const EMPLOYMENT_PREFIX_PATTERN = /^(?:remote|hybrid|on[- ]site|onsite|full[- ]time|part[- ]time|contract|internship|temporary)\s*\|\s*/i;
  const SALARY_TAIL_PATTERN = /\s+[—–-]\s*(?:\$|USD|EUR|GBP|PLN).+$/i;
  const GENERIC_PAGE_LINE_PATTERN = /^(?:apply now|job openings|current openings|refer|powered by .+|cancel|browse)$/i;

  const getExtractionRoots = () => {
    const roots = [];
    const visited = new Set();

    const visitRoot = (root) => {
      if (!root || visited.has(root) || !root.querySelectorAll || isExtensionWidgetHost(root)) return;
      visited.add(root);
      roots.push(root);

      for (const node of root.querySelectorAll('*')) {
        if (isExtensionWidgetHost(node)) continue;
        if (node?.shadowRoot) {
          visitRoot(node.shadowRoot);
        }
      }
    };

    visitRoot(document);
    return roots;
  };

  const queryAllExtractionContexts = (selector) => (
    getExtractionRoots().flatMap((root) => Array.from(root.querySelectorAll(selector)))
  );

  const getExtractionPageText = () => cleanText(
    getExtractionRoots()
      .map((root) => {
        if (root === document) {
          return [
            document.body?.innerText || '',
            document.documentElement?.innerText || '',
            document.body?.textContent || '',
          ].filter(Boolean).join('\n');
        }

        return [
          root.innerText || '',
          root.textContent || '',
        ].filter(Boolean).join('\n');
      })
      .join('\n')
  );

  const getMeaningfulPageLines = (value = '') => Array.from(new Set(
    cleanText(value)
      .split('\n')
      .map((line) => cleanText(line))
      .filter(Boolean)
  ));

  const extractJobFactsFromPageText = (pageText = '') => {
    const lines = getMeaningfulPageLines(pageText);
    if (lines.length === 0) {
      return {
        title: '',
        company: '',
        location: '',
        salary: '',
      };
    }

    const salary = extractSalaryText(lines.join('\n'));
    const titleIndex = lines.findIndex((line) => {
      if (GENERIC_PAGE_LINE_PATTERN.test(line)) return false;
      const candidate = cleanupTitle(
        line
          .replace(EMPLOYMENT_PREFIX_PATTERN, '')
          .replace(SALARY_TAIL_PATTERN, '')
      );

      return candidate.length >= 4 && ROLE_TITLE_PATTERN.test(candidate);
    });

    const titleSource = titleIndex >= 0 ? lines[titleIndex] : '';
    const title = cleanupTitle(
      titleSource
        .replace(EMPLOYMENT_PREFIX_PATTERN, '')
        .replace(SALARY_TAIL_PATTERN, '')
    );

    const company = cleanupCompany(
      titleIndex > 0 && lines[0] && !ROLE_TITLE_PATTERN.test(lines[0]) && !GENERIC_PAGE_LINE_PATTERN.test(lines[0])
        ? lines[0]
        : ''
    );

    const location = cleanupLocation(
      lines.find((line, index) => (
        index !== titleIndex
        && line !== company
        && !GENERIC_PAGE_LINE_PATTERN.test(line)
        && (
          /,\s*[A-Za-z]/.test(line)
          || /\bremote\b|\bhybrid\b|\bon[- ]site\b|\bonsite\b/i.test(line)
        )
      )) || ''
    );

    return {
      title,
      company,
      location,
      salary,
    };
  };

  const queryFirstText = (selectors = []) => {
    for (const selector of selectors) {
      const nodes = queryAllExtractionContexts(selector)
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
    element.innerHTML = `${value}`
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|section|article|ul|ol)>/gi, '\n');
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

  const deriveCompanyFromTitleLikeText = (value = '') => {
    const normalized = compactLine(value).trim();
    if (!normalized) return '';

    const pipeMatch = normalized.match(/\|\s*([^|]+)$/);
    if (pipeMatch?.[1] && !/^(apply now|job application|current openings)$/i.test(pipeMatch[1].trim())) {
      return cleanupCompany(pipeMatch[1]);
    }

    return deriveCompanyFromDocumentTitle(normalized);
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

    if (/^(?:back to jobs?|jobs?|careers?|apply(?: now)?|new|current openings)$/i.test(normalized)) {
      return '';
    }

    return normalized.length > 80 ? normalized.slice(0, 80).trim() : normalized;
  };

  const cleanupLocation = (value = '') => compactLine(value).slice(0, 120).trim();

  const extractSalaryText = (text = '') => cleanText((text.match(SALARY_PATTERN) || [])[0] || '');

  const buildDescriptionFromSelectors = (selectors = []) => {
    const candidates = selectors
      .flatMap((selector) => queryAllExtractionContexts(selector))
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
    const pageText = getExtractionPageText();
    const pageTextFacts = extractJobFactsFromPageText(pageText);
    const title = cleanupTitle(
      queryFirstText(selectors.title)
      || queryFirstText(fallbackSelectors.title)
      || pageTextFacts.title
      || extractMetaText('og:title', 'twitter:title', 'title')
      || documentTitle
    );
    const company = [
      queryFirstText(selectors.company),
      queryFirstText(fallbackSelectors.company),
      pageTextFacts.company,
      extractMetaText('og:site_name', 'application-name'),
      deriveCompanyFromDocumentTitle(document.title || ''),
    ].map((candidate) => cleanupCompany(candidate)).find(Boolean) || '';
    const location = cleanupLocation(
      queryFirstText(selectors.location)
      || queryFirstText(fallbackSelectors.location)
      || pageTextFacts.location
      || (LOCATION_KEYWORDS.test(pageText) ? (pageText.match(LOCATION_KEYWORDS) || [])[0] : '')
    );
    const description = cleanText(
      buildDescriptionFromSelectors(selectors.description)
      || buildDescriptionFromSelectors(fallbackSelectors.description)
      || extractMetaText('description', 'og:description', 'twitter:description')
      || pageText.slice(0, 12000)
    );
    const salary = pageTextFacts.salary || extractSalaryText(pageText);

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

  const parseNextData = () => {
    const script = document.querySelector('script#__NEXT_DATA__[type="application/json"], script#__NEXT_DATA__');
    if (!script?.textContent) return null;

    try {
      return JSON.parse(script.textContent);
    } catch {
      return null;
    }
  };

  const readTextValue = (...values) => {
    for (const value of values) {
      if (typeof value === 'string' || typeof value === 'number') {
        const text = cleanText(value);
        if (text) return text;
      }

      if (value && typeof value === 'object') {
        const text = readTextValue(value.label, value.name, value.title, value.id);
        if (text) return text;
      }
    }

    return '';
  };

  const readDescriptionValue = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return stripHtml(value);
    if (Array.isArray(value)) {
      return cleanText(value.map((entry) => readDescriptionValue(entry)).filter(Boolean).join('\n\n'));
    }
    if (typeof value === 'object') {
      return cleanText(
        Object.values(value)
          .map((entry) => readDescriptionValue(entry))
          .filter((entry) => entry.length > 30)
          .join('\n\n')
      );
    }
    return '';
  };

  const readLocationValue = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return cleanupLocation(value);
    if (Array.isArray(value)) {
      return cleanupLocation(
        value
          .map((entry) => readLocationValue(entry))
          .filter(Boolean)
          .join(', ')
      );
    }
    if (typeof value === 'object') {
      return cleanupLocation(
        [
          value.name,
          value.label,
          value.city,
          value.state,
          value.country,
          value.address?.addressLocality,
          value.address?.addressRegion,
          value.address?.addressCountry,
        ].filter(Boolean).join(', ')
      );
    }
    return '';
  };

  const normalizeNextJobCandidate = (entry = {}, context = {}) => {
    if (!entry || typeof entry !== 'object') return null;

    const title = cleanupTitle(readTextValue(entry.title, entry.name, entry.jobTitle, entry.jobReqName));
    const description = readDescriptionValue(entry.description || entry.jobDescription || entry.body || entry.content);

    if (!title || description.length < 80) {
      return null;
    }

    const hasStructuredJobSignal = Boolean(
      entry.uuid
      || entry.id
      || entry.url
      || entry.companyName
      || entry.workLocations
      || entry.locations
      || entry.jobLocation
      || entry.employmentType
      || entry.department
    );
    if (!hasStructuredJobSignal && !ROLE_TITLE_PATTERN.test(title)) {
      return null;
    }

    const company = cleanupCompany(readTextValue(
      entry.companyName,
      entry.company?.name,
      entry.hiringOrganization?.name,
      context.companyName
    ));
    const location = readLocationValue(entry.workLocations || entry.locations || entry.jobLocation || entry.location);
    const employmentType = readTextValue(entry.employmentType, entry.jobType, entry.type);
    const salary = extractSalaryText(cleanText([
      readDescriptionValue(entry.payRangeDetails),
      readDescriptionValue(entry.compensation),
      description,
    ].filter(Boolean).join('\n')));

    return {
      title,
      company,
      location,
      employmentType,
      description,
      salary,
      source: 'next-data',
    };
  };

  const extractNextDataJobPosting = () => {
    const nextData = parseNextData();
    if (!nextData) return null;

    const apiData = nextData?.props?.pageProps?.apiData || nextData?.props?.pageProps || {};
    const context = {
      companyName: readTextValue(
        apiData?.jobBoard?.title,
        apiData?.jobBoard?.companyName,
        apiData?.board?.title,
        apiData?.companyName
      ),
    };
    const candidates = [];
    const directCandidate = normalizeNextJobCandidate(apiData?.jobPost, context);
    if (directCandidate) candidates.push(directCandidate);

    const visit = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 5 || candidates.length > 12) return;
      if (Array.isArray(value)) {
        value.slice(0, 20).forEach((entry) => visit(entry, depth + 1));
        return;
      }

      const normalized = normalizeNextJobCandidate(value, context);
      if (normalized) candidates.push(normalized);

      Object.entries(value).forEach(([key, child]) => {
        if (/^_nextI18Next$|initialI18nStore|locale|translations?|common|component/i.test(key)) return;
        if (!/job|post|opening|requisition|role|position|apiData|pageProps/i.test(key) && depth > 1) return;
        visit(child, depth + 1);
      });
    };

    if (!directCandidate) {
      visit(apiData);
    }

    return candidates
      .sort((left, right) => cleanText(right.description || '').length - cleanText(left.description || '').length)[0]
      || null;
  };

  const buildJobPostingSnapshot = () => {
    const jsonLdJob = extractJsonLdJobPosting();
    const nextDataJob = extractNextDataJobPosting();
    const domJob = extractDomJobPosting();
    const pageText = getExtractionPageText();

    const metaTitle = extractMetaText('og:title', 'twitter:title', 'title');
    const title = jsonLdJob?.title || nextDataJob?.title || domJob.title;
    const company = jsonLdJob?.company || nextDataJob?.company || domJob.company || deriveCompanyFromTitleLikeText(metaTitle);
    const location = jsonLdJob?.location || nextDataJob?.location || domJob.location;
    const employmentType = cleanText(jsonLdJob?.employmentType || nextDataJob?.employmentType || '');
    const description = cleanText(jsonLdJob?.description || nextDataJob?.description || domJob.description);
    const salary = cleanText(jsonLdJob?.salary || nextDataJob?.salary || domJob.salary || extractSalaryText(description || pageText));

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
      source: jsonLdJob?.source || nextDataJob?.source || 'dom',
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
          throw new Error('I auto-scrolled this page but could not find enough job posting data yet. Wait for the ATS to finish loading, then try again.');
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
      setStatus('Preparing a tailored resume and autofilling the current application form…', 'busy');

      try {
        const response = await chrome.runtime.sendMessage({ type: 'AUTOFILL_ACTIVE_TAB' });
        const result = response?.result || {};
        const tone = result.pendingNavigation || (result.filledCount || 0) > 0 ? 'idle' : 'warning';
        setStatus(getAutofillOutcomeMessage(result), tone);
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
        const snapshot = await waitForMeaningfulJobPostingSnapshot();

        if (!snapshot) {
          throw new Error('I auto-scrolled this page but could not find enough job posting data yet. Wait for the ATS to finish loading, then try again.');
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

    const POSITION_STORAGE_KEY = 'resumeats_job_widget_position_v8';
    const EDGE_GAP = 18;
    const EDGE_STICK = 18;
    const MIN_VISIBLE_LAUNCHER = 20;
    const DRAG_THRESHOLD = 6;
    const DEFAULT_POSITION = { snap: 'right', offset: 0.32 };
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
          font-family: "Segoe UI Variable Display", "Segoe UI", "Aptos", sans-serif;
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

        /* 2026 visual refresh: compact glass panel + icon-only edge launcher. */
        .dock {
          --panel-bg:
            radial-gradient(circle at 12% 0%, rgba(34, 211, 238, 0.18), transparent 28%),
            radial-gradient(circle at 82% 8%, rgba(45, 212, 191, 0.12), transparent 24%),
            linear-gradient(180deg, rgba(12, 24, 42, 0.98), rgba(8, 15, 27, 0.96));
          --card-bg: rgba(255, 255, 255, 0.045);
          --card-bg-strong: rgba(255, 255, 255, 0.07);
          --line: rgba(180, 206, 255, 0.12);
          --line-strong: rgba(125, 211, 252, 0.3);
          --text-main: #f8fbff;
          --text-soft: #aab9d6;
          --cyan: #54dfff;
          --teal: #2de0c1;
          --blue: #3b82f6;
        }

        .panel {
          width: 374px;
          max-height: min(740px, calc(100vh - 36px));
          border-radius: 30px;
          border-color: var(--line);
          background: var(--panel-bg);
          box-shadow:
            0 28px 72px rgba(2, 6, 23, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.035) inset;
        }

        .panel-shell {
          max-height: min(740px, calc(100vh - 36px));
          padding: 16px;
          scrollbar-width: thin;
          scrollbar-color: rgba(125, 211, 252, 0.42) transparent;
        }

        .panel-shell::-webkit-scrollbar {
          width: 8px;
        }

        .panel-shell::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(125, 211, 252, 0.34);
        }

        .panel-head {
          align-items: center;
        }

        .eyebrow {
          min-height: 34px;
          border-color: rgba(125, 211, 252, 0.2);
          background: rgba(255, 255, 255, 0.055);
          color: var(--text-main);
          letter-spacing: 0.08em;
          text-transform: none;
        }

        .eyebrow::before {
          content: "";
          width: 22px;
          height: 22px;
          border-radius: 9px;
          background:
            radial-gradient(circle at 26% 22%, rgba(255, 255, 255, 0.5), transparent 28%),
            linear-gradient(145deg, var(--cyan), var(--teal) 48%, #4f7cff);
          box-shadow: 0 10px 24px rgba(45, 224, 193, 0.24);
        }

        .eyebrow-dot {
          display: none;
        }

        .title {
          margin-top: 14px;
          font-size: 30px;
          line-height: 1.02;
          max-width: 250px;
          font-weight: 750;
          letter-spacing: -0.035em;
        }

        .copy {
          max-width: 290px;
          font-size: 12px;
          color: var(--text-soft);
        }

        .drag-chip {
          min-height: 38px;
          padding: 0 13px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.055);
          border-color: rgba(255, 255, 255, 0.09);
          color: var(--text-soft);
          text-transform: none;
        }

        .icon-button {
          width: 38px;
          height: 38px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.055);
          border-color: rgba(255, 255, 255, 0.09);
        }

        .status {
          margin-top: 14px;
          border-radius: 18px;
          border-color: rgba(245, 177, 75, 0.24);
          background: rgba(245, 177, 75, 0.12);
          color: #ffe8b6;
          line-height: 1.5;
        }

        .status[data-tone="idle"] {
          border-color: rgba(125, 211, 252, 0.18);
          background: rgba(255, 255, 255, 0.045);
          color: #d7e5ff;
        }

        .status[data-tone="busy"] {
          border-color: rgba(84, 223, 255, 0.26);
          background: rgba(84, 223, 255, 0.1);
          color: #dff8ff;
        }

        .summary-card,
        .insight-card {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.025)),
            rgba(7, 14, 27, 0.68);
          border-color: var(--line);
        }

        .workflow-stack {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }

        .workflow-card {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) 34px;
          gap: 12px;
          align-items: center;
          min-height: 74px;
          padding: 13px;
          border-radius: 20px;
          border: 1px solid var(--line);
          background: var(--card-bg);
          box-shadow: 0 14px 28px rgba(2, 6, 23, 0.13);
        }

        .workflow-icon,
        .workflow-done,
        .workflow-spinner {
          display: inline-grid;
          place-items: center;
          border-radius: 999px;
        }

        .workflow-icon {
          width: 44px;
          height: 44px;
          color: #dff8ff;
          background: rgba(84, 223, 255, 0.13);
          border: 1px solid rgba(84, 223, 255, 0.2);
        }

        .workflow-icon svg {
          width: 20px;
          height: 20px;
        }

        .workflow-title {
          color: var(--text-main);
          font-size: 15px;
          font-weight: 750;
          letter-spacing: -0.018em;
        }

        .workflow-copy {
          margin-top: 3px;
          color: var(--text-soft);
          font-size: 12px;
          line-height: 1.35;
        }

        .workflow-track {
          grid-column: 2 / 4;
          height: 6px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(148, 163, 184, 0.15);
        }

        .workflow-fill {
          width: 12%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--blue), var(--cyan), var(--teal));
          box-shadow: 0 0 16px rgba(84, 223, 255, 0.28);
          transition: width 260ms ease;
        }

        .workflow-done,
        .workflow-spinner {
          width: 34px;
          height: 34px;
        }

        .workflow-done {
          color: #d7fff5;
          border: 1px solid rgba(45, 224, 193, 0.25);
          background: rgba(45, 224, 193, 0.12);
          opacity: 0;
          transform: scale(0.86);
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .workflow-spinner {
          border: 2px solid rgba(84, 223, 255, 0.2);
          border-top-color: var(--cyan);
          animation: none;
          opacity: 0.32;
        }

        .dock[data-scanning="true"] .workflow-card.analyze-step,
        .dock[data-autofilling="true"] .workflow-card.autofill-step,
        .dock[data-progress="true"] .workflow-card.resume-step {
          border-color: var(--line-strong);
          background: var(--card-bg-strong);
        }

        .dock[data-scanning="true"] .analyze-step .workflow-fill {
          width: 78%;
          animation: breathe-bar 1.4s ease-in-out infinite alternate;
        }

        .dock[data-autofilling="true"] .autofill-step .workflow-fill {
          width: 68%;
          animation: breathe-bar 1.4s ease-in-out infinite alternate;
        }

        .dock[data-progress="true"] .resume-step .workflow-fill {
          width: 76%;
          animation: breathe-bar 1.4s ease-in-out infinite alternate;
        }

        .dock[data-progress="true"] .resume-step .workflow-spinner {
          opacity: 1;
          animation: spin 1.15s linear infinite;
        }

        .dock:not([data-scanning="true"]) .analyze-step .workflow-fill {
          width: 28%;
        }

        .dock:not([data-autofilling="true"]) .autofill-step .workflow-fill {
          width: 18%;
        }

        .dock:not([data-progress="true"]) .resume-step .workflow-fill {
          width: 22%;
        }

        .dock[data-scanning="true"] .analyze-step .workflow-done,
        .dock[data-autofilling="true"] .autofill-step .workflow-done {
          opacity: 1;
          transform: scale(1);
        }

        .score-ring {
          width: 88px;
          height: 88px;
          background:
            radial-gradient(circle at 50% 50%, rgba(10, 17, 32, 0.96) 55%, transparent 57%),
            conic-gradient(from 180deg, var(--teal) calc(var(--score) * 1%), rgba(143, 161, 197, 0.18) 0);
        }

        .score-value {
          font-size: 24px;
        }

        .actions {
          gap: 10px;
        }

        .action {
          min-height: 44px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.055);
          border-color: rgba(255, 255, 255, 0.09);
        }

        .action.primary {
          background:
            radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.24), transparent 24%),
            linear-gradient(135deg, #3b82f6, #2de0c1);
        }

        .text-link {
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.045);
        }

        .progress {
          height: 7px;
          margin-top: 12px;
          background: rgba(148, 163, 184, 0.14);
        }

        .launcher {
          width: 80px;
          height: 118px;
          border-radius: 32px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background:
            radial-gradient(circle at 36% 18%, rgba(255, 255, 255, 0.38), transparent 26%),
            linear-gradient(180deg, #071426 0%, #123d91 50%, #2de0c1 100%);
          box-shadow:
            0 24px 48px rgba(2, 6, 23, 0.32),
            0 0 0 1px rgba(255, 255, 255, 0.05) inset,
            inset 0 1px 0 rgba(255, 255, 255, 0.28);
        }

        .dock[data-snap="left"] .launcher {
          border-radius: 0 32px 32px 0;
        }

        .dock[data-snap="right"] .launcher {
          border-radius: 32px 0 0 32px;
        }

        .dock[data-snap="top"] .launcher {
          width: 118px;
          height: 80px;
          border-radius: 0 0 32px 32px;
        }

        .dock[data-snap="bottom"] .launcher {
          width: 118px;
          height: 80px;
          border-radius: 32px 32px 0 0;
        }

        .launcher::before {
          top: 50% !important;
          width: 28px !important;
          height: 70px !important;
          transform: translateY(-50%);
          opacity: 0.92;
          background: linear-gradient(180deg, rgba(84, 223, 255, 0), rgba(84, 223, 255, 0.55), rgba(45, 224, 193, 0)) !important;
          filter: blur(0.2px);
        }

        .dock[data-snap="left"] .launcher::before {
          left: -18px;
          right: auto;
          border-radius: 0 22px 22px 0;
        }

        .dock[data-snap="right"] .launcher::before {
          right: -18px;
          left: auto;
          border-radius: 22px 0 0 22px;
        }

        .dock[data-snap="top"] .launcher::before,
        .dock[data-snap="bottom"] .launcher::before {
          left: 50%;
          right: auto;
          top: auto !important;
          width: 70px !important;
          height: 28px !important;
          transform: translateX(-50%);
        }

        .dock[data-snap="top"] .launcher::before {
          top: -18px !important;
          border-radius: 0 0 22px 22px;
          background: linear-gradient(90deg, rgba(84, 223, 255, 0), rgba(84, 223, 255, 0.52), rgba(45, 224, 193, 0)) !important;
        }

        .dock[data-snap="bottom"] .launcher::before {
          bottom: -18px !important;
          border-radius: 22px 22px 0 0;
          background: linear-gradient(90deg, rgba(84, 223, 255, 0), rgba(84, 223, 255, 0.52), rgba(45, 224, 193, 0)) !important;
        }

        .launcher::after {
          inset: -18px;
          border-radius: 38px;
          background: radial-gradient(circle at center, rgba(84, 223, 255, 0.3), transparent 68%);
          filter: blur(16px);
        }

        .launcher-core {
          width: 54px;
          height: 54px;
          border-radius: 22px;
          background:
            radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.42), transparent 27%),
            linear-gradient(145deg, #54dfff, #2de0c1 48%, #4f7cff);
          box-shadow:
            0 15px 30px rgba(45, 224, 193, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.34);
        }

        .launcher-core svg {
          width: 30px;
          height: 30px;
          stroke-width: 2;
        }

        @keyframes breathe-bar {
          from { filter: brightness(0.92); }
          to { filter: brightness(1.22); }
        }

        @media (max-width: 640px) {
          .panel {
            width: min(348px, calc(100vw - 28px));
          }

          .workflow-card {
            grid-template-columns: 40px minmax(0, 1fr) 30px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .workflow-fill,
          .workflow-spinner {
            animation: none !important;
          }
        }

        /* Command-center rebuild: minimal hierarchy, no dashboard clutter. */
        .panel {
          width: 354px;
          border-radius: 26px;
        }

        .panel-shell {
          display: grid;
          gap: 10px;
          padding: 13px;
          overflow: hidden;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .brand-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 32px;
          padding: 0 10px 0 7px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.2);
          background: rgba(255, 255, 255, 0.055);
          color: var(--text-main);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }

        .brand-orb {
          width: 22px;
          height: 22px;
          border-radius: 10px;
          background:
            radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.46), transparent 30%),
            linear-gradient(145deg, var(--cyan), var(--teal) 48%, #4f7cff);
          box-shadow: 0 10px 24px rgba(45, 224, 193, 0.22);
        }

        .head-actions {
          align-items: center;
          gap: 7px;
        }

        .drag-chip {
          width: 38px;
          min-height: 36px;
          padding: 0;
          justify-content: center;
          font-size: 0;
        }

        .drag-dot-grid {
          width: 18px;
          height: 10px;
          opacity: 0.75;
        }

        .icon-button {
          width: 36px;
          height: 36px;
          border-radius: 14px;
        }

        .hero-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 80px;
          gap: 12px;
          align-items: center;
          padding: 13px;
          border-radius: 21px;
          border: 1px solid var(--line);
          background:
            radial-gradient(circle at 0% 0%, rgba(84, 223, 255, 0.1), transparent 42%),
            rgba(255, 255, 255, 0.045);
        }

        .identity-title {
          font-size: 20px;
          line-height: 1.08;
          font-weight: 760;
          letter-spacing: -0.035em;
          color: var(--text-main);
        }

        .identity-meta {
          margin-top: 6px;
          color: var(--text-soft);
          font-size: 12px;
          line-height: 1.35;
        }

        .score-ring {
          width: 76px;
          height: 76px;
          box-shadow: inset 0 0 0 7px rgba(255, 255, 255, 0.045);
        }

        .score-value {
          font-size: 21px;
        }

        .score-caption {
          font-size: 8px;
        }

        .status {
          margin-top: 0;
          padding: 9px 11px;
          border-radius: 16px;
          font-size: 11px;
          line-height: 1.35;
        }

        .command-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .action.command {
          min-height: 64px;
          display: grid;
          place-items: center;
          align-content: center;
          gap: 6px;
          padding: 8px;
          border-radius: 18px;
          font-size: 12px;
          letter-spacing: -0.01em;
        }

        .action.command svg {
          width: 19px;
          height: 19px;
        }

        .progress-panel {
          display: none;
          gap: 8px;
          padding: 11px;
          border-radius: 18px;
          border: 1px solid rgba(84, 223, 255, 0.22);
          background: rgba(84, 223, 255, 0.08);
        }

        .dock[data-progress="true"] .progress-panel {
          display: grid;
        }

        .progress-headline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: #dff8ff;
          font-size: 11px;
          font-weight: 800;
        }

        .progress {
          margin-top: 0;
          height: 7px;
          opacity: 1;
          transform: none;
        }

        .compact-readout {
          margin-top: 0;
          padding: 12px;
          gap: 9px;
          border-radius: 18px;
        }

        .score-headline {
          margin-top: 0;
          font-size: 14px;
          line-height: 1.25;
        }

        .score-summary {
          margin-top: 4px;
          font-size: 11px;
          line-height: 1.42;
        }

        .pill-row,
        .signal-row {
          min-height: 0;
          gap: 6px;
        }

        .pill,
        .signal-pill {
          min-height: 24px;
          padding: 0 9px;
          font-size: 10px;
        }

        .compact-data {
          display: none;
        }

        .link-row {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 7px;
          margin-top: 0;
        }

        .text-link {
          min-height: 34px;
          padding: 0 8px;
          border-radius: 14px;
          font-size: 10px;
        }

        .pill-row .muted,
        .signal-row .muted {
          display: none;
        }

        .launcher {
          width: 74px;
          height: 108px;
        }

        .launcher-core {
          width: 50px;
          height: 50px;
          border-radius: 20px;
        }

        .launcher-core svg {
          width: 28px;
          height: 28px;
        }

        @media (max-width: 640px) {
          .panel {
            width: min(334px, calc(100vw - 26px));
          }

          .hero-card {
            grid-template-columns: minmax(0, 1fr) 70px;
          }

          .score-ring {
            width: 68px;
            height: 68px;
          }
        }

        /* macOS neutral skin shared with the popup and side panel. */
        .dock,
        .dock[data-theme="dark"] {
          --surface: #242426;
          --surface-soft: #2c2c2e;
          --surface-raised: #3a3a3c;
          --surface-border: #48484a;
          --surface-border-strong: #5a5a5d;
          --text-main: #f2f2f7;
          --text-soft: #a1a1a8;
          --accent: #0a84ff;
          --cyan: #0a84ff;
          --teal: #0a84ff;
          --status-bg: #303033;
          --button-hover: #454547;
          --button-active: #515154;
        }

        .dock[data-theme="light"] {
          --surface: #ffffff;
          --surface-soft: #f2f2f7;
          --surface-raised: #ffffff;
          --surface-border: #d1d1d6;
          --surface-border-strong: #c7c7cc;
          --text-main: #1d1d1f;
          --text-soft: #6e6e73;
          --accent: #007aff;
          --cyan: #007aff;
          --teal: #007aff;
          --status-bg: #f2f2f7;
          --button-hover: #f1f1f4;
          --button-active: #e8e8ed;
        }

        .dock {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif;
        }

        .panel {
          background: var(--surface);
          border-color: var(--surface-border);
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.28);
        }

        .brand-pill,
        .hero-card,
        .status,
        .compact-readout,
        .progress-panel,
        .text-link,
        .icon-button,
        .drag-chip {
          background: var(--surface-soft);
          border-color: var(--surface-border);
          color: var(--text-main);
        }

        .brand-orb {
          background: var(--accent);
          box-shadow: none;
        }

        .score-ring {
          background: var(--surface);
          border: 1px solid var(--surface-border);
          box-shadow: inset 0 0 0 7px var(--status-bg);
        }

        .action.command,
        .action.secondary {
          background: var(--surface-raised);
          border-color: var(--surface-border);
          color: var(--text-main);
          box-shadow: none;
        }

        .action.command:hover,
        .text-link:hover,
        .icon-button:hover,
        .drag-chip:hover {
          background: var(--button-hover);
          border-color: var(--surface-border-strong);
        }

        .action.command:active,
        .text-link:active,
        .icon-button:active,
        .drag-chip:active {
          background: var(--button-active);
        }

        .action.primary {
          background: var(--accent);
          color: #ffffff;
          box-shadow: none;
        }

        .progress-fill,
        .progress::before {
          background: var(--accent);
          box-shadow: none;
        }

        .pill,
        .signal-pill {
          background: var(--status-bg);
          border-color: var(--surface-border);
          color: var(--text-main);
        }

        .launcher {
          background: var(--surface);
          border: 1px solid var(--surface-border);
          box-shadow: 0 16px 34px rgba(0, 0, 0, 0.24);
        }

        .launcher::before,
        .launcher::after {
          display: none;
        }

        .launcher-core {
          background: var(--accent);
          box-shadow: none;
        }

        .dock[data-theme="light"] .action.command:not(.primary),
        .dock[data-theme="light"] .text-link,
        .dock[data-theme="light"] .icon-button,
        .dock[data-theme="light"] .drag-chip {
          background: #ffffff;
          border-color: #d1d1d6;
          color: #1d1d1f;
        }

        .dock[data-theme="dark"] .action.command:not(.primary),
        .dock[data-theme="dark"] .text-link,
        .dock[data-theme="dark"] .icon-button,
        .dock[data-theme="dark"] .drag-chip {
          background: #3a3a3c;
          border-color: #48484a;
          color: #f2f2f7;
        }

        /* ResumeATS website skin for the on-page dock. */
        .dock,
        .dock[data-theme="light"] {
          --surface: #ffffff;
          --surface-soft: #f8fafc;
          --surface-raised: #ffffff;
          --surface-border: #e5e7eb;
          --surface-border-strong: #d1d5db;
          --text-main: #111827;
          --text-soft: #4b5563;
          --brand-accent: #2563eb;
          --accent: #2563eb;
          --accent-hover: #1d4ed8;
          --accent-soft: #eff6ff;
          --accent-border: #bfdbfe;
          --status-bg: #f8fafc;
          --button-hover: #f9fafb;
          --button-active: #f3f4f6;
        }

        .dock[data-theme="dark"] {
          --surface: #1e293b;
          --surface-soft: #0f172a;
          --surface-raised: #1e293b;
          --surface-border: #334155;
          --surface-border-strong: #475569;
          --text-main: #f1f5f9;
          --text-soft: #cbd5e1;
          --brand-accent: #60a5fa;
          --accent: #2563eb;
          --accent-hover: #1d4ed8;
          --accent-soft: rgba(37, 99, 235, 0.12);
          --accent-border: #1e40af;
          --status-bg: rgba(15, 23, 42, 0.4);
          --button-hover: #334155;
          --button-active: #475569;
        }

        .dock {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
          color: var(--text-main);
        }

        .panel {
          background: var(--surface);
          border-color: var(--surface-border);
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.18), 0 8px 10px -6px rgba(15, 23, 42, 0.14);
        }

        .dock[data-theme="dark"] .panel {
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.34), 0 8px 10px -6px rgba(0, 0, 0, 0.28);
        }

        .brand-pill {
          background: transparent;
          border-color: transparent;
          color: var(--brand-accent);
          border-radius: 0;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.025em;
          text-transform: none;
        }

        .brand-orb {
          display: none;
        }

        .hero-card,
        .status,
        .compact-readout,
        .progress-panel,
        .text-link,
        .icon-button,
        .drag-chip,
        .insight-card {
          background: var(--surface-soft);
          border-color: var(--surface-border);
          color: var(--text-main);
          border-radius: 12px;
          box-shadow: none;
        }

        .status[data-tone="idle"] {
          background: var(--accent-soft);
          border-color: var(--accent-border);
          color: var(--brand-accent);
        }

        .score-ring {
          background: var(--surface);
          border: 1px solid var(--surface-border);
          box-shadow: inset 0 0 0 7px var(--accent-soft);
          color: var(--text-main);
        }

        .action.command,
        .action.secondary,
        .text-link,
        .icon-button,
        .drag-chip {
          background: var(--surface-raised) !important;
          border-color: var(--surface-border) !important;
          color: var(--text-main) !important;
          border-radius: 8px;
          box-shadow: none;
          font-weight: 600;
        }

        .action.command:hover,
        .text-link:hover,
        .icon-button:hover,
        .drag-chip:hover {
          background: var(--button-hover) !important;
          border-color: var(--surface-border-strong) !important;
          color: var(--brand-accent) !important;
        }

        .action.command:active,
        .text-link:active,
        .icon-button:active,
        .drag-chip:active {
          background: var(--button-active) !important;
        }

        .action.primary {
          background: var(--accent) !important;
          border-color: var(--accent) !important;
          color: #ffffff !important;
        }

        .action.primary:hover {
          background: var(--accent-hover) !important;
          border-color: var(--accent-hover) !important;
        }

        .progress-fill,
        .progress::before {
          background: var(--accent);
          box-shadow: none;
        }

        .pill,
        .signal-pill {
          background: var(--accent-soft);
          border-color: var(--accent-border);
          color: var(--brand-accent);
        }

        .launcher {
          background: var(--surface);
          border: 1px solid var(--surface-border);
          border-radius: 18px 0 0 18px;
          box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.18), 0 8px 10px -6px rgba(15, 23, 42, 0.14);
        }

        .dock[data-theme="dark"] .launcher {
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.34), 0 8px 10px -6px rgba(0, 0, 0, 0.28);
        }

        .launcher-core {
          background: var(--accent);
          color: #ffffff;
          box-shadow: none;
        }

        .launcher:hover .launcher-core {
          background: var(--accent-hover);
        }
      </style>
      <div class="dock" data-open="false" data-scanning="false" data-snap="right" data-dragging="false">
        <div class="panel">
          <div class="panel-shell">
            <div class="topbar">
              <div class="brand-pill">
                <span class="brand-orb" aria-hidden="true"></span>
                <span>ResumeATS</span>
              </div>
              <div class="head-actions">
                <button class="drag-chip drag-panel" type="button" aria-label="Drag and snap widget">
                  <span class="drag-dot-grid" aria-hidden="true"></span>
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

            <div class="hero-card">
              <div>
                <div class="identity-title">Waiting for a job</div>
                <div class="identity-meta">Scan any role or application page.</div>
              </div>
              <div class="score-ring">
                <div>
                  <div class="score-value">--</div>
                  <div class="score-caption">Match</div>
                </div>
              </div>
            </div>

            <div class="status" data-tone="idle">Ready.</div>

            <div class="command-grid" aria-label="ResumeATS actions">
              <button class="action command primary analyze" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="10.5" cy="10.5" r="5.75"></circle>
                  <path d="m15 15 4.25 4.25"></path>
                </svg>
                <span>Scan</span>
              </button>
              <button class="action command secondary autofill" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4.75 18.25h4l10-10a2.12 2.12 0 0 0-3-3l-10 10v4Z"></path>
                  <path d="m14.5 6.5 3 3"></path>
                </svg>
                <span>Autofill</span>
              </button>
              <button class="action command secondary recommendation" type="button">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M7 4.75h6.75L17 8v11.25H7V4.75Z"></path>
                  <path d="M13.75 4.75V8H17"></path>
                  <path d="M9.25 12h5.5"></path>
                </svg>
                <span>Resume</span>
              </button>
            </div>

            <div class="progress-panel" aria-live="polite">
              <div class="progress-headline">
                <span class="progress-label-text">Working</span>
                <span class="progress-value-text">0%</span>
              </div>
              <div class="progress" data-tone="busy" aria-hidden="true"><div class="progress-fill"></div></div>
            </div>

            <div class="summary-card compact-readout">
                <div>
                    <div class="score-headline">Not analyzed yet</div>
                    <div class="score-summary">Scan once, then choose autofill or resume tailoring.</div>
                </div>
              <div class="pill-row"></div>
              <div class="signal-row"></div>
            </div>

            <div class="insight-grid compact-data" aria-hidden="true">
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

            <div class="link-row">
              <button class="text-link open-quick" type="button">Quick</button>
              <button class="text-link open-ai" type="button">AI</button>
              <button class="text-link open-auto-apply" type="button">Auto</button>
              <button class="text-link companion" type="button">Panel</button>
              <button class="text-link open-dashboard" type="button">Home</button>
            </div>
          </div>
        </div>

        <button class="launcher" type="button" aria-label="Open ResumeATS job companion">
          <div class="launcher-core">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7.2 5.2h5.9l3.7 3.7v9.9H7.2V5.2Z"></path>
              <path d="M13.1 5.2v3.7h3.7"></path>
              <path d="M9.2 12.1h5.5"></path>
              <path d="m9.4 16.2 1.7 1.7 4.2-4.8"></path>
              <path d="M4.8 8.6 3.2 10.2l1.6 1.6"></path>
              <path d="M19.2 12.2l1.6 1.6-1.6 1.6"></path>
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
    const progressLabelTextEl = shadow.querySelector('.progress-label-text');
    const progressValueTextEl = shadow.querySelector('.progress-value-text');
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
    let isAutofilling = false;
    let isPreparingResume = false;
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
    let statusHoldUntil = 0;
    const WARNING_STATUS_HOLD_MS = 45000;
    const WARNING_PROGRESS_HOLD_MS = 10000;

    const applyExtensionTheme = (theme) => {
      dock.dataset.theme = normalizeTheme(theme);
    };

    const handleThemeStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes?.[THEME_STORAGE_KEY]) {
        applyExtensionTheme(changes[THEME_STORAGE_KEY].newValue);
      }
    };

    applyExtensionTheme(getDefaultTheme());
    void readExtensionTheme().then(applyExtensionTheme);
    chrome.storage.onChanged.addListener(handleThemeStorageChange);

    const ensureHostMounted = () => {
      if (hasBeenDestroyed) return false;
      try {
        return mountHost();
      } catch {
        return false;
      }
    };

    const compactStatusMessage = (message = '') => {
      const value = cleanText(message);
      if (!value) return 'Ready.';
      if (/ResumeATS profile is missing/i.test(value)) {
        return value
          .replace(/^ResumeATS profile is missing/i, 'Missing profile fields:')
          .replace(/Complete your ResumeATS profile\/resume contact details, reload ResumeATS, then click Connect ResumeATS again\.?/i, 'Update ResumeATS, reload it, then Connect again.');
      }
      if (/^Captured .+ saved a scored snapshot/i.test(value)) return 'Role scanned. Snapshot saved.';
      if (/^Detected .+ Run a scan/i.test(value)) return 'Role detected. Ready to scan.';
      if (/Preparing a tailored resume and autofilling/i.test(value)) return 'Preparing resume and autofill.';
      if (/Generating a tailored resume/i.test(value)) return 'Generating AI resume.';
      if (/Waiting for the application questions/i.test(value)) return 'Waiting for visible fields...';
      if (/Autofilled \d+ field/i.test(value)) return value;
      if (value.length > 92) return `${value.slice(0, 89).trim()}...`;
      return value;
    };

    const setStatus = (message, tone = 'idle', options = {}) => {
      const { force = false, stickyMs = tone === 'warning' ? WARNING_STATUS_HOLD_MS : 0 } = options;
      const shouldPreserveWarning = !force
        && tone === 'idle'
        && statusEl.dataset.tone === 'warning'
        && Date.now() < statusHoldUntil;

      if (shouldPreserveWarning) {
        return false;
      }

      const fullMessage = cleanText(message) || 'Ready.';
      statusEl.textContent = compactStatusMessage(message);
      statusEl.title = fullMessage;
      statusEl.dataset.tone = tone;
      if (tone === 'warning') {
        statusHoldUntil = Date.now() + stickyMs;
      } else if (force || tone === 'busy') {
        statusHoldUntil = 0;
      }
      return true;
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

      if (progressLabelTextEl) {
        progressLabelTextEl.textContent = progressState.tone === 'warning'
          ? 'Needs attention'
          : isAutofilling
            ? 'Autofilling'
            : isScanning
              ? 'Analyzing'
              : isPreparingResume
                ? 'Preparing resume'
                : 'Preparing resume';
      }

      if (progressValueTextEl) {
        progressValueTextEl.textContent = `${Math.round(Math.max(0, Math.min(100, progressState.value)))}%`;
      }
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
      }, tone === 'warning' ? WARNING_PROGRESS_HOLD_MS : 800);
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

      const recommendationLabel = analysis?.recommendedLabel === 'AI Generator'
        ? 'AI Resume'
        : analysis?.recommendedLabel === 'Quick Resume'
          ? 'Quick Resume'
          : analysis?.recommendedLabel === 'Auto-Apply'
            ? 'Auto-Apply'
            : analysis?.recommendedLabel || '';

      recommendationButton.textContent = recommendationLabel
        ? recommendationLabel
        : isApplicationPage
          ? 'Autofill'
          : 'Resume';
    };

    const render = () => {
      if (hasBeenDestroyed) return;
      ensureHostMounted();
      dock.dataset.open = isOpen ? 'true' : 'false';
      dock.dataset.scanning = isScanning ? 'true' : 'false';
      dock.dataset.autofilling = isAutofilling ? 'true' : 'false';
      dock.dataset.preparingResume = isPreparingResume ? 'true' : 'false';
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
      chrome.storage.onChanged.removeListener(handleThemeStorageChange);
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
        if (successMessage) setStatus(successMessage, 'idle', { force: true });
      } catch (error) {
        setStatus(error?.message || 'Could not open ResumeATS.', 'warning');
      }
    };

    const openSidePanel = async () => {
      try {
        await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
        setStatus('Opened the ResumeATS side panel.', 'idle', { force: true });
      } catch (error) {
        setStatus(error?.message || 'Could not open the side panel.', 'warning');
      }
    };

    const getPreparedResumeOutcomeMessage = (response = {}) => {
      const resumeTitle = response.preparedResume?.title
        || response.profile?.documents?.preparedResumeTitle
        || 'tailored resume';
      const roleTitle = response.activeJob?.title || lastSnapshot?.title || 'this role';
      return `Prepared "${resumeTitle}" for ${roleTitle}. Use Autofill to attach it and complete the application.`;
    };

    const prepareAiResumeForCurrentJob = async () => {
      if (isPreparingResume || isScanning || isAutofilling) return;

      isPreparingResume = true;
      startProgress('busy');
      setStatus('Generating a tailored resume from this job description...', 'busy', { force: true });
      render();

      try {
        const response = await chrome.runtime.sendMessage({ type: 'PREPARE_ACTIVE_TAB_RESUME' });
        if (!response?.ok) {
          throw new Error(response?.error || 'Could not generate a tailored resume for this job.');
        }

        if (response.activeJob) {
          lastSnapshot = {
            ...(lastSnapshot || {}),
            ...response.activeJob,
            analysis: lastSnapshot?.analysis || response.activeJob.analysis || null,
          };
        }

        setStatus(getPreparedResumeOutcomeMessage(response), 'idle', { force: true });
        settleProgress('success');
      } catch (error) {
        setStatus(error?.message || 'Could not generate a tailored resume for this job.', 'warning');
        settleProgress('warning');
      } finally {
        isPreparingResume = false;
        render();
      }
    };

    const shouldRetryAutofillResult = (result = {}) => {
      if (!result?.ok || result.pendingNavigation || (result.filledCount || 0) > 0) {
        return false;
      }

      if ((result.accessibleFieldCount || 0) === 0) {
        return true;
      }

      const reason = `${result.zeroFillReason || ''}`.toLowerCase();
      return reason.includes('no visible form fields')
        || reason.includes('form shell')
        || reason.includes('fillable application questions yet');
    };

    const autofillPreparedApplication = async (profile) => {
      let result = await autofillApplication({
        profile,
        autoSubmit: false,
      });

      for (const retryDelayMs of AUTOFILL_RETRY_DELAYS_MS) {
        if (!shouldRetryAutofillResult(result)) {
          break;
        }

        setStatus('Waiting for the application questions to finish loading...', 'busy');
        render();
        await delay(retryDelayMs);
        result = await autofillApplication({
          profile,
          autoSubmit: false,
        });
      }

      return result;
    };

    const autofillCurrentApplication = async () => {
      if (isAutofilling) return;
      isAutofilling = true;
      startProgress('busy');
      setStatus('Preparing a tailored resume and autofilling the current form...', 'busy', { force: true });
      render();

      const finishWithResult = (result = {}, error = '') => {
        isAutofilling = false;
        if (error) {
          setStatus(error, 'warning');
          settleProgress('warning');
          render();
          return;
        }
        if (Array.isArray(result.profileMissingFields) && result.profileMissingFields.length > 0) {
          setStatus(getAutofillOutcomeMessage(result), 'warning');
          settleProgress('warning');
        } else if (result.pendingNavigation || (result.filledCount || 0) > 0) {
          isOpen = false;
          setStatus(getAutofillOutcomeMessage(result), 'idle', { force: true });
          settleProgress('success');
        } else {
          setStatus(getAutofillOutcomeMessage(result), 'warning');
          settleProgress('warning');
        }
        render();
      };

      try {
        const preparation = await chrome.runtime.sendMessage({ type: 'PREPARE_ACTIVE_TAB_AUTOFILL' });
        if (!preparation?.ok || !preparation?.profile) {
          throw new Error(preparation?.error || 'Could not prepare ResumeATS for this application.');
        }

        let finalResult = await autofillPreparedApplication(preparation.profile);
        finalResult = {
          ...finalResult,
          preparedResume: preparation.preparedResume || finalResult?.preparedResume || null,
        };

        if (!finalResult?.ok || (finalResult.filledCount || 0) === 0) {
          const response = await chrome.runtime.sendMessage({ type: 'AUTOFILL_ACTIVE_TAB' });
          if (!response?.ok || !response?.result) {
            throw new Error(response?.error || finalResult?.error || 'Could not autofill the current page.');
          }
          finalResult = (response.result?.ok && (response.result.filledCount || 0) > (finalResult.filledCount || 0))
            ? response.result
            : finalResult;
        }

        if (!finalResult?.ok) {
          throw new Error(finalResult?.error || 'Could not autofill the current page.');
        }

        finishWithResult(finalResult, '');
      } catch (error) {
        finishWithResult({}, error?.message || 'Could not autofill the current page.');
      }
    };

    const scanCurrentJob = async ({ openPanel = true } = {}) => {
      if (isScanning) return;

      isScanning = true;
      if (openPanel) isOpen = true;
      startProgress('busy');
      setStatus('Reading the page, auto-scrolling if needed, and scoring the fit...', 'busy', { force: true });
      render();

      try {
        const frameCapturePromise = chrome.runtime.sendMessage({ type: 'CAPTURE_ACTIVE_JOB_POSTING' })
          .then((response) => response?.jobPosting || null)
          .catch(() => null);
        const topPageCapturePromise = (async () => {
          await delay(320);
          return waitForMeaningfulJobPostingSnapshot({ timeoutMs: 1800 });
        })().catch(() => null);

        let snapshot = await Promise.race([
          frameCapturePromise,
          topPageCapturePromise,
          delay(3000).then(() => null),
        ]);

        if (!snapshot) {
          const [frameResult, topPageResult] = await Promise.allSettled([
            frameCapturePromise,
            topPageCapturePromise,
          ]);
          snapshot = frameResult.status === 'fulfilled' && frameResult.value
            ? frameResult.value
            : topPageResult.status === 'fulfilled'
              ? topPageResult.value
              : null;
        }

        if (!snapshot) {
          throw new Error('I auto-scrolled this page but could not find enough job posting data yet. Wait for the ATS to finish loading, then try again.');
        }

        lastSnapshot = await enrichJobPostingSnapshot(snapshot);
        await persistJobPostingSnapshot(lastSnapshot);
        setStatus(`Captured ${lastSnapshot.title || 'this role'} and saved a scored snapshot for ResumeATS.`, 'idle', { force: true });
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
      const isApplicationPage = looksLikeApplicationForm() || Boolean(findApplyEntryButton());
      if (!lastSnapshot?.analysis && isApplicationPage) {
        autofillCurrentApplication();
        return;
      }

      const route = lastSnapshot?.analysis?.recommendedRoute || '/#/dashboard';
      if (route === '/#/ai-generator' || lastSnapshot?.analysis?.recommendedLabel === 'AI Generator') {
        prepareAiResumeForCurrentJob();
        return;
      }
      openResumeRoute(route, 'Opened the recommended ResumeATS flow for this page.');
    });
    openQuickButton.addEventListener('click', () => openResumeRoute('/#/quick-resume', 'Opened Quick Resume.'));
    openAiButton.addEventListener('click', prepareAiResumeForCurrentJob);
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
        if (!isScanning && !isAutofilling) {
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

      if (!isScanning && !isAutofilling) {
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

        if (!isScanning && !isAutofilling) {
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

  const getFieldSearchRoots = (field) => {
    const roots = [];
    const seen = new Set();
    const pushRoot = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    };

    pushRoot(field?.getRootNode?.());
    pushRoot(field?.ownerDocument);
    return roots;
  };

  const PAGE_BRIDGE_MESSAGE_SOURCE = 'resumeats-browser-agent-content';
  const PAGE_BRIDGE_MESSAGE_TARGET = 'resumeats-browser-agent-page';
  const PAGE_BRIDGE_RESPONSE_SOURCE = 'resumeats-browser-agent-page';
  const PAGE_BRIDGE_RESPONSE_TARGET = 'resumeats-browser-agent-content';

  const ensurePageWorldFormBridge = () => {
    if (document.querySelector('script[data-resumeats-page-bridge="true"]')) {
      return;
    }

    const script = document.createElement('script');
    script.dataset.resumeatsPageBridge = 'true';
    script.src = chrome.runtime.getURL('page-form-bridge.js');
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    (document.documentElement || document.head || document.body).appendChild(script);
  };

  const ensureInlinePageWorldFormBridge = () => {
    if (document.querySelector('script[data-resumeats-inline-page-bridge="true"]')) {
      return;
    }

    const script = document.createElement('script');
    script.dataset.resumeatsInlinePageBridge = 'true';
    script.textContent = `(() => {
      if (window.__resumeatsPageWorldFormBridgeReady) return;
      window.__resumeatsPageWorldFormBridgeReady = true;

      const SOURCE = '${PAGE_BRIDGE_RESPONSE_SOURCE}';
      const TARGET = '${PAGE_BRIDGE_MESSAGE_TARGET}';
      const cleanText = (value = '') => \`\${value}\`
        .replace(/\\u00a0/g, ' ')
        .replace(/\\r/g, '')
        .replace(/[ \\t]+\\n/g, '\\n')
        .replace(/\\n{3,}/g, '\\n\\n')
        .replace(/[ \\t]{2,}/g, ' ')
        .trim();
      const normalize = (value = '') => \`\${value}\`.toLowerCase().replace(/\\s+/g, ' ').trim();
      const pickProfileValue = (...values) => values
        .map((value) => cleanText(value ?? ''))
        .find(Boolean) || '';
      const splitFullName = (fullName = '') => {
        const parts = cleanText(fullName).split(/\\s+/).filter(Boolean);
        return {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' '),
        };
      };
      const buildNormalizedCandidate = (profile = {}) => {
        const candidate = profile?.candidate || {};
        const personal = profile?.personal || profile?.personalInfo || {};
        const nestedPersonal = profile?.profile?.personal || profile?.profile?.personalInfo || {};
        const resumePersonal = profile?.resume?.personalInfo || {};
        const answers = profile?.answers || {};
        const professionalLinks = personal.professionalLinks || nestedPersonal.professionalLinks || {};
        const locationFromAnswers = [
          answers.city,
          answers.stateProvince || answers.state,
          answers.country,
        ].filter(Boolean).join(', ');
        const fullName = pickProfileValue(
          candidate.fullName,
          candidate.name,
          candidate.full_name,
          personal.fullName,
          personal.name,
          nestedPersonal.fullName,
          resumePersonal.fullName,
          answers.fullName
        );
        const split = splitFullName(fullName);
        const firstName = pickProfileValue(
          candidate.firstName,
          candidate.givenName,
          personal.firstName,
          nestedPersonal.firstName,
          resumePersonal.firstName,
          answers.firstName,
          split.firstName
        );
        const lastName = pickProfileValue(
          candidate.lastName,
          candidate.familyName,
          candidate.surname,
          personal.lastName,
          nestedPersonal.lastName,
          resumePersonal.lastName,
          answers.lastName,
          split.lastName
        );

        return {
          ...candidate,
          fullName: fullName || [firstName, lastName].filter(Boolean).join(' '),
          firstName,
          lastName,
          email: pickProfileValue(candidate.email, personal.email, nestedPersonal.email, resumePersonal.email, answers.email),
          phone: pickProfileValue(candidate.phone, candidate.phoneNumber, personal.phone, personal.phoneNumber, nestedPersonal.phone, resumePersonal.phone, answers.phone),
          location: pickProfileValue(candidate.location, personal.location, nestedPersonal.location, resumePersonal.location, answers.location, locationFromAnswers),
          linkedin: pickProfileValue(candidate.linkedin, professionalLinks.linkedin, personal.linkedin, nestedPersonal.linkedin, resumePersonal.linkedin, answers.linkedinUrl),
          github: pickProfileValue(candidate.github, professionalLinks.github, personal.github, nestedPersonal.github, resumePersonal.github, answers.githubUrl),
          portfolio: pickProfileValue(candidate.portfolio, professionalLinks.portfolio, professionalLinks.other, personal.portfolio, nestedPersonal.portfolio, resumePersonal.portfolio, answers.portfolioUrl),
          website: pickProfileValue(candidate.website, professionalLinks.website, professionalLinks.portfolio, personal.website, nestedPersonal.website, resumePersonal.website, answers.websiteUrl),
          currentTitle: pickProfileValue(candidate.currentTitle, candidate.jobTitle, answers.currentTitle),
          currentCompany: pickProfileValue(candidate.currentCompany, answers.currentCompany),
        };
      };
      const phoneFieldPattern = /phone|mobile|cell|telephone|tel\\b|contact number|contact no|whatsapp|numer telefonu|telefon|telefone|telefono|num(?:e|\\u00e9)ro/i;
      const resumeUploadPattern = /resume|cv|curriculum|attachment|upload|select the attachment|zalacznik|za\\u0142\\u0105cznik|plik|dodaj plik/i;
      const isVisible = (field) => field?.type === 'file'
        ? true
        : !!(field && (field.offsetWidth || field.offsetHeight || field.getClientRects().length));
      const collectRoots = () => {
        const roots = [];
        const visited = new Set();
        const visit = (root) => {
          if (!root || visited.has(root) || !root.querySelectorAll) return;
          visited.add(root);
          roots.push(root);
          for (const node of root.querySelectorAll('*')) {
            if (node?.shadowRoot) visit(node.shadowRoot);
          }
        };
        visit(document);
        return roots;
      };
      const queryAll = (selector) => collectRoots().flatMap((root) => Array.from(root.querySelectorAll(selector)));
      const getFieldSearchRoots = (field) => {
        const roots = [];
        const seen = new Set();
        const push = (root) => {
          if (!root || seen.has(root)) return;
          seen.add(root);
          roots.push(root);
        };
        push(field?.getRootNode?.());
        push(field?.ownerDocument);
        return roots;
      };
      const queryFieldRoots = (field, selector) => {
        const results = [];
        const seen = new Set();
        for (const root of getFieldSearchRoots(field)) {
          if (!root?.querySelectorAll) continue;
          for (const match of root.querySelectorAll(selector)) {
            if (seen.has(match)) continue;
            seen.add(match);
            results.push(match);
          }
        }
        return results;
      };
      const GENERIC_FIELD_LABEL_PATTERN = /^(select|select\\.{3}|choose|choose\\.{3}|search|loading|optional|required)$/i;
      const cleanFieldLabelCandidate = (value = '', field = null) => {
        let text = cleanText(value)
          .replace(/\\b(?:select|choose|search)(?:\\s*\\.\\.\\.)?\\b/gi, ' ')
          .replace(/\\b(optional|required)\\b/gi, ' ');
        const fieldValue = cleanText(field?.value || field?.textContent || '');
        if (fieldValue && fieldValue.length <= 80) {
          text = text.split(fieldValue).join(' ');
        }
        return cleanText(text).replace(/\\s{2,}/g, ' ');
      };
      const isUsableFieldLabelCandidate = (value = '') => {
        const text = cleanText(value);
        const normalized = normalize(text);
        return Boolean(normalized)
          && normalized.length > 1
          && text.length <= 260
          && !GENERIC_FIELD_LABEL_PATTERN.test(normalized);
      };
      const getNearbyQuestionText = (field) => {
        const fieldRect = field?.getBoundingClientRect?.();
        if (!fieldRect || !fieldRect.width && !fieldRect.height) return '';
        const root = field.getRootNode?.() || field.ownerDocument || document;
        const candidates = [];
        const seen = new Set();
        const pushCandidate = (element, scoreBias = 0) => {
          if (!element || element === field || seen.has(element)) return;
          seen.add(element);
          if (element.contains?.(field)) return;
          if (!element.getClientRects?.().length) return;
          const controlCount = element.querySelectorAll?.('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button')?.length || 0;
          if (controlCount > 0) return;
          const rect = element.getBoundingClientRect?.();
          if (!rect || !rect.width && !rect.height) return;
          const text = cleanFieldLabelCandidate(
            element.getAttribute?.('aria-label') || element.getAttribute?.('title') || element.textContent || '',
            field
          );
          if (!isUsableFieldLabelCandidate(text)) return;
          const verticalDistance = fieldRect.top - rect.bottom;
          const sameLineDistance = Math.abs(fieldRect.top - rect.top);
          const horizontalGap = Math.max(0, Math.max(rect.left - fieldRect.right, fieldRect.left - rect.right));
          const overlapsHorizontally = rect.right >= fieldRect.left - 48 && rect.left <= fieldRect.right + 48;
          const sameRowLabel = sameLineDistance <= 24 && rect.right <= fieldRect.left + 12 && horizontalGap <= 260;
          const aboveLabel = verticalDistance >= -6 && verticalDistance <= 170 && (overlapsHorizontally || horizontalGap <= 90);
          if (!sameRowLabel && !aboveLabel) return;
          const questionBonus = /[?*]$/.test(text) || /^(why|how|what|when|where|are|will|do|does|can|please|briefly)\\b/i.test(text)
            ? -45
            : 0;
          const shortBonus = text.length <= 120 ? -10 : 0;
          const score = Math.max(0, verticalDistance) + horizontalGap * 0.25 + scoreBias + questionBonus + shortBonus;
          candidates.push({ text, score });
        };
        let cursor = field;
        for (let depth = 0; depth < 4 && cursor; depth += 1) {
          let sibling = cursor.previousElementSibling;
          for (let index = 0; index < 4 && sibling; index += 1) {
            pushCandidate(sibling, depth * 30 + index * 10);
            sibling = sibling.previousElementSibling;
          }
          cursor = cursor.parentElement;
        }
        if (root?.querySelectorAll) {
          const selectors = 'label, legend, p, span, div, h1, h2, h3, h4, [data-testid], [data-test], [data-cy], [aria-label]';
          for (const element of root.querySelectorAll(selectors)) {
            pushCandidate(element, 80);
          }
        }
        return candidates.sort((left, right) => left.score - right.score)[0]?.text || '';
      };
      const getLabelText = (field) => {
        const parts = [];
        if (field.id) {
          try {
            for (const linkedLabel of queryFieldRoots(field, \`label[for="\${CSS.escape(field.id)}"]\`)) {
              if (linkedLabel?.textContent) parts.push(linkedLabel.textContent);
            }
          } catch {}
        }
        const wrappingLabel = field.closest('label');
        if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);
        const parentLabel = field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form, [data-testid*="attachment"], [class*="marginY--"], [class*="fieldWrapper"]');
        if (parentLabel?.textContent) parts.push(parentLabel.textContent);
        const labelledBy = cleanText(field.getAttribute('aria-labelledby') || '');
        if (labelledBy) {
          const labelledText = labelledBy
            .split(/\\s+/)
            .map((id) => queryFieldRoots(field, \`#\${CSS.escape(id)}\`)[0]?.textContent || '')
            .filter(Boolean)
            .join(' ');
          if (labelledText) parts.push(labelledText);
        }
        if (field.getAttribute('aria-label')) parts.push(field.getAttribute('aria-label'));
        if (field.getAttribute('placeholder')) parts.push(field.getAttribute('placeholder'));
        if (field.name) parts.push(field.name);
        if (field.id) parts.push(field.id);
        parts.push(getNearbyQuestionText(field));
        return normalize(parts
          .map((part) => cleanFieldLabelCandidate(part, field))
          .filter(isUsableFieldLabelCandidate)
          .join(' '));
      };
      const setNativeValue = (field, property, value) => {
        const view = field?.ownerDocument?.defaultView || window;
        const prototypes = [];
        if (field?.tagName === 'INPUT') prototypes.push(view.HTMLInputElement?.prototype);
        else if (field?.tagName === 'TEXTAREA') prototypes.push(view.HTMLTextAreaElement?.prototype);
        else if (field?.tagName === 'SELECT') prototypes.push(view.HTMLSelectElement?.prototype);
        prototypes.push(Object.getPrototypeOf(field));
        for (const proto of prototypes) {
          if (!proto) continue;
          const descriptor = Object.getOwnPropertyDescriptor(proto, property);
          if (descriptor?.set) {
            descriptor.set.call(field, value);
            return;
          }
        }
        field[property] = value;
      };
      const dispatchFieldEvents = (field) => {
        const EventCtor = field?.ownerDocument?.defaultView?.Event || Event;
        ['input', 'change', 'blur'].forEach((eventName) => {
          field.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
        });
      };
      const buildCandidatePitch = (profile = {}) => {
        const candidate = buildNormalizedCandidate(profile);
        const topSkills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).slice(0, 4) : [];
        const intro = [
          candidate.currentTitle ? \`I am a \${candidate.currentTitle}\` : 'I am a candidate',
          candidate.currentCompany ? \`currently working at \${candidate.currentCompany}\` : '',
          candidate.location ? \`based in \${candidate.location}\` : '',
        ].filter(Boolean).join(' ');
        const skills = topSkills.length > 0 ? \`My strongest areas include \${topSkills.join(', ')}.\` : '';
        return cleanText([intro, skills].filter(Boolean).join(' ')).slice(0, 900);
      };
      const resolveFieldValue = (meta, profile = {}) => {
        const candidate = buildNormalizedCandidate(profile);
        const answers = profile?.answers || {};
        const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
        const candidatePitch = buildCandidatePitch(profile);
        if (/first name|given name/.test(meta)) return candidate.firstName;
        if (/last name|surname|family name/.test(meta)) return candidate.lastName;
        if (/full name|your name|applicant name/.test(meta)) return candidate.fullName;
        if (/email|\\b[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}\\b/.test(meta)) return candidate.email;
        if (phoneFieldPattern.test(meta)) return candidate.phone;
        if (/work authorization|authorized to work|legally authorized/.test(meta)) return answers.workAuthorization;
        if (/sponsor|sponsorship|visa|h[- ]?1b|work permit/.test(meta)) return answers.requiresSponsorship;
        if (/city/.test(meta)) return locationParts[0] || candidate.location;
        if (/\\bstate\\b|\\bprovince\\b/.test(meta)) return answers.stateProvince || answers.state;
        if (/country|region/.test(meta)) return locationParts.at(-1) || candidate.location;
        if (/location|address/.test(meta)) return candidate.location;
        if (/linkedin/.test(meta)) return candidate.linkedin || answers.linkedinUrl;
        if (/github/.test(meta)) return candidate.github || answers.githubUrl;
        if (/portfolio/.test(meta)) return candidate.portfolio || answers.portfolioUrl;
        if (/website|personal site/.test(meta)) return candidate.website || answers.websiteUrl;
        if (/current company|current employer|present employer|employer name/.test(meta)) return answers.currentCompany;
        if (/current title|job title|current role/.test(meta)) return answers.currentTitle;
        if (/18 years|age or older|over 18|at least 18/.test(meta)) return answers.isAdult || answers.ageOver18 || 'Yes';
        if (/years.*experience|experience.*years/.test(meta)) return answers.yearsOfExperience;
        if (/salary|compensation|expected pay|pay expectation/.test(meta)) return answers.salaryExpectation;
        if (/work setup|work model|remote|hybrid|on-site|onsite/.test(meta)) return answers.preferredWorkSetup;
        if (/cover letter|message to the hiring team|about you|tell us about yourself|about your background|changing your career|learning software development|why (?:are you interested|this role|do you want)/.test(meta)) return candidatePitch;
        if (/summary|professional summary|candidate summary/.test(meta)) return candidatePitch;
        if (/available|start date|notice period/.test(meta)) return answers.noticePeriod || 'Two weeks notice';
        return null;
      };
      const setFieldValue = (field, value) => {
        if (!field || value === undefined || value === null || value === '' || !isVisible(field)) return false;
        const tag = field.tagName.toLowerCase();
        if (tag === 'select') {
          const wanted = normalize(value);
          const option = Array.from(field.options).find((entry) => (
            normalize(entry.textContent || '').includes(wanted)
            || normalize(entry.value || '').includes(wanted)
            || wanted.includes(normalize(entry.textContent || ''))
          ));
          if (!option) return false;
          setNativeValue(field, 'value', option.value);
          dispatchFieldEvents(field);
          return true;
        }
        if (field.type === 'checkbox') {
          setNativeValue(field, 'checked', /^(true|yes|1)$/i.test(\`\${value}\`));
          dispatchFieldEvents(field);
          return true;
        }
        if (field.type === 'radio') {
          const wanted = normalize(value);
          const candidates = queryFieldRoots(field, \`input[type="radio"][name="\${CSS.escape(field.name || '')}"]\`);
          const target = candidates.find((entry) => normalize(entry.value || '') === wanted)
            || candidates.find((entry) => getLabelText(entry).includes(wanted));
          if (!target) return false;
          candidates.forEach((entry) => setNativeValue(entry, 'checked', entry === target));
          dispatchFieldEvents(target);
          return true;
        }
        field.focus?.();
        setNativeValue(field, 'value', value);
        dispatchFieldEvents(field);
        return true;
      };
      const findResumeInput = () => {
        const fileInputs = queryAll('input[type="file"]');
        if (fileInputs.length === 1) return fileInputs[0];
        return fileInputs.find((input) => {
          const meta = cleanText([
            getLabelText(input),
            input.closest('[data-testid*="attachment"], .field, .application-field, .form-field, .posting-requirement, fieldset, form')?.textContent || '',
            input.parentElement?.textContent || '',
            input.nextElementSibling?.textContent || '',
            input.previousElementSibling?.textContent || '',
          ].join(' '));
          return resumeUploadPattern.test(meta);
        }) || null;
      };
      const uploadResumeFile = async (input, profile = {}) => {
        const fileUrl = profile?.documents?.resumePdfUrl;
        if (!fileUrl || !input) return false;
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error('Could not download the signed resume PDF');
        const blob = await response.blob();
        const file = new File([blob], profile?.documents?.resumeFilename || 'ResumeATS_Resume.pdf', { type: 'application/pdf' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        dispatchFieldEvents(input);
        return true;
      };
      const discoverForm = () => {
        const fields = queryAll('input, textarea, select');
        const visibleFields = fields.filter((field) => field && field.type !== 'hidden' && isVisible(field));
        return {
          accessibleFieldCount: visibleFields.length,
          formCount: queryAll('form').length,
          resumeInputPresent: Boolean(findResumeInput()),
          fields: visibleFields.slice(0, 10).map((field) => ({
            tag: field.tagName,
            type: field.type || field.tagName.toLowerCase(),
            label: getLabelText(field),
            placeholder: field.getAttribute('placeholder') || '',
          })),
        };
      };
      const autofill = async (profile = {}) => {
        const fields = queryAll('input, textarea, select').filter((field) => field && field.type !== 'hidden' && isVisible(field));
        let filledCount = 0;
        let labeledFieldCount = 0;
        let mappableFieldCount = 0;
        const processedRadioNames = new Set();
        for (const field of fields) {
          const meta = getLabelText(field);
          if (meta) labeledFieldCount += 1;
          if (!meta || field.type === 'file') continue;
          if (field.type === 'radio' && processedRadioNames.has(field.name || '')) continue;
          if (field.type === 'radio' && field.name) processedRadioNames.add(field.name);
          const value = resolveFieldValue(meta, profile);
          if (value !== null && value !== undefined && value !== '') mappableFieldCount += 1;
          if (value && setFieldValue(field, value)) filledCount += 1;
        }
        const resumeInput = findResumeInput();
        if (resumeInput && !resumeInput.files?.length) {
          const uploaded = await uploadResumeFile(resumeInput, profile);
          if (uploaded) filledCount += 1;
        }
        return {
          ok: true,
          usedPageBridge: true,
          filledCount,
          accessibleFieldCount: fields.length,
          labeledFieldCount,
          mappableFieldCount,
          resumeInputPresent: Boolean(resumeInput),
        };
      };

      window.addEventListener('message', async (event) => {
        const message = event.data;
        if (event.source !== window || !message || message.source !== '${PAGE_BRIDGE_MESSAGE_SOURCE}' || message.target !== TARGET) return;
        let payload = null;
        let success = true;
        let error = '';
        try {
          if (message.type === 'RESUMEATS_PAGE_FORM_DISCOVERY') {
            payload = discoverForm();
          } else if (message.type === 'RESUMEATS_PAGE_AUTOFILL') {
            payload = await autofill(message.payload?.profile || {});
          } else {
            return;
          }
        } catch (err) {
          success = false;
          error = err?.message || String(err);
        }
        window.postMessage({
          source: SOURCE,
          target: '${PAGE_BRIDGE_RESPONSE_TARGET}',
          requestId: message.requestId,
          success,
          error,
          payload,
        }, '*');
      });
    })();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  };

  const requestPageWorldFormBridge = (type, payload = null, timeoutMs = 20000) => new Promise((resolve, reject) => {
    ensurePageWorldFormBridge();
    ensureInlinePageWorldFormBridge();
    const requestId = `resumeats-page-bridge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let timeoutId = null;

    const handleMessage = (event) => {
      const message = event.data;
      if (
        event.source !== window ||
        !message ||
        message.source !== PAGE_BRIDGE_RESPONSE_SOURCE ||
        message.target !== PAGE_BRIDGE_RESPONSE_TARGET ||
        message.requestId !== requestId
      ) {
        return;
      }

      window.removeEventListener('message', handleMessage);
      if (timeoutId) clearTimeout(timeoutId);

      if (!message.success) {
        reject(new Error(message.error || `${type} failed`));
        return;
      }

      resolve(message.payload || null);
    };

    window.addEventListener('message', handleMessage);
    timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error(`${type} timed out`));
    }, timeoutMs);

    window.postMessage({
      source: PAGE_BRIDGE_MESSAGE_SOURCE,
      target: PAGE_BRIDGE_MESSAGE_TARGET,
      type,
      requestId,
      payload,
    }, '*');
  });

  const queryFieldRoots = (field, selector) => {
    const results = [];
    const seen = new Set();

    for (const root of getFieldSearchRoots(field)) {
      if (!root?.querySelectorAll) continue;
      for (const match of root.querySelectorAll(selector)) {
        if (seen.has(match)) continue;
        seen.add(match);
        results.push(match);
      }
    }

    return results;
  };

  const GENERIC_FIELD_LABEL_PATTERN = /^(select|select\.{3}|choose|choose\.{3}|search|loading|optional|required)$/i;

  const cleanFieldLabelCandidate = (value = '', field = null) => {
    let text = cleanText(value)
      .replace(/\b(?:select|choose|search)(?:\s*\.\.\.)?\b/gi, ' ')
      .replace(/\b(optional|required)\b/gi, ' ');

    const fieldValue = cleanText(field?.value || field?.textContent || '');
    if (fieldValue && fieldValue.length <= 80) {
      text = text.split(fieldValue).join(' ');
    }

    return cleanText(text).replace(/\s{2,}/g, ' ');
  };

  const isUsableFieldLabelCandidate = (value = '') => {
    const text = cleanText(value);
    const normalized = normalize(text);
    return Boolean(normalized)
      && normalized.length > 1
      && text.length <= 260
      && !GENERIC_FIELD_LABEL_PATTERN.test(normalized);
  };

  const getNearbyQuestionText = (field) => {
    const fieldRect = field?.getBoundingClientRect?.();
    if (!fieldRect || !fieldRect.width && !fieldRect.height) return '';

    const root = field.getRootNode?.() || field.ownerDocument || document;
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (element, scoreBias = 0) => {
      if (!element || element === field || seen.has(element)) return;
      seen.add(element);
      if (element.contains?.(field)) return;
      if (!element.getClientRects?.().length) return;

      const controlCount = element.querySelectorAll?.('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button')?.length || 0;
      if (controlCount > 0) return;

      const rect = element.getBoundingClientRect?.();
      if (!rect || !rect.width && !rect.height) return;

      const text = cleanFieldLabelCandidate(
        element.getAttribute?.('aria-label')
          || element.getAttribute?.('title')
          || element.textContent
          || '',
        field
      );
      if (!isUsableFieldLabelCandidate(text)) return;

      const verticalDistance = fieldRect.top - rect.bottom;
      const sameLineDistance = Math.abs(fieldRect.top - rect.top);
      const horizontalGap = Math.max(0, Math.max(rect.left - fieldRect.right, fieldRect.left - rect.right));
      const overlapsHorizontally = rect.right >= fieldRect.left - 48 && rect.left <= fieldRect.right + 48;
      const sameRowLabel = sameLineDistance <= 24 && rect.right <= fieldRect.left + 12 && horizontalGap <= 260;
      const aboveLabel = verticalDistance >= -6 && verticalDistance <= 170 && (overlapsHorizontally || horizontalGap <= 90);
      if (!sameRowLabel && !aboveLabel) return;

      const questionBonus = /[?*]$/.test(text) || /^(why|how|what|when|where|are|will|do|does|can|please|briefly)\b/i.test(text)
        ? -45
        : 0;
      const shortBonus = text.length <= 120 ? -10 : 0;
      const score = Math.max(0, verticalDistance) + horizontalGap * 0.25 + scoreBias + questionBonus + shortBonus;
      candidates.push({ text, score });
    };

    let cursor = field;
    for (let depth = 0; depth < 4 && cursor; depth += 1) {
      let sibling = cursor.previousElementSibling;
      for (let index = 0; index < 4 && sibling; index += 1) {
        pushCandidate(sibling, depth * 30 + index * 10);
        sibling = sibling.previousElementSibling;
      }
      cursor = cursor.parentElement;
    }

    if (root?.querySelectorAll) {
      const selectors = 'label, legend, p, span, div, h1, h2, h3, h4, [data-testid], [data-test], [data-cy], [aria-label]';
      for (const element of root.querySelectorAll(selectors)) {
        pushCandidate(element, 80);
      }
    }

    return candidates.sort((left, right) => left.score - right.score)[0]?.text || '';
  };

  const getLabelText = (field) => {
    const parts = [];

    if (field.id) {
      try {
        for (const linkedLabel of queryFieldRoots(field, `label[for="${CSS.escape(field.id)}"]`)) {
          if (linkedLabel?.textContent) parts.push(linkedLabel.textContent);
        }
      } catch {
        // Ignore invalid CSS escape cases.
      }
    }

    const wrappingLabel = field.closest('label');
    if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);

    const parentLabel = field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form, [class*="marginY--"], [class*="fieldWrapper"]');
    if (parentLabel?.textContent) parts.push(parentLabel.textContent);

    const labelledBy = cleanText(field.getAttribute('aria-labelledby') || '');
    if (labelledBy) {
      const labelledText = labelledBy
        .split(/\s+/)
        .map((id) => queryFieldRoots(field, `#${CSS.escape(id)}`)[0]?.textContent || '')
        .filter(Boolean)
        .join(' ');
      if (labelledText) parts.push(labelledText);
    }

    if (field.getAttribute('aria-label')) parts.push(field.getAttribute('aria-label'));
    if (field.getAttribute('placeholder')) parts.push(field.getAttribute('placeholder'));
    if (field.name) parts.push(field.name);
    if (field.id) parts.push(field.id);

    parts.push(getNearbyQuestionText(field));

    return normalize(
      parts
        .map((part) => cleanFieldLabelCandidate(part, field))
        .filter(isUsableFieldLabelCandidate)
        .join(' ')
    );
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

  const getSearchContexts = () => {
    const contexts = [];
    const visitedRoots = new Set();
    const visitedDocuments = new Set();
    let crossOriginFrameCount = 0;

    const visitRoot = (root) => {
      if (!root || visitedRoots.has(root) || isExtensionWidgetHost(root)) return;
      visitedRoots.add(root);
      contexts.push(root);

      const nodes = Array.from(root.querySelectorAll('*'));
      for (const node of nodes) {
        if (isExtensionWidgetHost(node)) continue;
        if (node?.shadowRoot) {
          visitRoot(node.shadowRoot);
        }

        if (node?.tagName === 'IFRAME') {
          try {
            const frameDocument = node.contentDocument;
            if (frameDocument) {
              visitDocument(frameDocument);
            }
          } catch {
            crossOriginFrameCount += 1;
          }
        }
      }
    };

    const visitDocument = (doc) => {
      if (!doc || visitedDocuments.has(doc)) return;
      visitedDocuments.add(doc);
      visitRoot(doc);
    };

    visitDocument(document);

    return {
      contexts,
      crossOriginFrameCount,
    };
  };

  const queryAllAcrossContexts = (selector) => (
    getSearchContexts().contexts.flatMap((root) => Array.from(root.querySelectorAll(selector)))
  );

  const hasPageWorldApplicationHost = () => (
    provider === 'manatal' && Boolean(document.querySelector('#application-root'))
  );

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
    const EventCtor = field?.ownerDocument?.defaultView?.Event || Event;
    ['input', 'change', 'blur'].forEach((eventName) => {
      field.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
    });
  };

  const dispatchInputEvents = (field) => {
    const EventCtor = field?.ownerDocument?.defaultView?.Event || Event;
    ['input', 'change'].forEach((eventName) => {
      field.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
    });
  };

  const setNativeValue = (field, property, value) => {
    const view = field?.ownerDocument?.defaultView || window;
    const prototypeChain = [];

    if (field?.tagName === 'INPUT') {
      prototypeChain.push(view.HTMLInputElement?.prototype);
    } else if (field?.tagName === 'TEXTAREA') {
      prototypeChain.push(view.HTMLTextAreaElement?.prototype);
    } else if (field?.tagName === 'SELECT') {
      prototypeChain.push(view.HTMLSelectElement?.prototype);
    }

    prototypeChain.push(Object.getPrototypeOf(field));

    for (const proto of prototypeChain) {
      if (!proto) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, property);
      if (descriptor?.set) {
        descriptor.set.call(field, value);
        return true;
      }
    }

    field[property] = value;
    return true;
  };

  const isCustomChoiceControl = (field) => {
    if (!field) return false;
    const role = normalize(field.getAttribute?.('role') || '');
    const ariaHasPopup = normalize(field.getAttribute?.('aria-haspopup') || '');
    const className = normalize(field.className || '');
    const tag = field.tagName?.toLowerCase?.() || '';
    return role === 'combobox'
      || role === 'listbox'
      || ariaHasPopup === 'listbox'
      || className.includes('select__input')
      || className.includes('select-input')
      || (tag === 'button' && /select|choose|dropdown|combobox/.test(className));
  };

  const getFieldIdentity = (field) => normalize([
    field?.name,
    field?.id,
    field?.getAttribute?.('aria-label'),
    field?.getAttribute?.('autocomplete'),
    field?.getAttribute?.('placeholder'),
    field?.getAttribute?.('title'),
    field?.className,
  ].filter(Boolean).join(' '));

  const getHiresomeFieldHint = (field) => {
    const identity = getFieldIdentity(field);
    if (/react-select-hs-ls-a-input/.test(identity)) return 'country';
    if (/react-select-hs-ls-b-input/.test(identity)) return 'state region province';
    if (/react-select-hs-ls-c-input/.test(identity)) return 'city town';
    if (/react-select-2-input/.test(identity)) return 'current salary currency';
    if (/react-select-3-input/.test(identity)) return 'expected salary currency';
    return '';
  };

  const isPhoneCountrySelector = (field) => {
    if (!field) return false;
    const identity = getFieldIdentity(field);
    const className = normalize(field.className || '');
    if (className.includes('react-international-phone-country-selector')) return true;
    if (!/country selector|calling code|phone country|country code/.test(identity)) return false;

    const nearbyRoot = field.closest?.('.react-international-phone-input-container')
      || field.parentElement?.parentElement
      || field.parentElement;
    return Boolean(nearbyRoot?.querySelector?.('input[type="tel"], input[name*="phone"], input[class*="phone"]'));
  };

  const isPhoneInputField = (field) => {
    if (!field) return false;
    const tag = field.tagName?.toLowerCase?.() || '';
    if (tag !== 'input' && tag !== 'textarea') return false;
    const identity = getFieldIdentity(field);
    if (isPhoneCountrySelector(field) || /phone.*(?:country|calling).*code|(?:country|calling).*code.*phone/.test(identity)) return false;
    return field.type === 'tel'
      || PHONE_FIELD_PATTERN.test(identity)
      || normalize(field.className || '').includes('react-international-phone-input');
  };

  const hasOnlyPhoneCountryPrefix = (field, currentValue = '', desiredValue = '') => {
    if (!isPhoneInputField(field)) return false;
    const currentDigits = cleanText(currentValue).replace(/\D/g, '');
    const desiredDigits = cleanText(desiredValue).replace(/\D/g, '');
    return Boolean(currentDigits)
      && desiredDigits.length > currentDigits.length
      && currentDigits.length <= 4;
  };

  const resolveSalaryCurrency = (answers = {}) => {
    const explicit = cleanText(answers.salaryCurrency || answers.compensationCurrency || answers.expectedSalaryCurrency || '');
    if (explicit) return explicit;

    const salaryText = cleanText(answers.salaryExpectation || answers.expectedSalary || answers.currentSalary || '');
    if (/\bpln\b|zloty|z\u0142|\bz\u0142\b/i.test(salaryText)) return 'PLN';
    if (/\beur\b|€|euro/i.test(salaryText)) return 'EUR';
    if (/\bgbp\b|£|pound/i.test(salaryText)) return 'GBP';
    if (/\binr\b|₹|rupee/i.test(salaryText)) return 'INR';
    return 'USD';
  };

  const scoreOptionMatch = (optionText, desiredValue) => {
    const option = normalize(optionText);
    const desired = normalize(desiredValue);
    if (!option || !desired) return 0;
    const optionPhoneCode = extractPhoneCountryCode(optionText);
    const desiredPhoneCode = extractPhoneCountryCode(desiredValue);
    if (desiredPhoneCode && optionPhoneCode && desiredPhoneCode === optionPhoneCode) return 98;
    if (option === desired) return 100;
    if (option.startsWith(desired) || desired.startsWith(option)) return 92;
    const aliasScore = scoreAliasMatch(option, desired);
    if (aliasScore > 0) return aliasScore;
    const sensitiveShortAnswer = /^(male|man|men|m|female|woman|women|f)$/i.test(cleanText(desiredValue));
    if (!sensitiveShortAnswer && (option.includes(desired) || desired.includes(option))) return 84;

    const disclosureOptOut = [
      'prefer not',
      'decline',
      'choose not',
      'do not wish',
      "don't wish",
      'not disclose',
      'not wish',
      'no answer',
      'rather not',
    ];
    if (/prefer not|decline|choose not|do not wish|don't wish|not disclose|rather not/.test(desired)
      && disclosureOptOut.some((token) => option.includes(token))) {
      return 90;
    }

    const positive = /^(true|yes|y|1)$/i.test(`${desiredValue}`) ? ['yes', 'true', 'authorized', 'eligible', 'i agree', 'agree'] : [];
    const negative = /^(false|no|n|0)$/i.test(`${desiredValue}`) ? [
      'no',
      'false',
      'not authorized',
      'do not',
      'decline',
      'not protected veteran',
      'not a protected veteran',
      "don't have a disability",
      'do not have a disability',
    ] : [];
    if (positive.some((token) => option.includes(token))) return 88;
    if (negative.some((token) => option.includes(token))) return 88;

    const desiredTokens = new Set(desired.split(/[^a-z0-9]+/).filter((token) => token.length > 1));
    const optionTokens = option.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
    if (desiredTokens.size === 0 || optionTokens.length === 0) return 0;

    const overlap = optionTokens.filter((token) => desiredTokens.has(token)).length;
    return overlap > 0 ? Math.round((overlap / Math.max(desiredTokens.size, optionTokens.length)) * 72) : 0;
  };

  const pickBestOption = (options, desiredValue) => (
    options
      .map((option) => ({
        ...option,
        score: scoreOptionMatch(option.text, desiredValue),
      }))
      .sort((left, right) => right.score - left.score)[0] || null
  );

  const optionLooksSelectable = (element) => {
    if (!element || !isVisible(element) || element.getAttribute('aria-disabled') === 'true') return false;
    const nestedOptionCount = element.querySelectorAll?.('[role="option"], [role="menuitem"], [cmdk-item], [data-radix-collection-item], [data-select-item], li[aria-selected]')?.length || 0;
    if (nestedOptionCount > 1) return false;
    const text = cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
    return Boolean(text)
      && text.length <= 180
      && !/^(select|choose|loading|no options|no results)$/i.test(text);
  };

  const getComboboxRoots = (field) => {
    const roots = getFieldSearchRoots(field);
    const doc = field?.ownerDocument || document;
    roots.push(doc);
    return Array.from(new Set(roots.filter(Boolean)));
  };

  const collectCustomChoiceOptions = (field) => {
    if (!field) return [];
    const selectors = [
      '[role="option"]',
      '[role="listbox"] [role="presentation"]',
      '[role="menu"] [role="menuitem"]',
      '[cmdk-item]',
      '[data-radix-collection-item]',
      '[data-select-item]',
      '[data-value]',
      '.select__option',
      '.Select-option',
      '[class*="option"]',
      '[data-testid*="option"]',
      '[data-test*="option"]',
      'li[role="option"]',
      'li[aria-selected]',
    ];
    const controlsId = cleanText(field.getAttribute?.('aria-controls') || field.getAttribute?.('aria-owns') || '');
    const scopedSelectors = controlsId
      ? [`#${CSS.escape(controlsId)} [role="option"]`, `#${CSS.escape(controlsId)} li`, `#${CSS.escape(controlsId)} [cmdk-item]`, `#${CSS.escape(controlsId)} [data-value]`, `#${CSS.escape(controlsId)} [class*="option"]`]
      : [];
    const seen = new Set();
    const options = [];

    for (const root of getComboboxRoots(field)) {
      if (!root?.querySelectorAll) continue;
      for (const selector of [...scopedSelectors, ...selectors]) {
        let matches = [];
        try {
          matches = Array.from(root.querySelectorAll(selector));
        } catch {
          matches = [];
        }

        for (const element of matches) {
          if (seen.has(element) || !optionLooksSelectable(element)) continue;
          seen.add(element);
          options.push({
            element,
            text: cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('data-value') || element.getAttribute('value') || ''),
          });
        }
      }
    }

    return options.filter((option, index, all) => (
      all.findIndex((entry) => normalize(entry.text) === normalize(option.text)) === index
    ));
  };

  const openCustomChoiceControl = async (field, searchValue = '') => {
    field.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    field.focus?.();
    field.click?.();
    await delay(140);

    if (field.tagName?.toLowerCase?.() === 'input' && searchValue) {
      setNativeValue(field, 'value', '');
      dispatchInputEvents(field);
      setNativeValue(field, 'value', searchValue);
      dispatchInputEvents(field);
      await delay(400);
    }

    const deadline = Date.now() + (searchValue ? 1600 : 900);
    let options = collectCustomChoiceOptions(field);
    while (options.length === 0 && Date.now() < deadline) {
      await delay(180);
      options = collectCustomChoiceOptions(field);
    }

    return options;
  };

  const selectCustomChoiceOption = (option) => {
    const element = option?.element;
    if (!element) return false;
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    const view = element.ownerDocument?.defaultView || window;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
      const EventCtor = eventName.startsWith('pointer') ? view.PointerEvent || view.MouseEvent : view.MouseEvent;
      element.dispatchEvent(new EventCtor(eventName, { bubbles: true, cancelable: true, view }));
    });
    return true;
  };

  const setCustomChoiceValue = async (field, value) => {
    if (!isCustomChoiceControl(field)) return false;

    let options = await openCustomChoiceControl(field);
    if (options.length === 0) {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
    }

    let best = pickBestOption(options, value);
    if ((!best || best.score < 45) && field.tagName?.toLowerCase?.() === 'input') {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
      best = pickBestOption(options, value);
    }
    if (best?.score >= 45 && selectCustomChoiceOption(best)) {
      await delay(160);
      const view = field.ownerDocument?.defaultView || window;
      field.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      field.blur?.();
      dispatchFieldEvents(field);
      return true;
    }

    if (field.tagName?.toLowerCase?.() === 'input') {
      field.focus?.();
      setNativeValue(field, 'value', value);
      dispatchFieldEvents(field);
      const view = field.ownerDocument?.defaultView || window;
      field.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      field.dispatchEvent(new view.KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      return true;
    }

    return false;
  };

  const setFieldValue = async (field, value) => {
    if (!field || value === undefined || value === null || value === '') return false;
    if (!isVisible(field)) return false;

    const tag = field.tagName.toLowerCase();

    if (isCustomChoiceControl(field)) {
      return setCustomChoiceValue(field, value);
    }

    if (tag === 'select') {
      const option = Array.from(field.options)
        .map((entry) => ({
          entry,
          score: scoreOptionMatch(`${entry.textContent || ''} ${entry.value || ''}`, value),
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (!option || option.score < 45) return false;

      field.value = option.entry.value;
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'checkbox') {
      const shouldCheck = /^(true|yes|1)$/i.test(`${value}`);
      setNativeValue(field, 'checked', shouldCheck);
      dispatchFieldEvents(field);
      return true;
    }

    if (field.type === 'radio') {
      const candidates = queryFieldRoots(
        field,
        `input[type="radio"][name="${CSS.escape(field.name || '')}"]`
      );
      const target = candidates
        .map((entry) => ({
          entry,
          score: scoreOptionMatch(`${entry.value || ''} ${getLabelText(entry)}`, value),
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (!target || target.score < 45) return false;

      candidates.forEach((entry) => {
        setNativeValue(entry, 'checked', entry === target.entry);
      });

      if (!target.entry.checked) {
        setNativeValue(target.entry, 'checked', true);
      }

      dispatchFieldEvents(target.entry);
      return true;
    }

    field.focus?.();
    setNativeValue(field, 'value', value);
    dispatchFieldEvents(field);
    return true;
  };

  const getCurrentFieldValue = (field) => {
    if (!field) return '';
    if (field.type === 'checkbox' || field.type === 'radio') {
      return field.checked ? (field.value || 'true') : '';
    }
    if (field.tagName?.toLowerCase?.() === 'select') {
      return cleanText(field.selectedOptions?.[0]?.textContent || field.value || '');
    }
    if (isCustomChoiceControl(field)) {
      const roots = [
        field.closest?.('[class*="__control"], [class*="-control"]'),
        field.closest?.('[class*="__container"], [class*="-container"]'),
      ].filter(Boolean);
      for (const root of roots) {
        const selected = root.querySelector?.('[class*="single-value"], [class*="singleValue"], [aria-live] [class*="value"]');
        const selectedText = cleanText(selected?.textContent || '');
        if (selectedText) return selectedText;
      }
    }
    return cleanText(field.value || field.textContent || field.getAttribute?.('aria-label') || '');
  };

  const isFieldAlreadyFilled = (field) => {
    const value = normalize(getCurrentFieldValue(field));
    return Boolean(value) && !/^(select|select\.{3}|choose|choose\.{3}|search|loading|optional|required)$/.test(value);
  };

  const repairPhoneInputs = async (profile) => {
    const candidate = buildNormalizedCandidate(profile);
    if (!candidate.phone) return 0;

    let repairedCount = 0;
    for (const field of getVisibleFormFields()) {
      if (!isPhoneInputField(field)) continue;
      const currentValue = getCurrentFieldValue(field);
      if (!hasOnlyPhoneCountryPrefix(field, currentValue, candidate.phone)) continue;

      field.focus?.();
      setNativeValue(field, 'value', '');
      dispatchInputEvents(field);
      await delay(60);
      setNativeValue(field, 'value', candidate.phone);
      dispatchInputEvents(field);
      dispatchFieldEvents(field);
      await delay(180);

      if (!hasOnlyPhoneCountryPrefix(field, getCurrentFieldValue(field), candidate.phone)) {
        repairedCount += 1;
      }
    }

    return repairedCount;
  };

  const repairPhoneCountryFields = async (profile) => {
    const candidate = buildNormalizedCandidate(profile);
    const answers = profile?.answers || {};
    const phoneCountryCode = resolvePhoneCountryCode(answers, candidate);
    if (!phoneCountryCode) return 0;

    let repairedCount = 0;
    for (const field of getVisibleFormFields()) {
      const identity = getFieldIdentity(field);
      const tag = field.tagName?.toLowerCase?.() || '';
      const selectOptionsText = tag === 'select'
        ? Array.from(field.options || []).map((option) => `${option.value || ''} ${option.textContent || ''}`).join(' ')
        : '';
      const isPhoneCountryField = isPhoneCountrySelector(field)
        || /phone.*(?:country|calling).*code|(?:country|calling).*code.*phone/.test(identity)
        || (tag === 'select' && /phone|calling|country/.test(identity) && selectOptionsText.includes(phoneCountryCode));
      if (!isPhoneCountryField) continue;

      const currentValue = getCurrentFieldValue(field);
      if (currentValue && scoreOptionMatch(currentValue, phoneCountryCode) >= 80) continue;

      if (await setFieldValue(field, phoneCountryCode)) {
        repairedCount += 1;
        await delay(180);
      }
    }

    return repairedCount;
  };

  const fillHiresomeLocationFields = async (profile) => {
    if (!/hiresome\.ai$/i.test(window.location.hostname)) return 0;
    const candidate = buildNormalizedCandidate(profile);
    const answers = profile?.answers || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const steps = [
      ['#react-select-hs-ls-a-input', answers.country || locationParts.at(-1)],
      ['#react-select-hs-ls-b-input', answers.stateProvince || answers.state],
      ['#react-select-hs-ls-c-input', answers.city || locationParts[0]],
    ];

    let filled = 0;
    for (const [selector, value] of steps) {
      if (!value) continue;
      const field = queryAllAcrossContexts(selector)[0];
      if (!field || !isVisible(field)) continue;

      const currentValue = getCurrentFieldValue(field);
      if (currentValue && scoreOptionMatch(currentValue, value) >= 70) continue;

      if (await setFieldValue(field, value)) {
        filled += 1;
        await delay(1300);
      }
    }

    return filled;
  };

  const uploadResumeFile = async (input, profile) => {
    const fileUrl = profile?.documents?.resumePdfUrl;
    if (!fileUrl || !input) return false;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(fileUrl, { signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Timed out downloading the signed resume PDF');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
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
    const candidate = buildNormalizedCandidate(profile);
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

  const US_STATE_ABBREVIATIONS = {
    alabama: 'AL',
    alaska: 'AK',
    arizona: 'AZ',
    arkansas: 'AR',
    california: 'CA',
    colorado: 'CO',
    connecticut: 'CT',
    delaware: 'DE',
    'district of columbia': 'DC',
    florida: 'FL',
    georgia: 'GA',
    hawaii: 'HI',
    idaho: 'ID',
    illinois: 'IL',
    indiana: 'IN',
    iowa: 'IA',
    kansas: 'KS',
    kentucky: 'KY',
    louisiana: 'LA',
    maine: 'ME',
    maryland: 'MD',
    massachusetts: 'MA',
    michigan: 'MI',
    minnesota: 'MN',
    mississippi: 'MS',
    missouri: 'MO',
    montana: 'MT',
    nebraska: 'NE',
    nevada: 'NV',
    'new hampshire': 'NH',
    'new jersey': 'NJ',
    'new mexico': 'NM',
    'new york': 'NY',
    'north carolina': 'NC',
    'north dakota': 'ND',
    ohio: 'OH',
    oklahoma: 'OK',
    oregon: 'OR',
    pennsylvania: 'PA',
    'rhode island': 'RI',
    'south carolina': 'SC',
    'south dakota': 'SD',
    tennessee: 'TN',
    texas: 'TX',
    utah: 'UT',
    vermont: 'VT',
    virginia: 'VA',
    washington: 'WA',
    'west virginia': 'WV',
    wisconsin: 'WI',
    wyoming: 'WY',
  };

  const normalizeUsStateAnswer = (value = '') => {
    const text = cleanText(value);
    if (/^[a-z]{2}$/i.test(text)) return text.toUpperCase();
    return US_STATE_ABBREVIATIONS[normalize(text).replace(/\./g, '')] || text;
  };

  const resolveFieldValue = (meta, profile, field = null) => {
    const candidate = buildNormalizedCandidate(profile);
    const answers = profile?.answers || {};
    const education = profile?.education?.[0] || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const candidatePitch = buildCandidatePitch(profile);
    const phoneCountryCode = resolvePhoneCountryCode(answers, candidate);
    const fieldIdentity = getFieldIdentity(field);
    const fieldMeta = normalize([meta, fieldIdentity, getHiresomeFieldHint(field)].filter(Boolean).join(' '));
    const preferredLocation = Array.isArray(answers.preferredLocations) && answers.preferredLocations.length > 0
      ? cleanText(answers.preferredLocations[0])
      : cleanText(answers.preferredLocation || answers.preferredWorkLocation || '');

    if (/first name|given name/.test(fieldMeta)) return candidate.firstName;
    if (/last name|surname|family name/.test(fieldMeta)) return candidate.lastName;
    if (/full name|your name|applicant name/.test(fieldMeta)) return candidate.fullName;
    if (/^name(?:\s|$)|\bnameid\b|applicant name/.test(fieldMeta) && !/company|employer|referral|referred/.test(fieldMeta)) return candidate.fullName;
    if (/email|e-mail|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/.test(fieldMeta)) return candidate.email;
    if (isPhoneCountrySelector(field) || /phone.*(?:country|calling).*code|(?:country|calling).*code.*phone/.test(fieldIdentity)) return phoneCountryCode;
    if (/\bgender\b|\bsex\b/.test(fieldIdentity)) return answers.gender || 'Prefer not to answer';
    if (/\brace\b|ethnicity/.test(fieldIdentity)) return answers.raceEthnicity || 'Prefer not to answer';
    if (/hispanic|latino|latina|latinx/.test(fieldIdentity)) return answers.hispanicLatino || 'Prefer not to answer';
    if ((isCustomChoiceControl(field) || field?.tagName?.toLowerCase?.() === 'select') && PHONE_FIELD_PATTERN.test(fieldMeta)) return phoneCountryCode;
    if (PHONE_FIELD_PATTERN.test(fieldMeta)) return candidate.phone;
    if (/work authorization|authorized to work|legally authorized/.test(fieldMeta)) return answers.workAuthorization;
    if (/sponsor|sponsorship|visa|h[- ]?1b|work permit/.test(fieldMeta)) return answers.requiresSponsorship;
    if (/preferred location|preferredlocation|bevorzugter standort/.test(fieldMeta)) return preferredLocation || answers.preferredWorkSetup || candidate.location;
    if (/salary currency/.test(fieldMeta)) return resolveSalaryCurrency(answers);
    if (/current salary|current ctc|annualsalary|aktuelles gehalt/.test(fieldMeta)) return answers.currentSalary || answers.salaryCurrent;
    if (/expected.*salary|salary.*expect|expectedctc|erwartetes gehalt|compensation|expected pay|pay expectation/.test(fieldMeta)) return answers.salaryExpectation;
    if (/years.*experience|experience.*years|totalexperience|gesamte arbeitserfahrung/.test(fieldMeta)) return answers.yearsOfExperience;
    if (/highest degree|highest qualification|highestdegree|h\u00f6chste qualifikation|hoechste qualifikation/.test(fieldMeta)) return answers.highestEducation || education.degree;
    if (/available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/.test(fieldMeta)) return answers.noticePeriod || 'Two weeks notice';
    if (/current company|current employer|present employer|employer name|currentcompany|aktuelles unternehmen/.test(fieldMeta)) return answers.currentCompany || candidate.currentCompany;
    if (/current title|job title|current role|current designation|currentdesignation|aktuelle funktion/.test(fieldMeta)) return answers.currentTitle || candidate.currentTitle;
    if (/city|town/.test(fieldMeta)) return answers.city || locationParts[0] || candidate.location;
    if (/\bstate\b|\bprovince\b|state region/.test(fieldMeta)) return normalizeUsStateAnswer(answers.stateProvince || answers.state);
    if (/\bcountry\b/.test(fieldMeta)) return answers.country || locationParts.at(-1) || candidate.location;
    if (/\bregion\b/.test(fieldMeta)) return answers.stateProvince || answers.state || answers.country || locationParts.at(-1) || candidate.location;
    if (/location|standort|address/.test(fieldMeta)) return candidate.location;
    if (/linkedin/.test(fieldMeta)) return candidate.linkedin || answers.linkedinUrl;
    if (/github/.test(fieldMeta)) return candidate.github || answers.githubUrl;
    if (/portfolio/.test(fieldMeta)) return candidate.portfolio || answers.portfolioUrl;
    if (/website|personal site/.test(fieldMeta)) return candidate.website || answers.websiteUrl;
    if (/current company|current employer|present employer|employer name|aktuelles unternehmen/.test(fieldMeta)) return answers.currentCompany || candidate.currentCompany;
    if (/current title|job title|current role|current designation|currentdesignation|aktuelle funktion/.test(fieldMeta)) return answers.currentTitle || candidate.currentTitle;
    if (/18 years|age or older|over 18|at least 18/.test(fieldMeta)) return answers.isAdult || answers.ageOver18 || 'Yes';
    if (/years.*experience|experience.*years|totalexperience|gesamte arbeitserfahrung/.test(fieldMeta)) return answers.yearsOfExperience;
    if (/current salary|annualsalary|aktuelles gehalt/.test(fieldMeta)) return answers.currentSalary || answers.salaryCurrent;
    if (/expected.*salary|salary.*expect|expectedctc|erwartetes gehalt|compensation|expected pay|pay expectation/.test(fieldMeta)) return answers.salaryExpectation;
    if (/salary currency/.test(fieldMeta)) return resolveSalaryCurrency(answers);
    if (/work setup|work model|remote|hybrid|on-site|onsite/.test(fieldMeta)) return answers.preferredWorkSetup;
    if (/school|university|college/.test(fieldMeta)) return answers.school || education.institution;
    if (/highest degree|highest qualification|highestdegree|h\u00f6chste qualifikation|hoechste qualifikation/.test(fieldMeta)) return answers.highestEducation || education.degree;
    if (/degree.*pursu|pursuing.*degree/.test(fieldMeta)) return answers.degreePursuing || answers.highestEducation || education.degree;
    if (/degree/.test(fieldMeta)) return answers.highestEducation || education.degree;
    if (/course|class|certification/.test(fieldMeta)) return answers.relevantCourses;
    if (/hear about|heard about|source|how did you find|how did you learn/.test(fieldMeta)) return answers.heardAbout;
    if (/referred|referral/.test(fieldMeta) && /name|who/.test(fieldMeta)) return answers.referralName;
    if (/referred|referral/.test(fieldMeta)) return answers.referredByEmployee;
    if (/current.*employee|team member/.test(fieldMeta)) return answers.currentEmployee;
    if (/previous.*employee|ever.*employed|formerly.*employed/.test(fieldMeta)) return answers.previousEmployee;
    if (/previous.*company|previous.*employ|dates.*employ/.test(fieldMeta)) return answers.previousEmploymentDetails;
    if (/background.*check/.test(fieldMeta)) return answers.backgroundCheckConsent;
    if (/privacy|data retention|data processing|recruiting.*consent|consent/.test(fieldMeta)) return answers.privacyConsent;
    if (/accommodation/.test(fieldMeta)) return answers.accommodationRequest || 'No';
    if (/pronoun/.test(fieldMeta)) return answers.pronouns || 'Prefer not to answer';
    if (/gender/.test(fieldMeta)) return answers.gender || 'Prefer not to answer';
    if (/race|ethnicity/.test(fieldMeta)) return answers.raceEthnicity || 'Prefer not to answer';
    if (/hispanic|latino/.test(fieldMeta)) return answers.hispanicLatino || 'Prefer not to answer';
    if (/veteran/.test(fieldMeta)) return answers.veteranStatus || 'Prefer not to answer';
    if (/disability|disabled/.test(fieldMeta)) return answers.disabilityStatus || 'Prefer not to answer';
    if (/cover letter|message to the hiring team|about you|tell us about yourself|about your background|changing your career|learning software development|why (?:are you interested|this role|do you want)/.test(fieldMeta)) return candidatePitch;
    if (/summary|professional summary|candidate summary/.test(fieldMeta)) return candidatePitch;
    if (/available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/.test(fieldMeta)) return answers.noticePeriod || 'Two weeks notice';

    return null;
  };

  const SIMPLE_FIELD_PATTERNS = [
    /first name|given name/,
    /last name|surname|family name/,
    /full name|your name|applicant name|\bnameid\b|^name(?:\s|$)/,
    /email|e-mail/,
    PHONE_FIELD_PATTERN,
    /city|town/,
    /country|region|react-select-hs-ls-a-input|react-select-hs-ls-b-input|react-select-hs-ls-c-input/,
    /\bstate\b|\bprovince\b|state region/,
    /location|standort|address|preferredlocation|preferred location|bevorzugter standort/,
    /linkedin/,
    /github/,
    /portfolio/,
    /website|personal site/,
    /current company|current employer|present employer|employer name|currentcompany|aktuelles unternehmen/,
    /current title|job title|current role|current designation|currentdesignation|aktuelle funktion/,
    /work authorization|authorized to work|legally authorized/,
    /sponsor|sponsorship|visa|h[- ]?1b|work permit/,
    /18 years|age or older|over 18|at least 18/,
    /years.*experience|experience.*years|totalexperience|gesamte arbeitserfahrung/,
    /salary|compensation|expected pay|pay expectation|current ctc|annualsalary|expectedctc|aktuelles gehalt|erwartetes gehalt|react-select-[23]-input/,
    /school|university|college/,
    /degree|highestdegree|highest qualification|h\u00f6chste qualifikation|hoechste qualifikation/,
    /course|class|certification/,
    /hear about|heard about|source|how did you find|how did you learn/,
    /referred|referral/,
    /current.*employee|team member/,
    /previous.*employee|ever.*employed|formerly.*employed/,
    /background.*check/,
    /privacy|data retention|data processing|recruiting.*consent|consent/,
    /accommodation/,
    /gender|pronoun|race|ethnicity|hispanic|latino|veteran|disability|disabled/,
    /available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/,
    /resume|cv/,
  ];

  const isSimpleStructuredField = (meta) => SIMPLE_FIELD_PATTERNS.some((pattern) => pattern.test(meta));

  const getFieldOptions = (field) => {
    if (!field) return [];

    if (isCustomChoiceControl(field)) {
      return collectCustomChoiceOptions(field).map((option) => option.text).filter(Boolean);
    }

    if (field.tagName.toLowerCase() === 'select') {
      return Array.from(field.options)
        .map((option) => cleanText(option.textContent || option.value || ''))
        .filter(Boolean)
        .filter((option) => !/^(select|choose|pick|please select)$/i.test(option));
    }

    if (field.type === 'radio' && field.name) {
      return queryFieldRoots(field, `input[type="radio"][name="${CSS.escape(field.name)}"]`)
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
    const fieldMeta = normalize([meta, getFieldIdentity(field), getHiresomeFieldHint(field)].filter(Boolean).join(' '));

    if (
      /cover letter|message to the hiring team|about you|tell us about yourself|why (?:are you interested|this role|do you want)|why should we hire you|why are you a fit|additional information|anything else/i.test(fieldMeta)
    ) {
      return true;
    }

    if ((tag === 'textarea' || field.type === 'textarea') && !/address|portfolio|website|linkedin|github/.test(fieldMeta)) {
      return true;
    }

    if (options.length > 0 && !isSimpleStructuredField(fieldMeta)) {
      return true;
    }

    if (isSimpleStructuredField(fieldMeta)) {
      return false;
    }

    return (
      fieldMeta.length >= 28
      || /experience with|familiarity with|eligibility|willing to|relocate|remote|onsite|hybrid|salary|compensation|clearance|language|citizenship|visa|pronoun|gender|veteran|disability/.test(fieldMeta)
    );
  };

  const buildAiFieldDescriptor = async (field, index) => {
    const tag = field.tagName.toLowerCase();
    const label = field.type === 'radio' || field.type === 'checkbox'
      ? getGroupQuestionLabel(field)
      : getLabelText(field);
    let options = getFieldOptions(field);
    if (isCustomChoiceControl(field) && options.length === 0) {
      options = (await openCustomChoiceControl(field)).map((option) => option.text).filter(Boolean);
    }
    return {
      id: field.name
        ? `${field.type || tag}:${field.name}`
        : `${field.type || tag}:${field.id || index}`,
      label: label.slice(0, 320),
      kind: field.type === 'radio' || field.type === 'checkbox'
        ? 'choice'
        : tag === 'select' || isCustomChoiceControl(field)
          ? 'select'
          : tag === 'textarea'
            ? 'textarea'
            : 'text',
      required: field.required || field.getAttribute('aria-required') === 'true',
      placeholder: cleanText(field.getAttribute('placeholder') || '').slice(0, 180),
      options: options.slice(0, 12),
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

  const findResumeInput = () => {
    const fileInputs = queryAllAcrossContexts('input[type="file"]');
    if (fileInputs.length === 1) return fileInputs[0];
    return fileInputs.find((input) => {
      const meta = cleanText([
        getLabelText(input),
        input.closest('[data-testid*="attachment"], .field, .application-field, .form-field, .posting-requirement, fieldset, form')?.textContent || '',
        input.parentElement?.textContent || '',
        input.nextElementSibling?.textContent || '',
        input.previousElementSibling?.textContent || '',
      ].join(' '));
      return RESUME_UPLOAD_PATTERN.test(meta);
    }) || null;
  };

  const getVisibleFormFields = () => (
    Array.from(new Set(queryAllAcrossContexts('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button[class*="select"], button[class*="dropdown"]')))
      .filter((field) => field && !field.disabled && isVisible(field))
  );

  const looksLikeApplicationForm = () => {
    const fields = getVisibleFormFields();
    const visibleForms = queryAllAcrossContexts('form')
      .filter((form) => {
        const visibleControls = Array.from(form.querySelectorAll('input, textarea, select'))
          .filter((field) => field && field.type !== 'hidden' && isVisible(field));
        return visibleControls.length >= 3;
      });
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

    if (hasPageWorldApplicationHost()) {
      return true;
    }

    if (visibleForms.length > 0) {
      return true;
    }

    if (professionalSignals.length >= 1 && informativeFields.length >= 2) {
      return true;
    }

    return informativeFields.length >= 4
      && /apply|submit|continue|next|review|start application|complete application/.test(normalize(document.body?.innerText || ''));
  };

  const findPrimaryAction = (patterns, exclusions = []) => {
    const candidates = queryAllAcrossContexts('button, a, input[type="submit"], input[type="button"]');
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

  const isWeakJobPostingSnapshot = (snapshot = null) => (
    !snapshot
    || !cleanText(snapshot.title || '')
    || /^apply now\s*\|/i.test(cleanText(snapshot.title || ''))
  );

  const isDocumentScrollElement = (element) => (
    element === document.scrollingElement
    || element === document.documentElement
    || element === document.body
  );

  const getScrollTop = (element) => (
    isDocumentScrollElement(element)
      ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
      : element.scrollTop
  );

  const setScrollTop = (element, top) => {
    if (isDocumentScrollElement(element)) {
      window.scrollTo({ top, left: window.scrollX || 0, behavior: 'auto' });
      return;
    }

    element.scrollTop = top;
  };

  const getAutoScrollTargets = () => {
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      ...queryAllExtractionContexts('*'),
    ].filter(Boolean);
    const seen = new Set();

    return candidates
      .filter((element) => {
        if (seen.has(element) || isExtensionWidgetHost(element)) return false;
        seen.add(element);
        const scrollHeight = Number(element.scrollHeight || 0);
        const clientHeight = Number(element.clientHeight || window.innerHeight || 0);
        return scrollHeight > clientHeight + 120 && (isDocumentScrollElement(element) || isVisible(element));
      })
      .sort((left, right) => (right.scrollHeight || 0) - (left.scrollHeight || 0))
      .slice(0, 6);
  };

  const autoScrollForMeaningfulJobPostingSnapshot = async ({ timeoutMs = 4200 } = {}) => {
    const startedAt = Date.now();
    const targets = getAutoScrollTargets();
    const originalPositions = targets.map((element) => ({ element, top: getScrollTop(element) }));
    const ratios = [0.18, 0.42, 0.68, 0.92, 1];

    try {
      for (const target of targets) {
        const maxScroll = Math.max(0, (target.scrollHeight || 0) - (target.clientHeight || window.innerHeight || 0));
        if (maxScroll <= 0) continue;

        for (const ratio of ratios) {
          if (Date.now() - startedAt > timeoutMs) {
            return getMeaningfulJobPostingSnapshot();
          }

          setScrollTop(target, Math.round(maxScroll * ratio));
          await delay(260);

          const snapshot = getMeaningfulJobPostingSnapshot();
          if (!isWeakJobPostingSnapshot(snapshot)) {
            return snapshot;
          }
        }
      }

      return getMeaningfulJobPostingSnapshot();
    } finally {
      originalPositions.forEach(({ element, top }) => {
        setScrollTop(element, top);
      });
    }
  };

  const hydrateApplicationFormFields = async ({ timeoutMs = 5200 } = {}) => {
    const startedAt = Date.now();
    const targets = getAutoScrollTargets();
    const originalPositions = targets.map((element) => ({ element, top: getScrollTop(element) }));
    const ratios = [0, 0.22, 0.46, 0.7, 0.9, 1];

    try {
      for (const target of targets) {
        const maxScroll = Math.max(0, (target.scrollHeight || 0) - (target.clientHeight || window.innerHeight || 0));
        if (maxScroll <= 0) continue;

        for (const ratio of ratios) {
          if (Date.now() - startedAt > timeoutMs) return;
          setScrollTop(target, Math.round(maxScroll * ratio));
          await delay(260);
        }
      }
    } finally {
      originalPositions.forEach(({ element, top }) => {
        setScrollTop(element, top);
      });
      await delay(180);
    }
  };

  const waitForMeaningfulJobPostingSnapshot = async ({ timeoutMs = 4200, intervalMs = 450 } = {}) => {
    let snapshot = getMeaningfulJobPostingSnapshot();
    if (!isWeakJobPostingSnapshot(snapshot)) {
      return snapshot;
    }

    snapshot = await autoScrollForMeaningfulJobPostingSnapshot({ timeoutMs: Math.min(2600, timeoutMs) });
    if (!isWeakJobPostingSnapshot(snapshot)) {
      return snapshot;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await delay(intervalMs);
      snapshot = getMeaningfulJobPostingSnapshot();
      if (!isWeakJobPostingSnapshot(snapshot)) {
        return snapshot;
      }
    }

    return snapshot;
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

  const detectClosedExternalApplicationForm = async () => {
    if (provider !== 'manatal') return '';

    const match = window.location.pathname.match(/\/jobs\/([^/]+)\/apply/i);
    const jobId = match?.[1] || '';
    if (!jobId) return '';

    try {
      const response = await fetch(`https://api.careers-page.com/open/v1/job-posts/${encodeURIComponent(jobId)}/application-form`, {
        credentials: 'omit',
      });
      if (!response.ok) return '';
      const payload = await response.json();
      if (payload?.is_open === false) {
        return 'This Manatal application form is closed by the employer, so there are no fillable fields to complete on this page.';
      }
    } catch {
      return '';
    }

    return '';
  };

  const buildZeroFillReason = (summary) => {
    if ((summary.accessibleFieldCount || 0) === 0) {
      if ((summary.crossOriginFrameCount || 0) > 0) {
        return 'This form is inside an embedded frame the extension cannot inspect directly yet. Open the native form step, then try Autofill again.';
      }

      return 'No visible form fields are available yet. Scroll or expand the application form, then try again.';
    }

    if ((summary.labeledFieldCount || 0) === 0) {
      return 'The form fields are visible, but this site is not exposing usable labels yet. Expand the questions or move to the actual form step, then try again.';
    }

    if ((summary.mappableFieldCount || 0) === 0 && !summary.resumeInputPresent) {
      return 'The visible fields do not look like candidate/application questions yet. Continue deeper into the application flow, then try Autofill again.';
    }

    return 'I found the form shell, but none of the visible questions mapped cleanly yet. Scroll, expand hidden sections, then try Autofill again.';
  };

  const getAutofillOutcomeMessage = (result = {}) => {
    if (result.pendingNavigation) {
      return 'Opened the application flow. Once the actual form step is visible, run Autofill again.';
    }

    if (Array.isArray(result.profileMissingFields) && result.profileMissingFields.length > 0) {
      const missing = formatMissingProfileFields(result.profileMissingFields);
      return `Autofilled ${result.filledCount || 0} field${result.filledCount === 1 ? '' : 's'}, but ResumeATS profile is missing ${missing}. Complete your ResumeATS profile/resume contact details, reload ResumeATS, then sync again.`;
    }

    if ((result.filledCount || 0) > 0) {
      if (result.preparedResume?.title) {
        return `Prepared "${result.preparedResume.title}" and autofilled ${result.filledCount} field${result.filledCount === 1 ? '' : 's'} on the current page.`;
      }
      return `Autofilled ${result.filledCount} field${result.filledCount === 1 ? '' : 's'} on the current page.`;
    }

    return result.zeroFillReason
      || 'I found the page, but not any fillable application questions yet. Scroll or expand the form, then try Autofill again.';
  };

  const autofillVisibleFields = async (profile) => {
    const { crossOriginFrameCount } = getSearchContexts();
    await hydrateApplicationFormFields();
    let filledCount = 0;
    let resumeUploaded = false;

    const initialResumeInput = findResumeInput();
    if (initialResumeInput && !initialResumeInput.files?.length) {
      resumeUploaded = await uploadResumeFile(initialResumeInput, profile);
      if (resumeUploaded) {
        filledCount += 1;
        await delay(/hiresome\.ai$/i.test(window.location.hostname) ? 5200 : 2200);
      }
    }

    const fields = getVisibleFormFields();
    const processedRadioNames = new Set();
    const aiCandidates = [];
    const jobSnapshot = getMeaningfulJobPostingSnapshot();
    let labeledFieldCount = 0;
    let mappableFieldCount = 0;
    const profileMissingFields = new Set();
    const aiHandledFields = new WeakSet();

    for (const [index, field] of fields.entries()) {
      const meta = getLabelText(field);
      if (meta) {
        labeledFieldCount += 1;
      }
      if (!meta || field.type === 'file') continue;
      if (field.type === 'radio' && processedRadioNames.has(field.name || '')) continue;
      if (field.type === 'radio' && field.name) {
        processedRadioNames.add(field.name);
      }

      const fallbackValue = resolveFieldValue(meta, profile, field);
      if ((fallbackValue === null || fallbackValue === undefined || fallbackValue === '') && !isFieldAlreadyFilled(field)) {
        const missingField = getMissingProfileFieldForMeta(meta, profile);
        if (missingField) profileMissingFields.add(missingField);
      }
      if (shouldUseAiForField(field, meta)) {
        mappableFieldCount += 1;
        aiCandidates.push({
          field,
          descriptor: await buildAiFieldDescriptor(field, index),
          fallbackValue,
        });
        continue;
      }

      if (fallbackValue === null || fallbackValue === undefined || fallbackValue === '') continue;
      mappableFieldCount += 1;

      if (await setFieldValue(field, fallbackValue)) {
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
        if (await setFieldValue(candidate.field, resolvedValue)) {
          aiHandledFields.add(candidate.field);
          filledCount += 1;
        }
      }
    }

    if (filledCount > 0) {
      for (let pass = 0; pass < 5; pass += 1) {
        let filledOnPass = false;
        const retryProcessedRadioNames = new Set();

        for (const field of getVisibleFormFields()) {
          if (!field || field.type === 'file' || field.type === 'hidden') continue;
          if (aiHandledFields.has(field)) continue;
          if (field.type === 'radio' && retryProcessedRadioNames.has(field.name || '')) continue;
          if (field.type === 'radio' && field.name) {
            retryProcessedRadioNames.add(field.name);
          }

          const meta = getLabelText(field);
          if (!meta) continue;
          if (shouldUseAiForField(field, meta)) continue;

          const fallbackValue = resolveFieldValue(meta, profile, field);
          if ((fallbackValue === null || fallbackValue === undefined || fallbackValue === '') && !isFieldAlreadyFilled(field)) {
            const missingField = getMissingProfileFieldForMeta(meta, profile);
            if (missingField) profileMissingFields.add(missingField);
          }
          if (fallbackValue === null || fallbackValue === undefined || fallbackValue === '') continue;
          const currentFieldValue = getCurrentFieldValue(field);
          if (
            isFieldAlreadyFilled(field)
            && !hasOnlyPhoneCountryPrefix(field, currentFieldValue, fallbackValue)
            && scoreOptionMatch(currentFieldValue, fallbackValue) >= 80
          ) continue;
          mappableFieldCount += 1;

          if (await setFieldValue(field, fallbackValue)) {
            filledCount += 1;
            filledOnPass = true;
            await delay(180);
            break;
          }
        }

        if (!filledOnPass) break;
      }
    }

    filledCount += await fillHiresomeLocationFields(profile);
    filledCount += await repairPhoneCountryFields(profile);
    filledCount += await repairPhoneInputs(profile);

    const resumeInput = findResumeInput();
    if (!resumeUploaded && resumeInput && !resumeInput.files?.length) {
      const uploaded = await uploadResumeFile(resumeInput, profile);
      if (uploaded) filledCount += 1;
    }

    const summary = {
      filledCount,
      accessibleFieldCount: fields.length,
      labeledFieldCount,
      mappableFieldCount,
      aiCandidateCount: aiCandidates.length,
      crossOriginFrameCount,
      resumeInputPresent: Boolean(resumeInput),
      profileMissingFields: Array.from(profileMissingFields),
    };

    if (filledCount === 0 && (fields.length === 0 || hasPageWorldApplicationHost())) {
      try {
        const bridgedSummary = await requestPageWorldFormBridge(
          'RESUMEATS_PAGE_AUTOFILL',
          { profile: buildPageBridgeProfile(profile) },
          6000
        );
        if (bridgedSummary) {
          const mergedSummary = {
            ...summary,
            ...bridgedSummary,
            crossOriginFrameCount,
          };
          if ((mergedSummary.filledCount || 0) === 0 && !mergedSummary.zeroFillReason) {
            mergedSummary.zeroFillReason = await detectClosedExternalApplicationForm()
              || buildZeroFillReason(mergedSummary);
          }
          return mergedSummary;
        }
      } catch {
        try {
          const mainWorldFallback = await chrome.runtime.sendMessage({
            type: 'RUN_MAIN_WORLD_ACTIVE_TAB_AUTOFILL',
            payload: { profile: buildPageBridgeProfile(profile) },
          });
          if (mainWorldFallback?.ok && mainWorldFallback?.result) {
            const mergedSummary = {
              ...summary,
              ...mainWorldFallback.result,
              crossOriginFrameCount,
            };
            if ((mergedSummary.filledCount || 0) === 0 && !mergedSummary.zeroFillReason) {
              mergedSummary.zeroFillReason = await detectClosedExternalApplicationForm()
                || buildZeroFillReason(mergedSummary);
            }
            return mergedSummary;
          }
        } catch {
          // Fall through to the local zero-fill reason when the background fallback is unavailable.
        }
      }
    }

    if (filledCount === 0) {
      summary.zeroFillReason = await detectClosedExternalApplicationForm()
        || buildZeroFillReason(summary);
    }

    return summary;
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

    let autofillSummary = {
      filledCount: 0,
      accessibleFieldCount: 0,
      labeledFieldCount: 0,
      mappableFieldCount: 0,
      aiCandidateCount: 0,
      crossOriginFrameCount: 0,
      resumeInputPresent: false,
    };

    try {
      autofillSummary = await autofillVisibleFields(profile);
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Resume upload failed',
        provider,
        ...autofillSummary,
      };
    }

    if (!autoSubmit) {
      return {
        ok: true,
        submitted: false,
        provider,
        ...autofillSummary,
      };
    }

    if (findConfirmation()) {
      return {
        ok: true,
        submitted: true,
        provider,
        ...autofillSummary,
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
          ...autofillSummary,
        };
      }

      return {
        ok: false,
        error: 'Could not find an Apply or Submit action on this page',
        provider,
        ...autofillSummary,
      };
    }

    submitButton.click();
    await delay(1500);
    const confirmed = findConfirmation();

    return {
      ok: Boolean(confirmed),
      submitted: Boolean(confirmed),
      error: confirmed ? undefined : 'Submit clicked, but no confirmation was detected. Please review the page before closing it.',
      provider,
      ...autofillSummary,
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

    if (message?.type === 'DEBUG_FORM_DISCOVERY') {
      (async () => {
        const { contexts, crossOriginFrameCount } = getSearchContexts();
        const fields = queryAllAcrossContexts('input, textarea, select');
        const visibleFields = fields.filter((field) => field && field.type !== 'hidden' && isVisible(field));
        const forms = queryAllAcrossContexts('form');
        const applicationRoot = document.querySelector('#application-root');
        let pageWorldDiscovery = null;

        if (hasPageWorldApplicationHost()) {
          pageWorldDiscovery = await requestPageWorldFormBridge('RESUMEATS_PAGE_FORM_DISCOVERY').catch((error) => ({
            ok: false,
            error: error?.message || String(error),
          }));
        }

        sendResponse({
          ok: true,
          provider,
          hasApplicationRoot: Boolean(applicationRoot),
          hasApplicationShadowRoot: Boolean(applicationRoot?.shadowRoot),
          contextCount: contexts.length,
          crossOriginFrameCount,
          formCount: forms.length,
          fieldCount: fields.length,
          visibleFieldCount: visibleFields.length,
          visibleFields: visibleFields.slice(0, 40).map((field) => ({
            tag: field.tagName,
            type: field.type || field.tagName.toLowerCase(),
            id: field.id || '',
            placeholder: field.getAttribute('placeholder') || '',
            label: getLabelText(field),
          })),
          pageWorldDiscovery,
        });
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

  if (isTopFrame) {
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
  } else {
    const frameSnapshot = getMeaningfulJobPostingSnapshot();
    if (frameSnapshot) {
      persistJobPostingSnapshot(frameSnapshot).catch(() => {});
    }
    notifyPageReady(frameSnapshot);
  }
})();
