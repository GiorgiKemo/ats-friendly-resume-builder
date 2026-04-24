import { supabase } from './supabase';
import { robustJSONParse } from '../utils/security';

const AI_PROVIDER = (import.meta.env.VITE_AI_PROVIDER || 'groq').toLowerCase();
const USE_GEMINI = AI_PROVIDER === 'gemini';
const GEMINI_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

const clampQuestions = (questions = []) => (
  Array.isArray(questions)
    ? questions.filter((question) => question && question.id && question.label).slice(0, 12)
    : []
);

const trimText = (value = '', maxLength = 800) => {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return '';
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength)}...`;
};

const buildProfileContext = (profile = {}) => {
  const candidate = profile.candidate || {};
  const answers = profile.answers || {};
  const experience = Array.isArray(profile.experience) ? profile.experience.slice(0, 3) : [];
  const education = Array.isArray(profile.education) ? profile.education.slice(0, 2) : [];
  const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean).slice(0, 12) : [];

  return {
    candidate: {
      fullName: candidate.fullName || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      location: candidate.location || '',
      currentTitle: candidate.currentTitle || '',
      currentCompany: candidate.currentCompany || '',
      linkedin: candidate.linkedin || '',
      github: candidate.github || '',
      portfolio: candidate.portfolio || candidate.website || '',
    },
    explicitAnswers: {
      workAuthorization: answers.workAuthorization || '',
      requiresSponsorship: answers.requiresSponsorship || '',
      yearsOfExperience: answers.yearsOfExperience || '',
      currentCompany: answers.currentCompany || candidate.currentCompany || '',
      currentTitle: answers.currentTitle || candidate.currentTitle || '',
      noticePeriod: answers.noticePeriod || '',
      salaryExpectation: answers.salaryExpectation || '',
      preferredWorkSetup: answers.preferredWorkSetup || profile?.preferences?.remotePreference || '',
      preferredLocations: Array.isArray(answers.preferredLocations)
        ? answers.preferredLocations
        : (Array.isArray(profile?.preferences?.locations) ? profile.preferences.locations : []),
      city: answers.city || '',
      stateProvince: answers.stateProvince || '',
      country: answers.country || '',
      school: answers.school || '',
      highestEducation: answers.highestEducation || '',
      degreePursuing: answers.degreePursuing || '',
      relevantCourses: answers.relevantCourses || '',
      heardAbout: answers.heardAbout || '',
      referredByEmployee: answers.referredByEmployee || '',
      referralName: answers.referralName || '',
      currentEmployee: answers.currentEmployee || '',
      previousEmployee: answers.previousEmployee || '',
      previousEmploymentDetails: answers.previousEmploymentDetails || '',
      backgroundCheckConsent: answers.backgroundCheckConsent || '',
      privacyConsent: answers.privacyConsent || '',
      accommodationRequest: answers.accommodationRequest || '',
      gender: answers.gender || '',
      raceEthnicity: answers.raceEthnicity || '',
      hispanicLatino: answers.hispanicLatino || '',
      veteranStatus: answers.veteranStatus || '',
      disabilityStatus: answers.disabilityStatus || '',
      linkedinUrl: answers.linkedinUrl || candidate.linkedin || '',
      githubUrl: answers.githubUrl || candidate.github || '',
      portfolioUrl: answers.portfolioUrl || candidate.portfolio || candidate.website || '',
      websiteUrl: answers.websiteUrl || candidate.website || '',
    },
    skills,
    experience: experience.map((entry) => ({
      title: entry.title || '',
      company: entry.company || '',
      startDate: entry.startDate || '',
      endDate: entry.current ? 'Present' : (entry.endDate || ''),
      description: trimText(entry.description || '', 420),
    })),
    education: education.map((entry) => ({
      institution: entry.institution || '',
      degree: entry.degree || '',
      fieldOfStudy: entry.fieldOfStudy || '',
    })),
  };
};

const buildJobContext = (job = {}) => ({
  title: job.title || '',
  company: job.company || '',
  location: job.location || '',
  employmentType: job.employmentType || '',
  salary: job.salary || '',
  provider: job.providerLabel || job.provider || '',
  description: trimText(job.description || job.jobDescription || '', 4000),
  url: job.url || '',
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
  if (USE_GEMINI) {
    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2200,
        topP: 0.8,
        topK: 40,
      },
      safetySettings: GEMINI_SAFETY_SETTINGS,
    };
  }

  return {
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    maxTokens: 1600,
  };
};

const extractAiResponseText = (result) => (
  USE_GEMINI
    ? result?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    : result?.choices?.[0]?.message?.content || ''
);

const invokeConfiguredAiProxy = async (requestBody) => {
  const functionName = USE_GEMINI ? 'gemini-proxy' : 'groq-proxy';
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: requestBody,
  });

  if (error) {
    throw new Error(error.message || 'Could not generate application answers');
  }

  if (data?.error) {
    const details = typeof data.details === 'string'
      ? data.details
      : JSON.stringify(data.details || data.error);
    throw new Error(details || data.error);
  }

  return data;
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

  return {
    answers: answers
      .filter((entry) => entry && entry.id)
      .map((entry) => ({
        id: `${entry.id}`,
        answer: typeof entry.answer === 'string' ? entry.answer.trim() : '',
        confidence: typeof entry.confidence === 'string' ? entry.confidence : 'medium',
      })),
  };
};
