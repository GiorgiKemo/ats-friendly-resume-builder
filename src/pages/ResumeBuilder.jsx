import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useResume } from '../context/ResumeContext';
import { useSubscription } from '../context/SubscriptionContext';
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import ResumePreviewPane from '../components/resume/ResumePreviewPane';
import AutosaveIndicator from '../components/ui/AutosaveIndicator';
import MobileNavigation from '../components/resume/MobileNavigation';
import MobileResumeNavBar from '../components/resume/MobileResumeNavBar';
import ResumeSectionIcon from '../components/resume/ResumeSectionIcon';
import ResumeSectionStatusBadge from '../components/resume/ResumeSectionStatusBadge';
import { getUserProfile } from '../services/userProfileService';
import { downloadResumePdf } from '../services/pdfService';
import { downloadResumeDocx } from '../services/docxService';
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
import AIResumeGenerator from '../components/resume/AIResumeGenerator';
import AtsCheckerDisplay from '../components/ats/AtsCheckerDisplay.jsx'; // Import ATS component
import BasicTemplate from '../components/templates/BasicTemplate';
import MinimalistTemplate from '../components/templates/MinimalistTemplate';
import TraditionalTemplate from '../components/templates/TraditionalTemplate';
import ModernTemplate from '../components/templates/ModernTemplate';
import ATSFriendlyTemplate from '../components/templates/ATSFriendlyTemplate';

