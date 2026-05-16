import { supabase } from './supabase';
import { generateApplicationAnswers } from './applicationAnswerService';
import { getUserProfile } from './userProfileService';
import { getJobPreferences } from './autoApplyService';
import { getUserResumes, getResumeById, saveResume } from './supabaseService';
import { buildBrowserAgentProfile, buildImportedJobDescription } from './browserAgentService';
import { generateEnhancedResume } from './enhancedOpenaiService';
import { mapResumeData } from '../utils/resumeDataMapper';
import { deriveResumeTitle } from '../utils/resumeTitle.js';
import { sanitizeTargetJobTitle } from '../utils/resumeAuthenticity';

const APP_SOURCE = 'resumeats-web';
const AGENT_SOURCE = 'resumeats-browser-agent';
const ALLOWED_REQUEST_TYPES = new Set([
  'BRIDGE_READY',
  'APP_AUTOFILL_AI_REQUEST',
  'APP_SYNC_PROFILE_REQUEST',
  'APP_PREPARE_RESUME_REQUEST',
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

const establishBridgeToken = (token) => {
  if (!isValidBridgeToken(token)) return false;
  if (!activeBridgeToken) activeBridgeToken = token;
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

const firstNonEmpty = (...values) => values.find((value) => {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && `${value}`.trim() !== '';
});

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const mergePersonalInfo = ({ generated = {}, resume = {}, profile = {}, user = {}, jobTitle = '' }) => {
  const generatedLinks = generated.professionalLinks || {};
  const resumeLinks = resume.professionalLinks || {};
  const profileLinks = profile.professionalLinks || {};
  const generatedJobTitle = sanitizeTargetJobTitle(generated.jobTitle || '');
  const fallbackJobTitle = sanitizeTargetJobTitle(jobTitle || '');
  const linkedin = firstNonEmpty(generated.linkedin, generatedLinks.linkedin, resume.linkedin, resumeLinks.linkedin, profile.linkedin, profileLinks.linkedin, '') || '';
  const github = firstNonEmpty(generated.github, generatedLinks.github, resume.github, resumeLinks.github, profile.github, profileLinks.github, '') || '';
  const portfolio = firstNonEmpty(
    generated.portfolio,
    generated.website,
    generatedLinks.portfolio,
    resume.portfolio,
    resume.website,
    resumeLinks.portfolio,
    profile.portfolio,
    profile.website,
    profileLinks.portfolio,
    profileLinks.other,
    ''
  ) || '';
  const other = firstNonEmpty(
    generated.other,
    generatedLinks.other,
    resume.other,
    resumeLinks.other,
    profile.other,
    profile.otherLink,
    profileLinks.other,
    ''
  ) || '';

  return {
    fullName: firstNonEmpty(generated.fullName, resume.fullName, profile.fullName, user.full_name, '') || '',
    email: firstNonEmpty(generated.email, resume.email, profile.email, user.email, '') || '',
    phone: firstNonEmpty(generated.phone, resume.phone, profile.phone, '') || '',
    linkedin,
    website: portfolio,
    portfolio,
    github,
    other,
    location: firstNonEmpty(generated.location, resume.location, profile.location, profile.city, '') || '',
    jobTitle: firstNonEmpty(generatedJobTitle, resume.jobTitle, profile.jobTitle, fallbackJobTitle, '') || '',
    summary: firstNonEmpty(generated.summary, generated.professionalSummary, resume.summary, profile.summary, profile.professionalSummary, '') || '',
    professionalLinks: {
      linkedin,
      github,
      portfolio,
      other,
    },
  };
};

const buildResumeGenerationProfile = ({ user, resume, userProfile }) => {
  const resumePersonal = resume?.personalInfo || {};
  const profilePersonal = userProfile?.personal || {};

  return {
    personal: mergePersonalInfo({
      generated: {},
      resume: resumePersonal,
      profile: profilePersonal,
      user: {
        email: user?.email || '',
        full_name: user?.user_metadata?.full_name || '',
      },
    }),
    education: ensureArray(userProfile?.education).length > 0
      ? ensureArray(userProfile.education)
      : ensureArray(resume?.education),
    workExperience: ensureArray(userProfile?.workExperience).length > 0
      ? ensureArray(userProfile.workExperience)
      : ensureArray(resume?.workExperience),
    skills: ensureArray(userProfile?.skills).length > 0
      ? ensureArray(userProfile.skills)
      : ensureArray(resume?.skills),
    certifications: ensureArray(userProfile?.certifications).length > 0
      ? ensureArray(userProfile.certifications)
      : ensureArray(resume?.certifications),
    projects: ensureArray(userProfile?.projects).length > 0
      ? ensureArray(userProfile.projects)
      : ensureArray(resume?.projects),
  };
};

const resolveResumeContext = async (resumeIdOverride = '') => {
  const user = await getAuthenticatedUser();
  const [{ data: preferences }, userProfile] = await Promise.all([
    getJobPreferences(),
    getUserProfile(),
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
  const profile = await buildBrowserAgentProfile({
    user,
    preferences,
    resume,
    userProfile,
    autoSubmit: true,
  });

  return {
    profile,
    candidate: {
      fullName: profile?.candidate?.fullName || '',
      currentTitle: profile?.candidate?.currentTitle || '',
    },
    resume: {
      id: resume.id,
      title: resume.title || '',
      filename: profile?.documents?.resumeFilename || '',
      resumePdfUrl: profile?.documents?.resumePdfUrl || '',
    },
  };
};

const prepareTailoredResumeForBrowserAgent = async (payload = {}) => {
  const { jobPosting = {}, resumeId = '' } = payload;
  const jobDescription = buildImportedJobDescription(jobPosting);
  if (!jobDescription.trim()) {
    throw new Error('Scan the job first so ResumeATS has enough context to prepare a tailored resume.');
  }

  const { user, preferences, userProfile, resume } = await resolveResumeContext(resumeId);
  const generationProfile = buildResumeGenerationProfile({ user, resume, userProfile });
  const generatedResume = await generateEnhancedResume(generationProfile, jobDescription, {
    careerLevel: preferences?.experience_level || 'mid',
    length: 'standard',
    focusSkills: ensureArray(preferences?.skills).join(', '),
  });
  const mappedResume = mapResumeData(generatedResume);
  const savedResumePayload = {
    ...resume,
    ...mappedResume,
    id: '',
    title: deriveResumeTitle(mappedResume, jobDescription),
    description: `Prepared from browser autofill for ${jobPosting?.title || 'this job'}`,
    personalInfo: mergePersonalInfo({
      generated: mappedResume?.personalInfo || {},
      resume: resume?.personalInfo || {},
      profile: userProfile?.personal || {},
      user: {
        email: user?.email || '',
        full_name: user?.user_metadata?.full_name || '',
      },
      jobTitle: jobPosting?.title || '',
    }),
    workExperience: ensureArray(mappedResume?.workExperience).length > 0
      ? ensureArray(mappedResume.workExperience)
      : ensureArray(resume?.workExperience),
    education: ensureArray(mappedResume?.education).length > 0
      ? ensureArray(mappedResume.education)
      : ensureArray(resume?.education),
    skills: ensureArray(mappedResume?.skills).length > 0
      ? ensureArray(mappedResume.skills)
      : ensureArray(resume?.skills),
    certifications: ensureArray(mappedResume?.certifications).length > 0
      ? ensureArray(mappedResume.certifications)
      : ensureArray(resume?.certifications),
    projects: ensureArray(mappedResume?.projects).length > 0
      ? ensureArray(mappedResume.projects)
      : ensureArray(resume?.projects),
    additionalSections: ensureArray(mappedResume?.additionalSections).length > 0
      ? ensureArray(mappedResume.additionalSections)
      : ensureArray(resume?.additionalSections),
    selectedTemplate: mappedResume?.selectedTemplate || resume?.selectedTemplate || 'ats-friendly',
    selectedFont: mappedResume?.selectedFont || resume?.selectedFont || 'Arial',
  };

  const savedResume = await saveResume(savedResumePayload);
  const preparedResume = await getResumeById(savedResume.resume_id);
  const profile = await buildBrowserAgentProfile({
    user,
    preferences,
    resume: preparedResume,
    userProfile,
    autoSubmit: true,
  });

  return {
    profile: {
      ...profile,
      documents: {
        ...(profile?.documents || {}),
        preparedForUrl: jobPosting?.url || '',
        preparedForTitle: jobPosting?.title || '',
        preparedAt: new Date().toISOString(),
        preparedResumeId: preparedResume?.id || '',
        preparedResumeTitle: preparedResume?.title || '',
      },
    },
    resume: {
      id: preparedResume?.id || '',
      title: preparedResume?.title || '',
      filename: profile?.documents?.resumeFilename || '',
      resumePdfUrl: profile?.documents?.resumePdfUrl || '',
    },
  };
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
      if (establishBridgeToken(token)) {
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
        case 'APP_AUTOFILL_AI_REQUEST':
          payload = await generateApplicationAnswers(message.payload || {});
          break;
        case 'APP_SYNC_PROFILE_REQUEST':
          payload = await syncBrowserAgentProfileFromApp(message.payload || {});
          break;
        case 'APP_PREPARE_RESUME_REQUEST':
          payload = await prepareTailoredResumeForBrowserAgent(message.payload || {});
          break;
        default:
          return;
      }

      postResponse({
        type: `${message.type}:response`,
        requestId: message.requestId,
        bridgeToken: activeBridgeToken,
        payload,
      });
    } catch (error) {
      postResponse({
        type: `${message.type}:response`,
        requestId: message.requestId,
        bridgeToken: activeBridgeToken,
        success: false,
        error: error?.message || 'Could not complete the ResumeATS bridge request.',
      });
    }
  };

  const handleMessage = async (event) => {
    if (event.source !== window) return;
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
