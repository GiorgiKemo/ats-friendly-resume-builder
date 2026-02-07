import { supabase } from './supabase';

/**
 * Save user profile to Supabase
 * @param {Object} profileData - The user profile data to save
 * @returns {Promise<Object>} - The saved profile data
 */
export const saveUserProfile = async (profileData) => {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const {
      personal = {},
      workExperience = [],
      education = [],
      skills = [],
      certifications = [],
      projects = [],
      languages = [],
      interests = [],
      reference_list = []
    } = profileData;

    // Sanitize the data to ensure it's valid JSON
    const sanitizedPersonal = typeof personal === 'object' ? personal : {};
    const sanitizedWorkExperience = Array.isArray(workExperience) ? workExperience : [];
    const sanitizedEducation = Array.isArray(education) ? education : [];
    const sanitizedSkills = Array.isArray(skills) ? skills : [];
    const sanitizedCertifications = Array.isArray(certifications) ? certifications : [];
    const sanitizedProjects = Array.isArray(projects) ? projects : [];
    const sanitizedLanguages = Array.isArray(languages) ? languages : [];
    const sanitizedInterests = Array.isArray(interests) ? interests : [];
    const sanitizedReferenceList = Array.isArray(reference_list) ? reference_list : [];

    // Save the profile using the RPC function
    const { data, error } = await supabase
      .rpc('save_user_profile', {
        p_user_id: user.id,
        p_personal: sanitizedPersonal,
        p_work_experience: sanitizedWorkExperience,
        p_education: sanitizedEducation,
        p_skills: sanitizedSkills,
        p_certifications: sanitizedCertifications,
        p_projects: sanitizedProjects,
        p_languages: sanitizedLanguages,
        p_interests: sanitizedInterests,
        p_reference_list: sanitizedReferenceList
      });

    if (error) {
      console.error('Database error saving user profile:', error);
      throw new Error(`Failed to save user profile: ${error.message}`);
    }

    // No longer using localStorage as a fallback

    return data;
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
};

/**
 * Get user profile from Supabase
 * @returns {Promise<Object>} - The user profile data
 */
export const getUserProfile = async () => {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // Get the profile using the RPC function
    const { data, error } = await supabase
      .rpc('get_user_profile', {
        p_user_id: user.id
      });

    if (error) {
      console.error('Database error getting user profile:', error);
      throw new Error(`Failed to get user profile: ${error.message}`);
    }

    // If no profile found, return null
    if (!data || data.length === 0) {
      return null;
    }

    // Format the profile data
    const profileData = {
      personal: data[0].personal || {},
      workExperience: data[0].work_experience || [],
      education: data[0].education || [],
      skills: data[0].skills || [],
      certifications: data[0].certifications || [],
      projects: data[0].projects || [],
      languages: data[0].languages || [],
      interests: data[0].interests || [],
      references: data[0].reference_list || []
    };

    // No longer using localStorage as a fallback

    return profileData;
  } catch (error) {
    console.error('Error getting user profile:', error);

    // No longer using localStorage as a fallback

    throw error;
  }
};

/**
 * Get the current user
 * @returns {Promise<Object>} - The current user
 */
const getCurrentUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user || null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};
