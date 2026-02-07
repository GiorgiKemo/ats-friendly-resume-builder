import { getSimpleSystemPrompt } from '../utils/promptTemplates';
import { parseJobDescription } from '../utils/jobDescriptionParser';
import { robustJSONParse } from '../utils/security';
import { supabase } from './supabase';

const DEBUG_AI = import.meta.env.DEV && import.meta.env.VITE_DEBUG_AI === 'true';
const AI_PROVIDER = (import.meta.env.VITE_AI_PROVIDER || 'groq').toLowerCase();
const USE_GEMINI = AI_PROVIDER === 'gemini';
const debugLog = (...args) => {
  if (DEBUG_AI) console.log(...args);
};
const debugWarn = (...args) => {
  if (DEBUG_AI) console.warn(...args);
};

const GEMINI_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

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
  return USE_GEMINI ? text : truncateText(text, maxChars);
};

// Legacy Gemini request/response shape (kept for future use):
// const requestBody = {
//   contents: [{ role: "user", parts: [{ text: promptOrFullPrompt }] }],
//   generationConfig: {
//     responseMimeType: "application/json",
//     temperature: 0.7,
//     maxOutputTokens: 2500,
//   },
// };
// const { data } = await supabase.functions.invoke('gemini-proxy', { body: requestBody });
// const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

const buildAiRequestBody = (prompt, {
  temperature = 0.7,
  maxTokens = 1200,
  responseMimeType,
  topP = 0.8,
  topK = 40,
  safetySettings = GEMINI_SAFETY_SETTINGS,
} = {}) => {
  if (USE_GEMINI) {
    const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
      ...(typeof topP === 'number' ? { topP } : {}),
      ...(typeof topK === 'number' ? { topK } : {}),
    };
    return {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
      ...(Array.isArray(safetySettings) ? { safetySettings } : {}),
    };
  }

  return {
    messages: [
      { role: "user", content: prompt }
    ],
    temperature,
    maxTokens,
  };
};

