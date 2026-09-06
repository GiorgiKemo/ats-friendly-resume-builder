/* global chrome */
import { canonicalJobUrl, createResumeHandoffStore, handoffMetadata, selectionError, validateSavedResumeArtifact } from './resume-handoff.js';

// Keep persisted state migrations tied to the shipped extension version. A
// stale hard-coded value can make an update look like the same runtime and
// silently skip future migrations.
const VERSION = chrome.runtime?.getManifest?.()?.version || '0.2.0';
const STORAGE_KEY = 'resumeatsBrowserAgentState';
const PENDING_PROFILE_SYNC_KEY = 'resumeatsBrowserAgentPendingProfileSync';
const ACTION_PROGRESS_KEY = 'resumeatsBrowserAgentActionProgress';
const JOB_OPEN_TIMEOUT_MS = 45000;
const APP_BRIDGE_TIMEOUT_MS = 45000;
const TAB_FRAME_MESSAGE_TIMEOUT_MS = 55000;
const PRODUCTION_APP_URL = 'https://resumeats.cv';
const AUTOFILL_RETRY_DELAYS_MS = [1500, 2500, 4000, 6000];
const APP_BRIDGE_SCRIPT_FILE = 'content-app-bridge.js';
const RESUME_HANDOFF_EXPIRY_ALARM = 'resumeats-resume-handoff-expiry';
let activeJobTimeoutId = null;
let profileSessionVersion = 0;
let resumeBeginIntent = 0;
let stateWriteQueue = Promise.resolve();
let legacyDocumentCleanupQueued = false;
const resumeHandoffs = createResumeHandoffStore({ storage: chrome.storage.session });
const pendingHandoffCompletions = new Map();

const DEFAULT_STATE = {
  version: VERSION,
  profile: null,
  queue: [],
  isRunning: false,
  activeJobId: null,
  lastSyncedAt: null,
  lastJobSnapshot: null,
};

const ACTION_PROGRESS_COPY = {
  autofill: {
    label: 'Autofill',
    title: 'Autofilling application',
    detail: 'Checking your selected saved version before filling this application.',
  },
  resume: {
    label: 'Choose resume',
    title: 'Opening resume selection',
    detail: 'Choose a saved version or review a new tailored resume in ResumeATS.',
  },
  sync: {
    label: 'Sync',
    title: 'Syncing ResumeATS profile',
    detail: 'Loading your latest ResumeATS profile and resume data into the extension.',
  },
  analyze: {
    label: 'Analyze',
    title: 'Reading active job',
    detail: 'Extracting job details and scoring the current role.',
  },
  generic: {
    label: 'Working',
    title: 'Working on request',
    detail: 'Keep this open while ResumeATS finishes the action.',
  },
};

const createActionId = () => (
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const startActionProgress = async (type = 'generic', overrides = {}) => {
  const copy = {
    ...ACTION_PROGRESS_COPY.generic,
    ...(ACTION_PROGRESS_COPY[type] || {}),
    ...overrides,
  };
  const progress = {
    id: createActionId(),
    active: true,
    type,
    tone: 'busy',
    label: copy.label,
    title: copy.title,
    detail: copy.detail,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [ACTION_PROGRESS_KEY]: progress }).catch(() => {});
  return progress.id;
};

const settleActionProgress = async (id, tone = 'success', overrides = {}) => {
  const stored = await chrome.storage.local.get(ACTION_PROGRESS_KEY).catch(() => ({}));
  const current = stored?.[ACTION_PROGRESS_KEY];
  if (id && current?.id && current.id !== id) return;

  const now = Date.now();
  await chrome.storage.local.set({
    [ACTION_PROGRESS_KEY]: {
      ...(current || {}),
      id: current?.id || id || createActionId(),
      active: false,
      tone,
      label: overrides.label || (tone === 'warning' ? 'Needs attention' : 'Done'),
      title: overrides.title || (tone === 'warning' ? 'Action needs attention' : 'Action complete'),
      detail: overrides.detail || (tone === 'warning' ? 'Review the message and try again.' : 'ResumeATS finished the action.'),
      updatedAt: now,
      completedAt: now,
      hideAfterAt: now + (tone === 'warning' ? 45000 : 2200),
    },
  }).catch(() => {});
};

const withActionProgress = async (type, work, copy = {}) => {
  const progressId = await startActionProgress(type, copy.pending || {});
  try {
    const result = await work();
    await settleActionProgress(progressId, 'success', copy.success || {});
    return result;
  } catch (error) {
    await settleActionProgress(progressId, 'warning', {
      ...(copy.failure || {}),
      detail: error?.message || copy.failure?.detail || 'Review the message and try again.',
    });
    throw error;
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isSignInRequiredMessage = (message = '') => /sign in to resumeats/i.test(`${message}`);
const isMissingReceiverMessage = (message = '') => /receiving end does not exist|could not establish connection/i.test(`${message}`);
const isMissingReceiverError = (error) => isMissingReceiverMessage(error?.message || error);
const cleanProfileText = (value = '') => `${value ?? ''}`.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const pickProfileValue = (...values) => values
  .map((value) => cleanProfileText(value))
  .find(Boolean) || '';
const splitProfileFullName = (fullName = '') => {
  const parts = cleanProfileText(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
};
const normalizeCandidateProfile = (profile = {}) => {
  const candidate = profile?.candidate || {};
  const personal = profile?.personal || profile?.personalInfo || {};
  const nestedPersonal = profile?.profile?.personal || profile?.profile?.personalInfo || {};
  const resumePersonal = profile?.resume?.personalInfo || {};
  const answers = profile?.answers || {};
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
  const split = splitProfileFullName(fullName);
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
    fullName: fullName || [firstName, lastName].filter(Boolean).join(' '),
    firstName,
    lastName,
    email: pickProfileValue(candidate.email, personal.email, nestedPersonal.email, resumePersonal.email, answers.email),
    phone: pickProfileValue(candidate.phone, candidate.phoneNumber, personal.phone, personal.phoneNumber, nestedPersonal.phone, resumePersonal.phone, answers.phone),
    location: pickProfileValue(candidate.location, personal.location, nestedPersonal.location, resumePersonal.location, answers.location, locationFromAnswers),
    currentTitle: pickProfileValue(candidate.currentTitle, candidate.jobTitle, answers.currentTitle),
  };
};
const buildMainWorldProfile = (profile = {}) => {
  const candidate = normalizeCandidateProfile(profile);
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
      currentTitle: candidate.currentTitle,
    },
    personalInfo: {
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      location: candidate.location,
    },
    answers,
    documents: {},
  };
};
const getProfileWithoutResumeUpload = (profile = {}) => ({ ...profile, documents: {} });
const getMissingAutofillProfileFields = (profile = {}) => {
  const candidate = normalizeCandidateProfile(profile);
  const missing = [];
  if (!candidate.fullName || !candidate.firstName || !candidate.lastName) missing.push('full name');
  if (!candidate.email) missing.push('email');
  if (!candidate.phone) missing.push('phone number');
  if (!candidate.location) missing.push('location');
  return missing;
};
const buildMissingProfileMessage = (missingFields = []) => (
  `ResumeATS profile is missing ${missingFields.join(', ')}. Complete your ResumeATS profile/resume contact details, reload ResumeATS, then click Connect ResumeATS again.`
);

const setPendingProfileSync = async (reason = '') => chrome.storage.local.set({
  [PENDING_PROFILE_SYNC_KEY]: {
    requestedAt: new Date().toISOString(),
    reason,
  },
});

const clearPendingProfileSync = async () => chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY);

const APP_HOST_PATTERNS = [
  /^(www\.)?resumeats\.cv$/i,
  /^localhost$/i,
  /^127\.0\.0\.1$/i,
];

const isAppUrl = (value = '') => {
  try {
    const hostname = new URL(value).hostname;
    return APP_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
};

const isSameAppOrigin = (left = '', right = '') => {
  try {
    return isAppUrl(left) && isAppUrl(right) && new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
};

const isInspectableJobTab = (tab = {}) => {
  if (!tab?.id || !tab?.url) return false;
  if (isAppUrl(tab.url)) return false;
  if (/^(chrome|edge|about|file):/i.test(tab.url)) return false;
  return /^https?:/i.test(tab.url);
};

const getResumeAtsBaseUrl = (profile = null) => {
  const configured = profile?.integration?.appUrl;
  if (configured && /^https?:/i.test(configured) && isAppUrl(configured)) {
    return configured.replace(/\/$/, '');
  }

  return PRODUCTION_APP_URL;
};

const normalizeUrl = (value = '') => {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return `${value}`.replace(/\/$/, '');
  }
};

const urlsMatch = (left = '', right = '') => {
  try {
    const a = new URL(left);
    const b = new URL(right);
    if (![a, b].every((url) => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)) return false;
    // URL prefixes are not job identities: /jobs/1 is not /jobs/10. Preserve
    // query and fragment data because ATS and SPA routes can encode job IDs there.
    return a.origin === b.origin
      && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '')
      && a.search === b.search && a.hash === b.hash;
  } catch {
    return false;
  }
};

const getState = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const state = {
    ...DEFAULT_STATE,
    ...(stored?.[STORAGE_KEY] || {}),
    version: VERSION,
  };
  if (state.profile?.documents && Object.keys(state.profile.documents).length) queueLegacyDocumentCleanup();
  return { ...state, profile: state.profile ? getProfileWithoutResumeUpload(state.profile) : null };
};

const queueLegacyDocumentCleanup = () => {
  if (legacyDocumentCleanupQueued) return;
  legacyDocumentCleanupQueued = true;
  // Read again inside the normal write queue. Never write an earlier read's
  // account or job state back while removing obsolete document metadata.
  const cleanup = stateWriteQueue.then(async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const current = stored?.[STORAGE_KEY];
    if (!current?.profile?.documents || !Object.keys(current.profile.documents).length) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, profile: getProfileWithoutResumeUpload(current.profile) } });
  }).finally(() => { legacyDocumentCleanupQueued = false; });
  stateWriteQueue = cleanup.catch(() => {});
};

const saveState = (partial, { expectedSessionVersion, expectedActiveJobId } = {}) => {
  const assertCurrentSession = () => {
    if (expectedSessionVersion !== undefined && expectedSessionVersion !== profileSessionVersion) {
      throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
    }
  };
  const write = stateWriteQueue.then(async () => {
    assertCurrentSession();
    const currentState = await getState();
    assertCurrentSession();
    if (expectedActiveJobId !== undefined && (currentState.activeJobId !== expectedActiveJobId || !currentState.isRunning)) throw new Error('The queued job is no longer active.');
    const nextState = { ...currentState, ...partial, version: VERSION };
    if (nextState.profile) nextState.profile = getProfileWithoutResumeUpload(nextState.profile);
    await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
    return nextState;
  });
  // Serialize read/merge/write operations; a failed write must not poison the queue.
  stateWriteQueue = write.catch(() => {});
  return write;
};

const migrateInstalledState = (details = {}) => {
  const write = stateWriteQueue.then(async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY).catch(() => ({}));
    const existingState = stored?.[STORAGE_KEY];
    const nextState = details.reason === 'install' || !existingState || typeof existingState !== 'object'
      ? { ...DEFAULT_STATE }
      : {
        ...DEFAULT_STATE,
        ...existingState,
        version: VERSION,
        profile: existingState.profile ? getProfileWithoutResumeUpload(existingState.profile) : null,
        queue: Array.isArray(existingState.queue) ? existingState.queue : [],
        isRunning: Boolean(existingState.isRunning),
        activeJobId: existingState.activeJobId || null,
      };
    await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
    return nextState;
  });
  stateWriteQueue = write.catch(() => {});
  return write;
};

