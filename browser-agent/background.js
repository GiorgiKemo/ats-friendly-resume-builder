/* global chrome */

const VERSION = '0.1.0';
const STORAGE_KEY = 'resumeatsBrowserAgentState';
const PENDING_PROFILE_SYNC_KEY = 'resumeatsBrowserAgentPendingProfileSync';
const JOB_OPEN_TIMEOUT_MS = 45000;
const APP_BRIDGE_TIMEOUT_MS = 45000;
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isSignInRequiredMessage = (message = '') => /sign in to resumeats/i.test(`${message}`);
const isMissingReceiverMessage = (message = '') => /receiving end does not exist|could not establish connection/i.test(`${message}`);
const isMissingReceiverError = (error) => isMissingReceiverMessage(error?.message || error);

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
  candidateName: state.profile?.candidate?.fullName || '',
  candidateTitle: state.profile?.candidate?.currentTitle || '',
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

const sendFrameMessage = (tabId, frameId, message) => new Promise((resolve, reject) => {
  chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
    if (chrome.runtime.lastError) {
      reject(new Error(chrome.runtime.lastError.message));
      return;
    }
    resolve(response);
  });
});

const sendMessageToTabFrames = async (tabId, message) => {
  const frames = await getInspectableFrames(tabId);
  const responses = [];

  for (const frame of frames) {
    try {
      const response = await sendFrameMessage(tabId, frame.frameId, message);
      if (response) {
        responses.push({
          frameId: frame.frameId,
          frameUrl: frame.url || '',
          response,
        });
      }
    } catch {
      // Not every frame has the content script, especially if the frame loaded before permissions changed.
    }
  }

  return responses;
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
    const parentLabel = field.closest('.field, .application-field, .posting-requirement, [data-qa="field"], .form-field, .jobs-apply-form, [data-testid*="attachment"]');
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
    return normalize(parts.join(' '));
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

  const scoreOptionMatch = (optionText, desiredValue) => {
    const option = normalize(optionText);
    const desired = normalize(desiredValue);
    if (!option || !desired) return 0;
    if (option === desired) return 100;
    if (option.startsWith(desired) || desired.startsWith(option)) return 92;
    if (option.includes(desired) || desired.includes(option)) return 84;
    if (/^(true|yes|y|1)$/i.test(`${desiredValue}`) && /\byes\b|authorized|eligible|agree/.test(option)) return 88;
    if (/^(false|no|n|0)$/i.test(`${desiredValue}`) && /\bno\b|not authorized|do not|decline/.test(option)) return 88;

    const desiredTokens = new Set(desired.split(/[^a-z0-9]+/).filter((token) => token.length > 1));
    const optionTokens = option.split(/[^a-z0-9]+/).filter((token) => token.length > 1);
    const overlap = optionTokens.filter((token) => desiredTokens.has(token)).length;
    return overlap > 0 ? Math.round((overlap / Math.max(desiredTokens.size, optionTokens.length)) * 72) : 0;
  };

  const optionLooksSelectable = (element) => {
    if (!element || !isVisible(element) || element.getAttribute('aria-disabled') === 'true') return false;
    const text = cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
    return Boolean(text) && text.length <= 180 && !/^(select|choose|loading|no options|no results)$/i.test(text);
  };

  const collectCustomChoiceOptions = (field) => {
    const controlsId = cleanText(field.getAttribute?.('aria-controls') || field.getAttribute?.('aria-owns') || '');
    const selectors = [
      controlsId ? `#${CSS.escape(controlsId)} [role="option"]` : '',
      controlsId ? `#${CSS.escape(controlsId)} li` : '',
      '[role="option"]',
      '[role="menu"] [role="menuitem"]',
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
            text: cleanText(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || ''),
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
      dispatchFieldEvents(field);
      setNativeValue(field, 'value', searchValue);
      dispatchFieldEvents(field);
      await delay(220);
    }
    return collectCustomChoiceOptions(field);
  };

  const setCustomChoiceValue = async (field, value) => {
    if (!isCustomChoiceControl(field)) return false;
    let options = await openCustomChoiceControl(field);
    if (options.length === 0) {
      options = await openCustomChoiceControl(field, `${value}`.slice(0, 48));
    }
    const best = options
      .map((option) => ({ ...option, score: scoreOptionMatch(option.text, value) }))
      .sort((left, right) => right.score - left.score)[0];
    if (!best || best.score < 45) return false;
    const view = best.element.ownerDocument?.defaultView || window;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((eventName) => {
      const EventCtor = eventName.startsWith('pointer') ? view.PointerEvent || view.MouseEvent : view.MouseEvent;
      best.element.dispatchEvent(new EventCtor(eventName, { bubbles: true, cancelable: true, view }));
    });
    await delay(160);
    dispatchFieldEvents(field);
    return true;
  };

  const buildCandidatePitch = () => {
    const candidate = profile?.candidate || {};
    const topSkills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).slice(0, 4) : [];
    const intro = [
      candidate.currentTitle ? `I am a ${candidate.currentTitle}` : 'I am a candidate',
      candidate.currentCompany ? `currently working at ${candidate.currentCompany}` : '',
      candidate.location ? `based in ${candidate.location}` : '',
    ].filter(Boolean).join(' ');
    const skills = topSkills.length > 0 ? `My strongest areas include ${topSkills.join(', ')}.` : '';
    return cleanText([intro, skills].filter(Boolean).join(' ')).slice(0, 900);
  };

  const resolveFieldValue = (meta) => {
    const candidate = profile?.candidate || {};
    const answers = profile?.answers || {};
    const locationParts = cleanText(candidate.location || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    const candidatePitch = buildCandidatePitch();
    if (/first name|given name/.test(meta)) return candidate.firstName;
    if (/last name|surname|family name/.test(meta)) return candidate.lastName;
    if (/full name|your name|applicant name/.test(meta)) return candidate.fullName;
    if (/email|\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/.test(meta)) return candidate.email;
    if (phoneFieldPattern.test(meta)) return candidate.phone;
    if (/city/.test(meta)) return answers.city || locationParts[0] || candidate.location;
    if (/state|province/.test(meta)) return answers.stateProvince;
    if (/country|region/.test(meta)) return answers.country || locationParts.at(-1) || candidate.location;
    if (/location|address/.test(meta)) return candidate.location;
    if (/linkedin/.test(meta)) return candidate.linkedin || answers.linkedinUrl;
    if (/github/.test(meta)) return candidate.github || answers.githubUrl;
    if (/portfolio/.test(meta)) return candidate.portfolio || answers.portfolioUrl;
    if (/website|personal site/.test(meta)) return candidate.website || answers.websiteUrl;
    if (/current company|employer/.test(meta)) return answers.currentCompany;
    if (/current title|job title|current role/.test(meta)) return answers.currentTitle;
    if (/work authorization|authorized to work|legally authorized/.test(meta)) return answers.workAuthorization;
    if (/sponsor|sponsorship|visa|h[- ]?1b|work permit/.test(meta)) return answers.requiresSponsorship;
    if (/years.*experience|experience.*years/.test(meta)) return answers.yearsOfExperience;
    if (/salary|compensation|expected pay|pay expectation/.test(meta)) return answers.salaryExpectation;
    if (/work setup|work model|remote|hybrid|on-site|onsite/.test(meta)) return answers.preferredWorkSetup;
    if (/school|university|college/.test(meta)) return answers.school;
    if (/degree.*pursu|pursuing.*degree/.test(meta)) return answers.degreePursuing || answers.highestEducation;
    if (/degree/.test(meta)) return answers.highestEducation;
    if (/course|class|certification/.test(meta)) return answers.relevantCourses;
    if (/hear about|heard about|source|how did you find|how did you learn/.test(meta)) return answers.heardAbout;
    if (/referred|referral/.test(meta) && /name|who/.test(meta)) return answers.referralName;
    if (/referred|referral/.test(meta)) return answers.referredByEmployee;
    if (/current.*employee|team member/.test(meta)) return answers.currentEmployee;
    if (/previous.*employee|ever.*employed|formerly.*employed/.test(meta)) return answers.previousEmployee;
    if (/previous.*company|previous.*employ|dates.*employ/.test(meta)) return answers.previousEmploymentDetails;
    if (/background.*check/.test(meta)) return answers.backgroundCheckConsent;
    if (/privacy|data retention|data processing|recruiting.*consent|consent/.test(meta)) return answers.privacyConsent;
    if (/accommodation/.test(meta)) return answers.accommodationRequest || 'No';
    if (/gender|pronoun/.test(meta)) return answers.gender || 'Prefer not to answer';
    if (/hispanic|latino/.test(meta)) return answers.hispanicLatino || 'Prefer not to answer';
    if (/veteran/.test(meta)) return answers.veteranStatus || 'Prefer not to answer';
    if (/disability|disabled/.test(meta)) return answers.disabilityStatus || 'Prefer not to answer';
    if (/cover letter|message to the hiring team|about you|tell us about yourself|why (?:are you interested|this role|do you want)/.test(meta)) return candidatePitch;
    if (/summary|professional summary|candidate summary/.test(meta)) return candidatePitch;
    if (/available|start date|notice period/.test(meta)) return answers.noticePeriod || 'Two weeks notice';
    return null;
  };

  const setFieldValue = async (field, value) => {
    if (!field || value === undefined || value === null || value === '' || !isVisible(field)) return false;
    const tag = field.tagName.toLowerCase();
    if (isCustomChoiceControl(field)) {
      return setCustomChoiceValue(field, value);
    }
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
      setNativeValue(field, 'checked', /^(true|yes|1)$/i.test(`${value}`));
      dispatchFieldEvents(field);
      return true;
    }
    if (field.type === 'radio') {
      const wanted = normalize(value);
      const candidates = queryFieldRoots(field, `input[type="radio"][name="${CSS.escape(field.name || '')}"]`);
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

  const uploadResumeFile = async (input) => {
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
    const value = resolveFieldValue(meta);
    if (value !== null && value !== undefined && value !== '') mappableFieldCount += 1;
    if (value && await setFieldValue(field, value)) filledCount += 1;
  }

  const resumeInput = findResumeInput();
  if (resumeInput && !resumeInput.files?.length) {
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
    args: [profile],
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
    const manifestName = chrome.runtime?.getManifest?.()?.name || 'ResumeATS Browser Agent';
    await chrome.sidebarAction.setTitle({ title: manifestName }).catch(() => {});
  }
};

const prepareActiveTabAutofillContext = async (sender) => {
  let state = await getState();
  if (!state.profile) {
    const syncResult = await syncProfileFromResumeAts({
      resumeId: '',
      openLoginOnFailure: true,
    });
    state = syncResult.state;
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

  if (shouldPrepareResumeForJob(effectiveProfile, activeJob.url)) {
    const prepared = await prepareResumeForJob({
      profile: effectiveProfile,
      jobPosting: activeJob,
    });
    effectiveProfile = prepared.state.profile;
    preparedResume = prepared.resume || null;
  }

  return {
    activeTab,
    activeJob,
    effectiveProfile,
    preparedResume,
  };
};

const performActiveTabAutofill = async (sender) => {
  const {
    activeTab,
    activeJob,
    effectiveProfile,
    preparedResume,
  } = await prepareActiveTabAutofillContext(sender);

  const finalResponse = await autofillTabWithFallbacks(activeTab.id, {
    profile: effectiveProfile,
    job: {
      id: 'active-tab',
      url: activeTab.url,
      title: activeJob.title,
      company: activeJob.company,
      provider: activeJob.provider,
    },
    autoSubmit: false,
  });

  if (!finalResponse?.ok) {
    throw new Error(finalResponse?.error || 'Could not autofill the current application.');
  }

  return {
    activeTab,
    result: {
      ...finalResponse,
      preparedResume,
    },
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
  if (!profile?.documents?.resumePdfUrl) return true;
  const preparedForUrl = profile?.documents?.preparedForUrl || '';
  if (!preparedForUrl || !targetUrl) return true;
  return !urlsMatch(preparedForUrl, targetUrl);
};

const prepareResumeForJob = async ({ profile, jobPosting }) => {
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

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
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
        const tab = await findCaptureCandidateTab(sender);
        if (!tab) {
          throw new Error('No open job tab found. Open a job posting first, then try again.');
        }

        const jobPosting = await captureJobPostingFromTab(tab);
        return { ok: true, jobPosting };
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
        const response = await syncProfileFromResumeAts({
          resumeId: message.payload?.resumeId || '',
          openLoginOnFailure: true,
        });
        return {
          ok: true,
          result: response,
          summary: getStateSummary(response.state),
        };
      }

      case 'OPEN_SIDE_PANEL': {
        return openCompanionSurface(sender);
      }

      case 'AUTOFILL_ACTIVE_TAB': {
        const response = await performActiveTabAutofill(sender);
        return {
          ok: true,
          result: response.result,
          summary: response.summary,
        };
      }

      case 'PREPARE_ACTIVE_TAB_AUTOFILL': {
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

        void (async () => {
          try {
            const response = await performActiveTabAutofill(sender);
            await chrome.tabs.sendMessage(activeTab.id, {
              type: 'AUTOFILL_ACTIVE_TAB_RESULT',
              payload: {
                ok: true,
                result: response.result,
                summary: response.summary,
              },
            }).catch(() => {});
          } catch (error) {
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
      }

      case 'JOB_PAGE_READY': {
        return handleJobPageReady(message.payload, sender);
      }

      default:
        return { ignored: true };
    }
  })()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ success: false, error: error?.message || 'Unknown browser agent error' }));

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
      try {
        const response = await performActiveTabAutofill({ tab: port.sender?.tab });
        port.postMessage({
          ok: true,
          result: response.result,
          summary: response.summary,
        });
      } catch (error) {
        port.postMessage({
          ok: false,
          error: error?.message || 'Could not autofill the current application.',
        });
      }
    })();
  });
});
