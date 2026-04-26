/* global chrome */

const VERSION = '0.1.0';
const STORAGE_KEY = 'resumeatsAutofillTrainerState';
const PENDING_PROFILE_SYNC_KEY = 'resumeatsAutofillTrainerPendingProfileSync';
const ACTION_PROGRESS_KEY = 'resumeatsAutofillTrainerActionProgress';
const TRAINING_EXAMPLES_KEY = 'resumeatsAutofillTrainerExamples';
const TRAINING_ENDPOINT_KEY = 'resumeatsAutofillTrainerEndpoint';
const DEFAULT_TRAINING_ENDPOINT = 'http://127.0.0.1:8787';
const IS_TRAINING_EXTENSION = /trainer/i.test(chrome.runtime?.getManifest?.()?.name || '');
const JOB_OPEN_TIMEOUT_MS = 45000;
const APP_BRIDGE_TIMEOUT_MS = 45000;
const TAB_FRAME_MESSAGE_TIMEOUT_MS = 55000;
const LOCAL_PLANNER_TIMEOUT_MS = 12000;
const PRODUCTION_APP_URL = 'https://resumeats.cv';
const AUTOFILL_RETRY_DELAYS_MS = [1500, 2500, 4000, 6000];
const APP_BRIDGE_SCRIPT_FILE = 'content-app-bridge.js';
let activeJobTimeoutId = null;

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
    detail: 'Filling profile fields while ResumeATS prepares and uploads the tailored resume.',
  },
  resume: {
    label: 'AI Resume',
    title: 'Generating tailored resume',
    detail: 'Creating and saving a tailored resume for the active job.',
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
    documents: profile?.documents && typeof profile.documents === 'object'
      ? { ...profile.documents }
      : {},
  };
};
const getProfileWithoutResumeUpload = (profile = {}) => ({
  ...profile,
  documents: {
    ...(profile?.documents || {}),
    resumePdfUrl: '',
    resumePdfPath: '',
    resumeFilename: '',
    preparedResumeId: '',
    preparedResumeTitle: '',
    preparedForUrl: '',
    preparedForTitle: '',
    preparedAt: null,
  },
});
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
  /(^|\.)resumeats\.cv$/i,
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
  const a = normalizeUrl(left);
  const b = normalizeUrl(right);
  return a === b || a.startsWith(b) || b.startsWith(a);
};

const getState = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return {
    ...DEFAULT_STATE,
    ...(stored?.[STORAGE_KEY] || {}),
    version: VERSION,
  };
};