const clearActiveJobTimeout = () => {
  if (activeJobTimeoutId) {
    clearTimeout(activeJobTimeoutId);
    activeJobTimeoutId = null;
  }
};

const scheduleActiveJobTimeout = (jobId, tabId, expectedSessionVersion = profileSessionVersion) => {
  clearActiveJobTimeout();
  activeJobTimeoutId = setTimeout(async () => {
    const state = await getState();
    if (expectedSessionVersion !== profileSessionVersion || !state.isRunning || state.activeJobId !== jobId) return;

    await markJobResult({
      jobId,
      success: false,
      details: {
        error: 'Timed out waiting for the application page to become ready',
      },
      tabId,
      expectedSessionVersion,
    });
  }, JOB_OPEN_TIMEOUT_MS);
};

const getStateSummary = (state) => ({
  installed: true,
  version: VERSION,
  isRunning: Boolean(state.isRunning),
  queueSize: Array.isArray(state.queue) ? state.queue.filter((job) => job.status === 'queued' || job.status === 'opening').length : 0,
  lastSyncedAt: state.lastSyncedAt || null,
  activeJobId: state.activeJobId || null,
  lastJobSnapshot: state.lastJobSnapshot || null,
  hasProfile: Boolean(state.profile),
  candidateName: normalizeCandidateProfile(state.profile).fullName || '',
  candidateTitle: normalizeCandidateProfile(state.profile).currentTitle || '',
  missingProfileFields: getMissingAutofillProfileFields(state.profile),
  queue: Array.isArray(state.queue)
    ? state.queue.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        url: job.url,
        provider: job.provider,
        status: job.status,
        submittedAt: job.submittedAt || null,
        lastError: job.lastError || null,
      }))
    : [],
});

const persistLastJobSnapshot = async (jobPosting, tabId = null) => {
  if (!jobPosting) return null;

  const snapshot = {
    ...jobPosting,
    tabId,
    capturedAt: new Date().toISOString(),
  };

  await saveState({ lastJobSnapshot: snapshot });
  return snapshot;
};

const getInspectableFrames = async (tabId) => {
  if (!chrome.webNavigation?.getAllFrames) {
    return [{ frameId: 0, url: '' }];
  }

  try {
    const frames = await new Promise((resolve) => {
      chrome.webNavigation.getAllFrames({ tabId }, (result) => {
        if (chrome.runtime.lastError) {
          resolve([]);
          return;
        }
        resolve(Array.isArray(result) ? result : []);
      });
    });
    return (Array.isArray(frames) ? frames : [])
      .filter((frame) => /^https?:/i.test(frame.url || '') && !isAppUrl(frame.url || ''))
      .sort((left, right) => {
        if (left.frameId === 0) return -1;
        if (right.frameId === 0) return 1;
        return (left.parentFrameId || 0) - (right.parentFrameId || 0);
      });
  } catch {
    return [{ frameId: 0, url: '' }];
  }
};

const sendFrameMessage = (tabId, frameId, message, timeoutMs = TAB_FRAME_MESSAGE_TIMEOUT_MS) => new Promise((resolve, reject) => {
  let settled = false;
  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    reject(new Error(`Frame ${frameId} did not respond within ${timeoutMs}ms`));
  }, timeoutMs);

  chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    resolve(response);
  });
});

const sendMessageToTabFrames = async (tabId, message) => {
  const frames = await getInspectableFrames(tabId);
  const entries = await Promise.all(frames.map(async (frame) => {
    try {
      const response = await sendFrameMessage(tabId, frame.frameId, message);
      return response
        ? {
            frameId: frame.frameId,
            frameUrl: frame.url || '',
            response,
          }
        : null;
    } catch {
      return null;
    }
  }));

  return entries.filter(Boolean);
};

const scoreJobPostingResponse = (entry = {}) => {
  const job = entry.response?.jobPosting || {};
  let score = 0;
  if (entry.response?.ok) score += 10;
  if (job.title) score += Math.min(40, job.title.length);
  if (job.company) score += 12;
  if (job.description && job.description.length > 300) score += 24;
  if (entry.response?.provider && entry.response.provider !== 'generic') score += 10;
  if (entry.frameId !== 0) score += 8;
  return score;
};

const captureJobPostingFromTab = async (tab) => {
  if (!isInspectableJobTab(tab)) {
    throw new Error('No supported job tab is available to capture');
  }

  const responses = await sendMessageToTabFrames(tab.id, { type: 'EXTRACT_JOB_POSTING' });
  const best = responses
    .filter((entry) => entry.response?.ok && entry.response?.jobPosting)
    .sort((left, right) => scoreJobPostingResponse(right) - scoreJobPostingResponse(left))[0];

  if (!best?.response?.jobPosting) {
    const firstError = responses.find((entry) => entry.response?.error)?.response?.error;
    throw new Error(firstError || 'Could not extract a job posting from that tab');
  }

  return persistLastJobSnapshot({
    ...best.response.jobPosting,
    url: best.response.jobPosting.url || best.frameUrl || tab.url,
  }, tab.id);
};

