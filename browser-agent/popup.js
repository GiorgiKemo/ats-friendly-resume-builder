/* global chrome */

const STORAGE_KEY = 'resumeatsBrowserAgentState';
const UI_SETTINGS_KEY = 'resumeatsBrowserAgentUi';
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

const captureButton = document.getElementById('capture');
const openCompanionButton = document.getElementById('open-companion');
const autofillButton = document.getElementById('autofill');
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

const interactiveButtons = [
  recommendedButton,
  captureButton,
  openCompanionButton,
  autofillButton,
  startButton,
  refreshButton,
  quickResumeButton,
  aiGeneratorButton,
  autoApplyButton,
].filter(Boolean);

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
        reject(chrome.runtime.lastError);
        return;
      }

      if (response?.success === false) {
        reject(new Error(response.error || 'Extension request failed'));
        return;
      }

      resolve(response);
    });
  });

const escapeHtml = (value = '') =>
  `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const setHint = (value) => {
  hintEl.textContent = value;
};

const setButtonsDisabled = (disabled) => {
  interactiveButtons.forEach((button) => {
    button.disabled = disabled;
  });
};

const runBusyAction = async (work, pendingHint, failureHint) => {
  if (isBusy) return null;

  isBusy = true;
  setButtonsDisabled(true);
  if (pendingHint) setHint(pendingHint);

  try {
    return await work();
  } catch (error) {
    setHint(error?.message || failureHint);
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

const getRecommendation = (state, latestJob, analysis) => {
  if (!state?.hasProfile) {
    return {
      type: 'route',
      route: '/#/dashboard',
      buttonLabel: 'Open Dashboard',
      title: 'Sync your ResumeATS profile',
      copy: 'Fit scoring and autofill are much stronger once the extension has your real candidate data.',
      hint: 'Open Dashboard in ResumeATS and sync your profile before you rely on this surface for scoring or autofill.',
    };
  }

  if (!latestJob) {
    return {
      type: 'capture',
      buttonLabel: 'Analyze current tab',
      title: 'Analyze the current job tab',
      copy: 'Start from the live posting. Once captured, the extension can tell you whether Quick Resume or the AI flow is the better path.',
      hint: 'Open a job posting in another tab and run a scan from here.',
    };
  }

  if (analysis?.recommendedLabel) {
    return {
      type: 'route',
      route: ROUTE_BY_LABEL[analysis.recommendedLabel] || '/#/dashboard',
      buttonLabel: `Open ${analysis.recommendedLabel}`,
      title: `${analysis.recommendedLabel} is the fastest next move`,
      copy:
        analysis.recommendedLabel === 'Quick Resume'
          ? 'This looks close enough to your profile to tailor quickly and get to export faster.'
          : analysis.recommendedLabel === 'AI Generator'
            ? 'This role needs heavier tailoring. Let the AI flow rewrite the resume around the captured job.'
            : 'Take the automation route if you are ready to move this role through the application pipeline.',
      hint: `Best next move: open ${analysis.recommendedLabel}, then come back here when you are ready to autofill or apply.`,
    };
  }

  return {
    type: 'capture',
    buttonLabel: 'Re-analyze tab',
    title: 'Refresh the current job readout',
    copy: 'The posting is captured, but the recommendation is incomplete. Run another scan from the live tab.',
    hint: 'If the job content changed or loaded late, analyze the tab again.',
  };
};

const renderState = (state = {}) => {
  statusEl.textContent = state?.isRunning ? 'Queue Running' : state?.hasProfile ? 'Ready' : 'Needs Sync';
  queueEl.textContent = `${state?.queueSize || 0} tracked`;

  const latestJob = state?.lastJobSnapshot || null;
  const analysis = latestJob?.analysis || null;
  const score = analysis?.score || 0;
  const recommendation = getRecommendation(state, latestJob, analysis);

  recommendedAction = recommendation;
  recommendedTitleEl.textContent = recommendation.title;
  recommendedCopyEl.textContent = recommendation.copy;
  recommendedButton.textContent = recommendation.buttonLabel;

  snapshotStateEl.textContent = latestJob
    ? analysis?.recommendedLabel || 'Captured'
    : 'Not scanned yet';

  jobScoreEl.style.setProperty('--score', `${score}`);
  jobScoreValueEl.textContent = analysis ? `${score}` : '--';
  latestJobEl.textContent = latestJob?.title || 'No job captured yet';
  latestJobMetaEl.textContent = [
    latestJob?.company || '',
    latestJob?.location || '',
    latestJob?.providerLabel || '',
  ]
    .filter(Boolean)
    .join(' / ') || 'Open a job posting in another tab, then analyze it here.';
  jobSummaryEl.textContent =
    analysis?.summary || 'After a scan, this card shows the fit readout and why the next action matters.';

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

const captureCurrentJob = async () => {
  const response = await sendMessage('CAPTURE_ACTIVE_JOB_POSTING');
  const state = await refreshState();
  renderState({
    ...state,
    lastJobSnapshot: response?.jobPosting || state?.lastJobSnapshot || null,
  });
};

const runRecommendedAction = async () => {
  if (recommendedAction.type === 'route' && recommendedAction.route) {
    await openRoute(recommendedAction.route);
    return;
  }

  if (recommendedAction.type === 'capture') {
    await captureCurrentJob();
    return;
  }

  if (recommendedAction.type === 'autofill') {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    const filledCount = response?.result?.filledCount || 0;
    setHint(`Autofilled ${filledCount} field${filledCount === 1 ? '' : 's'} on the current page.`);
  }
};

captureButton.addEventListener('click', () => runBusyAction(
  () => captureCurrentJob(),
  'Analyzing the current tab...',
  'Could not analyze the current tab.'
));

openCompanionButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('OPEN_SIDE_PANEL');
    window.close();
  },
  'Opening the side panel...',
  'Could not open the companion panel.'
));

autofillButton.addEventListener('click', () => runBusyAction(
  async () => {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    const filledCount = response?.result?.filledCount || 0;
    setHint(`Autofilled ${filledCount} field${filledCount === 1 ? '' : 's'} on the current page.`);
  },
  'Autofilling the current page...',
  'Could not autofill the current page.'
));

startButton.addEventListener('click', () => runBusyAction(
  async () => {
    await sendMessage('START_RUN');
    await refreshState();
  },
  'Starting the queue...',
  'Could not start the queue.'
));

refreshButton.addEventListener('click', () => runBusyAction(
  () => refreshState(),
  'Refreshing extension state...',
  'Could not refresh extension state.'
));
recommendedButton.addEventListener('click', () => runBusyAction(
  () => runRecommendedAction(),
  'Working on the recommended action...',
  'Could not complete the recommended action.'
));
quickResumeButton.addEventListener('click', () => openRoute('/#/quick-resume'));
aiGeneratorButton.addEventListener('click', () => openRoute('/#/ai-generator'));
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
  setHint(`Updated widget visibility for ${host}.`);
});

toggleGlobalWidgetButton.addEventListener('click', async () => {
  const settings = await writeUiSettings((current) => ({
    ...current,
    enabled: current.enabled === false,
  }));
  await renderWidgetControls();
  setHint(settings.enabled ? 'Widget is on again.' : 'Widget is now off everywhere.');
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes?.[UI_SETTINGS_KEY]) {
    renderWidgetControls().catch((error) => {
      setHint(error?.message || 'Could not refresh widget controls.');
    });
  }

  if (!changes?.[STORAGE_KEY]) {
    return;
  }

  refreshState().catch((error) => {
    setHint(error?.message || 'Could not refresh extension state.');
  });
});

refreshState().catch((error) => {
  setHint(error.message || 'Could not read extension state.');
});
