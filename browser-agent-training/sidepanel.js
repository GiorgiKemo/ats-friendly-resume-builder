/* global chrome */

const STORAGE_KEY = 'resumeatsAutofillTrainerState';
const THEME_STORAGE_KEY = 'resumeatsExtensionTheme';
const ACTION_PROGRESS_KEY = 'resumeatsAutofillTrainerActionProgress';
const ACTION_PROGRESS_STALE_MS = 30 * 60 * 1000;

const ROUTE_BY_LABEL = {
  'Quick Resume': '/#/quick-resume',
  'AI Generator': '/#/ai-generator',
  'Auto-Apply': '/#/auto-apply',
};

const profileStatusEl = document.getElementById('profile-status');
const queueStatusEl = document.getElementById('queue-status');
const runStatusEl = document.getElementById('run-status');
const nextStepTitleEl = document.getElementById('next-step-title');
const nextStepCopyEl = document.getElementById('next-step-copy');
const nextStepButton = document.getElementById('next-step-button');
const jobScoreEl = document.getElementById('job-score');
const jobScoreValueEl = document.getElementById('job-score-value');
const jobTitleEl = document.getElementById('job-title');
const jobMetaEl = document.getElementById('job-meta');
const jobSummaryEl = document.getElementById('job-summary');
const jobPillsEl = document.getElementById('job-pills');
const strengthsListEl = document.getElementById('strengths-list');
const gapsListEl = document.getElementById('gaps-list');
const footerCopyEl = document.getElementById('footer-copy');
const progressCardEl = document.getElementById('progress-card');
const progressLabelEl = document.getElementById('progress-label');
const progressValueEl = document.getElementById('progress-value');
const progressTitleEl = document.getElementById('progress-title');
const progressDetailEl = document.getElementById('progress-detail');
const progressFillEl = document.getElementById('progress-fill');
const progressStepEls = Array.from(document.querySelectorAll('.progress-step'));
const themeToggleButton = document.getElementById('theme-toggle');
const themeLabelEl = document.getElementById('theme-label');

const analyzeButton = document.getElementById('analyze');
const autofillButton = document.getElementById('autofill');
const syncProfileButton = document.getElementById('sync-profile');
const connectResumeAtsButton = document.getElementById('connect-resumeats');
const startQueueButton = document.getElementById('start-queue');
const clearQueueButton = document.getElementById('clear-queue');
const refreshButton = document.getElementById('refresh');
const openQuickButton = document.getElementById('open-quick');
const openAiButton = document.getElementById('open-ai');
const openAutoApplyButton = document.getElementById('open-auto-apply');
const openDashboardButton = document.getElementById('open-dashboard');

let recommendedAction = { type: 'capture' };
let isBusy = false;
let latestState = {};
let progressInterval = null;
let progressHideTimeout = null;
let progressValue = 0;
let footerCopyHoldUntil = 0;
const WARNING_COPY_HOLD_MS = 45000;
const WARNING_PROGRESS_HOLD_MS = 10000;
const SUCCESS_PROGRESS_HOLD_MS = 2200;

const PROGRESS_COPY = {
  analyze: {
    label: 'Analyze',
    title: 'Reading the active job',
    detail: 'Scanning the page, extracting role details, and calculating match context.',
  },
  autofill: {
    label: 'Autofill',
    title: 'Filling the application',
    detail: 'Preparing your tailored resume, detecting fields, choosing dropdowns, and uploading documents where possible.',
  },
  sync: {
    label: 'Sync',
    title: 'Syncing your profile',
    detail: 'Reading ResumeATS profile data, checking missing fields, and caching it for autofill.',
  },
  connect: {
    label: 'Connect',
    title: 'Connecting ResumeATS',
    detail: 'Opening or syncing your ResumeATS account so the extension can use your candidate data.',
  },
  queue: {
    label: 'Queue',
    title: 'Updating the queue',
    detail: 'Updating the browser automation queue and refreshing extension state.',
  },
  refresh: {
    label: 'Refresh',
    title: 'Refreshing state',
    detail: 'Reloading profile, job, queue, and recommendation state.',
  },
  resume: {
    label: 'AI Resume',
    title: 'Generating tailored resume',
    detail: 'Using the active job description to craft, save, and prepare the best-fit resume.',
  },
  route: {
    label: 'Open',
    title: 'Opening ResumeATS',
    detail: 'Switching to the selected ResumeATS workflow.',
  },
  generic: {
    label: 'Working',
    title: 'Working on this request',
    detail: 'Keep this panel open while ResumeATS completes the action.',
  },
};