const mainWorldAutofillFunction = async (profile = {}) => {
  const phoneFieldPattern = /phone|mobile|cell|telephone|tel\b|contact number|contact no|whatsapp|numer telefonu|telefon|telefone|telefono|num(?:e|\u00e9)ro/i;
  const resumeUploadPattern = /resume|cv|curriculum|attachment|upload|select the attachment|zalacznik|za\u0142\u0105cznik|plik|dodaj plik/i;
  const cleanText = (value = '') => `${value}`
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const normalize = (value = '') => `${value}`.toLowerCase().replace(/\s+/g, ' ').trim();
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
  const buildNormalizedCandidate = (sourceProfile = {}) => {
    const candidate = sourceProfile?.candidate || {};
    const personal = sourceProfile?.personal || sourceProfile?.personalInfo || {};
    const nestedPersonal = sourceProfile?.profile?.personal || sourceProfile?.profile?.personalInfo || {};
    const resumePersonal = sourceProfile?.resume?.personalInfo || {};
    const answers = sourceProfile?.answers || {};
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
    const capturedShadowRoots = window.__resumeatsCapturedShadowRoots;
    if (capturedShadowRoots?.forEach) {
      capturedShadowRoots.forEach((root) => visit(root));
    }
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

  const GENERIC_FIELD_LABEL_PATTERN = /^(select|select\.{3}|choose|choose\.{3}|search|loading|optional|required|textbox|combobox|listbox)$/i;

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
    let hasDirectLabel = false;
    const addIdentity = (value = '') => {
      const text = cleanFieldLabelCandidate(value, field);
      if (isUsableFieldLabelCandidate(text)) parts.push(text);
    };
    const addDirectLabel = (value = '') => {
      const before = parts.length;
      addIdentity(value);
      if (parts.length > before) hasDirectLabel = true;
    };
    const addScopedLabel = (container) => {
      if (!container?.querySelectorAll || !container?.textContent) return;
      const controlCount = container.querySelectorAll('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button').length;
      const text = cleanFieldLabelCandidate(container.textContent, field);
      if (controlCount === 1 && text.length <= 260) addDirectLabel(text);
    };

    if (field.id) {
      try {
        for (const linkedLabel of queryFieldRoots(field, `label[for="${CSS.escape(field.id)}"]`)) {
          addDirectLabel(linkedLabel?.textContent || '');
        }
      } catch {
        // Ignore invalid escape cases.
      }
    }
    addDirectLabel(field.closest('label')?.textContent || '');
    addScopedLabel(field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form, [data-testid*="attachment"], [class*="marginY--"], [class*="fieldWrapper"]'));

    let ancestor = field.parentElement;
    for (let depth = 0; depth < 6 && ancestor && !hasDirectLabel; depth += 1) {
      addScopedLabel(ancestor);
      ancestor = ancestor.parentElement;
    }

    const labelledBy = cleanText(field.getAttribute('aria-labelledby') || '');
    if (labelledBy) {
      const labelledText = labelledBy
        .split(/\s+/)
        .map((id) => queryFieldRoots(field, `#${CSS.escape(id)}`)[0]?.textContent || '')
        .filter(Boolean)
        .join(' ');
      addDirectLabel(labelledText);
    }
    addDirectLabel(field.getAttribute('aria-label') || '');
    addDirectLabel(field.getAttribute('placeholder') || '');
    addIdentity(field.name || '');
    addIdentity(field.id || '');
    if (!hasDirectLabel) addDirectLabel(getNearbyQuestionText(field));
    return normalize(parts.join(' '));
  };

  const getCurrentFieldValue = (field) => {
    if (!field) return '';
    const tag = field.tagName?.toLowerCase?.() || '';
    if (tag === 'select') {
      return cleanText(field.selectedOptions?.[0]?.textContent || field.value || '');
    }
    if (field.type === 'checkbox' || field.type === 'radio') {
      return field.checked ? cleanText(field.value || 'Yes') : '';
    }
    return cleanText(field.value || field.textContent || '');
  };

  const isFieldAlreadyFilled = (field) => {
    const value = getCurrentFieldValue(field);
    return Boolean(value) && !GENERIC_FIELD_LABEL_PATTERN.test(normalize(value));
  };

  const SENSITIVE_FIELD_RULES = [
    {
      id: 'work_authorization',
      label: 'work authorization',
      pattern: /work authorization|authorized to work|legally authorized|eligible to work|right to work/,
      explicitAnswerKeys: ['workAuthorization', 'authorizedToWork', 'rightToWork', 'eligibleToWork'],
    },
    {
      id: 'sponsorship',
      label: 'visa or sponsorship',
      pattern: /sponsor|sponsorship|visa|h[- ]?1b|work permit|immigration.*support|require.*support/,
      explicitAnswerKeys: ['requiresSponsorship', 'visaSponsorship', 'needsSponsorship', 'requiresVisaSponsorship'],
    },
    {
      id: 'compensation',
      label: 'compensation',
      pattern: /salary|compensation|expected pay|pay expectation|current ctc|expectedctc|annualsalary|pay range/,
      explicitAnswerKeys: ['salaryExpectation', 'expectedSalary', 'currentSalary', 'salaryCurrent', 'salaryCurrency'],
    },
    {
      id: 'gender',
      label: 'gender',
      pattern: /\bgender\b|\bsex\b/,
      explicitAnswerKeys: ['gender', 'sex'],
    },
    {
      id: 'pronouns',
      label: 'pronouns',
      pattern: /pronoun/,
      explicitAnswerKeys: ['pronouns'],
    },
    {
      id: 'race_ethnicity',
      label: 'race or ethnicity',
      pattern: /race|ethnicity/,
      explicitAnswerKeys: ['raceEthnicity', 'race', 'ethnicity'],
    },
    {
      id: 'hispanic_latino',
      label: 'Hispanic or Latino',
      pattern: /hispanic|latino|latina|latinx/,
      explicitAnswerKeys: ['hispanicLatino'],
    },
    {
      id: 'veteran_status',
      label: 'veteran status',
      pattern: /veteran/,
      explicitAnswerKeys: ['veteranStatus'],
    },
    {
      id: 'disability_status',
      label: 'disability status',
      pattern: /disability|disabled/,
      explicitAnswerKeys: ['disabilityStatus'],
    },
    {
      id: 'legal_age',
      label: 'age confirmation',
      pattern: /18 years|age or older|over 18|at least 18/,
      explicitAnswerKeys: ['isAdult', 'ageOver18'],
    },
    {
      id: 'background_check',
      label: 'background check',
      pattern: /background.*check|criminal record|conviction/,
      explicitAnswerKeys: ['backgroundCheckConsent', 'backgroundCheck', 'criminalRecord'],
    },
    {
      id: 'privacy_consent',
      label: 'privacy or consent',
      pattern: /privacy|data retention|data processing|recruiting.*consent|consent to|agree to/,
      explicitAnswerKeys: ['privacyConsent', 'dataProcessingConsent', 'recruitingConsent'],
    },
  ];

  const DEFAULT_OR_UNSAFE_VALUES = /^(yes|no|true|false|prefer not|prefer not to answer|decline|do not wish|not disclose|rather not|n\/?a|na)$/i;

  const hasExplicitAnswer = (candidateProfile = {}, keys = []) => {
    const answers = candidateProfile?.answers && typeof candidateProfile.answers === 'object' ? candidateProfile.answers : {};
    return keys.some((key) => cleanText(answers[key]) !== '');
  };

  const getSensitiveRule = (meta = '') => (
    SENSITIVE_FIELD_RULES.find((rule) => rule.pattern.test(meta)) || null
  );

  const evaluateAutofillValueSafety = ({
    field = null,
    meta = '',
    value = '',
    source = 'profile',
  } = {}) => {
    const safetyMeta = normalize([meta, getFieldIdentity(field), getHiresomeFieldHint(field)].filter(Boolean).join(' '));
    const normalizedValue = cleanText(value);
    const rule = getSensitiveRule(safetyMeta);
    const explicitAnswer = rule ? hasExplicitAnswer(profile, rule.explicitAnswerKeys) : true;
    const sourceText = normalize(source);
    const sourceIsExplicit = /explicit|profile|candidate|resumeats/.test(sourceText) && explicitAnswer;
    let score = safetyMeta.length >= 18 ? 78 : 58;
    const reasons = [];

    if (!normalizedValue) {
      return {
        score: 0,
        shouldFill: false,
        sensitive: Boolean(rule),
        sensitiveType: rule?.id || '',
        reason: 'No answer was available for this field.',
      };
    }

    if (field?.required || field?.getAttribute?.('aria-required') === 'true') score += 4;
    if (isFieldAlreadyFilled(field)) score -= 16;

    if (rule) {
      score -= 10;
      if (!explicitAnswer) {
        score -= 38;
        reasons.push(`missing explicit ${rule.label} answer`);
      } else if (sourceIsExplicit) {
        score += 8;
      }
      if (DEFAULT_OR_UNSAFE_VALUES.test(normalizedValue) && !sourceIsExplicit) {
        score -= 18;
        reasons.push('default answer requires review');
      }
    }

    const shouldFill = score >= 72;

    return {
      score,
      shouldFill,
      sensitive: Boolean(rule),
      sensitiveType: rule?.id || '',
      reason: shouldFill ? '' : reasons.join(', ') || 'low-confidence field mapping',
    };
  };

  const markFieldForAutofillReview = (field, review = {}) => {
    if (!field?.setAttribute) return;
    const reason = cleanText(review.reason || 'Review this field before submitting.');
    field.dataset.resumeatsReviewNeeded = 'true';
    field.dataset.resumeatsReviewReason = reason;
    field.style.outline = '2px solid #f59e0b';
    field.style.outlineOffset = '2px';
    const existingTitle = cleanText(field.getAttribute('title') || '');
    const reviewTitle = `ResumeATS skipped autofill: ${reason}`;
    if (!existingTitle.includes(reviewTitle)) {
      field.setAttribute('title', [existingTitle, reviewTitle].filter(Boolean).join('\n'));
    }
  };

  const clearFieldAutofillReview = (field) => {
    if (!field?.removeAttribute || field.dataset?.resumeatsReviewNeeded !== 'true') return;
    delete field.dataset.resumeatsReviewNeeded;
    delete field.dataset.resumeatsReviewReason;
    field.style.outline = '';
    field.style.outlineOffset = '';
  };

  const summarizeAutofillReviewField = (field, meta, review = {}) => ({
    label: cleanText(getLabelText(field) || meta).slice(0, 140),
    reason: cleanText(review.reason || 'low-confidence field mapping'),
    score: Number(review.score || 0),
    sensitive: Boolean(review.sensitive),
    sensitiveType: review.sensitiveType || '',
  });

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

  const dispatchInputEvents = (field) => {
    const EventCtor = field?.ownerDocument?.defaultView?.Event || Event;
    ['input', 'change'].forEach((eventName) => {
      field.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
    });
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
    const disclosureOptOut = /prefer not|decline|choose not|do not wish|don't wish|not disclose|rather not/;
    if (disclosureOptOut.test(desired) && disclosureOptOut.test(option)) return 90;
    if (/^(true|yes|y|1)$/i.test(`${desiredValue}`) && /\byes\b|authorized|eligible|agree/.test(option)) return 88;
    if (/^(false|no|n|0)$/i.test(`${desiredValue}`) && /\bno\b|not authorized|do not|decline|not (?:a )?protected veteran|don't have a disability|do not have a disability/.test(option)) return 88;

    const desiredTokens = new Set(desired.split(/[^a-z0-9]+/).filter((token) => token.length > 1));
    const optionTokens = option.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
    const overlap = optionTokens.filter((token) => desiredTokens.has(token)).length;
    return overlap > 0 ? Math.round((overlap / Math.max(desiredTokens.size, optionTokens.length)) * 72) : 0;
  };

  const optionLooksSelectable = (element) => {
    if (!element || !isVisible(element) || element.getAttribute('aria-disabled') === 'true') return false;
    const nestedOptionCount = element.querySelectorAll?.('[role="option"], [role="menuitem"], [cmdk-item], [data-radix-collection-item], [data-select-item], li[aria-selected]')?.length || 0;
    if (nestedOptionCount > 1) return false;
    const text = cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
    return Boolean(text) && text.length <= 180 && !/^(select|choose|loading|no options|no results)$/i.test(text);
  };

  const collectCustomChoiceOptions = (field) => {
    const controlsId = cleanText(field.getAttribute?.('aria-controls') || field.getAttribute?.('aria-owns') || '');
    const selectors = [
      controlsId ? `#${CSS.escape(controlsId)} [role="option"]` : '',
      controlsId ? `#${CSS.escape(controlsId)} li` : '',
      controlsId ? `#${CSS.escape(controlsId)} [cmdk-item]` : '',
      controlsId ? `#${CSS.escape(controlsId)} [data-value]` : '',
      '[role="option"]',
      '[role="menu"] [role="menuitem"]',
      '[cmdk-item]',
      '[data-radix-collection-item]',
      '[data-select-item]',
      '[data-value]',
      '.select__option',
      '.Select-option',
      '[class*="option"]',
      '[data-testid*="option"]',
      'li[aria-selected]',
    ].filter(Boolean);
    const seen = new Set();
    const options = [];

    for (const root of getFieldSearchRoots(field)) {
      if (!root?.querySelectorAll) continue;
      for (const selector of selectors) {
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

  const setCustomChoiceValue = async (field, value) => {
    if (!isCustomChoiceControl(field)) return false;
    const primarySearch = `${value}`.slice(0, 48);
    const shortSearch = cleanText(`${value}`).split(',')[0]?.slice(0, 48) || primarySearch;
    let options = await openCustomChoiceControl(field);
    if (options.length === 0) {
      options = await openCustomChoiceControl(field, primarySearch);
    }
    let best = options
      .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
      .sort((left, right) => right.score - left.score)[0];
    if ((!best || best.score < 45) && field.tagName?.toLowerCase?.() === 'input') {
      options = await openCustomChoiceControl(field, shortSearch);
      best = options
        .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
        .sort((left, right) => right.score - left.score)[0];
    }
    if (best?.score >= 45) {
      best.element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      const view = best.element.ownerDocument?.defaultView || window;
      ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
        const EventCtor = eventName.startsWith('pointer') ? view.PointerEvent || view.MouseEvent : view.MouseEvent;
        best.element.dispatchEvent(new EventCtor(eventName, { bubbles: true, cancelable: true, view }));
      });
      await delay(160);
      field.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      field.blur?.();
      dispatchFieldEvents(field);
      return true;
    }
    if (field.tagName?.toLowerCase?.() === 'input' && field.getAttribute('aria-readonly') !== 'true') {
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

  const buildCandidatePitch = () => {
    const candidate = buildNormalizedCandidate(profile);
    const topSkills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).slice(0, 4) : [];
    const intro = [
      candidate.currentTitle ? `I am a ${candidate.currentTitle}` : 'I am a candidate',
      candidate.currentCompany ? `currently working at ${candidate.currentCompany}` : '',
      candidate.location ? `based in ${candidate.location}` : '',
    ].filter(Boolean).join(' ');
    const skills = topSkills.length > 0 ? `My strongest areas include ${topSkills.join(', ')}.` : '';
    return cleanText([intro, skills].filter(Boolean).join(' ')).slice(0, 900);
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

  const resolveFieldValue = (meta, field = null) => {
    const candidate = buildNormalizedCandidate(profile);
    const answers = profile?.answers || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const candidatePitch = buildCandidatePitch();
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
    if (/\bgender\b|\bsex\b/.test(fieldIdentity)) return answers.gender;
    if (/\brace\b|ethnicity/.test(fieldIdentity)) return answers.raceEthnicity;
    if (/hispanic|latino|latina|latinx/.test(fieldIdentity)) return answers.hispanicLatino;
    if ((isCustomChoiceControl(field) || field?.tagName?.toLowerCase?.() === 'select') && phoneFieldPattern.test(fieldMeta)) return phoneCountryCode;
    if (phoneFieldPattern.test(fieldMeta)) return candidate.phone;
    if (/work authorization|authorized to work|legally authorized/.test(fieldMeta)) return answers.workAuthorization;
    if (/sponsor|sponsorship|visa|h[- ]?1b|work permit/.test(fieldMeta)) return answers.requiresSponsorship;
    if (/preferred location|preferredlocation|bevorzugter standort/.test(fieldMeta)) return preferredLocation || answers.preferredWorkSetup || candidate.location;
    if (/salary currency/.test(fieldMeta)) return resolveSalaryCurrency(answers);
    if (/current salary|current ctc|annualsalary|aktuelles gehalt/.test(fieldMeta)) return answers.currentSalary || answers.salaryCurrent;
    if (/expected.*salary|salary.*expect|expectedctc|erwartetes gehalt|compensation|expected pay|pay expectation/.test(fieldMeta)) return answers.salaryExpectation;
    if (/years.*experience|experience.*years|totalexperience|gesamte arbeitserfahrung/.test(fieldMeta)) return answers.yearsOfExperience;
    if (/highest degree|highest qualification|highestdegree|h\u00f6chste qualifikation|hoechste qualifikation/.test(fieldMeta)) return answers.highestEducation;
    if (/available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/.test(fieldMeta)) return answers.noticePeriod || 'Two weeks notice';
    if (/current company|current employer|present employer|employer name|currentcompany|aktuelles unternehmen/.test(fieldMeta)) return answers.currentCompany || candidate.currentCompany;
    if (/current title|job title|current role|current designation|currentdesignation|aktuelle funktion/.test(fieldMeta)) return answers.currentTitle || candidate.currentTitle;
    if (/city|town/.test(fieldMeta)) return answers.city || locationParts[0] || candidate.location;
    if (/\bstate\b|\bprovince\b|state region/.test(fieldMeta)) return normalizeUsStateAnswer(answers.stateProvince || answers.state);
    if (/\bcountry\b/.test(fieldMeta)) return answers.country || locationParts.at(-1) || candidate.location;
    if (/\bregion\b/.test(fieldMeta)) return answers.stateProvince || answers.state || answers.country || locationParts.at(-1) || candidate.location;
    if (/location|standort|address/.test(fieldMeta)) {
      return isCustomChoiceControl(field) ? (answers.city || locationParts[0] || candidate.location) : candidate.location;
    }
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
    if (/school|university|college/.test(fieldMeta)) return answers.school;
    if (/highest degree|highest qualification|highestdegree|h\u00f6chste qualifikation|hoechste qualifikation/.test(fieldMeta)) return answers.highestEducation;
    if (/degree.*pursu|pursuing.*degree/.test(fieldMeta)) return answers.degreePursuing || answers.highestEducation;
    if (/degree/.test(fieldMeta)) return answers.highestEducation;
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
    if (/pronoun/.test(fieldMeta)) return answers.pronouns;
    if (/gender/.test(fieldMeta)) return answers.gender;
    if (/race|ethnicity/.test(fieldMeta)) return answers.raceEthnicity;
    if (/hispanic|latino/.test(fieldMeta)) return answers.hispanicLatino;
    if (/veteran/.test(fieldMeta)) return answers.veteranStatus;
    if (/disability|disabled/.test(fieldMeta)) return answers.disabilityStatus;
    if (/cover letter|message to the hiring team|about you|tell us about yourself|about your background|changing your career|learning software development|why (?:are you interested|this role|do you want)/.test(fieldMeta)) return candidatePitch;
    if (/summary|professional summary|candidate summary/.test(fieldMeta)) return candidatePitch;
    if (/available|start date|notice period|noticeperiod|k\u00fcndigungsfrist|kuendigungsfrist/.test(fieldMeta)) return answers.noticePeriod || 'Two weeks notice';
    return null;
  };

  const setFieldValue = async (field, value) => {
    if (!field || value === undefined || value === null || value === '' || !isVisible(field)) return false;
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
      setNativeValue(field, 'value', option.entry.value);
      dispatchFieldEvents(field);
      return true;
    }
    if (field.type === 'checkbox') {
      setNativeValue(field, 'checked', /^(true|yes|1)$/i.test(`${value}`));
      dispatchFieldEvents(field);
      return true;
    }
    if (field.type === 'radio') {
      const candidates = queryFieldRoots(field, `input[type="radio"][name="${CSS.escape(field.name || '')}"]`);
      const target = candidates
        .map((entry) => ({
          entry,
          score: scoreOptionMatch(`${entry.value || ''} ${getLabelText(entry)}`, value),
        }))
        .sort((left, right) => right.score - left.score)[0];
      if (!target || target.score < 45) return false;
      candidates.forEach((entry) => setNativeValue(entry, 'checked', entry === target.entry));
      dispatchFieldEvents(target.entry);
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

    const uploadResumeFile = async (input) => {
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
    const file = new File([blob], profile?.documents?.resumeFilename || 'ResumeATS_Resume.pdf', { type: 'application/pdf' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    dispatchFieldEvents(input);
    return true;
  };

  const shouldUploadResumeFile = (input) => {
    if (!input) return false;
    const documents = profile?.documents || {};
    if (!documents.resumePdfUrl) return false;
    if (!input.files?.length) return true;
    if (documents.preparedResumeId || documents.preparedForUrl || documents.preparedAt) return true;
    const desiredFilename = cleanText(documents.resumeFilename).toLowerCase();
    if (!desiredFilename) return false;
    return !Array.from(input.files).some((file) => cleanText(file?.name).toLowerCase() === desiredFilename);
  };

  const fields = Array.from(new Set(queryAll('input, textarea, select, [role="combobox"], [aria-haspopup="listbox"], button[class*="select"], button[class*="dropdown"]')))
    .filter((field) => field && field.type !== 'hidden' && isVisible(field));
  let filledCount = 0;
  let labeledFieldCount = 0;
  let mappableFieldCount = 0;
  let reviewFieldCount = 0;
  const reviewFields = [];
  const noteReviewField = (field, meta, review) => {
    reviewFieldCount += 1;
    markFieldForAutofillReview(field, review);
    if (reviewFields.length >= 8) return;
    const summary = summarizeAutofillReviewField(field, meta, review);
    if (!summary.label || reviewFields.some((entry) => entry.label === summary.label)) return;
    reviewFields.push(summary);
  };
  const shouldFillResolvedValue = (field, meta, value) => {
    const review = evaluateAutofillValueSafety({ field, meta, value, source: 'profile' });
    if (!review.shouldFill) {
      noteReviewField(field, meta, review);
      return false;
    }
    clearFieldAutofillReview(field);
    return true;
  };
  const processedRadioNames = new Set();

  for (const field of fields) {
    const meta = getLabelText(field);
    if (meta) labeledFieldCount += 1;
    if (!meta || field.type === 'file') continue;
    if (field.type === 'radio' && processedRadioNames.has(field.name || '')) continue;
    if (field.type === 'radio' && field.name) processedRadioNames.add(field.name);
    const value = resolveFieldValue(meta, field);
    if (value !== null && value !== undefined && value !== '') mappableFieldCount += 1;
    if (value && shouldFillResolvedValue(field, meta, value) && await setFieldValue(field, value)) filledCount += 1;
  }

  const resumeInput = findResumeInput();
  if (shouldUploadResumeFile(resumeInput)) {
    try {
      const uploaded = await uploadResumeFile(resumeInput);
      if (uploaded) filledCount += 1;
    } catch (error) {
      return {
        ok: false,
        filledCount,
        accessibleFieldCount: fields.length,
        labeledFieldCount,
        mappableFieldCount,
        needsReview: reviewFieldCount > 0,
        reviewFieldCount,
        reviewFields,
        resumeInputPresent: Boolean(resumeInput),
        uploadError: error?.message || 'Resume upload failed',
      };
    }
  }

  return {
    ok: true,
    usedMainWorldFallback: true,
    filledCount,
    accessibleFieldCount: fields.length,
    labeledFieldCount,
    mappableFieldCount,
    needsReview: reviewFieldCount > 0,
    reviewFieldCount,
    reviewFields,
    resumeInputPresent: Boolean(resumeInput),
  };
};

const runMainWorldAutofill = async (tabId, profile) => {
  await assertProfileAccount(profile);
  await getResumeSelectionForTab(tabId);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: mainWorldAutofillFunction,
    args: [buildMainWorldProfile(getProfileWithoutResumeUpload(profile))],
  });

  return result?.result || {
    ok: false,
    error: 'Main-world autofill did not return a result',
    filledCount: 0,
  };
};

const mergeAutofillResponses = (entries = []) => {
  const successful = entries.filter((entry) => entry.response?.ok);
  const filled = successful.filter((entry) => (entry.response?.filledCount || 0) > 0);
  const best = (filled.length > 0 ? filled : successful)
    .sort((left, right) => (right.response?.filledCount || 0) - (left.response?.filledCount || 0))[0];

  if (!best) {
    const first = entries[0]?.response;
    return first || { ok: false, error: 'Could not communicate with the application page.' };
  }

  const reviewFieldCount = successful.reduce((sum, entry) => sum + Number(entry.response?.reviewFieldCount || 0), 0);
  const reviewFields = successful
    .flatMap((entry) => (Array.isArray(entry.response?.reviewFields) ? entry.response.reviewFields : []))
    .filter(Boolean)
    .slice(0, 8);

  if (filled.length <= 1) {
    return {
      ...best.response,
      needsReview: Boolean(best.response?.needsReview || reviewFieldCount > 0),
      reviewFieldCount,
      reviewFields: reviewFields.length > 0 ? reviewFields : best.response?.reviewFields,
    };
  }

  const totalFilled = filled.reduce((sum, entry) => sum + (entry.response?.filledCount || 0), 0);
  const totalAccessible = successful.reduce((sum, entry) => sum + (entry.response?.accessibleFieldCount || 0), 0);
  const totalLabeled = successful.reduce((sum, entry) => sum + (entry.response?.labeledFieldCount || 0), 0);
  const totalMappable = successful.reduce((sum, entry) => sum + (entry.response?.mappableFieldCount || 0), 0);

  return {
    ...best.response,
    filledCount: totalFilled,
    accessibleFieldCount: totalAccessible,
    labeledFieldCount: totalLabeled,
    mappableFieldCount: totalMappable,
    needsReview: Boolean(best.response?.needsReview || reviewFieldCount > 0),
    reviewFieldCount,
    reviewFields,
    frameResults: filled.map((entry) => ({
      frameId: entry.frameId,
      frameUrl: entry.frameUrl,
      filledCount: entry.response?.filledCount || 0,
      provider: entry.response?.provider || '',
    })),
  };
};

const requestAutofillApplication = async (tabId, payload) => {
  await assertProfileAccount(payload.profile);
  const record = await getResumeSelectionForTab(tabId, payload.job?.url);
  if (record.ownerId !== payload.profile?.candidate?.userId) throw selectionError('Your account changed. Choose the resume again.');
  const frames = await getInspectableFrames(tabId);
  await verifyHandoff(record, { validateRevision: true });
  const safePayload = { profile: getProfileWithoutResumeUpload(payload.profile), job: record.jobSnapshot, autoSubmit: false };
  // Bytes go to one validated employer top frame, never a generic broadcast,
  // app response, main-world script, or persistent cached profile.
  const top = await sendFrameMessage(tabId, 0, {
    type: 'AUTOFILL_APPLICATION',
    payload: { ...safePayload, resumeAttachment: { handoffId: record.handoffId, targetUrl: record.targetUrl, artifact: record.selection.document } },
  });
  const responses = [{ frameId: 0, frameUrl: record.targetUrl, response: top }];
  if (!top?.ok || top.pendingNavigation) return mergeAutofillResponses(responses);
  await verifyHandoff(record, { validateRevision: true });
  for (const frame of frames.filter((entry) => entry.frameId !== 0)) {
    const assertSession = await verifyHandoff(record);
    assertSession();
    const response = await sendFrameMessage(tabId, frame.frameId, {
      type: 'AUTOFILL_APPLICATION', payload: { ...safePayload, profileOnly: true },
    }).catch(() => null);
    if (response) responses.push({ frameId: frame.frameId, frameUrl: frame.url, response });
  }
  return {
    ...mergeAutofillResponses(responses),
    resumeAttached: Boolean(top.resumeAttached),
    attachmentNeedsManualAction: !top.resumeAttached && Boolean(top.attachmentNeedsManualAction),
  };
};

const shouldRetryAutofillResponse = (response = {}) => {
  if (!response?.ok || response.pendingNavigation || (response.filledCount || 0) > 0) {
    return false;
  }

  if ((response.accessibleFieldCount || 0) === 0) {
    return true;
  }

  const reason = `${response.zeroFillReason || ''}`.toLowerCase();
  return reason.includes('no visible form fields')
    || reason.includes('form shell')
    || reason.includes('fillable application questions yet');
};

const autofillTabWithFallbacks = async (tabId, payload) => {
  let response = await requestAutofillApplication(tabId, payload);

  for (const retryDelayMs of AUTOFILL_RETRY_DELAYS_MS) {
    if (!shouldRetryAutofillResponse(response)) {
      break;
    }

    await delay(retryDelayMs);
    response = await requestAutofillApplication(tabId, payload);
  }

  if (response?.ok && (response.filledCount || 0) === 0) {
    try {
      const mainWorldResponse = await runMainWorldAutofill(tabId, payload.profile);
      if (mainWorldResponse?.ok && (mainWorldResponse.filledCount || 0) > 0) {
        response = {
          ...response,
          ...mainWorldResponse,
          zeroFillReason: '',
        };
      }
    } catch {
      // Keep the content-script result when the main-world fallback is unavailable.
    }
  }

  return response;
};

const queryFocusedActiveTab = async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isInspectableJobTab(activeTab)) {
    return activeTab;
  }

  const [currentWindowActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isInspectableJobTab(currentWindowActiveTab)) {
    return currentWindowActiveTab;
  }

  return null;
};

const findRecentInspectableTab = async () => {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => isInspectableJobTab(tab))
    .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0] || null;
};

const findMostRecentActiveInspectableTab = async () => {
  const tabs = await chrome.tabs.query({ active: true });
  return tabs
    .filter((tab) => isInspectableJobTab(tab))
    .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0] || null;
};

const resolveActionTab = async (sender, { requireInspectable = true, fallbackToRecent = false } = {}) => {
  const senderTab = sender?.tab;
  if (senderTab?.id && (!requireInspectable || isInspectableJobTab(senderTab))) {
    return senderTab;
  }

  const focusedActiveTab = await queryFocusedActiveTab();
  if (focusedActiveTab?.id) {
    return focusedActiveTab;
  }

  const mostRecentActiveInspectableTab = await findMostRecentActiveInspectableTab();
  if (mostRecentActiveInspectableTab?.id) {
    return mostRecentActiveInspectableTab;
  }

  const recentInspectableTab = await findRecentInspectableTab();
  if (recentInspectableTab?.id) {
    return recentInspectableTab;
  }

  if (!fallbackToRecent) {
    return null;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const candidates = tabs
    .filter((tab) => !requireInspectable || isInspectableJobTab(tab))
    .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0));

  return candidates[0] || null;
};

