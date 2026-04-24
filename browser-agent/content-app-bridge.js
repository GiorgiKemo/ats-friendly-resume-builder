/* global chrome */

(() => {
  if (window.__resumeatsAppBridgeReady) {
    window.postMessage(
      {
        source: 'resumeats-browser-agent',
        target: 'resumeats-web',
        type: 'BRIDGE_READY',
        payload: { ready: true },
        success: true,
      },
      window.origin
    );
    return;
  }

  window.__resumeatsAppBridgeReady = true;

  const APP_SOURCE = 'resumeats-web';
  const AGENT_SOURCE = 'resumeats-browser-agent';
  const PENDING_PROFILE_SYNC_KEY = 'resumeatsBrowserAgentPendingProfileSync';
  const PENDING_SYNC_MAX_AGE_MS = 10 * 60 * 1000;
  const AUTO_SYNC_RETRY_DELAYS_MS = [900, 2200, 5000, 9000, 15000, 25000];
  let pendingSyncTimerId = null;
  let pendingSyncAttempt = 0;

  const invokePageRequest = ({ type, payload, timeoutMs = 45000 }) => new Promise((resolve, reject) => {
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let timeoutId;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId) window.clearTimeout(timeoutId);
    };

    const handleMessage = (event) => {
      const message = event.data;

      if (
        event.source !== window ||
        !message ||
        message.source !== APP_SOURCE ||
        message.target !== AGENT_SOURCE ||
        message.requestId !== requestId ||
        message.type !== `${type}:response`
      ) {
        return;
      }

      cleanup();

      if (message.success === false) {
        reject(new Error(message.error || 'ResumeATS page request failed'));
        return;
      }

      resolve(message.payload || {});
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for ResumeATS to respond.'));
    }, timeoutMs);

    window.addEventListener('message', handleMessage);
    window.postMessage(
      {
        source: AGENT_SOURCE,
        target: APP_SOURCE,
        type,
        requestId,
        payload,
      },
      window.origin
    );
  });

  const postResponse = ({ type, requestId, payload, success = true, error = null }) => {
    window.postMessage(
      {
        source: AGENT_SOURCE,
        target: APP_SOURCE,
        type,
        requestId,
        payload,
        success,
        error,
      },
      window.origin
    );
  };

  const readPendingProfileSync = async () => {
    const stored = await chrome.storage.local.get(PENDING_PROFILE_SYNC_KEY);
    const pending = stored?.[PENDING_PROFILE_SYNC_KEY] || null;
    if (!pending?.requestedAt) return null;

    const requestedAt = Date.parse(pending.requestedAt);
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > PENDING_SYNC_MAX_AGE_MS) {
      await chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY);
      return null;
    }

    return pending;
  };

  const tryPendingProfileSync = async () => {
    const pending = await readPendingProfileSync();
    if (!pending) return true;

    try {
      const payload = await invokePageRequest({
        type: 'APP_SYNC_PROFILE_REQUEST',
        payload: {},
        timeoutMs: 12000,
      });

      if (!payload?.profile) {
        throw new Error('ResumeATS did not return a profile.');
      }

      await chrome.runtime.sendMessage({
        type: 'SYNC_PROFILE',
        payload: payload.profile,
      });
      await chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY);
      return true;
    } catch {
      return false;
    }
  };

  const schedulePendingProfileSync = (delayMs = AUTO_SYNC_RETRY_DELAYS_MS[0]) => {
    if (pendingSyncTimerId) {
      window.clearTimeout(pendingSyncTimerId);
    }

    pendingSyncTimerId = window.setTimeout(async () => {
      pendingSyncTimerId = null;
      const synced = await tryPendingProfileSync();
      if (synced) {
        pendingSyncAttempt = 0;
        return;
      }

      pendingSyncAttempt = Math.min(pendingSyncAttempt + 1, AUTO_SYNC_RETRY_DELAYS_MS.length - 1);
      schedulePendingProfileSync(AUTO_SYNC_RETRY_DELAYS_MS[pendingSyncAttempt]);
    }, delayMs);
  };

  window.addEventListener('message', async (event) => {
    const message = event.data;

    if (
      event.source !== window ||
      !message ||
      message.source !== APP_SOURCE ||
      message.target !== AGENT_SOURCE ||
      !message.type ||
      !message.requestId
    ) {
      return;
    }

    try {
      const payload = await chrome.runtime.sendMessage({
        type: message.type,
        payload: message.payload,
      });

      postResponse({
        type: `${message.type}:response`,
        requestId: message.requestId,
        payload,
      });
    } catch (error) {
      postResponse({
        type: `${message.type}:response`,
        requestId: message.requestId,
        success: false,
        error: error?.message || 'Bridge request failed',
      });
    }
  });

  const FORWARDED_APP_REQUESTS = new Set([
    'APP_AUTOFILL_AI_REQUEST',
    'APP_SYNC_PROFILE_REQUEST',
    'APP_PREPARE_RESUME_REQUEST',
  ]);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!FORWARDED_APP_REQUESTS.has(message?.type)) {
      return undefined;
    }

    invokePageRequest({
      type: message.type,
      payload: message.payload,
      timeoutMs: message.type === 'APP_PREPARE_RESUME_REQUEST' ? 180000 : 45000,
    })
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({
        ok: false,
        error: error?.message || 'ResumeATS app bridge request failed',
      }));

    return true;
  });

  window.postMessage(
    {
      source: AGENT_SOURCE,
      target: APP_SOURCE,
      type: 'BRIDGE_READY',
      payload: { ready: true },
      success: true,
    },
    window.origin
  );

  schedulePendingProfileSync();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes?.[PENDING_PROFILE_SYNC_KEY]?.newValue) {
      pendingSyncAttempt = 0;
      schedulePendingProfileSync(500);
    }
  });

  window.addEventListener('focus', () => schedulePendingProfileSync(500));
  window.addEventListener('hashchange', () => schedulePendingProfileSync(900));
  window.addEventListener('popstate', () => schedulePendingProfileSync(900));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      schedulePendingProfileSync(500);
    }
  });
})();
