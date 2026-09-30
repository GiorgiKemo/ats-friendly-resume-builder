import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useResume } from '../context/ResumeContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import ResumePreviewPane from '../components/resume/ResumePreviewPane';
import AutosaveIndicator from '../components/ui/AutosaveIndicator';
import MobileNavigation from '../components/resume/MobileNavigation';
import MobileResumeNavBar from '../components/resume/MobileResumeNavBar';
import ResumeSectionIcon from '../components/resume/ResumeSectionIcon';
import { getUserProfile } from '../services/userProfileService';
import { trackResumeExport } from '../services/analyticsService.js';
import { useConfirmDialog } from '../hooks/useConfirmDialog.js';
import {
  buildResumeBuilderSections,
  getNextRecommendedBuilderAction,
  getResumeBuilderProgress,
} from '../utils/resumeBuilderProgress';

// Resume sections
import PersonalInfoSection from '../components/resume/PersonalInfoSection';
import WorkExperienceSection from '../components/resume/WorkExperienceSection';
import EducationSection from '../components/resume/EducationSection';
import SkillsSection from '../components/resume/SkillsSection';
import CertificationsSection from '../components/resume/CertificationsSection';
import ProjectsSection from '../components/resume/ProjectsSection';
import AdditionalSectionsSection from '../components/resume/AdditionalSectionsSection';
import TemplateSelector from '../components/resume/TemplateSelector';
import AIResumeGeneratorLoader from '../components/resume/AIResumeGeneratorLoader';
import AtsCheckerDisplay from '../components/ats/AtsCheckerDisplay.jsx'; // Import ATS component
import BasicTemplate from '../components/templates/BasicTemplate';
import MinimalistTemplate from '../components/templates/MinimalistTemplate';
import TraditionalTemplate from '../components/templates/TraditionalTemplate';
import ModernTemplate from '../components/templates/ModernTemplate';
import ATSFriendlyTemplate from '../components/templates/ATSFriendlyTemplate';

const readStorageValue = (key) => {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage?.getItem(key) || null; } catch { return null; }
};

const writeStorageValue = (key, value) => {
  if (typeof window === 'undefined') return;
  try { window.localStorage?.setItem(key, value); } catch { /* best effort */ }
};

// Only sections without their own in-form ATS guidance get a tip strip.
const SECTION_TIPS = {
  template: 'Choose a readable, single-column layout and review the exported file against the employer’s instructions.',
  aiGenerator: 'Customize AI-generated content to reflect your actual experience and achievements.',
  atsCheck: 'Review the checklist and address critical readability or structure issues; the score is guidance, not a hiring prediction.',
};

const SECTION_STATUS_LABELS = { complete: 'Ready', inProgress: 'Draft', optional: 'Optional', todo: 'To do' };

// Compact status mark for the section list; the text label stays available to screen readers.
const BuilderSectionStatus = ({ section }) => {
  const tone = section.complete ? 'complete' : section.inProgress ? 'inProgress' : section.optional ? 'optional' : 'todo';
  return (
    <span className={`builder-status is-${tone}`} title={SECTION_STATUS_LABELS[tone]}>
      {tone === 'complete' && (
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8.5 2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      )}
      <span className="sr-only">{SECTION_STATUS_LABELS[tone]}</span>
    </span>
  );
};

