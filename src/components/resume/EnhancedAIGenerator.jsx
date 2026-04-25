import React, { useState, useEffect, useRef } from 'react';
import { useResume } from '../../context/ResumeContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useNavigate, Link } from 'react-router-dom';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import toast from 'react-hot-toast';
import { generateEnhancedResume, enhancedKeywordExtraction } from '../../services/enhancedOpenaiService';
import { mapResumeData } from '../../utils/resumeDataMapper';
import { parseJobDescription } from '../../utils/jobDescriptionParser';
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

const EnhancedAIGenerator = () => {
  // const { user } = useAuth(); // user was unused
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

  // No need for safe navigation since generation continues in background
  const navigateSafely = (path) => {
    navigate(path);
  };

  // Get remaining generations
  const remainingGenerations = getRemainingAIGenerations();

  // Calculate percentage for progress bar
  const generationsLimit = subscriptionData?.aiGenerationsLimit || 0;
  const generationsPercentage = generationsLimit > 0
    ? Math.max(0, Math.min(100, (remainingGenerations / generationsLimit) * 100))
    : 0;

  // Basic input fields
  const [jobDescription, setJobDescription] = useState('');
  const [userCountry, setUserCountry] = useState('');
  const [jobLocation, setJobLocation] = useState('');
  const [isImportingJob, setIsImportingJob] = useState(false);
  const [importedJobSnapshot, setImportedJobSnapshot] = useState(null);

  // Enhanced customization options
  const [industry, setIndustry] = useState('default');
  const [careerLevel, setCareerLevel] = useState('mid');
  const [tone, setTone] = useState('professional');
  const [length, setLength] = useState('standard');
  const [focusSkills, setFocusSkills] = useState('');

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
  const formContainerRef = useRef(null);
  const introBoxRef = useRef(null);

  // Track page visibility and keep the page alive during generation
  const [isPageVisible, setIsPageVisible] = useState(true);
  const keepAliveIntervalRef = useRef(null);
  const keepAliveWorkerRef = useRef(null);

  // Create refs to store the current progress and step
  const currentProgressRef = useRef(0);
  const currentStepRef = useRef(null);

  // Register service worker on component mount
  useEffect(() => {
    // Register the service worker with activateImmediately=true since we're on the AI generator page
    registerServiceWorker(true).then(success => {
      if (!success) {
        // Using fallback mode for resume generation
      }
    });

    // Add a special class to the document body to prevent refresh
    document.body.classList.add('resume-generation-in-progress');

    // Cleanup function to remove the class when component unmounts
    return () => {
      document.body.classList.remove('resume-generation-in-progress');
    };
  }, []);

  // Update the refs whenever progress or step changes and save to IndexedDB
  useEffect(() => {
    currentProgressRef.current = progress;

    // Save to IndexedDB to persist across page refreshes
    if (progress > 0 && isGenerating) {
      // Store in both localStorage (as backup) and IndexedDB
      localStorage.setItem('resume_generation_progress', progress.toString());

      // Store in IndexedDB
      storeGenerationState({
        progress,
        step: currentStepRef.current,
        isGenerating: true
      }).catch(error => {
        console.error('Failed to store generation state in IndexedDB:', error);
      });

      // Also notify the service worker
      sendMessageToServiceWorker({
        type: 'GENERATION_PROGRESS',
        progress: {
          value: progress,
          step: currentStepRef.current
        }
      });
    } else if (progress === 0 || progress === 100) {
      // Clear the state when generation is complete or reset
      localStorage.removeItem('resume_generation_progress');
      clearGenerationState().catch(error => {
        console.error('Failed to clear generation state from IndexedDB:', error);
      });
    }
  }, [progress, isGenerating]);

  useEffect(() => {
    currentStepRef.current = currentStep;

    // Save to localStorage and IndexedDB when step changes
    if (currentStep && isGenerating) {
      localStorage.setItem('resume_generation_step', currentStep);

      // Update the state in IndexedDB
      storeGenerationState({
        progress: currentProgressRef.current,
        step: currentStep,
        isGenerating: true
      }).catch(error => {
        console.error('Failed to store generation state in IndexedDB:', error);
      });
    } else if (!currentStep) {
      localStorage.removeItem('resume_generation_step');
    }
  }, [currentStep, isGenerating]);

  // Listen for service worker messages
  useEffect(() => {
    const cleanup = listenForServiceWorkerMessages(message => {
      if (message && message.type === 'GENERATION_PROGRESS_UPDATE') {
        // Update the UI with the progress from the service worker
        if (message.progress && message.progress.value) {
          setProgress(message.progress.value);
        }

        if (message.progress && message.progress.step) {
          setCurrentStep(message.progress.step);
        }
      }
    });

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
  }, [isGenerating]);

  // Restore progress and step from IndexedDB on component mount
  useEffect(() => {
    const restoreState = async () => {
      try {
        // Try to get the state from IndexedDB
        const state = await getGenerationState();

        if (state && state.isGenerating && state.progress > 0 && state.progress < 100) {
          // Restore the generation state
          setIsGenerating(true);
          setProgress(state.progress);

          if (state.step) {
            setCurrentStep(state.step);
          }
        } else {
          // Fallback to localStorage if IndexedDB doesn't have the state
          const isGenerationInProgress = sessionStorage.getItem('resume_generation_in_progress') === 'true';
          const savedProgress = localStorage.getItem('resume_generation_progress');
          const savedStep = localStorage.getItem('resume_generation_step');

          if ((isGenerationInProgress || window.location.hash.includes('resume-generation')) && savedProgress && savedStep) {
            const parsedProgress = parseFloat(savedProgress);
            if (!isNaN(parsedProgress) && parsedProgress > 0 && parsedProgress < 100) {
              // Restore the generation state
              setIsGenerating(true);
              setProgress(parsedProgress);
              setCurrentStep(savedStep);
            }
          }
        }
      } catch (error) {
        console.error('Failed to restore generation state:', error);
      }
    };

    restoreState();
  }, []);

  // Handle page visibility changes with a more robust approach
  useEffect(() => {
    // Create a flag to track if the component is mounted
    let isMounted = true;

    // Create a flag to track if we're handling a visibility change
    let isHandlingVisibilityChange = false; // Unused variable

    // Function to restore state from IndexedDB
    const restoreStateFromIndexedDB = async () => {
      if (isHandlingVisibilityChange || !isMounted) return;

      try {
        isHandlingVisibilityChange = true;

        // Get the state from IndexedDB
        const state = await getGenerationState();

        if (state && state.isGenerating && state.progress > 0 && state.progress < 100 && isMounted) {
          // Use requestAnimationFrame to ensure we're in the right animation frame
          window.requestAnimationFrame(() => {
            if (isMounted) {
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

        // 3. Prevent the default behavior of the visibilitychange event
        // This is a hack, but it might help in some browsers
        window.addEventListener('beforeunload', (e) => {
          if (isGenerating) {
            e.preventDefault();
            e.returnValue = '';
            return '';
          }
          return undefined;
        }, { once: true });
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
  }, [isGenerating]);

  // Keep the page alive when it's hidden but generation is in progress
  useEffect(() => {
    if (isGenerating && !isPageVisible) {
      // Create a keep-alive mechanism when the page is hidden but generation is running
      // This prevents browsers from throttling the background tab
      if (!keepAliveIntervalRef.current) {
        // Use a Web Worker if available to keep the process running in the background
        try {
          // Create a simple worker that just pings back and forth
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
          const workerUrl = URL.createObjectURL(blob);
          const worker = new Worker(workerUrl);

          // Store the worker reference
          keepAliveWorkerRef.current = worker;

          // Set up communication
          worker.onmessage = (e) => {
            if (e.data === 'keepAlive' || e.data === 'pong') {
              // This keeps the main thread active
              if (isGenerating) {
                worker.postMessage('ping');
              } else {
                // If generation is done, terminate the worker
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
                keepAliveWorkerRef.current = null;
              }
            }
          };

          // Start the communication
          worker.postMessage('ping');
        } catch (error) {
          console.error('Failed to create Web Worker, falling back to interval:', error);

          // Fallback to setInterval if Web Workers aren't available
          keepAliveIntervalRef.current = setInterval(() => {
            // Minimal activity to prevent browser throttling
          }, 1000);
        }
      }
    } else if (keepAliveIntervalRef.current) {
      // Clear the interval when the page becomes visible again or generation stops
      clearInterval(keepAliveIntervalRef.current);
      keepAliveIntervalRef.current = null;

      // Also terminate any worker if it exists
      if (keepAliveWorkerRef.current) {
        keepAliveWorkerRef.current.terminate();
        keepAliveWorkerRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
      }

      if (keepAliveWorkerRef.current) {
        keepAliveWorkerRef.current.terminate();
        keepAliveWorkerRef.current = null;
      }
    };
  }, [isGenerating, isPageVisible]);

  // Add beforeunload event listener to warn before closing the page
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Only show warning if generation is in progress
      if (isGenerating) {
        // Make sure we've saved the latest progress to localStorage before unloading
        if (currentProgressRef.current > 0) {
          localStorage.setItem('resume_generation_progress', currentProgressRef.current.toString());
        }
        if (currentStepRef.current) {
          localStorage.setItem('resume_generation_step', currentStepRef.current);
        }

        e.preventDefault();
        e.returnValue = 'Resume generation is in progress. If you leave now, your progress will be lost. Are you sure you want to leave?';
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
  }, [isGenerating]);

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
    setIsImportingJob(true);

    try {
      const response = await getRecentBrowserAgentJobPosting();
      const jobPosting = response?.jobPosting || response?.lastJobSnapshot || null;

      if (!jobPosting?.description && !jobPosting?.title) {
        throw new Error('No recent job posting found. Open a job page in another tab, let it load, then try again.');
      }

      const importedDescription = buildImportedJobDescription(jobPosting);
      const parsedImportedJob = parseJobDescription(importedDescription);

      setJobDescription(importedDescription);
      setImportedJobSnapshot(jobPosting);

      if (jobPosting.location) {
        setJobLocation(jobPosting.location);
      }

      if (['entry', 'mid', 'senior', 'executive'].includes(parsedImportedJob?.experience?.level)) {
        setCareerLevel(parsedImportedJob.experience.level);
      }

      toast.success(`Imported ${jobPosting.title || 'job posting'} from browser extension`);
    } catch (error) {
      toast.error(error.message || 'Could not import a job posting from the browser extension.');
    } finally {
      setIsImportingJob(false);
    }
  };

  // handleSaveResume is no longer directly called by the "View" button,
  // but its logic will be integrated into handleGenerateResume for auto-saving.
  // We can keep it if there are other places it might be used, or remove/refactor if not.
  // For now, let's assume its core logic moves to handleGenerateResume.
  // const handleSaveResume = async (...) => { ... }; // Original handleSaveResume logic might be removed or refactored

  const handleGenerateResume = async () => {
    // Job description is required
    if (!jobDescription) {
      toast('Please provide a job description to generate a resume');
      return;
    }

    // Check if user can use AI generation
    const access = await getAIGenerationAccess();
    if (!access.allowed) {
      showAIGenerationAccessMessage(access.reason);
      return;
    }

    try {
      // Set a flag in sessionStorage to indicate we're in the middle of generation
      // This helps prevent React StrictMode from causing double renders
      sessionStorage.setItem('resume_generation_in_progress', 'true');

      // Add a special class to the document body to prevent refresh
      document.body.classList.add('resume-generation-in-progress');
      document.documentElement.classList.add('resume-generation-active');

      // Store the initial state in IndexedDB
      await storeGenerationState({
        progress: 10,
        step: 'analyzing',
        isGenerating: true,
        jobDescription,
        industry,
        careerLevel,
        tone,
        length
      });

      // Notify the service worker that generation has started
      sendMessageToServiceWorker({
        type: 'GENERATION_PROGRESS',
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

      // Parse the job description
      try {
        // First use our local parser to extract structured information
        // const parsedData = parseJobDescription(jobDescription); // Result not used as setParsedJobData was removed
        parseJobDescription(jobDescription); // Call for side effects if any, or remove if none

        // Update progress
        setProgress(15);
      } catch (error) {
        console.error('Error parsing job description:', error);
        // Continue even if parsing fails
      }

      // Extract keywords from job description
      const extractingStep = 'extracting_keywords';
      setCurrentStep(extractingStep);

      const extractingProgress = 20;
      setProgress(extractingProgress);
      try {
        const extractedKeywords = await enhancedKeywordExtraction(jobDescription, industry);
        setKeywordAnalysis(extractedKeywords);

        const keywordProgress = 30;
        setProgress(keywordProgress);
      } catch (error) {
        console.error('Error extracting keywords:', error);
        // Continue even if keyword extraction fails
      }

      // Load the user's profile data
      const preparingStep = 'preparing_profile';
      setCurrentStep(preparingStep);

      const preparingProgress = 40;
      setProgress(preparingProgress);

      // Initialize a profile with the country
      let userProfile = {
        personal: {
          location: userCountry || ''
        }
      };

      // Try to load the user's saved profile data from Supabase
      try {
        const profileData = await getUserProfile();

        if (profileData) {

          // Use the user's personal information if available
          if (profileData.personal) {
            userProfile.personal = {
              ...profileData.personal,
              location: userCountry || profileData.personal.location || '' // Use provided country if available
            };
          }

          // Use the user's education information if available
          if (profileData.education && profileData.education.length > 0) {
            userProfile.education = profileData.education;
          }
        }
      } catch {
        // Unable to load profile data, AI will generate everything
      }

      // Create options object for enhanced generation
      const options = {
        industry,
        careerLevel,
        tone,
        length,
        focusSkills
      };

      // Generate the resume content
      const generatingStep = 'generating_resume';
      setCurrentStep(generatingStep);

      const generatingProgress = 60;
      setProgress(generatingProgress);

      // Use the parsed job data if available
      // const jobDataForGeneration = parsedJobData || {}; // Unused variable
      const generatedResume = await generateEnhancedResume(userProfile, jobDescription, options, keywordAnalysis);

      // Map the AI-generated data to the format expected by the editor components
      const formattingStep = 'formatting_resume';
      setCurrentStep(formattingStep);

      const formattingProgress = 75;
      setProgress(formattingProgress);
      const mappedResume = mapResumeData(generatedResume);

      // Use the mapped resume directly without fallbacks
      const optimizedResume = mappedResume;

      // Skip quality check and go straight to finalizing
      const finalizingProgress = 85;
      setProgress(finalizingProgress);

      // Update the current resume with the generated content
      const finalizingStep = 'finalizing';
      setCurrentStep(finalizingStep);

      // Update progress to 95%
      setProgress(95);

      // Do NOT call updateCurrentResume here if this component is used within ResumeBuilder for an existing resume.
      // The 'optimizedResume' content should only be associated with the NEW resume ID created by 'createResume'.
      // updateCurrentResume(optimizedResume); // This was causing existing resume to be overwritten with AI content.

      const completeProgress = 100;
      setProgress(completeProgress);

      // No quality results to show

      // Usage is reserved by the Edge Function before provider calls.
      await refreshSubscriptionStatus();

      // --- Automatic Save Logic ---
      setIsSaving(true); // Indicate saving process starts
      let newSavedResumeId = null;
      try {
        const title = deriveResumeTitle(optimizedResume, jobDescription);
        if (!optimizedResume) {
          throw new Error('No resume data from AI to auto-save');
        }
        const resumeDataToSave = {
          ...optimizedResume,
          title: title,
          description: `Generated for: ${jobDescription.substring(0, 100)}...`,
          personalInfo: optimizedResume.personalInfo || {},
          workExperience: optimizedResume.workExperience || [],
          education: optimizedResume.education || [],
          skills: optimizedResume.skills || [],
          certifications: optimizedResume.certifications || [],
          projects: optimizedResume.projects || [],
          additionalSections: optimizedResume.additionalSections || []
        };
        const newResume = await createResume(resumeDataToSave);
        if (!newResume || !newResume.id) {
          throw new Error('Auto-save failed - no ID returned from createResume');
        }
        newSavedResumeId = newResume.id;
        setSavedResumeId(newSavedResumeId);
        setGeneratedResumeDataForNav(newResume); // Store the full new resume data
        toast.success('AI resume generated and saved automatically!');
        setResumeGenerated(true); // Show the "View Generated Resume" button
      } catch (saveError) {
        console.error('Error auto-saving resume:', saveError);
        toast.error(`Failed to automatically save resume: ${saveError.message || 'Unknown error'}`);
        // Decide if we still setResumeGenerated(true) to allow manual save or show error.
        // For now, if auto-save fails, we might not want to show the "View" button for a non-existent saved resume.
        // Or, we could allow viewing the unsaved context version and prompt to save in builder.
        // Let's prevent viewing if auto-save fails for simplicity now.
        setResumeGenerated(false);
      } finally {
        setIsSaving(false); // Indicate saving process ends
      }
      // --- End Automatic Save Logic ---

      // Scroll will be handled by useEffect based on isGenerating and resumeGenerated states

    } catch (error) { // This is the catch for handleGenerateResume
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
      setIsGenerating(false);
      setCurrentStep(null);

      // Clear all generation flags and state
      sessionStorage.removeItem('resume_generation_in_progress');
      localStorage.removeItem('resume_generation_progress');
      localStorage.removeItem('resume_generation_step');

      // Clear the IndexedDB state
      clearGenerationState().catch(error => {
        console.error('Failed to clear generation state from IndexedDB:', error);
      });

      // Remove the special classes
      document.body.classList.remove('resume-generation-in-progress');
      document.documentElement.classList.remove('resume-generation-active');

      // Notify the service worker that generation has completed
      sendMessageToServiceWorker({
        type: 'GENERATION_PROGRESS',
        progress: {
          value: 100,
          step: 'completed'
        }
      });
    }
  };

  // Effect to scroll to form top when generation finishes successfully
  useEffect(() => {
    if (!isGenerating && resumeGenerated && introBoxRef.current) {
      // Generation just finished, and resume was successfully generated and saved
      introBoxRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  }, [isGenerating, resumeGenerated]); // Dependencies

  // If subscription status is still loading, show a loading state
  if (subscriptionLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-slate-300">Loading...</p>
      </div>
    );
  }

  // If user doesn't have premium, show upgrade message
  if (!isPremium) {
    return (
      <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm dark:border-blue-500/20 dark:bg-slate-800">
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-5 dark:border-blue-500/20 dark:bg-blue-500/10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
            Premium Tool
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-blue-900 dark:text-blue-100">
            Generate a full AI draft before you start editing line by line.
          </h3>
          <p className="mt-2 max-w-3xl text-sm text-blue-800 dark:text-blue-100/90">
            This generator turns a job description into a complete resume draft, then saves it back into your library so you can refine it instead of building from scratch.
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
              <Link to="/pricing">
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  Upgrade to Premium
                </Button>
              </Link>
              <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-6 mb-8" ref={introBoxRef}>
        <h3 className="text-xl font-semibold text-blue-800 dark:text-blue-200 mb-3">AI-Powered ATS Resume Blueprint</h3>
        <p className="text-blue-700 dark:text-blue-100/90 mb-4">
          Unleash the power of AI to construct a complete, ATS-beating resume draft. Our intelligent generator crafts fictional yet relevant work experiences and skills, all meticulously aligned with your target job description, giving you a powerful head start.
        </p>
        <div className="mt-3 text-sm text-blue-700 dark:text-blue-100/90">
          <p className="font-medium">Built for ATS Success:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Flawless ATS Parsing: Clean, single-column layout ensures easy readability by all systems.</li>
            <li>Strategic Keyword Integration: Intelligently incorporates vital terms from the job description.</li>
            <li>Standardized Structure: Uses universally recognized section headings for optimal ATS compatibility.</li>
            <li>Impactful Content: Formatted with action verbs and quantifiable achievements where appropriate.</li>
            <li>Dual Optimization: Designed to impress both ATS algorithms and human recruiters.</li>
          </ul>
        </div>

        <div className="mt-4 p-3 bg-green-100 dark:bg-green-500/10 rounded-md text-green-800 dark:text-green-200 text-sm">
          <p className="font-medium">Your AI-Crafted Foundation:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Fully AI-Generated Content: Experience, skills, and summaries are all crafted by our advanced AI.</li>
            <li>Original & Unique: No pre-filled templates; every resume is generated fresh based on your inputs.</li>
            <li>Job-Specific Tailoring: AI customizes content to closely match the provided job description.</li>
            <li>Preserves Your Core Info: Your saved location and education details (if provided) are seamlessly integrated.</li>
          </ul>
        </div>
      </div>

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
                    {parsedJobPreview.experience.level}
                    {parsedJobPreview.experience.years !== null ? ` (${parsedJobPreview.experience.years}+ years)` : ''}
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
                <Tooltip content="Indicate your current career stage (e.g., Entry-Level, Mid-Career, Senior). This helps the AI adjust the complexity and focus of the generated content.">
                  <InformationCircleIcon className="h-4 w-4 ml-1 text-gray-500 dark:text-slate-500" />
                </Tooltip>
              </div>
              <Select
                id="careerLevel"
                value={careerLevel}
                onChange={(e) => setCareerLevel(e.target.value)}
                options={careerLevelOptions}
              />
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
                disabled={isGenerating || isSaving || remainingGenerations === 0}
                className="px-8 py-3 text-lg bg-blue-600 hover:bg-blue-700 w-full md:w-auto"
              >
                {isGenerating ? getStepMessage() : 'Craft My AI Resume Draft'}
              </Button>

              {resumeGenerated && (
                <Button
                  onClick={() => {
                    if (savedResumeId && generatedResumeDataForNav) {
                      navigateSafely(`/builder/${savedResumeId}`, { state: { newlyCreatedResume: generatedResumeDataForNav } });
                    } else {
                      // This case should ideally not happen if auto-save was successful
                      // and resumeGenerated is true.
                      toast.error("Could not find saved resume ID. Please try saving from the editor if needed.");
                      // Optionally navigate to a general builder page or dashboard
                      // navigateSafely('/builder');
                    }
                  }}
                  disabled={!savedResumeId || isGenerating} // Disable if no saved ID or still generating
                  className="px-8 py-3 text-lg bg-green-600 hover:bg-green-700 w-full md:w-auto"
                >
                  View Generated Resume
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
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-3">AI-Powered ATS Insights for Your Target Job</h3>

          {keywordAnalysis.keywords && keywordAnalysis.keywords.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">Crucial Keywords Identified:</h4>
              <div className="flex flex-wrap gap-2">
                {keywordAnalysis.keywords.slice(0, 15).map((keyword, index) => (
                  <span key={index} className="bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded">
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
                  <span key={index} className="bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">
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
                  <span key={index} className="bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-200 text-xs px-2 py-1 rounded">
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
              <h4 className="font-medium text-green-700 dark:text-green-300 mb-2">General ATS Best Practices Applied:</h4>
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
              <li>Mirror keywords from the job posting.</li>
              <li>Employ standard headings (e.g., "Work Experience," "Skills").</li>
              <li>Lead bullet points with strong action verbs.</li>
              <li>Quantify your achievements with numbers/data.</li>
              <li>Choose ATS-safe fonts (Arial, Calibri, etc.).</li>
              <li>Submit as .docx or .pdf (check posting instructions).</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-slate-200 mb-2">Don't:</h4>
            <ul className="list-disc list-inside text-sm text-gray-600 dark:text-slate-300 space-y-1">
              <li>Avoid tables, multiple columns, or images.</li>
              <li>Keep crucial details out of headers/footers.</li>
              <li>Steer clear of unusual fonts or special symbols.</li>
              <li>Don't include a photo (unless industry standard).</li>
              <li>Refrain from overly creative section titles.</li>
              <li>Don't use uncommon file formats.</li>
              <li>Proofread meticulously for errors.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-slate-400 mt-4">
        <p>Important: The AI generates a fictional resume draft to demonstrate ideal ATS structure and keyword integration. This content is a placeholder. Always replace it with your genuine experiences, skills, and achievements to create an authentic and effective resume.</p>
      </div>
    </div>
  );
};

export default EnhancedAIGenerator;
