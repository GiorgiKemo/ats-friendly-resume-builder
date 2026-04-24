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
  const PENDING_PROFILE_SYNC_KEY = 'resumeatsBrowserAgentPendingProfileSync';
  const PENDING_SYNC_MAX_AGE_MS = 10 * 60 * 1000;
  const AUTO_SYNC_RETRY_DELAYS_MS = [900, 2200, 5000, 9000, 15000, 25000];
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
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
      }
    }
  };

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
    safeWindowPostMessage({
      source: AGENT_SOURCE,
      target: APP_SOURCE,
      type,
      requestId,
      payload,
      success,
      error,
    });
  };

  const readPendingProfileSync = async () => {
    if (!extensionContextAlive) return null;

    let pending = null;
    try {
      const stored = await chrome.storage.local.get(PENDING_PROFILE_SYNC_KEY);
      pending = stored?.[PENDING_PROFILE_SYNC_KEY] || null;
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        markExtensionContextInvalidated();
        return null;
      }
      throw error;
    }

    if (!pending?.requestedAt) return null;

    const requestedAt = Date.parse(pending.requestedAt);
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > PENDING_SYNC_MAX_AGE_MS) {
      try {
        await chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY);
      } catch (error) {
        if (isExtensionContextInvalidated(error)) {
          markExtensionContextInvalidated();
          return null;
        }
        throw error;
      }
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
        payload: {},
        timeoutMs: 12000,
      });

      if (!payload?.profile) {
        throw new Error('ResumeATS did not return a profile.');
      }

      if (!isCurrentBridgeInstance()) return true;

      await chrome.runtime.sendMessage({
        type: 'SYNC_PROFILE',
        payload: payload.profile,
      });
      await chrome.storage.local.remove(PENDING_PROFILE_SYNC_KEY);
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
    'APP_PREPARE_RESUME_REQUEST',
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
      .then((payload) => safeSendResponse(sendResponse, { ok: true, ...payload }))
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

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  safeWindowPostMessage({
    source: AGENT_SOURCE,
    target: APP_SOURCE,
    type: 'BRIDGE_READY',
    payload: { ready: true },
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

  chrome.storage.onChanged.addListener(handleStorageChanged);

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