const findCaptureCandidateTab = async (sender = null) => {
  const directTarget = await resolveActionTab(sender, {
    requireInspectable: true,
    fallbackToRecent: false,
  });

  if (directTarget?.id) {
    return directTarget;
  }

  return findRecentInspectableTab();
};

const resolveSidePanelWindowId = async (sender) => {
  if (typeof sender?.tab?.windowId === 'number') {
    return sender.tab.windowId;
  }

  const activeTab = await queryFocusedActiveTab();
  if (typeof activeTab?.windowId === 'number') {
    return activeTab.windowId;
  }

  const currentWindow = await chrome.windows.getCurrent().catch(() => null);
  if (typeof currentWindow?.id === 'number') {
    return currentWindow.id;
  }

  return null;
};

const configureCompanionSurface = async () => {
  if (chrome.sidePanel?.setOptions) {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
      enabled: true,
    }).catch(() => {});
  }

  if (chrome.sidebarAction?.setPanel) {
    await chrome.sidebarAction.setPanel({ panel: 'sidepanel.html' }).catch(() => {});
  }

  if (chrome.sidebarAction?.setTitle) {
    const manifestName = chrome.runtime?.getManifest?.()?.name || 'ResumeATS Browser Agent';
    await chrome.sidebarAction.setTitle({ title: manifestName }).catch(() => {});
  }
};