const interactiveButtons = [
  nextStepButton,
  analyzeButton,
  autofillButton,
  syncProfileButton,
  connectResumeAtsButton,
  startQueueButton,
  clearQueueButton,
  refreshButton,
  openQuickButton,
  openAiButton,
  openAutoApplyButton,
  openDashboardButton,
].filter(Boolean);

const getDefaultTheme = () => (
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
);
const normalizeTheme = (value) => (value === 'light' || value === 'dark' ? value : getDefaultTheme());
const applyTheme = (value) => {
  const theme = normalizeTheme(value);
  document.documentElement.dataset.theme = theme;

  if (themeLabelEl) {
    themeLabelEl.textContent = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }

  if (themeToggleButton) {
    themeToggleButton.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    themeToggleButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggleButton.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }
};

const readTheme = async () => {
  try {
    const stored = await chrome.storage.local.get(THEME_STORAGE_KEY);
    return normalizeTheme(stored?.[THEME_STORAGE_KEY]);
  } catch {
    return getDefaultTheme();
  }
};

const writeTheme = async (theme) => {
  const nextTheme = normalizeTheme(theme);
  applyTheme(nextTheme);

  try {
    await chrome.storage.local.set({ [THEME_STORAGE_KEY]: nextTheme });
  } catch {
    // The static preview page has no extension storage.
  }
};

applyTheme(getDefaultTheme());
readTheme().then(applyTheme);

themeToggleButton?.addEventListener('click', async () => {
  const currentTheme = normalizeTheme(document.documentElement.dataset.theme);
  await writeTheme(currentTheme === 'dark' ? 'light' : 'dark');
});

globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName === 'local' && changes?.[THEME_STORAGE_KEY]) {
    applyTheme(changes[THEME_STORAGE_KEY].newValue);
  }
});

const sendMessage = (type, payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        const error = new Error(chrome.runtime.lastError.message || 'Extension request failed');
        error.code = /Extension context invalidated/i.test(error.message)
          ? 'EXTENSION_CONTEXT_INVALIDATED'
          : 'EXTENSION_REQUEST_FAILED';
        reject(error);
        return;
      }

      if (response?.success === false) {
        reject(new Error(response.error || 'Extension request failed'));
        return;
      }

      resolve(response);
    });
  });

const handleExtensionContextInvalidated = (error) => {
  if (!/Extension context invalidated/i.test(error?.message || '')) {
    return false;
  }

  isBusy = false;
  clearProgressTimers();
  progressCardEl.hidden = true;
  setButtonsDisabled(true);
  setFooterCopy(
    'This panel is stale because the extension was reloaded or updated. Close it and open the side panel again from the extension icon.',
    { force: true, stickyMs: WARNING_COPY_HOLD_MS }
  );
  profileStatusEl.textContent = 'Reconnect needed';
  queueStatusEl.textContent = '--';
  runStatusEl.textContent = 'Reload required';
  return true;
};

