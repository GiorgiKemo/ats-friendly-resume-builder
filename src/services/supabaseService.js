import { supabase } from './supabase';
import { deriveResumeTitle } from '../utils/resumeTitle.js';
import { assertCommittedResume } from '../utils/resumeTailoringReview.js';

const isResumeRevision = (revision) => Number.isSafeInteger(revision) && revision > 0 && revision <= 2147483647;
const hasServerVersion = (resume) => isResumeRevision(resume?.revision)
  && typeof resume.updated_at === 'string' && Number.isFinite(Date.parse(resume.updated_at));
const resumeServiceError = (code, message, cause) => Object.assign(new Error(message), { code, cause });

export class ResumeConflictError extends Error {
  constructor(cause) {
    super('This resume changed in another tab or device. Review the newer version before saving again.');
    this.name = 'ResumeConflictError';
    this.code = 'RESUME_CONFLICT';
    this.cause = cause;
  }
}

const normalizeVersionedResume = (resume) => {
  if (!hasServerVersion(resume)) {
    throw resumeServiceError('RESUME_VERSION_UNAVAILABLE', 'The server did not provide a valid resume version. Reload after the server update is available.');
  }
  return { ...resume, title: deriveResumeTitle(resume) };
};

/**
 * Authentication functions
 */

// Sign up a new user
export const signUp = async (email, password, fullName) => {
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
};

// Sign in a user
export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
};

// Sign out a user
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// Get the current user
export const getCurrentUser = async () => {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data?.user || null;
  } catch {
    return null;
  }
};

/**
 * Resume functions
 */

// Get all resumes for the current user
export const getUserResumes = async () => {
  const user = await getCurrentUser();
  if (!user) {
    // console.error('[supabaseService] getUserResumes: User not authenticated at the time of call.'); // Kept for important errors
    throw new Error('User not authenticated');
  }

  // Double security: filter by user ID both in code and in the database
  const { data, error } = await supabase
    .from('user_resumes')
    .select('id, title, description, updated_at, revision, last_accessed_at, user_id, personal_info, selected_template, is_public') // Select only necessary fields for list view
    .eq('user_id', user.id) // Filter by the current user's ID
    .order('last_accessed_at', { ascending: false });

  if (error) {
    // console.error(`[supabaseService] getUserResumes: Supabase error for user.id ${user.id}:`, JSON.stringify(error)); // Kept for important errors
    throw error;
  }

  if (!Array.isArray(data)) {
    throw resumeServiceError('RESUME_LIST_INVALID', 'The server did not return a valid resume list. Please reload and try again.');
  }

  // Additional verification to ensure data belongs to the current user (this is redundant if RLS is working but good for sanity)
  const filteredData = data.filter(resume => resume?.user_id === user.id);
  if (data.length !== filteredData.length) {
    // Mismatch between client-side and server-side filtering detected
  }

  // A malformed/legacy view can duplicate a resume through a join. Keep the
  // first row because the server already ordered the list by recent access.
  const seenIds = new Set();
  const uniqueData = filteredData.filter((resume) => {
    if (typeof resume?.id !== 'string' || !resume.id.trim() || seenIds.has(resume.id)) return false;
    seenIds.add(resume.id);
    return true;
  });

  return uniqueData.map(normalizeVersionedResume);
};

// Get a resume by ID with its content
export const getResumeById = async (resumeId) => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  // Version metadata and content must come from the same server snapshot.
  const { data, error } = await supabase
    .rpc('get_resume_versioned', { p_resume_id: resumeId });

  if (error) {
    throw error;
  }
  if (Array.isArray(data) && data.length === 0) return null;
  if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== resumeId || data[0]?.user_id !== user.id) {
    throw resumeServiceError('RESUME_LOAD_INVALID', 'The server did not return the requested resume for this account.');
  }
  return normalizeVersionedResume(data[0]);
};

