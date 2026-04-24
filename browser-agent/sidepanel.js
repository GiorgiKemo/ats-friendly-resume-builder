/* global chrome */

const STORAGE_KEY = 'resumeatsBrowserAgentState';
const THEME_STORAGE_KEY = 'resumeatsExtensionTheme';

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
const progressFillEl = document.getElementById('progress-fill');
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
  setFooterCopy('This panel is stale because the extension was reloaded or updated. Close it and open the side panel again from the extension icon.');
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

const setFooterCopy = (value) => {
  footerCopyEl.textContent = value;
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
  }, tone === 'warning' ? 1400 : 800);
};

const setButtonsDisabled = (disabled) => {
  interactiveButtons.forEach((button) => {
    button.disabled = disabled;
  });
};

const runBusyAction = async (work, pendingCopy, failureCopy, successCopy = 'Done') => {
  if (isBusy) return null;

  isBusy = true;
  setButtonsDisabled(true);
  if (pendingCopy) setFooterCopy(pendingCopy);
  startProgress(pendingCopy || 'Working');

  try {
    const result = await work();
    settleProgress(successCopy, 'success');
    return result;
  } catch (error) {
    if (handleExtensionContextInvalidated(error)) {
      return null;
    }
    setFooterCopy(error?.message || failureCopy);
    settleProgress(error?.message || failureCopy || 'Could not finish', 'warning');
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
      setFooterCopy(`Prepared "${result.preparedResume.title}" and ${message.charAt(0).toLowerCase()}${message.slice(1)}`);
      return;
    }
    setFooterCopy(message);
    return;
  }

  throw new Error(message);
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
    return {
      type: 'route',
      route: ROUTE_BY_LABEL[analysis.recommendedLabel] || '/#/dashboard',
      buttonLabel: `Open ${analysis.recommendedLabel}`,
      title: `${analysis.recommendedLabel} is next`,
      copy:
        analysis.recommendedLabel === 'Quick Resume'
          ? 'This role looks close enough to tailor fast and keep the browser session moving.'
          : analysis.recommendedLabel === 'AI Generator'
            ? 'Use AI tailoring when the posting needs deeper rewriting.'
            : 'Move this role into the broader application workflow.',
      footer: `Recommended: ${analysis.recommendedLabel}.`,
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
  const candidateName = response?.summary?.candidateName || response?.result?.candidate?.fullName || 'ResumeATS profile';
  setFooterCopy(`Synced ${candidateName} into the extension.`);
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
    await openRoute(recommendedAction.route);
    return;
  }

  await captureCurrentJob();
};

analyzeButton.addEventListener('click', () => runBusyAction(
  () => captureCurrentJob(),
  'Analyzing the active tab...',
  'Could not analyze the active tab.',
  'Job analysis ready'
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

startQueueButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('START_RUN');
    await refreshState();
  },
  'Starting the browser queue...',
  'Could not start the browser queue.',
  'Queue started'
));

clearQueueButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('CLEAR_QUEUE');
    await refreshState();
  },
  'Clearing the queue...',
  'Could not clear the queue.',
  'Queue cleared'
));

refreshButton.addEventListener('click', () => runBusyAction(
  () => refreshState(),
  'Refreshing extension state...',
  'Could not refresh extension state.',
  'State refreshed'
));
nextStepButton.addEventListener('click', () => runBusyAction(
  () => runRecommendedAction(),
  'Working on the recommended action...',
  'Could not complete the recommended action.',
  'Recommended action complete'
));
openQuickButton.addEventListener('click', () => openRoute('/#/quick-resume'));
openAiButton.addEventListener('click', () => openRoute('/#/ai-generator'));
openAutoApplyButton.addEventListener('click', () => openRoute('/#/auto-apply'));
openDashboardButton.addEventListener('click', () => openRoute('/#/dashboard'));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes?.[STORAGE_KEY]) {
    return;
  }

  refreshState().catch((error) => {
    setFooterCopy(error?.message || 'Could not refresh extension state.');
  });
});

refreshState().catch((error) => {
  if (handleExtensionContextInvalidated(error)) {
    return;
  }
  setFooterCopy(error.message || 'Could not read extension state.');
});
