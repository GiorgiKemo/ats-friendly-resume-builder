import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom'; // Removed Link
import Button from '../components/ui/Button';
import toast from 'react-hot-toast';
import { getUserProfile, saveUserProfile } from '../services/userProfileService';

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

const UserProfile = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('personal');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileData, setProfileData] = useState({
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

  const fetchUserProfile = useCallback(async () => {
    try {
      setIsLoadingProfile(true);
      // Fetch profile from Supabase
      const profile = await getUserProfile();
      if (profile) {
        setProfileData(profile);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load your profile data');
    } finally {
      setIsLoadingProfile(false);
    }
  }, [setProfileData]);

  // Load user profile data on component mount
  useEffect(() => {
    if (user) {
      fetchUserProfile();
    } else {
      navigate('/signin');
    }
  }, [user, fetchUserProfile, navigate]); // Added fetchUserProfile and navigate

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
    try {
      setIsSaving(true);
      const profileSnapshot = {
        ...profileData,
        education: Array.isArray(profileData.education) ? [...profileData.education] : [],
        certifications: Array.isArray(profileData.certifications) ? [...profileData.certifications] : []
      };

      // Save profile to Supabase
      await saveUserProfile(profileSnapshot);

      setProfileData(profileSnapshot);
      showProfileSavedToast();
    } catch (error) {
      console.error('Error saving user profile:', error);
      toast.error('Failed to save your profile data');

    } finally {
      setIsSaving(false);
    }
  };

  const updateProfileSection = (section, data) => {
    setProfileData(prev => ({
      ...prev,
      [section]: data
    }));
  };

  const sections = [
    { id: 'personal', label: 'Personal Details' },
    { id: 'education', label: 'Education & Certifications' },
    { id: 'applicationProfile', label: 'Autofill Answers' }
    // Other sections will be AI-generated based on job descriptions
    // { id: 'workExperience', label: 'Work Experience' },
    // { id: 'skills', label: 'Skills' },
    // { id: 'certifications', label: 'Certifications' },
    // { id: 'projects', label: 'Projects' },
    // { id: 'languages', label: 'Languages' },
    // { id: 'interests', label: 'Interests' },
    // { id: 'references', label: 'References' }
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
            data={profileData.workExperience}
            onChange={(data) => updateProfileSection('workExperience', data)}
          />
        );
      case 'education':
        return (
          <div className="space-y-10">
            <EducationSection
              data={profileData.education}
              onChange={(data) => updateProfileSection('education', data)}
            />
            <div className="border-t border-gray-200 pt-8 dark:border-slate-700">
              <CertificationsSection
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
            data={profileData.skills}
            onChange={(data) => updateProfileSection('skills', data)}
          />
        );
      case 'certifications':
        return (
          <CertificationsSection
            data={profileData.certifications}
            onChange={(data) => updateProfileSection('certifications', data)}
          />
        );
      case 'projects':
        return (
          <ProjectsSection
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
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Your Career Foundation</h1>
        <Button
          onClick={handleSaveUserProfile}
          disabled={isSaving}
        >
          {isSaving ? 'Saving Foundation...' : 'Save My Foundation'}
        </Button>
      </div>


      {isLoadingProfile ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-slate-400">Loading your profile...</span>
        </div>
      ) : (
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="md:w-1/4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md dark:shadow-slate-700/30 p-4 sticky top-4">
            <h2 className="text-lg font-semibold mb-4">Your Core Information</h2>
            <nav>
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-md transition-colors ${activeSection === section.id
                        ? selectedSectionClasses
                        : unselectedSectionClasses
                        }`}
                      onClick={() => setActiveSection(section.id)}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Building Your AI-Powered Resume</h3>
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                Provide your essential personal, education, and certification details below. This core information will be seamlessly integrated when our AI crafts your resume:
              </p>
              <ol className="list-decimal list-inside text-sm text-blue-700 dark:text-blue-400 space-y-1 ml-2">
                <li>Your saved personal, education, and certification details form the base.</li>
                <li>You provide a target Job Description to the AI Generator.</li>
                <li>Our AI then generates relevant Work Experience, Skills, Projects, etc., tailored to that job.</li>
                <li>You then review, edit, and perfect the AI-generated sections to match your true capabilities.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="md:w-3/4">
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
