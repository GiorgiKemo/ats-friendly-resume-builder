/* global chrome */

(() => {
  const APP_SOURCE = 'resumeats-web';
  const AGENT_SOURCE = 'resumeats-browser-agent';

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
})();
