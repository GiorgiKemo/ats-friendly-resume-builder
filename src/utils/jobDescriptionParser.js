/**
 * Simplified job description parser
 * This module provides a basic function to extract minimal information from job descriptions
 * to help guide the AI generation process
 */

/**
 * Extract basic information from a job description
 * @param {string} jobDescription - The job description text
 * @returns {Object} - Basic information extracted from the job description
 */
export const parseJobDescription = (jobDescription) => {
  if (!jobDescription) {
    return {
      title: '',
      roleCategory: 'general',
      experience: {
        years: null,
        level: 'mid'
      }
    };
  }

  // Extract a basic job title from the first line or first few words
  const title = extractBasicJobTitle(jobDescription);

  // Determine the role category based on simple keyword matching
  const roleCategory = determineRoleCategory(jobDescription);

  // Extract years of experience using regex
  const experienceYears = extractExperienceYears(jobDescription);

  // Determine experience level based on years or keywords
  const experienceLevel = determineExperienceLevel(experienceYears, jobDescription);

  return {
    title,
    roleCategory,
    experience: {
      years: experienceYears,
      level: experienceLevel
    }
  };
};

/**
 * Extract a basic job title from the job description
 * @param {string} description - The job description text
 * @returns {string} - The extracted job title
 */
function extractBasicJobTitle(description) {
  // Try to find a job title pattern
  const titleMatch = description.match(/job title:\s*["']?([^"',\n.]+)["']?/i) ||
                    description.match(/position:\s*["']?([^"',\n.]+)["']?/i) ||
                    description.match(/role:\s*["']?([^"',\n.]+)["']?/i) ||
                    description.match(/hiring\s+(?:a|an)\s+["']?([^"',\n.]+)["']?/i);

  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }

  // If no pattern matches, use the first line or first few words
  const firstLine = description.split('\n')[0];
  if (firstLine && firstLine.length < 50) {
    return firstLine.trim();
  }

  // Last resort: extract first 3-5 words
  const words = description.split(/\s+/).slice(0, 5).join(' ');
  return words;
}

/**
 * Determine the role category based on simple keyword matching
 * @param {string} jobDescription - The job description text
 * @returns {string} - The role category
 */
function determineRoleCategory(jobDescription) {
  const lowerDesc = jobDescription.toLowerCase();

  // Check for common role categories with simple keyword matching
  if (lowerDesc.includes('customer service') ||
      lowerDesc.includes('customer support') ||
      lowerDesc.includes('customer experience')) {
    return 'customer_service';
  }

  if (lowerDesc.includes('software') ||
      lowerDesc.includes('developer') ||
      lowerDesc.includes('programming') ||
      lowerDesc.includes('code')) {
    return 'developer';
  }

  if (lowerDesc.includes('data') ||
      lowerDesc.includes('analyst') ||
      lowerDesc.includes('analytics')) {
    return 'analyst';
  }

  if (lowerDesc.includes('marketing') ||
      lowerDesc.includes('social media') ||
      lowerDesc.includes('content')) {
    return 'marketer';
  }

  if (lowerDesc.includes('sales') ||
      lowerDesc.includes('account executive')) {
    return 'sales';
  }

  if (lowerDesc.includes('manager') ||
      lowerDesc.includes('director') ||
      lowerDesc.includes('lead')) {
    return 'manager';
  }

  // Default to general if no match found
  return 'general';
}

/**
 * Extract years of experience from job description
 * @param {string} text - Job description text
 * @returns {number|null} - Years of experience or null if not found
 */
function extractExperienceYears(text) {
  if (!text) return null;

  // Simple pattern for years of experience
  const match = text.match(/(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Determine experience level based on years and job description
 * @param {number|null} years - Years of experience
 * @param {string} jobDescription - Job description text
 * @returns {string} - Experience level (entry, mid, senior, executive)
 */
function determineExperienceLevel(years, jobDescription) {
  const lowerDesc = jobDescription.toLowerCase();

  // Check for seniority indicators in the job description
  if (lowerDesc.includes('senior') || lowerDesc.includes('lead') ||
      lowerDesc.includes('principal') || lowerDesc.includes('architect')) {
    return 'senior';
  }

  if (lowerDesc.includes('junior') || lowerDesc.includes('entry') ||
      lowerDesc.includes('intern') || lowerDesc.includes('trainee')) {
    return 'entry';
  }

  if (lowerDesc.includes('manager') || lowerDesc.includes('director') ||
      lowerDesc.includes('executive') || lowerDesc.includes('chief')) {
    return 'executive';
  }

  // If no indicators in description, use years of experience
  if (years === null) {
    return 'mid'; // Default to mid-level if no years specified
  }

  if (years <= 2) {
    return 'entry';
  } else if (years <= 5) {
    return 'mid';
  } else if (years <= 10) {
    return 'senior';
  } else {
    return 'executive';
  }
}