const escapeHtml = (value = '') =>
  `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMissingProfileFields = (fields = []) => Array.from(new Set(fields.filter(Boolean))).join(', ');
const buildMissingProfileCopy = (fields = []) => (
  `ResumeATS profile is missing ${formatMissingProfileFields(fields)}. Complete your ResumeATS profile/resume contact details, reload ResumeATS, then click Connect ResumeATS again.`
);

const setFooterCopy = (value, options = {}) => {
  const { force = false, stickyMs = 0 } = options;
  if (!force && Date.now() < footerCopyHoldUntil) {
    return false;
  }

  footerCopyEl.textContent = value;
  footerCopyEl.title = value;
  footerCopyHoldUntil = stickyMs > 0 ? Date.now() + stickyMs : 0;
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

const normalizeProgressCopy = (copy = {}) => ({
  ...PROGRESS_COPY.generic,
  ...(typeof copy === 'string' ? { title: copy } : copy),
});

const getProgressStepCount = (value) => {
  if (value >= 100) return 4;
  if (value >= 74) return 3;
  if (value >= 42) return 2;
  return 1;
};

const renderProgress = ({ label, title, detail, value, tone = 'busy', visible = true }) => {
  progressCardEl.hidden = !visible;
  progressCardEl.dataset.tone = tone;
  progressLabelEl.textContent = label;
  progressValueEl.textContent = `${Math.round(value)}%`;
  if (progressTitleEl) progressTitleEl.textContent = title || label;
  if (progressDetailEl) progressDetailEl.textContent = detail || '';
  progressFillEl.style.width = `${Math.max(0, Math.min(100, value))}%`;
  const activeSteps = getProgressStepCount(value);
  progressStepEls.forEach((step, index) => {
    step.dataset.active = index < activeSteps ? 'true' : 'false';
  });
};

const startProgress = (copy) => {
  clearProgressTimers();
  const progressCopy = normalizeProgressCopy(copy);
  progressValue = 12;
  renderProgress({ ...progressCopy, value: progressValue, tone: 'busy' });
  progressInterval = window.setInterval(() => {
    progressValue = Math.min(
      progressValue + (progressValue < 48 ? 11 : progressValue < 74 ? 6 : 2),
      88,
    );
    renderProgress({ ...progressCopy, value: progressValue, tone: 'busy' });
  }, 260);
};

const settleProgress = (copy, tone) => {
  clearProgressTimers();
  const progressCopy = normalizeProgressCopy(copy);
  progressValue = 100;
  renderProgress({ ...progressCopy, value: progressValue, tone });
  progressHideTimeout = window.setTimeout(() => {
    progressCardEl.hidden = true;
  }, tone === 'warning' ? WARNING_PROGRESS_HOLD_MS : SUCCESS_PROGRESS_HOLD_MS);
};

const getStoredProgressValue = (progress = {}) => {
  if (!progress.active) return 100;
  const startedAt = Number(progress.startedAt) || Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  return Math.min(88, Math.max(12, 12 + Math.floor(elapsedMs / 650)));
};

const isStoredProgressExpired = (progress = {}) => {
  const now = Date.now();
  if (!progress?.id) return true;
  if (progress.active) {
    const lastUpdate = Number(progress.updatedAt || progress.startedAt || now);
    return now - lastUpdate > ACTION_PROGRESS_STALE_MS;
  }

  return Number(progress.hideAfterAt || 0) > 0 && now > Number(progress.hideAfterAt);
};

const clearStoredActionProgress = async (id = '') => {
  try {
    const stored = await chrome.storage.local.get(ACTION_PROGRESS_KEY);
    const current = stored?.[ACTION_PROGRESS_KEY];
    if (!id || current?.id === id) {
      await chrome.storage.local.remove(ACTION_PROGRESS_KEY);
    }
  } catch {
    // Static previews do not expose extension storage.
  }
};

const renderStoredActionProgress = (progress) => {
  clearProgressTimers();

  if (!progress || isStoredProgressExpired(progress)) {
    if (progress?.id) {
      clearStoredActionProgress(progress.id);
    }
    if (!isBusy) {
      progressCardEl.hidden = true;
      setButtonsDisabled(false);
    }
    return;
  }

  const progressCopy = normalizeProgressCopy({
    label: progress.label,
    title: progress.title,
    detail: progress.detail,
  });

  if (progress.active) {
    isBusy = true;
    setButtonsDisabled(true);
    const renderActiveProgress = () => {
      progressValue = getStoredProgressValue(progress);
      renderProgress({ ...progressCopy, value: progressValue, tone: 'busy' });
    };

    renderActiveProgress();
    progressInterval = window.setInterval(renderActiveProgress, 1000);
    if (progressCopy.detail) {
      setFooterCopy(progressCopy.detail, { force: true });
    }
    return;
  }

  isBusy = false;
  setButtonsDisabled(false);
  progressValue = 100;
  const tone = progress.tone || 'success';
  renderProgress({ ...progressCopy, value: progressValue, tone });
  if (progressCopy.detail) {
    setFooterCopy(progressCopy.detail, {
      force: true,
      stickyMs: tone === 'warning' ? WARNING_COPY_HOLD_MS : 0,
    });
  }

  const hideAfter = Number(progress.hideAfterAt || 0);
  const hideDelay = hideAfter > Date.now()
    ? hideAfter - Date.now()
    : (tone === 'warning' ? WARNING_PROGRESS_HOLD_MS : SUCCESS_PROGRESS_HOLD_MS);
  progressHideTimeout = window.setTimeout(() => {
    progressCardEl.hidden = true;
    clearStoredActionProgress(progress.id);
  }, hideDelay);
};

const restoreStoredActionProgress = async () => {
  try {
    const stored = await chrome.storage.local.get(ACTION_PROGRESS_KEY);
    renderStoredActionProgress(stored?.[ACTION_PROGRESS_KEY]);
  } catch {
    // Ignore outside an extension runtime.
  }
};

const setButtonsDisabled = (disabled) => {
  interactiveButtons.forEach((button) => {
    button.disabled = disabled;
  });
};

const runBusyAction = async (work, pendingCopy, failureCopy, successCopy = 'Done', progressCopy = {}) => {
  if (isBusy) return null;

  isBusy = true;
  setButtonsDisabled(true);
  if (pendingCopy) setFooterCopy(pendingCopy, { force: true });
  startProgress(progressCopy.pending || progressCopy || pendingCopy || PROGRESS_COPY.generic);

  try {
    const result = await work();
    settleProgress(progressCopy.success || {
      label: 'Done',
      title: successCopy,
      detail: 'The action completed successfully. You can continue with the next step.',
    }, 'success');
    return result;
  } catch (error) {
    if (handleExtensionContextInvalidated(error)) {
      return null;
    }
    setFooterCopy(error?.message || failureCopy, { force: true, stickyMs: WARNING_COPY_HOLD_MS });
    settleProgress(progressCopy.failure || {
      label: 'Needs attention',
      title: failureCopy || 'Could not finish',
      detail: error?.message || 'Review the message below, then try again.',
    }, 'warning');
    return null;
  } finally {
    isBusy = false;
    setButtonsDisabled(false);
  }
};

const renderPills = (items = []) => {
  if (items.length === 0) {
    jobPillsEl.innerHTML = '';
    return;
  }

  jobPillsEl.innerHTML = items
    .map((item) => `<span class="pill">${escapeHtml(item)}</span>`)
    .join('');
};

const renderInsightList = (element, items, emptyCopy) => {
  if (!items || items.length === 0) {
    element.innerHTML = `<div class="muted">${escapeHtml(emptyCopy)}</div>`;
    return;
  }

  element.innerHTML = items
    .map((item) => `<div class="insight-item"><span>${escapeHtml(item)}</span></div>`)
    .join('');
};

const openRoute = async (route) => {
  await sendMessage('OPEN_RESUMEATS_ROUTE', { route });
};

const getAutofillOutcomeMessage = (result = {}) => {
  if (result.pendingNavigation) {
    return 'Opened the application flow. Once the actual form step is visible, run Autofill again.';
  }

  if ((result.filledCount || 0) > 0) {
    return `Autofilled ${result.filledCount} field${result.filledCount === 1 ? '' : 's'} on the current page.`;
  }

  return result.zeroFillReason
    || 'I found the page, but not any fillable application questions yet. Scroll or expand the form, then try Autofill again.';
};

const applyAutofillOutcome = (result = {}) => {
  const message = getAutofillOutcomeMessage(result);
  if (result.pendingNavigation || (result.filledCount || 0) > 0) {
    if (result.preparedResume?.title) {
      setFooterCopy(`Prepared "${result.preparedResume.title}" and ${message.charAt(0).toLowerCase()}${message.slice(1)}`, { force: true });
      return;
    }
    setFooterCopy(message, { force: true });
    return;
  }

  throw new Error(message);
};

const getPreparedResumeOutcomeMessage = (response = {}) => {
  const resumeTitle = response.preparedResume?.title
    || response.profile?.documents?.preparedResumeTitle
    || 'tailored resume';
  const roleTitle = response.activeJob?.title || latestState?.lastJobSnapshot?.title || 'this role';
  return `Prepared "${resumeTitle}" for ${roleTitle}. Use Autofill to attach it and complete the application.`;
};

const prepareAiResumeForActiveTab = async () => {
  const response = await sendMessage('PREPARE_ACTIVE_TAB_RESUME');
  await refreshState();
  setFooterCopy(getPreparedResumeOutcomeMessage(response), { force: true });
  return response;
};

const getRecommendation = (state, latestJob, analysis) => {
  if (!state?.hasProfile) {
    return {
      type: 'connect',
      buttonLabel: 'Connect ResumeATS',
      title: 'Connect your profile',
      copy: 'Sign in once so scoring, resume generation, and autofill can use your real candidate data.',
      footer:
        'Connect ResumeATS to sync your profile into the extension.',
    };
  }

  if (!latestJob) {
    return {
      type: 'capture',
      buttonLabel: 'Scan this tab',
      title: 'Scan the open role',
      copy: 'Capture the job, read fit, then choose resume tailoring or direct autofill.',
      footer: 'Open a job posting or application page, then scan it from here.',
    };
  }

  if (analysis?.recommendedLabel) {
    const isAiGenerator = analysis.recommendedLabel === 'AI Generator';
    return {
      type: isAiGenerator ? 'prepare-resume' : 'route',
      route: ROUTE_BY_LABEL[analysis.recommendedLabel] || '/#/dashboard',
      buttonLabel: isAiGenerator ? 'AI Resume' : `Open ${analysis.recommendedLabel}`,
      title: isAiGenerator ? 'AI Resume is next' : `${analysis.recommendedLabel} is next`,
      copy:
        analysis.recommendedLabel === 'Quick Resume'
          ? 'This role looks close enough to tailor fast and keep the browser session moving.'
          : analysis.recommendedLabel === 'AI Generator'
            ? 'Generate a deeply tailored resume from the captured job description without leaving this page.'
            : 'Move this role into the broader application workflow.',
      footer: isAiGenerator
        ? 'Recommended: generate a tailored AI resume for this role.'
        : `Recommended: ${analysis.recommendedLabel}.`,
    };
  }

  return {
    type: 'capture',
    buttonLabel: 'Scan again',
    title: 'Refresh the readout',
    copy: 'Run another scan if the page loaded more details or the role changed.',
    footer: 'Scan again to refresh fit and recommendations.',
  };
};

const renderState = (state = {}) => {
  latestState = state;
  profileStatusEl.textContent = state?.hasProfile
    ? [state?.candidateName || '', state?.candidateTitle || ''].filter(Boolean).join(' / ') || 'Synced'
    : 'Sync needed';
  queueStatusEl.textContent = `${state?.queueSize || 0} tracked`;
  runStatusEl.textContent = state?.isRunning ? 'Running' : 'Idle';
  syncProfileButton.textContent = 'Sync profile';
  connectResumeAtsButton.textContent = state?.hasProfile ? 'Open app' : 'Sign in';

  const latestJob = state?.lastJobSnapshot || null;
  const analysis = latestJob?.analysis || null;
  const score = analysis?.score || 0;
  const recommendation = getRecommendation(state, latestJob, analysis);
  const hasQueue = (state?.queueSize || 0) > 0;

  document.body.dataset.hasProfile = state?.hasProfile ? 'true' : 'false';
  document.body.dataset.hasJob = latestJob ? 'true' : 'false';
  document.body.dataset.hasAnalysis = analysis ? 'true' : 'false';

  recommendedAction = recommendation;
  nextStepTitleEl.textContent = recommendation.title;
  nextStepCopyEl.textContent = recommendation.copy;
  nextStepButton.textContent = recommendation.buttonLabel;
  analyzeButton.textContent = latestJob ? 'Scan again' : 'Scan';
  startQueueButton.hidden = !hasQueue;
  clearQueueButton.hidden = !hasQueue;
  setFooterCopy(recommendation.footer);

  jobScoreEl.style.setProperty('--score', `${score}`);
  jobScoreValueEl.textContent = analysis ? `${score}` : '--';
  jobTitleEl.textContent = latestJob?.title || 'No role yet';
  jobMetaEl.textContent = [
    latestJob?.company || '',
    latestJob?.location || '',
    latestJob?.providerLabel || '',
  ]
    .filter(Boolean)
    .join(' / ') || 'Scan a job posting or application page.';
  jobSummaryEl.textContent =
    analysis?.summary || 'Fit details and suggested actions appear here after scanning.';

  renderPills(
    [
      latestJob?.providerLabel || '',
      latestJob?.employmentType || '',
      latestJob?.salary || '',
      ...(analysis?.matchedSkills || []).slice(0, 3),
    ].filter(Boolean),
  );

  renderInsightList(
    strengthsListEl,
    analysis?.strengths || [],
    'Analyze a job to surface your strongest positioning points.',
  );
  renderInsightList(
    gapsListEl,
    analysis?.gaps || [],
    'Potential gaps will show up here so you know when the AI flow is worth using.',
  );
};

const refreshState = async () => {
  const state = await sendMessage('GET_STATE');
  renderState(state);
  return state;
};

const syncProfileFromResumeAts = async () => {
  const response = await sendMessage('SYNC_PROFILE_FROM_APP');
  await refreshState();
  const missingFields = response?.summary?.missingProfileFields || [];
  if (missingFields.length > 0) {
    throw new Error(buildMissingProfileCopy(missingFields));
  }
  const candidateName = response?.summary?.candidateName || response?.result?.candidate?.fullName || 'ResumeATS profile';
  setFooterCopy(`Synced ${candidateName} into the extension.`, { force: true });
  return response;
};

const captureCurrentJob = async () => {
  const response = await sendMessage('CAPTURE_ACTIVE_JOB_POSTING');
  const state = await refreshState();
  renderState({
    ...state,
    lastJobSnapshot: response?.jobPosting || state?.lastJobSnapshot || null,
  });
};

const runRecommendedAction = async () => {
  if (recommendedAction.type === 'connect') {
    await syncProfileFromResumeAts();
    return;
  }

  if (recommendedAction.type === 'route' && recommendedAction.route) {
    if (recommendedAction.route === '/#/ai-generator') {
      await prepareAiResumeForActiveTab();
      return;
    }
    await openRoute(recommendedAction.route);
    return;
  }

  if (recommendedAction.type === 'prepare-resume') {
    await prepareAiResumeForActiveTab();
    return;
  }

  await captureCurrentJob();
};

const getRecommendedProgressCopy = () => {
  if (recommendedAction.type === 'connect') return PROGRESS_COPY.sync;
  if (recommendedAction.type === 'prepare-resume') return PROGRESS_COPY.resume;
  if (recommendedAction.type === 'route') return PROGRESS_COPY.route;
  return PROGRESS_COPY.analyze;
};

analyzeButton.addEventListener('click', () => runBusyAction(
  () => captureCurrentJob(),
  'Analyzing the active tab...',
  'Could not analyze the active tab.',
  'Job analysis ready',
  {
    pending: PROGRESS_COPY.analyze,
    success: {
      label: 'Analysis ready',
      title: 'Job analysis ready',
      detail: 'ResumeATS captured the role and updated your match context.',
    },
  }
));

autofillButton.addEventListener('click', () => runBusyAction(
  async () => {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    applyAutofillOutcome(response?.result || {});
  },
  'Preparing a tailored resume and autofilling the current page...',
  'Could not autofill the current page.',
  'Autofill complete',
  {
    pending: PROGRESS_COPY.autofill,
    success: {
      label: 'Autofill done',
      title: 'Autofill complete',
      detail: 'ResumeATS finished the visible fields it could safely detect on this page.',
    },
    failure: {
      label: 'Review page',
      title: 'Autofill needs attention',
      detail: 'Some pages hide fields behind steps, iframes, or unloaded sections. Review the message below before retrying.',
    },
  }
));

syncProfileButton.addEventListener('click', () => runBusyAction(
  () => syncProfileFromResumeAts(),
  'Syncing your ResumeATS profile...',
  'Could not sync your ResumeATS profile.',
  'Profile synced',
  {
    pending: PROGRESS_COPY.sync,
    success: {
      label: 'Synced',
      title: 'Profile synced',
      detail: 'Your latest ResumeATS profile is cached and ready for autofill.',
    },
    failure: {
      label: 'Profile incomplete',
      title: 'Profile sync needs attention',
      detail: 'Complete the missing profile fields shown below, then sync again.',
    },
  }
));

connectResumeAtsButton.addEventListener('click', () => runBusyAction(
  async () => {
    if (latestState?.hasProfile) {
      await openRoute('/#/dashboard');
      return;
    }

    await syncProfileFromResumeAts();
  },
  latestState?.hasProfile ? 'Opening ResumeATS...' : 'Connecting ResumeATS profile...',
  latestState?.hasProfile ? 'Could not open ResumeATS.' : 'Could not connect ResumeATS profile.',
  latestState?.hasProfile ? 'ResumeATS opened' : 'Profile synced',
  latestState?.hasProfile
    ? {
      pending: PROGRESS_COPY.route,
      success: {
        label: 'Opened',
        title: 'ResumeATS opened',
        detail: 'The app route is open. Return here when you are ready to scan or autofill.',
      },
    }
    : {
      pending: PROGRESS_COPY.connect,
      success: {
        label: 'Connected',
        title: 'Profile connected',
        detail: 'Your ResumeATS profile is synced into the extension.',
      },
    }
));

startQueueButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('START_RUN');
    await refreshState();
  },
  'Starting the browser queue...',
  'Could not start the browser queue.',
  'Queue started',
  {
    pending: PROGRESS_COPY.queue,
    success: {
      label: 'Queue ready',
      title: 'Queue started',
      detail: 'ResumeATS started the browser queue and refreshed the run state.',
    },
  }
));

clearQueueButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('CLEAR_QUEUE');
    await refreshState();
  },
  'Clearing the queue...',
  'Could not clear the queue.',
  'Queue cleared',
  {
    pending: PROGRESS_COPY.queue,
    success: {
      label: 'Queue clear',
      title: 'Queue cleared',
      detail: 'Queued browser automation work has been cleared.',
    },
  }
));

refreshButton.addEventListener('click', () => runBusyAction(
  () => refreshState(),
  'Refreshing extension state...',
  'Could not refresh extension state.',
  'State refreshed',
  {
    pending: PROGRESS_COPY.refresh,
    success: {
      label: 'Refreshed',
      title: 'State refreshed',
      detail: 'Profile, job, queue, and recommendation state are up to date.',
    },
  }
));
nextStepButton.addEventListener('click', () => runBusyAction(
  () => runRecommendedAction(),
  'Working on the recommended action...',
  'Could not complete the recommended action.',
  'Recommended action complete',
  {
    pending: getRecommendedProgressCopy(),
    success: {
      label: 'Done',
      title: 'Recommended action complete',
      detail: 'The recommended action finished. Check the job card for updated context.',
    },
  }
));
openQuickButton.addEventListener('click', () => openRoute('/#/quick-resume'));
openAiButton.addEventListener('click', () => runBusyAction(
  () => prepareAiResumeForActiveTab(),
  'Generating a tailored AI resume from the active job...',
  'Could not generate a tailored resume for the active job.',
  'AI resume ready',
  {
    pending: PROGRESS_COPY.resume,
    success: {
      label: 'Resume ready',
      title: 'AI resume ready',
      detail: 'The tailored resume is prepared. Use Autofill to attach it and finish the form.',
    },
    failure: {
      label: 'Resume failed',
      title: 'AI resume could not be prepared',
      detail: 'Check that the active tab contains a job description and that your profile is synced.',
    },
  }
));
openAutoApplyButton.addEventListener('click', () => openRoute('/#/auto-apply'));
openDashboardButton.addEventListener('click', () => openRoute('/#/dashboard'));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes?.[ACTION_PROGRESS_KEY]) {
    renderStoredActionProgress(changes[ACTION_PROGRESS_KEY].newValue);
  }

  if (changes?.[STORAGE_KEY]) {
    refreshState().catch((error) => {
      setFooterCopy(error?.message || 'Could not refresh extension state.');
    });
  }
});

refreshState().catch((error) => {
  if (handleExtensionContextInvalidated(error)) {
    return;
  }
  setFooterCopy(error.message || 'Could not read extension state.');
});

restoreStoredActionProgress().catch(() => {});
