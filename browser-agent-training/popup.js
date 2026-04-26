/* global chrome */

const STORAGE_KEY = 'resumeatsAutofillTrainerState';
const UI_SETTINGS_KEY = 'resumeatsAutofillTrainerUi';
const THEME_STORAGE_KEY = 'resumeatsExtensionTheme';
const ACTION_PROGRESS_KEY = 'resumeatsAutofillTrainerActionProgress';
const ACTION_PROGRESS_STALE_MS = 30 * 60 * 1000;
const DEFAULT_UI_SETTINGS = {
  enabled: true,
  disabledHosts: [],
};

const ROUTE_BY_LABEL = {
  'Quick Resume': '/#/quick-resume',
  'AI Generator': '/#/ai-generator',
  'Auto-Apply': '/#/auto-apply',
};

const statusEl = document.getElementById('status');
const queueEl = document.getElementById('queue');
const snapshotStateEl = document.getElementById('snapshot-state');
const latestJobEl = document.getElementById('latest-job');
const latestJobMetaEl = document.getElementById('latest-job-meta');
const jobScoreEl = document.getElementById('job-score');
const jobScoreValueEl = document.getElementById('job-score-value');
const jobSummaryEl = document.getElementById('job-summary');
const jobPillsEl = document.getElementById('job-pills');
const hintEl = document.getElementById('hint');
const toggleCopyEl = document.getElementById('toggle-copy');
const recommendedTitleEl = document.getElementById('recommended-title');
const recommendedCopyEl = document.getElementById('recommended-copy');
const recommendedButton = document.getElementById('recommended-button');
const progressCardEl = document.getElementById('progress-card');
const progressLabelEl = document.getElementById('progress-label');
const progressValueEl = document.getElementById('progress-value');
const progressFillEl = document.getElementById('progress-fill');
const themeToggleButton = document.getElementById('theme-toggle');
const themeLabelEl = document.getElementById('theme-label');

const captureButton = document.getElementById('capture');
const openCompanionButton = document.getElementById('open-companion');
const autofillButton = document.getElementById('autofill');
const syncProfileButton = document.getElementById('sync-profile');
const connectResumeAtsButton = document.getElementById('connect-resumeats');
const startButton = document.getElementById('start');
const refreshButton = document.getElementById('refresh');
const quickResumeButton = document.getElementById('quick-resume');
const aiGeneratorButton = document.getElementById('ai-generator');
const autoApplyButton = document.getElementById('auto-apply');
const toggleSiteWidgetButton = document.getElementById('toggle-site-widget');
const toggleGlobalWidgetButton = document.getElementById('toggle-global-widget');

let recommendedAction = { type: 'capture' };
let isBusy = false;
let currentTab = null;
let latestState = {};
let progressInterval = null;
let progressHideTimeout = null;
let progressValue = 0;
let hintHoldUntil = 0;
const WARNING_COPY_HOLD_MS = 45000;
const WARNING_PROGRESS_HOLD_MS = 10000;

const interactiveButtons = [
  recommendedButton,
  captureButton,
  openCompanionButton,
  autofillButton,
  syncProfileButton,
  connectResumeAtsButton,
  startButton,
  refreshButton,
  quickResumeButton,
  aiGeneratorButton,
  autoApplyButton,
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
  const stored = await chrome.storage.local.get(UI_SETTINGS_KEY);
  return sanitizeUiSettings(stored?.[UI_SETTINGS_KEY] || DEFAULT_UI_SETTINGS);
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
const getCurrentTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
};
const getTabUrl = (tab) => {
  try {
    return new URL(tab?.url || '');
  } catch {
    return null;
  }
};
const isHostToggleable = (host) => Boolean(host)
  && !/(^|\.)resumeats\.cv$/i.test(host)
  && !/^localhost$/i.test(host)
  && !/^127\.0\.0\.1$/i.test(host)
  && !/^10(?:\.\d{1,3}){3}$/i.test(host)
  && !/^192\.168(?:\.\d{1,3}){2}$/i.test(host)
  && !/^172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/i.test(host)
  && !/\.local$/i.test(host);

