// Import the Supabase client from the centralized supabase.js file
import { supabase } from './supabase';

/**
 * Authentication functions
 */

// Sign up a new user
export const signUp = async (email, password, fullName) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error signing up:', error);
    throw error;
  }
};

// Sign in a user
export const signIn = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

// Sign out a user
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// Get the current user
export const getCurrentUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user || null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

/**
 * Resume functions
 */

// Get all resumes for the current user
export const getUserResumes = async () => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      // console.error('[supabaseService] getUserResumes: User not authenticated at the time of call.'); // Kept for important errors
      throw new Error('User not authenticated');
    }

    // Double security: filter by user ID both in code and in the database
    const { data, error } = await supabase
      .from('user_resumes')
      .select('id, title, description, updated_at, last_accessed_at, user_id, personal_info, selected_template, is_public') // Select only necessary fields for list view
      .eq('user_id', user.id) // Filter by the current user's ID
      .order('last_accessed_at', { ascending: false });

    if (error) {
      // console.error(`[supabaseService] getUserResumes: Supabase error for user.id ${user.id}:`, JSON.stringify(error)); // Kept for important errors
      throw error;
    }

    // Additional verification to ensure data belongs to the current user (this is redundant if RLS is working but good for sanity)
    const filteredData = data.filter(resume => resume.user_id === user.id);
    if (data.length !== filteredData.length) {
      // This warning can be useful if there's a mismatch, indicating potential RLS or view issues.
      console.warn('[supabaseService] getUserResumes: Post-fetch filter removed some resumes, indicating a potential mismatch between client-side and server-side filtering. Original count:', data.length, 'Filtered count:', filteredData.length);
    }

    return filteredData;
  } catch (error) {
    console.error('[supabaseService] getUserResumes: Error fetching resumes:', error);
    throw error;
  }
};

// Get a resume by ID with its content
export const getResumeById = async (resumeId) => {
  // console.log(`[SupabaseService] getResumeById: Called for ${resumeId}.`); // Diagnostic log
  try {
    const user = await getCurrentUser();
    if (!user) {
      // console.error('[SupabaseService] getResumeById: User not authenticated.'); // Diagnostic log
      throw new Error('User not authenticated');
    }
    // console.log(`[SupabaseService] getResumeById: User authenticated (ID: ${user.id}). Calling RPC get_resume_with_content for resumeId: ${resumeId}`); // Diagnostic log
    // Use the RPC function which already has user ID filtering built in
    const { data, error } = await supabase
      .rpc('get_resume_with_content', { p_resume_id: resumeId });

    // console.log(`[SupabaseService] getResumeById: RPC returned for ${resumeId}. Error: ${JSON.stringify(error)}, Data received: ${!!data}`); // Diagnostic log

    if (error) {
      // console.error(`[SupabaseService] getResumeById: RPC error for ${resumeId}:`, error); // Diagnostic log
      throw error;
    }

    // The RPC 'get_resume_with_content' already filters by auth.uid(),
    // so this additional client-side check is redundant and might cause issues
    // with timing if user object from getCurrentUser() is slightly different from auth.uid() context in RPC.
    // if (data && data.length > 0 && data[0].user_id !== user.id) {
    //   console.error('Security warning: Attempted to access resume belonging to another user');
    //   return null;
    // }

    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error getting resume:', error);
    throw error;
  }
};

// Save a resume (create or update)
/**
 * Saves or updates a resume.
 * @param {object} resumeData - The resume data to save.
 * @param {string | null} [resumeId=null] - The ID of the resume to update. If null, a new resume is created.
 * @returns {Promise<object>} A promise that resolves to an object typically containing the resume_id or the full RPC response.
 */
