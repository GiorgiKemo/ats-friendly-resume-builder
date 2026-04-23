/* global chrome */

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

const setHint = (value) => {
  hintEl.textContent = value;
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

captureButton.addEventListener('click', async () => {
  try {
    await captureCurrentJob();
  } catch (error) {
    setHint(error.message || 'Could not analyze the current tab.');
  }
});

openCompanionButton.addEventListener('click', async () => {
  try {
    await sendMessage('OPEN_SIDE_PANEL');
    window.close();
  } catch (error) {
    setHint(error.message || 'Could not open the companion panel.');
  }
});

autofillButton.addEventListener('click', async () => {
  try {
    const response = await sendMessage('AUTOFILL_ACTIVE_TAB');
    const filledCount = response?.result?.filledCount || 0;
    setHint(`Autofilled ${filledCount} field${filledCount === 1 ? '' : 's'} on the current page.`);
  } catch (error) {
    setHint(error.message || 'Could not autofill the current page.');
  }
});

startButton.addEventListener('click', async () => {
  try {
    await sendMessage('START_RUN');
    await refreshState();
  } catch (error) {
    setHint(error.message || 'Could not start the queue.');
  }
});

refreshButton.addEventListener('click', refreshState);
recommendedButton.addEventListener('click', async () => {
  try {
    await runRecommendedAction();
  } catch (error) {
    setHint(error.message || 'Could not complete the recommended action.');
  }
});
quickResumeButton.addEventListener('click', () => openRoute('/#/quick-resume'));
aiGeneratorButton.addEventListener('click', () => openRoute('/#/ai-generator'));
autoApplyButton.addEventListener('click', () => openRoute('/#/auto-apply'));

refreshState().catch((error) => {
  setHint(error.message || 'Could not read extension state.');
});
