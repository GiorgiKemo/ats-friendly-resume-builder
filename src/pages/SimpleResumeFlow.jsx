import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTailoringDraft } from '../context/TailoringDraftContext';
import { useResume } from '../context/ResumeContext';
import { useSubscription } from '../context/SubscriptionContext';
import { generateEnhancedResume } from '../services/enhancedOpenaiService';
import { getUserProfile } from '../services/userProfileService';
import { hasUsableProfileData } from '../utils/resumeGenerationInput.js';
import { mapResumeData } from '../utils/resumeDataMapper';
import { isResumeTailoringReview } from '../utils/resumeTailoringReview.js';
import ResumeTailoringReview from '../components/resume/ResumeTailoringReview';
import { parseJobDescription, formatJobExperience } from '../utils/jobDescriptionParser';
import { getCareerLevelOptions } from '../utils/promptTemplates';
import { deriveResumeTitle, extractCompanyFromJobDescription } from '../utils/resumeTitle.js';
import { createApplication } from '../services/applicationService';
import { buildImportedJobDescription, getRecentBrowserAgentJobPosting } from '../services/browserAgentService';
import { exportFormatOptions, getResumeExportReadiness } from '../utils/resumeExportReadiness';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

import ATSFriendlyTemplate from '../components/templates/ATSFriendlyTemplate';
import BasicTemplate from '../components/templates/BasicTemplate';
import MinimalistTemplate from '../components/templates/MinimalistTemplate';
import ModernTemplate from '../components/templates/ModernTemplate';
import TraditionalTemplate from '../components/templates/TraditionalTemplate';

const STEPS = [
  { number: 1, label: 'Personal Info' },
  { number: 2, label: 'Job Description' },
  { number: 3, label: 'Your Resume' },
];

const TEMPLATES = [
  { id: 'ats-friendly', label: 'ATS Friendly', Component: ATSFriendlyTemplate },
  { id: 'basic', label: 'Basic', Component: BasicTemplate },
  { id: 'minimalist', label: 'Minimalist', Component: MinimalistTemplate },
  { id: 'modern', label: 'Modern', Component: ModernTemplate },
  { id: 'traditional', label: 'Traditional', Component: TraditionalTemplate },
];

const CAREER_LEVELS = getCareerLevelOptions();

const RESUME_LENGTHS = [
  { value: 'concise', label: 'Concise' },
  { value: 'standard', label: 'Standard' },
  { value: 'comprehensive', label: 'Comprehensive' },
];

const PROGRESS_MESSAGES = [
  'Analyzing job description...',
  'Identifying key requirements...',
  'Matching your skills to the role...',
  'Crafting your professional summary...',
  'Building work experience section...',
  'Optimizing for ATS compatibility...',
  'Finalizing your resume...',
];