// Save a resume (create or update)
/**
 * Saves or updates a resume.
 * @param {object} resumeData - The resume data to save.
 * @param {string | null} [resumeId=null] - The ID of the resume to update. If null, a new resume is created.
 * @param {string} [expectedUserId] - The account that initiated this save.
 * @param {number} [expectedRevision] - The revision of the caller's edit branch; required for updates.
 * @returns {Promise<{resume_id: string, revision: number, updated_at: string}>} Server-confirmed save metadata.
 */
export const saveResume = async (resumeData, resumeId = null, expectedUserId, expectedRevision) => {
  assertCommittedResume(resumeData);
  const isUpdate = resumeId !== null;
  if ((isUpdate && !isResumeRevision(expectedRevision)) || (!isUpdate && expectedRevision != null)) {
    throw resumeServiceError('RESUME_VERSION_REQUIRED', 'A valid saved revision is required before updating this resume. Reload and review your changes first.');
  }
  if (!resumeData || typeof resumeData !== 'object' || Array.isArray(resumeData)
    || (isUpdate && (typeof resumeId !== 'string' || !resumeId.trim()))) {
    throw resumeServiceError('RESUME_SAVE_INVALID', 'A valid resume and resume ID are required to save.');
  }
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  if (expectedUserId && user.id !== expectedUserId) {
    throw new Error('Account changed before the resume could be saved.');
  }

  const {
    title = '',
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

  const resolvedTitle = deriveResumeTitle({ ...resumeData, title });

  // Sanitize the data to ensure it's valid JSON
  const sanitizedPersonalInfo = typeof personalInfo === 'object' ? personalInfo : {};
  const sanitizedWorkExperience = Array.isArray(workExperience) ? workExperience : [];
  const sanitizedEducation = Array.isArray(education) ? education : [];
  const sanitizedSkills = Array.isArray(skills) ? skills : [];
  const sanitizedCertifications = Array.isArray(certifications) ? certifications : [];
  const sanitizedProjects = Array.isArray(projects) ? projects : [];
  const sanitizedAdditionalSections = Array.isArray(additionalSections) ? additionalSections : [];

  // Ownership and revision comparison happen atomically in this RPC, never
  // through a read-latest-then-write sequence in the client.
  const { data, error } = await supabase
      .rpc('save_resume_versioned', {
      p_user_id: user.id,
      p_title: resolvedTitle,
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
      p_resume_id: resumeId,
      p_expected_revision: isUpdate ? expectedRevision : null,
    });

  if (error) {
    if (error.code === 'PT409' && error.message === 'RESUME_CONFLICT') throw new ResumeConflictError(error);
    if (error.code === '22023' && error.message === 'RESUME_VERSION_REQUIRED') {
      throw resumeServiceError('RESUME_VERSION_REQUIRED', 'A valid saved revision is required before updating this resume.', error);
    }
    throw resumeServiceError(error.code || 'RESUME_SAVE_FAILED', `Failed to save resume: ${error.message}`, error);
  }
  if (!data || Array.isArray(data) || typeof data.resume_id !== 'string' || !data.resume_id.trim()
    || !hasServerVersion(data) || data.revision !== (isUpdate ? expectedRevision + 1 : 1)
    || (isUpdate && data.resume_id !== resumeId)) {
    throw resumeServiceError('RESUME_SAVE_UNCONFIRMED', 'The server did not confirm the saved resume version. Reload before trying again.');
  }
  return { resume_id: data.resume_id, revision: data.revision, updated_at: data.updated_at };
};

// Delete a resume
export const deleteResume = async (resumeId) => {
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
    throw new Error('Failed to verify resume ownership');
  }

  if (!checkData) {
    return false;
  }

  // Delete using the RPC function
  const { error } = await supabase // data was unused
    .rpc('delete_resume', {
      p_resume_id: resumeId,
      p_user_id: user.id
    });

  if (error) {
    throw error;
  }
  // console.log(`delete_resume RPC for resumeId ${resumeId} completed successfully.`); // Debug log
  return true;
};

/**
 * Template functions
 */

// Get all templates
export const getTemplates = async () => {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('name');

  if (error) throw error;
  return data;
};

// Get a template by ID
export const getTemplateById = async (templateId) => {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) throw error;
  return data;
};