const renderWidgetControls = async () => {
  currentTab = await getCurrentTab();
  const url = getTabUrl(currentTab);
  const host = normalizeHostKey(url?.hostname || '');
  const settings = await readUiSettings();
  const siteDisabled = Boolean(host) && settings.disabledHosts.includes(host);
  const siteToggleable = isHostToggleable(host);

  toggleGlobalWidgetButton.textContent = settings.enabled ? 'Turn widget off' : 'Turn widget on';
  toggleSiteWidgetButton.disabled = !siteToggleable;
  toggleSiteWidgetButton.textContent = siteDisabled ? 'Show on this site' : 'Pause on this site';

  if (!url || !/^https?:$/i.test(url.protocol)) {
    toggleCopyEl.textContent = 'Open a normal website tab to manage the docked companion on that site.';
    return;
  }

  if (/(^|\.)resumeats\.cv$/i.test(host)) {
    toggleCopyEl.textContent = 'The docked companion is hidden on ResumeATS itself. Open a job posting or application tab to manage it there.';
    return;
  }

  if (!siteToggleable) {
    toggleCopyEl.textContent = `Widget controls for ${url.hostname} are locked because this page is private, local, or part of ResumeATS itself.`;
    return;
  }

  toggleCopyEl.textContent = settings.enabled
    ? (siteDisabled
      ? `The docked companion is currently hidden on ${url.hostname}.`
      : `The docked companion is currently visible on ${url.hostname}.`)
    : 'The docked companion is currently turned off globally.';
};

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
  setHint(
    'This extension surface is stale because the extension was reloaded or updated. Close it and open it again from the extension icon.',
    { force: true, stickyMs: WARNING_COPY_HOLD_MS }
  );
  statusEl.textContent = 'Reconnect needed';
  queueEl.textContent = '--';
  snapshotStateEl.textContent = 'Reload required';
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
const buildMissingProfileHint = (fields = []) => (
  `ResumeATS profile is missing ${formatMissingProfileFields(fields)}. Complete your ResumeATS profile/resume contact details, reload ResumeATS, then click Connect ResumeATS again.`
);