const saveState = async (partial) => {
  const nextState = {
    ...(await getState()),
    ...partial,
    version: VERSION,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
  return nextState;
};

const getTrainerEndpoint = async () => {
  const stored = await chrome.storage.local.get(TRAINING_ENDPOINT_KEY).catch(() => ({}));
  return `${stored?.[TRAINING_ENDPOINT_KEY] || DEFAULT_TRAINING_ENDPOINT}`.replace(/\/$/, '');
};

const normalizeTrainingExamples = (examples = []) => (
  Array.isArray(examples)
    ? examples.filter((example) => (
        example
        && typeof example === 'object'
        && example.id
        && example.input
        && example.output
      ))
    : []
);

const getStoredTrainingExamples = async () => {
  const stored = await chrome.storage.local.get(TRAINING_EXAMPLES_KEY).catch(() => ({}));
  return normalizeTrainingExamples(stored?.[TRAINING_EXAMPLES_KEY]);
};

const postTrainingExamplesToLocalTrainer = async (examples) => {
  const endpoint = await getTrainerEndpoint();
  const response = await fetch(`${endpoint}/dataset/examples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examples }),
  });
  if (!response.ok) {
    throw new Error(`Trainer API rejected examples with HTTP ${response.status}`);
  }
  return response.json();
};

const buildLocalPlannerFields = (questions = []) => (
  questions.map((question, index) => ({
    fieldId: `${question?.id || `field-${index + 1}`}`,
    label: `${question?.label || ''}`,
    kind: question?.kind || 'text',
    required: Boolean(question?.required),
    placeholder: `${question?.placeholder || ''}`,
    options: Array.isArray(question?.options) ? question.options.map((option) => `${option}`) : [],
    section: `${question?.section || ''}`,
    name: `${question?.name || ''}`,
    id: `${question?.domId || ''}`,
    currentValue: `${question?.currentValue || ''}`,
  }))
);

const requestLocalPlannerAnswers = async ({ profile, job, questions }) => {
  const fields = buildLocalPlannerFields(questions);
  if (fields.length === 0) {
    return [];
  }

  const endpoint = await getTrainerEndpoint();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOCAL_PLANNER_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${endpoint}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        profile: profile || {},
        job: job || {},
        page: { provider: 'extension-training', url: job?.url || '' },
        fields,
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Local planner did not respond within ${LOCAL_PLANNER_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Local planner returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  const actions = Array.isArray(payload?.actions) ? payload.actions : [];
  return actions
    .filter((action) => action && action.fieldId && !action.skip)
    .map((action) => ({
      id: `${action.fieldId}`,
      answer: `${action.value || action.optionText || ''}`.trim(),
      confidence: action.confidence || 'medium',
      source: action.source || 'local_planner',
    }))
    .filter((entry) => entry.answer);
};

const saveTrainingExamples = async (examples = []) => {
  const normalized = normalizeTrainingExamples(examples);
  if (normalized.length === 0) {
    return {
      ok: false,
      savedCount: 0,
      error: 'No valid training examples were provided.',
    };
  }

  const existing = await getStoredTrainingExamples();
  const nextExamples = [...existing, ...normalized].slice(-2000);
  await chrome.storage.local.set({ [TRAINING_EXAMPLES_KEY]: nextExamples });

  let trainerResult = null;
  let trainerError = '';
  try {
    trainerResult = await postTrainingExamplesToLocalTrainer(normalized);
  } catch (error) {
    trainerError = error?.message || 'Could not send examples to local trainer.';
  }

  return {
    ok: true,
    savedCount: normalized.length,
    totalStored: nextExamples.length,
    trainerResult,
    trainerError,
  };
};

const downloadTrainingExamples = async () => {
  const examples = await getStoredTrainingExamples();
  const jsonl = examples.map((example) => JSON.stringify(example)).join('\n') + (examples.length ? '\n' : '');
  const dataUrl = `data:application/jsonl;charset=utf-8,${encodeURIComponent(jsonl)}`;
  const filename = `resumeats-autofill-training-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });
  return {
    ok: true,
    downloadId,
    count: examples.length,
    filename,
  };
};

const clearActiveJobTimeout = () => {
  if (activeJobTimeoutId) {
    clearTimeout(activeJobTimeoutId);
    activeJobTimeoutId = null;
  }
};

