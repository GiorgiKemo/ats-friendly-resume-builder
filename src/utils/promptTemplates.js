/**
 * Prompt templates and options for the enhanced AI resume generator
 */

/**
 * Get industry options for the resume generator
 * @returns {Array} Array of industry options
 */
export const getIndustryOptions = () => [
  { value: 'default', label: 'General / Not Specified' },
  { value: 'tech', label: 'Technology & Software Development' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'healthcare', label: 'Healthcare & Medical' },
  { value: 'marketing', label: 'Marketing & Advertising' },
  { value: 'sales', label: 'Sales & Business Development' },
  { value: 'education', label: 'Education & Teaching' },
  { value: 'engineering', label: 'Engineering & Manufacturing' },
  { value: 'legal', label: 'Legal & Law' },
  { value: 'creative', label: 'Creative & Design' },
  { value: 'hospitality', label: 'Hospitality & Tourism' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'nonprofit', label: 'Nonprofit & NGO' },
  { value: 'government', label: 'Government & Public Sector' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'consulting', label: 'Consulting & Professional Services' },
  { value: 'science', label: 'Science & Research' },
  { value: 'media', label: 'Media & Communications' },
  { value: 'construction', label: 'Construction & Architecture' },
  { value: 'logistics', label: 'Logistics & Supply Chain' }
];

/**
 * Get career level options for the resume generator
 * @returns {Array} Array of career level options
 */
export const getCareerLevelOptions = () => [
  { value: 'not-specified', label: 'Not specified' },
  { value: 'entry', label: 'Entry Level' },
  { value: 'mid', label: 'Mid-Level' },
  { value: 'senior', label: 'Senior Level' },
  { value: 'executive', label: 'Executive Leadership' },
  { value: 'career-change', label: 'Career Change' }
];

/**
 * Get tone options for the resume generator
 * @returns {Array} Array of tone options
 */
export const getToneOptions = () => [
  { value: 'professional', label: 'Professional (Standard)' },
  { value: 'confident', label: 'Confident & Bold' },
  { value: 'technical', label: 'Technical & Detailed' },
  { value: 'achievement', label: 'Achievement-Focused' },
  { value: 'balanced', label: 'Balanced (Technical & Soft Skills)' }
];

/**
 * Get length options for the resume generator
 * @returns {Array} Array of length options
 */
export const getLengthOptions = () => [
  { value: 'concise', label: 'Concise (1 page)' },
  { value: 'standard', label: 'Standard (1-2 pages)' },
  { value: 'comprehensive', label: 'Comprehensive (2-3+ pages, detailed)' }
];

/**
 * Simple system prompt for resume generation
 * @returns {string} - The system prompt
 */
export const getSimpleSystemPrompt = () => {
  return `You are an expert resume writer specializing in creating ATS-optimized resumes. Your task is to create a complete resume tailored to a specific job description.

IMPORTANT GUIDELINES:
- Tailor the candidate's real profile to the job description; do not invent employers, degrees, certifications, projects, dates, or locations
- Rewrite summaries and bullets only from the candidate data provided
- Use the target job title only as a target headline, never as a past or current work-history title unless it already exists in the candidate data
- Use a clean, single-column layout with standard section headings
- Format with bullet points starting with action verbs
- Quantify achievements only with metrics supplied in the candidate profile; never invent numbers
- Preserve supplied dates, including expected graduation dates and overlapping employment and education
- Never use the target company name or target location from the job description in work history
- Keep section identity fields exact: company names, job titles, schools, certification issuers, project names, dates, and locations must come from the candidate profile
- If a profile section is missing, omit that section instead of fabricating it`;
};