export const saveResume = async (resumeData, resumeId = null) => {
  try {
    // console.log('saveResume called with:', { resumeData: 'summary', resumeId }); // Debug log
    const user = await getCurrentUser();
    if (!user) {
      console.error('saveResume: User not authenticated');
      throw new Error('User not authenticated');
    }

    // console.log('Current user ID:', user.id); // Debug log
    const {
      title = 'Untitled Resume',
      description = '',
      selectedTemplate = 'basic',
      selectedFont = 'Arial',
      isPublic = false,
      personalInfo = {},
      workExperience = [],
      education = [],
      skills = [],
      certifications = [],
      projects = [],
      additionalSections = []
    } = resumeData;

    // Sanitize the data to ensure it's valid JSON
    const sanitizedPersonalInfo = typeof personalInfo === 'object' ? personalInfo : {};
    const sanitizedWorkExperience = Array.isArray(workExperience) ? workExperience : [];
    const sanitizedEducation = Array.isArray(education) ? education : [];
    const sanitizedSkills = Array.isArray(skills) ? skills : [];
    const sanitizedCertifications = Array.isArray(certifications) ? certifications : [];
    const sanitizedProjects = Array.isArray(projects) ? projects : [];
    const sanitizedAdditionalSections = Array.isArray(additionalSections) ? additionalSections : [];

    // If we're updating an existing resume, first check if it exists
    if (resumeId) {
      const { data: existingResume, error: checkError } = await supabase
        .from('resumes')
        .select('id')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking resume existence:', checkError);
        throw new Error('Failed to verify resume ownership');
      }

      if (!existingResume) {
        throw new Error('Resume not found or you do not have permission to update it');
      }
    }

    // Save the resume
    const { data, error } = await supabase
      .rpc('save_resume', {
        p_user_id: user.id,
        p_title: title,
        p_description: description,
        p_selected_template: selectedTemplate,
        p_selected_font: selectedFont,
        p_is_public: isPublic,
        p_personal_info: sanitizedPersonalInfo,
        p_work_experience: sanitizedWorkExperience,
        p_education: sanitizedEducation,
        p_skills: sanitizedSkills,
        p_certifications: sanitizedCertifications,
        p_projects: sanitizedProjects,
        p_additional_sections: sanitizedAdditionalSections,
        p_resume_id: resumeId
      });

    if (error) {
      console.error('saveResume: Database error saving resume via RPC:', error);
      throw new Error(`Failed to save resume: ${error.message}`);
    }

    // The 'save_resume' RPC function is expected to return the UUID of the saved resume directly.
    if (typeof data === 'string' && data.length > 0) { // data is the resume_id (UUID string)
      return { resume_id: data }; // Consistently return an object
    } else {
      // This block handles unexpected responses from the RPC.
      console.error('saveResume: RPC did not return a valid UUID string as expected. Response:', data);
      // Attempting to fetch the most recent resume as a fallback if it was a new resume creation.
      // This fallback should ideally not be needed if the RPC is reliable.
      if (!resumeId) { // Only try fallback if it was a new resume
        console.warn('saveResume: Attempting fallback to fetch most recent resume for new creation.');
        const { data: recentResumes, error: fetchError } = await supabase
          .from('resumes')
          .select('id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (fetchError) {
          console.error('saveResume: Error during fallback fetch of recent resume:', fetchError);
          throw new Error('Failed to save or verify resume: Unexpected RPC response and fallback fetch failed.');
        }
        if (recentResumes && recentResumes.length > 0) {
          return { resume_id: recentResumes[0].id };
        }
      }
      // If it's an update or fallback failed for new resume
      console.error('saveResume: Critical error - could not obtain resume ID after save operation.');
      throw new Error('Failed to save resume: Unexpected response from server and could not verify operation.');
    }
  } catch (error) {
    console.error('saveResume: General error:', error);
    throw error;
  }
};

// Delete a resume
export const deleteResume = async (resumeId) => {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    // First check if the resume exists
    const { data: checkData, error: checkError } = await supabase
      .from('resumes')
      .select('id')
      .eq('id', resumeId)
      .eq('user_id', user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking resume existence:', checkError);
      throw new Error('Failed to verify resume ownership');
    }

    if (!checkData) {
      console.warn('Resume not found or not owned by user:', resumeId);
      return false;
    }

    // Delete using the RPC function
    const { error } = await supabase // data was unused
      .rpc('delete_resume', {
        p_resume_id: resumeId,
        p_user_id: user.id
      });

    if (error) {
      console.error('deleteResume: Error in delete_resume RPC:', error);
      throw error;
    }
    // console.log(`delete_resume RPC for resumeId ${resumeId} completed successfully.`); // Debug log
    return true;
  } catch (error) {
    console.error('deleteResume: General error:', error);
    throw error;
  }
};

/**
 * Template functions
 */

// Get all templates
export const getTemplates = async () => {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting templates:', error);
    throw error;
  }
};

// Get a template by ID
export const getTemplateById = async (templateId) => {
  try {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting template:', error);
    throw error;
  }
};
