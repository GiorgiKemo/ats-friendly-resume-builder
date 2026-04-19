/* global chrome */

(() => {
  const APP_SOURCE = 'resumeats-web';
  const AGENT_SOURCE = 'resumeats-browser-agent';

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
