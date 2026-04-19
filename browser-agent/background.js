/* global chrome */

const VERSION = '0.1.0';
const STORAGE_KEY = 'resumeatsBrowserAgentState';
const JOB_OPEN_TIMEOUT_MS = 45000;
let activeJobTimeoutId = null;

const DEFAULT_STATE = {
  version: VERSION,
  profile: null,
  queue: [],
  isRunning: false,
  activeJobId: null,
  lastSyncedAt: null,
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
});

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

const updateRemoteJob = async (jobId, updates, profile) => {
  const integration = profile?.integration;

  if (
    !jobId ||
    !integration?.supabaseUrl ||
    !integration?.supabaseAnonKey ||
    !integration?.accessToken
  ) {
    return;
  }

  try {
    await fetch(`${integration.supabaseUrl}/rest/v1/auto_apply_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      headers: {
        apikey: integration.supabaseAnonKey,
        Authorization: `Bearer ${integration.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(updates),
    });
  } catch (error) {
    console.warn('ResumeATS Browser Agent: failed to update remote job state', error);
  }
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

  await updateRemoteJob(jobId, success
    ? {
        status: 'applied',
        applied_at: new Date().toISOString(),
        failure_reason: null,
        sent_via: 'browser_agent',
      }
    : {
        status: 'failed',
        failure_reason: details.error || 'Browser agent failed to submit the application',
      }, state.profile);

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

  await updateRemoteJob(nextJob.id, {
    status: 'applying',
    failure_reason: null,
  }, state.profile);

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
    const response = await chrome.tabs.sendMessage(sender.tab.id, {
      type: 'AUTOFILL_APPLICATION',
      payload: {
        profile: state.profile,
        job: activeJob,
        autoSubmit: state.profile?.automation?.autoSubmit !== false,
      },
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

      case 'SYNC_PROFILE': {
        const nextState = await saveState({
          profile: message.payload || null,
          lastSyncedAt: new Date().toISOString(),
        });
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
