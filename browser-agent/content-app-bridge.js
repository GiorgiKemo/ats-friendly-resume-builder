/* global chrome */

(() => {
  if (typeof window.__resumeatsAppBridgeCleanup === 'function') {
    try {
      window.__resumeatsAppBridgeCleanup();
    } catch {
      // A previous bridge instance can belong to an invalidated extension context.
    }
  }

  const bridgeInstanceId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.__resumeatsAppBridgeReady = true;
  window.__resumeatsAppBridgeInstanceId = bridgeInstanceId;

  const APP_SOURCE = 'resumeats-web';
  const AGENT_SOURCE = 'resumeats-browser-agent';
  const APP_BRIDGE_TOKEN = createBridgeToken();
  const PENDING_PROFILE_SYNC_KEY = 'resumeatsBrowserAgentPendingProfileSync';
  const PENDING_SYNC_MAX_AGE_MS = 10 * 60 * 1000;
  const AUTO_SYNC_RETRY_DELAYS_MS = [900, 2200, 5000, 9000, 15000, 25000];
  const ARTIFACT_RESPONSE_MAX_BYTES = 1572864;
  const APP_RESPONSE_MAX_BYTES = 262144;
  const APP_TO_EXTENSION_REQUESTS = new Set([
    'PING', 'GET_STATE', 'SYNC_PROFILE', 'QUEUE_JOBS', 'START_RUN', 'CLEAR_QUEUE',
    'START_CAMPAIGN', 'PAUSE_CAMPAIGN', 'RESUME_CAMPAIGN', 'RETRY_CAMPAIGN_JOB', 'OPEN_CAMPAIGN_JOB',
    'GET_RECENT_JOB_POSTING', 'GET_RESUME_HANDOFF', 'COMPLETE_RESUME_HANDOFF', 'CANCEL_RESUME_HANDOFF',
  ]);
  let pendingSyncTimerId = null;
  let pendingSyncAttempt = 0;
  let extensionContextAlive = true;

  const isExtensionContextInvalidated = (error) => (
    /extension context invalidated|context invalidated/i.test(`${error?.message || error || ''}`)
  );

  const markExtensionContextInvalidated = () => {
    extensionContextAlive = false;
    if (pendingSyncTimerId) {
      window.clearTimeout(pendingSyncTimerId);
      pendingSyncTimerId = null;
    }
  };

  const handleInvalidatedUnhandledRejection = (event) => {
    if (isExtensionContextInvalidated(event?.reason)) {
      markExtensionContextInvalidated();
      event.preventDefault?.();
    }
  };

  const handleInvalidatedWindowError = (event) => {
    if (isExtensionContextInvalidated(event?.error || event?.message)) {
      markExtensionContextInvalidated();
      event.preventDefault?.();
    }
  };

  window.addEventListener('unhandledrejection', handleInvalidatedUnhandledRejection);
  window.addEventListener('error', handleInvalidatedWindowError);

  const isCurrentBridgeInstance = () => (
    extensionContextAlive
    && window.__resumeatsAppBridgeInstanceId === bridgeInstanceId
  );

  const safeWindowPostMessage = (message) => {
    try {
      window.postMessage(message, window.origin);
      return true;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
      }
      return false;
    }
  };

  const safeSendResponse = (sendResponse, payload) => {
    try {
      sendResponse(payload);
    } catch {
      // Fall back to timestamp entropy if randomUUID is unavailable in this world.
    }
  };

  const safeChromeCall = async (callback, fallback = null) => {
    if (!extensionContextAlive) return fallback;

    try {
      return await callback();
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
        return fallback;
      }
      throw error;
    }
  };

  function createBridgeToken() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
      }
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const createRequestId = createBridgeToken;

  const invokePageRequest = ({ type, payload, timeoutMs = 45000 }) => {
    if (!isCurrentBridgeInstance()) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const requestId = createRequestId();

      let timeoutId;
      let settled = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        if (timeoutId) window.clearTimeout(timeoutId);
      };

      const settleResolve = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const settleReject = (error) => {
        if (settled) return;
        settled = true;
        cleanup();

        if (!isCurrentBridgeInstance() || isExtensionContextInvalidated(error)) {
          markExtensionContextInvalidated();
          resolve(null);
          return;
        }

        reject(error);
      };

      const handleMessage = (event) => {
        const message = event.data;

        if (
          event.source !== window || event.origin !== window.origin ||
          !message ||
          message.source !== APP_SOURCE ||
          message.target !== AGENT_SOURCE ||
          message.requestId !== requestId ||
          message.type !== `${type}:response` ||
          message.bridgeToken !== APP_BRIDGE_TOKEN
        ) {
          return;
        }

        if (!isCurrentBridgeInstance()) {
          settleResolve(null);
          return;
        }
        try {
          const maxBytes = type === 'APP_PREPARE_SAVED_RESUME_REQUEST' ? ARTIFACT_RESPONSE_MAX_BYTES : APP_RESPONSE_MAX_BYTES;
          if (new TextEncoder().encode(JSON.stringify(message)).byteLength > maxBytes) {
            throw new Error('ResumeATS response is too large. Download the resume in the app and attach it manually.');
          }
        } catch (error) {
          settleReject(error);
          return;
        }

        if (message.success === false) {
          settleReject(new Error(message.error || 'ResumeATS page request failed'));
          return;
        }

        settleResolve(message.payload || {});
      };

      try {
        timeoutId = window.setTimeout(() => {
          settleReject(new Error('Timed out waiting for ResumeATS to respond.'));
        }, timeoutMs);

        window.addEventListener('message', handleMessage);
        const posted = safeWindowPostMessage({
          source: AGENT_SOURCE,
          target: APP_SOURCE,
          type,
          requestId,
          bridgeToken: APP_BRIDGE_TOKEN,
          payload,
        });

        if (!posted) {
          settleReject(new Error('ResumeATS page bridge is no longer available.'));
        }
      } catch (error) {
        settleReject(error);
      }
    }).catch((error) => {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
        return null;
      }
      throw error;
    });
  };

  const postResponse = ({ type, requestId, payload, success = true, error = null }) => {
    safeWindowPostMessage({
      source: AGENT_SOURCE,
      target: APP_SOURCE,
      type,
      requestId,
      bridgeToken: APP_BRIDGE_TOKEN,
      payload,
      success,
      error,
    });
  };

  const readPendingProfileSync = async () => {
    if (!extensionContextAlive) return null;

    const stored = await safeChromeCall(
      () => chrome.storage.local.get(PENDING_PROFILE_SYNC_KEY),
      null
    );
    const pending = stored?.[PENDING_PROFILE_SYNC_KEY] || null;

    if (!pending?.requestedAt) return null;

    const requestedAt = Date.parse(pending.requestedAt);
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > PENDING_SYNC_MAX_AGE_MS) {
      await safeChromeCall(() => chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY));
      return null;
    }

    return pending;
  };

  const tryPendingProfileSync = async () => {
    if (!isCurrentBridgeInstance()) return true;

    const pending = await readPendingProfileSync();
    if (!pending) return true;

    try {
      const payload = await invokePageRequest({
        type: 'APP_SYNC_PROFILE_REQUEST',
        // Keep older app builds document-free during the post-login retry.
        payload: { profileOnly: true },
        timeoutMs: 12000,
      });

      if (payload === null) return true;

      if (!payload?.profile) {
        throw new Error('ResumeATS did not return a profile.');
      }

      if (!isCurrentBridgeInstance()) return true;

      if (!isCurrentBridgeInstance()) return true;

      await safeChromeCall(() => chrome.runtime.sendMessage({
        type: 'SYNC_PROFILE',
        payload: { ...payload.profile, documents: {} },
      }));
      await safeChromeCall(() => chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY));
      return true;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
        return true;
      }
      return false;
    }
  };

  const schedulePendingProfileSync = (delayMs = AUTO_SYNC_RETRY_DELAYS_MS[0]) => {
    if (!extensionContextAlive) return;

    if (pendingSyncTimerId) {
      window.clearTimeout(pendingSyncTimerId);
    }

    pendingSyncTimerId = window.setTimeout(() => {
      pendingSyncTimerId = null;
      void (async () => {
        try {
          const synced = await tryPendingProfileSync();
          if (synced) {
            pendingSyncAttempt = 0;
            return;
          }

          pendingSyncAttempt = Math.min(pendingSyncAttempt + 1, AUTO_SYNC_RETRY_DELAYS_MS.length - 1);
          schedulePendingProfileSync(AUTO_SYNC_RETRY_DELAYS_MS[pendingSyncAttempt]);
        } catch (error) {
          if (isExtensionContextInvalidated(error)) {
            markExtensionContextInvalidated();
          }
        }
      })();
    }, delayMs);
  };

  const handleWindowMessage = (event) => {
    void (async () => {
      if (!isCurrentBridgeInstance()) return;

      const message = event.data;

      if (
        event.source !== window || event.origin !== window.origin ||
        !message ||
        message.source !== APP_SOURCE ||
        message.target !== AGENT_SOURCE ||
        !APP_TO_EXTENSION_REQUESTS.has(message.type) ||
        !message.requestId
      ) {
        return;
      }

      try {
        if (new TextEncoder().encode(JSON.stringify(message.payload ?? null)).byteLength > APP_RESPONSE_MAX_BYTES) {
          throw new Error('Extension request exceeds the 256 KiB request limit.');
        }
        const payload = await safeChromeCall(() => chrome.runtime.sendMessage({
          type: message.type,
          payload: message.type === 'SYNC_PROFILE' && message.payload
            ? { ...message.payload, documents: {} } : message.payload,
        }), null);

        if (!isCurrentBridgeInstance()) return;
        if (!payload) {
          throw new Error('ResumeATS extension context is no longer available. Refresh this tab after reloading the extension.');
        }

        postResponse({
          type: `${message.type}:response`,
          requestId: message.requestId,
          payload,
        });
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          markExtensionContextInvalidated();
          return;
        }

        postResponse({
          type: `${message.type}:response`,
          requestId: message.requestId,
          success: false,
          error: error?.message || 'Bridge request failed',
        });
      }
    })().catch((error) => {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
      }
    });
  };

  window.addEventListener('message', handleWindowMessage);

  const FORWARDED_APP_REQUESTS = new Set([
    'APP_AUTOFILL_AI_REQUEST',
    'APP_SYNC_PROFILE_REQUEST',
    'APP_AUTH_STATE_REQUEST',
    'APP_PREPARE_RESUME_REQUEST',
    'APP_PREPARE_SAVED_RESUME_REQUEST',
    'APP_VALIDATE_SAVED_RESUME_REQUEST',
  ]);

  const handleRuntimeMessage = (message, _sender, sendResponse) => {
    if (!isCurrentBridgeInstance()) {
      safeSendResponse(sendResponse, {
        ok: false,
        error: 'ResumeATS app bridge was replaced. Refresh the ResumeATS tab and try again.',
      });
      return false;
    }

    if (!FORWARDED_APP_REQUESTS.has(message?.type)) {
      return undefined;
    }

    invokePageRequest({
      type: message.type,
      payload: message.payload,
      timeoutMs: message.type === 'APP_PREPARE_RESUME_REQUEST' ? 180000 : 45000,
    })
      .then((payload) => {
        if (payload === null) {
          safeSendResponse(sendResponse, {
            ok: false,
            error: 'ResumeATS extension context was reloaded. Refresh this ResumeATS tab and try again.',
          });
          return;
        }

        safeSendResponse(sendResponse, { ok: true, ...payload });
      })
      .catch((error) => {
        if (isExtensionContextInvalidated(error)) {
          markExtensionContextInvalidated();
          return;
        }

        safeSendResponse(sendResponse, {
          ok: false,
          error: error?.message || 'ResumeATS app bridge request failed',
        });
      });

    return true;
  };

  try {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      markExtensionContextInvalidated();
      return;
    }
    throw error;
  }

  safeWindowPostMessage({
    source: AGENT_SOURCE,
    target: APP_SOURCE,
    type: 'BRIDGE_READY',
    payload: { ready: true },
    bridgeToken: APP_BRIDGE_TOKEN,
    success: true,
  });

  schedulePendingProfileSync();

  const handleStorageChanged = (changes, areaName) => {
    if (!extensionContextAlive) return;
    if (areaName === 'local' && changes?.[PENDING_PROFILE_SYNC_KEY]?.newValue) {
      pendingSyncAttempt = 0;
      schedulePendingProfileSync(500);
    }
  };

  try {
    chrome.storage.onChanged.addListener(handleStorageChanged);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      markExtensionContextInvalidated();
      return;
    }
    throw error;
  }

  const handleFocus = () => schedulePendingProfileSync(500);
  const handleHashChange = () => schedulePendingProfileSync(900);
  const handlePopState = () => schedulePendingProfileSync(900);
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      schedulePendingProfileSync(500);
    }
  };

  window.__resumeatsAppBridgeCleanup = () => {
    extensionContextAlive = false;
    if (pendingSyncTimerId) {
      window.clearTimeout(pendingSyncTimerId);
      pendingSyncTimerId = null;
    }
    window.removeEventListener('message', handleWindowMessage);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('hashchange', handleHashChange);
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('unhandledrejection', handleInvalidatedUnhandledRejection);
    window.removeEventListener('error', handleInvalidatedWindowError);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    try {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    } catch {
      // Ignore cleanup failures from already-invalidated extension contexts.
    }
  };

  window.addEventListener('focus', handleFocus);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);
  document.addEventListener('visibilitychange', handleVisibilityChange);
})();