const prepareActiveTabAutofillContext = async (sender) => {
  const activeTab = await resolveActionTab(sender, { requireInspectable: true, fallbackToRecent: false });
  if (!isInspectableJobTab(activeTab)) throw new Error('Open a supported job or application page first.');
  // Selection is checked before profile synchronization or any partial fill.
  const selection = await getResumeSelectionForTab(activeTab.id);
  const state = await getVerifiedAutofillState();
  const missing = getMissingAutofillProfileFields(state.profile);
  if (missing.length) throw new Error(buildMissingProfileMessage(missing));
  if (state.profile?.candidate?.userId !== selection.ownerId) throw selectionError('Your account changed. Choose the resume again.');
  return {
    activeTab, activeJob: selection.jobSnapshot,
    effectiveProfile: getProfileWithoutResumeUpload(state.profile),
    preparedResume: selection.selection.resume,
  };
};

const prepareActiveTabResume = async (sender) => {
  const intent = ++resumeBeginIntent;
  if (!chrome.alarms?.create || !chrome.alarms?.onAlarm) throw selectionError('This browser cannot expire a saved selection safely. Update it or attach the PDF manually.');
  const sessionVersion = profileSessionVersion;
  const assertSession = () => {
    if (sessionVersion !== profileSessionVersion) throw selectionError('Your session changed. Choose the resume again.');
    if (intent !== resumeBeginIntent) throw selectionError('A newer resume selection replaced this request.');
  };
  const tab = await resolveActionTab(sender, { requireInspectable: true, fallbackToRecent: false });
  if (!isInspectableJobTab(tab)) throw new Error('Open a supported job or application page first.');
  const state = await getState(); assertSession();
  const appTab = await getOrCreateAppTab(state.profile); assertSession();
  const { userId } = await requestHandoffApp(appTab.id, 'APP_AUTH_STATE_REQUEST', {}); assertSession();
  if (!userId) throw new Error('Sign in to ResumeATS before choosing a resume.');
  if (state.profile?.candidate?.userId && state.profile.candidate.userId !== userId) {
    await invalidateProfileSession();
    throw selectionError('Your account changed. Reconnect ResumeATS, then choose a resume.');
  }
  const snapshot = await ensureSnapshotForTab(tab, state); assertSession();
  const currentTab = await chrome.tabs.get(tab.id); assertSession();
  if (!urlsMatch(currentTab?.url, tab.url)) throw selectionError('The job tab changed. Start selection on the current page.');
  const identity = await requestHandoffApp(appTab.id, 'APP_AUTH_STATE_REQUEST', {}); assertSession();
  if (identity.userId !== userId) throw selectionError('Your account changed. Choose the resume again.');
  const record = await resumeHandoffs.begin({
    ownerId: userId, tabId: tab.id, appTabId: appTab.id, appOrigin: new URL(appTab.url).origin, targetUrl: tab.url,
    jobSnapshot: { ...(snapshot || {}), title: snapshot?.title || tab.title || 'Active Job' },
  }, assertSession);
  try {
    await chrome.alarms.create(RESUME_HANDOFF_EXPIRY_ALARM, { when: record.expiresAt });
    assertSession(); await resumeHandoffs.assertCurrent(record);
    await chrome.tabs.update(appTab.id, {
      active: true, url: `${new URL(appTab.url).origin}/#/ai-generator?extensionRequest=${encodeURIComponent(record.handoffId)}`,
    });
    assertSession(); await resumeHandoffs.assertCurrent(record);
  } catch (error) { await resumeHandoffs.cancel(record); throw error; }
  return { ok: true, status: 'review_required', handoffId: record.handoffId, appTabId: appTab.id, job: record.jobSnapshot };
};

const performActiveTabAutofillParallel = async (sender) => {
  const prepared = await prepareActiveTabAutofillContext(sender);
  const response = await autofillTabWithFallbacks(prepared.activeTab.id, {
    profile: prepared.effectiveProfile,
    job: { ...prepared.activeJob, id: 'active-tab' },
    autoSubmit: false,
  });
  if (!response?.ok) throw new Error(response?.error || 'Could not autofill the current application.');
  return {
    activeTab: prepared.activeTab,
    result: { ...response, preparedResume: prepared.preparedResume },
    summary: getStateSummary(await getState()),
  };
};
const openCompanionSurface = async (sender) => {
  if (chrome.sidePanel?.open) {
    const windowId = await resolveSidePanelWindowId(sender);
    if (typeof windowId !== 'number') {
      throw new Error('Could not determine which browser window should open the side panel.');
    }

    await chrome.sidePanel.open({ windowId });
    return { ok: true, mode: 'sidepanel' };
  }

  if (chrome.sidebarAction?.open) {
    await chrome.sidebarAction.open();
    return { ok: true, mode: 'sidebar' };
  }

  throw new Error('This browser version does not support extension companion panels.');
};

const waitForTabReady = async (tabId, timeoutMs = 20000) => new Promise((resolve, reject) => {
  let timeoutId = null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    chrome.tabs.onUpdated.removeListener(handleUpdate);
    chrome.tabs.onRemoved.removeListener(handleRemoved);
  };

  const handleUpdate = (updatedTabId, changeInfo) => {
    if (updatedTabId !== tabId) return;
    if (changeInfo.status === 'complete') {
      cleanup();
      resolve();
    }
  };

  const handleRemoved = (removedTabId) => {
    if (removedTabId !== tabId) return;
    cleanup();
    reject(new Error('ResumeATS tab closed before the bridge became ready.'));
  };

  chrome.tabs.onUpdated.addListener(handleUpdate);
  chrome.tabs.onRemoved.addListener(handleRemoved);

  timeoutId = setTimeout(() => {
    cleanup();
    reject(new Error('Timed out waiting for ResumeATS to load.'));
  }, timeoutMs);

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      cleanup();
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }

    if (tab?.status === 'complete') {
      cleanup();
      resolve();
    }
  });
});

const getExistingAppTab = async (baseUrl) => {
  const existingTabs = await chrome.tabs.query({});
  return existingTabs.find((tab) => isSameAppOrigin(tab.url || '', baseUrl))
    || existingTabs.find((tab) => isAppUrl(tab.url || ''))
    || null;
};

const getOrCreateAppTab = async (profile = null) => {
  const baseUrl = getResumeAtsBaseUrl(profile);
  const existing = await getExistingAppTab(baseUrl);

  if (existing?.id) {
    await waitForTabReady(existing.id).catch(() => {});
    return existing;
  }

  const created = await chrome.tabs.create({
    url: `${baseUrl}/#/dashboard`,
    active: false,
  });

  await waitForTabReady(created.id).catch(() => {});
  await delay(600);
  return created;
};

const ensureAppBridgeInjected = async (tab) => {
  if (!tab?.id || !isAppUrl(tab.url || '')) return false;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [APP_BRIDGE_SCRIPT_FILE],
    });
    await delay(150);
    return true;
  } catch {
    return false;
  }
};

const openResumeAtsRoute = async (route = '/#/', profile = null, active = true) => {
  const baseUrl = getResumeAtsBaseUrl(profile);
  const targetUrl = `${baseUrl}${route}`;
  const isSignInRoute = /^\/#\/signin(?:$|[/?#])/i.test(route);
  const existingTabs = await chrome.tabs.query({});
  const existingAppTab = existingTabs.find((tab) => isSameAppOrigin(tab.url || '', baseUrl));

  if (existingAppTab?.id && !isSignInRoute) {
    await chrome.tabs.update(existingAppTab.id, { active, url: targetUrl });
    if (typeof existingAppTab.windowId === 'number' && active) {
      await chrome.windows.update(existingAppTab.windowId, { focused: true });
    }
    return { ok: true, url: targetUrl, tabId: existingAppTab.id };
  }

  const createdTab = await chrome.tabs.create({ url: targetUrl, active });
  return { ok: true, url: targetUrl, tabId: createdTab.id };
};

const sendMessageToAppTab = async ({ type, payload, profile = null, timeoutMs = APP_BRIDGE_TIMEOUT_MS }) => {
  const appTab = await getOrCreateAppTab(profile);
  let lastError = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(appTab.id, { type, payload });
      if (response?.ok === false) {
        throw new Error(response.error || 'ResumeATS app bridge request failed.');
      }
      return response;
    } catch (error) {
      lastError = error;
      if (isMissingReceiverError(error)) {
        await ensureAppBridgeInjected(appTab);
      }
      await delay(Math.min(1200, 300 * (attempt + 1)));
    }
  }

  if (isMissingReceiverError(lastError)) {
    throw new Error('Could not connect to the ResumeATS tab. Reload ResumeATS, then click Connect ResumeATS again.');
  }

  throw new Error(lastError?.message || `Could not reach the ResumeATS app bridge within ${timeoutMs}ms.`);
};