const ResumeBuilder = () => {
  const { resumeId } = useParams();
  const { user } = useAuth();
  const {
    currentResume,
    loading,
    error,
    hasUnsavedChanges,
    saveConflict,
    recoveryDrafts = [],
    draftBackupAvailable,
    recoverDraft,
    discardRecoveryDraft,
    restoreNewResumeDraft,
    reloadSavedResume,
    getResumeById: loadResume,
    createResume,
    updateResume,
    updateCurrentResume,
    initialResumeState,
    // ATS State and functions
    atsIssues,
    atsScore,
    atsLoading,
    runAtsCheck,
  } = useResume();
  const { isPremium } = useSubscription(); // For premium feature handling
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm, confirmDialog } = useConfirmDialog();

  const [activeSection, setActiveSection] = useState('personalInfo');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(() => {
    if (resumeId) {
      const storedPreference = readStorageValue(`autosave_${resumeId}`);
      return storedPreference !== null ? storedPreference === 'true' : true;
    }
    const globalPreference = readStorageValue('autosave_global');
    return globalPreference !== null ? globalPreference === 'true' : true;
  });
  const [autosaveStatus, setAutosaveStatus] = useState(null);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(null);
  const [isSyncingProfile, setIsSyncingProfile] = useState(false);
  const [saveAction, setSaveAction] = useState('save');
  const [selectedRecoveryKey, setSelectedRecoveryKey] = useState('');
  const [recoveryError, setRecoveryError] = useState(null);

  const resumePreviewRef = useRef(null);
  const hiddenExportRef = useRef(null);
  const mainContentRef = useRef(null);
  const initialProfileLoadToastShownRef = useRef(false);
  const forcedBlankRef = useRef(location.state?.forceBlank || false);
  const currentResumeRef = useRef(currentResume);
  currentResumeRef.current = currentResume;
  const builderKey = `${user?.id || ''}:${resumeId || ''}`;
  const builderKeyRef = useRef(builderKey);
  builderKeyRef.current = builderKey;
  const lifecycleRef = useRef(0);
  const mountedRef = useRef(true);
  const savingRef = useRef(null);
  const syncingRef = useRef(null);
  const isCurrentRequest = useCallback((request) => mountedRef.current
    && request.key === builderKeyRef.current && request.lifecycle === lifecycleRef.current, []);

  useEffect(() => {
    mountedRef.current = true;
    savingRef.current = null;
    syncingRef.current = null;
    setIsSaving(false);
    setIsSyncingProfile(false);
    setAutosaveStatus(null);
    setLastSavedTimestamp(null);
    setSelectedRecoveryKey('');
    setRecoveryError(null);
    initialProfileLoadToastShownRef.current = false;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
    };
  }, [builderKey]);

  const [resumeList, setResumeList] = useState([]);
  const [resumeListLoading, setResumeListLoading] = useState(false);

  const loadUserProfileData = useCallback(async (isActive = () => true) => {
    const request = { key: builderKey, lifecycle: lifecycleRef.current };
    const snapshot = currentResumeRef.current;
    try {
      const profileData = await getUserProfile(user?.id);
      if (!isActive() || !isCurrentRequest(request) || currentResumeRef.current !== snapshot) return;
      if (profileData) {
        const professionalLinks = profileData.personal?.professionalLinks || {};
        const prePopulatedResume = {
          ...initialResumeState,
          personalInfo: {
            ...(initialResumeState?.personalInfo || {}),
            fullName: profileData.personal?.fullName || '',
            email: profileData.personal?.email || '',
            phone: profileData.personal?.phone || '',
            location: profileData.personal?.location || '',
            linkedin: professionalLinks.linkedin || '',
            website: professionalLinks.portfolio || '',
            portfolio: professionalLinks.portfolio || '',
            github: professionalLinks.github || '',
            other: professionalLinks.other || '',
            professionalLinks: {
              ...(initialResumeState?.personalInfo?.professionalLinks || {}),
              ...professionalLinks,
            },
          },
          education: profileData.education || []
        };
        updateCurrentResume(prePopulatedResume, false); // Don't autosave profile prefill
        if (!initialProfileLoadToastShownRef.current) {
          toast('Personal information loaded from your profile');
          initialProfileLoadToastShownRef.current = true;
        }
      }
    } catch (error) {
      if (isActive() && isCurrentRequest(request)) console.error('Error loading user profile from Supabase:', error);
    }
  }, [builderKey, user?.id, isCurrentRequest, initialResumeState, updateCurrentResume]);

  useEffect(() => {
    if (!resumeId && currentResume.id && currentResume.id !== resumeId && !forcedBlankRef.current && !savingRef.current) {
      navigate(`/builder/${currentResume.id}`, { replace: true });
    }
  }, [currentResume.id, resumeId, navigate]);

  useEffect(() => {
    let cancelled = false;
    const fetchResumes = async () => {
      if (!user) return;
      setResumeListLoading(true);
      try {
        const { getUserResumes } = await import('../services/supabaseService');
        if (cancelled) return;
        const resumes = await getUserResumes();
        if (!cancelled) setResumeList(resumes || []);
      } catch {
        if (!cancelled) setResumeList([]);
      } finally {
        if (!cancelled) setResumeListLoading(false);
      }
    };
    fetchResumes();
    return () => { cancelled = true; };
  }, [user, resumeId]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const { newlyCreatedResumeData, forceBlank: locationForceBlank } = location.state || {};
    let cancelled = false;
    const request = { key: builderKey, lifecycle: lifecycleRef.current };
    const isActive = () => !cancelled && isCurrentRequest(request);

    // Update forcedBlankRef based on navigation state
    if (locationForceBlank) {
      forcedBlankRef.current = true;
      // Clear the forceBlank state from location immediately after reading it
      navigate(location.pathname, { replace: true, state: { ...location.state, forceBlank: undefined } });
    }

    if (forcedBlankRef.current && !resumeId) {
      updateCurrentResume(initialResumeState, false);
      const globalPreference = readStorageValue('autosave_global');
      if (globalPreference !== null) {
        setAutosaveEnabled(globalPreference === 'true');
      }
      // After processing forceBlank, reset the ref if we are not staying on a "new resume" path
      // This is now handled by the separate useEffect below.
    } else if (resumeId && user) {
      // Navigation state is only a hint, never an authorization or data source.
      if (newlyCreatedResumeData) navigate(location.pathname, { replace: true, state: {} });
      forcedBlankRef.current = false; // Loading an existing resume
      const loadResumeData = async () => {
        try {
          await loadResume(resumeId);
          if (!isActive()) return;
          const storedPreference = readStorageValue(`autosave_${resumeId}`);
          if (storedPreference !== null) {
            setAutosaveEnabled(storedPreference === 'true');
          }
        } catch (err) {
          if (!isActive()) return;
          console.error('Error loading resume:', err);
          toast.error('Failed to load resume. Redirecting to dashboard.');
          navigate('/dashboard');
        }
      };
      loadResumeData();
    } else if (user && !resumeId && !forcedBlankRef.current) {
      const loadProfile = async () => {
        try {
          if (restoreNewResumeDraft()) {
            const globalPreference = readStorageValue('autosave_global');
            if (globalPreference !== null) setAutosaveEnabled(globalPreference === 'true');
            return;
          }
          await loadUserProfileData(isActive);
          if (!isActive()) return;
          const globalPreference = readStorageValue('autosave_global');
          if (globalPreference !== null) {
            setAutosaveEnabled(globalPreference === 'true');
          }
        } catch (err) {
          if (!isActive()) return;
          console.error('Error loading profile data:', err);
          toast.error('Could not load profile data. Your current draft was kept.');
        }
      };
      loadProfile();
    } else if (!user && !resumeId) {
      updateCurrentResume(initialResumeState, false);
      forcedBlankRef.current = true; // Treat as forced blank if no user and new path
    }
    return () => { cancelled = true; };
  }, [resumeId, user, builderKey, isCurrentRequest, loadResume, navigate, location.state, location.pathname, loadUserProfileData, updateCurrentResume, initialResumeState, restoreNewResumeDraft]);

  // Effect to reset forcedBlankRef when navigating to a specific resume or away from /builder
  useEffect(() => {
    if (resumeId || (location.pathname !== '/builder' && !location.pathname.startsWith('/builder/'))) {
      forcedBlankRef.current = false;
    }
  }, [resumeId, location.pathname]);


  const syncProfileData = async () => {
    if (syncingRef.current || !user?.id || (resumeId && currentResume.id !== resumeId)) return;
    const request = { key: builderKey, lifecycle: lifecycleRef.current };
    const snapshot = currentResumeRef.current;
    syncingRef.current = request;
    setIsSyncingProfile(true);
    try {
      const profileData = await getUserProfile(user.id);
      if (!isCurrentRequest(request)) return;
      if (currentResumeRef.current !== snapshot) {
        toast('Your latest edits were kept. Sync again if you still want to add profile data.');
        return;
      }
      if (profileData) {
        const currentProfessionalLinks = snapshot.personalInfo?.professionalLinks || {};
        const profileProfessionalLinks = profileData.personal?.professionalLinks || {};
        const linkedin = snapshot.personalInfo.linkedin || currentProfessionalLinks.linkedin || profileProfessionalLinks.linkedin || '';
        const website = snapshot.personalInfo.website || snapshot.personalInfo.portfolio || currentProfessionalLinks.portfolio || profileProfessionalLinks.portfolio || '';
        const github = snapshot.personalInfo.github || currentProfessionalLinks.github || profileProfessionalLinks.github || '';
        const other = snapshot.personalInfo.other || currentProfessionalLinks.other || profileProfessionalLinks.other || '';
        const mergedResume = {
          ...snapshot,
          personalInfo: {
            ...snapshot.personalInfo,
            fullName: snapshot.personalInfo.fullName || profileData.personal?.fullName || '',
            email: snapshot.personalInfo.email || profileData.personal?.email || '',
            phone: snapshot.personalInfo.phone || profileData.personal?.phone || '',
            location: snapshot.personalInfo.location || profileData.personal?.location || '',
            linkedin,
            website,
            portfolio: snapshot.personalInfo.portfolio || website,
            github,
            other,
            professionalLinks: {
              ...currentProfessionalLinks,
              linkedin,
              github,
              portfolio: snapshot.personalInfo.portfolio || website,
              other,
            },
          },
          education: snapshot.education && snapshot.education.length > 0 ? snapshot.education : (profileData.education || [])
        };
        updateCurrentResume(mergedResume);
        toast.success('Profile data synced into this resume!');
      }
    } catch {
      if (isCurrentRequest(request)) toast.error('Failed to sync profile data.');
    } finally {
      if (syncingRef.current === request && isCurrentRequest(request)) {
        syncingRef.current = null;
        setIsSyncingProfile(false);
      }
    }
  };

  const getResumeFilename = (resume) => `${resume.personalInfo?.fullName || resume.title || 'Resume'}_ATS_Friendly_Resume`;

  const handleSaveResume = async (action = saveAction) => {
    if (savingRef.current || saveConflict || !user?.id || (resumeId && currentResumeRef.current.id !== resumeId)) return;
    const request = { key: builderKey, lifecycle: lifecycleRef.current };
    const isCurrent = () => savingRef.current === request && isCurrentRequest(request);
    savingRef.current = request;
    setIsSaving(true);
    setAutosaveStatus(null);
    try {
      await new Promise((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => resolve());
          return;
        }
        setTimeout(resolve, 0);
      });
      if (!isCurrent()) return;

      const latestResume = currentResumeRef.current;
      let savedResumeForDownload = latestResume;
      let saveSucceeded = false;
      let createdResumeId = null;

      if (latestResume.id || resumeId) {
        const idToUpdate = latestResume.id || resumeId;
        await updateResume(idToUpdate, latestResume);
        if (!isCurrent()) return;
        savedResumeForDownload = { ...latestResume, id: idToUpdate };
        setLastSavedTimestamp(Date.now());
        setAutosaveStatus('saved');
        saveSucceeded = true;
      } else {
        const resumeToCreate = {
          ...latestResume,
          title: latestResume.title || 'Untitled Resume'
        };
        const newResume = await createResume(resumeToCreate);
        if (!isCurrent()) return;
        if (newResume && newResume.id) {
          savedResumeForDownload = { ...latestResume, id: newResume.id };
          createdResumeId = newResume.id;
          setLastSavedTimestamp(Date.now());
          setAutosaveStatus('saved');
          saveSucceeded = true;
        } else {
          toast.error('Resume created but no ID returned. Please check your dashboard.');
          setAutosaveStatus('error');
        }
      }

      if (!saveSucceeded) {
        return;
      }

      if (action === 'pdf') {
        if (!hiddenExportRef.current) {
          throw new Error('Resume preview is not ready for PDF export yet.');
        }

        try {
          const { downloadResumePdf } = await import('../services/pdfService');
          if (!isCurrent()) return;
          await downloadResumePdf(hiddenExportRef.current, savedResumeForDownload, getResumeFilename(savedResumeForDownload));
          trackResumeExport('pdf');
          if (!isCurrent()) return;
          toast.success('Resume saved and downloaded as PDF');
        } catch (downloadError) {
          if (!isCurrent()) return;
          toast.error(`Resume saved, but PDF download failed: ${downloadError.message || 'Unknown error'}`);
        }
      } else if (action === 'docx') {
        try {
          const { downloadResumeDocx } = await import('../services/docxService');
          if (!isCurrent()) return;
          await downloadResumeDocx(savedResumeForDownload, getResumeFilename(savedResumeForDownload));
          trackResumeExport('docx');
          if (!isCurrent()) return;
          toast.success('Resume saved and downloaded as DOCX');
        } catch (downloadError) {
          if (!isCurrent()) return;
          toast.error(`Resume saved, but DOCX download failed: ${downloadError.message || 'Unknown error'}`);
        }
      } else {
        toast.success(latestResume.id || resumeId ? 'Resume updated successfully' : 'Resume created successfully');
      }
      if (createdResumeId && isCurrent()) navigate(`/builder/${createdResumeId}`, { replace: true });
    } catch (error) {
      if (!isCurrent()) return;
      const errorMessage = error?.message || 'Unknown error';
      toast.error(`Failed to save resume: ${errorMessage}`);
      setAutosaveStatus('error');
    } finally {
      if (isCurrent()) {
        savingRef.current = null;
        setIsSaving(false);
      }
    }
  };

  const handleConflictResolution = async (action) => {
    if (savingRef.current || !user?.id || !saveConflict || currentResumeRef.current.id !== resumeId) return;
    if (action === 'reload') {
      const confirmed = await confirm({
        title: 'Reload the saved resume?',
        message: 'This replaces the edits currently shown with the latest saved version. Save your version as a copy first if you want to keep both.',
        confirmLabel: 'Reload saved version',
        danger: true,
      });
      if (!confirmed) return;
    }
    const request = { key: builderKey, lifecycle: lifecycleRef.current };
    const isCurrent = () => savingRef.current === request && isCurrentRequest(request);
    savingRef.current = request;
    setIsSaving(true);
    setRecoveryError(null);
    try {
      if (action === 'copy') {
        const snapshot = currentResumeRef.current;
        const savedCopy = await createResume({ ...snapshot, id: '', revision: undefined, title: `${snapshot.title || 'Untitled Resume'} (recovered copy)` });
        if (!isCurrent()) return;
        if (!savedCopy?.id) throw new Error('The copy could not be confirmed. Your draft is still here.');
        toast.success('Your version was saved as a separate resume.');
        navigate(`/builder/${savedCopy.id}`, { replace: true });
      } else {
        await reloadSavedResume();
        if (!isCurrent()) return;
        setAutosaveStatus(null);
        setLastSavedTimestamp(null);
        toast.success('Latest saved version loaded.');
      }
    } catch (resolutionError) {
      if (isCurrent()) setRecoveryError(resolutionError?.message || 'Could not resolve this draft. Your edits are still here.');
    } finally {
      if (isCurrent()) {
        savingRef.current = null;
        setIsSaving(false);
      }
    }
  };

  const recoveryKey = recoveryDrafts.some((draft) => draft.key === selectedRecoveryKey)
    ? selectedRecoveryKey : recoveryDrafts[0]?.key || '';

  const handleRecoveryDraft = async (discard = false) => {
    if (!recoveryKey || savingRef.current) return;
    const confirmed = await confirm({
      title: discard ? 'Discard this recovery copy?' : 'Open this recovery copy?',
      message: discard
        ? 'This removes the recovery copy from this browser only. It does not delete a saved resume.'
        : 'Your current edits will stay in place until you choose to replace them. Save or export them first if you want to keep both versions.',
      confirmLabel: discard ? 'Discard recovery copy' : 'Open recovery copy',
      danger: discard,
    });
    if (!confirmed) return;
    setRecoveryError(null);
    try {
      const result = discard ? discardRecoveryDraft(recoveryKey) : recoverDraft(recoveryKey);
      if (result === false) setRecoveryError('This recovery copy is no longer available. Your current edits were kept.');
    } catch (draftError) {
      setRecoveryError(draftError?.message || 'Could not open this recovery copy. Your current edits were kept.');
    }
  };

  const renderExportTemplate = () => {
    const templateProps = {
      resume: currentResume,
      ref: hiddenExportRef,
    };

    switch (currentResume.selectedTemplate) {
      case 'ats-friendly':
        return <ATSFriendlyTemplate {...templateProps} />;
      case 'minimalist':
        return <MinimalistTemplate {...templateProps} />;
      case 'traditional':
        return <TraditionalTemplate {...templateProps} />;
      case 'modern':
        return <ModernTemplate {...templateProps} />;
      case 'basic':
      default:
        return <BasicTemplate {...templateProps} />;
    }
  };

  const handleShowPreview = () => {
    setShowPreview(!showPreview);
    if (!showPreview && typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setTimeout(() => {
        resumePreviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleBackToEditing = () => {
    setShowPreview(false);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setTimeout(() => {
        mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  if (!error && ((resumeId && currentResume.id !== resumeId)
    || (loading && !currentResume.id && !resumeId && !forcedBlankRef.current))) {
    return (
      <div className="app-loading-viewport">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && resumeId && currentResume.id !== resumeId) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
          <Button as="link" to="/dashboard">Back to Dashboard</Button>
      </div>
    );
  }

  const sections = buildResumeBuilderSections(currentResume, { atsScore, isPremium, ownerId: user?.id });
  const {
    coreSections,
    completedCore,
    progress,
  } = getResumeBuilderProgress(sections);
  const nextRecommendedAction = getNextRecommendedBuilderAction(sections, { showPreview });
  const totalCoreSections = coreSections.length;
  const remainingCoreSections = Math.max(totalCoreSections - completedCore, 0);
  const coreProgressLabel = completedCore === totalCoreSections
    ? 'Your core resume foundation is ready.'
    : `${remainingCoreSections} core section${remainingCoreSections === 1 ? '' : 's'} left before export.`;

  const formatSaveTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (diffSeconds < 15) return 'Saved just now';
    if (diffSeconds < 60) return `Saved ${diffSeconds}s ago`;

    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `Saved ${diffMinutes}m ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `Saved ${diffHours}h ago`;

    const diffDays = Math.round(diffHours / 24);
    return `Saved ${diffDays}d ago`;
  };

  const saveState = (() => {
    if (saveConflict) {
      return {
        label: 'Autosave paused',
        detail: 'Resolve the version conflict to continue saving.',
        classes: 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
      };
    }
    if (isSaving) {
      return {
        label: 'Saving changes',
        detail: 'Updating your working copy now.',
        classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
      };
    }

    if (hasUnsavedChanges && autosaveEnabled) {
      return {
        label: 'Changes queued for autosave',
        detail: 'Keep editing or save manually before leaving.',
        classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
      };
    }

    if (hasUnsavedChanges) {
      return {
        label: 'Unsaved changes',
        detail: 'Save now to lock in this version.',
        classes: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
      };
    }

    if (lastSavedTimestamp) {
      return {
        label: 'All changes saved',
        detail: formatSaveTimestamp(lastSavedTimestamp),
        classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
      };
    }

    if (currentResume.id || resumeId) {
      return {
        label: 'Working from saved resume',
        detail: 'Your last saved version is loaded.',
        classes: 'bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200',
      };
    }

    return {
      label: 'New resume draft',
      detail: 'Save once to create a reusable version.',
      classes: 'bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200',
    };
  })();

  const handleNextRecommendedClick = () => {
    if (nextRecommendedAction.type === 'preview') {
      handleShowPreview();
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches && showPreview) {
      setShowPreview(false);
    }

    if (nextRecommendedAction.target) {
      setActiveSection(nextRecommendedAction.target);
      setTimeout(() => {
        mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  const saveTone = saveConflict || hasUnsavedChanges
    ? (hasUnsavedChanges && !autosaveEnabled && !saveConflict ? 'is-unsaved' : 'is-pending')
    : isSaving
      ? 'is-pending'
      : lastSavedTimestamp
        ? 'is-saved'
        : 'is-idle';
  const nextActionLabel = nextRecommendedAction.type === 'section'
    ? `Next: ${nextRecommendedAction.title}`
    : nextRecommendedAction.label;
  const isEditingSavedResume = (currentResume.id && resumeId) || (currentResume.id && !resumeId && !forcedBlankRef.current);
  const saveButtonLabel = isSaving
    ? (currentResume.id ? 'Saving...' : 'Creating...')
    : saveAction === 'pdf'
      ? (currentResume.id ? 'Save Resume + PDF' : 'Create Resume + PDF')
      : saveAction === 'docx'
        ? (currentResume.id ? 'Save Resume + DOCX' : 'Create Resume + DOCX')
        : (currentResume.id ? 'Save Resume' : 'Create Resume');

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'personalInfo':
        return <PersonalInfoSection />;
      case 'workExperience':
        return <WorkExperienceSection />;
      case 'education':
        return <EducationSection />;
      case 'skills':
        return <SkillsSection />;
      case 'certifications':
        return <CertificationsSection />;
      case 'projects':
        return <ProjectsSection />;
      case 'additionalSections':
        return <AdditionalSectionsSection />;
      case 'template':
        return <TemplateSelector />;
      case 'aiGenerator':
        return <AIResumeGeneratorLoader />;
      case 'atsCheck': // Render ATS Checker
        return (
          <AtsCheckerDisplay
            issues={atsIssues}
            score={atsScore}
            onCheckResume={runAtsCheck}
            isLoading={atsLoading}
            premiumUser={isPremium}
          />
        );
      default:
        return <PersonalInfoSection />;
    }
  };

  const activeTip = SECTION_TIPS[activeSection];
  const hasAlerts = Boolean(saveConflict || draftBackupAvailable === false || (error && !saveConflict) || recoveryError || recoveryDrafts.length > 0);

  return (
    <div className={`builder-app${showPreview ? ' is-preview-open' : ''}`}>
      <header className="builder-toolbar">
        <div className="builder-toolbar-main">
          <div className="builder-doc">
            <span className="builder-doc-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5M9 13h6M9 17h4" />
              </svg>
            </span>
            <div className="builder-doc-meta">
              <h1 className="builder-doc-kicker">{isEditingSavedResume ? 'Edit Resume' : 'Create New Resume'}</h1>
              <label htmlFor="resume-switch" className="sr-only">Resume</label>
              <select
                id="resume-switch"
                className="builder-doc-select"
                value={resumeId || ''}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '') {
                    // Pass true as the third argument to explicitly trigger the reset logic
                    updateCurrentResume(initialResumeState, false, true);
                    navigate('/builder', { state: { forceBlank: true } });
                  } else {
                    forcedBlankRef.current = false;
                    navigate(`/builder/${val}`);
                  }
                }}
                disabled={resumeListLoading}
              >
                <option value="">Create New Resume</option>
                {resumeId && !resumeList.some((resume) => resume.id === resumeId) && (
                  <option value={resumeId}>{currentResume.title || 'Current Resume'}</option>
                )}
                {resumeList.map(r => (
                  <option key={r.id} value={r.id}>{r.title || 'Untitled Resume'}</option>
                ))}
              </select>
            </div>
            <span role="status" className={`builder-save-chip ${saveTone}`} title={saveState.detail}>
              <span className="builder-save-dot" aria-hidden="true" />
              {saveState.label}
            </span>
          </div>

          <div className="builder-toolbar-actions">
            <label className="builder-switch" title={!currentResume.id && !resumeId ? 'Autosave starts after the first save' : 'Save changes automatically'}>
              <input
                type="checkbox"
                checked={autosaveEnabled}
                disabled={Boolean(saveConflict)}
                onChange={() => {
                  const newValue = !autosaveEnabled;
                  setAutosaveEnabled(newValue);
                  if (currentResume.id) {
                    writeStorageValue(`autosave_${currentResume.id}`, newValue.toString());
                  }
                  writeStorageValue('autosave_global', newValue.toString());
                }}
                className="sr-only peer"
              />
              <span className="builder-switch-track" aria-hidden="true" />
              <span className="builder-switch-label">Autosave</span>
              {(!currentResume.id && !resumeId) && <span className="sr-only">(Will apply after first save)</span>}
            </label>

            <Button
              onClick={syncProfileData}
              disabled={isSyncingProfile}
              variant="ghost"
              animate={false}
              className="builder-icon-btn"
              title="Sync profile data"
            >
              <svg aria-hidden="true" className={`h-[1.1rem] w-[1.1rem]${isSyncingProfile ? ' animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span className="sr-only">Sync Profile Data</span>
            </Button>

            <Button
              variant="outline"
              animate={false}
              onClick={handleShowPreview}
              aria-pressed={showPreview}
              className={`builder-preview-toggle${showPreview ? ' is-on' : ''}`}
            >
              <svg aria-hidden="true" className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{showPreview ? 'Hide preview' : 'Preview'}</span>
            </Button>

            <div className="builder-save-group">
              <label htmlFor="save-action" className="sr-only">Save action</label>
              <select
                id="save-action"
                value={saveAction}
                onChange={(e) => setSaveAction(e.target.value)}
                disabled={isSaving || Boolean(saveConflict)}
                className="builder-save-select"
                title="Choose whether saving also downloads a file"
              >
                <option value="save">Save only</option>
                <option value="pdf">Save + PDF</option>
                <option value="docx">Save + DOCX</option>
              </select>
              <Button
                onClick={() => handleSaveResume(saveAction)}
                disabled={isSaving || Boolean(saveConflict)}
                animate={false}
                className="builder-save-btn"
              >
                <svg aria-hidden="true" className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <span>{saveButtonLabel}</span>
              </Button>
            </div>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Resume foundation completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={`${completedCore} of ${totalCoreSections} sections ready`}
          className="builder-toolbar-progress"
        >
          <div style={{ width: `${progress}%` }} />
        </div>
      </header>

      {!saveConflict && <AutosaveIndicator status={autosaveStatus} lastSavedTimestamp={lastSavedTimestamp} />}

      {hasAlerts && (
        <div className="builder-alerts">
          {saveConflict && (
            <section aria-labelledby="resume-conflict-title" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
              <div role="alert">
                <h2 id="resume-conflict-title" className="font-semibold">{saveConflict.kind === 'recovery' ? 'Review this recovered draft' : 'Another version was saved'}</h2>
                <p className="mt-1 text-sm">Your edits are still here. Autosave is paused so this draft won’t replace newer work. Save your version as a separate resume, or reload the saved version.</p>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button onClick={() => handleConflictResolution('copy')} disabled={isSaving}>Save my version as a copy</Button>
                <Button variant="outline" onClick={() => handleConflictResolution('reload')} disabled={isSaving}>Reload saved version</Button>
              </div>
            </section>
          )}

          {draftBackupAvailable === false && (
            <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">Browser recovery storage is unavailable. Keep this tab open until you save or export your edits.</p>
          )}

          {((error && !saveConflict) || recoveryError) && (
            <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{recoveryError || error}</p>
          )}

          {recoveryDrafts.length > 0 && (
            <details className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <summary className="cursor-pointer font-medium">Other drafts available in this browser ({recoveryDrafts.length})</summary>
              <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">These recovery copies may be older or come from another tab. Opening one does not overwrite a saved resume.</p>
              <label htmlFor="recovery-draft" className="mt-3 block text-sm font-medium">Recovery copy</label>
              <select id="recovery-draft" className="select-field mt-1 w-full min-w-0" value={recoveryKey} onChange={(event) => setSelectedRecoveryKey(event.target.value)} disabled={isSaving}>
                {recoveryDrafts.map((draft) => (
                  <option key={draft.key} value={draft.key}>{draft.resume.title || 'Untitled Resume'} — {Number.isFinite(draft.editedAt) ? new Date(draft.editedAt).toLocaleString() : 'Unknown edit time'} — {draft.baseRevision ? `based on version ${draft.baseRevision}` : 'unverified version'}</option>
                ))}
              </select>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => handleRecoveryDraft()} disabled={isSaving}>Open recovery copy</Button>
                <Button variant="outline" onClick={() => handleRecoveryDraft(true)} disabled={isSaving}>Discard recovery copy</Button>
              </div>
            </details>
          )}
        </div>
      )}

      <div className="builder-mobile-nav">
        <MobileNavigation
          sections={sections}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
        />
      </div>

      <div className="builder-workspace">
        <aside className="builder-sidebar" aria-label="Resume progress and sections">
          <div className="builder-sidebar-head">
            <h2 className="builder-sidebar-title">Sections</h2>
            <span className="builder-sidebar-count">{completedCore}/{totalCoreSections} ready</span>
          </div>
          <nav aria-label="Resume sections">
            <ul className="builder-nav">
              {sections.map((section) => {
                const active = activeSection === section.id;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      className={`builder-nav-item${active ? ' is-active' : ''}`}
                      onClick={() => setActiveSection(section.id)}
                      aria-current={active ? 'step' : undefined}
                      title={section.detail ? `${section.label} — ${section.detail}` : section.label}
                    >
                      <span className="builder-nav-icon">
                        <ResumeSectionIcon icon={section.icon} className="w-4 h-4" />
                      </span>
                      <span className="builder-nav-label">{section.label}</span>
                      <BuilderSectionStatus section={section} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="builder-sidebar-foot">
            <p>{coreProgressLabel}</p>
            <Button variant="outline" size="sm" onClick={handleNextRecommendedClick} animate={false} className="w-full justify-center">
              {nextActionLabel}
            </Button>
          </div>
        </aside>

        <section className="builder-form" ref={mainContentRef} aria-label="Resume editor">
          <div className="builder-form-card">
            {renderActiveSection()}
          </div>
          {activeTip && (
            <p className="builder-tip">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
              </svg>
              <span><strong>ATS tip.</strong> {activeTip}</span>
            </p>
          )}
        </section>

        {showPreview && (
          <aside ref={resumePreviewRef} className="builder-preview-col" aria-label="Resume preview">
            <ResumePreviewPane />
            <div className="builder-back-to-edit">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToEditing}
                className="w-full"
              >
                Back to Editing
              </Button>
            </div>
          </aside>
        )}
      </div>

      {location.pathname.includes('/builder') && (
        <MobileResumeNavBar
          sections={sections}
          activeSection={activeSection}
          setActiveSection={setActiveSection}
        />
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-full left-[-200vw] opacity-0"
        style={{ width: '1024px' }}
      >
        {renderExportTemplate()}
      </div>
      {confirmDialog}
    </div>
  );
};

export default ResumeBuilder;