const setHint = (value, options = {}) => {
  const { force = false, stickyMs = 0 } = options;
  if (!force && Date.now() < hintHoldUntil) {
    return false;
  }

  hintEl.textContent = value;
  hintEl.title = value;
  hintHoldUntil = stickyMs > 0 ? Date.now() + stickyMs : 0;
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

const renderProgress = ({ label, value, tone = 'busy', visible = true }) => {
  progressCardEl.hidden = !visible;
  progressCardEl.dataset.tone = tone;
  progressLabelEl.textContent = label;
  progressValueEl.textContent = `${Math.round(value)}%`;
  progressFillEl.style.width = `${Math.max(0, Math.min(100, value))}%`;
};

const startProgress = (label) => {
  clearProgressTimers();
  progressValue = 12;
  renderProgress({ label, value: progressValue, tone: 'busy' });
  progressInterval = window.setInterval(() => {
    progressValue = Math.min(
      progressValue + (progressValue < 48 ? 11 : progressValue < 74 ? 6 : 2),
      88,
    );
    renderProgress({ label, value: progressValue, tone: 'busy' });
  }, 260);
};

const settleProgress = (label, tone) => {
  clearProgressTimers();
  progressValue = 100;
  renderProgress({ label, value: progressValue, tone });
  progressHideTimeout = window.setTimeout(() => {
    progressCardEl.hidden = true;
  }, tone === 'warning' ? WARNING_PROGRESS_HOLD_MS : 800);
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

  const label = progress.label || progress.title || 'Working';

  if (progress.active) {
    isBusy = true;
    setButtonsDisabled(true);
    const renderActiveProgress = () => {
      progressValue = getStoredProgressValue(progress);
      renderProgress({ label, value: progressValue, tone: 'busy' });
    };

    renderActiveProgress();
    progressInterval = window.setInterval(renderActiveProgress, 1000);
    if (progress.detail || progress.title) {
      setHint(progress.detail || progress.title, { force: true });
    }
    return;
  }

  isBusy = false;
  setButtonsDisabled(false);
  progressValue = 100;
  const tone = progress.tone || 'success';
  renderProgress({ label, value: progressValue, tone });
  if (progress.detail || progress.title) {
    setHint(progress.detail || progress.title, {
      force: true,
      stickyMs: tone === 'warning' ? WARNING_COPY_HOLD_MS : 0,
    });
  }

  const hideAfter = Number(progress.hideAfterAt || 0);
  const hideDelay = hideAfter > Date.now()
    ? hideAfter - Date.now()
    : (tone === 'warning' ? WARNING_PROGRESS_HOLD_MS : 800);
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

const runBusyAction = async (work, pendingHint, failureHint, successHint = 'Done') => {
  if (isBusy) return null;

  isBusy = true;
  setButtonsDisabled(true);
  if (pendingHint) setHint(pendingHint, { force: true });
  startProgress(pendingHint || 'Working');

  try {
    const result = await work();
    settleProgress(successHint, 'success');
    return result;
  } catch (error) {
    if (handleExtensionContextInvalidated(error)) {
      return null;
    }
    setHint(error?.message || failureHint, { force: true, stickyMs: WARNING_COPY_HOLD_MS });
    settleProgress(error?.message || failureHint || 'Could not finish', 'warning');
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
    .map((item) => `<span class="tag">${escapeHtml(item)}</span>`)
    .join('');
};

const openRoute = async (route) => {
  await sendMessage('OPEN_RESUMEATS_ROUTE', { route });
  window.close();
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
      setHint(`Prepared "${result.preparedResume.title}" and ${message.charAt(0).toLowerCase()}${message.slice(1)}`, { force: true });
      return;
    }
    setHint(message, { force: true });
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
  setHint(getPreparedResumeOutcomeMessage(response), { force: true });
  return response;
};

const getRecommendation = (state, latestJob, analysis) => {
  if (!state?.hasProfile) {
    return {
      type: 'connect',
      buttonLabel: 'Connect ResumeATS',
      title: 'Connect your profile',
      copy: 'Sign in once so scoring, resume generation, and autofill can use your real candidate data.',
      hint: 'Connect ResumeATS to sync your profile into the extension.',
    };
  }

  if (!latestJob) {
    return {
      type: 'capture',
      buttonLabel: 'Scan this tab',
      title: 'Scan the open role',
      copy: 'Capture the job, read fit, then choose resume tailoring or direct autofill.',
      hint: 'Open a job posting or application page, then scan it from here.',
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
          ? 'This role looks close enough to tailor quickly and export faster.'
          : analysis.recommendedLabel === 'AI Generator'
            ? 'Generate a deeply tailored resume from the captured job description without leaving this page.'
            : 'Move this role into the automated application workflow.',
      hint: isAiGenerator
        ? 'Recommended: generate a tailored AI resume for this role.'
        : `Recommended: ${analysis.recommendedLabel}.`,
    };
  }

  return {
    type: 'capture',
    buttonLabel: 'Scan again',
    title: 'Refresh the readout',
    copy: 'Run another scan if the page loaded more details or the role changed.',
    hint: 'Scan again to refresh fit and recommendations.',
  };
};

const renderState = (state = {}) => {
  latestState = state;
  statusEl.textContent = state?.isRunning ? 'Running' : state?.hasProfile ? 'Synced' : 'Sign in';
  queueEl.textContent = `${state?.queueSize || 0} tracked`;
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
  recommendedTitleEl.textContent = recommendation.title;
  recommendedCopyEl.textContent = recommendation.copy;
  recommendedButton.textContent = recommendation.buttonLabel;
  captureButton.textContent = latestJob ? 'Scan again' : 'Scan';
  startButton.hidden = !hasQueue;

  snapshotStateEl.textContent = latestJob
    ? analysis?.recommendedLabel || 'Captured'
    : 'Not scanned yet';

  jobScoreEl.style.setProperty('--score', `${score}`);
  jobScoreValueEl.textContent = analysis ? `${score}` : '--';
  latestJobEl.textContent = latestJob?.title || 'No role yet';
  latestJobMetaEl.textContent = [
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
      ...(analysis?.matchedSkills || []).slice(0, 2),
    ].filter(Boolean),
  );

  setHint(recommendation.hint);
};

const refreshState = async () => {
  const state = await sendMessage('GET_STATE');
  renderState(state);
  await renderWidgetControls();
  return state;
};

const syncProfileFromResumeAts = async () => {
  const response = await sendMessage('SYNC_PROFILE_FROM_APP');
  await refreshState();
  const missingFields = response?.summary?.missingProfileFields || [];
  if (missingFields.length > 0) {
    throw new Error(buildMissingProfileHint(missingFields));
  }
  const candidateName = response?.summary?.candidateName || response?.result?.candidate?.fullName || 'ResumeATS profile';
  setHint(`Synced ${candidateName} into the extension.`, { force: true });
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

const openCompanionSurface = async () => {
  if (chrome.sidebarAction?.open) {
    await chrome.sidebarAction.open();
    return;
  }

  await sendMessage('OPEN_SIDE_PANEL');
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

  if (recommendedAction.type === 'capture') {
    await captureCurrentJob();
    return;
  }

  if (recommendedAction.type === 'autofill') {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    applyAutofillOutcome(response?.result || {});
  }
};

captureButton.addEventListener('click', () => runBusyAction(
  () => captureCurrentJob(),
  'Analyzing the current tab...',
  'Could not analyze the current tab.',
  'Job analysis ready'
));

openCompanionButton.addEventListener('click', () => runBusyAction(
  async () => {
    await openCompanionSurface();
    window.close();
  },
  'Opening the side panel...',
  'Could not open the companion panel.',
  'Side panel opened'
));

autofillButton.addEventListener('click', () => runBusyAction(
  async () => {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    applyAutofillOutcome(response?.result || {});
  },
  'Preparing a tailored resume and autofilling the current page...',
  'Could not autofill the current page.',
  'Autofill complete'
));

syncProfileButton.addEventListener('click', () => runBusyAction(
  () => syncProfileFromResumeAts(),
  'Syncing your ResumeATS profile...',
  'Could not sync your ResumeATS profile.',
  'Profile synced'
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
  latestState?.hasProfile ? 'ResumeATS opened' : 'Profile synced'
));

startButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('START_RUN');
    await refreshState();
  },
  'Starting the queue...',
  'Could not start the queue.',
  'Queue started'
));