const scheduleActiveJobTimeout = (jobId, tabId) => {
  clearActiveJobTimeout();
  activeJobTimeoutId = setTimeout(async () => {
    const state = await getState();
    if (!state.isRunning || state.activeJobId !== jobId) return;

    await markJobResult({
      jobId,
      success: false,
      details: {
        error: 'Timed out waiting for the application page to become ready',
      },
      tabId,
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
  resumeReady: Boolean(state.profile?.documents?.resumePdfUrl),
  preparedResumeTitle: state.profile?.documents?.preparedResumeTitle || '',
  preparedForUrl: state.profile?.documents?.preparedForUrl || '',
  preparedAt: state.profile?.documents?.preparedAt || null,
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
        // Ignore invalid escape cases.
      }
    }
    const wrappingLabel = field.closest('label');
    if (wrappingLabel?.textContent) parts.push(wrappingLabel.textContent);
    const parentLabel = field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form, [data-testid*="attachment"], [class*="marginY--"], [class*="fieldWrapper"]');
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
    let options = await openCustomChoiceControl(field);
    if (options.length === 0) {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
    }
    let best = options
      .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
      .sort((left, right) => right.score - left.score)[0];
    if ((!best || best.score < 45) && field.tagName?.toLowerCase?.() === 'input') {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
      best = options
        .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
        .sort((left, right) => right.score - left.score)[0];
    }
    if (!best || best.score < 45) return false;
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
    if (/\bgender\b|\bsex\b/.test(fieldIdentity)) return answers.gender || 'Prefer not to answer';
    if (/\brace\b|ethnicity/.test(fieldIdentity)) return answers.raceEthnicity || 'Prefer not to answer';
    if (/hispanic|latino|latina|latinx/.test(fieldIdentity)) return answers.hispanicLatino || 'Prefer not to answer';
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
  const processedRadioNames = new Set();

  for (const field of fields) {
    const meta = getLabelText(field);
    if (meta) labeledFieldCount += 1;
    if (!meta || field.type === 'file') continue;
    if (field.type === 'radio' && processedRadioNames.has(field.name || '')) continue;
    if (field.type === 'radio' && field.name) processedRadioNames.add(field.name);
    const value = resolveFieldValue(meta, field);
    if (value !== null && value !== undefined && value !== '') mappableFieldCount += 1;
    if (value && await setFieldValue(field, value)) filledCount += 1;
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
    resumeInputPresent: Boolean(resumeInput),
  };
};

const runMainWorldAutofill = async (tabId, profile) => {
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

  if (filled.length <= 1) {
    return best.response;
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
    frameResults: filled.map((entry) => ({
      frameId: entry.frameId,
      frameUrl: entry.frameUrl,
      filledCount: entry.response?.filledCount || 0,
      provider: entry.response?.provider || '',
    })),
  };
};

const requestAutofillApplication = async (tabId, payload) => {
  const responses = await sendMessageToTabFrames(tabId, {
    type: 'AUTOFILL_APPLICATION',
    payload,
  });

  return mergeAutofillResponses(responses);
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
    const manifestName = chrome.runtime?.getManifest?.()?.name || 'ResumeATS Autofill Trainer';
    await chrome.sidebarAction.setTitle({ title: manifestName }).catch(() => {});
  }
};

const prepareActiveTabAutofillContext = async (sender, options = {}) => {
  const { forcePrepareResume = false } = options;
  let state = await getState();
  let missingProfileFields = getMissingAutofillProfileFields(state.profile);
  if (!state.profile || missingProfileFields.length > 0) {
    const syncResult = await syncProfileFromResumeAts({
      resumeId: '',
      openLoginOnFailure: true,
    });
    state = syncResult.state;
    missingProfileFields = getMissingAutofillProfileFields(state.profile);
  }

  if (missingProfileFields.length > 0) {
    throw new Error(buildMissingProfileMessage(missingProfileFields));
  }

  const activeTab = await resolveActionTab(sender, {
    requireInspectable: true,
    fallbackToRecent: false,
  });
  if (!isInspectableJobTab(activeTab)) {
    throw new Error('Open a supported job or application page first.');
  }

  const activeSnapshot = await ensureSnapshotForTab(activeTab, state);
  let effectiveProfile = state.profile;
  let preparedResume = null;
  const activeJob = {
    ...(activeSnapshot || state.lastJobSnapshot || {}),
    url: activeTab.url,
    title: activeSnapshot?.title || state.lastJobSnapshot?.title || activeTab.title || 'Active Job',
    company: activeSnapshot?.company || state.lastJobSnapshot?.company || '',
    provider: activeSnapshot?.provider || state.lastJobSnapshot?.provider || 'generic',
  };

  if (forcePrepareResume || shouldPrepareResumeForJob(effectiveProfile, activeJob.url)) {
    const prepared = await prepareResumeForJob({
      profile: effectiveProfile,
      jobPosting: activeJob,
    });
    effectiveProfile = prepared.state.profile;
    preparedResume = prepared.resume || null;
  }

  const preparedMissingFields = getMissingAutofillProfileFields(effectiveProfile);
  if (preparedMissingFields.length > 0) {
    throw new Error(buildMissingProfileMessage(preparedMissingFields));
  }

  return {
    activeTab,
    activeJob,
    effectiveProfile,
    preparedResume,
  };
};

const prepareActiveTabResume = async (sender) => {
  const prepared = await prepareActiveTabAutofillContext(sender, {
    forcePrepareResume: true,
  });

  return {
    activeTab: prepared.activeTab,
    activeJob: prepared.activeJob,
    effectiveProfile: prepared.effectiveProfile,
    preparedResume: prepared.preparedResume,
    summary: getStateSummary(await getState()),
  };
};

const mergeParallelAutofillResponses = (earlyResponse = null, finalResponse = {}, preparedResume = null) => {
  if (!earlyResponse) {
    return {
      ...finalResponse,
      preparedResume,
    };
  }

  const earlyFilledCount = Number(earlyResponse.filledCount || 0);
  const finalFilledCount = Number(finalResponse.filledCount || 0);

  return {
    ...earlyResponse,
    ...finalResponse,
    ok: Boolean(finalResponse.ok || earlyResponse.ok || earlyFilledCount > 0 || finalFilledCount > 0),
    filledCount: earlyFilledCount + finalFilledCount,
    earlyFilledCount,
    finalFilledCount,
    accessibleFieldCount: Math.max(Number(earlyResponse.accessibleFieldCount || 0), Number(finalResponse.accessibleFieldCount || 0)),
    labeledFieldCount: Math.max(Number(earlyResponse.labeledFieldCount || 0), Number(finalResponse.labeledFieldCount || 0)),
    mappableFieldCount: Math.max(Number(earlyResponse.mappableFieldCount || 0), Number(finalResponse.mappableFieldCount || 0)),
    zeroFillReason: finalResponse.zeroFillReason || earlyResponse.zeroFillReason || '',
    preparedResume: preparedResume || finalResponse?.preparedResume || earlyResponse?.preparedResume || null,
  };
};

const performActiveTabAutofillParallel = async (sender) => {
  let state = await getState();
  let missingProfileFields = getMissingAutofillProfileFields(state.profile);
  if (!state.profile || missingProfileFields.length > 0) {
    const syncResult = await syncProfileFromResumeAts({
      resumeId: '',
      openLoginOnFailure: true,
    });
    state = syncResult.state;
    missingProfileFields = getMissingAutofillProfileFields(state.profile);
  }

  if (missingProfileFields.length > 0) {
    throw new Error(buildMissingProfileMessage(missingProfileFields));
  }

  const activeTab = await resolveActionTab(sender, {
    requireInspectable: true,
    fallbackToRecent: false,
  });

  if (!isInspectableJobTab(activeTab)) {
    throw new Error('Open a supported job or application page first.');
  }

  const activeSnapshot = await ensureSnapshotForTab(activeTab, state);
  const activeJob = {
    ...(activeSnapshot || state.lastJobSnapshot || {}),
    url: activeTab.url,
    title: activeSnapshot?.title || state.lastJobSnapshot?.title || activeTab.title || 'Active Job',
    company: activeSnapshot?.company || state.lastJobSnapshot?.company || '',
    provider: activeSnapshot?.provider || state.lastJobSnapshot?.provider || 'generic',
  };
  const jobPayload = {
    id: 'active-tab',
    url: activeTab.url,
    title: activeJob.title,
    company: activeJob.company,
    provider: activeJob.provider,
  };

  if (IS_TRAINING_EXTENSION) {
    const trainerResponse = await autofillTabWithFallbacks(activeTab.id, {
      profile: getProfileWithoutResumeUpload(state.profile),
      job: jobPayload,
      autoSubmit: false,
    });

    if (!trainerResponse?.ok) {
      throw new Error(trainerResponse?.error || 'Trainer autofill could not complete the current application.');
    }

    return {
      activeTab,
      result: {
        ...trainerResponse,
        trainerMode: true,
      },
      summary: getStateSummary(await getState()),
    };
  }

  const preparationPromise = (async () => {
    let effectiveProfile = state.profile;
    let preparedResume = null;

    if (shouldPrepareResumeForJob(effectiveProfile, activeJob.url)) {
      const prepared = await prepareResumeForJob({
        profile: effectiveProfile,
        jobPosting: activeJob,
      });
      effectiveProfile = prepared.state.profile;
      preparedResume = prepared.resume || null;
    }

    const preparedMissingFields = getMissingAutofillProfileFields(effectiveProfile);
    if (preparedMissingFields.length > 0) {
      throw new Error(buildMissingProfileMessage(preparedMissingFields));
    }

    return {
      effectiveProfile,
      preparedResume,
    };
  })();

  let earlyResponse = null;
  try {
    earlyResponse = await autofillTabWithFallbacks(activeTab.id, {
      profile: getProfileWithoutResumeUpload(state.profile),
      job: jobPayload,
      autoSubmit: false,
    });
  } catch {
    earlyResponse = null;
  }

  if (earlyResponse?.pendingNavigation) {
    preparationPromise.catch(() => {});
    return {
      activeTab,
      result: earlyResponse,
      summary: getStateSummary(await getState()),
    };
  }

  const prepared = await preparationPromise;
  const finalResponse = await autofillTabWithFallbacks(activeTab.id, {
    profile: prepared.effectiveProfile,
    job: jobPayload,
    autoSubmit: false,
  });
  const mergedResponse = mergeParallelAutofillResponses(earlyResponse, finalResponse, prepared.preparedResume);

  if (!mergedResponse?.ok) {
    throw new Error(mergedResponse?.error || 'Could not autofill the current application.');
  }

  return {
    activeTab,
    result: mergedResponse,
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
  return existingTabs.find((tab) => normalizeUrl(tab.url || '').startsWith(normalizeUrl(baseUrl)))
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
  const existingAppTab = existingTabs.find((tab) => normalizeUrl(tab.url || '').startsWith(normalizeUrl(baseUrl)));

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
      if (attempt === 0) {
        await ensureAppBridgeInjected(appTab);
      }
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

const syncProfileFromResumeAts = async ({ resumeId = '', openLoginOnFailure = true } = {}) => {
  try {
    const response = await sendMessageToAppTab({
      type: 'APP_SYNC_PROFILE_REQUEST',
      payload: {
        resumeId,
      },
    });

    if (!response?.profile) {
      throw new Error('ResumeATS did not return a profile for the extension.');
    }

    const nextState = await saveState({
      profile: response.profile,
      lastSyncedAt: new Date().toISOString(),
    });
    await clearPendingProfileSync();

    return {
      ...response,
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

const shouldPrepareResumeForJob = (profile = null, targetUrl = '') => {
  if (IS_TRAINING_EXTENSION) return false;
  if (!profile?.documents?.resumePdfUrl) return true;
  const preparedForUrl = profile?.documents?.preparedForUrl || '';
  if (!preparedForUrl || !targetUrl) return true;
  return !urlsMatch(preparedForUrl, targetUrl);
};

const prepareResumeForJob = async ({ profile, jobPosting }) => {
  if (IS_TRAINING_EXTENSION) {
    throw new Error('AI resume generation is disabled in the trainer extension. Use the production extension for resume generation.');
  }

  if (!jobPosting?.url && !jobPosting?.title && !jobPosting?.description) {
    throw new Error('Analyze the job first so ResumeATS can prepare the right resume.');
  }

  const response = await sendMessageToAppTab({
    type: 'APP_PREPARE_RESUME_REQUEST',
    profile,
    payload: {
      jobPosting,
      resumeId: profile?.documents?.resumeId || '',
    },
  });

  if (!response?.profile) {
    throw new Error('ResumeATS could not prepare a tailored resume for this application.');
  }

  const nextState = await saveState({
    profile: response.profile,
    lastSyncedAt: new Date().toISOString(),
  });
  await clearPendingProfileSync();

  return {
    ...response,
    state: nextState,
  };
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
    return state?.lastJobSnapshot || null;
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

const markJobResult = async ({ jobId, success, details = {}, tabId = null }) => {
  clearActiveJobTimeout();
  const state = await getState();
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
  });

  if (tabId && success) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Ignore tab-close failures.
    }
  }

  queueNextJob();
};

const queueNextJob = async () => {
  const state = await getState();

  if (!state.isRunning) return;

  const nextJob = state.queue.find((job) => job.status === 'queued');
  if (!nextJob) {
    await saveState({
      isRunning: false,
      activeJobId: null,
    });
    return;
  }

  await saveState({
    activeJobId: nextJob.id,
    queue: state.queue.map((job) => (
      job.id === nextJob.id
        ? { ...job, status: 'opening' }
        : job
    )),
  });

  const tab = await chrome.tabs.create({
    url: nextJob.url,
    active: false,
  });

  scheduleActiveJobTimeout(nextJob.id, tab.id);

  await saveState({
    queue: (await getState()).queue.map((job) => (
      job.id === nextJob.id
        ? { ...job, tabId: tab.id }
        : job
    )),
  });
};

const handleJobPageReady = async (payload, sender) => {
  const state = await getState();
  const activeJob = state.queue.find((job) => job.id === state.activeJobId);

  if (!state.isRunning || !activeJob || !sender.tab?.id) {
    return { ignored: true };
  }

  const pageUrl = payload?.url || sender.tab.url || '';
  if (activeJob.tabId && activeJob.tabId !== sender.tab.id && !urlsMatch(activeJob.url, pageUrl)) {
    return { ignored: true };
  }

  scheduleActiveJobTimeout(activeJob.id, sender.tab.id);

  try {
    const response = await autofillTabWithFallbacks(sender.tab.id, {
      profile: state.profile,
      job: activeJob,
      autoSubmit: state.profile?.automation?.autoSubmit !== false,
    });

    if (response?.pendingNavigation) {
      await saveState({
        queue: (await getState()).queue.map((job) => (
          job.id === activeJob.id
            ? { ...job, tabId: sender.tab.id, status: 'opening' }
            : job
        )),
      });

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
      });

      return { ok: false };
    }

    await markJobResult({
      jobId: activeJob.id,
      success: Boolean(response?.submitted),
      details: response,
      tabId: sender.tab.id,
    });

    return { ok: true };
  } catch (error) {
    await markJobResult({
      jobId: activeJob.id,
      success: false,
      details: {
        error: error?.message || 'Failed to communicate with the job page',
      },
      tabId: sender.tab.id,
    });

    return { ok: false };
  }
};

chrome.runtime.onInstalled.addListener(async (details = {}) => {
  const stored = await chrome.storage.local.get(STORAGE_KEY).catch(() => ({}));
  const existingState = stored?.[STORAGE_KEY];

  if (details.reason === 'install' || !existingState || typeof existingState !== 'object') {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
  } else {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...DEFAULT_STATE,
        ...existingState,
        version: VERSION,
        queue: Array.isArray(existingState.queue) ? existingState.queue : [],
        isRunning: Boolean(existingState.isRunning),
        activeJobId: existingState.activeJobId || null,
      },
    });
  }

  await configureCompanionSurface();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'PING': {
        const state = await getState();
        return getStateSummary(state);
      }

      case 'GET_STATE': {
        const state = await getState();
        return getStateSummary(state);
      }

      case 'TRAINING_GET_STATUS': {
        const examples = await getStoredTrainingExamples();
        return {
          ok: true,
          endpoint: await getTrainerEndpoint(),
          storedCount: examples.length,
        };
      }

      case 'TRAINING_SET_ENDPOINT': {
        const endpoint = `${message.payload?.endpoint || DEFAULT_TRAINING_ENDPOINT}`.replace(/\/$/, '');
        await chrome.storage.local.set({ [TRAINING_ENDPOINT_KEY]: endpoint });
        return {
          ok: true,
          endpoint,
        };
      }

      case 'TRAINING_SAVE_EXAMPLES': {
        return saveTrainingExamples(message.payload?.examples || []);
      }

      case 'TRAINING_DOWNLOAD_EXAMPLES': {
        return downloadTrainingExamples();
      }

      case 'TRAINING_CLEAR_EXAMPLES': {
        await chrome.storage.local.set({ [TRAINING_EXAMPLES_KEY]: [] });
        return {
          ok: true,
          storedCount: 0,
        };
      }

      case 'GET_SYNCED_PROFILE': {
        const state = await getState();
        return {
          ok: true,
          hasProfile: Boolean(state.profile),
          profile: state.profile || null,
        };
      }

      case 'SYNC_PROFILE': {
        const nextState = await saveState({
          profile: message.payload || null,
          lastSyncedAt: new Date().toISOString(),
        });
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
        const state = await getState();

        if (!state.profile) {
          throw new Error('No synced ResumeATS profile found');
        }

        const nextState = await saveState({
          isRunning: true,
        });

        if (!nextState.activeJobId) {
          queueNextJob();
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
            detail: 'ResumeATS filled the visible fields and attached the tailored resume where possible.',
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
            detail: 'Preparing the tailored resume and candidate data for the current application.',
          },
          success: {
            label: 'Ready',
            title: 'Autofill context ready',
            detail: 'ResumeATS prepared the tailored resume and candidate data.',
          },
          failure: {
            label: 'Prepare failed',
            title: 'Could not prepare autofill',
          },
        });
      }

      case 'PREPARE_ACTIVE_TAB_RESUME': {
        return withActionProgress('resume', async () => {
          const prepared = await prepareActiveTabResume(sender);
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
            summary: prepared.summary,
          };
        }, {
          success: {
            label: 'Resume ready',
            title: 'AI resume ready',
            detail: 'The tailored resume is generated, saved, and ready to upload.',
          },
          failure: {
            label: 'Resume failed',
            title: 'Could not generate resume',
          },
        });
      }

      case 'RUN_MAIN_WORLD_ACTIVE_TAB_AUTOFILL': {
        const activeTab = await resolveActionTab(sender, {
          requireInspectable: true,
          fallbackToRecent: false,
        });
        if (!isInspectableJobTab(activeTab)) {
          throw new Error('Open a supported job or application page first.');
        }

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
              detail: 'ResumeATS filled the visible fields and attached the tailored resume where possible.',
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
        const state = await getState();
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

        const questions = Array.isArray(message.payload?.questions) ? message.payload.questions : [];
        const job = {
          ...activeJob,
          ...(message.payload?.job || {}),
        };

        try {
          const answers = await requestLocalPlannerAnswers({
            profile: state.profile,
            job,
            questions,
          });
          return {
            ok: true,
            result: {
              ok: true,
              answers,
              provider: 'local-planner',
            },
          };
        } catch (error) {
          return {
            ok: true,
            result: {
              ok: true,
              answers: [],
              provider: 'local-planner',
              warning: error?.message || 'Local planner was unavailable; deterministic autofill continued.',
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
      error: error?.message || 'Unknown trainer extension error',
    }));

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'resumeats-widget-autofill') {
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
          detail: 'ResumeATS filled the visible fields and attached the tailored resume where possible.',
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