// Handoff requests stay pinned to the app tab selected at begin; never pick a
// different tab or retry an application-level error against another account.
const requestHandoffApp = async (appTabId, type, payload) => {
  const tab = await chrome.tabs.get(appTabId);
  if (!tab || !isAppUrl(tab.url)) throw selectionError('The ResumeATS tab closed or changed. Start selection again.');
  let timer;
  try {
    const response = await Promise.race([
      chrome.tabs.sendMessage(appTabId, { type, payload }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(selectionError('ResumeATS did not respond. Reopen it and choose the resume again.')), APP_BRIDGE_TIMEOUT_MS); }),
    ]);
    if (!response || response.ok === false) throw Object.assign(selectionError(response?.error || 'ResumeATS could not verify this saved version.'), { code: response?.code || 'resume_selection_required' });
    return response;
  } finally { clearTimeout(timer); }
};

const verifyHandoff = async (record, { sender, validateRevision = false } = {}) => {
  const sessionVersion = profileSessionVersion;
  const assertSession = () => {
    if (profileSessionVersion !== sessionVersion) throw selectionError('Your session changed. Choose the resume again.');
  };
  if (sender && (sender.tab?.id !== record.appTabId || (sender.frameId ?? 0) !== 0
    || new URL(sender.url || sender.tab?.url).origin !== record.appOrigin)) throw selectionError('This handoff belongs to a different ResumeATS tab.');
  await resumeHandoffs.assertCurrent(record); assertSession();
  const appTab = await chrome.tabs.get(record.appTabId); assertSession();
  if (!appTab || !isAppUrl(appTab.url) || new URL(appTab.url).origin !== record.appOrigin) throw selectionError('The ResumeATS tab changed. Start selection again.');
  const identity = await requestHandoffApp(record.appTabId, 'APP_AUTH_STATE_REQUEST', {}); assertSession();
  if (identity.userId !== record.ownerId) {
    await invalidateProfileSession();
    throw selectionError('Your account changed. Choose the resume again.');
  }
  if (validateRevision) {
    const resume = record.selection?.resume;
    if (!resume) throw selectionError();
    const current = await requestHandoffApp(record.appTabId, 'APP_VALIDATE_SAVED_RESUME_REQUEST', {
      resumeId: resume.id, expectedRevision: resume.revision, expectedUserId: record.ownerId,
    }); assertSession();
    if (current.ownerId !== record.ownerId || current.resumeId !== resume.id || current.revision !== resume.revision) throw selectionError('The saved resume changed. Choose its current version again.');
  }
  const target = await chrome.tabs.get(record.tabId); assertSession();
  if (!target || canonicalJobUrl(target.url) !== record.jobKey) throw selectionError('The original job tab closed or navigated. Choose a resume for the current page.');
  await resumeHandoffs.assertCurrent(record); assertSession();
  return assertSession;
};

const getVerifiedHandoff = async (handoffId, sender) => {
  const record = await resumeHandoffs.read();
  if (!record || record.handoffId !== handoffId) throw selectionError('This resume selection expired or was replaced. Start again from the job tab.');
  await verifyHandoff(record, { sender });
  return record;
};

const completeResumeHandoff = async (payload, sender) => {
  const { handoffId, resumeId, expectedRevision } = payload || {};
  if (typeof resumeId !== 'string' || !resumeId || resumeId.length > 128
    || !Number.isInteger(expectedRevision) || expectedRevision < 1 || expectedRevision > 2147483647) throw selectionError('Choose a confirmed saved resume version.');
  const record = await getVerifiedHandoff(handoffId, sender);
  if (record.selection && (record.selection.resume.id !== resumeId || record.selection.resume.revision !== expectedRevision)) throw selectionError('This handoff already has a different version. Start a new selection.');
  const pending = pendingHandoffCompletions.get(handoffId);
  if (pending) {
    if (pending.resumeId !== resumeId || pending.expectedRevision !== expectedRevision) throw selectionError('Another saved version is already being selected. Start a new selection.');
    return pending.promise;
  }
  const work = (async () => {
    let ready = record;
    if (!record.selection) {
      const assertSession = await verifyHandoff(record, { sender });
      const response = await requestHandoffApp(record.appTabId, 'APP_PREPARE_SAVED_RESUME_REQUEST', {
        handoffId, jobKey: record.jobKey, resumeId, expectedRevision, expectedUserId: record.ownerId,
      }); assertSession();
      await resumeHandoffs.assertCurrent(record); assertSession();
      const selection = await validateSavedResumeArtifact(response, record, resumeId, expectedRevision); assertSession();
      await verifyHandoff({ ...record, selection }, { sender, validateRevision: true }); assertSession();
      ready = await resumeHandoffs.commit(record, selection, assertSession);
    }
    await verifyHandoff(ready, { sender, validateRevision: true });
    await chrome.tabs.update(record.tabId, { active: true });
    // Focus is not autofill, queue advancement, upload, or employer submission.
    await resumeHandoffs.assertCurrent(ready);
    return { ok: true, status: 'ready', handoffId, resume: ready.selection.resume };
  })();
  pendingHandoffCompletions.set(handoffId, { resumeId, expectedRevision, promise: work });
  try { return await work; } finally { pendingHandoffCompletions.delete(handoffId); }
};

const getResumeSelectionForTab = async (tabId, targetUrl) => {
  const record = await resumeHandoffs.read().catch(() => { throw selectionError('The saved selection is unavailable. Choose the resume again.'); });
  if (!record?.selection || record.tabId !== tabId || (targetUrl && canonicalJobUrl(targetUrl) !== record.jobKey)) throw selectionError();
  try {
    // Session storage is not a reason to skip binary integrity checks after wake.
    await validateSavedResumeArtifact({
      status: 'ready', ownerId: record.ownerId, handoffId: record.handoffId, jobKey: record.jobKey,
      resume: record.selection.resume, document: record.selection.document,
    }, record, record.selection.resume.id, record.selection.resume.revision);
    await verifyHandoff(record, { validateRevision: true });
  } catch (error) {
    await resumeHandoffs.cancel(record);
    throw selectionError(error?.message || 'The saved selection could not be verified. Choose it again.');
  }
  return record;
};

const syncProfileFromResumeAts = async ({ resumeId = '', openLoginOnFailure = true } = {}) => {
  let sessionVersion = profileSessionVersion;
  try {
    const response = await sendMessageToAppTab({
      type: 'APP_SYNC_PROFILE_REQUEST',
      payload: {
        resumeId,
        profileOnly: true,
      },
    });

    if (!response?.profile?.candidate?.userId || response.profile.version !== '2026-09-04') {
      throw new Error('Refresh ResumeATS and reconnect the extension to sync a current, account-bound profile.');
    }

    if (sessionVersion !== profileSessionVersion) throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
    const previous = await getState();
    if (sessionVersion !== profileSessionVersion) throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
    if (previous.profile?.candidate?.userId && previous.profile.candidate.userId !== response.profile.candidate.userId) {
      sessionVersion = await invalidateProfileSession();
    }

    const nextState = await saveState({
      profile: response.profile,
      lastSyncedAt: new Date().toISOString(),
    }, { expectedSessionVersion: sessionVersion });
    await clearPendingProfileSync();

    return {
      ...response,
      profile: nextState.profile,
      resume: { id: response.resume?.id || '', title: response.resume?.title || '' },
      state: nextState,
    };
  } catch (error) {
    const message = error?.message || 'Could not sync the ResumeATS profile.';
    if (openLoginOnFailure && isSignInRequiredMessage(message)) {
      await setPendingProfileSync(message);
      await openResumeAtsRoute('/#/signin', null, true);
      throw new Error('Sign in to ResumeATS in the tab that opened. The extension will sync automatically after login.');
    }
    throw new Error(message);
  }
};

const invalidateProfileSession = async () => {
  const sessionVersion = ++profileSessionVersion;
  clearActiveJobTimeout();
  await resumeHandoffs.invalidate();
  await saveState({ profile: null, queue: [], isRunning: false, activeJobId: null, lastSyncedAt: null });
  return sessionVersion;
};

// Never trust a cached account identity after logout or a switch in the app.
const getVerifiedAutofillState = async () => {
  const sessionVersion = profileSessionVersion;
  let state = await getState();
  try {
    const { userId } = await sendMessageToAppTab({ type: 'APP_AUTH_STATE_REQUEST', payload: {}, profile: state.profile });
    if (sessionVersion !== profileSessionVersion) throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
    if (!userId) throw new Error('Sign in to ResumeATS, then reconnect the extension.');
    const cachedOwner = state.profile?.candidate?.userId;
    if (cachedOwner && cachedOwner !== userId) {
      throw new Error('Your ResumeATS account changed. The cached profile and queue were cleared. Reconnect before autofilling.');
    }
    if (!cachedOwner || state.profile.version !== '2026-09-04') {
      state = (await syncProfileFromResumeAts({ openLoginOnFailure: true })).state;
      if (state.profile?.candidate?.userId !== userId) throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
    }
    if (sessionVersion !== profileSessionVersion) throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
    return state;
  } catch (error) {
    if (sessionVersion === profileSessionVersion) await invalidateProfileSession();
    throw error;
  }
};

const assertProfileAccount = async (profile) => {
  const state = await getVerifiedAutofillState();
  if (!profile?.candidate?.userId || state.profile?.candidate?.userId !== profile.candidate.userId) {
    throw new Error('Your ResumeATS account changed. Reconnect before autofilling.');
  }
};

const snapshotMatchesTab = (snapshot, tab) => (
  Boolean(snapshot?.url && tab?.url && urlsMatch(snapshot.url, tab.url))
);

const ensureSnapshotForTab = async (tab, state) => {
  if (!isInspectableJobTab(tab)) {
    return state?.lastJobSnapshot || null;
  }

  if (snapshotMatchesTab(state?.lastJobSnapshot, tab)) {
    return state.lastJobSnapshot;
  }

  try {
    return await captureJobPostingFromTab(tab);
  } catch {
    // A failed scan of a different application must not revive another job's
    // cached description. Apply navigation can be captured afresh, not inferred.
    return null;
  }
};

const dedupeJobs = (existingJobs = [], incomingJobs = []) => {
  const existing = new Map(existingJobs.map((job) => [`${job.id || ''}:${normalizeUrl(job.url)}`, job]));

  incomingJobs.forEach((job) => {
    const key = `${job.id || ''}:${normalizeUrl(job.url)}`;
    const current = existing.get(key);

    existing.set(key, {
      ...(current || {}),
      ...job,
      status: current?.status === 'completed' ? 'completed' : 'queued',
      submittedAt: current?.submittedAt || null,
      lastError: current?.lastError || null,
      tabId: null,
    });
  });

  return Array.from(existing.values());
};

const markJobResult = async ({ jobId, success, details = {}, tabId = null, expectedSessionVersion = profileSessionVersion }) => {
  clearActiveJobTimeout();
  const state = await getState();
  if (expectedSessionVersion !== profileSessionVersion || state.activeJobId !== jobId || !state.isRunning) return;
  const queue = state.queue.map((job) => {
    if (job.id !== jobId) return job;

    return {
      ...job,
      status: success ? 'completed' : 'failed',
      submittedAt: success ? new Date().toISOString() : null,
      lastError: success ? null : details.error || 'Unknown error',
      tabId,
    };
  });

  await saveState({
    queue,
    activeJobId: null,
  }, { expectedSessionVersion, expectedActiveJobId: jobId });

  if (tabId && success) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Ignore tab-close failures.
    }
  }

  void queueNextJob().catch(() => {});
};

