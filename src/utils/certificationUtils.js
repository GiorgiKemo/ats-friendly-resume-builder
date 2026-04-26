/**
 * Utility functions for handling certifications in resume generation
 *
 * Certifications must come from the user's profile/resume data. These helpers
 * intentionally do not invent fallback certifications.
 */

/**
 * This function has been modified to no longer return preset certifications.
 * Missing certifications should stay missing.
 *
 * @param {string} jobCategory - The job category (from jobTitleExtractor.js)
 * @returns {Object} - Empty object as we no longer use preset certifications
 */
export function getCertificationsForJobCategory(_jobCategory) { // jobCategory was unused
  // Return an empty object with empty certifications array
  // This ensures no preset data is used
  return {
    certifications: [],
    description: 'No saved certifications were provided'
  };
}

/**
 * This function has been modified to no longer return preset certifications.
 * Missing certifications should stay missing.
 *
 * @param {string} jobCategory - The job category
 * @returns {Object} - Empty certification object
 */
export function getRandomCertificationForJobCategory(_jobCategory) { // jobCategory was unused
  // Return an empty certification object
  // This ensures no preset data is usedd
  return {
    name: "",
    issuer: ""
  };
}

/**
 * Validates a user-provided certification object.
 * @param {Object} certification - The certification object with name and issuer
 * @param {string} jobCategory - The job category
 * @returns {boolean} - Whether the certification has a usable name
 */
export function validateCertificationForJobCategory(certification, _jobCategory) { // jobCategory was unused
  // Simply check if the certification has a name
  return certification && certification.name && certification.name.trim() !== '';
}

/**
 * No longer replaces certifications with preset data
 * Only ensures the certification objects have the required structure
 * @param {Array} certifications - Array of certification objects
 * @param {string} jobCategory - The job category
 * @returns {Array} - Array of certification objects with proper structure
 */
export function fixCertificationsForJobCategory(certifications, _jobCategory) { // jobCategory was unused
  if (!certifications || !Array.isArray(certifications)) return [];

  // Just ensure each certification has the required fields
  return certifications.map(cert => ({
    name: cert.name || '',
    issuer: cert.issuer || '',
    date: cert.date || '',
    description: cert.description || ''
  }));
}
