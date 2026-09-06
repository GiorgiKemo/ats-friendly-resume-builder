import React, { useState, useEffect, useRef } from 'react';
import { useResume } from '../../context/ResumeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useTailoringDraft } from '../../context/TailoringDraftContext';
import { useNavigate } from 'react-router-dom';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import toast from 'react-hot-toast';
import { generateEnhancedResume } from '../../services/enhancedOpenaiService';
import { mapResumeData } from '../../utils/resumeDataMapper';
import { isResumeTailoringReview } from '../../utils/resumeTailoringReview.js';
import ResumeTailoringReview from './ResumeTailoringReview';
import ExtensionResumeHandoff from './ExtensionResumeHandoff';
import { hasUsableProfileData } from '../../utils/resumeGenerationInput.js';
import { parseJobDescription, formatJobExperience } from '../../utils/jobDescriptionParser';
import { deriveResumeTitle } from '../../utils/resumeTitle.js';
import { getUserProfile } from '../../services/userProfileService';
import { buildImportedJobDescription, getRecentBrowserAgentJobPosting } from '../../services/browserAgentService';
import {
  getIndustryOptions,
  getCareerLevelOptions,
  getToneOptions,
  getLengthOptions
} from '../../utils/promptTemplates';
import Select from '../ui/Select';
import Tooltip from '../ui/Tooltip';
import InformationCircleIcon from '../ui/icons/InformationCircleIcon';
import {
  registerServiceWorker,
  sendMessageToServiceWorker,
  listenForServiceWorkerMessages,
  storeGenerationState,
  getGenerationState,
  clearGenerationState
} from '../../utils/serviceWorkerRegistration';

const AI_GENERATOR_DRAFT_STORAGE_KEY = 'resumeats_ai_generator_draft_v1';

const DEFAULT_AI_GENERATOR_DRAFT = {
  jobDescription: '',
  userCountry: '',
  jobLocation: '',
  importedJobSnapshot: null,
  industry: 'default',
  careerLevel: 'not-specified',
  tone: 'professional',
  length: 'standard',
  focusSkills: ''
};

// Private browsing modes and storage quotas can make Web Storage unavailable.
// Generation must remain usable in memory instead of turning that browser
// capability into a fatal render or submit error.
const getBrowserStorage = (name) => {
  if (typeof window === 'undefined') return null;
  try { return window[name] || null; } catch { return null; }
};

const generationStorageKey = (kind, ownerId) => (
  typeof ownerId === 'string' && ownerId.trim()
    ? `resume_generation_${kind}_${encodeURIComponent(ownerId.trim())}`
    : null
);

const aiGeneratorDraftStorageKey = (ownerId) => (
  typeof ownerId === 'string' && ownerId.trim()
    ? `${AI_GENERATOR_DRAFT_STORAGE_KEY}_${encodeURIComponent(ownerId.trim())}`
    : null
);

const readBrowserStorage = (name, key) => {
  if (!key) return null;
  try { return getBrowserStorage(name)?.getItem(key) || null; } catch { return null; }
};

const writeBrowserStorage = (name, key, value) => {
  if (!key) return;
  try { getBrowserStorage(name)?.setItem(key, value); } catch { /* best effort */ }
};

const removeBrowserStorage = (name, key) => {
  if (!key) return;
  try { getBrowserStorage(name)?.removeItem(key); } catch { /* best effort */ }
};

const sanitizeAIGeneratorDraft = (draft = {}) => ({
  ...DEFAULT_AI_GENERATOR_DRAFT,
  jobDescription: typeof draft.jobDescription === 'string' ? draft.jobDescription : '',
  userCountry: typeof draft.userCountry === 'string' ? draft.userCountry : '',
  jobLocation: typeof draft.jobLocation === 'string' ? draft.jobLocation : '',
  importedJobSnapshot: draft.importedJobSnapshot && typeof draft.importedJobSnapshot === 'object'
    ? draft.importedJobSnapshot
    : null,
  industry: typeof draft.industry === 'string' ? draft.industry : DEFAULT_AI_GENERATOR_DRAFT.industry,
  careerLevel: typeof draft.careerLevel === 'string' ? draft.careerLevel : DEFAULT_AI_GENERATOR_DRAFT.careerLevel,
  tone: typeof draft.tone === 'string' ? draft.tone : DEFAULT_AI_GENERATOR_DRAFT.tone,
  length: typeof draft.length === 'string' ? draft.length : DEFAULT_AI_GENERATOR_DRAFT.length,
  focusSkills: typeof draft.focusSkills === 'string' ? draft.focusSkills : ''
});

const loadAIGeneratorDraft = (userId) => {
  if (typeof window === 'undefined') {
    return DEFAULT_AI_GENERATOR_DRAFT;
  }

  try {
    const storedDraft = readBrowserStorage('localStorage', aiGeneratorDraftStorageKey(userId));
    return storedDraft
      ? sanitizeAIGeneratorDraft(JSON.parse(storedDraft))
      : DEFAULT_AI_GENERATOR_DRAFT;
  } catch (error) {
    console.error('Failed to load saved AI generator draft:', error);
    return DEFAULT_AI_GENERATOR_DRAFT;
  }
};

const hasAIGeneratorDraftContent = (draft) => Boolean(
  draft.jobDescription.trim() ||
  draft.userCountry.trim() ||
  draft.jobLocation.trim() ||
  draft.focusSkills.trim() ||
  draft.importedJobSnapshot ||
  draft.industry !== DEFAULT_AI_GENERATOR_DRAFT.industry ||
  draft.careerLevel !== DEFAULT_AI_GENERATOR_DRAFT.careerLevel ||
  draft.tone !== DEFAULT_AI_GENERATOR_DRAFT.tone ||
  draft.length !== DEFAULT_AI_GENERATOR_DRAFT.length
);

const TECHNICAL_SKILL_TERMS = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'C#', 'SQL',
  'PostgreSQL', 'MySQL', 'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes',
  'Git', 'CI/CD', 'REST API', 'GraphQL', 'Salesforce', 'Excel', 'Tableau',
  'Power BI', 'Figma', 'SEO', 'CRM', 'Agile', 'Scrum', 'Machine Learning',
  'Data Analysis', 'Project Management'
];

const SOFT_SKILL_TERMS = [
  'communication', 'collaboration', 'leadership', 'problem solving',
  'stakeholder management', 'customer service', 'adaptability', 'mentoring',
  'cross-functional', 'time management', 'presentation', 'ownership',
  'analytical', 'detail-oriented'
];

