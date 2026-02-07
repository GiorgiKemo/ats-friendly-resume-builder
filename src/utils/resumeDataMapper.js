/**
 * Resume data mapper
 * This module processes AI-generated resume data to ensure compatibility with templates
 */

/**
 * Maps and normalizes resume data to ensure consistent property names
 * @param {Object} resumeData - The resume data from AI
 * @returns {Object} - The normalized resume data ready for use
 */
export const mapResumeData = (resumeData) => {
  if (!resumeData) {
    return {};
  }

  // Create a copy to avoid modifying the original
  const result = { ...resumeData };

  // Ensure personalInfo exists
  if (!result.personalInfo) {
    result.personalInfo = {};
  }

  // If there's a summary at the root level, move it to personalInfo
  if (result.summary && !result.personalInfo.summary) {
    result.personalInfo.summary = result.summary;
    delete result.summary;
  }

  // Normalize work experience entries to ensure consistent property names
  if (Array.isArray(result.workExperience)) {
    result.workExperience = result.workExperience.map(job => {
      const normalizedJob = { ...job };

      // Ensure jobTitle property exists (templates expect this)
      if (normalizedJob.title && !normalizedJob.jobTitle) {
        normalizedJob.jobTitle = normalizedJob.title;
      } else if (normalizedJob.jobTitle && !normalizedJob.title) {
        normalizedJob.title = normalizedJob.jobTitle;
      }

      // Ensure description property exists
      if (normalizedJob.responsibilities && !normalizedJob.description) {
        normalizedJob.description = normalizedJob.responsibilities;
      } else if (normalizedJob.description && !normalizedJob.responsibilities) {
        normalizedJob.responsibilities = normalizedJob.description;
      }

      return normalizedJob;
    });
  }

  return result;
};
