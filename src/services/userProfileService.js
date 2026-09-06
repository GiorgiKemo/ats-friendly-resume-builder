import { supabase } from './supabase';

const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const asArray = (value) => Array.isArray(value) ? value : [];
const firstText = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || '';
const descriptionText = (value) => Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').join('\n') : value;
const validProfileId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validRevision = (value) => Number.isInteger(value) && value > 0 && value <= 2147483647;
const validTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const profileError = (code, message, cause) => Object.assign(new Error(message), { code, cause });

export class ProfileConflictError extends Error {
  constructor(cause) {
    super('This profile changed in another tab or device. Review the saved version before saving again.');
    this.name = 'ProfileConflictError';
    this.code = 'PROFILE_CONFLICT';
    this.cause = cause;
  }
}
const normalizeWorkEntry = (value) => {
  const entry = asObject(value);
  return {
    ...entry,
    title: firstText(entry.title, entry.jobTitle, entry.position, entry.role),
    company: firstText(entry.company, entry.employer),
    responsibilities: firstText(descriptionText(entry.responsibilities), descriptionText(entry.description), descriptionText(entry.achievements)),
  };
};
const assertProfileOwner = (user, expectedUserId) => {
  if (!user) throw new Error('User not authenticated');
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Your account changed. Reload your profile before saving.');
};

/**
 * Save user profile to Supabase
 * @param {Object} profileData - The user profile data to save
 * @returns {Promise<Object>} - The saved profile data
 */
export const saveUserProfile = async (profileData, expectedUserId) => {
  if (!profileData || typeof profileData !== 'object' || Array.isArray(profileData)) {
    throw new Error('A valid profile is required to save.');
  }
  const isCreate = profileData.id == null && profileData.revision == null;
  if (!isCreate && (!validProfileId(profileData.id) || !validRevision(profileData.revision))) {
    throw profileError('PROFILE_VERSION_REQUIRED', 'A valid loaded profile identity and revision are required before saving.');
  }
  const expectedProfileId = isCreate ? null : profileData.id;
  const expectedRevision = isCreate ? null : profileData.revision;
  const user = await getCurrentUser();
  assertProfileOwner(user, expectedUserId);

  const {
    personal = {},
    workExperience = [],
    education = [],
    skills = [],
    certifications = [],
    projects = [],
    languages = [],
    interests = [],
    reference_list,
    references = [],
    applicationProfile = {}
  } = profileData;

  // Sanitize the data to ensure it's valid JSON
  const sanitizedPersonal = {
    ...asObject(personal),
    applicationProfile: {
      ...asObject(asObject(personal).applicationProfile),
      ...asObject(applicationProfile)
    }
  };
  const sanitizedWorkExperience = Array.isArray(workExperience) ? workExperience : [];
  const sanitizedEducation = Array.isArray(education) ? education : [];
  const sanitizedSkills = Array.isArray(skills) ? skills : [];
  const sanitizedCertifications = Array.isArray(certifications) ? certifications : [];
  const sanitizedProjects = Array.isArray(projects) ? projects : [];
  const sanitizedLanguages = Array.isArray(languages) ? languages : [];
  const sanitizedInterests = Array.isArray(interests) ? interests : [];
  const sanitizedReferenceList = Array.isArray(reference_list)
    ? reference_list
    : Array.isArray(references)
      ? references
      : [];

  // The server compares the loaded version atomically. Never read a newer
  // revision here or retry an old snapshot through the unversioned RPC.
  const { data, error } = await supabase
    .rpc('save_user_profile_versioned', {
      p_user_id: user.id,
      p_personal: sanitizedPersonal,
      p_work_experience: sanitizedWorkExperience,
      p_education: sanitizedEducation,
      p_skills: sanitizedSkills,
      p_certifications: sanitizedCertifications,
      p_projects: sanitizedProjects,
      p_languages: sanitizedLanguages,
      p_interests: sanitizedInterests,
      p_reference_list: sanitizedReferenceList,
      p_expected_profile_id: expectedProfileId,
      p_expected_revision: expectedRevision
    });

  if (error) {
    if (error.code === 'PT409' && error.message === 'PROFILE_CONFLICT') throw new ProfileConflictError(error);
    if (error.code === '22023' && error.message === 'PROFILE_VERSION_REQUIRED') {
      throw profileError('PROFILE_VERSION_REQUIRED', 'A valid loaded profile version is required before saving.', error);
    }
    throw profileError(error.code || 'PROFILE_SAVE_FAILED', 'Failed to save your profile. Your current edits were kept.', error);
  }
  if (!data || Array.isArray(data) || !validProfileId(data.profile_id) || !validRevision(data.revision)
    || !validTimestamp(data.updated_at) || data.revision !== (isCreate ? 1 : expectedRevision + 1)
    || (!isCreate && data.profile_id !== expectedProfileId)) {
    throw profileError('PROFILE_SAVE_UNCONFIRMED', 'The server did not confirm the saved profile version. Review the saved version before trying again.');
  }
  return { profile_id: data.profile_id, revision: data.revision, updated_at: data.updated_at };
};

/**
 * Get user profile from Supabase
 * @returns {Promise<Object>} - The user profile data
 */
export const getUserProfile = async (expectedUserId) => {
  const user = await getCurrentUser();
  assertProfileOwner(user, expectedUserId);

  // Get the profile using the RPC function
  const { data, error } = await supabase
    .rpc('get_user_profile_versioned', {
      p_user_id: user.id
    });

  if (error) {
    throw profileError(error.code || 'PROFILE_LOAD_FAILED', 'Failed to load your profile.', error);
  }

  // If no profile found, return null
  if (Array.isArray(data) && data.length === 0) {
    return null;
  }
  if (!Array.isArray(data) || data.length !== 1 || !validProfileId(data[0]?.id) || data[0]?.user_id !== user.id) {
    throw profileError('PROFILE_LOAD_INVALID', 'The server did not return a valid profile for this account.');
  }
  if (!validRevision(data[0].revision) || !validTimestamp(data[0].updated_at)) {
    throw profileError('PROFILE_VERSION_UNAVAILABLE', 'The server did not provide a valid profile version. Reload after the server update is available.');
  }

  // Format the profile data
  const personal = asObject(data[0].personal);
  const profileData = {
    id: data[0].id,
    revision: data[0].revision,
    updatedAt: data[0].updated_at,
    personal,
    workExperience: asArray(data[0].work_experience).map(normalizeWorkEntry),
    education: asArray(data[0].education),
    skills: asArray(data[0].skills),
    certifications: asArray(data[0].certifications),
    projects: asArray(data[0].projects),
    languages: asArray(data[0].languages),
    interests: asArray(data[0].interests),
    references: asArray(data[0].reference_list),
    applicationProfile: asObject(personal.applicationProfile)
  };

  // No longer using localStorage as a fallback

  return profileData;
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