const KEYWORD_STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'because', 'been', 'but', 'can',
  'company', 'description', 'for', 'from', 'have', 'into', 'job', 'our',
  'role', 'that', 'the', 'their', 'this', 'through', 'with', 'will', 'work',
  'you', 'your'
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findTermsInText = (text, terms) => {
  const normalizedText = text.toLowerCase();
  return terms.filter((term) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase()).replace(/\s+/g, '\\s+')}\\b`, 'i');
    return pattern.test(normalizedText);
  });
};

const extractFrequentKeywords = (text, limit = 12) => {
  const counts = new Map();
  text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !KEYWORD_STOP_WORDS.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
};

const extractResponsibilityLines = (text, limit = 5) => text
  .replace(/([.!?])\s+/g, '$1\n')
  .split('\n')
  .map((line) => line.replace(/^[\s>*#\-\u2022]+/, '').trim())
  .filter((line) => line.length > 30)
  .filter((line) => /\b(responsible|manage|build|develop|lead|support|create|analyze|deliver|coordinate|maintain|design|implement|own)\b/i.test(line))
  .slice(0, limit);

const uniqueList = (items, limit = 20) => {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const value = `${item || ''}`.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result.slice(0, limit);
};


const buildLocalJobInsights = (description, parsedJobData) => {
  const technicalSkills = findTermsInText(description, TECHNICAL_SKILL_TERMS);
  const softSkills = findTermsInText(description, SOFT_SKILL_TERMS);
  const frequentKeywords = extractFrequentKeywords(description);
  const roleCategory = parsedJobData?.roleCategory?.replace(/_/g, ' ') || '';

  return {
    source: 'local',
    keywords: uniqueList([
      parsedJobData?.title,
      roleCategory,
      parsedJobData?.employmentType,
      ...technicalSkills,
      ...softSkills,
      ...frequentKeywords
    ], 18),
    technical_skills: technicalSkills,
    soft_skills: softSkills,
    required_experience: formatJobExperience(parsedJobData?.experience),
    industry_specific_advice: parsedJobData?.title
      ? `Prioritize truthful experience and skills that match the ${parsedJobData.title} role.`
      : 'Prioritize truthful experience and skills that match the target role.',
    job_category: roleCategory || 'general',
    key_responsibilities: extractResponsibilityLines(description),
    ats_tips: [
      'Mirror important job-description keywords only when they match your real experience.',
      'Keep standard section headings so ATS parsers can classify content correctly.',
      'Preserve exact employers, schools, certifications, projects, dates, and locations from your profile.'
    ],
  };
};

const EnhancedAIGenerator = () => {
  const { user } = useAuth();
  const userId = user?.id || null;
  const tailoringDrafts = useTailoringDraft();
  const mountedRef = useRef(true);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const generationRunRef = useRef(null);
  const reviewSessionRef = useRef(null);
  const reviewSaveRef = useRef(null);
  const importRequestRef = useRef(null);
  const { createResume } = useResume(); // Removed updateCurrentResume as it's no longer used here
  const {
    isPremium,
    loading: subscriptionLoading,
    subscriptionData,
    getRemainingAIGenerations,
    getAIGenerationAccess,
    refreshSubscriptionStatus
  } = useSubscription();
  const navigate = useNavigate();

  // Keep navigation centralized so generated resume routing stays consistent.
  const navigateSafely = (path, options) => {
    navigate(path, options);
  };

  const initialDraftRef = useRef(null);
  if (!initialDraftRef.current) {
    initialDraftRef.current = loadAIGeneratorDraft(userId);
  }
  const initialDraft = initialDraftRef.current;

  // Get remaining generations
  const remainingGenerations = getRemainingAIGenerations();

  // Calculate percentage for progress bar
  const generationsLimit = subscriptionData?.aiGenerationsLimit || 0;
  const generationsPercentage = generationsLimit > 0
    ? Math.max(0, Math.min(100, (remainingGenerations / generationsLimit) * 100))
    : 0;

  // Basic input fields
  const [jobDescription, setJobDescription] = useState(initialDraft.jobDescription);
  const [userCountry, setUserCountry] = useState(initialDraft.userCountry);
  const [jobLocation, setJobLocation] = useState(initialDraft.jobLocation);
  const [isImportingJob, setIsImportingJob] = useState(false);
  const [importedJobSnapshot, setImportedJobSnapshot] = useState(initialDraft.importedJobSnapshot);

  // Enhanced customization options
  const [industry, setIndustry] = useState(initialDraft.industry);
  const [careerLevel, setCareerLevel] = useState(initialDraft.careerLevel);
  const [tone, setTone] = useState(initialDraft.tone);
  const [length, setLength] = useState(initialDraft.length);
  const [focusSkills, setFocusSkills] = useState(initialDraft.focusSkills);
  const [draftOwnerId, setDraftOwnerId] = useState(userId);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(null);
  const [progress, setProgress] = useState(0);
  const [keywordAnalysis, setKeywordAnalysis] = useState(null);
  // const [parsedJobData, setParsedJobData] = useState(null); // Unused state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [resumeGenerated, setResumeGenerated] = useState(false);
  const [savedResumeId, setSavedResumeId] = useState(null); // Added for auto-save
  const [generatedResumeDataForNav, setGeneratedResumeDataForNav] = useState(null); // To pass to builder
  const [pendingReview, setPendingReview] = useState(null);
  const formContainerRef = useRef(null);
  const introBoxRef = useRef(null);

  // Track page visibility and keep the page alive during generation
  const [isPageVisible, setIsPageVisible] = useState(true);
  const keepAliveIntervalRef = useRef(null);
  const keepAliveWorkerRef = useRef(null);

  // Create refs to store the current progress and step
  const currentProgressRef = useRef(0);
  const currentStepRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    generationRunRef.current = null;
    reviewSessionRef.current = null;
    reviewSaveRef.current = null;
    setPendingReview(null);
    importRequestRef.current = null;
    setIsImportingJob(false);
    setIsGenerating(false);
    setIsSaving(false);
    setResumeGenerated(false);
    setSavedResumeId(null);
    setGeneratedResumeDataForNav(null);
    setKeywordAnalysis(null);
    setProgress(0);
    setCurrentStep(null);
    const draft = loadAIGeneratorDraft(userId);
    setJobDescription(draft.jobDescription);
    setUserCountry(draft.userCountry);
    setJobLocation(draft.jobLocation);
    setImportedJobSnapshot(draft.importedJobSnapshot);
    setIndustry(draft.industry);
    setCareerLevel(draft.careerLevel);
    setTone(draft.tone);
    setLength(draft.length);
    setFocusSkills(draft.focusSkills);
    setDraftOwnerId(userId);
    return () => {
      generationRunRef.current = null;
      reviewSessionRef.current = null;
      reviewSaveRef.current = null;
      importRequestRef.current = null;
      document.body.classList.remove('resume-generation-in-progress');
      document.documentElement.classList.remove('resume-generation-active');
    };
  }, [userId]);

  useEffect(() => {
    const restore = () => {
      const draft = tailoringDrafts.read('enhanced', userId);
      const review = draft?.stage === 'review' ? draft : null;
      reviewSessionRef.current = review;
      setPendingReview(review);
      setIsGenerating(draft?.stage === 'generating');
      setIsSaving(Boolean(draft?.saving));
      if (draft?.savedResume?.id) {
        setSavedResumeId(draft.savedResume.id);
        setGeneratedResumeDataForNav(draft.savedResume);
        setResumeGenerated(true);
      }
      if (draft?.jobDescription) setJobDescription(draft.jobDescription);
    };
    restore();
    return tailoringDrafts.subscribe(restore);
  }, [tailoringDrafts, userId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !userId || draftOwnerId !== userId) return;

    const draft = sanitizeAIGeneratorDraft({
      jobDescription,
      userCountry,
      jobLocation,
      importedJobSnapshot,
      industry,
      careerLevel,
      tone,
      length,
      focusSkills,
      updatedAt: new Date().toISOString()
    });

    try {
      if (hasAIGeneratorDraftContent(draft)) {
        writeBrowserStorage('localStorage', aiGeneratorDraftStorageKey(userId), JSON.stringify(draft));
      } else {
        removeBrowserStorage('localStorage', aiGeneratorDraftStorageKey(userId));
      }
    } catch (error) {
      console.error('Failed to save AI generator draft:', error);
    }
  }, [
    jobDescription,
    userCountry,
    jobLocation,
    importedJobSnapshot,
    industry,
    careerLevel,
    tone,
    length,
    focusSkills,
    userId,
    draftOwnerId
  ]);

  // Register service worker on component mount
  useEffect(() => {
    // Register the service worker with activateImmediately=true since we're on the AI generator page
    registerServiceWorker(true).then(success => {
      if (!success) {
        // Using fallback mode for resume generation
      }
    });
  }, []);

  // Update the refs whenever progress or step changes and save to IndexedDB
  useEffect(() => {
    currentProgressRef.current = progress;

    // Save to IndexedDB to persist across page refreshes
    if (progress > 0 && isGenerating && generationRunRef.current?.userId === userId) {
      // Store in both localStorage (as backup) and IndexedDB
      writeBrowserStorage('localStorage', generationStorageKey('progress', userId), progress.toString());

      // Store in IndexedDB
      storeGenerationState({
        userId,
        runId: generationRunRef.current.id,
        progress,
        step: currentStepRef.current,
        isGenerating: true
      }).catch(error => {
        console.error('Failed to store generation state in IndexedDB:', error);
      });

      // Also notify the service worker
      sendMessageToServiceWorker({
        type: 'GENERATION_PROGRESS',
        userId,
        runId: generationRunRef.current.id,
        progress: {
          value: progress,
          step: currentStepRef.current
        }
      });
    } else if ((progress === 0 || progress === 100) && generationRunRef.current?.userId === userId) {
      // Clear the state when generation is complete or reset
      removeBrowserStorage('localStorage', generationStorageKey('progress', userId));
      clearGenerationState(userId).catch(error => {
        console.error('Failed to clear generation state from IndexedDB:', error);
      });
    }
  }, [progress, isGenerating, userId]);

  useEffect(() => {
    currentStepRef.current = currentStep;

    // Save to localStorage and IndexedDB when step changes
    if (currentStep && isGenerating && generationRunRef.current?.userId === userId) {
      writeBrowserStorage('localStorage', generationStorageKey('step', userId), currentStep);

      // Update the state in IndexedDB
      storeGenerationState({
        userId,
        runId: generationRunRef.current.id,
        progress: currentProgressRef.current,
        step: currentStep,
        isGenerating: true
      }).catch(error => {
        console.error('Failed to store generation state in IndexedDB:', error);
      });
    } else if (!currentStep && generationRunRef.current?.userId === userId) {
      removeBrowserStorage('localStorage', generationStorageKey('step', userId));
    }
  }, [currentStep, isGenerating, userId]);

  // Listen for service worker messages
  useEffect(() => {
    const cleanup = listenForServiceWorkerMessages(message => {
      if (generationRunRef.current && message?.userId === activeUserIdRef.current && message.runId === generationRunRef.current.id && message.type === 'GENERATION_PROGRESS_UPDATE') {
        // Update the UI with the progress from the service worker
        if (message.progress && message.progress.value) {
          setProgress(message.progress.value);
        }

        if (message.progress && message.progress.step) {
          setCurrentStep(message.progress.step);
        }
      }
    }, userId);

    // Listen for the custom resume-generation-continue event
    const handleResumeGeneration = () => {
      if (isGenerating) {
        // Force the component to re-render without refreshing the page
        // This is a hack, but it might help in some browsers
        const currentProgress = currentProgressRef.current;
        const currentStepValue = currentStepRef.current;

        // Use requestAnimationFrame to ensure we're in the right animation frame
        window.requestAnimationFrame(() => {
          // Update the state in a single batch to prevent multiple renders
          if (currentProgress > 0) {
            setProgress(currentProgress);
          }

          if (currentStepValue) {
            setCurrentStep(currentStepValue);
          }
        });
      }
    };

    document.addEventListener('resume-generation-continue', handleResumeGeneration);

    return () => {
      cleanup();
      document.removeEventListener('resume-generation-continue', handleResumeGeneration);
    };
  }, [isGenerating, userId]);

  // Clear any stale state from a prior interrupted generation. The browser cannot
  // resume an aborted page-owned network request after a refresh.
  useEffect(() => {
    const ownerId = userId;
    const clearInterruptedState = async () => {
      try {
        const state = await getGenerationState(ownerId);
        if (!mountedRef.current || activeUserIdRef.current !== ownerId) return;
        const isGenerationInProgress = readBrowserStorage('sessionStorage', generationStorageKey('in_progress', ownerId)) === 'true';
        const savedProgress = readBrowserStorage('localStorage', generationStorageKey('progress', ownerId));
        const savedStep = readBrowserStorage('localStorage', generationStorageKey('step', ownerId));
        const hadInterruptedState = Boolean(
          (state?.isGenerating && state?.progress > 0 && state?.progress < 100) ||
          (isGenerationInProgress && savedProgress && savedStep)
        );

        if (hadInterruptedState && !generationRunRef.current && (!state || state.userId === ownerId)) {
          removeBrowserStorage('sessionStorage', generationStorageKey('in_progress', ownerId));
          removeBrowserStorage('localStorage', generationStorageKey('progress', ownerId));
          removeBrowserStorage('localStorage', generationStorageKey('step', ownerId));
          await clearGenerationState(ownerId);
          if (!mountedRef.current || activeUserIdRef.current !== ownerId) return;
          setIsGenerating(false);
          setProgress(0);
          setCurrentStep(null);
          toast.error('Previous resume generation was interrupted. Please start it again.');
        }
      } catch (error) {
        console.error('Failed to clear interrupted generation state:', error);
      }
    };

    clearInterruptedState();
  }, [userId]);

  // Handle page visibility changes with a more robust approach
  useEffect(() => {
    // Create a flag to track if the component is mounted
    let isMounted = true;

    // Create a flag to track if we're handling a visibility change
    let isHandlingVisibilityChange = false;

    // Function to restore state from IndexedDB
    const restoreStateFromIndexedDB = async () => {
      if (isHandlingVisibilityChange || !isMounted) return;

      try {
        isHandlingVisibilityChange = true;

        // Get the state from IndexedDB
        const state = await getGenerationState(userId);

        if (state?.userId === activeUserIdRef.current && generationRunRef.current && state.runId === generationRunRef.current.id && state.isGenerating && state.progress > 0 && state.progress < 100 && isMounted) {
          // Use requestAnimationFrame to ensure we're in the right animation frame
          window.requestAnimationFrame(() => {
            if (isMounted && state.userId === activeUserIdRef.current && state.runId === generationRunRef.current?.id) {
              // Update the state in a single batch to prevent multiple renders
              setIsGenerating(true);
              setProgress(state.progress);

              if (state.step) {
                setCurrentStep(state.step);
              }
            }
          });
        }
      } catch (error) {
        console.error('Error restoring state from IndexedDB:', error);
      } finally {
        isHandlingVisibilityChange = false;
      }
    };

    const handleVisibilityChange = () => {
      // Only proceed if the component is still mounted
      if (!isMounted) return;

      const isVisible = !document.hidden;
      setIsPageVisible(isVisible);

      // When tab becomes visible again and generation is in progress
      if (isVisible && isGenerating) {
        // Use a more aggressive approach to prevent refresh
        // 1. Add a class to the body to prevent refresh
        document.body.classList.add('resume-generation-in-progress');

        // 2. Restore state from IndexedDB
        restoreStateFromIndexedDB();
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also listen for focus and blur events as a backup
    const handleBlur = () => setIsPageVisible(false);
    const handleFreeze = () => setIsPageVisible(false);

    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    // Add a special handler for mobile browsers
    document.addEventListener('resume', handleVisibilityChange);
    document.addEventListener('freeze', handleFreeze);

    // Cleanup
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('resume', handleVisibilityChange);
      document.removeEventListener('freeze', handleFreeze);
    };
  }, [isGenerating, userId]);

  // A best-effort, bounded heartbeat while hidden. Browsers may still suspend it.
  useEffect(() => {
    let workerUrl = null;
    if (isGenerating && !isPageVisible) {
      if (!keepAliveIntervalRef.current && !keepAliveWorkerRef.current) {
        // Use a Web Worker if available to keep the process running in the background
        try {
          // Only timer ticks initiate a heartbeat; acknowledgments do not loop.
          const workerCode = `
            setInterval(() => {
              self.postMessage('keepAlive');
            }, 1000);

            self.onmessage = function(e) {
              if (e.data === 'ping') {
                self.postMessage('pong');
              }
            };
          `;

          const blob = new Blob([workerCode], { type: 'application/javascript' });
          workerUrl = URL.createObjectURL(blob);
          const worker = new Worker(workerUrl);

          // Store the worker reference
          keepAliveWorkerRef.current = worker;

          // Set up communication
          worker.onmessage = (e) => {
            if (e.data === 'keepAlive' && isGenerating && keepAliveWorkerRef.current === worker) {
              worker.postMessage('ping');
            }
          };

          // Start the communication
          worker.postMessage('ping');
        } catch (error) {
          if (workerUrl) {
            URL.revokeObjectURL(workerUrl);
            workerUrl = null;
          }
          console.error('Failed to create Web Worker, falling back to interval:', error);

          // Fallback to setInterval if Web Workers aren't available
          keepAliveIntervalRef.current = setInterval(() => {
            // Best effort only; timers can also be throttled or suspended.
          }, 1000);
        }
      }
    } else if (keepAliveIntervalRef.current) {
      // Clear the interval when the page becomes visible again or generation stops
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;

      // Also terminate any worker if it exists
      if (keepAliveWorkerRef.current) {
        keepAliveWorkerRef.current.onmessage = null;
        keepAliveWorkerRef.current.terminate();
        keepAliveWorkerRef.current = null;
      }
    }

    // Cleanup on visibility/generation changes and unmount.
    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }

      if (keepAliveWorkerRef.current) {
        keepAliveWorkerRef.current.onmessage = null;
        keepAliveWorkerRef.current.terminate();
        keepAliveWorkerRef.current = null;
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrl = null;
      }
    };
  }, [isGenerating, isPageVisible, userId]);

  // Add beforeunload event listener to warn before closing the page
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isGenerating || pendingReview || isSaving) {
        // Make sure we've saved the latest progress to localStorage before unloading
        if (currentProgressRef.current > 0) {
          writeBrowserStorage('localStorage', generationStorageKey('progress', userId), currentProgressRef.current.toString());
        }
        if (currentStepRef.current) {
          writeBrowserStorage('localStorage', generationStorageKey('step', userId), currentStepRef.current);
        }

        e.preventDefault();
        e.returnValue = 'Your generation or review is not saved. Leaving will discard it.';
        return e.returnValue;
      }
      return undefined;
    };

    // Add the event listener
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isGenerating, pendingReview, isSaving, userId]);

  // Get dropdown options
  const industryOptions = getIndustryOptions();
  const careerLevelOptions = getCareerLevelOptions();
  const toneOptions = getToneOptions();
  const lengthOptions = getLengthOptions();

  // Helper function to get step message
  const getStepMessage = () => {
    switch (currentStep) {
      case 'analyzing':
        return 'Scanning Job Description...';
      case 'extracting_keywords':
        return 'Identifying Key Skills & Keywords...';
      case 'preparing_profile':
        return 'Aligning Your Profile Data...';
      case 'generating_resume':
        return 'Building Your AI Resume Draft...';
      case 'formatting_resume':
        return 'Optimizing ATS Formatting...';
      case 'finalizing':
        return 'Polishing Your AI Draft...';
      default:
        return 'AI Working Its Magic...';
    }
  };

  const parsedJobPreview = jobDescription.trim() ? parseJobDescription(jobDescription) : null;

  const showAIGenerationAccessMessage = (reason) => {
    if (reason === 'upgrade_required') {
      toast.error('The AI Resume Generator is a Premium feature. Upgrade to continue.');
      return;
    }

    if (reason === 'limit_reached') {
      toast.error('You have reached your AI generation limit for this month.');
      return;
    }

    if (reason === 'loading') {
      toast.error('Still checking your subscription status. Please try again in a moment.');
      return;
    }

    toast.error('Unable to verify AI access right now. Please try again.');
  };

  const handleImportJobPosting = async () => {
    if (importRequestRef.current || !userId) return;
    const request = { userId };
    importRequestRef.current = request;
    const isCurrentImport = () => importRequestRef.current === request && activeUserIdRef.current === userId;
    setIsImportingJob(true);

    try {
      const response = await getRecentBrowserAgentJobPosting();
      if (!isCurrentImport()) return;
      const jobPosting = response?.jobPosting || response?.lastJobSnapshot || null;

      if (!jobPosting?.description && !jobPosting?.title) {
        throw new Error('No recent job posting found. Open a job page in another tab, let it load, then try again.');
      }

      const importedDescription = buildImportedJobDescription(jobPosting);

      setJobDescription(importedDescription);
      setImportedJobSnapshot(jobPosting);

      if (jobPosting.location) {
        setJobLocation(jobPosting.location);
      }

      toast.success(`Imported ${jobPosting.title || 'job posting'} from browser extension`);
    } catch (error) {
      if (isCurrentImport()) toast.error(error.message || 'Could not import a job posting from the browser extension.');
    } finally {
      if (isCurrentImport()) {
        importRequestRef.current = null;
        setIsImportingJob(false);
      }
    }
  };

  const discardReview = () => {
    if (reviewSaveRef.current || pendingReview?.saving) return;
    if (pendingReview) tailoringDrafts.clear('enhanced', userId, pendingReview.runId);
    reviewSessionRef.current = null;
    setPendingReview(null);
  };

  const completeReview = async (session, resolvedResume) => {
    if (!session || reviewSessionRef.current?.runId !== session.runId || activeUserIdRef.current !== session.userId || reviewSaveRef.current || session.saving) return;
    const request = {};
    reviewSaveRef.current = request;
    const isCurrent = () => activeUserIdRef.current === session.userId && tailoringDrafts.read('enhanced', session.userId)?.runId === session.runId;
    tailoringDrafts.write('enhanced', session.userId, { ...session, saving: true }, session.runId);
    setIsSaving(true);
    try {
      const reviewedResume = mapResumeData(resolvedResume);
      const newResume = await createResume({
        ...reviewedResume,
        title: deriveResumeTitle(reviewedResume, session.jobDescription),
        description: `Tailored for: ${session.jobDescription.substring(0, 100)}`,
      });
      if (!isCurrent()) return;
      if (!newResume?.id) throw new Error('Saving did not return a resume. Please try again.');
      tailoringDrafts.write('enhanced', session.userId, { ...session, savedResume: newResume, saving: false }, session.runId);
      tailoringDrafts.clear('enhanced', session.userId, session.runId);
      if (!mountedRef.current || activeUserIdRef.current !== session.userId) return;
      setSavedResumeId(newResume.id);
      setGeneratedResumeDataForNav(newResume);
      setResumeGenerated(true);
      reviewSessionRef.current = null;
      setPendingReview(null);
      toast.success('Reviewed resume saved.');
    } catch (error) {
      if (isCurrent()) {
        tailoringDrafts.write('enhanced', session.userId, { ...session, saving: false }, session.runId);
        if (mountedRef.current) toast.error(error.message || 'Could not save your reviewed resume. Your review is still here; try again.');
      }
    } finally {
      if (mountedRef.current && reviewSaveRef.current === request && activeUserIdRef.current === session.userId) {
        reviewSaveRef.current = null;
        setIsSaving(false);
      }
    }
  };

  const handleGenerateResume = async () => {
    if (generationRunRef.current || tailoringDrafts.read('enhanced', userId) || reviewSaveRef.current) return;
    if (!isPremium) { toast.error('Premium is required to start a new AI generation.'); return; }
    // Job description is required
    const trimmedJobDescription = jobDescription.trim();
    if (!trimmedJobDescription) {
      toast('Please provide a job description to generate a resume');
      return;
    }

    if (!userId) {
      toast.error('Sign in before generating a resume.');
      return;
    }
    const run = { userId, id: crypto.randomUUID() };
    tailoringDrafts.write('enhanced', userId, { userId, runId: run.id, jobDescription: trimmedJobDescription, stage: 'generating' });
    generationRunRef.current = run;
    const isCurrentRun = () => activeUserIdRef.current === userId && tailoringDrafts.read('enhanced', userId)?.runId === run.id;
    const requireCurrentRun = () => {
      if (!isCurrentRun()) throw new Error('Resume generation was cancelled because your account or page changed.');
    };
    setIsGenerating(true);

    try {
      const access = await getAIGenerationAccess();
      requireCurrentRun();
      if (!access.allowed) {
        showAIGenerationAccessMessage(access.reason);
        return;
      }
      // Set a flag in sessionStorage to indicate we're in the middle of generation
      // This helps prevent React StrictMode from causing double renders
      writeBrowserStorage('sessionStorage', generationStorageKey('in_progress', userId), 'true');

      // Add a special class to the document body to prevent refresh
      document.body.classList.add('resume-generation-in-progress');
      document.documentElement.classList.add('resume-generation-active');
      setResumeGenerated(false);
      setSavedResumeId(null);
      setGeneratedResumeDataForNav(null);

      // Store the initial state in IndexedDB
      void storeGenerationState({
        userId,
        runId: run.id,
        progress: 10,
        step: 'analyzing',
        isGenerating: true,
        jobDescription: trimmedJobDescription,
        industry,
        careerLevel,
        tone,
        length,
        userCountry,
        jobLocation
      }).catch((error) => console.error('Failed to store optional generation progress:', error));

      // Notify the service worker that generation has started
      sendMessageToServiceWorker({
        type: 'GENERATION_PROGRESS',
        userId,
        runId: run.id,
        progress: {
          value: 10,
          step: 'analyzing'
        }
      });

      setIsGenerating(true);
      setKeywordAnalysis(null);
      // setParsedJobData(null); // State was removed

      // Set the current step
      const initialStep = 'analyzing';
      setCurrentStep(initialStep);

      // Set the progress
      const initialProgress = 10;
      setProgress(initialProgress);

      // Parse the job description and build local insights without spending an AI assist.
      let parsedData = null;
      let localKeywordAnalysis = null;
      try {
        parsedData = parseJobDescription(trimmedJobDescription);
        localKeywordAnalysis = buildLocalJobInsights(trimmedJobDescription, parsedData);
        setKeywordAnalysis(localKeywordAnalysis);

        // Update progress
        setProgress(30);
      } catch (error) {
        console.error('Error parsing job description:', error);
        // Continue even if parsing fails
      }

      // Load the user's profile data
      const preparingStep = 'preparing_profile';
      setCurrentStep(preparingStep);

      const preparingProgress = 40;
      setProgress(preparingProgress);

      // Initialize a profile. Regional inputs are passed as generation context,
      // not as the candidate's contact location.
      let userProfile = {
        personal: {}
      };

      // Try to load the user's saved profile data from Supabase
      try {
        const profileData = await getUserProfile(userId);
        requireCurrentRun();

        if (!hasUsableProfileData(profileData)) {
          throw new Error('Complete your profile first so the AI has real details to tailor.');
        }

        if (profileData) {
          userProfile.id = profileData.id;
          userProfile.revision = profileData.revision;
          // Use the user's personal information if available
          if (profileData.personal) {
            userProfile.personal = { ...profileData.personal };
            delete userProfile.personal.applicationProfile;
          }

          // Use the user's education information if available
          if (profileData.education && profileData.education.length > 0) {
            userProfile.education = profileData.education;
          }

          if (profileData.workExperience && profileData.workExperience.length > 0) {
            userProfile.workExperience = profileData.workExperience;
          }

          if (profileData.skills && profileData.skills.length > 0) {
            userProfile.skills = profileData.skills;
          }

          if (profileData.certifications && profileData.certifications.length > 0) {
            userProfile.certifications = profileData.certifications;
          }

          if (profileData.projects && profileData.projects.length > 0) {
            userProfile.projects = profileData.projects;
          }

          if (profileData.languages && profileData.languages.length > 0) {
            userProfile.languages = profileData.languages;
          }

          if (profileData.interests && profileData.interests.length > 0) {
            userProfile.interests = profileData.interests;
          }
          if (Array.isArray(profileData.additionalSections)) userProfile.additionalSections = profileData.additionalSections;
        }
      } catch (profileError) {
        throw new Error(profileError.message || 'Could not load your saved profile. Please refresh and try again.');
      }

      // Create options object for enhanced generation
      const options = {
        industry,
        careerLevel,
        tone,
        length,
        focusSkills,
        assertCurrentRequest: requireCurrentRun,
        sourceInfo: { ownerId: userId, runId: run.id, profileId: userProfile.id, profileRevision: userProfile.revision },
        userCountry: userCountry.trim(),
        jobLocation: jobLocation.trim()
      };

      // Generate the resume content
      const generatingStep = 'generating_resume';
      setCurrentStep(generatingStep);

      const generatingProgress = 60;
      setProgress(generatingProgress);

      // Use the parsed job data if available
      // const jobDataForGeneration = parsedJobData || {}; // Unused variable
      const generatedResume = await generateEnhancedResume(userProfile, trimmedJobDescription, options, localKeywordAnalysis);
      requireCurrentRun();
      if (!isResumeTailoringReview(generatedResume)) {
        throw new Error('The generation response is missing its source review. Please generate again.');
      }
      const session = { userId, runId: run.id, jobDescription: trimmedJobDescription, review: generatedResume, decisions: {}, stage: 'review' };
      tailoringDrafts.write('enhanced', userId, session, run.id);
      if (mountedRef.current) setProgress(100);

      // Review stays in account-bound memory. Only an explicit review action can save it.
      void Promise.resolve().then(() => refreshSubscriptionStatus()).catch((error) => {
        console.error('Failed to refresh AI usage after generation:', error);
      });
      if (mountedRef.current) toast.success('Suggestions are ready. Review the wording before saving.');

    } catch (error) { // This is the catch for handleGenerateResume
      if (!isCurrentRun()) return;
      tailoringDrafts.clear('enhanced', userId, run.id);
      if (!mountedRef.current) return;
      console.error('Error generating resume:', error);

      // Provide more specific error messages for common issues
      if (error.message && error.message.includes('JSON')) {
        toast.error('There was an issue processing the AI response. This is often due to a temporary issue with the AI service. Please try again.');
      } else if (error.message && error.message.includes('Failed to parse')) {
        toast.error('The AI generated an incomplete response. Please try again with a more detailed job description.');
      } else {
        toast.error(error.message || 'Failed to generate resume. Please try again.');
      }
    } finally {
      if (tailoringDrafts.read('enhanced', userId)?.stage === 'generating' && isCurrentRun()) tailoringDrafts.clear('enhanced', userId, run.id);
      if (mountedRef.current && activeUserIdRef.current === userId) {
      generationRunRef.current = null;
      setIsGenerating(false);
      setCurrentStep(null);

      // Clear all generation flags and state
      removeBrowserStorage('sessionStorage', generationStorageKey('in_progress', userId));
      removeBrowserStorage('localStorage', generationStorageKey('progress', userId));
      removeBrowserStorage('localStorage', generationStorageKey('step', userId));

      // Clear the IndexedDB state
      clearGenerationState(userId).catch(error => {
        console.error('Failed to clear generation state from IndexedDB:', error);
      });

      // Remove the special classes
      document.body.classList.remove('resume-generation-in-progress');
      document.documentElement.classList.remove('resume-generation-active');

      // Notify the service worker that generation has completed
      sendMessageToServiceWorker({
        type: 'GENERATION_PROGRESS',
        userId,
        runId: run.id,
        progress: {
          value: 100,
          step: 'completed'
        }
      });
      }
    }
  };

  // Effect to scroll to form top when generation finishes successfully
  useEffect(() => {
    if (!isGenerating && resumeGenerated && introBoxRef.current) {
      // Generation just finished, and resume was successfully generated and saved
      introBoxRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [isGenerating, resumeGenerated]); // Dependencies

  const extensionHandoff = <ExtensionResumeHandoff
    canTailor={isPremium}
    savedResume={generatedResumeDataForNav}
    hasDraftContent={Boolean(jobDescription.trim() || jobLocation.trim() || importedJobSnapshot)}
    hasUnfinishedWork={Boolean(isGenerating || isSaving || pendingReview || tailoringDrafts.read('enhanced', userId))}
    onImport={(jobPosting) => {
      if (activeUserIdRef.current !== userId || generationRunRef.current || reviewSaveRef.current || tailoringDrafts.read('enhanced', userId)) return false;
      setJobDescription(buildImportedJobDescription(jobPosting));
      setJobLocation(jobPosting.location || '');
      setImportedJobSnapshot(jobPosting);
      setKeywordAnalysis(null);
      formContainerRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      return true;
    }}
  />;

  // If subscription status is still loading, show a loading state
  const hasExistingWork = Boolean(tailoringDrafts.read('enhanced', userId) || savedResumeId);
  if (subscriptionLoading && !hasExistingWork) {
    return (
      <>
      {extensionHandoff}
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-slate-300">Loading...</p>
      </div>
      </>
    );
  }

  // If user doesn't have premium, show upgrade message
  if (!isPremium && !hasExistingWork) {
    return (
      <>
      {extensionHandoff}
      <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm dark:border-blue-500/20 dark:bg-slate-800">
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-5 dark:border-blue-500/20 dark:bg-blue-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
            Premium Tool
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-blue-900 dark:text-blue-100">
            Generate a full AI draft before you start editing line by line.
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-blue-800 dark:text-blue-100/90">
            This generator suggests wording for your real profile. Review each change before saving a tailored resume to your library.
          </p>
        </div>

        <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Paste or import</p>
                <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                  Bring in a full job description, including responsibilities, stack, and seniority.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Generate draft</p>
                <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                  AI writes a summary, experience bullets, and skills matched to the role.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">Refine and export</p>
                <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                  Save it, polish what matters, then export in DOCX or PDF.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">What Premium unlocks here</h4>
              <ul className="mt-3 space-y-2 text-sm text-blue-800 dark:text-blue-100/90">
                <li>Full resume generation from a single job posting</li>
                <li>Better keyword coverage and ATS-focused wording</li>
                <li>Saved drafts that you can keep editing in the builder</li>
                <li>Monthly AI assist allowance for repeated tailoring</li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5 dark:bg-slate-900/80">
            <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
              Best Use Case
            </h4>
            <p className="mt-3 text-sm text-gray-700 dark:text-slate-300">
              Use this when you already know the role you want and want the fastest route to a tailored first draft.
            </p>
            <div className="mt-5 flex flex-col gap-3">
                <Button as="link" to="/pricing" className="w-full bg-blue-600 hover:bg-blue-700">
                  Upgrade to Premium
                </Button>
              <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {extensionHandoff}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100" ref={introBoxRef}>
        <h3 className="font-semibold">Tailor, review, then save</h3>
        <p className="mt-2">AI suggests wording from your saved profile and target job. Compare each suggestion with its source, keep the original or confirm your own wording before saving. Suggestions are not independently verified, and no format guarantees an ATS result.</p>
      </div>

      {pendingReview && (
        <div className="space-y-3">
          <ResumeTailoringReview
            review={pendingReview.review}
            decisions={pendingReview.decisions}
            onDecisionsChange={(decisions) => {
              const current = tailoringDrafts.read('enhanced', userId);
              if (current?.runId === pendingReview.runId && !current.saving) tailoringDrafts.write('enhanced', userId, { ...current, decisions }, current.runId);
            }}
            onComplete={(resolvedResume) => completeReview(pendingReview, resolvedResume)}
            disabled={isSaving}
            actionLabel={isSaving ? 'Saving reviewed resume...' : 'Save reviewed resume'}
          />
          <Button variant="ghost" disabled={isSaving} onClick={discardReview}>Discard suggestions</Button>
          <p className="text-sm text-gray-600 dark:text-slate-300">This review stays available when you switch pages in this account. Reloading, closing this browser tab, or signing out discards it.</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-6 mb-6" ref={formContainerRef}>
        <div className="space-y-6">
          {/* Job Description Input */}
          <div>
            <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Import Job From Extension</h4>
                  <p className="mt-1 text-sm text-blue-700 dark:text-blue-100/80">
                    Open a job posting in another tab, let the ResumeATS extension detect it, then import the structured job details here.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="md"
                  onClick={handleImportJobPosting}
                  disabled={isImportingJob || isGenerating}
                  className="border-blue-200 bg-white text-blue-700 hover:bg-blue-100 dark:border-blue-400/30 dark:bg-slate-800 dark:text-blue-200 dark:hover:bg-slate-700"
                >
                  {isImportingJob ? 'Importing...' : 'Import Latest Job'}
                </Button>
              </div>

              {importedJobSnapshot && (
                <div className="mt-4 grid gap-3 rounded-lg border border-blue-100 dark:border-blue-500/20 bg-white/80 dark:bg-slate-800/80 p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300">Role</p>
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">{importedJobSnapshot.title || 'Unknown role'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300">Company</p>
                    <p className="mt-1 text-sm font-medium text-gray-900 dark:text-slate-100">{importedJobSnapshot.company || 'Unknown company'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300">Location</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">{importedJobSnapshot.location || 'Not detected'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-300">Source</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">{importedJobSnapshot.providerLabel || importedJobSnapshot.provider || 'Browser extension'}</p>
                  </div>
                </div>
              )}
            </div>

            <Textarea
              label="Target Job Description (Required)"
              id="jobDescription"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={6}
              placeholder="Paste the full job description here. The more detail, the better our AI can tailor your resume."
              required
            />
            <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
              Pro Tip: Include company information and specific requirements if available in the job post for even more targeted results.
            </p>
          </div>

          {parsedJobPreview?.title && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/70 p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Detected Job Details</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Title</p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{parsedJobPreview.title}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Company</p>
                  <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{parsedJobPreview.company || 'Not detected yet'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Location</p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">{parsedJobPreview.location || 'Not detected yet'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Seniority</p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-slate-300">
                    {formatJobExperience(parsedJobPreview.experience)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Basic Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Industry Selection */}
            <div>
              <div className="flex items-center mb-1">
                <label htmlFor="industry" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Your Target Industry
                </label>
                <Tooltip content="Choose the industry most relevant to the job. This guides the AI in using appropriate terminology and highlighting relevant experience types.">
                  <InformationCircleIcon className="h-4 w-4 ml-1 text-gray-500 dark:text-slate-500" />
                </Tooltip>
              </div>
              <Select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                options={industryOptions}
              />
            </div>

            {/* Career Level Selection */}
            <div>
              <div className="flex items-center mb-1">
                <label htmlFor="careerLevel" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Your Current Career Level
                </label>
              </div>
              <Select
                id="careerLevel"
                value={careerLevel}
                onChange={(e) => setCareerLevel(e.target.value)}
                options={careerLevelOptions}
                aria-describedby="careerLevel-help"
              />
              <p id="careerLevel-help" className="text-sm text-gray-600 dark:text-slate-400">
                Optional. Choose your own career stage, not the target job's level. This guides wording only; it does not add experience or leadership claims.
              </p>
            </div>
          </div>

          {/* Location Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Your Country (for regional nuances)"
              id="userCountry"
              value={userCountry}
              onChange={(e) => setUserCountry(e.target.value)}
              rows={1}
              placeholder="e.g., United States, United Kingdom, India"
              tooltip="Providing your country helps the AI incorporate any regional resume conventions or terminology, if applicable. Use full country names."
            />

            <Textarea
              label="Target Job Location (if specific)"
              id="jobLocation"
              value={jobLocation}
              onChange={(e) => setJobLocation(e.target.value)}
              rows={1}
              placeholder="e.g., New York, NY; London, UK; Remote"
              tooltip={'If the job is in a specific location, enter it here (e.g., " San Francisco, CA" or "Berlin, Germany"). This can help tailor content for local context.'}
            />
          </div>

          {/* Advanced Options Toggle */}
          <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium flex items-center"
              aria-expanded={showAdvancedOptions}
            >
              {showAdvancedOptions ? 'Hide Advanced Options' : 'Refine Further (Advanced Options)'}
              <svg
                className={`ml-1 w-4 h-4 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>

          {/* Advanced Options */}
          {showAdvancedOptions && (
            <div className="bg-gray-50 dark:bg-slate-900/70 p-4 rounded-md space-y-4 border border-gray-200 dark:border-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Resume Tone */}
                <div>
                  <div className="flex items-center mb-1">
                    <label htmlFor="tone" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                      Desired Resume Tone
                    </label>
                    <Tooltip content="Choose the overall writing style. 'Professional' is standard, 'Creative' suits artistic fields, 'Technical' for STEM, and 'Friendly' for customer-facing roles.">
                      <InformationCircleIcon className="h-4 w-4 ml-1 text-gray-500 dark:text-slate-500" />
                    </Tooltip>
                  </div>
                  <Select
                    id="tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    options={toneOptions}
                  />
                </div>

                {/* Resume Length */}
                <div>
                  <div className="flex items-center mb-1">
                    <label htmlFor="length" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                      Preferred Resume Length
                    </label>
                    <Tooltip content="Select target length: 'Concise' (1 page, ideal for entry-level), 'Standard' (1-2 pages, most common), or 'Comprehensive' (2-3+ pages, for extensive experience/academic roles).">
                      <InformationCircleIcon className="h-4 w-4 ml-1 text-gray-500 dark:text-slate-500" />
                    </Tooltip>
                  </div>
                  <Select
                    id="length"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    options={lengthOptions}
                  />
                </div>
              </div>

              {/* Focus Skills */}
              <div>
                <div className="flex items-center mb-1">
                  <label htmlFor="focusSkills" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Key Skills to Highlight (Optional)
                  </label>
                  <Tooltip content="List any specific hard or soft skills (comma-separated) you absolutely want the AI to weave into the resume content.">
                    <InformationCircleIcon className="h-4 w-4 ml-1 text-gray-500 dark:text-slate-500" />
                  </Tooltip>
                </div>
                <Textarea
                  id="focusSkills"
                  value={focusSkills}
                  onChange={(e) => setFocusSkills(e.target.value)}
                  rows={2}
                  placeholder="e.g., Python, Agile Methodologies, Public Speaking"
                />
              </div>
            </div>
          )}

          {/* AI Generation Limit Tracker */}
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">Your AI Power Meter</h4>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                {remainingGenerations} of {generationsLimit} AI Assists Left
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 mb-1">
              <div
                className={`h-2.5 rounded-full transition-[width,background-color] duration-300 ease-in-out ${remainingGenerations === 0 ? 'bg-red-500' :
                  remainingGenerations < 5 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                style={{ width: `${generationsPercentage}%` }}
              ></div>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-100/90 mt-1">
              {remainingGenerations === 0 ? (
                <span className="text-red-600 dark:text-red-300 font-medium">Monthly AI assist limit reached. More assists available at your next billing cycle.</span>
              ) : remainingGenerations < 5 ? (
                <span className="text-yellow-600 dark:text-yellow-300">Heads up! You're getting low on AI assists for this cycle.</span>
              ) : (
                <span>Each AI-powered resume generation uses one assist from your monthly allowance.</span>
              )}
            </p>
            <div className="mt-2 text-right">
              <button
                onClick={refreshSubscriptionStatus}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 underline"
              >
                Refresh Status
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex flex-col items-center mt-8">
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
              <Button
                id="generate-resume-button"
                onClick={handleGenerateResume}
                disabled={!isPremium || isGenerating || isSaving || Boolean(pendingReview) || remainingGenerations === 0}
                className="px-8 py-3 text-lg bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
              >
                {isGenerating ? getStepMessage() : 'Craft My AI Resume Draft'}
              </Button>

              {resumeGenerated && (
                <Button
                  onClick={() => {
                    if (savedResumeId && generatedResumeDataForNav) {
                      navigateSafely(`/builder/${savedResumeId}`, { state: { newlyCreatedResumeData: generatedResumeDataForNav } });
                    } else if (generatedResumeDataForNav) {
                      navigateSafely('/builder');
                    } else {
                      toast.error('Could not find generated resume data. Please try generating again.');
                    }
                  }}
                  disabled={!generatedResumeDataForNav || isGenerating}
                  className="px-8 py-3 text-lg bg-green-600 hover:bg-green-700 w-full md:w-auto"
                >
                  {savedResumeId ? 'View Generated Resume' : 'Open Unsaved Draft'}
                </Button>
              )}
            </div>

            {/* Progress Bar */}
            {isGenerating && (
              <div className="w-full mt-4">
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-[width,background-color] duration-300 ease-in-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 text-center">{getStepMessage()}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keyword Analysis Section */}
      {keywordAnalysis && (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">
            {keywordAnalysis.source === 'ai' ? 'AI-Powered ATS Insights for Your Target Job' : 'ATS Insights for Your Target Job'}
          </h3>

          {keywordAnalysis.keywords && keywordAnalysis.keywords.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Crucial Keywords Identified:</h4>
              <div className="flex flex-wrap gap-2">
                {keywordAnalysis.keywords.slice(0, 15).map((keyword, index) => (
                  <span key={index} className="bg-green-100 dark:bg-green-500/10 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {keywordAnalysis.technical_skills && keywordAnalysis.technical_skills.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Essential Technical Skills:</h4>
              <div className="flex flex-wrap gap-2">
                {keywordAnalysis.technical_skills.map((skill, index) => (
                  <span key={index} className="bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {keywordAnalysis.soft_skills && keywordAnalysis.soft_skills.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Valued Soft Skills:</h4>
              <div className="flex flex-wrap gap-2">
                {keywordAnalysis.soft_skills.map((skill, index) => (
                  <span key={index} className="bg-purple-100 dark:bg-purple-500/10 text-purple-800 dark:text-purple-200 text-xs px-2 py-1 rounded">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {keywordAnalysis.required_experience && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Experience Level Indicated:</h4>
              <p className="text-sm text-green-800 dark:text-green-100/90">{keywordAnalysis.required_experience}</p>
            </div>
          )}

          {keywordAnalysis.industry_specific_advice && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Tailoring Tips for This Industry:</h4>
              <p className="text-sm text-green-800 dark:text-green-100/90">{keywordAnalysis.industry_specific_advice}</p>
            </div>
          )}

          {keywordAnalysis.job_category && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Likely Job Category:</h4>
              <p className="text-sm text-green-800 dark:text-green-100/90">{keywordAnalysis.job_category}</p>
            </div>
          )}

          {keywordAnalysis.key_responsibilities && keywordAnalysis.key_responsibilities.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Core Responsibilities to Address:</h4>
              <ul className="list-disc list-inside text-sm text-green-800 dark:text-green-100/90 space-y-1">
                {keywordAnalysis.key_responsibilities.map((responsibility, index) => (
                  <li key={index}>{responsibility}</li>
                ))}
              </ul>
            </div>
          )}

          {keywordAnalysis.ats_tips && keywordAnalysis.ats_tips.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Resume formatting guidance:</h4>
              <ul className="list-disc list-inside text-sm text-green-800 dark:text-green-100/90 space-y-1">
                {keywordAnalysis.ats_tips.map((tip, index) => (
                  <li key={index}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Quality Assessment Section Removed */}

      <div className="bg-gray-50 dark:bg-slate-900/70 border border-gray-200 dark:border-slate-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-3">Quick ATS Wins: Do's & Don'ts</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-700 dark:text-slate-200 mb-2">Do:</h4>
            <ul className="list-disc list-inside text-sm text-gray-600 dark:text-slate-300 space-y-1">
              <li>Stick to a clean, single-column format.</li>
              <li>Use job keywords only when they match your actual experience.</li>
              <li>Employ standard headings (e.g., "Work Experience," "Skills").</li>
              <li>Lead bullet points with strong action verbs.</li>
              <li>Use metrics only when your records support their value and meaning.</li>
              <li>Choose ATS-safe fonts (Arial, Calibri, etc.).</li>
              <li>Follow the posting's file-format instructions and proofread the downloaded file.</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-slate-200 mb-2">Don't:</h4>
            <ul className="list-disc list-inside text-sm text-gray-600 dark:text-slate-300 space-y-1">
              <li>Assume every hiring system parses the same layout.</li>
              <li>Place essential contact details only in a header or footer.</li>
              <li>Use decorative symbols in place of important text.</li>
              <li>Add personal details that the employer does not need.</li>
              <li>Replace clear section headings with ambiguous titles.</li>
              <li>Ignore the employer's requested file format.</li>
              <li>Accept AI wording without checking it against your own experience.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-slate-400 mt-4">
        <p>Important: Complete your profile first. Missing work history, projects, education, or certifications are omitted instead of being fabricated.</p>
      </div>
    </div>
  );
};

export default EnhancedAIGenerator;
