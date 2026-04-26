import { getSimpleSystemPrompt } from '../utils/promptTemplates';
import { parseJobDescription } from '../utils/jobDescriptionParser';
import { robustJSONParse } from '../utils/security';
import { supabase } from './supabase';
import { enforceAuthenticResumeSections, sanitizeTargetJobTitle } from '../utils/resumeAuthenticity';
import { hardenGeneratedResumeForAts } from '../utils/generatedResumeQuality';

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
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  // Basic check for a non-empty, non-placeholder URL
  return supabaseUrl && supabaseUrl.includes('supabase.co');
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
      throw createRetryableAiError(error.message || 'Failed to call AI proxy', functionName);
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

    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
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
async function callAiProxy(requestBody, timeoutMs = 120000) { // 2-minute timeout by default
  let lastRetryableError = null;

  for (const functionName of AI_PROXY_FALLBACK_ORDER) {
    try {
      return await invokeAiProxy(functionName, requestBody, timeoutMs);
    } catch (error) {
      if (error.aiAccessDenied || !error.aiProxyRetryable) {
        throw error;
      }

      lastRetryableError = error;
      debugWarn(`${functionName} unavailable; trying next provider if available.`, error.message);
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
- Experience Level: ${parsedData.experience.level}
- Years of Experience: ${parsedData.experience.years !== null ? `${parsedData.experience.years} years` : 'Not specified'}

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
      required_experience: content.required_experience ||
        (parsedData.experience.years !== null ?
          `${parsedData.experience.years} years (${parsedData.experience.level})` :
          'Not specified'),
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

    // Check for specific error types and provide appropriate messages
    let message;
    if (error.message.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your server-side configuration.';
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else {
      message = error.message || 'Failed to analyze job description with the AI service. Please try again.';
    }

    throw new Error(message);
  }
}

/**
 * Generate an enhanced resume based on user profile, job description, and customization options
 * @param {Object} userProfile - The user's profile data
 * @param {string} jobDescription - The job description to tailor the resume to
 * @param {Object} options - Customization options (industry, careerLevel, tone, length, focusSkills)
 * @returns {Promise<Object>} - The AI-generated resume
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
      careerLevel = 'mid',
      tone = 'professional',
      length = 'standard',
      focusSkills = '',
      userCountry = '',
      jobLocation = ''
    } = options;

    const profilePersonal = userProfile.personal || userProfile.personalInfo || {};

    // Format the full profile for the AI. Missing sections must stay missing;
    // otherwise the model fills gaps with fake companies/certifications.
    const formattedProfile = {
      personal: profilePersonal,
      education: userProfile.education || [],
      workExperience: userProfile.workExperience || userProfile.experience || [],
      skills: userProfile.skills || [],
      certifications: userProfile.certifications || [],
      projects: userProfile.projects || [],
      languages: userProfile.languages || [],
      interests: userProfile.interests || [],
      additionalSections: userProfile.additionalSections || [],
    };

    // Base prompt instructions
    let basePrompt = getSimpleSystemPrompt();

    // Add focus skills if provided
    if (focusSkills && focusSkills.trim()) {
      basePrompt += `\n\nFOCUS SKILLS: Emphasize the following skills in the resume: ${focusSkills}`;
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
    const targetJobLocation = jobLocation.trim() || parsedJobData.location || '';
    const targetIndustryLabel = optionLabel('industry', industry, 'General / Not Specified');
    const targetToneLabel = optionLabel('tone', tone, 'Professional');
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
- Candidate country or region for resume convention nuance: ${userCountry.trim() || 'Not specified'}
- Target job location: ${targetJobLocation || 'Not specified'}
- Use country and target-location context only for wording conventions and relevance. Do not overwrite the candidate's contact location or invent relocation details.`;

    // Construct the full prompt for the AI service
    const fullPrompt = `${basePrompt}

Create a complete ATS-optimized resume for the following job description, using the candidate's profile information.

IMPORTANT GUIDELINES:
- Use the candidate's profile data as the only source of truth
- If a profile field or section is missing, leave it blank or return an empty array; do not invent replacement data
- If the user has filled out personal details, education, work history, projects, certifications, or skills, preserve the identity fields exactly
- Use the target job title only as the resume headline/jobTitle. Do not include the target company or target location in that headline.
- Use a clean, single-column layout with standard section headings
- Format with bullet points starting with action verbs
- Quantify achievements only when metrics are supplied or directly supported by Candidate Profile; never invent numbers
- Ensure all dates are in the past and chronologically consistent
- Never use the company name from the job description in work history
- Do not create certifications, projects, schools, employers, or job titles that are absent from the candidate profile

CERTIFICATION GUIDELINES:
- Only include certifications already present in Candidate Profile
- You may rewrite a provided certification description, but preserve name, issuer, and date

Job Description:
${jobDescriptionForPrompt}

Candidate Profile:
${maybeTruncate(JSON.stringify(formattedProfile, null, 2), 5000)}

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
- Experience Level: ${parsedJobData.experience.level}${parsedJobData.experience.years !== null ? ` (${parsedJobData.experience.years} years required)` : ''}

CURRENT DATE REFERENCE:
- Today's date is ${formattedCurrentDate}
- Current year is ${currentYear}
- Use this only to detect and avoid future dates
- Preserve supplied current flags from Candidate Profile
- Work experience must be in REVERSE chronological order (newest first)
- NO dates in the future (after ${formattedCurrentDate}) should be used
- Education and certification dates must come from Candidate Profile
- CRITICAL: The system will dynamically check the current date when validating dates

CAREER LEVEL ENFORCEMENT:
${careerLevel === 'entry' ?
        `- Optimize phrasing for entry-level roles\n- Do not add experience that is not present in Candidate Profile\n- In the professional summary, never claim more years than the supplied timeline supports` :
        careerLevel === 'mid' ?
          `- Optimize phrasing for mid-level roles\n- Do not add experience that is not present in Candidate Profile\n- In the professional summary, never claim more years than the supplied timeline supports` :
          careerLevel === 'senior' ?
            `- Optimize phrasing for senior roles\n- Do not add experience that is not present in Candidate Profile\n- In the professional summary, never claim more years than the supplied timeline supports` :
            careerLevel === 'executive' ?
              `- Optimize phrasing for executive roles\n- Do not add experience that is not present in Candidate Profile\n- In the professional summary, never claim more years than the supplied timeline supports` :
              careerLevel === 'career-change' ?
                `- Optimize phrasing for a career change\n- Translate only real transferable skills from Candidate Profile into target-role language\n- Do not add experience that is not present in Candidate Profile\n- In the professional summary, never claim more years than the supplied timeline supports` :
              `- Optimize phrasing for the selected career level\n- Do not add experience that is not present in Candidate Profile\n- In the professional summary, never claim more years than the supplied timeline supports`}

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
- CRITICAL: Today's date is ${formattedCurrentDate} - no generated or rewritten dates should be after this date
- CRITICAL: All dates must be valid and properly formatted (no "undefined" or "NaN" values)
- CRITICAL: Double-check all dates to ensure they remain chronological without changing source identity fields

CONSISTENCY REQUIREMENTS:
- CRITICAL: In the professional summary, use a SPECIFIC NUMBER for years of experience (e.g., "5+ years of experience")
- CRITICAL: DO NOT use variables or calculations that could render as "NaN" in the final output
- CRITICAL: For customer service roles, use "3+ years", "4+ years", or "5+ years" of experience for mid-level positions
- CRITICAL: Make sure the professional summary accurately reflects the experience shown in the work history
- CRITICAL: Double-check that the years of experience mentioned in the summary match the actual timeline in the work experience section
- CRITICAL: VERIFY that the total years of experience matches the career level requirements specified above

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
    const result = await callAiProxy(requestBody, 180000);

    // Extract the response text from the result
    const responseText = extractAiResponseText(result);

    // Parse the JSON response with robust error handling
    const parsedResumeData = robustJSONParse(responseText, 'resume data');
    let resumeData = enforceAuthenticResumeSections(parsedResumeData, formattedProfile, {
      ...parsedJobData,
      title: extractedJobTitle || parsedJobData.title,
      location: targetJobLocation || parsedJobData.location,
    });


    const { ensureEducationWorkConsistency } = await import('../utils/dateUtils.js');
    debugLog('Skipping post-processing as requested');

    if (resumeData.education && resumeData.workExperience) {
      resumeData.education = ensureEducationWorkConsistency(resumeData.education, resumeData.workExperience);
    }

    const validateResumeMatchesJobDescription = (data, jobDesc) => {
      const workExperiences = data.workExperience || [];
      if (workExperiences.length === 0) return true;
      const mostRecentJob = workExperiences[0];
      const mostRecentJobTitle = mostRecentJob.title.toLowerCase();
      const jobDescriptionLower = jobDesc.toLowerCase();
      const isTechnicalJob = jobDescriptionLower.includes('software') || jobDescriptionLower.includes('developer') || jobDescriptionLower.includes('engineer') || jobDescriptionLower.includes('programming') || jobDescriptionLower.includes('code');
      const isCustomerServiceJob = jobDescriptionLower.includes('customer service') || jobDescriptionLower.includes('customer support') || jobDescriptionLower.includes('customer experience') || jobDescriptionLower.includes('call center');
      const isMarketingJob = jobDescriptionLower.includes('marketing') || jobDescriptionLower.includes('social media') || jobDescriptionLower.includes('content') || jobDescriptionLower.includes('seo');
      const possibleMismatch = (isTechnicalJob && (mostRecentJobTitle.includes('customer service') || mostRecentJobTitle.includes('marketing'))) || (isCustomerServiceJob && (mostRecentJobTitle.includes('software') || mostRecentJobTitle.includes('developer') || mostRecentJobTitle.includes('engineer'))) || (isMarketingJob && (mostRecentJobTitle.includes('software') || mostRecentJobTitle.includes('developer') || mostRecentJobTitle.includes('customer service')));
      if (possibleMismatch) {
        debugWarn('Possible resume mismatch detected:', { jobDescription: jobDesc.substring(0, 100) + '...', generatedJobTitle: mostRecentJob.title, isTechnicalJob, isCustomerServiceJob, isMarketingJob });
        return false;
      }
      return true;
    };

    const resumeMatches = validateResumeMatchesJobDescription(resumeData, jobDescription);
    if (!resumeMatches) {
      debugWarn('Resume does not match job description. Consider regenerating.');
    }

    const validateCareerLevel = (data, level) => {
      const workExperiences = data.workExperience || [];
      if (workExperiences.length === 0) return true;
      let earliestDate = new Date();
      let latestDate = new Date(0);
      workExperiences.forEach(job => {
        const startDate = new Date(job.startDate);
        const endDate = job.current ? new Date() : new Date(job.endDate);
        if (startDate < earliestDate) earliestDate = startDate;
        if (endDate > latestDate) latestDate = endDate;
      });
      const yearsDiff = (latestDate.getFullYear() - earliestDate.getFullYear()) + (latestDate.getMonth() - earliestDate.getMonth()) / 12;
      switch (level) {
        case 'entry': return yearsDiff <= 2;
        case 'mid': return yearsDiff >= 3 && yearsDiff <= 5;
        case 'senior': return yearsDiff >= 6 && yearsDiff <= 10;
        case 'executive': return yearsDiff >= 10;
        default: return true;
      }
    };

    const validateCareerProgression = (data) => {
      const workExperiences = data.workExperience || [];
      if (workExperiences.length <= 1) return true;
      const sortedExperiences = [...workExperiences].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      const seniorityKeywords = { junior: 1, associate: 1, intern: 1, assistant: 1, trainee: 1, entry: 1, developer: 2, engineer: 2, analyst: 2, specialist: 2, consultant: 2, technician: 2, designer: 2, coordinator: 2, senior: 3, lead: 3, principal: 3, staff: 3, architect: 3, advanced: 3, experienced: 3, manager: 4, director: 4, head: 4, chief: 4, vp: 4, executive: 4, cto: 4, ceo: 4, president: 4, founder: 4 };
      const getSeniorityLevel = (title) => {
        const lowerTitle = title.toLowerCase();
        let highestLevel = 0;
        Object.keys(seniorityKeywords).forEach(keyword => { if (lowerTitle.includes(keyword)) { const level = seniorityKeywords[keyword]; if (level > highestLevel) highestLevel = level; } });
        return highestLevel || 2;
      };
      const jobTitles = workExperiences.map(job => job.title.toLowerCase());
      const mostRecentJob = workExperiences.reduce((latest, job) => (!latest || new Date(job.endDate) > new Date(latest.endDate)) ? job : latest, null);
      const mostRecentJobTitle = mostRecentJob?.title?.toLowerCase() || '';
      let allJobsInSameField = true;
      const fieldCategories = { technical: ['developer', 'engineer', 'programmer', 'software', 'web', 'mobile', 'frontend', 'backend', 'fullstack', 'devops', 'cloud', 'data', 'network', 'security', 'database'], customerService: ['customer service', 'customer support', 'customer experience', 'call center', 'help desk', 'service agent', 'support specialist'], marketing: ['marketing', 'social media', 'content', 'seo', 'brand', 'digital marketing', 'campaign', 'growth'], sales: ['sales', 'account executive', 'business development', 'account manager', 'sales representative'], finance: ['finance', 'accounting', 'financial', 'accountant', 'bookkeeper', 'controller'], healthcare: ['nurse', 'doctor', 'medical', 'health', 'healthcare', 'clinical', 'patient'], hospitality: ['hotel', 'restaurant', 'chef', 'cook', 'waiter', 'waitress', 'host', 'hostess', 'server'] };
      let mostRecentJobField = null;
      for (const [field, keywords] of Object.entries(fieldCategories)) { if (keywords.some(keyword => mostRecentJobTitle.includes(keyword))) { mostRecentJobField = field; break; } }
      if (mostRecentJobField) {
        const fieldKeywords = fieldCategories[mostRecentJobField];
        for (const title of jobTitles) {
          if (title === mostRecentJobTitle) continue;
          const isInSameField = fieldKeywords.some(keyword => title.includes(keyword));
          const isInOtherField = Object.entries(fieldCategories).filter(([field]) => field !== mostRecentJobField).some(([, keywords]) => keywords.some(keyword => title.includes(keyword)));
          if (isInOtherField || !isInSameField) { allJobsInSameField = false; break; }
        }
      }
      let previousLevel = getSeniorityLevel(sortedExperiences[0].title);
      let seniorityProgression = true;
      for (let i = 1; i < sortedExperiences.length; i++) { const currentLevel = getSeniorityLevel(sortedExperiences[i].title); if (currentLevel < previousLevel) { seniorityProgression = false; break; } previousLevel = currentLevel; }
      return allJobsInSameField && seniorityProgression;
    };

    const validateSummaryYears = (data, level) => {
      const summary = data.personalInfo?.summary || '';
      switch (level) {
        case 'entry': return !/(3\+|4\+|5\+|6\+|7\+|8\+|9\+|10\+|\d{2}\+)\s*years?/i.test(summary);
        case 'mid': return !/(0\+|1\+|2\+|6\+|7\+|8\+|9\+|10\+|\d{2}\+)\s*years?/i.test(summary) && /(3\+|4\+|5\+|5)\s*years?/i.test(summary);
        case 'senior': return !/(0\+|1\+|2\+|3\+|4\+|5\+|\d{2}\+)\s*years?/i.test(summary) && /(6\+|7\+|8\+|9\+|10\+|10)\s*years?/i.test(summary);
        case 'executive': return !/(0\+|1\+|2\+|3\+|4\+|5\+|6\+|7\+|8\+|9\+)\s*years?/i.test(summary) && /(10\+|\d{2}\+)\s*years?/i.test(summary);
        default: return true;
      }
    };

    const validateCertifications = async (data) => {
      if (!data.certifications || data.certifications.length === 0) return true;
      const currentDate = new Date();
      for (const cert of data.certifications) {
        try {
          const certDate = new Date(cert.date);
          if (certDate > currentDate) {
            debugWarn('Future date detected in certification:', {
              certification: cert.name,
              date: cert.date
            });
            return false;
          }
        } catch {
          debugWarn('Could not parse certification date:', cert.date);
        }
      }
      return true;
    };

    const validateDates = async (data) => {
      const { getCurrentDateInfo: getDateInfo } = await import('../utils/dateUtils.js');
      const dateInfo = getDateInfo();
      const currentDate = dateInfo.date;
      let allDatesValid = true;
      const checkDate = (dateStr) => { if (dateStr) { try { const d = new Date(dateStr); if (!isNaN(d.getTime()) && d > currentDate) allDatesValid = false; } catch { debugWarn('Could not parse date:', dateStr); } } };
      (data.workExperience || []).forEach(job => { checkDate(job.startDate); if (!job.current) checkDate(job.endDate); });
      (data.education || []).forEach(edu => { checkDate(edu.startDate); if (!edu.current) checkDate(edu.endDate); });
      (data.projects || []).forEach(proj => { checkDate(proj.startDate); checkDate(proj.endDate); });
      (data.certifications || []).forEach(cert => checkDate(cert.date));
      return allDatesValid;
    };

    const datesValid = await validateDates(resumeData);
    const certificationsValid = await validateCertifications(resumeData);

    if (!validateCareerLevel(resumeData, careerLevel) || !validateSummaryYears(resumeData, careerLevel) || !validateCareerProgression(resumeData) || !datesValid || !certificationsValid) {
      if (!validateSummaryYears(resumeData, careerLevel) && resumeData.personalInfo) {
        const summary = resumeData.personalInfo.summary || '';
        let fixedSummary = summary;
        switch (careerLevel) {
          case 'entry': fixedSummary = summary.replace(/(\d+\+|\d+)\s*years?/i, '1+ year'); break;
          case 'mid': fixedSummary = summary.replace(/(\d+\+|\d+)\s*years?/i, '4+ years'); break;
          case 'senior': fixedSummary = summary.replace(/(\d+\+|\d+)\s*years?/i, '7+ years'); break;
          case 'executive': fixedSummary = summary.replace(/(\d+\+|\d+)\s*years?/i, '10+ years'); break;
        }
        resumeData.personalInfo.summary = fixedSummary;
      }
      if (!datesValid) {
        debugLog('Fixing future dates in resume data...');
        const { getCurrentDateInfo: getDateInfo } = await import('../utils/dateUtils.js');
        const dateInfo = getDateInfo();
        const currentDate = dateInfo.date;
        const formatDate = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        const fixDate = (dateStr) => { try { const d = new Date(dateStr); return (!isNaN(d.getTime()) && d > currentDate) ? formatDate(currentDate) : dateStr; } catch { return dateStr; } };
        (resumeData.workExperience || []).forEach(job => { job.startDate = fixDate(job.startDate); if (!job.current && job.endDate) job.endDate = fixDate(job.endDate); });
        (resumeData.education || []).forEach(edu => { edu.startDate = fixDate(edu.startDate); if (!edu.current && edu.endDate && edu.endDate.toLowerCase() !== 'present') edu.endDate = fixDate(edu.endDate); });
        (resumeData.projects || []).forEach(proj => { proj.startDate = fixDate(proj.startDate); if (proj.endDate) proj.endDate = fixDate(proj.endDate); });
        (resumeData.certifications || []).forEach(cert => { if (cert.date) cert.date = fixDate(cert.date); });
      }
    }

    if (profilePersonal.location) resumeData.personalInfo.location = profilePersonal.location;
    if (formattedProfile.education.length > 0) resumeData.education = formattedProfile.education;

    resumeData = hardenGeneratedResumeForAts(resumeData, {
      jobDescription,
      keywordAnalysis: resumeData.keywordAnalysis,
      fallbackKeywordAnalysis: keywordAnalysis,
      length,
      focusSkills,
      sourceProfile: formattedProfile,
    });

    return resumeData;
  } catch (error) {
    console.error('Error generating enhanced resume with AI service:', error);

    // Check for specific error types and provide appropriate messages
    let message;
    if (error.message.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your configuration.';
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else if (error.message.includes('token limit') || error.message.includes('too long')) {
      message = 'The job description may be too long for the AI service to process. Please try a shorter job description.';
    } else {
      message = error.message || 'Failed to generate resume with the AI service. Please try again.';
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

    // Check for specific error types and provide appropriate messages
    let message;
    if (error.message.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your configuration.';
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else {
      message = error.message || 'An error occurred while generating bullet points with the AI service. Please try again.';
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

    // Check for specific error types and provide appropriate messages
    let message;
    if (error.message.includes('API key not valid')) {
      message = 'AI API key not valid. Please check your configuration.';
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      message = 'The AI service returned an incomplete response. This is often a temporary issue. Please try again.';
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      message = 'The request to the AI service timed out. Please try again when the service is less busy.';
    } else {
      message = error.message || 'An error occurred while generating the summary with the AI service. Please try again.';
    }

    throw new Error(message);
  }
}
