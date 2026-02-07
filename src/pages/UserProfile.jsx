import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import { useAuth } from '../context/AuthContext';
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

const UserProfile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('personal');
  const [isSaving, setIsSaving] = useState(false);
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
    references: []
  });

  const fetchUserProfile = useCallback(async () => {
    try {
      // Fetch profile from Supabase
      const profile = await getUserProfile();
      if (profile) {
        setProfileData(profile);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load your profile data');

      // No longer using localStorage as a fallback
      console.log('Unable to load profile data from database');
    }
  }, [setProfileData]); // Removed stable getUserProfile and toast from deps

  // Load user profile data on component mount
  useEffect(() => {
    if (user) {
      fetchUserProfile();
    } else {
      navigate('/signin');
    }
  }, [user, fetchUserProfile, navigate]); // Added fetchUserProfile and navigate

  const handleSaveUserProfile = async () => {
    try {
      // Fetch profile from Supabase
      const profile = await getUserProfile();
      if (profile) {
        setProfileData(profile);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      toast.error('Failed to load your profile data');

      // No longer using localStorage as a fallback
      console.log('Unable to load profile data from database');
    }
    try {
      setIsSaving(true);

      // Save profile to Supabase
      await saveUserProfile(profileData);

      toast.success('Profile saved successfully');
    } catch (error) {
      console.error('Error saving user profile:', error);
      toast.error('Failed to save your profile data');

      // No longer using localStorage as a fallback
      console.log('Unable to save profile data to database');
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
    { id: 'education', label: 'Education' }
    // Other sections will be AI-generated based on job descriptions
    // { id: 'workExperience', label: 'Work Experience' },
    // { id: 'skills', label: 'Skills' },
    // { id: 'certifications', label: 'Certifications' },
    // { id: 'projects', label: 'Projects' },
    // { id: 'languages', label: 'Languages' },
    // { id: 'interests', label: 'Interests' },
    // { id: 'references', label: 'References' }
  ];

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
          <EducationSection
            data={profileData.education}
            onChange={(data) => updateProfileSection('education', data)}
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


      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="md:w-1/4">
          <div className="bg-white rounded-lg shadow-md p-4 sticky top-4">
            <h2 className="text-lg font-semibold mb-4">Your Core Information</h2>
            <nav>
              <ul className="space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-md transition-colors ${activeSection === section.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'hover:bg-gray-100'
                        }`}
                      onClick={() => setActiveSection(section.id)}
                    >
                      {section.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-8 p-4 bg-blue-50 rounded-md">
              <h3 className="font-medium text-blue-800 mb-2">Building Your AI-Powered Resume</h3>
              <p className="text-sm text-blue-700 mb-2">
                Provide your essential personal and educational details below. This core information will be seamlessly integrated when our AI crafts your resume:
              </p>
              <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1 ml-2">
                <li>Your saved Personal & Education details form the base.</li>
                <li>You provide a target Job Description to the AI Generator.</li>
                <li>Our AI then generates relevant Work Experience, Skills, Projects, etc., tailored to that job.</li>
                <li>You then review, edit, and perfect the AI-generated sections to match your true capabilities.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="md:w-3/4">
          <div className="bg-white rounded-lg shadow-md p-6">
            {renderActiveSection()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
