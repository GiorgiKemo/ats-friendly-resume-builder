import { getSimpleSystemPrompt } from '../utils/promptTemplates';
import { parseJobDescription, formatJobExperience } from '../utils/jobDescriptionParser';
import { robustJSONParse } from '../utils/security';
import { supabase, supabaseUrl } from './supabase';
import { enforceAuthenticResumeSections, sanitizeTargetJobTitle } from '../utils/resumeAuthenticity';
import { hardenGeneratedResumeForAts } from '../utils/generatedResumeQuality';
import { hasUsableProfileData, serializeResumeSource } from '../utils/resumeGenerationInput.js';
import { mapResumeData } from '../utils/resumeDataMapper.js';
import { createResumeTailoringReview } from '../utils/resumeTailoringReview.js';

const DEBUG_AI = import.meta.env.DEV && import.meta.env.VITE_DEBUG_AI === 'true';
const AI_PROXY_FALLBACK_ORDER = ['openrouter-proxy', 'groq-proxy'];
const AI_SERVICE_TEMPORARILY_UNAVAILABLE = 'AI resume generation is temporarily unavailable. We are working on a fix. Please try again shortly.';
const debugLog = (...args) => {
  if (DEBUG_AI) console.log(...args);
};
const debugWarn = (...args) => {
  if (DEBUG_AI) console.warn(...args);
};

