import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useResume } from '../context/ResumeContext';
import { useSubscription } from '../context/SubscriptionContext';
import { generateEnhancedResume } from '../services/enhancedOpenaiService';
import { getUserProfile } from '../services/userProfileService';
import { mapResumeData } from '../utils/resumeDataMapper';
import { parseJobDescription } from '../utils/jobDescriptionParser';
import { deriveResumeTitle, extractCompanyFromJobDescription } from '../utils/resumeTitle.js';
import { downloadResumePdf } from '../services/pdfService';
import { downloadResumeDocx } from '../services/docxService';
import { createApplication } from '../services/applicationService';
import { buildImportedJobDescription, getRecentBrowserAgentJobPosting } from '../services/browserAgentService';
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

const CAREER_LEVELS = [
  { value: 'entry', label: 'Entry Level' },
  { value: 'mid', label: 'Mid Level' },
  { value: 'senior', label: 'Senior Level' },
  { value: 'executive', label: 'Executive' },
];

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
  const { createResume } = useResume();
  const {
    isPremium,
    loading: subscriptionLoading,
    getAIGenerationAccess,
    incrementAIGenerationUsage,
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

  // Step 2: Job description
  const [jobDescription, setJobDescription] = useState('');
  const [careerLevel, setCareerLevel] = useState('mid');
  const [resumeLength, setResumeLength] = useState('standard');
  const [isImportingJob, setIsImportingJob] = useState(false);
  const [importedJobSnapshot, setImportedJobSnapshot] = useState(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const progressTimerRef = useRef(null);

  // Step 3: Resume result
  const [resumeData, setResumeData] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('ats-friendly');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Load profile on mount
  useEffect(() => {
    if (!user || profileLoaded) return;

    const loadProfile = async () => {
      try {
        const profile = await getUserProfile();
        if (profile?.personal) {
          const p = profile.personal;
          setPersonalInfo((prev) => ({
            fullName: p.fullName || p.full_name || prev.fullName,
            email: p.email || prev.email,
            phone: p.phone || prev.phone,
            location: p.location || p.city || prev.location,
            linkedin: p.linkedin || p.linkedinUrl || prev.linkedin,
          }));
        }
      } catch {
        // Profile load is optional - user can fill manually
      } finally {
        setProfileLoaded(true);
      }
    };

    loadProfile();
  }, [user, profileLoaded]);

  // Pre-fill email from auth user
  useEffect(() => {
    if (user?.email && !personalInfo.email) {
      setPersonalInfo((prev) => ({ ...prev, email: user.email }));
    }
  }, [user, personalInfo.email]);

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

      if (['entry', 'mid', 'senior', 'executive'].includes(parsedImportedJob?.experience?.level)) {
        setCareerLevel(parsedImportedJob.experience.level);
      }

      toast.success(`Imported ${jobPosting.title || 'job posting'} from browser extension`);
    } catch (error) {
      toast.error(error.message || 'Could not import a job posting from the browser extension.');
    } finally {
      setIsImportingJob(false);
    }
  }, []);

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

  // Generate resume
  const handleGenerate = useCallback(async () => {
    if (!jobDescription.trim()) {
      toast.error('Please paste a job description');
      return;
    }

    if (!user) {
      toast.error('Please sign in to generate a resume');
      navigate('/signin');
      return;
    }

    // Check AI generation availability
    const access = await getAIGenerationAccess();
    if (!access.allowed) {
      showAIGenerationAccessMessage(access.reason);
      return;
    }

    setIsGenerating(true);
    startProgressMessages();

    try {
      // Build the user profile object expected by the AI service
      const userProfile = {
        personal: {
          fullName: personalInfo.fullName.trim(),
          email: personalInfo.email.trim(),
          phone: personalInfo.phone.trim(),
          location: personalInfo.location.trim(),
          linkedin: personalInfo.linkedin.trim(),
        },
        education: [],
        workExperience: [],
        skills: [],
      };

      const options = {
        careerLevel,
        length: resumeLength,
      };

      const result = await generateEnhancedResume(userProfile, jobDescription, options);
      const mapped = mapResumeData(result);

      // Merge personal info from the form into the resume (in case AI overwrote them)
      const finalResume = {
        ...mapped,
        personalInfo: {
          ...(mapped.personalInfo || {}),
          fullName: personalInfo.fullName.trim() || mapped.personalInfo?.fullName || '',
          email: personalInfo.email.trim() || mapped.personalInfo?.email || '',
          phone: personalInfo.phone.trim() || mapped.personalInfo?.phone || '',
          location: personalInfo.location.trim() || mapped.personalInfo?.location || '',
          linkedin: personalInfo.linkedin.trim() || mapped.personalInfo?.linkedin || '',
        },
        selectedTemplate,
        selectedFont: 'Arial',
      };

      // Increment usage
      await incrementAIGenerationUsage();

      setResumeData(finalResume);
      goToStep(3);
      toast.success('Resume generated successfully!');
    } catch (error) {
      console.error('Error generating resume:', error);
      toast.error(error.message || 'Failed to generate resume. Please try again.');
    } finally {
      setIsGenerating(false);
      stopProgressMessages();
    }
  }, [
    jobDescription,
    user,
    navigate,
    getAIGenerationAccess,
    personalInfo,
    careerLevel,
    resumeLength,
    selectedTemplate,
    incrementAIGenerationUsage,
    goToStep,
    showAIGenerationAccessMessage,
    startProgressMessages,
    stopProgressMessages,
  ]);

  // Template change
  const handleTemplateChange = useCallback(
    (templateId) => {
      setSelectedTemplate(templateId);
      if (resumeData) {
        setResumeData((prev) => ({ ...prev, selectedTemplate: templateId }));
      }
    },
    [resumeData]
  );

  // Export PDF
  const handleExportPDF = useCallback(async () => {
    if (!resumeRef.current || !resumeData) return;
    setIsExporting(true);
    try {
      const filename = `${(resumeData.personalInfo?.fullName || 'resume').replace(/\s+/g, '_')}_Resume`;
      await downloadResumePdf(resumeRef.current, resumeData, filename);
      toast.success('PDF downloaded!');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [resumeData]);

  // Export Word
  const handleExportWord = useCallback(async () => {
    if (!resumeData) return;
    setIsExporting(true);
    try {
      const filename = `${(resumeData.personalInfo?.fullName || 'resume').replace(/\s+/g, '_')}_Resume`;
      await downloadResumeDocx(resumeData, filename);
      toast.success('Word document downloaded!');
    } catch (error) {
      console.error('Word export error:', error);
      toast.error('Failed to export Word document. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [resumeData]);

  // Save & Track Application
  const handleSaveAndTrack = useCallback(async () => {
    if (!resumeData || !user) return;
    setIsSaving(true);

    try {
      // Parse job description for company/position
      const parsed = parseJobDescription(jobDescription);
      const jobTitle = parsed.title || 'Unknown Position';
      const companyName = extractCompanyFromJobDescription(jobDescription) || 'Unknown Company';

      // Save the resume
      const resumeTitle = deriveResumeTitle(resumeData, jobDescription);
      const savedResume = await createResume({
        ...resumeData,
        title: resumeTitle,
        description: `Generated for ${jobTitle} at ${companyName}`,
        selectedTemplate,
      });

      // Try to create a job application entry
      try {
        const { error: appError } = await createApplication({
          resume_id: savedResume?.id || null,
          company: companyName,
          position: jobTitle,
          status: 'applied',
          job_description: jobDescription.substring(0, 5000),
        });

        if (appError) {
          console.warn('Could not create application entry:', appError.message);
        }
      } catch {
        // Application tracking is optional
        console.warn('Application tracking not available');
      }

      toast.success(
        (t) => (
          <div className="flex flex-col gap-2">
            <span>Resume saved successfully!</span>
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
      console.error('Error saving resume:', error);
      toast.error(error.message || 'Failed to save resume. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [resumeData, user, jobDescription, createResume, selectedTemplate, navigate]);

  // Start Over
  const handleStartOver = useCallback(() => {
    setResumeData(null);
    setJobDescription('');
    setCareerLevel('mid');
    setResumeLength('standard');
    setSelectedTemplate('ats-friendly');
    goToStep(1);
  }, [goToStep]);

  // Update a personal info field
  const updateField = useCallback((field, value) => {
    setPersonalInfo((prev) => ({ ...prev, [field]: value }));
    setPersonalErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  // Get the active template component
  const ActiveTemplate = TEMPLATES.find((t) => t.id === selectedTemplate)?.Component || BasicTemplate;

  if (subscriptionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-10 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-slate-300">Loading subscription status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
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
              <Button as="link" to="/pricing" variant="primary" size="lg">
                Upgrade to Premium
              </Button>
              <Button as="link" to="/dashboard" variant="outline" size="lg">
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100">Create Your Resume</h1>
          <p className="text-gray-500 dark:text-slate-500 mt-1 text-sm sm:text-base">Three simple steps to a professional resume</p>
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
                        isCompleted ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-[background-color,color,box-shadow] duration-300 ${
                        isActive
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                          : isCompleted
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500 dark:text-slate-500'
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
                            {parsedJobPreview.experience.level}
                            {parsedJobPreview.experience.years !== null ? ` (${parsedJobPreview.experience.years}+ years)` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Options row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label htmlFor="careerLevel" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        Career Level
                      </label>
                      <select
                        id="careerLevel"
                        value={careerLevel}
                        onChange={(e) => setCareerLevel(e.target.value)}
                        disabled={isGenerating}
                        className="select-field"
                      >
                        {CAREER_LEVELS.map((cl) => (
                          <option key={cl.value} value={cl.value}>
                            {cl.label}
                          </option>
                        ))}
                      </select>
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
                      <div className="w-full bg-blue-100 rounded-full h-1.5 mb-3">
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
                      disabled={isGenerating || !jobDescription.trim()}
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
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ${
                            selectedTemplate === tmpl.id
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-600 dark:text-slate-400 hover:bg-gray-200'
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
                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* Export buttons */}
                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="flex-1"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                          />
                        </svg>
                        Download PDF
                      </Button>

                      <Button
                        variant="outline"
                        size="md"
                        onClick={handleExportWord}
                        disabled={isExporting}
                        className="flex-1"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                          />
                        </svg>
                        Download Word
                      </Button>

                      <Button
                        variant="secondary"
                        size="md"
                        onClick={handleSaveAndTrack}
                        disabled={isSaving}
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
                            Save &amp; Track Application
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Start Over */}
                    <div className="mt-4 text-center">
                      <button
                        onClick={handleStartOver}
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
