/* global chrome */

const statusEl = document.getElementById('status');
const queueEl = document.getElementById('queue');
const latestJobEl = document.getElementById('latest-job');
const latestJobMetaEl = document.getElementById('latest-job-meta');
const jobScoreEl = document.getElementById('job-score');
const jobScoreValueEl = document.getElementById('job-score-value');
const jobSummaryEl = document.getElementById('job-summary');
const jobPillsEl = document.getElementById('job-pills');
const hintEl = document.getElementById('hint');

const captureButton = document.getElementById('capture');
const openCompanionButton = document.getElementById('open-companion');
const autofillButton = document.getElementById('autofill');
const startButton = document.getElementById('start');
const refreshButton = document.getElementById('refresh');
const quickResumeButton = document.getElementById('quick-resume');
const aiGeneratorButton = document.getElementById('ai-generator');
const autoApplyButton = document.getElementById('auto-apply');

const sendMessage = (type, payload) => new Promise((resolve, reject) => {
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

const escapeHtml = (value = '') => `${value}`
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
    .map((item) => `<span class="pill">${escapeHtml(item)}</span>`)
    .join('');
};

const renderState = (state = {}) => {
  statusEl.textContent = state?.isRunning ? 'Queue Running' : state?.hasProfile ? 'Profile Synced' : 'Needs Sync';
  queueEl.textContent = `${state?.queueSize || 0} job${state?.queueSize === 1 ? '' : 's'}`;

  const latestJob = state?.lastJobSnapshot || null;
  const analysis = latestJob?.analysis || null;
  const score = analysis?.score || 0;

  jobScoreEl.style.setProperty('--score', `${score}`);
  jobScoreValueEl.textContent = analysis ? `${score}` : '--';
  latestJobEl.textContent = latestJob?.title || 'No job captured yet';
  latestJobMetaEl.textContent = [
    latestJob?.company || '',
    latestJob?.location || '',
    latestJob?.providerLabel || '',
  ].filter(Boolean).join(' • ') || 'Open a job posting in another tab, then analyze it here.';
  jobSummaryEl.textContent = analysis?.summary || 'After a scan, this card shows the job-fit readout and the best next action.';

  renderPills([
    latestJob?.providerLabel || '',
    latestJob?.employmentType || '',
    latestJob?.salary || '',
    ...(analysis?.matchedSkills || []).slice(0, 2),
  ].filter(Boolean));

  if (!state?.hasProfile) {
    setHint('Sync your ResumeATS profile first. Without it, the extension can still capture jobs but cannot score fit or autofill reliably.');
  } else if (!latestJob) {
    setHint('Open a job posting in another tab and click Analyze Current Tab to generate the first scored snapshot.');
  } else if (analysis?.recommendedLabel) {
    setHint(`Best next move: open ${analysis.recommendedLabel} from ResumeATS, or autofill the current page if the form is already open.`);
  } else {
    setHint('Analyze the current tab to calculate job fit and unlock the best next action.');
  }
};

const refreshState = async () => {
  const state = await sendMessage('GET_STATE');
  renderState(state);
  return state;
};

const openRoute = async (route) => {
  await sendMessage('OPEN_RESUMEATS_ROUTE', { route });
  window.close();
};

captureButton.addEventListener('click', async () => {
  try {
    const response = await sendMessage('CAPTURE_ACTIVE_JOB_POSTING');
    const state = await refreshState();
    renderState({
      ...state,
      lastJobSnapshot: response?.jobPosting || state?.lastJobSnapshot || null,
    });
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
quickResumeButton.addEventListener('click', () => openRoute('/#/quick-resume'));
aiGeneratorButton.addEventListener('click', () => openRoute('/#/ai-generator'));
autoApplyButton.addEventListener('click', () => openRoute('/#/auto-apply'));

refreshState().catch((error) => {
  setHint(error.message || 'Could not read extension state.');
});
