import { generateApplicationAnswers } from './applicationAnswerService';

const APP_SOURCE = 'resumeats-web';
const AGENT_SOURCE = 'resumeats-browser-agent';

let cleanupBridge = null;

const postResponse = ({ type, requestId, payload, success = true, error = null }) => {
  window.postMessage(
    {
      source: APP_SOURCE,
      target: AGENT_SOURCE,
      type,
      requestId,
      payload,
      success,
      error,
    },
    window.origin
  );
};

export const initializeBrowserAgentAppBridge = () => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (cleanupBridge) {
    return cleanupBridge;
  }

  const handleMessage = async (event) => {
    const message = event.data;

    if (
      event.source !== window ||
      !message ||
      message.source !== AGENT_SOURCE ||
      message.target !== APP_SOURCE ||
      !message.type ||
      !message.requestId
    ) {
      return;
    }

    if (message.type !== 'APP_AUTOFILL_AI_REQUEST') {
      return;
    }

    try {
      const payload = await generateApplicationAnswers(message.payload || {});
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
        error: error?.message || 'Could not generate application answers.',
      });
    }
  };

  window.addEventListener('message', handleMessage);

  cleanupBridge = () => {
    window.removeEventListener('message', handleMessage);
    cleanupBridge = null;
  };

  return cleanupBridge;
};
