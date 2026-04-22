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
import { getUserProfile } from '../services/userProfileService';
import { downloadResumePdf } from '../services/pdfService';
import { downloadResumeDocx } from '../services/docxService';

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

  const sections = [
    { id: 'personalInfo', label: 'Contact Information', icon: 'user' },
    { id: 'workExperience', label: 'Work History', icon: 'briefcase' },
    { id: 'education', label: 'Education', icon: 'academic-cap' },
    { id: 'skills', label: 'Skills & Expertise', icon: 'chip' },
    { id: 'certifications', label: 'Certifications', icon: 'badge-check' },
    { id: 'projects', label: 'Projects', icon: 'code' },
    { id: 'additionalSections', label: 'Additional Info', icon: 'document-plus' },
    { id: 'template', label: 'Choose Template', icon: 'template' },
    { id: 'aiGenerator', label: 'AI Content Generator', icon: 'sparkles' },
    { id: 'atsCheck', label: 'ATS Check & Score', icon: 'clipboard-check' }, // New ATS section
  ];
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
                      className={`w-full text-left px-4 py-2 rounded-md transition-colors flex items-center ${activeSection === section.id
                        ? selectedSectionClasses
                        : unselectedSectionClasses
                        }`}
                      onClick={() => setActiveSection(section.id)}
                    >
                      <span className="mr-2 w-5 h-5 inline-flex items-center justify-center">
                        {section.icon === 'user' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        )}
                        {section.icon === 'briefcase' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        )}
                        {section.icon === 'academic-cap' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M12 14l9-5-9-5-9 5z" />
                            <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                          </svg>
                        )}
                        {section.icon === 'chip' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                        )}
                        {section.icon === 'badge-check' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                        )}
                        {section.icon === 'code' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          </svg>
                        )}
                        {section.icon === 'document-plus' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                        {section.icon === 'template' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                          </svg>
                        )}
                        {section.icon === 'sparkles' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                        )}
                        {section.icon === 'clipboard-check' && ( // Icon for ATS Check
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                          </svg>
                        )}
                      </span>
                      {section.label}
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
