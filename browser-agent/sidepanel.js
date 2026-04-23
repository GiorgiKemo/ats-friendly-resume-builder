/* global chrome */

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

const analyzeButton = document.getElementById('analyze');
const autofillButton = document.getElementById('autofill');
const startQueueButton = document.getElementById('start-queue');
const clearQueueButton = document.getElementById('clear-queue');
const refreshButton = document.getElementById('refresh');
const openQuickButton = document.getElementById('open-quick');
const openAiButton = document.getElementById('open-ai');
const openAutoApplyButton = document.getElementById('open-auto-apply');
const openDashboardButton = document.getElementById('open-dashboard');

let recommendedAction = { type: 'capture' };

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

const setFooterCopy = (value) => {
  footerCopyEl.textContent = value;
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

const getRecommendation = (state, latestJob, analysis) => {
  if (!state?.hasProfile) {
    return {
      type: 'route',
      route: '/#/dashboard',
      buttonLabel: 'Open Dashboard',
      title: 'Sync your ResumeATS profile',
      copy: 'The extension already captures jobs, but scoring and autofill only become reliable once your candidate data is synced.',
      footer:
        'ResumeATS has not synced a candidate profile into the extension yet. Capture still works, but fit scoring and autofill quality will stay limited until you sync.',
    };
  }

  if (!latestJob) {
    return {
      type: 'capture',
      buttonLabel: 'Analyze active tab',
      title: 'Analyze the active tab',
      copy: 'Start from the live posting. That gives the extension enough context to recommend the right ResumeATS workflow.',
      footer: 'Analyze the active tab to create a scored snapshot, then route yourself into the right tailoring flow.',
    };
  }

  if (analysis?.recommendedLabel) {
    return {
      type: 'route',
      route: ROUTE_BY_LABEL[analysis.recommendedLabel] || '/#/dashboard',
      buttonLabel: `Open ${analysis.recommendedLabel}`,
      title: `${analysis.recommendedLabel} is the best next move`,
      copy:
        analysis.recommendedLabel === 'Quick Resume'
          ? 'This role looks close enough to your profile to tailor fast and keep the browser session moving.'
          : analysis.recommendedLabel === 'AI Generator'
            ? 'This posting needs heavier rewriting. Use the AI flow, then return here to autofill or continue the application.'
            : 'Use the automation path if you want this role pushed into the broader application workflow.',
      footer: `Best next move: open ${analysis.recommendedLabel}, then bring the tailored output back here when you are ready to apply.`,
    };
  }

  return {
    type: 'capture',
    buttonLabel: 'Re-analyze tab',
    title: 'Refresh the job readout',
    copy: 'The posting is captured, but the recommendation is incomplete. Another live scan should tighten the signal.',
    footer: 'If the posting loaded late or changed after the first scan, analyze the tab again.',
  };
};

const renderState = (state = {}) => {
  profileStatusEl.textContent = state?.hasProfile
    ? [state?.candidateName || '', state?.candidateTitle || ''].filter(Boolean).join(' / ') || 'Synced'
    : 'Needs sync';
  queueStatusEl.textContent = `${state?.queueSize || 0} tracked`;
  runStatusEl.textContent = state?.isRunning ? 'Running' : 'Idle';

  const latestJob = state?.lastJobSnapshot || null;
  const analysis = latestJob?.analysis || null;
  const score = analysis?.score || 0;
  const recommendation = getRecommendation(state, latestJob, analysis);

  recommendedAction = recommendation;
  nextStepTitleEl.textContent = recommendation.title;
  nextStepCopyEl.textContent = recommendation.copy;
  nextStepButton.textContent = recommendation.buttonLabel;
  setFooterCopy(recommendation.footer);

  jobScoreEl.style.setProperty('--score', `${score}`);
  jobScoreValueEl.textContent = analysis ? `${score}` : '--';
  jobTitleEl.textContent = latestJob?.title || 'No analyzed job yet';
  jobMetaEl.textContent = [
    latestJob?.company || '',
    latestJob?.location || '',
    latestJob?.providerLabel || '',
  ]
    .filter(Boolean)
    .join(' / ') || 'Open a job tab and analyze it from here.';
  jobSummaryEl.textContent =
    analysis?.summary || 'The side panel keeps the active role, fit readout, and recommendation visible while you browse.';

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

  await captureCurrentJob();
};

analyzeButton.addEventListener('click', async () => {
  try {
    await captureCurrentJob();
  } catch (error) {
    setFooterCopy(error.message || 'Could not analyze the active tab.');
  }
});

autofillButton.addEventListener('click', async () => {
  try {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    const filledCount = response?.result?.filledCount || 0;
    setFooterCopy(`Autofilled ${filledCount} field${filledCount === 1 ? '' : 's'} on the current page.`);
  } catch (error) {
    setFooterCopy(error.message || 'Could not autofill the current page.');
  }
});

startQueueButton.addEventListener('click', async () => {
  try {
    await sendMessage('START_RUN');
    await refreshState();
  } catch (error) {
    setFooterCopy(error.message || 'Could not start the browser queue.');
  }
});

clearQueueButton.addEventListener('click', async () => {
  try {
    await sendMessage('CLEAR_QUEUE');
    await refreshState();
  } catch (error) {
    setFooterCopy(error.message || 'Could not clear the queue.');
  }
});

refreshButton.addEventListener('click', refreshState);
nextStepButton.addEventListener('click', async () => {
  try {
    await runRecommendedAction();
  } catch (error) {
    setFooterCopy(error.message || 'Could not complete the recommended action.');
  }
});
openQuickButton.addEventListener('click', () => openRoute('/#/quick-resume'));
openAiButton.addEventListener('click', () => openRoute('/#/ai-generator'));
openAutoApplyButton.addEventListener('click', () => openRoute('/#/auto-apply'));
openDashboardButton.addEventListener('click', () => openRoute('/#/dashboard'));

refreshState().catch((error) => {
  setFooterCopy(error.message || 'Could not read extension state.');
});
