import { supabase } from './supabase';
import { robustJSONParse } from '../utils/security';

const AI_PROXY_FALLBACK_ORDER = ['openrouter-proxy', 'groq-proxy'];
const AI_SERVICE_TEMPORARILY_UNAVAILABLE = 'AI application answers are temporarily unavailable. Please try again later.';

const trimText = (value = '', maxLength = 800) => {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return '';
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength)}...`;
};

const clampQuestionOptions = (options = []) => (
  Array.isArray(options)
    ? options.map((option) => trimText(option, 240)).filter(Boolean).slice(0, 50)
    : []
);

const clampQuestions = (questions = []) => (
  Array.isArray(questions)
    ? questions
      .filter((question) => question && question.id && question.label)
      .slice(0, 12)
      .map((question) => ({
        id: trimText(question.id, 160),
        label: trimText(question.label, 1000),
        kind: trimText(question.kind, 80),
        required: Boolean(question.required),
        placeholder: trimText(question.placeholder, 300),
        options: clampQuestionOptions(question.options),
        section: trimText(question.section, 600),
        name: trimText(question.name, 200),
        domId: trimText(question.domId, 200),
        currentValue: trimText(question.currentValue, 1000),
      }))
      .filter((question) => question.id && question.label)
    : []
);

const buildProfileContext = (profile = {}) => {
  const candidate = profile.candidate || {};
  const answers = profile.answers || {};
  const experience = Array.isArray(profile.experience) ? profile.experience.slice(0, 3) : [];
  const education = Array.isArray(profile.education) ? profile.education.slice(0, 2) : [];
  const skills = Array.isArray(profile.skills)
    ? profile.skills.filter(Boolean).map((skill) => trimText(skill, 160)).filter(Boolean).slice(0, 12)
    : [];

  return {
    candidate: {
      fullName: trimText(candidate.fullName, 240),
      email: trimText(candidate.email, 320),
      phone: trimText(candidate.phone, 120),
      location: trimText(candidate.location, 240),
      currentTitle: trimText(candidate.currentTitle, 240),
      currentCompany: trimText(candidate.currentCompany, 240),
      linkedin: trimText(candidate.linkedin, 500),
      github: trimText(candidate.github, 500),
      portfolio: trimText(candidate.portfolio || candidate.website, 500),
    },
    explicitAnswers: {
      workAuthorization: trimText(answers.workAuthorization, 600),
      requiresSponsorship: trimText(answers.requiresSponsorship, 600),
      yearsOfExperience: trimText(answers.yearsOfExperience, 120),
      currentCompany: trimText(answers.currentCompany || candidate.currentCompany, 240),
      currentTitle: trimText(answers.currentTitle || candidate.currentTitle, 240),
      noticePeriod: trimText(answers.noticePeriod, 240),
      salaryExpectation: trimText(answers.salaryExpectation, 240),
      preferredWorkSetup: trimText(answers.preferredWorkSetup || profile?.preferences?.remotePreference, 240),
      preferredLocations: Array.isArray(answers.preferredLocations)
        ? answers.preferredLocations.map((location) => trimText(location, 240)).filter(Boolean).slice(0, 20)
        : (Array.isArray(profile?.preferences?.locations)
          ? profile.preferences.locations.map((location) => trimText(location, 240)).filter(Boolean).slice(0, 20)
          : []),
      city: trimText(answers.city, 240),
      stateProvince: trimText(answers.stateProvince, 240),
      country: trimText(answers.country, 240),
      school: trimText(answers.school, 240),
      highestEducation: trimText(answers.highestEducation, 240),
      degreePursuing: trimText(answers.degreePursuing, 240),
      relevantCourses: trimText(answers.relevantCourses, 600),
      heardAbout: trimText(answers.heardAbout, 600),
      referredByEmployee: trimText(answers.referredByEmployee, 240),
      referralName: trimText(answers.referralName, 240),
      currentEmployee: trimText(answers.currentEmployee, 240),
      previousEmployee: trimText(answers.previousEmployee, 240),
      previousEmploymentDetails: trimText(answers.previousEmploymentDetails, 800),
      backgroundCheckConsent: trimText(answers.backgroundCheckConsent, 240),
      privacyConsent: trimText(answers.privacyConsent, 240),
      accommodationRequest: trimText(answers.accommodationRequest, 600),
      gender: trimText(answers.gender, 240),
      raceEthnicity: trimText(answers.raceEthnicity, 240),
      hispanicLatino: trimText(answers.hispanicLatino, 240),
      veteranStatus: trimText(answers.veteranStatus, 600),
      disabilityStatus: trimText(answers.disabilityStatus, 600),
      linkedinUrl: trimText(answers.linkedinUrl || candidate.linkedin, 500),
      githubUrl: trimText(answers.githubUrl || candidate.github, 500),
      portfolioUrl: trimText(answers.portfolioUrl || candidate.portfolio || candidate.website, 500),
      websiteUrl: trimText(answers.websiteUrl || candidate.website, 500),
    },
    skills,
    experience: experience.map((entry) => ({
      title: trimText(entry.title, 240),
      company: trimText(entry.company, 240),
      startDate: trimText(entry.startDate, 120),
      endDate: entry.current ? 'Present' : trimText(entry.endDate, 120),
      description: trimText(entry.description || '', 420),
    })),
    education: education.map((entry) => ({
      institution: trimText(entry.institution, 240),
      degree: trimText(entry.degree, 240),
      fieldOfStudy: trimText(entry.fieldOfStudy, 240),
    })),
  };
};

const buildJobContext = (job = {}) => ({
  title: trimText(job.title, 320),
  company: trimText(job.company, 320),
  location: trimText(job.location, 320),
  employmentType: trimText(job.employmentType, 160),
  salary: trimText(job.salary, 240),
  provider: trimText(job.providerLabel || job.provider, 240),
  description: trimText(job.description || job.jobDescription || '', 4000),
  url: trimText(job.url, 2000),
});

const buildPrompt = ({ profile, job, questions }) => {
  const profileContext = buildProfileContext(profile);
  const jobContext = buildJobContext(job);

  return `You write truthful, application-ready answers for job application forms.