// Check if we have a valid Supabase URL
export const isValidApiKey = () => {
  try {
    const url = new URL(supabaseUrl);
    if (url.username || url.password || url.search || url.hash) return false;
    return url.protocol === 'https:' || Boolean(import.meta.env.DEV
      && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
};

// Keep application answers, references, internal metadata and arbitrary nested
// fields out of provider requests and the eventual source-only resume.
const pickSourceFields = (value, fields) => Object.fromEntries(fields
  .filter((key) => value && Object.hasOwn(value, key))
  .map((key) => [key, value[key]])
  .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)
    || (Array.isArray(value) && value.every((item) => typeof item === 'string')))
  .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
const sourceEntries = (value, fields) => (Array.isArray(value) ? value : [])
  .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
  .map((item) => pickSourceFields(item, fields));
const sourceTerms = (value, fields) => (Array.isArray(value) ? value : [])
  .map((item) => typeof item === 'string' ? item : pickSourceFields(item, fields));
const formatResumeSource = (profile) => {
  const personal = profile.personal || profile.personalInfo || {};
  return {
    personal: {
      ...pickSourceFields(personal, ['fullName', 'full_name', 'name', 'firstName', 'lastName', 'email', 'phone', 'phoneNumber', 'location', 'city', 'state', 'country', 'jobTitle', 'summary', 'professionalSummary', 'linkedin', 'github', 'website', 'portfolio', 'other', 'skills']),
      professionalLinks: pickSourceFields(personal.professionalLinks, ['linkedin', 'github', 'portfolio', 'website', 'other']),
    },
    education: sourceEntries(profile.education, ['id', 'institution', 'school', 'degree', 'fieldOfStudy', 'field', 'location', 'startDate', 'endDate', 'current', 'description', 'gpa']),
    workExperience: sourceEntries(profile.workExperience || profile.experience, ['id', 'title', 'jobTitle', 'position', 'role', 'company', 'employer', 'location', 'startDate', 'endDate', 'current', 'description', 'responsibilities', 'achievements']),
    skills: sourceTerms(profile.skills, ['name', 'skill', 'level', 'proficiency', 'category']),
    certifications: sourceEntries(profile.certifications, ['id', 'name', 'title', 'issuer', 'date', 'issueDate', 'expiryDate', 'expirationDate', 'noExpiration', 'credentialId', 'credentialID', 'credentialUrl', 'credentialURL', 'url', 'description']),
    projects: sourceEntries(profile.projects, ['id', 'title', 'name', 'role', 'url', 'description', 'details', 'technologies', 'startDate', 'endDate', 'current']),
    languages: sourceTerms(profile.languages, ['name', 'language', 'level', 'proficiency']),
    interests: sourceTerms(profile.interests, ['name', 'interest']),
    additionalSections: sourceEntries(profile.additionalSections, ['id', 'title', 'name', 'content', 'description']),
  };
};

const truncateText = (text, maxChars) => {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[Truncated for length]`;
};

const maybeTruncate = (text, maxChars) => {
  if (!text || typeof text !== 'string') return '';
  return truncateText(text, maxChars);
};

// User-entered option text is prompt input, so keep it bounded and string-only
// before it reaches a provider request or is echoed into downstream metadata.
const boundedPromptText = (value, maxChars) => maybeTruncate(
  typeof value === 'string' ? value.trim() : '',
  maxChars,
);
const getErrorMessage = (error) => error?.message || String(error || '');

const OPTION_LABELS = {
  industry: {
    default: 'General / Not Specified',
    tech: 'Technology & Software Development',
    finance: 'Finance & Banking',
    healthcare: 'Healthcare & Medical',
    marketing: 'Marketing & Advertising',
    sales: 'Sales & Business Development',
    education: 'Education & Teaching',
    engineering: 'Engineering & Manufacturing',
    legal: 'Legal & Law',
    creative: 'Creative & Design',
    hospitality: 'Hospitality & Tourism',
    retail: 'Retail & E-commerce',
    nonprofit: 'Nonprofit & NGO',
    government: 'Government & Public Sector',
    hr: 'Human Resources',
    consulting: 'Consulting & Professional Services',
    science: 'Science & Research',
    media: 'Media & Communications',
    construction: 'Construction & Architecture',
    logistics: 'Logistics & Supply Chain',
  },
  tone: {
    professional: 'Professional',
    confident: 'Confident and Bold',
    technical: 'Technical and Detailed',
    achievement: 'Achievement-Focused',
    balanced: 'Balanced Technical and Soft Skills',
  },
};

const optionLabel = (group, value, fallback = '') => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return OPTION_LABELS[group]?.[normalized] || normalized || fallback;
};

const buildAiRequestBody = (prompt, {
  temperature = 0.7,
  maxTokens = 1200,
  responseMimeType,
} = {}) => {
  return {
    messages: [
      { role: "user", content: prompt }
    ],
    temperature,
    maxTokens,
    expectJson: responseMimeType === "application/json",
  };
};

const extractAiResponseText = (result) => {
  return result?.choices?.[0]?.message?.content || '';
};

const isProviderUnavailablePayload = (data = {}) => {
  const errorText = `${data.error || ''} ${data.details || ''}`.toLowerCase();
  return Boolean(
    data.aiServiceUnavailable ||
    data.providerStatus ||
    errorText.includes('ai provider') ||
    errorText.includes('provider error') ||
    errorText.includes('server misconfiguration') ||
    errorText.includes('api_key') ||
    errorText.includes('api key') ||
    errorText.includes('model') ||
    errorText.includes('rate limit') ||
    errorText.includes('temporarily unavailable') ||
    errorText.includes('invalid json')
  );
};

const createRetryableAiError = (message, provider) => {
  const error = new Error(message || AI_SERVICE_TEMPORARILY_UNAVAILABLE);
  error.aiProxyRetryable = true;
  error.provider = provider;
  return error;
};

const createAiAccessDeniedError = (message) => {
  const error = new Error(message);
  error.aiAccessDenied = true;
  return error;
};

async function invokeAiProxy(functionName, requestBody, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: requestBody,
      signal: controller.signal,
      // Add headers to indicate this is a large request that may take time
      headers: {
        'X-Request-Type': 'large-model-request',
        'X-Request-Timeout': timeoutMs.toString()
      }
    });

    if (error) {
      console.error(`Error calling ${functionName}:`, error);
      throw createRetryableAiError(getErrorMessage(error) || 'Failed to call AI proxy', functionName);
    }

    if (data?.error) {
      if (data.aiAccessDenied) {
        throw createAiAccessDeniedError(data.error);
      }
      if (isProviderUnavailablePayload(data)) {
        throw createRetryableAiError(AI_SERVICE_TEMPORARILY_UNAVAILABLE, functionName);
      }
      const details = typeof data.details === 'string'
        ? data.details
        : JSON.stringify(data.details || data.error);
      throw new Error(details || data.error);
    }

    return data;
  } catch (error) {
    if (error.aiAccessDenied || error.aiProxyRetryable) {
      throw error;
    }

    const errorMessage = getErrorMessage(error);
    if (error?.name === 'AbortError' || errorMessage.includes('aborted')) {
      console.error(`${functionName} timed out`);
      throw createRetryableAiError('The request to the AI service timed out.', functionName);
    }

    console.error(`Exception calling ${functionName}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper function to call our AI proxy function with timeout
async function callAiProxy(requestBody, timeoutMs = 120000, assertCurrentRequest) { // 2-minute timeout by default
  let lastRetryableError = null;

  for (const functionName of AI_PROXY_FALLBACK_ORDER) {
    assertCurrentRequest?.();
    try {
      return await invokeAiProxy(functionName, requestBody, timeoutMs);
    } catch (error) {
      if (error.aiAccessDenied || !error.aiProxyRetryable) {
        throw error;
      }

      lastRetryableError = error;
      debugWarn(`${functionName} unavailable; trying next provider if available.`, getErrorMessage(error));
    }
  }

  if (lastRetryableError) {
    debugWarn('All AI providers failed.', lastRetryableError.message);
  }
  throw new Error(AI_SERVICE_TEMPORARILY_UNAVAILABLE);
}

/**
 * Enhanced keyword extraction with AI analysis
 * @param {string} jobDescription - The job description text
 * @returns {Promise<Object>} - Object containing extracted keywords and analysis
 */
export async function enhancedKeywordExtraction(jobDescription) {
  try {
    // Check if we have a valid Supabase URL
    if (!isValidApiKey()) {
      throw new Error('No valid Supabase URL found. Please check your VITE_SUPABASE_URL in the .env file.');
    }

    // Use our simplified parser to extract basic information
    const parsedData = parseJobDescription(jobDescription);

    const jobDescriptionForPrompt = maybeTruncate(jobDescription, 5000);
    // Construct the prompt for the AI service
    const prompt = `You are an expert at analyzing job descriptions and extracting relevant keywords for ATS optimization. Generate 100% AI-created content without using any preset data.

Analyze this job description and extract the following:
1. Essential keywords that should appear in the resume
2. Technical skills required or preferred
3. Soft skills that are valued
4. Required years of experience
5. Education requirements
6. Certifications or qualifications mentioned
7. Tools or software mentioned
8. ATS optimization tips specific to this job

Job Description:
${jobDescriptionForPrompt}

Here's my basic analysis:
- Job Title: ${parsedData.title}
- Company: ${parsedData.company || 'Not specified'}
- Location: ${parsedData.location || 'Not specified'}
- Employment Type: ${parsedData.employmentType || 'Not specified'}
- Role Category: ${parsedData.roleCategory}
- Stated Experience: ${formatJobExperience(parsedData.experience)}

Please validate this information, correct any errors, and provide a more comprehensive analysis.
Format the response STRICTLY as a JSON object with the following structure:
{
  "keywords": ["keyword1", "keyword2", ...],
  "technical_skills": ["skill1", "skill2", ...],
  "soft_skills": ["skill1", "skill2", ...],
  "required_experience": "Description of required experience",
  "education_requirements": ["requirement1", "requirement2", ...],
  "certifications": ["certification1", "certification2", ...],
  "tools_software": ["tool1", "tool2", ...],
  "ats_tips": ["tip1", "tip2", ...],
  "industry_specific_advice": "Advice specific to this industry and role"
}`;

    const requestBody = buildAiRequestBody(prompt, {
      temperature: 0.3,
      maxTokens: 1200,
      responseMimeType: "application/json",
    });

    // Call our AI proxy function with a 60-second timeout for keyword extraction
    const result = await callAiProxy(requestBody, 60000);

    // Extract the response text from the result
    const responseText = extractAiResponseText(result);

    // Parse the JSON response with robust error handling
    const content = robustJSONParse(responseText, 'keyword analysis');


    // Return the AI-enhanced analysis object
    return {
      keywords: content.keywords || [],
      technical_skills: content.technical_skills || [],
      soft_skills: content.soft_skills || [],
      required_experience: content.required_experience || formatJobExperience(parsedData.experience),
      education_requirements: content.education_requirements || [],
      certifications: content.certifications || [],
      tools_software: content.tools_software || [],
      ats_tips: content.ats_tips || [],
      industry_specific_advice: content.industry_specific_advice || '',
      parsed_job_title: parsedData.title,
      parsed_role_category: parsedData.roleCategory
    };
  } catch (error) {
    console.error('Error extracting keywords with AI service:', error);
    const errorMessage = getErrorMessage(error);

    // Check for specific error types and provide appropriate messages
    let message;
    if (errorMessage.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your server-side configuration.';
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else {
      message = errorMessage || 'Failed to analyze job description with the AI service. Please try again.';
    }

    throw new Error(message);
  }
}

/**
 * Generate an enhanced resume based on user profile, job description, and customization options
 * @param {Object} userProfile - The user's profile data
 * @param {string} jobDescription - The job description to tailor the resume to
 * @param {Object} options - Customization options (industry, careerLevel, tone, length, focusSkills)
 * @returns {Promise<Object>} - A review proposal, never a saveable/exportable resume
 */
export async function generateEnhancedResume(userProfile, jobDescription, options = {}, keywordAnalysis = null) {
  try {
    // Check if we have a valid Supabase URL
    if (!isValidApiKey()) {
      throw new Error('No valid Supabase URL found. Please check your VITE_SUPABASE_URL in the .env file.');
    }

    // Extract options with defaults
    const {
      industry = 'default',
      careerLevel = 'not-specified',
      tone = 'professional',
      length = 'standard',
      focusSkills = '',
      userCountry = '',
      jobLocation = ''
    } = options;
    const boundedFocusSkills = boundedPromptText(focusSkills, 500);
    const boundedUserCountry = boundedPromptText(userCountry, 120);
    const boundedJobLocation = boundedPromptText(jobLocation, 160);

    const formattedProfile = formatResumeSource(userProfile);
    const sourceInfo = {
      profileId: userProfile.id,
      profileRevision: userProfile.revision,
      ...pickSourceFields(options.sourceInfo, ['ownerId', 'runId', 'profileId', 'profileRevision', 'resumeId', 'resumeRevision']),
    };
    const serializedProfile = serializeResumeSource(formattedProfile);
    if (!hasUsableProfileData(formattedProfile)) {
      throw new Error('Complete your profile first so the AI has real details to tailor.');
    }

    // Base prompt instructions
    let basePrompt = getSimpleSystemPrompt();

    // Add focus skills if provided
    if (boundedFocusSkills) {
      basePrompt += `\n\nFOCUS SKILLS: Emphasize the following skills in the resume: ${boundedFocusSkills}`;
    }

    const preliminaryKeywordAnalysis = keywordAnalysis
      ? maybeTruncate(JSON.stringify(keywordAnalysis, null, 2), 2000)
      : '';

    // Determine optional sections based on length
    let additionalSections = '';

    if (length === 'comprehensive') {
      additionalSections = `8. Publications or Speaking Engagements (if relevant)
9. Professional Affiliations
10. Additional Training and Courses`;
    }

    const { getCurrentDateInfo } = await import('../utils/dateUtils.js');
    const dateInfo = getCurrentDateInfo();
    const formattedCurrentDate = dateInfo.formatted;
    const currentYear = dateInfo.year;

    debugLog(`Current date used for resume generation: ${formattedCurrentDate}`);

    const jobDescriptionForPrompt = maybeTruncate(jobDescription, 6000);
    const parsedJobData = parseJobDescription(jobDescriptionForPrompt);
    const extractedJobTitle = sanitizeTargetJobTitle(parsedJobData.title);
    const targetJobLocation = boundedJobLocation || parsedJobData.location || '';
    const targetIndustryLabel = optionLabel('industry', industry, 'General / Not Specified');
    const targetToneLabel = optionLabel('tone', tone, 'Professional');
    const careerWordingPreferences = {
      entry: 'Entry-level presentation', mid: 'Mid-level presentation',
      senior: 'Senior-level presentation', executive: 'Executive-oriented presentation',
      'career-change': 'Career-change presentation',
    };
    const careerWordingPreference = Object.hasOwn(careerWordingPreferences, careerLevel)
      ? careerWordingPreferences[careerLevel] : 'Not specified';
    debugLog('Extracted Job Title:', extractedJobTitle);

    basePrompt += `\n\nEXTRACTED JOB TITLE: "${extractedJobTitle}"`;
    basePrompt += `\n\nAUTHENTICITY RULES:
- Tailor the resume to the target job without inventing career history.
- Work history must be based only on Candidate Profile workExperience. Preserve each original company, job title, location, start date, end date, and current flag exactly.
- Do not create a new current role for the target company or combine the target job title with an unrelated employer.
- Do not use the target company "${parsedJobData.company || 'target company'}" or target location "${targetJobLocation || 'target location'}" inside workExperience unless it already appears in Candidate Profile workExperience.
- Certifications and projects must come only from Candidate Profile certifications/projects. If none are provided, return empty arrays.
- Education identity fields must come only from Candidate Profile education. If none are provided, return an empty array.
- You may rewrite summaries and bullet descriptions to emphasize truthful overlap with the job description.`;

    basePrompt += `\n\nCUSTOMIZATION CONTEXT:
- Target industry: ${targetIndustryLabel}
- Desired tone: ${targetToneLabel}
- Candidate country or region for resume convention nuance: ${boundedUserCountry || 'Not specified'}
- Target job location: ${targetJobLocation || 'Not specified'}
- Use country and target-location context only for wording conventions and relevance. Do not overwrite the candidate's contact location or invent relocation details.`;

    // Construct the full prompt for the AI service
    const fullPrompt = `${basePrompt}

Create a complete ATS-optimized resume for the following job description, using the candidate's profile information.

IMPORTANT GUIDELINES:
- Use the candidate's profile data as the only source of truth
- If a profile field or section is missing, leave it blank or return an empty array; do not invent replacement data
- If the user has filled out personal details, education, work history, projects, certifications, or skills, preserve the identity fields exactly
- Preserve the candidate's source headline when it matches the explicit target job title. When the target differs, the headline must read "Target role: <target title>"; a vacancy is not an acquired title or career fact.
- If there is no explicit target job title, preserve only the source headline (or leave it blank). Never invent a headline from model output, work history, or missing profile data. Do not include the target company or target location in a target-role headline.
- Use a clean, single-column layout with standard section headings
- Format with bullet points starting with action verbs
- Quantify achievements only when metrics are supplied or directly supported by Candidate Profile; never invent numbers
- Preserve supplied dates, including expected graduation dates; never change dates to fit the role
- Never use the company name from the job description in work history
- Do not create certifications, projects, schools, employers, or job titles that are absent from the candidate profile

CERTIFICATION GUIDELINES:
- Only include certifications already present in Candidate Profile
- You may rewrite a provided certification description, but preserve name, issuer, and date

Job Description:
${jobDescriptionForPrompt}

Candidate Profile:
${serializedProfile}

${preliminaryKeywordAnalysis ? `Preliminary Local Keyword Signals:
${preliminaryKeywordAnalysis}
` : ''}

HANDLING MISSING PROFILE DATA:
- If the candidate's profile has missing fields, do not generate fake values
- For missing personal information (name, email, phone), return an empty string
- For missing education, work experience, certifications, or projects, return an empty array for that section
- Never research, guess, or invent institutions, companies, certifications, dates, or locations

Job Analysis:
- Job Title: ${extractedJobTitle || parsedJobData.title}
- Company: ${parsedJobData.company || 'Not specified'}
- Location: ${targetJobLocation || 'Not specified'}
- Employment Type: ${parsedJobData.employmentType || 'Not specified'}
- Role Category: ${parsedJobData.roleCategory}
- Stated Experience: ${formatJobExperience(parsedJobData.experience)}

CURRENT DATE REFERENCE:
- Today's date is ${formattedCurrentDate}
- Current year is ${currentYear}
- Use this to interpret present/current employment, not to replace supplied dates
- Preserve supplied current flags from Candidate Profile
- Work experience must be in REVERSE chronological order (newest first)
- Preserve supplied expected future dates, such as graduation dates
- Education and certification dates must come from Candidate Profile
- CRITICAL: The system will dynamically check the current date when validating dates

CAREER WORDING PREFERENCE (NOT CANDIDATE EVIDENCE):
- Selected wording preference: ${careerWordingPreference}
- This preference affects phrasing only. It is not evidence of the candidate's experience duration, held titles, leadership authority, management responsibilities or qualifications.
- The target job's title, seniority and required years describe the vacancy, not the candidate's career history.
- Never add executive authority, leadership scope, seniority or years of experience to satisfy this setting or the job requirements.
- Describe only responsibilities, qualifications and transferable skills explicitly supported by Candidate Profile. If the source does not establish a claim, omit it.

WORK HISTORY RULES:
- Use only the workExperience entries supplied in Candidate Profile
- Preserve each supplied work title, company, location, start date, end date, and current flag exactly
- You may rewrite descriptions and bullet points to emphasize truthful, relevant achievements from the supplied descriptions
- Do not rename the candidate's current or past job to the target role
- Do not create a current job if Candidate Profile does not contain one
- If Candidate Profile workExperience is empty, return "workExperience": []

Generate a complete resume with the following sections:
1. Personal Information (use the provided information)
2. Professional Summary (detailed and tailored to the job)
3. Work Experience (only the positions supplied in Candidate Profile; detailed truthful bullet points)
4. Skills (${length === 'comprehensive' ? '25-35' : length === 'concise' ? '10-15' : '15-25'} skills, prioritizing Candidate Profile skills that match the position)
5. Education (use the provided information)
6. Projects (only projects supplied in Candidate Profile)
7. Certifications (only certifications supplied in Candidate Profile)
8. Keyword Analysis (extract from the job description for the UI)
${additionalSections}

UNIVERSAL ATS PARSER CONTRACT:
- Return plain text fields only. Do not use HTML, markdown tables, pipes, text boxes, icons, emojis, images, columns, headers-only content, footers-only content, or hidden/white text.
- Use standard resume section names and simple single-column content that can be copied as plain text.
- Use normal hyphen bullets in descriptions, one achievement or responsibility per line.
- Avoid keyword stuffing. Include job-description keywords only where they truthfully match Candidate Profile.
- Prefer exact role terminology from the job description, but keep every claim grounded in Candidate Profile.
- Do not use first-person wording such as "I", "me", or "my".

IMPORTANT FORMATTING REQUIREMENTS:
- Preserve every supplied date exactly as it appears in Candidate Profile.
- If a source date is blank, return an empty string for that date; do not invent a replacement.
- If a supplied work item is marked current and has a blank end date, keep current true and return an empty endDate.
- Do not use phrases like "not specified", "current", or "ongoing" for missing dates.
- CRITICAL: Today's date is ${formattedCurrentDate}; preserve source dates without inventing replacements
- CRITICAL: All dates must be valid and properly formatted (no "undefined" or "NaN" values)
- CRITICAL: Double-check all dates to ensure they remain chronological without changing source identity fields

CONSISTENCY REQUIREMENTS:
- Include years of experience only when explicitly supported by Candidate Profile; otherwise omit a numeric claim
- CRITICAL: DO NOT use variables or calculations that could render as "NaN" in the final output
- The selected career level affects tone only; it does not establish years of experience
- CRITICAL: Make sure the professional summary accurately reflects the experience shown in the work history
- CRITICAL: Double-check that the years of experience mentioned in the summary match the actual timeline in the work experience section
- Never change source facts or add a duration claim to match a wording preference or target-job requirement

CERTIFICATION REQUIREMENTS:
- CRITICAL: Only include certifications already present in Candidate Profile
- CRITICAL: Preserve certification name, issuer, and date exactly
- CRITICAL: If Candidate Profile certifications is empty, return "certifications": []

CERTIFICATION GUIDELINES:
- You may tailor certification descriptions if descriptions are supplied
- Do not add certifications that the candidate did not provide

CERTIFICATION GENERATION GUIDELINES:
- No certification generation is allowed. Preserve supplied certifications or return an empty array.

KEYWORD ANALYSIS REQUIREMENTS:
- Extract keywords from the target job description with AI judgment, not from preset examples.
- Keep keywordAnalysis factual to the job description and do not add skills absent from the posting.
- Use concise keyword labels that a candidate could scan and decide whether they truthfully match.
- Limit keywordAnalysis.keywords to the 18 most important terms.
- Limit technical_skills, soft_skills, key_responsibilities, and ats_tips to the most useful items.

LOCATION FORMATTING REQUIREMENTS:
- When a country name is provided (e.g., "Georgia", "Turkey", "Canada"), ALWAYS use the full country name, never abbreviate it
- NEVER convert country names to state abbreviations (e.g., don't convert "Georgia" to "GA")
- For locations within the United States, you may use state abbreviations (e.g., "New York, NY")
- For international locations, use "City, Country" format (e.g., "Tbilisi, Georgia" or "Istanbul, Turkey")

COMPANY NAME REQUIREMENTS:
- CRITICAL: Company names must come only from Candidate Profile workExperience
- CRITICAL: Do not research, infer, or generate company names
- CRITICAL: If Candidate Profile workExperience is empty, return "workExperience": []

NO FABRICATION CHECK:
- Before returning JSON, confirm every employer, school, certification, project, date, and location appears in Candidate Profile.
- If a value does not appear in Candidate Profile, remove it.

IGNORED EXAMPLE DATA:
- Do not use any country/company examples. There are none.

Format the response STRICTLY as a JSON object with the following structure:
{
  "personalInfo": {
    "fullName": "...",
    "email": "...",
    "phone": "...",
    "location": "...",
    "linkedin": "...",
    "summary": "..."
  },
  "workExperience": [
    {
      "title": "...",
      "company": "...",
      "location": "...",
      "startDate": "supplied date string or empty string",
      "endDate": "supplied date string or empty string",
      "current": boolean,
      "description": "..."
    }
  ],
  "skills": ["...", "...", "..."],
  "education": [
    {
      "institution": "...",
      "degree": "...",
      "fieldOfStudy": "...",
      "location": "...",
      "startDate": "supplied date string or empty string",
      "endDate": "supplied date string or empty string",
      "current": boolean,
      "description": "..."
    }
  ],
  "projects": [
    {
      "title": "...",
      "description": "...",
      "technologies": "...",
      "startDate": "supplied date string or empty string",
      "endDate": "supplied date string or empty string"
    }
  ],
  "certifications": [
    {
      "name": "...",
      "issuer": "...",
      "date": "supplied date string or empty string",
      "description": "..."
    }
  ],
  "keywordAnalysis": {
    "keywords": ["keyword1", "keyword2"],
    "technical_skills": ["skill1", "skill2"],
    "soft_skills": ["skill1", "skill2"],
    "required_experience": "Description of required experience",
    "industry_specific_advice": "Specific tailoring advice for this role",
    "job_category": "Likely role category",
    "key_responsibilities": ["responsibility1", "responsibility2"],
    "ats_tips": ["tip1", "tip2"]
  },
  "selectedTemplate": "ats-friendly",
  "selectedFont": "Arial"
}`;

    const resumeMaxTokens = length === 'comprehensive' ? 4096 : length === 'concise' ? 2000 : 3000;

    const requestBody = buildAiRequestBody(fullPrompt, {
      temperature: 0.45,
      maxTokens: resumeMaxTokens,
      responseMimeType: "application/json",
    });

    // Call our AI proxy function with a longer timeout for resume generation (3 minutes)
    // This is the most complex operation and needs more time
    const result = await callAiProxy(requestBody, 180000, options.assertCurrentRequest);

    // Extract the response text from the result
    const responseText = extractAiResponseText(result);

    // Parse the JSON response with robust error handling
    const parsedResumeData = robustJSONParse(responseText, 'resume data');
    const parsedJob = {
      ...parsedJobData,
      title: extractedJobTitle || parsedJobData.title,
      location: targetJobLocation || parsedJobData.location,
    };
    // Root summary is a prose proposal too, never metadata or source evidence.
    const candidate = {
      personalInfo: { summary: parsedResumeData.personalInfo?.summary || parsedResumeData.personalInfo?.professionalSummary || parsedResumeData.summary || '' },
      workExperience: parsedResumeData.workExperience,
      education: parsedResumeData.education,
      projects: parsedResumeData.projects,
      certifications: parsedResumeData.certifications,
      keywordAnalysis: parsedResumeData.keywordAnalysis,
    };
    const qualityOptions = {
      jobDescription,
      keywordAnalysis: candidate.keywordAnalysis,
      fallbackKeywordAnalysis: keywordAnalysis,
      length,
      focusSkills: boundedFocusSkills,
      sourceProfile: formattedProfile,
    };
    const normalize = (value) => mapResumeData(hardenGeneratedResumeForAts(
      enforceAuthenticResumeSections(value, formattedProfile, parsedJob), qualityOptions
    ));
    options.assertCurrentRequest?.();
    return createResumeTailoringReview({
      baseResume: normalize({}),
      candidateResume: normalize(candidate),
      sourceInfo,
      targetJobTitle: parsedJob.title,
    });
  } catch (error) {
    console.error('Error generating enhanced resume with AI service:', error);
    const errorMessage = getErrorMessage(error);

    // Check for specific error types and provide appropriate messages
    let message;
    if (errorMessage.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your configuration.';
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else if (errorMessage.includes('token limit') || errorMessage.includes('too long')) {
      message = 'The job description may be too long for the AI service to process. Please try a shorter job description.';
    } else {
      message = errorMessage || 'Failed to generate resume with the AI service. Please try again.';
    }

    throw new Error(message);
  }
}

/**
 * Generate enhanced work experience bullet points
 * @param {string} title - Job title
 * @param {string} company - Company name
 * @param {string} description - Current job description
 * @param {string} jobDescription - Target job description to tailor to
 * @param {string} industry - Target industry
 * @param {string} length - Resume length preference
 * @returns {Promise<string>} - The AI-generated bullet points
 */
export async function generateEnhancedWorkExperienceBullets(title, company, description, jobDescription, industry = 'default', length = 'standard') {
  try {
    if (!isValidApiKey()) {
      throw new Error('No valid Supabase URL found. Please check your VITE_SUPABASE_URL in the .env file.');
    }
    let basePrompt = "You are an expert resume writer specializing in creating ATS-optimized work experience bullet points. Your task is to create impactful, achievement-oriented bullet points that will pass through applicant tracking systems with high scores.";
    if (industry !== 'default') basePrompt += `\n\nYou specialize in the ${industry} industry and understand the specific terminology, achievements, and metrics that are most valued in this field.`;
    basePrompt += `\n\nFollow these ATS optimization principles:\n1) Start each bullet with a strong action verb\n2) Use job-description keywords only when they truthfully match the supplied experience\n3) Quantify achievements only when the metric is supplied or directly supported; never invent numbers\n4) Use industry-standard terminology\n5) Keep bullets concise (1-2 lines each)\n6) Include both technical skills and soft skills only when supported by the supplied experience\n7) Return plain text hyphen bullets only; no markdown tables, HTML, emojis, icons, columns, or keyword stuffing`;

    const userContent = `Create ${length === 'concise' ? '2-3' : length === 'comprehensive' ? '6-8' : '4-5'} impactful bullet points for the following work experience, tailored to this job description:\n\nJob Description:\n${jobDescription}\n\nPosition: ${title}\nCompany: ${company}\nCurrent Description: ${description}\n\n${length === 'comprehensive' ? 'Provide detailed and comprehensive bullet points with specific metrics, achievements, and technical details. Each bullet point can be 1-3 lines long.' : length === 'concise' ? 'Keep bullet points very concise and focused on the most important achievements. Each bullet should be 1 line only.' : 'Format each bullet point with action verbs and quantifiable achievements when possible.'}\n\nReturn only the bullet points as a string with each point on a new line, starting with a bullet character.`;

    const fullPrompt = `${basePrompt}\n\n${userContent}`;

    const requestBody = buildAiRequestBody(fullPrompt, {
      temperature: 0.55,
      maxTokens: length === 'comprehensive' ? 1200 : 700,
    });

    // Call our AI proxy function with a 45-second timeout for work experience bullets
    const result = await callAiProxy(requestBody, 45000);

    // Extract the response text from the result
    return extractAiResponseText(result);
  } catch (error) {
    console.error('Error generating enhanced work experience bullets with AI service:', error);
    const errorMessage = getErrorMessage(error);

    // Check for specific error types and provide appropriate messages
    let message;
    if (errorMessage.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your configuration.';
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else {
      message = errorMessage || 'An error occurred while generating bullet points with the AI service. Please try again.';
    }

    throw new Error(message);
  }
}

/**
 * Generate an enhanced professional summary
 * @param {Object} resumeData - The user's resume data
 * @param {string} jobDescription - The job description to tailor the summary to
 * @param {string} industry - Target industry
 * @param {string} tone - Desired tone
 * @returns {Promise<string>} - The AI-generated professional summary
 */
export async function generateEnhancedProfessionalSummary(resumeData, jobDescription, industry = 'default', _tone = 'professional') { // tone parameter was unused
  try {
    if (!isValidApiKey()) {
      throw new Error('No valid Supabase URL found. Please check your VITE_SUPABASE_URL in the .env file.');
    }
    const { personalInfo, workExperience, skills } = resumeData;
    const jobTitle = personalInfo.jobTitle || '';
    const skillsList = Array.isArray(skills) ? skills.map(s => typeof s === 'string' ? s : s.name).join(', ') : '';
    let basePrompt = "You are an expert resume writer specializing in creating ATS-optimized professional summaries. Your task is to create an impactful, keyword-rich summary that will pass through applicant tracking systems with high scores.";
    if (industry !== 'default') basePrompt += `\n\nYou specialize in the ${industry} industry and understand the specific terminology, achievements, and qualifications that are most valued in this field.`;
    basePrompt += `\n\nFollow these ATS optimization principles:\n1) Include job-description keywords only when they truthfully match the resume data\n2) Highlight years of experience and key qualifications without exaggeration\n3) Mention specific technical skills and domain expertise only when supplied\n4) Keep the summary concise (3-4 sentences)\n5) Use industry-standard terminology\n6) Position the candidate as a credible fit for the role\n7) CALCULATE the total years of experience accurately from the work history\n8) Ensure the years of experience mentioned in the summary matches the actual work history\n9) Do not use first-person wording, markdown, HTML, emojis, icons, or keyword stuffing`;

    const userContent = `Create a professional summary for a ${jobTitle} position, tailored to this job description:\n\nJob Description:\n${jobDescription}\n\nAbout the candidate:\nSkills include: ${skillsList}\nRecent position: ${workExperience[0]?.title || ''} at ${workExperience[0]?.company || ''}\nWork experience timeline: ${workExperience.map(job => `${job.title || job.jobTitle} at ${job.company} (${job.startDate} - ${job.current ? 'Present' : job.endDate})`).join(', ')}\n\nIMPORTANT: Calculate the EXACT total years of experience from the work history above. Make sure the years mentioned in the summary match the actual work experience timeline.\n\nThe summary should be 3-4 sentences, highlight key strengths, and be ATS-friendly.`;

    const fullPrompt = `${basePrompt}\n\n${userContent}`;

    const requestBody = buildAiRequestBody(fullPrompt, {
      temperature: 0.55,
      maxTokens: 350,
    });

    // Call our AI proxy function with a 30-second timeout for professional summary
    const result = await callAiProxy(requestBody, 30000);

    // Extract the response text from the result
    return extractAiResponseText(result);
  } catch (error) {
    console.error('Error generating enhanced professional summary with AI service:', error);
    const errorMessage = getErrorMessage(error);

    // Check for specific error types and provide appropriate messages
    let message;
    if (errorMessage.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your configuration.';
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else {
      message = errorMessage || 'An error occurred while generating the summary with the AI service. Please try again.';
    }

    throw new Error(message);
  }
}