const extractAiResponseText = (result) => {
  if (USE_GEMINI) {
    return result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  return result?.choices?.[0]?.message?.content || '';
};

// Helper function to call our AI proxy function with timeout
async function callAiProxy(requestBody, timeoutMs = 120000) { // 2-minute timeout by default
  try {
    // Create an AbortController to handle timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const functionName = USE_GEMINI ? 'gemini-proxy' : 'groq-proxy';

    // Call the function with the abort signal
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: requestBody,
      signal: controller.signal,
      options: {
        // Add headers to indicate this is a large request that may take time
        headers: {
          'X-Request-Type': 'large-model-request',
          'X-Request-Timeout': timeoutMs.toString()
        }
      }
    });

    // Clear the timeout
    clearTimeout(timeoutId);

    if (error) {
      console.error('Error calling AI proxy:', error);
      throw new Error(error.message || 'Failed to call AI proxy');
    }

    if (data?.error) {
      const details = typeof data.details === 'string'
        ? data.details
        : JSON.stringify(data.details || data.error);
      throw new Error(details || data.error);
    }

    return data;
  } catch (error) {
    // Check if this was a timeout error
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      console.error('Request to AI API timed out');
      throw new Error('The request to the AI service timed out. Please try again with a shorter job description or when the service is less busy.');
    }

    console.error('Exception calling AI proxy:', error);
    throw error;
  }
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
      maxTokens: USE_GEMINI ? 2500 : 1200,
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
export async function generateEnhancedResume(userProfile, jobDescription, options = {}, _keywordAnalysis = null) { // keywordAnalysis was unused
  try {
    // Check if we have a valid Supabase URL
    if (!isValidApiKey()) {
      throw new Error('No valid Supabase URL found. Please check your VITE_SUPABASE_URL in the .env file.');
    }

    // Extract options with defaults
    const {
      careerLevel = 'mid',
      length = 'standard',
      focusSkills = ''
    } = options;

    // Format the user profile for the AI
    const formattedProfile = {
      personal: userProfile.personal || {},
      education: userProfile.education || [],
    };

    // Base prompt instructions
    let basePrompt = getSimpleSystemPrompt();

    // Add focus skills if provided
    if (focusSkills && focusSkills.trim()) {
      basePrompt += `\n\nFOCUS SKILLS: Emphasize the following skills in the resume: ${focusSkills}`;
    }

    // Determine the number of work experiences and projects based on length
    let workExperienceCount, projectCount;
    let additionalSections = '';

    if (length === 'concise') {
      workExperienceCount = '2-3';
      projectCount = '1-2';
    } else if (length === 'comprehensive') {
      workExperienceCount = '5-7';
      projectCount = '3-5';
      additionalSections = `8. Publications or Speaking Engagements (if relevant)
9. Professional Affiliations
10. Additional Training and Courses`;
    } else { // standard
      workExperienceCount = '3-5';
      projectCount = '2-3';
    }

    const { getCurrentDateInfo } = await import('../utils/dateUtils.js');
    const dateInfo = getCurrentDateInfo();
    const formattedCurrentDate = dateInfo.formatted;
    const currentYear = dateInfo.year;
    const currentMonth = dateInfo.month;

    debugLog(`Current date used for resume generation: ${formattedCurrentDate}`);

    const jobDescriptionForPrompt = maybeTruncate(jobDescription, 6000);
    const parsedJobData = parseJobDescription(jobDescriptionForPrompt);
    const extractedJobTitle = parsedJobData.title;
    debugLog('Extracted Job Title:', extractedJobTitle);

    basePrompt += `\n\nEXTRACTED JOB TITLE: "${extractedJobTitle}"`;
    basePrompt += `\n\nIMPORTANT: You MUST generate a resume that directly matches the skills, experience, and qualifications mentioned in the job description. The work experience MUST be in the SAME FIELD as the job description, not in unrelated fields.`;
    basePrompt += `\n\nCRITICAL: Carefully analyze the job description to understand what field it belongs to. If it's for a software developer, generate software development experience. If it's for customer service, generate customer service experience. If it's for marketing, generate marketing experience. NEVER mix unrelated fields.`;
    basePrompt += `\n\nCRITICAL: The most recent job title in the work experience MUST be directly related to the job being applied for. For example, if applying for "Customer Service Agent", the most recent job should be in customer service, not software engineering or an unrelated field.`;
    basePrompt += `\n\nCRITICAL: All previous positions MUST show a logical career progression in the SAME FIELD as the job description. For example, if the job is for a "Software Engineer", previous positions should be related roles like "Junior Developer", "Software Developer", etc. NEVER mix job titles from different fields.`;
    basePrompt += `\n\nIMPORTANT: If the job description is for a customer service role, generate appropriate job titles that match the specific role and industry. Ensure the job titles are relevant to the position being applied for and reflect the candidate's experience level.`;
    basePrompt += `\n\nIMPORTANT: If the job description is for a technical role, generate appropriate job titles that match the specific technologies and industry. Ensure the job titles are relevant to the position being applied for and reflect the candidate's experience level.`;

    // Construct the full prompt for the AI service
    const fullPrompt = `${basePrompt}

Create a complete ATS-optimized resume for the following job description, using the candidate's profile information.

IMPORTANT GUIDELINES:
- Use the candidate's profile data when available
- For any missing profile data, generate realistic AI content based on the job description
- If the user has filled out their personal details, use those values
- If the user has filled out their education details, use those values
- For any missing fields, generate appropriate content based on the user's location
- Create realistic work experience that shows career progression
- Use a clean, single-column layout with standard section headings
- Format with bullet points starting with action verbs
- Quantify achievements with specific metrics when possible
- Ensure all dates are in the past and chronologically consistent
- Never use the company name from the job description in work history
- Generate appropriate skills based on the job description
- Create relevant certifications for the industry and role
- Create projects that demonstrate applicable skills

CERTIFICATION GUIDELINES:
- Generate appropriate certifications based on the job description and industry
- Ensure certifications are relevant to the role and would be valuable for the candidate
- Use real certifications that exist in the specific industry

Job Description:
${jobDescriptionForPrompt}

Candidate Profile:
${maybeTruncate(JSON.stringify(formattedProfile, null, 2), 5000)}

HANDLING MISSING PROFILE DATA:
- If the candidate's profile has missing fields, generate appropriate content
- For missing personal information (name, email, phone), generate realistic values based on the user's location
- For missing education information, generate realistic education details from real institutions in the user's location
- Always use real educational institutions from the user's country
- If the user's country is specified (e.g., "Georgia"), use well-known universities from that country
- For example, if the user is from Georgia, use Georgian universities like Tbilisi State University, Georgian Technical University, etc.
- If the user is from Poland, use Polish universities like University of Warsaw, Jagiellonian University, etc.
- Research and use actual educational institutions from the user's specific country

Job Analysis:
- Job Title: ${parsedJobData.title}
- Role Category: ${parsedJobData.roleCategory}
- Experience Level: ${parsedJobData.experience.level}${parsedJobData.experience.years !== null ? ` (${parsedJobData.experience.years} years required)` : ''}

CURRENT DATE REFERENCE:
- Today's date is ${formattedCurrentDate}
- Current year is ${currentYear}
- Use this as the reference point for all "current" positions
- All dates must be realistic and chronological
- Work experience must be in REVERSE chronological order (newest first)
- The most recent job should have an end date of "Present" or "${currentMonth}/${currentYear}"
- NO dates in the future (after ${formattedCurrentDate}) should be used
- Education dates should be in the past and make sense for the career level
- Certification dates should be in the past (before or on ${formattedCurrentDate})
- CRITICAL: The system will dynamically check the current date when validating dates

CAREER LEVEL ENFORCEMENT:
${careerLevel === 'entry' ?
        `- You MUST create a resume with 0-2 years of total work experience\n- The earliest work experience date MUST NOT be earlier than ${currentYear - 2}\n- In the professional summary, ONLY mention "1+ year" or "2 years" of experience, NEVER MORE` :
        careerLevel === 'mid' ?
          `- You MUST create a resume with 3-5 years of total work experience\n- The earliest work experience date MUST NOT be earlier than ${currentYear - 5}\n- In the professional summary, ONLY mention "3+ years", "4+ years", or "5 years" of experience, NEVER MORE` :
          careerLevel === 'senior' ?
            `- You MUST create a resume with 6-10 years of total work experience\n- The earliest work experience date MUST NOT be earlier than ${currentYear - 10}\n- In the professional summary, ONLY mention "6+ years", "7+ years", "8+ years", "9+ years", or "10 years" of experience, NEVER MORE` :
            careerLevel === 'executive' ?
              `- You MUST create a resume with 10+ years of total work experience\n- The earliest work experience date MUST be before ${currentYear - 10}\n- In the professional summary, mention "10+ years", "15+ years", or similar experience level` :
              `- You MUST create a resume with 3-5 years of total work experience\n- The earliest work experience date MUST NOT be earlier than ${currentYear - 5}\n- In the professional summary, ONLY mention "3+ years", "4+ years", or "5 years" of experience, NEVER MORE`}

CAREER PROGRESSION LOGIC:
- CRITICAL: Everyone starts their career at entry level, regardless of total experience
- The first job in the work history MUST ALWAYS be entry-level (e.g., "Intern", "Junior", "Assistant")
- Show a logical career progression with job titles that reflect growth over time
- CRITICAL: The most recent job title MUST EXACTLY MATCH the job title from the job description
- CRITICAL: All job titles MUST be in the SAME FIELD as the job description
- CRITICAL: Analyze the job description carefully to determine the appropriate field
- CRITICAL: If the job description is for a technical role (e.g., "Software Engineer"), all job titles must be technical (e.g., "Junior Developer", "Software Developer", "Senior Software Engineer")
- CRITICAL: If the job description is for a customer service role, all job titles must be customer service-related
- CRITICAL: If the job description is for a marketing role, all job titles must be marketing-related
- CRITICAL: NEVER generate job titles in unrelated fields (e.g., don't generate "Software Developer" for a "Marketing Manager" position)
- Create a natural progression from entry level to the target career level
- For entry-level resumes: All positions should be entry-level
- For mid-level resumes: Start with entry-level, then progress to mid-level positions
- For senior-level resumes: Start with entry-level, progress through mid-level, then to senior positions
- For executive-level resumes: Show complete progression from entry-level through all career stages
- NEVER have someone start as a senior or lead in their first job
- NEVER have someone move from a more senior position to a more junior position
- Ensure job responsibilities match the seniority level of each position
- Make sure the earliest job shows appropriate entry-level responsibilities

Generate a complete resume with the following sections:
1. Personal Information (use the provided information)
2. Professional Summary (detailed and tailored to the job)
3. Work Experience (${workExperienceCount} relevant positions with detailed bullet points)
4. Skills (${length === 'comprehensive' ? '25-35' : length === 'concise' ? '10-15' : '15-25'} technical and soft skills relevant to the position)
5. Education (use the provided information)
6. Projects (${projectCount} relevant projects with technologies used)
7. Certifications (if relevant)
${additionalSections}

IMPORTANT FORMATTING REQUIREMENTS:
- ALL dates must be specific months and years (e.g., "January 2020 - March 2023")
- NEVER use phrases like "not specified", "present", "current", or "ongoing" for dates
- For current positions, use the current month and year (e.g., "January 2020 - ${new Date().toLocaleString('en-US', { month: 'long' })} ${currentYear}")
- For education, always include specific graduation dates or attendance periods
- For projects, ALWAYS include specific start and end dates (e.g., "March 2022 - August 2022")
- For additional projects, ALWAYS include specific dates, never leave them unspecified
- For certifications, include specific dates when they were obtained
- If exact dates are not known, generate realistic dates that make sense with the career timeline
- CRITICAL: Today's date is ${formattedCurrentDate} - NO dates should be after this date
- CRITICAL: All dates must be valid and properly formatted (no "undefined" or "NaN" values)
- CRITICAL: Double-check all dates to ensure they are realistic and chronologically correct

CONSISTENCY REQUIREMENTS:
- CRITICAL: In the professional summary, use a SPECIFIC NUMBER for years of experience (e.g., "5+ years of experience")
- CRITICAL: DO NOT use variables or calculations that could render as "NaN" in the final output
- CRITICAL: For customer service roles, use "3+ years", "4+ years", or "5+ years" of experience for mid-level positions
- CRITICAL: Make sure the professional summary accurately reflects the experience shown in the work history
- CRITICAL: Double-check that the years of experience mentioned in the summary match the actual timeline in the work experience section
- CRITICAL: VERIFY that the total years of experience matches the career level requirements specified above

CERTIFICATION REQUIREMENTS:
- CRITICAL: Only include REAL, industry-relevant certifications that actually exist
- CRITICAL: Analyze the job description to determine which certifications would be most relevant and valuable
- CRITICAL: Certifications MUST be relevant to the job field and industry identified in the job description
- CRITICAL: NEVER include certifications from unrelated fields (e.g., don't include TensorFlow for customer service roles)
- CRITICAL: Certification dates must be LOGICAL - they should be obtained DURING the person's career, not before their first job
- CRITICAL: Certification dates must be in the past, before or on ${formattedCurrentDate}
- CRITICAL: Certification dates should generally be recent (1-3 years ago) and NEVER in the future
- CRITICAL: The current date is ${formattedCurrentDate} - all dates must be relative to this date
- CRITICAL: Include the actual certification issuing organization (e.g., "Amazon Web Services" for AWS certs)

CERTIFICATION GUIDELINES:
- Generate 100% AI-created certifications based on the job description
- Certifications should be relevant to the job field and make logical sense
- Ensure certifications are appropriate for the industry and seniority level
- All certifications should be realistic and plausible for the role

CERTIFICATION GENERATION GUIDELINES:
- Analyze the job description to identify the industry and role
- Research real certifications that exist in that specific industry
- Generate certifications that would be valuable for the specific role
- Consider the seniority level when selecting appropriate certifications
- Include a mix of technical and soft skills certifications when appropriate
- For customer service roles, focus on customer service, communication, and support certifications
- For technical roles, focus on relevant technical certifications
- Ensure all certifications are realistic and would actually help the candidate

LOCATION FORMATTING REQUIREMENTS:
- When a country name is provided (e.g., "Georgia", "Turkey", "Canada"), ALWAYS use the full country name, never abbreviate it
- NEVER convert country names to state abbreviations (e.g., don't convert "Georgia" to "GA")
- For locations within the United States, you may use state abbreviations (e.g., "New York, NY")
- For international locations, use "City, Country" format (e.g., "Tbilisi, Georgia" or "Istanbul, Turkey")

COMPANY NAME REQUIREMENTS:
- CRITICAL: Use REAL companies that are based in the user's country of origin
- CRITICAL: If the user specifies a country (e.g., "Georgia"), use well-known companies from that country
- CRITICAL: Research and use actual companies from the user's country that match the industry and role
- CRITICAL: The company names MUST be appropriate for the job field and industry
- CRITICAL: Do NOT use global companies like Google or Microsoft unless they have a significant presence in the user's country
- CRITICAL: Do NOT invent fake company names - use only real, verifiable companies

EXAMPLES OF REAL COMPANIES BY COUNTRY:
- Georgia: TBC Bank, Bank of Georgia, Silknet, Geocell, Liberty Bank, Wissol Group, Redberry, Lemondo, Pulsar AI, Optio.AI, Evex Medical Corporation, Aversi Clinic, GPC, PSP
- Poland: PKO Bank Polski, Orlen, PZU, CD Projekt, Comarch, Asseco, mBank, Santander Bank Polska, Medicover, LUX MED, PZU Zdrowie, Żabka, CCC, LPP, Allegro
- United States: Local banks, healthcare providers, educational institutions, and businesses specific to the region
- United Kingdom: Local councils, NHS trusts, educational institutions, and regional businesses
- Canada: Provincial organizations, local healthcare networks, educational institutions, and regional businesses
- Australia: State organizations, local healthcare networks, educational institutions, and regional businesses
- Germany: Regional banks, local manufacturers, educational institutions, and businesses specific to the region
- France: Regional organizations, local businesses, educational institutions specific to the region
- India: Regional businesses, local IT companies, educational institutions specific to the region
- Japan: Regional organizations, local manufacturers, educational institutions specific to the region

CRITICAL: For any other country, research and use actual companies from that specific country that match the industry and role

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
      "startDate": "Month Year",
      "endDate": "Month Year",
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
      "startDate": "Month Year",
      "endDate": "Month Year",
      "current": boolean,
      "description": "..."
    }
  ],
  "projects": [
    {
      "title": "...",
      "description": "...",
      "technologies": "...",
      "startDate": "Month Year",
      "endDate": "Month Year"
    }
  ],
  "certifications": [
    {
      "name": "...",
      "issuer": "...",
      "date": "Month Year",
      "description": "..."
    }
  ],
  "selectedTemplate": "ats-friendly",
  "selectedFont": "Arial"
}`;

    const geminiResumeTokens = length === 'comprehensive'
      ? 12000
      : length === 'concise'
        ? 5000
        : 8000;

    const requestBody = buildAiRequestBody(fullPrompt, {
      temperature: 0.7,
      maxTokens: USE_GEMINI
        ? geminiResumeTokens
        : (length === 'comprehensive' ? 2000 : length === 'concise' ? 900 : 1600),
      responseMimeType: "application/json",
    });

    // Call our AI proxy function with a longer timeout for resume generation (3 minutes)
    // This is the most complex operation and needs more time
    const result = await callAiProxy(requestBody, 180000);

    // Extract the response text from the result
    const responseText = extractAiResponseText(result);

    // Parse the JSON response with robust error handling
    const resumeData = robustJSONParse(responseText, 'resume data');


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

    if (userProfile.personal && userProfile.personal.location) resumeData.personalInfo.location = userProfile.personal.location;
    if (userProfile.education && userProfile.education.length > 0) resumeData.education = userProfile.education;

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
    basePrompt += `\n\nFollow these ATS optimization principles:\n1) Start each bullet with a strong action verb\n2) Include exact keywords and phrases from the job description\n3) Quantify achievements with specific metrics when possible (%, $, numbers)\n4) Use industry-standard terminology\n5) Keep bullets concise (1-2 lines each)\n6) Include both technical skills and soft skills relevant to the position\n7) Use proper formatting that ATS systems can parse easily`;

    const userContent = `Create ${length === 'concise' ? '2-3' : length === 'comprehensive' ? '6-8' : '4-5'} impactful bullet points for the following work experience, tailored to this job description:\n\nJob Description:\n${jobDescription}\n\nPosition: ${title}\nCompany: ${company}\nCurrent Description: ${description}\n\n${length === 'comprehensive' ? 'Provide detailed and comprehensive bullet points with specific metrics, achievements, and technical details. Each bullet point can be 1-3 lines long.' : length === 'concise' ? 'Keep bullet points very concise and focused on the most important achievements. Each bullet should be 1 line only.' : 'Format each bullet point with action verbs and quantifiable achievements when possible.'}\n\nReturn only the bullet points as a string with each point on a new line, starting with a bullet character.`;

    const fullPrompt = `${basePrompt}\n\n${userContent}`;

    const requestBody = buildAiRequestBody(fullPrompt, {
      temperature: 0.7,
      maxTokens: USE_GEMINI
        ? (length === 'comprehensive' ? 2000 : 1000)
        : (length === 'comprehensive' ? 1200 : 700),
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
    basePrompt += `\n\nFollow these ATS optimization principles:\n1) Include exact keywords and phrases from the job description\n2) Highlight years of experience and key qualifications\n3) Mention specific technical skills and domain expertise\n4) Keep the summary concise (3-4 sentences)\n5) Use industry-standard terminology\n6) Position the candidate as a perfect fit for the role\n7) CALCULATE the total years of experience accurately from the work history\n8) Ensure the years of experience mentioned in the summary matches the actual work history`;

    const userContent = `Create a professional summary for a ${jobTitle} position, tailored to this job description:\n\nJob Description:\n${jobDescription}\n\nAbout the candidate:\nSkills include: ${skillsList}\nRecent position: ${workExperience[0]?.title || ''} at ${workExperience[0]?.company || ''}\nWork experience timeline: ${workExperience.map(job => `${job.title || job.jobTitle} at ${job.company} (${job.startDate} - ${job.current ? 'Present' : job.endDate})`).join(', ')}\n\nIMPORTANT: Calculate the EXACT total years of experience from the work history above. Make sure the years mentioned in the summary match the actual work experience timeline.\n\nThe summary should be 3-4 sentences, highlight key strengths, and be ATS-friendly.`;

    const fullPrompt = `${basePrompt}\n\n${userContent}`;

    const requestBody = buildAiRequestBody(fullPrompt, {
      temperature: 0.7,
      maxTokens: USE_GEMINI ? 500 : 350,
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
