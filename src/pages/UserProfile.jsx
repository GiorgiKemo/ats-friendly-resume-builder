import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom'; // Removed Link
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { getUserProfile, saveUserProfile } from '../services/userProfileService';
import { useProfileDraft } from '../context/ProfileDraftContext';
import { hasSameProfileVersion } from '../utils/profileDraftSession';

// Import profile section components
import PersonalDetailsSection from '../components/profile/PersonalDetailsSection';
import WorkExperienceSection from '../components/profile/WorkExperienceSection';
import EducationSection from '../components/profile/EducationSection';
import SkillsSection from '../components/profile/SkillsSection';
import CertificationsSection from '../components/profile/CertificationsSection';
import ProjectsSection from '../components/profile/ProjectsSection';
import LanguagesSection from '../components/profile/LanguagesSection';
import InterestsSection from '../components/profile/InterestsSection';
import ReferencesSection from '../components/profile/ReferencesSection';
import ApplicationProfileSection from '../components/profile/ApplicationProfileSection';

const emptyProfile = () => ({
    personal: {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      professionalLinks: {
        linkedin: '',
        github: '',
        portfolio: '',
        other: ''
      }
    },
    workExperience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    languages: [],
    interests: [],
    references: [],
    applicationProfile: {}
});

const UserProfile = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const userId = user?.id || null;
  const drafts = useProfileDraft();
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const saveRequestRef = useRef(null);
  const editVersionRef = useRef(0);
  const reloadRequestRef = useRef(null);
  const [activeSection, setActiveSection] = useState('personal');
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [profileData, setProfileData] = useState(emptyProfile);
  const [entryDrafts, setEntryDrafts] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const profileDataRef = useRef(profileData);
  profileDataRef.current = profileData;
  const entryDraftsRef = useRef(entryDrafts);
  entryDraftsRef.current = entryDrafts;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const pendingEntries = Object.entries(entryDrafts).filter(([, draft]) => draft?.pending).map(([section]) => section);
  const profileReady = Boolean(userId && loadedUserId === userId && !isLoadingProfile && !loadError);

  useEffect(() => {
    let active = true;
    setProfileData(emptyProfile());
    setLoadedUserId(null);
    setLoadError(false);
    setIsLoadingProfile(true);
    setIsSaving(false);
    setHasUnsavedChanges(false);
    setEntryDrafts({});
    setSaveError(null);
    setSaveConflict(false);
    setConfirmReload(false);
    setIsReloading(false);
    reloadRequestRef.current = null;
    setActiveSection('personal');
    saveRequestRef.current = null;
    editVersionRef.current = 0;
    if (!userId) {
      navigate('/signin');
      return () => { active = false; };
    }

    const load = async () => {
      const startedAtSequence = drafts?.sequence(userId);
      try {
        const profile = await getUserProfile(userId);
        if (!active || activeUserIdRef.current !== userId) return;
        const savedProfile = (drafts?.reconcileLoad(userId, profile, startedAtSequence) ?? profile) || emptyProfile();
        const cached = drafts?.read(userId);
        setProfileData(cached?.profileData || savedProfile);
        setEntryDrafts(cached?.entryDrafts || {});
        setActiveSection(cached?.activeSection || 'personal');
        setHasUnsavedChanges(Boolean(cached?.hasUnsavedChanges));
        setSaveConflict(Boolean(cached && !hasSameProfileVersion(cached.profileData, savedProfile)));
        setLoadedUserId(userId);
      } catch (error) {
        if (!active || activeUserIdRef.current !== userId) return;
        console.error('Error fetching user profile:', error);
        setLoadError(true);
      } finally {
        if (active && activeUserIdRef.current === userId) setIsLoadingProfile(false);
      }
    };
    void load();
    return () => { active = false; saveRequestRef.current = null; reloadRequestRef.current = null; };
  }, [userId, loadAttempt, navigate, drafts]);

  // A save can finish after this route was left and reopened. Only our own
  // acknowledged branch can advance the reopened editor's expected revision.
  useEffect(() => drafts?.subscribe(userId, ({ submittedProfile, metadata, hasNewerEdits }) => {
    if (activeUserIdRef.current !== userId || !hasSameProfileVersion(profileDataRef.current, submittedProfile)) return;
    const next = { ...profileDataRef.current, id: metadata.profile_id, revision: metadata.revision, updatedAt: metadata.updated_at };
    profileDataRef.current = next;
    hasUnsavedChangesRef.current = hasNewerEdits;
    setProfileData(next);
    setHasUnsavedChanges(hasNewerEdits);
    setSaveConflict(false);
  }), [drafts, userId]);

  const rememberDraft = (profile = profileDataRef.current, entries = entryDraftsRef.current, section = activeSectionRef.current, dirty = hasUnsavedChangesRef.current) => {
    if (dirty || Object.values(entries).some((entry) => entry?.pending)) {
      drafts?.write(userId, { profileData: profile, entryDrafts: entries, activeSection: section, hasUnsavedChanges: dirty });
    } else drafts?.clear(userId);
  };

  const selectSection = (section) => {
    if (activeUserIdRef.current !== userId) return;
    activeSectionRef.current = section;
    setActiveSection(section);
    rememberDraft(profileDataRef.current, entryDraftsRef.current, section);
  };

  const updateEntryDraft = (section, draft) => {
    if (!profileReady || activeUserIdRef.current !== userId) return;
    editVersionRef.current += 1;
    const next = { ...entryDraftsRef.current, [section]: draft };
    entryDraftsRef.current = next;
    setEntryDrafts(next);
    rememberDraft(profileDataRef.current, next);
  };

  const entryProps = (section) => ({ draft: entryDrafts[section] || null, onDraftChange: (draft) => updateEntryDraft(section, draft) });

  const showProfileSavedToast = () => {
    toast.custom((t) => (
      <div
        className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-xl shadow-slate-900/10 dark:border-emerald-500/30 dark:bg-slate-800 dark:shadow-slate-950/40 ${
          t.visible ? 'animate-enter' : 'animate-leave'
        }`}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            OK
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Career foundation saved</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Your profile details are ready for resume generation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            className="rounded-md px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            aria-label="Dismiss notification"
          >
            Close
          </button>
        </div>
      </div>
    ), { duration: 3500 });
  };

  const handleSaveUserProfile = async () => {
    if (!profileReady || activeUserIdRef.current !== userId || saveRequestRef.current || reloadRequestRef.current || saveConflict) return;
    if (Object.values(entryDraftsRef.current).some((draft) => draft?.pending)) {
      setSaveError('Finish or discard your unfinished entries before saving your profile.');
      return;
    }
    const request = { userId, editVersion: editVersionRef.current };
    saveRequestRef.current = request;
    const isCurrent = () => saveRequestRef.current === request && activeUserIdRef.current === userId;
    try {
      setIsSaving(true);
      setSaveError(null);
      const profileSnapshot = {
        ...profileDataRef.current,
        education: Array.isArray(profileDataRef.current.education) ? [...profileDataRef.current.education] : [],
        certifications: Array.isArray(profileDataRef.current.certifications) ? [...profileDataRef.current.certifications] : []
      };

      // Save profile to Supabase
      const saved = await saveUserProfile(profileSnapshot, userId);
      drafts?.acknowledge(userId, profileSnapshot, saved);
      if (isCurrent()) {
        const next = { ...profileDataRef.current, id: saved.profile_id, revision: saved.revision, updatedAt: saved.updated_at };
        profileDataRef.current = next;
        setProfileData(next);
        if (editVersionRef.current === request.editVersion) {
          hasUnsavedChangesRef.current = false;
          setHasUnsavedChanges(false);
          showProfileSavedToast();
        } else {
          hasUnsavedChangesRef.current = true;
          setHasUnsavedChanges(true);
          rememberDraft(next, entryDraftsRef.current, activeSectionRef.current, true);
          toast('Earlier changes saved. Save again to include your latest edits.');
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Error saving user profile:', error);
      setSaveConflict(error?.code === 'PROFILE_CONFLICT');
      setSaveError(error?.code === 'PROFILE_CONFLICT' ? null : 'Your profile was not saved. Your edits are still here; try again.');

    } finally {
      if (isCurrent()) {
        saveRequestRef.current = null;
        setIsSaving(false);
      }
    }
  };

  const updateProfileSection = (section, data) => {
    if (!profileReady || activeUserIdRef.current !== userId) return;
    editVersionRef.current += 1;
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
    const next = {
      ...profileDataRef.current,
      [section]: data
    };
    profileDataRef.current = next;
    setProfileData(next);
    rememberDraft(next, entryDraftsRef.current, activeSection, true);
  };

  const reloadSavedProfile = async () => {
    if (!profileReady || activeUserIdRef.current !== userId || saveRequestRef.current || reloadRequestRef.current) return;
    const request = { userId, editVersion: editVersionRef.current };
    reloadRequestRef.current = request;
    const isCurrent = () => reloadRequestRef.current === request && activeUserIdRef.current === userId;
    setIsReloading(true);
    setSaveError(null);
    const startedAtSequence = drafts?.sequence(userId);
    try {
      const profile = await getUserProfile(userId);
      if (!isCurrent()) return;
      if (editVersionRef.current !== request.editVersion) {
        setSaveError('You edited your profile while it was loading. Those edits were kept; choose reload again when ready.');
        return;
      }
      const next = (drafts?.reconcileLoad(userId, profile, startedAtSequence) ?? profile) || emptyProfile();
      profileDataRef.current = next;
      entryDraftsRef.current = {};
      hasUnsavedChangesRef.current = false;
      setProfileData(next);
      setEntryDrafts({});
      setHasUnsavedChanges(false);
      setSaveConflict(false);
      setConfirmReload(false);
      drafts?.clear(userId);
    } catch {
      if (isCurrent()) setSaveError('The saved profile could not be loaded. Your edits were kept; try again.');
    } finally {
      if (isCurrent()) { reloadRequestRef.current = null; setIsReloading(false); }
    }
  };

  const sections = [
    { id: 'personal', label: 'Personal Details' },
    { id: 'workExperience', label: 'Work History' },
    { id: 'education', label: 'Education & Certifications' },
    { id: 'skills', label: 'Skills' },
    { id: 'projects', label: 'Projects' },
    { id: 'applicationProfile', label: 'Autofill Answers' }
  ];
  const selectedSectionClasses = isDark
    ? 'bg-slate-700/80 text-blue-300 ring-1 ring-blue-400/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] font-medium'
    : 'bg-blue-100 text-blue-700 font-medium';
  const unselectedSectionClasses = isDark
    ? 'text-slate-100 hover:bg-slate-700/80'
    : 'text-slate-900 hover:bg-gray-100';

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'personal':
        return (
          <PersonalDetailsSection
            data={profileData.personal}
            onChange={(data) => updateProfileSection('personal', data)}
          />
        );
      case 'workExperience':
        return (
          <WorkExperienceSection
            {...entryProps('workExperience')}
            data={profileData.workExperience}
            onChange={(data) => updateProfileSection('workExperience', data)}
          />
        );
      case 'education':
        return (
          <div className="space-y-10">
            <EducationSection
              {...entryProps('education')}
              data={profileData.education}
              onChange={(data) => updateProfileSection('education', data)}
            />
            <div className="border-t border-gray-200 pt-8 dark:border-slate-700">
              <CertificationsSection
                {...entryProps('certifications')}
                data={profileData.certifications}
                onChange={(data) => updateProfileSection('certifications', data)}
              />
            </div>
          </div>
        );
      case 'applicationProfile':
        return (
          <ApplicationProfileSection
            data={profileData.applicationProfile}
            onChange={(data) => updateProfileSection('applicationProfile', data)}
          />
        );
      case 'skills':
        return (
          <SkillsSection
            {...entryProps('skills')}
            data={profileData.skills}
            onChange={(data) => updateProfileSection('skills', data)}
          />
        );
      case 'certifications':
        return (
          <CertificationsSection
            {...entryProps('certifications')}
            data={profileData.certifications}
            onChange={(data) => updateProfileSection('certifications', data)}
          />
        );
      case 'projects':
        return (
          <ProjectsSection
            {...entryProps('projects')}
            data={profileData.projects}
            onChange={(data) => updateProfileSection('projects', data)}
          />
        );
      case 'languages':
        return (
          <LanguagesSection
            data={profileData.languages}
            onChange={(data) => updateProfileSection('languages', data)}
          />
        );
      case 'interests':
        return (
          <InterestsSection
            data={profileData.interests}
            onChange={(data) => updateProfileSection('interests', data)}
          />
        );
      case 'references':
        return (
          <ReferencesSection
            data={profileData.references}
            onChange={(data) => updateProfileSection('references', data)}
          />
        );
      default:
        return <PersonalDetailsSection />;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Your Career Foundation</h1>
        <Button
          onClick={handleSaveUserProfile}
          disabled={isSaving || isReloading || !profileReady || saveConflict}
        >
          {isSaving ? 'Saving...' : 'Save profile'}
        </Button>
      </div>


      {(hasUnsavedChanges || pendingEntries.length > 0) && profileReady && <p role="status" className="mb-4 text-sm text-amber-700 dark:text-amber-300">You have unsaved profile changes. They stay in this tab while you navigate, but will be lost if you reload, close it, or sign out.</p>}
      {profileReady && pendingEntries.length > 0 && (
        <section aria-label="Unfinished profile entries" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Finish these entries before saving</p>
          <p className="mt-1 text-sm">Use Add or Update to include each entry in your profile, or discard the unfinished entry.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingEntries.map((section) => <Button key={section} variant="outline" size="sm" onClick={() => selectSection(section === 'certifications' ? 'education' : section)}>{section === 'certifications' ? 'Certifications' : sections.find((item) => item.id === section)?.label || section}</Button>)}
          </div>
        </section>
      )}
      {profileReady && saveConflict && (
        <section aria-label="Profile save conflict" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <div role="alert"><h2 className="font-semibold">Another version of your profile was saved</h2><p className="mt-1 text-sm">Your edits are still here. Saving is paused to protect the newer version. Copy any details you want to keep before loading the saved profile.</p></div>
          {confirmReload ? <div className="mt-3"><p className="mb-2 text-sm">Replace the profile and unfinished entries shown here with the latest saved details?</p><div className="flex flex-wrap gap-2"><Button onClick={reloadSavedProfile} disabled={isReloading}>Replace local edits</Button><Button variant="outline" onClick={() => setConfirmReload(false)} disabled={isReloading}>Keep editing</Button></div></div>
            : <Button className="mt-3" variant="outline" onClick={() => setConfirmReload(true)}>Load saved profile</Button>}
        </section>
      )}
      {profileReady && saveError && <p role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{saveError}</p>}
      {loadError ? (
        <div role="alert" className="rounded-lg border border-red-200 p-6 dark:border-red-800">
          <p className="mb-3">Your profile could not be loaded. Editing is paused to protect your saved details.</p>
          <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</Button>
        </div>
      ) : !profileReady ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-slate-400">Loading your profile...</span>
        </div>
      ) : (
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="md:w-1/4">
          <div className="sticky top-[calc(var(--app-header-height)+1rem)] rounded-lg border border-gray-200 bg-white p-4 shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-700/30">
            <label className="mb-2 block text-sm font-medium md:hidden" htmlFor="profile-section">Profile section</label>
            <select
              id="profile-section"
              value={activeSection}
              onChange={(event) => selectSection(event.target.value)}
              className="min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-800 md:hidden"
            >
              {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
            <h2 className="mb-4 hidden text-lg font-semibold md:block">Your Core Information</h2>
            <nav className="hidden md:block" aria-label="Profile sections">
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-md transition-colors ${activeSection === section.id
                        ? selectedSectionClasses
                        : unselectedSectionClasses
                        }`}
                      onClick={() => selectSection(section.id)}
                      aria-current={activeSection === section.id ? 'step' : undefined}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-4 rounded-md bg-blue-50 p-3 dark:bg-blue-900/20 md:mt-8 md:p-4">
              <h3 className="mb-2 hidden font-medium text-blue-800 dark:text-blue-300 md:block">Your facts come first</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Save your real details here to reuse in resumes. AI can help tailor the wording, but review every draft and keep only claims you can support.
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="min-w-0 md:w-3/4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 p-6">
            {renderActiveSection()}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default UserProfile;