refreshButton.addEventListener('click', () => runBusyAction(
  () => refreshState(),
  'Refreshing extension state...',
  'Could not refresh extension state.',
  'State refreshed'
));
recommendedButton.addEventListener('click', () => runBusyAction(
  () => runRecommendedAction(),
  'Working on the recommended action...',
  'Could not complete the recommended action.',
  'Recommended action complete'
));
quickResumeButton.addEventListener('click', () => openRoute('/#/quick-resume'));
aiGeneratorButton.addEventListener('click', () => runBusyAction(
  () => prepareAiResumeForActiveTab(),
  'Generating a tailored AI resume from the active job...',
  'Could not generate a tailored resume for the active job.',
  'AI resume ready'
));
autoApplyButton.addEventListener('click', () => openRoute('/#/auto-apply'));

toggleSiteWidgetButton.addEventListener('click', async () => {
  const url = getTabUrl(currentTab);
  const host = normalizeHostKey(url?.hostname || '');
  if (!isHostToggleable(host)) return;

  await writeUiSettings((settings) => {
    const isDisabled = settings.disabledHosts.includes(host);
    return {
      ...settings,
      disabledHosts: isDisabled
        ? settings.disabledHosts.filter((entry) => entry !== host)
        : [...settings.disabledHosts, host],
    };
  });

  await renderWidgetControls();
  setHint(`Updated widget visibility for ${host}.`, { force: true });
});

toggleGlobalWidgetButton.addEventListener('click', async () => {
  const settings = await writeUiSettings((current) => ({
    ...current,
    enabled: current.enabled === false,
  }));
  await renderWidgetControls();
  setHint(settings.enabled ? 'Widget is on again.' : 'Widget is now off everywhere.', { force: true });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes?.[UI_SETTINGS_KEY]) {
    renderWidgetControls().catch((error) => {
      setHint(error?.message || 'Could not refresh widget controls.');
    });
  }

  if (changes?.[ACTION_PROGRESS_KEY]) {
    renderStoredActionProgress(changes[ACTION_PROGRESS_KEY].newValue);
  }

  if (changes?.[STORAGE_KEY]) {
    refreshState().catch((error) => {
      setHint(error?.message || 'Could not refresh extension state.');
    });
  }
});

refreshState().catch((error) => {
  if (handleExtensionContextInvalidated(error)) {
    return;
  }
  setHint(error.message || 'Could not read extension state.');
});

restoreStoredActionProgress().catch(() => {});
