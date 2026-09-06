import { supabase } from './supabase';
import { generateApplicationAnswers } from './applicationAnswerService';
import { getUserProfile } from './userProfileService';
import { getJobPreferences } from './autoApplyService';
import { getUserResumes, getResumeById } from './supabaseService';
import { buildBrowserAgentProfile } from './browserAgentService';
import { prepareBrowserAgentSavedResumeArtifact, validateBrowserAgentSavedResume } from './browserAgentResumeArtifact.js';

const APP_SOURCE = 'resumeats-web';
const AGENT_SOURCE = 'resumeats-browser-agent';
const ALLOWED_REQUEST_TYPES = new Set([
  'BRIDGE_READY',
  'APP_AUTOFILL_AI_REQUEST',
  'APP_SYNC_PROFILE_REQUEST',
  'APP_AUTH_STATE_REQUEST',
  'APP_PREPARE_RESUME_REQUEST',
  'APP_PREPARE_SAVED_RESUME_REQUEST',
  'APP_VALIDATE_SAVED_RESUME_REQUEST',
]);
const MAX_BRIDGE_PAYLOAD_BYTES = 256 * 1024;

let cleanupBridge = null;
let activeBridgeToken = null;

const estimateJsonBytes = (value) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return MAX_BRIDGE_PAYLOAD_BYTES + 1;
  }
};

const isValidBridgeToken = (value) => (
  typeof value === 'string' &&
  value.length >= 24 &&
  value.length <= 128 &&
  /^[a-zA-Z0-9._:-]+$/.test(value)
);

const establishBridgeToken = (token, replace = false) => {
  if (!isValidBridgeToken(token)) return false;
  if (!activeBridgeToken || replace) activeBridgeToken = token;
  return activeBridgeToken === token;
};

const postResponse = ({ type, requestId, bridgeToken, payload, success = true, error = null }) => {
  window.postMessage(
    {
      source: APP_SOURCE,
      target: AGENT_SOURCE,
      type,
      requestId,
      bridgeToken,
      payload,
      success,
      error,
    },
    window.origin
  );
};

const getAuthenticatedUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(error.message || 'Could not verify your ResumeATS session.');
  }

  if (!user) {
    throw new Error('Sign in to ResumeATS first, then sync the extension again.');
  }

  return user;
};

const assertAuthenticatedAccount = async (expectedUserId) => {
  const user = await getAuthenticatedUser();
  if (!expectedUserId || user.id !== expectedUserId) {
    throw new Error('Your ResumeATS account changed. Reconnect the extension before continuing.');
  }
  return user;
};


const resolveResumeContext = async (resumeIdOverride = '') => {
  const user = await getAuthenticatedUser();
  const [{ data: preferences }, userProfile] = await Promise.all([
    getJobPreferences(),
    getUserProfile(user.id),
  ]);

  let resolvedResumeId = resumeIdOverride || preferences?.default_resume_id || '';
  if (!resolvedResumeId) {
    const resumes = await getUserResumes();
    if (!resumes.length) {
      throw new Error('Create at least one resume in ResumeATS before syncing the extension.');
    }
    resolvedResumeId = resumes[0].id;
  }

  const resume = await getResumeById(resolvedResumeId);
  await assertAuthenticatedAccount(user.id);
  if (!resume?.id) {
    throw new Error('Could not load your selected resume. Pick a default resume in ResumeATS and try again.');
  }

  return {
    user,
    preferences: preferences || {},
    userProfile: userProfile || null,
    resume,
  };
};

const syncBrowserAgentProfileFromApp = async (payload = {}) => {
  const { user, preferences, userProfile, resume } = await resolveResumeContext(payload.resumeId || '');
  const builtProfile = await buildBrowserAgentProfile({
    user,
    preferences,
    resume,
    userProfile,
    autoSubmit: true,
  });
  const profile = { ...builtProfile, documents: {} };

  await assertAuthenticatedAccount(user.id);

  return {
    profile,
    candidate: {
      fullName: profile?.candidate?.fullName || '',
      currentTitle: profile?.candidate?.currentTitle || '',
    },
    resume: {
      id: resume.id,
      title: resume.title || '',
    },
  };
};