Rules:
- Use the candidate profile as the source of truth.
- Tailor freeform answers to the job details when possible.
- Understand job descriptions, form labels, helper text, and answer choices in any language.
- Translate internally if needed, but return the final answer in the same language as the question unless the user must choose from provided options.
- If the form gives answer choices, choose one of the provided options exactly as written.
- If the question asks for information that is not in the candidate profile and cannot be safely inferred, return an empty string.
- Do not invent compensation, visa status, relocation preference, clearance level, demographic data, or legal answers that are not explicitly present.
- Keep short-answer responses concise.
- For "why this role/company" or "about you" style questions, answer in 2-5 professional sentences.
- Preserve accents, non-Latin scripts, and foreign-language option labels exactly when you reuse them.
- Return STRICT JSON only.

Candidate profile:
${JSON.stringify(profileContext, null, 2)}

Job context:
${JSON.stringify(jobContext, null, 2)}

Questions:
${JSON.stringify(questions, null, 2)}

Return exactly this shape:
{
  "answers": [
    {
      "id": "question-id",
      "answer": "string",
      "confidence": "high|medium|low"
    }
  ]
}`;
};

const buildAiRequestBody = (prompt) => {
  return {
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    maxTokens: 1600,
    expectJson: true,
  };
};

const extractAiResponseText = (result) => result?.choices?.[0]?.message?.content || '';

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

const invokeAiProxy = async (functionName, requestBody) => {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: requestBody,
  });

  if (error) {
    throw createRetryableAiError(error.message || 'Could not generate application answers', functionName);
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
};

const invokeConfiguredAiProxy = async (requestBody) => {
  let lastRetryableError = null;

  for (const functionName of AI_PROXY_FALLBACK_ORDER) {
    try {
      return await invokeAiProxy(functionName, requestBody);
    } catch (error) {
      if (error.aiAccessDenied || !error.aiProxyRetryable) {
        throw error;
      }

      lastRetryableError = error;
    }
  }

  if (lastRetryableError) {
    console.warn('All AI application answer providers failed.', lastRetryableError.message);
  }
  throw new Error(AI_SERVICE_TEMPORARILY_UNAVAILABLE);
};

export const generateApplicationAnswers = async ({ profile, job, questions }) => {
  const questionBatch = clampQuestions(questions);
  if (!questionBatch.length) {
    return { answers: [] };
  }

  const data = await invokeConfiguredAiProxy(
    buildAiRequestBody(buildPrompt({ profile, job, questions: questionBatch }))
  );
  const responseText = extractAiResponseText(data);
  const parsed = robustJSONParse(responseText, 'application answers');
  const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
  const requestedIds = new Set(questionBatch.map((question) => question.id));
  const seenIds = new Set();

  return {
    answers: answers
      .filter((entry) => entry && entry.id && requestedIds.has(`${entry.id}`))
      .map((entry) => ({
        id: `${entry.id}`,
        answer: typeof entry.answer === 'string' ? trimText(entry.answer, 2000) : '',
        confidence: ['high', 'medium', 'low'].includes(entry.confidence) ? entry.confidence : 'medium',
      }))
      .filter((entry) => {
        if (seenIds.has(entry.id)) return false;
        seenIds.add(entry.id);
        return true;
      })
      .slice(0, questionBatch.length),
  };
};