const ResumeBuilder = () => {
  const { resumeId } = useParams();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const {
    currentResume,
    loading,
    error,
    hasUnsavedChanges,
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

  const [activeSection, setActiveSection] = useState('personalInfo');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(() => {
    if (resumeId) {
      const storedPreference = localStorage.getItem(`autosave_${resumeId}`);
      return storedPreference !== null ? storedPreference === 'true' : true;
    }
    const globalPreference = localStorage.getItem('autosave_global');
    return globalPreference !== null ? globalPreference === 'true' : true;
  });
  const [autosaveStatus, setAutosaveStatus] = useState(null);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(null);
  const [isSyncingProfile, setIsSyncingProfile] = useState(false);
  const [saveAction, setSaveAction] = useState('save');

  const resumePreviewRef = useRef(null);
  const hiddenExportRef = useRef(null);
  const mainContentRef = useRef(null);
  const initialProfileLoadToastShownRef = useRef(false);
  const forcedBlankRef = useRef(location.state?.forceBlank || false);
  const currentResumeRef = useRef(currentResume);

  const [resumeList, setResumeList] = useState([]);
  const [resumeListLoading, setResumeListLoading] = useState(false);

  const loadUserProfileData = useCallback(async () => {
    try {
      const profileData = await getUserProfile();
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
      console.error('Error loading user profile from Supabase:', error);
    }
  }, [initialResumeState, updateCurrentResume]);

  useEffect(() => {
    if (!resumeId && currentResume.id && currentResume.id !== resumeId && !forcedBlankRef.current) {
      navigate(`/builder/${currentResume.id}`, { replace: true });
    }
  }, [currentResume.id, resumeId, navigate]);

  useEffect(() => {
    currentResumeRef.current = currentResume;
  }, [currentResume]);

  useEffect(() => {
    let cancelled = false;
    const fetchResumes = async () => {
      if (!user) return;
      setResumeListLoading(true);
      try {
        const { getUserResumes } = await import('../services/supabaseService');
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
  }, [user]);

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

    // Update forcedBlankRef based on navigation state
    if (locationForceBlank) {
      forcedBlankRef.current = true;
      // Clear the forceBlank state from location immediately after reading it
      navigate(location.pathname, { replace: true, state: { ...location.state, forceBlank: undefined } });
    }

    if (forcedBlankRef.current && !resumeId) {
      updateCurrentResume(initialResumeState, false);
      if (typeof window !== 'undefined') {
        const draftKey = `resume_draft_new_${user?.id || 'guest'}`;
        localStorage.removeItem(draftKey);
      }
      const globalPreference = localStorage.getItem('autosave_global');
      if (globalPreference !== null) {
        setAutosaveEnabled(globalPreference === 'true');
      }
      // After processing forceBlank, reset the ref if we are not staying on a "new resume" path
      // This is now handled by the separate useEffect below.
    } else if (newlyCreatedResumeData && newlyCreatedResumeData.id === resumeId) {
      updateCurrentResume(newlyCreatedResumeData, false);
      forcedBlankRef.current = false; // Data loaded, not forced blank
      navigate(location.pathname, { replace: true, state: {} }); // Clear all state
      const globalPreference = localStorage.getItem('autosave_global');
      if (globalPreference !== null) {
        setAutosaveEnabled(globalPreference === 'true');
      }
    } else if (resumeId && user) {
      forcedBlankRef.current = false; // Loading an existing resume
      const loadResumeData = async () => {
        try {
          await loadResume(resumeId);
          const storedPreference = localStorage.getItem(`autosave_${resumeId}`);
          if (storedPreference !== null) {
            setAutosaveEnabled(storedPreference === 'true');
          }
        } catch (err) {
          console.error('Error loading resume:', err);
          toast.error('Failed to load resume. Redirecting to dashboard.');
          navigate('/dashboard');
        }
      };
      loadResumeData();
    } else if (user && !resumeId && !forcedBlankRef.current) {
      const loadProfile = async () => {
        try {
          // Restore local draft for a new resume if available
          if (typeof window !== 'undefined') {
            const draftKey = `resume_draft_new_${user?.id || 'guest'}`;
            const draftRaw = localStorage.getItem(draftKey);
            if (draftRaw) {
              try {
                const parsed = JSON.parse(draftRaw);
                if (parsed?.resume && typeof parsed.resume === 'object') {
                  updateCurrentResume(parsed.resume, false);
                  const globalPreference = localStorage.getItem('autosave_global');
                  if (globalPreference !== null) {
                    setAutosaveEnabled(globalPreference === 'true');
                  }
                  return;
                }
              } catch (parseError) {
                console.warn('Failed to parse local resume draft:', parseError);
              }
            }
          }
          await loadUserProfileData();
          const globalPreference = localStorage.getItem('autosave_global');
          if (globalPreference !== null) {
            setAutosaveEnabled(globalPreference === 'true');
          }
        } catch (err) {
          console.error('Error loading profile data:', err);
          toast.error('Could not load profile data. Starting with empty resume.');
          updateCurrentResume(initialResumeState, false);
        }
      };
      loadProfile();
    } else if (!user && !resumeId) {
      updateCurrentResume(initialResumeState, false);
      forcedBlankRef.current = true; // Treat as forced blank if no user and new path
    }
  }, [resumeId, user, loadResume, navigate, location.state, location.pathname, loadUserProfileData, updateCurrentResume, initialResumeState]);

  // Effect to reset forcedBlankRef when navigating to a specific resume or away from /builder
  useEffect(() => {
    if (resumeId || (location.pathname !== '/builder' && !location.pathname.startsWith('/builder/'))) {
      forcedBlankRef.current = false;
    }
  }, [resumeId, location.pathname]);


  const syncProfileData = async () => {
    setIsSyncingProfile(true);
    try {
      const profileData = await getUserProfile();
      if (profileData) {
        const currentProfessionalLinks = currentResume.personalInfo?.professionalLinks || {};
        const profileProfessionalLinks = profileData.personal?.professionalLinks || {};
        const linkedin = currentResume.personalInfo.linkedin || currentProfessionalLinks.linkedin || profileProfessionalLinks.linkedin || '';
        const website = currentResume.personalInfo.website || currentResume.personalInfo.portfolio || currentProfessionalLinks.portfolio || profileProfessionalLinks.portfolio || '';
        const github = currentResume.personalInfo.github || currentProfessionalLinks.github || profileProfessionalLinks.github || '';
        const other = currentResume.personalInfo.other || currentProfessionalLinks.other || profileProfessionalLinks.other || '';
        const mergedResume = {
          ...currentResume,
          personalInfo: {
            ...currentResume.personalInfo,
            fullName: currentResume.personalInfo.fullName || profileData.personal?.fullName || '',
            email: currentResume.personalInfo.email || profileData.personal?.email || '',
            phone: currentResume.personalInfo.phone || profileData.personal?.phone || '',
            location: currentResume.personalInfo.location || profileData.personal?.location || '',
            linkedin,
            website,
            portfolio: currentResume.personalInfo.portfolio || website,
            github,
            other,
            professionalLinks: {
              ...currentProfessionalLinks,
              linkedin,
              github,
              portfolio: currentResume.personalInfo.portfolio || website,
              other,
            },
          },
          education: currentResume.education && currentResume.education.length > 0 ? currentResume.education : (profileData.education || [])
        };
        updateCurrentResume(mergedResume);
        toast.success('Profile data synced into this resume!');
      }
    } catch {
      toast.error('Failed to sync profile data.');
    } finally {
      setIsSyncingProfile(false);
    }
  };

  const getResumeFilename = (resume) => `${resume.personalInfo?.fullName || resume.title || 'Resume'}_ATS_Friendly_Resume`;

  const handleSaveResume = async (action = saveAction) => {
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

      const latestResume = currentResumeRef.current;
      let savedResumeForDownload = latestResume;
      let saveSucceeded = false;

      if (latestResume.id || resumeId) {
        const idToUpdate = latestResume.id || resumeId;
        await updateResume(idToUpdate, latestResume);
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
        if (newResume && newResume.id) {
          savedResumeForDownload = { ...latestResume, id: newResume.id };
          if (location.pathname !== `/builder/${newResume.id}`) {
            navigate(`/builder/${newResume.id}`, { replace: true });
          }
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
          await downloadResumePdf(hiddenExportRef.current, savedResumeForDownload, getResumeFilename(savedResumeForDownload));
          toast.success('Resume saved and downloaded as PDF');
        } catch (downloadError) {
          console.error('Resume PDF download failed after save:', downloadError);
          toast.error(`Resume saved, but PDF download failed: ${downloadError.message || 'Unknown error'}`);
        }
      } else if (action === 'docx') {
        try {
          await downloadResumeDocx(savedResumeForDownload, getResumeFilename(savedResumeForDownload));
          toast.success('Resume saved and downloaded as DOCX');
        } catch (downloadError) {
          console.error('Resume DOCX download failed after save:', downloadError);
          toast.error(`Resume saved, but DOCX download failed: ${downloadError.message || 'Unknown error'}`);
        }
      } else {
        toast.success(latestResume.id || resumeId ? 'Resume updated successfully' : 'Resume created successfully');
      }
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error';
      toast.error(`Failed to save resume: ${errorMessage}`);
      setAutosaveStatus('error');
    } finally {
      setIsSaving(false);
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

  if (loading && !currentResume.id && !resumeId && !forcedBlankRef.current) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
        <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  const sections = buildResumeBuilderSections(currentResume, { atsScore, isPremium });
  const activeSectionMeta = sections.find((section) => section.id === activeSection) || sections[0];
  const {
    coreSections,
    completedCore,
    completedOptional,
    progress,
  } = getResumeBuilderProgress(sections);
  const nextRecommendedAction = getNextRecommendedBuilderAction(sections, { showPreview });
  const totalCoreSections = coreSections.length;
  const remainingCoreSections = Math.max(totalCoreSections - completedCore, 0);
  const coreProgressLabel = completedCore === totalCoreSections
    ? 'Your core resume foundation is ready.'
    : `${remainingCoreSections} core section${remainingCoreSections === 1 ? '' : 's'} left before export.`;
  const optionalProgressLabel = completedOptional > 0
    ? `${completedOptional} supporting section${completedOptional === 1 ? '' : 's'} added for depth.`
    : 'Add projects, certifications, or extra sections only if they strengthen the story.';

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
    if (isSaving) {
      return {
        label: 'Saving changes',
        detail: 'Updating your working copy now.',
        classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      };
    }

    if (hasUnsavedChanges && autosaveEnabled) {
      return {
        label: 'Changes queued for autosave',
        detail: 'Keep editing or save manually before leaving.',
        classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
      };
    }

    if (hasUnsavedChanges) {
      return {
        label: 'Unsaved changes',
        detail: 'Save now to lock in this version.',
        classes: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
      };
    }

    if (lastSavedTimestamp) {
      return {
        label: 'All changes saved',
        detail: formatSaveTimestamp(lastSavedTimestamp),
        classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
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

  const selectedSectionClasses = isDark
    ? 'bg-slate-700/80 text-blue-300 ring-1 ring-blue-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] font-medium'
    : 'bg-blue-100 text-blue-700 font-medium';
  const unselectedSectionClasses = isDark
    ? 'text-slate-100 hover:bg-slate-700/80'
    : 'text-slate-900 hover:bg-gray-100';

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
        return <AIResumeGenerator />;
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

  return (
    <div className="container mx-auto px-4 py-8 pb-40 md:pb-8 max-w-6xl">
      <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <label htmlFor="resume-switch" className="font-medium text-gray-700 dark:text-slate-300">Switch Resume Mode:</label>
        <select
          id="resume-switch"
          className="select-field min-w-[220px]"
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
          {resumeList.map(r => (
            <option key={r.id} value={r.id}>{r.title || 'Untitled Resume'}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-8 md:whitespace-nowrap">
        <div className="flex flex-row items-center md:whitespace-nowrap gap-2 w-full md:w-auto">
          <h1 className="text-xl md:text-2xl font-bold mr-2 md:whitespace-nowrap">
            {(currentResume.id && resumeId) || (currentResume.id && !resumeId && !forcedBlankRef.current) ? 'Edit Resume' : 'Create New Resume'}
          </h1>
          <label className="inline-flex items-center cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={autosaveEnabled}
              onChange={() => {
                const newValue = !autosaveEnabled;
                setAutosaveEnabled(newValue);
                if (currentResume.id) {
                  localStorage.setItem(`autosave_${currentResume.id}`, newValue.toString());
                }
                localStorage.setItem('autosave_global', newValue.toString());
              }}
              className="sr-only peer"
            />
            <div className="relative w-9 h-5 bg-gray-200 transition-colors peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:border-gray-300 dark:border-slate-600 after:border after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:bg-blue-600"></div>
            <span className="ml-2 text-xs md:text-sm font-medium text-gray-700 dark:text-slate-300 md:whitespace-nowrap">Autosave</span>
          </label>
          {(!currentResume.id && !resumeId) && (
            <span className="ml-2 text-xs text-gray-500 dark:text-slate-500 md:whitespace-nowrap">(Will apply after first save)</span>
          )}
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto md:justify-end md:whitespace-nowrap">
          <div className="flex flex-row gap-2 w-full md:w-auto">
            <Button
              variant={showPreview ? "primary" : "outline"}
              onClick={handleShowPreview}
              className="flex items-center px-3 py-2 md:min-w-[120px] text-sm md:text-base flex-1 md:flex-none"
            >
              {showPreview ? (
                <>
                  <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="md:hidden truncate">Hide</span>
                  <span className="hidden md:inline truncate">Hide Preview</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className="md:hidden truncate">Preview</span>
                  <span className="hidden md:inline truncate">Show Preview</span>
                </>
              )}
            </Button>
            <Button
              onClick={syncProfileData}
              variant="outline"
              className="flex items-center px-3 py-2 md:min-w-[120px] text-sm md:text-base flex-1 md:flex-none"
            >
              {isSyncingProfile && (
                <svg className="animate-spin w-4 h-4 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
              )}
              {!isSyncingProfile && (
                <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              )}
              <span className="md:hidden truncate">Sync Data</span>
              <span className="hidden md:inline truncate">Sync Profile Data</span>
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <label htmlFor="save-action" className="sr-only">Save action</label>
            <select
              id="save-action"
              value={saveAction}
              onChange={(e) => setSaveAction(e.target.value)}
              disabled={isSaving}
              className="select-field w-full md:w-auto text-sm md:text-base"
            >
              <option value="save">Save only</option>
              <option value="pdf">Save + PDF</option>
              <option value="docx">Save + DOCX</option>
            </select>
            <Button
              onClick={() => handleSaveResume(saveAction)}
              disabled={isSaving}
              className="flex items-center justify-center px-3 py-2 md:min-w-[150px] text-sm md:text-base w-full md:w-auto"
            >
              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              <span className="md:hidden truncate">
                {isSaving
                  ? (currentResume.id ? 'Saving...' : 'Creating...')
                  : saveAction === 'pdf'
                    ? (currentResume.id ? 'Save + PDF' : 'Create + PDF')
                    : saveAction === 'docx'
                      ? (currentResume.id ? 'Save + DOCX' : 'Create + DOCX')
                      : (currentResume.id ? 'Save' : 'Create')}
              </span>
              <span className="hidden md:inline truncate">
                {isSaving
                  ? (currentResume.id ? 'Saving...' : 'Creating...')
                  : saveAction === 'pdf'
                    ? (currentResume.id ? 'Save Resume + PDF' : 'Create Resume + PDF')
                    : saveAction === 'docx'
                      ? (currentResume.id ? 'Save Resume + DOCX' : 'Create Resume + DOCX')
                      : (currentResume.id ? 'Save Resume' : 'Create Resume')}
              </span>
            </Button>
          </div>
        </div>
      </div>

      <AutosaveIndicator status={autosaveStatus} lastSavedTimestamp={lastSavedTimestamp} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.95fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
                Builder Status
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                Keep the important sections complete before you polish the extras.
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
                {coreProgressLabel}
              </p>
            </div>
            <span className={`inline-flex w-fit rounded-full px-3 py-1 text-sm font-medium ${saveState.classes}`}>
              {saveState.label}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Core Progress
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {completedCore}/{totalCoreSections}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                {completedCore === totalCoreSections ? 'Ready to preview or check.' : 'Foundational sections complete.'}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Current Focus
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                {activeSectionMeta?.label || 'Resume section'}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                {activeSectionMeta?.detail || 'Work through the next section.'}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Save State
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                {autosaveEnabled ? 'Autosave on' : 'Manual save mode'}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                {saveState.detail}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
              <span>Foundation completion</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-2.5 rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-slate-400">
              {optionalProgressLabel}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">
            Next Recommended
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {nextRecommendedAction.title}
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            {nextRecommendedAction.detail}
          </p>

          <Button
            onClick={handleNextRecommendedClick}
            className="mt-4 w-full justify-center"
          >
            {nextRecommendedAction.label}
          </Button>

          <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/80">
            {coreSections.map((section) => (
              <div key={section.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                    <ResumeSectionIcon icon={section.icon} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {section.label}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                      {section.detail}
                    </p>
                  </div>
                </div>
                <ResumeSectionStatusBadge section={section} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <MobileNavigation
        sections={sections}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />

      <div className={`flex flex-col ${showPreview ? 'lg:flex-row' : 'md:flex-row'} gap-8`}>
        <div className={`hidden md:block ${showPreview ? 'lg:w-1/5' : 'md:w-1/4'}`}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 p-4 sticky top-4">
            <h2 className="text-lg font-semibold mb-4">Resume Sections</h2>
            <nav>
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${activeSection === section.id
                        ? selectedSectionClasses
                        : unselectedSectionClasses
                        }`}
                      onClick={() => setActiveSection(section.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                            <ResumeSectionIcon icon={section.icon} className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {section.label}
                            </p>
                            {section.detail && (
                              <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                                {section.detail}
                              </p>
                            )}
                          </div>
                        </div>
                        <ResumeSectionStatusBadge section={section} className="flex-shrink-0" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">ATS Tips</h3>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                {activeSection === 'personalInfo' && 'Use a professional email and include your LinkedIn profile for better visibility.'}
                {activeSection === 'workExperience' && 'Use action verbs and quantify your achievements with specific metrics.'}
                {activeSection === 'education' && 'List your highest degree first and include relevant coursework.'}
                {activeSection === 'skills' && 'Include both hard skills (technical) and soft skills relevant to the job.'}
                {activeSection === 'certifications' && 'Include the certification name, issuing organization, and date.'}
                {activeSection === 'projects' && 'Highlight projects that demonstrate skills relevant to your target job.'}
                {activeSection === 'additionalSections' && 'Only include sections that are relevant to the job you are applying for.'}
                {activeSection === 'template' && 'Choose a clean, single-column layout for maximum ATS compatibility.'}

                {activeSection === 'aiGenerator' && 'Customize AI-generated content to reflect your actual experience and achievements.'}
                {activeSection === 'atsCheck' && 'Review your ATS score and address critical issues to improve compatibility.'}
              </p>
            </div>
          </div>
        </div>

        <div className={`w-full ${showPreview ? 'lg:w-2/5' : 'md:w-3/4'}`} ref={mainContentRef}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 p-4 md:p-6">
            {renderActiveSection()}
          </div>
        </div>

        {showPreview && (
          <div ref={resumePreviewRef} className="w-full mt-6 lg:mt-0 lg:w-2/5">
            <div className="sticky top-4">
              <ResumePreviewPane />

              <div className="flex justify-center mt-4 lg:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToEditing}
                  className="w-full"
                >
                  Back to Editing
                </Button>
              </div>
            </div>
          </div>
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
        className="pointer-events-none fixed left-[-200vw] top-0 opacity-0"
        style={{ width: '1024px' }}
      >
        {renderExportTemplate()}
      </div>
    </div>
  );
};

export default ResumeBuilder;