const slideVariants = {
  enter: (direction) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

const SimpleResumeFlow = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || null;
  const tailoringDrafts = useTailoringDraft();
  const mountedRef = useRef(true);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const activeUserEmailRef = useRef(user?.email || '');
  activeUserEmailRef.current = user?.email || '';
  const generationRequestRef = useRef(null);
  const saveRequestRef = useRef(null);
  const importRequestRef = useRef(null);
  const exportRequestRef = useRef(null);
  const editedFieldsRef = useRef(new Set());
  const initializedUserIdRef = useRef(undefined);
  const savedResumeRef = useRef(null);
  const trackedApplicationRef = useRef(null);
  const { createResume } = useResume();
  const {
    isPremium,
    loading: subscriptionLoading,
    getAIGenerationAccess,
    refreshSubscriptionStatus,
  } = useSubscription();

  const resumeRef = useRef(null);

  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(0);

  // Step 1: Personal info
  const [personalInfo, setPersonalInfo] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
  });
  const [personalErrors, setPersonalErrors] = useState({});
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [sourceProfile, setSourceProfile] = useState(null);
  const [profileOwnerId, setProfileOwnerId] = useState(null);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const sourceReady = profileLoaded && profileOwnerId === userId && hasUsableProfileData(sourceProfile);

  // Step 2: Job description
  const [jobDescription, setJobDescription] = useState('');
  const [careerLevel, setCareerLevel] = useState('not-specified');
  const [resumeLength, setResumeLength] = useState('standard');
  const [isImportingJob, setIsImportingJob] = useState(false);
  const [importedJobSnapshot, setImportedJobSnapshot] = useState(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const progressTimerRef = useRef(null);

  // Step 3: Resume result
  const [resumeData, setResumeData] = useState(null);
  const [pendingReview, setPendingReview] = useState(null);
  const [generatedJobDescription, setGeneratedJobDescription] = useState('');
  const [isTracked, setIsTracked] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('ats-friendly');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Each account owns its own source facts and in-flight work.
  useEffect(() => {
    let active = true;
    const accountChanged = initializedUserIdRef.current !== userId;
    initializedUserIdRef.current = userId;
    if (accountChanged) {
      generationRequestRef.current = null;
      saveRequestRef.current = null;
      importRequestRef.current = null;
      exportRequestRef.current = null;
      savedResumeRef.current = null;
      trackedApplicationRef.current = null;
      editedFieldsRef.current = new Set();
      setPersonalInfo({ fullName: '', email: activeUserEmailRef.current, phone: '', location: '', linkedin: '' });
      setPersonalErrors({});
      setResumeData(null);
      setPendingReview(null);
      setGeneratedJobDescription('');
      setJobDescription('');
      setImportedJobSnapshot(null);
      setIsGenerating(false);
      setIsSaving(false);
      setIsImportingJob(false);
      setIsExporting(false);
      setIsTracked(false);
      setCurrentStep(1);
    }
    setProfileLoaded(false);
    setProfileOwnerId(null);
    setSourceProfile(null);
    setProfileLoadError(false);
    if (!userId) return () => { active = false; };
    const loadProfile = async () => {
      try {
        const profile = await getUserProfile(userId);
        if (!active || activeUserIdRef.current !== userId) return;
        setSourceProfile(profile);
        setProfileOwnerId(userId);
        if (profile?.personal) {
          const p = profile.personal;
          const values = { fullName: p.fullName || p.full_name, email: p.email, phone: p.phone, location: p.location || p.city, linkedin: p.linkedin || p.linkedinUrl || p.professionalLinks?.linkedin };
          setPersonalInfo((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(values)
            .filter(([field, value]) => !editedFieldsRef.current.has(field) && typeof value === 'string' && value)) }));
        }
      } catch {
        if (active && activeUserIdRef.current === userId) setProfileLoadError(true);
      } finally {
        if (active && activeUserIdRef.current === userId) setProfileLoaded(true);
      }
    };
    void loadProfile();
    return () => {
      active = false;
      generationRequestRef.current = null;
      saveRequestRef.current = null;
      importRequestRef.current = null;
      exportRequestRef.current = null;
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    };
  }, [userId, profileLoadAttempt]);

  useEffect(() => {
    const restore = () => {
      const draft = tailoringDrafts.read('quick', userId);
      setPendingReview(draft?.stage === 'review' ? draft : null);
      setIsGenerating(draft?.stage === 'generating');
      setIsSaving(Boolean(draft?.saving));
      if (draft?.applicationId) {
        trackedApplicationRef.current = draft.applicationId;
        setIsTracked(true);
      }
      if (!draft) return;
      setJobDescription(draft.jobDescription);
      if (draft.stage === 'review' || draft.stage === 'resolved') {
        setCurrentStep(3);
        setGeneratedJobDescription(draft.jobDescription);
      } else if (draft.stage === 'generating') setCurrentStep(2);
      if (draft.stage === 'resolved') {
        setResumeData(draft.resume);
        savedResumeRef.current = draft.savedResume || null;
        setSelectedTemplate(draft.resume.selectedTemplate || 'ats-friendly');
      }
    };
    restore();
    return tailoringDrafts.subscribe(restore);
  }, [tailoringDrafts, userId]);

  // Cleanup progress timer
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  // Validation
  const validatePersonalInfo = useCallback(() => {
    const errors = {};

    if (!personalInfo.fullName.trim()) {
      errors.fullName = 'Full name is required';
    }
    if (!personalInfo.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalInfo.email.trim())) {
      errors.email = 'Please enter a valid email';
    }

    setPersonalErrors(errors);
    return Object.keys(errors).length === 0;
  }, [personalInfo]);

  // Navigation
  const goToStep = useCallback(
    (step) => {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    },
    [currentStep]
  );

  const handleNext = useCallback(() => {
    if (currentStep === 1) {
      if (!validatePersonalInfo()) return;
      goToStep(2);
    }
  }, [currentStep, validatePersonalInfo, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, goToStep]);

  // Start progress messages cycling
  const startProgressMessages = useCallback(() => {
    setProgressIndex(0);
    progressTimerRef.current = setInterval(() => {
      setProgressIndex((prev) => {
        if (prev >= PROGRESS_MESSAGES.length - 1) return prev;
        return prev + 1;
      });
    }, 3000);
  }, []);

  const stopProgressMessages = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const parsedJobPreview = jobDescription.trim() ? parseJobDescription(jobDescription) : null;

  const handleImportJobPosting = useCallback(async () => {
    if (importRequestRef.current || !userId) return;
    const request = { userId };
    importRequestRef.current = request;
    const isCurrent = () => importRequestRef.current === request && activeUserIdRef.current === userId;
    setIsImportingJob(true);

    try {
      const response = await getRecentBrowserAgentJobPosting();
      if (!isCurrent()) return;
      const jobPosting = response?.jobPosting || response?.lastJobSnapshot || null;

      if (!jobPosting?.description && !jobPosting?.title) {
        throw new Error('No recent job posting found. Open a job page in another tab, let it load, then try again.');
      }

      const importedDescription = buildImportedJobDescription(jobPosting);

      setJobDescription(importedDescription);
      setImportedJobSnapshot(jobPosting);

      toast.success(`Imported ${jobPosting.title || 'job posting'} from browser extension`);
    } catch (error) {
      if (isCurrent()) toast.error(error.message || 'Could not import a job posting from the browser extension.');
    } finally {
      if (isCurrent()) { importRequestRef.current = null; setIsImportingJob(false); }
    }
  }, [userId]);

  const showAIGenerationAccessMessage = useCallback((reason) => {
    if (reason === 'upgrade_required') {
      toast.error('Quick Resume is a Premium feature. Upgrade to generate an AI resume.');
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
  }, []);

  // A generation result is a proposal packet, never an immediately exportable resume.
  const handleGenerate = useCallback(async () => {
    if (generationRequestRef.current || saveRequestRef.current || tailoringDrafts.read('quick', userId)) return;
    if (!isPremium) { toast.error('Premium is required to start a new AI generation.'); return; }
    if (!jobDescription.trim()) { toast.error('Please paste a job description'); return; }
    if (!user) { toast.error('Please sign in to generate a resume'); navigate('/signin'); return; }
    if (!sourceReady) {
      toast.error(profileLoaded ? 'Add your real work, education, skills or projects to your profile before generating.' : 'Your career profile is still loading. Please try again shortly.');
      return;
    }
    if (!validatePersonalInfo()) { goToStep(1); return; }
    const request = { userId, runId: crypto.randomUUID() };
    generationRequestRef.current = request;
    const targetDescription = jobDescription.trim();
    tailoringDrafts.write('quick', userId, { ...request, jobDescription: targetDescription, stage: 'generating' });
    const isCurrent = () => activeUserIdRef.current === userId && tailoringDrafts.read('quick', userId)?.runId === request.runId;
    const assertCurrentRequest = () => {
      if (!isCurrent()) throw new Error('Your account or generation changed. Start generation again.');
    };
    setIsGenerating(true);
    startProgressMessages();
    try {
      const access = await getAIGenerationAccess();
      assertCurrentRequest();
      if (!access.allowed) { if (mountedRef.current) showAIGenerationAccessMessage(access.reason); return; }
      const userProfile = {
        ...sourceProfile,
        personal: {
          ...(sourceProfile.personal || {}),
          fullName: personalInfo.fullName.trim(),
          email: personalInfo.email.trim(),
          phone: personalInfo.phone.trim(),
          location: personalInfo.location.trim(),
          linkedin: personalInfo.linkedin.trim(),
          professionalLinks: { ...(sourceProfile.personal?.professionalLinks || {}), linkedin: personalInfo.linkedin.trim() },
        },
      };
      delete userProfile.personal.applicationProfile;
      delete userProfile.applicationProfile;
      const options = {
        careerLevel,
        length: resumeLength,
        assertCurrentRequest,
        sourceInfo: { ownerId: userId, runId: request.runId, profileId: sourceProfile.id, profileRevision: sourceProfile.revision },
      };
      const result = await generateEnhancedResume(userProfile, targetDescription, options);
      assertCurrentRequest();
      if (!isResumeTailoringReview(result)) throw new Error('The generation response is missing its source review. Please generate again.');
      tailoringDrafts.write('quick', userId, { ...request, jobDescription: targetDescription, stage: 'review', review: result, decisions: {}, selectedTemplate }, request.runId);
      void Promise.resolve().then(() => refreshSubscriptionStatus()).catch((error) => console.error('Could not refresh AI usage:', error));
      if (mountedRef.current) {
        savedResumeRef.current = null;
        trackedApplicationRef.current = null;
        setIsTracked(false);
        setResumeData(null);
        goToStep(3);
        toast.success('Suggestions are ready. Review the wording before using your resume.');
      }
    } catch (error) {
      if (!isCurrent()) return;
      tailoringDrafts.clear('quick', userId, request.runId);
      if (mountedRef.current) {
        console.error('Error generating resume:', error);
        toast.error(error.message || 'Failed to generate resume. Please try again.');
      }
    } finally {
      if (isCurrent() && tailoringDrafts.read('quick', userId)?.stage === 'generating') tailoringDrafts.clear('quick', userId, request.runId);
      if (mountedRef.current && activeUserIdRef.current === userId) {
        generationRequestRef.current = null;
        setIsGenerating(false);
        stopProgressMessages();
      }
    }
  }, [jobDescription, user, userId, tailoringDrafts, sourceReady, sourceProfile, profileLoaded, validatePersonalInfo, isPremium,
    navigate, getAIGenerationAccess, personalInfo, careerLevel, resumeLength, selectedTemplate,
    refreshSubscriptionStatus, goToStep, showAIGenerationAccessMessage, startProgressMessages, stopProgressMessages]);

  const completeReview = (session, resolvedResume) => {
    const current = tailoringDrafts.read('quick', userId);
    if (!mountedRef.current || current?.runId !== session.runId || current.stage !== 'review' || activeUserIdRef.current !== session.userId) return;
    const resume = { ...mapResumeData(resolvedResume), selectedTemplate: session.selectedTemplate, selectedFont: 'Arial' };
    tailoringDrafts.write('quick', userId, { ...current, stage: 'resolved', resume }, current.runId);
  };

  const discardReview = () => {
    if (!pendingReview) return;
    tailoringDrafts.clear('quick', userId, pendingReview.runId);
    setPendingReview(null);
    setResumeData(null);
    goToStep(2);
  };

  // Template change
  const handleTemplateChange = useCallback(
    (templateId) => {
      if (saveRequestRef.current || savedResumeRef.current || tailoringDrafts.read('quick', userId)?.saving) return;
      setSelectedTemplate(templateId);
      if (resumeData) {
        const current = tailoringDrafts.read('quick', userId);
        const resume = { ...resumeData, selectedTemplate: templateId };
        setResumeData(resume);
        if (current?.stage === 'resolved') tailoringDrafts.write('quick', userId, { ...current, resume }, current.runId);
      }
    },
    [resumeData, tailoringDrafts, userId]
  );

  // Export PDF
  const handleExportPDF = useCallback(async () => {
    if (!resumeRef.current || !resumeData || !userId || exportRequestRef.current || activeUserIdRef.current !== userId) return;
    const request = { userId };
    exportRequestRef.current = request;
    const isCurrent = () => exportRequestRef.current === request && activeUserIdRef.current === userId;
    setIsExporting(true);
    try {
      const filename = `${(resumeData.personalInfo?.fullName || 'resume').replace(/\s+/g, '_')}_Resume`;
      const { downloadResumePdf } = await import('../services/pdfService');
      if (!isCurrent()) return;
      await downloadResumePdf(resumeRef.current, resumeData, filename);
      if (isCurrent()) toast.success('PDF downloaded!');
    } catch (error) {
      if (isCurrent()) {
        console.error('PDF export error:', error);
        toast.error(error.message || 'Failed to export PDF. Please try again.');
      }
    } finally {
      if (isCurrent()) { exportRequestRef.current = null; setIsExporting(false); }
    }
  }, [resumeData, userId]);

  // Export Word
  const handleExportWord = useCallback(async () => {
    if (!resumeData || !userId || exportRequestRef.current || activeUserIdRef.current !== userId) return;
    const request = { userId };
    exportRequestRef.current = request;
    const isCurrent = () => exportRequestRef.current === request && activeUserIdRef.current === userId;
    setIsExporting(true);
    try {
      const filename = `${(resumeData.personalInfo?.fullName || 'resume').replace(/\s+/g, '_')}_Resume`;
      const { downloadResumeDocx } = await import('../services/docxService');
      if (!isCurrent()) return;
      await downloadResumeDocx(resumeData, filename);
      if (isCurrent()) toast.success('Word document downloaded!');
    } catch (error) {
      if (isCurrent()) {
        console.error('Word export error:', error);
        toast.error('Failed to export Word document. Please try again.');
      }
    } finally {
      if (isCurrent()) { exportRequestRef.current = null; setIsExporting(false); }
    }
  }, [resumeData, userId]);

  // Save & Track Application
  const handleSaveAndTrack = useCallback(async () => {
    if (!resumeData || !userId || saveRequestRef.current || trackedApplicationRef.current) return;
    const draft = tailoringDrafts.read('quick', userId);
    if (draft?.stage !== 'resolved' || draft.saving) return;
    const request = { userId, runId: draft.runId, id: crypto.randomUUID() };
    saveRequestRef.current = request;
    const isCurrent = () => activeUserIdRef.current === userId && tailoringDrafts.read('quick', userId)?.saveAttempt === request.id;
    tailoringDrafts.write('quick', userId, { ...draft, saving: true, saveAttempt: request.id }, draft.runId);
    setIsSaving(true);

    try {
      // Parse job description for company/position
      const parsed = parseJobDescription(generatedJobDescription);
      const jobTitle = parsed.title || 'Unknown Position';
      const companyName = extractCompanyFromJobDescription(generatedJobDescription) || 'Unknown Company';

      // Save the resume
      const resumeTitle = deriveResumeTitle(resumeData, generatedJobDescription);
      const savedResume = draft.savedResume || await createResume({
        ...resumeData,
        title: resumeTitle,
        description: `Generated for ${jobTitle} at ${companyName}`,
        selectedTemplate,
      });
      if (!isCurrent()) return;
      if (!savedResume?.id) throw new Error('The resume could not be saved. Please try again.');
      tailoringDrafts.write('quick', userId, { ...tailoringDrafts.read('quick', userId), savedResume }, draft.runId);
      if (mountedRef.current) savedResumeRef.current = savedResume;

      // This records a prepared job, not an application submission.
      const { data: application, error: appError } = await createApplication({
          resume_id: savedResume.id,
          company: companyName,
          position: jobTitle,
          status: 'saved',
          job_description: generatedJobDescription,
        }, userId);
      if (!isCurrent()) return;
      if (appError || !application?.id) throw appError || new Error('Tracking did not return a saved job.');
      tailoringDrafts.write('quick', userId, { ...tailoringDrafts.read('quick', userId), applicationId: application.id, saving: false }, draft.runId);
      tailoringDrafts.clear('quick', userId, draft.runId);
      if (!mountedRef.current) return;
      trackedApplicationRef.current = application.id;
      setIsTracked(true);

      toast.success(
        (t) => (
          <div className="flex flex-col gap-2">
            <span>Resume saved. The job is tracked as Saved; no application was submitted.</span>
            <div className="flex gap-2">
              <button
                className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-300 underline"
                onClick={() => {
                  toast.dismiss(t.id);
                  navigate('/applications');
                }}
              >
                View Applications
              </button>
              <button
                className="text-sm text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:text-slate-300"
                onClick={() => toast.dismiss(t.id)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ),
        { duration: 6000 }
      );
    } catch (error) {
      if (!isCurrent()) return;
      const current = tailoringDrafts.read('quick', userId);
      tailoringDrafts.write('quick', userId, { ...current, saving: false }, draft.runId);
      if (!mountedRef.current) return;
      console.error('Error saving resume:', error);
      toast.error(current.savedResume
        ? 'Your resume was saved, but tracking failed. Click Save & Track again to retry tracking without saving another resume.'
        : error.message || 'Failed to save resume. Please try again.');
    } finally {
      if (mountedRef.current && saveRequestRef.current === request && activeUserIdRef.current === userId) { saveRequestRef.current = null; setIsSaving(false); }
    }
  }, [resumeData, userId, generatedJobDescription, createResume, selectedTemplate, navigate, tailoringDrafts]);

  // Start Over
  const handleStartOver = useCallback(() => {
    if (saveRequestRef.current || generationRequestRef.current) return;
    const draft = tailoringDrafts.read('quick', userId);
    if (draft?.stage === 'review' || draft?.saving) return;
    if (draft) tailoringDrafts.clear('quick', userId, draft.runId);
    savedResumeRef.current = null;
    trackedApplicationRef.current = null;
    setIsTracked(false);
    setResumeData(null);
    setJobDescription('');
    setCareerLevel('not-specified');
    setResumeLength('standard');
    setSelectedTemplate('ats-friendly');
    goToStep(1);
  }, [goToStep, tailoringDrafts, userId]);

  // Update a personal info field
  const updateField = useCallback((field, value) => {
    editedFieldsRef.current.add(field);
    setPersonalInfo((prev) => ({ ...prev, [field]: value }));
    setPersonalErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  // Get the active template component
  const ActiveTemplate = TEMPLATES.find((t) => t.id === selectedTemplate)?.Component || BasicTemplate;
  const exportReadiness = getResumeExportReadiness(resumeData || {});

  const hasExistingWork = Boolean(tailoringDrafts.read('quick', userId) || resumeData);
  if ((subscriptionLoading && !hasExistingWork) || (profileOwnerId && profileOwnerId !== userId)) {
    return (
      <div className="app-page bg-gray-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-16">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-10 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-slate-300">Loading subscription status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isPremium && !hasExistingWork) {
    return (
      <div className="app-page bg-gray-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-8 sm:p-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 mb-5">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 8.25v6.75m-3.375-3.375h6.75" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 mb-3">Quick Resume Requires Premium</h1>
            <p className="text-base text-gray-600 dark:text-slate-300 max-w-2xl mx-auto mb-6">
              Quick Resume is an AI-powered feature. Free users should see the upgrade requirement before starting, not after filling the whole form.
            </p>
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-5 text-left max-w-2xl mx-auto mb-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-200 mb-3">What Premium Unlocks</h2>
              <ul className="space-y-2 text-sm text-blue-900 dark:text-blue-100/90">
                <li>Generate a tailored resume from a pasted job description</li>
                <li>Save the generated draft directly into your resume library</li>
                <li>Export the result as PDF or DOCX after generation</li>
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button as="link" to="/new" variant="primary" size="lg">
                Use free step-by-step editor
              </Button>
              <Button as="link" to="/pricing" variant="outline" size="lg">
                View Premium plans
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page bg-gray-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">Create Your Resume</h1>
          <p className="text-gray-500 dark:text-slate-500 mt-1 text-sm sm:text-base">Three simple steps to a professional resume</p>
        </div>

        <div className="hidden sm:block mb-8 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm dark:border-blue-500/20 dark:bg-slate-800">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">1. Bring context</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                Save your real experience, education and skills in your career profile first, then add the job description to tailor your draft.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">2. Review the draft</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                Swap templates, check the wording, and make sure the generated version still sounds like you.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">3. Export the right file</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                Follow the employer's file-format requirements and review the downloaded file before applying.
              </p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <nav aria-label="Progress" className="mb-10">
          <ol className="flex items-center justify-center gap-0">
            {STEPS.map((step, index) => {
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;

              return (
                <li key={step.number} className="flex items-center">
                  {index > 0 && (
                    <div
                      className={`w-10 sm:w-16 h-0.5 mx-1 sm:mx-2 transition-colors duration-300 ${
                        isCompleted ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-700'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-[background-color,color,box-shadow] duration-300 ${
                        isActive
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-400/20'
                          : isCompleted
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                      }`}
                      aria-current={isActive ? 'step' : undefined}
                    >
                      {isCompleted ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step.number
                      )}
                    </div>
                    <span
                      className={`mt-1.5 text-xs sm:text-sm font-medium whitespace-nowrap ${
                        isActive ? 'text-blue-600' : isCompleted ? 'text-blue-600' : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        {!sourceReady && (
          <div role={profileLoadError ? 'alert' : 'status'} className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
            {!profileLoaded ? 'Loading your saved career facts. You can edit your contact details while this loads.' : profileLoadError
              ? 'Your career profile could not be loaded. Retry before generating so your experience is not lost.'
              : 'Add real work history, education, skills or projects to your profile before generating. Contact details alone are not enough to tailor a truthful resume.'}
            <div className="mt-2 flex gap-4">
              <Link to="/profile" className="font-medium underline">Edit career profile</Link>
              {profileLoadError && <button type="button" className="font-medium underline" onClick={() => setProfileLoadAttempt((attempt) => attempt + 1)}>Retry profile load</button>}
            </div>
          </div>
        )}
        {/* Step Content */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            {/* Step 1: Personal Info */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 sm:p-8">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">Personal Information</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-500 mb-6">Tell us about yourself. Only name and email are required.</p>

                  <div className="space-y-4">
                    {/* Full Name */}
                    <div>
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        value={personalInfo.fullName}
                        onChange={(e) => updateField('fullName', e.target.value)}
                        placeholder="John Doe"
                        className={`w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                          personalErrors.fullName ? 'border-red-300 bg-red-50' : 'border-gray-200 dark:border-slate-600'
                        }`}
                        autoComplete="name"
                      />
                      {personalErrors.fullName && (
                        <p className="mt-1 text-sm text-red-600">{personalErrors.fullName}</p>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={personalInfo.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="john@example.com"
                        className={`w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                          personalErrors.email ? 'border-red-300 bg-red-50' : 'border-gray-200 dark:border-slate-600'
                        }`}
                        autoComplete="email"
                      />
                      {personalErrors.email && (
                        <p className="mt-1 text-sm text-red-600">{personalErrors.email}</p>
                      )}
                    </div>

                    {/* Phone & Location row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                          Phone
                        </label>
                        <input
                          id="phone"
                          type="tel"
                          value={personalInfo.phone}
                          onChange={(e) => updateField('phone', e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                          autoComplete="tel"
                        />
                      </div>

                      <div>
                        <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                          Location
                        </label>
                        <input
                          id="location"
                          type="text"
                          value={personalInfo.location}
                          onChange={(e) => updateField('location', e.target.value)}
                          placeholder="New York, NY"
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                          autoComplete="address-level2"
                        />
                      </div>
                    </div>

                    {/* LinkedIn */}
                    <div>
                      <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        LinkedIn URL
                      </label>
                      <input
                        id="linkedin"
                        type="url"
                        value={personalInfo.linkedin}
                        onChange={(e) => updateField('linkedin', e.target.value)}
                        placeholder="https://linkedin.com/in/johndoe"
                        className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        autoComplete="url"
                      />
                    </div>
                  </div>

                  {/* Next button */}
                  <div className="mt-8 flex justify-end">
                    <Button variant="primary" size="lg" onClick={handleNext}>
                      Next
                      <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Job Description */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 sm:p-8">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1">Job Description</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-500 mb-6">
                    Paste the job description and we will tailor your resume to match.
                  </p>

                  <div className="mb-5 rounded-xl border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Import from Browser Extension</h3>
                        <p className="mt-1 text-sm text-blue-700 dark:text-blue-100/80">
                          Open a job posting in another tab, let the ResumeATS extension detect it, then import the structured details here.
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

                  {/* Job Description textarea */}
                  <div className="mb-5">
                    <label htmlFor="jobDescription" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      Job Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="jobDescription"
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste the full job description here..."
                      rows={10}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-y min-h-[200px]"
                      disabled={isGenerating}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {jobDescription.length > 0 ? `${jobDescription.length.toLocaleString()} characters` : 'Tip: Include the full posting for best results'}
                    </p>
                  </div>

                  {parsedJobPreview?.title && (
                    <div className="mb-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/70 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Detected Job Details</h3>
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

                  {/* Options row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label htmlFor="careerLevel" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Your Current Career Level
                      </label>
                      <select
                        id="careerLevel"
                        value={careerLevel}
                        onChange={(e) => setCareerLevel(e.target.value)}
                        disabled={isGenerating}
                        aria-describedby="careerLevel-help"
                        className="select-field"
                      >
                        {CAREER_LEVELS.map((cl) => (
                          <option key={cl.value} value={cl.value}>
                            {cl.label}
                          </option>
                        ))}
                      </select>
                      <p id="careerLevel-help" className="mt-2 text-sm text-gray-600 dark:text-slate-400">
                        Optional. Choose your own career stage, not the target job's level. This guides wording only; it does not add experience or leadership claims.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="resumeLength" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Resume Length
                      </label>
                      <select
                        id="resumeLength"
                        value={resumeLength}
                        onChange={(e) => setResumeLength(e.target.value)}
                        disabled={isGenerating}
                        className="select-field"
                      >
                        {RESUME_LENGTHS.map((rl) => (
                          <option key={rl.value} value={rl.value}>
                            {rl.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Loading state */}
                  {isGenerating && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 rounded-lg p-5"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative w-5 h-5">
                          <div className="absolute inset-0 rounded-full border-2 border-blue-200" />
                          <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                        </div>
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Generating your resume...</span>
                      </div>
                      <div className="w-full bg-blue-100 dark:bg-slate-700 rounded-full h-1.5 mb-3">
                        <motion.div
                          className="bg-blue-600 h-1.5 rounded-full"
                          initial={{ width: '5%' }}
                          animate={{
                            width: `${Math.min(10 + progressIndex * (80 / PROGRESS_MESSAGES.length), 90)}%`,
                          }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                        />
                      </div>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={progressIndex}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          transition={{ duration: 0.3 }}
                          className="text-xs text-blue-600"
                        >
                          {PROGRESS_MESSAGES[progressIndex]}
                        </motion.p>
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Buttons */}
                  <div className="flex justify-between items-center">
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={handleBack}
                      disabled={isGenerating}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back
                    </Button>

                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleGenerate}
                      disabled={!isPremium || isGenerating || !jobDescription.trim() || !sourceReady}
                    >
                      {isGenerating ? (
                        <>
                          <div className="w-4 h-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                            />
                          </svg>
                          Generate Resume
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Preview & Export */}
            {currentStep === 3 && pendingReview && (
              <div key="review" className="space-y-3">
                <ResumeTailoringReview
                  review={pendingReview.review}
                  decisions={pendingReview.decisions}
                  onDecisionsChange={(decisions) => {
                    const current = tailoringDrafts.read('quick', userId);
                    if (current?.runId === pendingReview.runId && current.stage === 'review') tailoringDrafts.write('quick', userId, { ...current, decisions }, current.runId);
                  }}
                  onComplete={(resolvedResume) => completeReview(pendingReview, resolvedResume)}
                  actionLabel="Preview reviewed resume"
                />
                <Button variant="ghost" onClick={discardReview}>Discard suggestions</Button>
                <p className="text-sm text-gray-600 dark:text-slate-300">Your review stays available when you switch pages in this account. Reloading, closing this browser tab, or signing out discards it.</p>
              </div>
            )}
            {currentStep === 3 && resumeData && (
              <motion.div
                key="step3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              >
                <div className="space-y-6">
                  {/* Template selector */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 sm:p-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">Choose Template</h3>
                    <div className="flex flex-wrap gap-2">
                      {TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          onClick={() => handleTemplateChange(tmpl.id)}
                          disabled={isSaving || Boolean(savedResumeRef.current)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
                            selectedTemplate === tmpl.id
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700/70 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {tmpl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Resume Preview */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Preview</h3>
                      <span className="text-xs text-gray-400 bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded">
                        {TEMPLATES.find((t) => t.id === selectedTemplate)?.label || 'Basic'} Template
                      </span>
                    </div>
                    <div className="p-4 sm:p-6 bg-gray-50 dark:bg-slate-900">
                      <div
                        className="bg-white dark:bg-slate-800 shadow-lg mx-auto border border-gray-200 dark:border-slate-600"
                        style={{ maxWidth: '800px', minHeight: '400px' }}
                      >
                        <ActiveTemplate ref={resumeRef} resume={resumeData} />
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-4 sm:p-6">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
                          Export Smart
                        </h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {exportFormatOptions.map((option) => (
                            <div
                              key={option.id}
                              className={`rounded-2xl border p-4 ${option.id === 'docx'
                                ? 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10'
                                : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/70'
                                }`}
                            >
                              <p className="text-lg font-semibold text-gray-900 dark:text-slate-100">{option.label}</p>
                              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                                {option.badge}
                              </p>
                              <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">{option.description}</p>
                              <Button
                                variant={option.id === 'docx' ? 'primary' : 'outline'}
                                size="md"
                                onClick={option.id === 'docx' ? handleExportWord : handleExportPDF}
                                disabled={isExporting}
                                className="mt-4 w-full"
                              >
                                {isExporting ? 'Preparing file...' : option.id === 'docx' ? 'Download DOCX' : 'Download PDF'}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
                          Final Check
                        </h3>
                        <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
                          {exportReadiness.completedCount}/{exportReadiness.totalCount} essentials ready before you export or track this application.
                        </p>
                        <div className="mt-4 space-y-3">
                          {exportReadiness.checks.map((check) => (
                            <div key={check.id} className="flex items-start gap-3">
                              <span className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${check.complete
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                }`}>
                                {check.complete ? (
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{check.label}</p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{check.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={handleSaveAndTrack}
                        disabled={isSaving || isTracked}
                        className="flex-1"
                      >
                        {isSaving ? (
                          <>
                            <div className="w-4 h-4 mr-2 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                              />
                            </svg>
                            {isTracked ? 'Saved to tracker' : 'Save & Track Application'}
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="mt-4 text-center">
                      <button
                        onClick={handleStartOver}
                        disabled={isSaving}
                        className="text-sm text-gray-400 hover:text-gray-600 dark:text-slate-400 transition-colors"
                      >
                        Start over with a new resume
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default SimpleResumeFlow;