const prepareTailoredResumeForBrowserAgent = async () => {
  // This bridge has no factual-review UI. Stop before paid generation, saving or
  // uploading; syncing an already saved resume remains a separate action.
  throw Object.assign(new Error('Review required: choose "Choose resume" in the extension to open the captured job in ResumeATS. Preview and select a saved version, or tailor, review and save one there before selecting it. No AI generation was started.'), {
    code: 'TAILORING_REVIEW_REQUIRED',
  });
};

export const initializeBrowserAgentAppBridge = () => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (cleanupBridge) {
    return cleanupBridge;
  }

  const processBridgeMessage = async (message) => {
    if (
      !message ||
      message.source !== AGENT_SOURCE ||
      message.target !== APP_SOURCE ||
      !message.type ||
      !ALLOWED_REQUEST_TYPES.has(message.type)
    ) {
      return;
    }

    if (message.type === 'BRIDGE_READY') {
      const token = message.bridgeToken || message.payload?.bridgeToken;
      if (establishBridgeToken(token, true)) {
        window.__resumeatsExtensionBridgeToken = token;
      }
      return;
    }

    if (
      !message.requestId ||
      !establishBridgeToken(message.bridgeToken || window.__resumeatsExtensionBridgeToken) ||
      estimateJsonBytes(message.payload) > MAX_BRIDGE_PAYLOAD_BYTES
    ) {
      return;
    }

    try {
      let payload;

      switch (message.type) {
        case 'APP_AUTH_STATE_REQUEST': {
          const user = await getAuthenticatedUser();
          payload = { userId: user.id };
          break;
        }
        case 'APP_AUTOFILL_AI_REQUEST': {
          const ownerId = message.payload?.profile?.candidate?.userId;
          await assertAuthenticatedAccount(ownerId);
          payload = await generateApplicationAnswers(message.payload || {});
          await assertAuthenticatedAccount(ownerId);
          break;
        }
        case 'APP_SYNC_PROFILE_REQUEST':
          payload = await syncBrowserAgentProfileFromApp(message.payload || {});
          break;
        case 'APP_PREPARE_RESUME_REQUEST':
          payload = await prepareTailoredResumeForBrowserAgent(message.payload || {});
          break;
        case 'APP_PREPARE_SAVED_RESUME_REQUEST':
          payload = await prepareBrowserAgentSavedResumeArtifact(message.payload || {});
          break;
        case 'APP_VALIDATE_SAVED_RESUME_REQUEST':
          payload = await validateBrowserAgentSavedResume(message.payload || {});
          break;
        default:
          return;
      }

      postResponse({
        type: `${message.type}:response`,
        requestId: message.requestId,
        bridgeToken: message.bridgeToken,
        payload,
      });
    } catch (error) {
      postResponse({
        type: `${message.type}:response`,
        requestId: message.requestId,
        bridgeToken: message.bridgeToken,
        success: false,
        error: error?.message || 'Could not complete the ResumeATS bridge request.',
      });
    }
  };

  const handleMessage = async (event) => {
    if (event.source !== window || event.origin !== window.origin) return;
    await processBridgeMessage(event.data);
  };

  window.addEventListener('message', handleMessage);

  const pendingMessages = Array.isArray(window.__resumeatsPendingBridgeMessages)
    ? window.__resumeatsPendingBridgeMessages.splice(0)
    : [];
  pendingMessages.forEach((message) => {
    void processBridgeMessage(message);
  });

  cleanupBridge = () => {
    window.removeEventListener('message', handleMessage);
    cleanupBridge = null;
  };

  return cleanupBridge;
};