const queueNextJob = async () => {
  const sessionVersion = profileSessionVersion;
  const state = await getState();

  if (sessionVersion !== profileSessionVersion || !state.isRunning) return;

  const nextJob = state.queue.find((job) => job.status === 'queued');
  if (!nextJob) {
    await saveState({
      isRunning: false,
      activeJobId: null,
    }, { expectedSessionVersion: sessionVersion, expectedActiveJobId: state.activeJobId });
    return;
  }

  await saveState({
    activeJobId: nextJob.id,
    queue: state.queue.map((job) => (
      job.id === nextJob.id
        ? { ...job, status: 'opening' }
        : job
    )),
  }, { expectedSessionVersion: sessionVersion, expectedActiveJobId: state.activeJobId });

  const tab = await chrome.tabs.create({
    url: nextJob.url,
    active: false,
  });

  if (sessionVersion !== profileSessionVersion) return;
  scheduleActiveJobTimeout(nextJob.id, tab.id, sessionVersion);

  await saveState({
    queue: (await getState()).queue.map((job) => (
      job.id === nextJob.id
        ? { ...job, tabId: tab.id }
        : job
    )),
  }, { expectedSessionVersion: sessionVersion, expectedActiveJobId: nextJob.id });
};

const handleJobPageReady = async (payload, sender) => {
  const sessionVersion = profileSessionVersion;
  const state = await getState();
  const activeJob = state.queue.find((job) => job.id === state.activeJobId);

  if (!state.isRunning || !activeJob || !sender.tab?.id || (sender.frameId ?? 0) !== 0) {
    return { ignored: true };
  }

  if (activeJob.tabId && activeJob.tabId !== sender.tab.id) {
    return { ignored: true };
  }

  scheduleActiveJobTimeout(activeJob.id, sender.tab.id);

  try {
    const response = await autofillTabWithFallbacks(sender.tab.id, {
      profile: state.profile,
      job: activeJob,
      autoSubmit: false,
    });

    if (sessionVersion !== profileSessionVersion) return { ignored: true };

    if (response?.requiresManualSubmission || response?.needsReview) {
      await saveState({ isRunning: false, activeJobId: null, queue: (await getState()).queue.map((job) => (
        job.id === activeJob.id ? { ...job, status: 'needs_review', lastError: 'Review the answers and submit this application yourself.', tabId: sender.tab.id } : job
      )) }, { expectedSessionVersion: sessionVersion, expectedActiveJobId: activeJob.id });
      clearActiveJobTimeout();
      return { ok: true, needsReview: true };
    }

    if (response?.pendingNavigation) {
      await saveState({
        queue: (await getState()).queue.map((job) => (
          job.id === activeJob.id
            ? { ...job, tabId: sender.tab.id, status: 'opening' }
            : job
        )),
      }, { expectedSessionVersion: sessionVersion, expectedActiveJobId: activeJob.id });

      return { ok: true, pendingNavigation: true };
    }

    if (!response?.ok) {
      await markJobResult({
        jobId: activeJob.id,
        success: false,
        details: {
          error: response?.error || 'The content script could not complete the application',
        },
        tabId: sender.tab.id,
        expectedSessionVersion: sessionVersion,
      });

      return { ok: false };
    }

    await markJobResult({
      jobId: activeJob.id,
      success: Boolean(response?.submitted),
      details: response,
      tabId: sender.tab.id,
      expectedSessionVersion: sessionVersion,
    });

    return { ok: true };
  } catch (error) {
    if (sessionVersion !== profileSessionVersion) return { ignored: true };
    if (error?.code === 'resume_selection_required') {
      clearActiveJobTimeout();
      const current = await getState();
      await saveState({ isRunning: false, activeJobId: null, queue: current.queue.map((job) => (
        job.id === activeJob.id ? { ...job, status: 'needs_resume_selection', lastError: error.message, tabId: sender.tab.id } : job
      )) }, { expectedSessionVersion: sessionVersion, expectedActiveJobId: activeJob.id });
      return { ok: false, code: error.code, needsResumeSelection: true, error: error.message };
    }
    await markJobResult({
      jobId: activeJob.id,
      success: false,
      details: {
        error: error?.message || 'Failed to communicate with the job page',
      },
      tabId: sender.tab.id,
      expectedSessionVersion: sessionVersion,
    });

    return { ok: false };
  }
};

chrome.runtime.onInstalled.addListener(async (details = {}) => {
  await migrateInstalledState(details);
  await configureCompanionSurface();
});

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === RESUME_HANDOFF_EXPIRY_ALARM) void (async () => {
    await resumeHandoffs.expire();
    const current = await resumeHandoffs.read();
    // An older alarm must not lose the newer handoff's eventual cleanup.
    if (current) await chrome.alarms.create(RESUME_HANDOFF_EXPIRY_ALARM, { when: current.expiresAt });
  })().catch(() => {});
});
// Alarms can be delayed while a device sleeps; the clock gate also denies every
// use after expiry, and an awakened worker prunes expired bytes immediately.
void resumeHandoffs.expire().catch(() => {});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const record = await resumeHandoffs.read().catch(() => null);
  if (!record) return;
  let changed = false;
  try {
    changed = (tabId === record.tabId && canonicalJobUrl(changeInfo.url) !== record.jobKey)
      || (tabId === record.appTabId && new URL(changeInfo.url).origin !== record.appOrigin);
  } catch { changed = tabId === record.tabId || tabId === record.appTabId; }
  if (changed) await resumeHandoffs.cancel(record);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const record = await resumeHandoffs.read().catch(() => null);
  if (record && (record.tabId === tabId || record.appTabId === tabId)) await resumeHandoffs.cancel(record);
  const state = await getState();
  const activeJob = state.queue.find((job) => job.id === state.activeJobId);

  if (!state.isRunning || !activeJob || activeJob.tabId !== tabId) {
    return;
  }

  await markJobResult({
    jobId: activeJob.id,
    success: false,
    details: {
      error: 'The application tab was closed before submission completed',
    },
    tabId,
  });
});

const isTrustedMessageSender = (message, sender = {}) => {
  if (sender.id !== chrome.runtime.id) return false;
  const senderUrl = sender.url || sender.tab?.url || '';
  const extensionBase = chrome.runtime.getURL('');
  if (!sender.tab && (senderUrl === `${extensionBase}popup.html` || senderUrl === `${extensionBase}sidepanel.html`)) return true;
  if (!sender.tab || !/^https?:\/\//i.test(senderUrl)) return false;
  if (['PREPARE_ACTIVE_TAB_RESUME', 'AUTOFILL_ACTIVE_TAB', 'AUTOFILL_ACTIVE_TAB_ASYNC', 'AUTOFILL_ACTIVE_TAB_PORT', 'PREPARE_ACTIVE_TAB_AUTOFILL', 'RUN_MAIN_WORLD_ACTIVE_TAB_AUTOFILL'].includes(message?.type) && (sender.frameId ?? 0) !== 0) return false;
  const privileged = new Set(['SYNC_PROFILE', 'QUEUE_JOBS', 'CLEAR_QUEUE', 'START_RUN', 'GET_RESUME_HANDOFF', 'COMPLETE_RESUME_HANDOFF', 'CANCEL_RESUME_HANDOFF']);
  if (!privileged.has(message?.type)) return true;
  if ((sender.frameId ?? 0) !== 0 || !isAppUrl(senderUrl)) return false;
  const origin = new URL(senderUrl).origin;
  const matches = chrome.runtime.getManifest().content_scripts
    ?.find((entry) => entry.js?.includes(APP_BRIDGE_SCRIPT_FILE))?.matches || [];
  return matches.some((pattern) => {
    const matchUrl = new URL(pattern.replace(/\*.*$/, ''));
    return matchUrl.origin === origin || (matchUrl.hostname === new URL(origin).hostname && matchUrl.protocol === 'http:' && new URL(origin).protocol === 'http:');
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedMessageSender(message, sender)) {
    sendResponse({ ok: false, success: false, error: 'This browser-agent request is not allowed from this page.' });
    return false;
  }
  (async () => {
    switch (message?.type) {
      case 'PING': {
        const state = await getState();
        return getStateSummary(state);
      }

      case 'GET_STATE': {
        const state = await getState();
        const record = await resumeHandoffs.read().catch(() => null);
        const resumeSelection = record?.selection && (!state.profile?.candidate?.userId || record.ownerId === state.profile.candidate.userId)
          ? { status: 'ready', handoffId: record.handoffId, expiresAt: record.expiresAt, resume: record.selection.resume, job: { title: record.jobSnapshot.title, url: record.targetUrl } } : null;
        return { ...getStateSummary(state), resumeSelection };
      }

      case 'GET_SYNCED_PROFILE': {
        const cached = await getState();
        if (!cached.profile || !(await getExistingAppTab(getResumeAtsBaseUrl(cached.profile)))) {
          return { ok: true, hasProfile: false, profile: null };
        }
        const state = await getVerifiedAutofillState();
        return {
          ok: true,
          hasProfile: Boolean(state.profile),
          profile: state.profile || null,
        };
      }

      case 'SYNC_PROFILE': {
        let sessionVersion = profileSessionVersion;
        if (!message.payload) {
          await invalidateProfileSession();
          return getStateSummary(await getState());
        }
        const previous = await getState();
        if (sessionVersion !== profileSessionVersion) throw new Error('Your session changed. Reconnect ResumeATS before continuing.');
        if (!message.payload.candidate?.userId || message.payload.version !== '2026-09-04') throw new Error('Refresh ResumeATS and reconnect to sync a current, account-bound profile.');
        const pendingSelection = await resumeHandoffs.read().catch(() => null);
        if ((previous.profile?.candidate?.userId && previous.profile.candidate.userId !== message.payload.candidate.userId)
          || (pendingSelection && pendingSelection.ownerId !== message.payload.candidate.userId)) sessionVersion = await invalidateProfileSession();
        const nextState = await saveState({
          profile: message.payload || null,
          lastSyncedAt: new Date().toISOString(),
        }, { expectedSessionVersion: sessionVersion });
        if (message.payload) {
          await clearPendingProfileSync();
        }
        return getStateSummary(nextState);
      }

      case 'QUEUE_JOBS': {
        const state = await getState();
        const queue = dedupeJobs(state.queue, message.payload?.jobs || []);
        const nextState = await saveState({ queue });
        return getStateSummary(nextState);
      }

      case 'CLEAR_QUEUE': {
        const nextState = await saveState({
          queue: [],
          isRunning: false,
          activeJobId: null,
        });
        return getStateSummary(nextState);
      }

      case 'START_RUN': {
        const sessionVersion = profileSessionVersion;
        const state = await getVerifiedAutofillState();

        if (!state.profile) {
          throw new Error('No synced ResumeATS profile found');
        }

        // Completing a handoff never resumes the queue. Only this explicit
        // action may reuse the paused job's original selected tab.
        const paused = state.queue.find((job) => job.status === 'needs_resume_selection');
        if (paused) {
          await getResumeSelectionForTab(paused.tabId, paused.url);
          await saveState({ isRunning: true, activeJobId: paused.id, queue: state.queue.map((job) => (
            job.id === paused.id ? { ...job, status: 'opening', lastError: null } : job
          )) }, { expectedSessionVersion: sessionVersion });
          await handleJobPageReady({}, { tab: { id: paused.tabId }, frameId: 0 });
          return getStateSummary(await getState());
        }

        const nextState = await saveState({ isRunning: true }, { expectedSessionVersion: sessionVersion });

        if (!nextState.activeJobId) {
          void queueNextJob().catch(() => {});
        }

        return getStateSummary(await getState());
      }

      case 'JOB_PAGE_SEEN': {
        if (message.payload?.jobPosting) {
          await persistLastJobSnapshot(message.payload.jobPosting, sender.tab?.id || null);
        }

        return { ok: true };
      }

      case 'GET_RECENT_JOB_POSTING': {
        const state = await getState();
        const lastJobSnapshot = state.lastJobSnapshot || null;

        if (lastJobSnapshot?.tabId) {
          try {
            const tab = await chrome.tabs.get(lastJobSnapshot.tabId);
            if (tab?.id) {
              const refreshed = await captureJobPostingFromTab(tab);
              return { ok: true, jobPosting: refreshed };
            }
          } catch {
            // Fall back to the last stored snapshot when the tab is gone or unreachable.
          }
        }

        if (!lastJobSnapshot) {
          throw new Error('No recent job posting found. Open a job page with the extension active, then try again.');
        }

        return { ok: true, jobPosting: lastJobSnapshot };
      }

      case 'CAPTURE_ACTIVE_JOB_POSTING': {
        return withActionProgress('analyze', async () => {
          const tab = await findCaptureCandidateTab(sender);
          if (!tab) {
            throw new Error('No open job tab found. Open a job posting first, then try again.');
          }

          const jobPosting = await captureJobPostingFromTab(tab);
          return { ok: true, jobPosting };
        }, {
          success: {
            label: 'Analysis ready',
            title: 'Job analysis ready',
            detail: 'ResumeATS captured the current job and updated the extension context.',
          },
          failure: {
            label: 'Analyze failed',
            title: 'Could not analyze page',
          },
        });
      }

      case 'OPEN_RESUMEATS_IMPORT': {
        const state = await getState();
        return openResumeAtsRoute('/#/quick-resume', state.profile, true);
      }

      case 'OPEN_RESUMEATS_ROUTE': {
        const state = await getState();
        const route = typeof message.payload?.route === 'string' && message.payload.route.startsWith('/#/')
          ? message.payload.route
          : '/#/';
        return openResumeAtsRoute(route, state.profile, message.payload?.active !== false);
      }

      case 'SYNC_PROFILE_FROM_APP': {
        return withActionProgress('sync', async () => {
          const response = await syncProfileFromResumeAts({
            resumeId: message.payload?.resumeId || '',
            openLoginOnFailure: true,
          });
          return {
            ok: true,
            result: response,
            summary: getStateSummary(response.state),
          };
        }, {
          success: {
            label: 'Synced',
            title: 'Profile synced',
            detail: 'Your latest ResumeATS profile is cached and ready for autofill.',
          },
          failure: {
            label: 'Sync failed',
            title: 'Could not sync profile',
          },
        });
      }

      case 'OPEN_SIDE_PANEL': {
        return openCompanionSurface(sender);
      }

      case 'AUTOFILL_ACTIVE_TAB': {
        return withActionProgress('autofill', async () => {
          const response = await performActiveTabAutofillParallel(sender);
          return {
            ok: true,
            result: response.result,
            summary: response.summary,
          };
        }, {
          success: {
            label: 'Autofill done',
            title: 'Autofill complete',
            detail: 'Autofill finished. Review the result and confirm whether the PDF was attached before continuing.',
          },
          failure: {
            label: 'Autofill failed',
            title: 'Could not autofill page',
          },
        });
      }

      case 'PREPARE_ACTIVE_TAB_AUTOFILL': {
        return withActionProgress('autofill', async () => {
          const prepared = await prepareActiveTabAutofillContext(sender);
          return {
            ok: true,
            activeTab: prepared.activeTab
              ? {
                  id: prepared.activeTab.id,
                  url: prepared.activeTab.url,
                  title: prepared.activeTab.title,
                }
              : null,
            activeJob: prepared.activeJob,
            profile: prepared.effectiveProfile,
            preparedResume: prepared.preparedResume,
            summary: getStateSummary(await getState()),
          };
        }, {
          pending: {
            title: 'Preparing autofill',
            detail: 'Checking the selected saved resume and candidate data for the current application.',
          },
          success: {
            label: 'Ready',
            title: 'Autofill context ready',
            detail: 'The selected saved resume and candidate data passed the preparation checks.',
          },
          failure: {
            label: 'Prepare failed',
            title: 'Could not prepare autofill',
          },
        });
      }

      case 'PREPARE_ACTIVE_TAB_RESUME':
        return withActionProgress('resume', () => prepareActiveTabResume(sender), {
          success: { label: 'Choose in ResumeATS', title: 'Resume selection opened', detail: 'Choose a saved version or review a tailored resume. Return here for a separate Autofill action.' },
        });

      case 'GET_RESUME_HANDOFF': {
        const record = await getVerifiedHandoff(message.payload?.handoffId, sender);
        return { ok: true, ...handoffMetadata(record) };
      }

      case 'COMPLETE_RESUME_HANDOFF':
        return completeResumeHandoff(message.payload, sender);

      case 'CANCEL_RESUME_HANDOFF': {
        const record = await getVerifiedHandoff(message.payload?.handoffId, sender);
        await resumeHandoffs.cancel(record);
        return { ok: true, status: 'cancelled', handoffId: record.handoffId };
      }

      case 'AUTHORIZE_RESUME_ATTACHMENT': {
        if ((sender.frameId ?? 0) !== 0 || !sender.tab?.id || isAppUrl(sender.url || sender.tab.url)) throw selectionError();
        const record = await getResumeSelectionForTab(sender.tab.id, message.payload?.targetUrl);
        if (record.handoffId !== message.payload?.handoffId || record.selection.document.artifactId !== message.payload?.artifactId
          || canonicalJobUrl(sender.url || sender.tab.url) !== record.jobKey) throw selectionError('The selected attachment is no longer current.');
        return { ok: true, handoffId: record.handoffId, artifactId: record.selection.document.artifactId, targetUrl: record.targetUrl };
      }

      case 'RUN_MAIN_WORLD_ACTIVE_TAB_AUTOFILL': {
        const activeTab = await resolveActionTab(sender, {
          requireInspectable: true,
          fallbackToRecent: false,
        });
        if (!isInspectableJobTab(activeTab)) {
          throw new Error('Open a supported job or application page first.');
        }

        await getResumeSelectionForTab(activeTab.id);
        const result = await runMainWorldAutofill(activeTab.id, message.payload?.profile || {});
        return {
          ok: true,
          result,
          summary: getStateSummary(await getState()),
        };
      }

      case 'AUTOFILL_ACTIVE_TAB_ASYNC': {
        const activeTab = await resolveActionTab(sender, {
          requireInspectable: true,
          fallbackToRecent: false,
        });
        if (!isInspectableJobTab(activeTab)) {
          throw new Error('Open a supported job or application page first.');
        }

        const progressId = await startActionProgress('autofill');
        void (async () => {
          try {
            const response = await performActiveTabAutofillParallel(sender);
            await settleActionProgress(progressId, 'success', {
              label: 'Autofill done',
              title: 'Autofill complete',
              detail: 'Autofill finished. Review the result and confirm whether the PDF was attached before continuing.',
            });
            await chrome.tabs.sendMessage(activeTab.id, {
              type: 'AUTOFILL_ACTIVE_TAB_RESULT',
              payload: {
                ok: true,
                result: response.result,
                summary: response.summary,
              },
            }).catch(() => {});
          } catch (error) {
            await settleActionProgress(progressId, 'warning', {
              label: 'Autofill failed',
              title: 'Could not autofill page',
              detail: error?.message || 'Could not autofill the current application.',
            });
            await chrome.tabs.sendMessage(activeTab.id, {
              type: 'AUTOFILL_ACTIVE_TAB_RESULT',
              payload: {
                ok: false,
                error: error?.message || 'Could not autofill the current application.',
              },
            }).catch(() => {});
          }
        })();

        return {
          ok: true,
          started: true,
        };
      }

      case 'DEBUG_ACTIVE_TAB_FORM_DISCOVERY': {
        const activeTab = await resolveActionTab(sender, {
          requireInspectable: true,
          fallbackToRecent: false,
        });
        if (!isInspectableJobTab(activeTab)) {
          throw new Error('Open a supported job or application page first.');
        }

        const response = await chrome.tabs.sendMessage(activeTab.id, {
          type: 'DEBUG_FORM_DISCOVERY',
        });

        return {
          ok: true,
          tabId: activeTab.id,
          url: activeTab.url,
          result: response,
        };
      }

      case 'GENERATE_APPLICATION_ANSWERS': {
        const state = await getVerifiedAutofillState();
        if (!state.profile) {
          throw new Error('No synced ResumeATS profile found. Sync your profile from ResumeATS first.');
        }

        const activeTab = await resolveActionTab(sender, {
          requireInspectable: false,
          fallbackToRecent: true,
        });
        const activeSnapshot = activeTab
          ? await ensureSnapshotForTab(activeTab, state)
          : state.lastJobSnapshot;
        const activeJob = {
          ...(activeSnapshot || state.lastJobSnapshot || {}),
          url: activeTab?.url || activeSnapshot?.url || state.lastJobSnapshot?.url || '',
          title: activeSnapshot?.title || state.lastJobSnapshot?.title || activeTab?.title || 'Active Job',
        };

        try {
          const response = await sendMessageToAppTab({
            type: 'APP_AUTOFILL_AI_REQUEST',
            profile: state.profile,
            payload: {
              profile: state.profile,
              job: {
                ...activeJob,
                ...(message.payload?.job || {}),
              },
              questions: Array.isArray(message.payload?.questions) ? message.payload.questions : [],
            },
          });

          if (!response?.ok) {
            throw new Error(response?.error || 'Could not generate application answers.');
          }

          return { ok: true, result: response };
        } catch (error) {
          return {
            ok: true,
            result: {
              ok: true,
              answers: [],
              warning: error?.message || 'Application AI answers were unavailable; deterministic autofill continued.',
            },
          };
        }
      }

      case 'JOB_PAGE_READY': {
        return handleJobPageReady(message.payload, sender);
      }

      default:
        return { ignored: true };
    }
  })()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({
      ok: false,
      success: false,
      error: error?.message || 'Unknown browser agent error',
      code: error?.code,
    }));

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'resumeats-widget-autofill' || !isTrustedMessageSender({ type: 'AUTOFILL_ACTIVE_TAB' }, port.sender)) {
    port.disconnect();
    return;
  }

  port.onMessage.addListener((message) => {
    if (message?.type !== 'AUTOFILL_ACTIVE_TAB_PORT') {
      return;
    }

    void (async () => {
      const progressId = await startActionProgress('autofill');
      try {
        const response = await performActiveTabAutofillParallel({ tab: port.sender?.tab });
        await settleActionProgress(progressId, 'success', {
          label: 'Autofill done',
          title: 'Autofill complete',
          detail: 'Autofill finished. Review the result and confirm whether the PDF was attached before continuing.',
        });
        port.postMessage({
          ok: true,
          result: response.result,
          summary: response.summary,
        });
      } catch (error) {
        await settleActionProgress(progressId, 'warning', {
          label: 'Autofill failed',
          title: 'Could not autofill page',
          detail: error?.message || 'Could not autofill the current application.',
        });
        port.postMessage({
          ok: false,
          error: error?.message || 'Could not autofill the current application.',
        });
      }
    })();
  });
});
