const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export const hasUsableProfileData = (profile) => {
  if (!profile || typeof profile !== 'object') return false;
  const personal = profile.personal || profile.personalInfo || {};
  if ([personal.jobTitle, personal.summary, personal.professionalSummary].some(hasText)) return true;
  const fields = {
    education: ['institution', 'school', 'degree', 'fieldOfStudy'],
    workExperience: ['title', 'jobTitle', 'position', 'company', 'responsibilities', 'description'],
    skills: ['name', 'skill'],
    certifications: ['name', 'title', 'issuer'],
    projects: ['title', 'name', 'description'],
  };
  return Object.entries(fields).some(([section, keys]) =>
    Array.isArray(profile[section]) && profile[section].some((item) =>
      typeof item === 'string' ? hasText(item) : item && keys.some((key) => hasText(item[key]))
    )
  );
};

// Preserve complete structured source facts; never cut JSON mid-record. The
// bound leaves room for instructions, the job description and generated output.
export const serializeResumeSource = (profile) => {
  const serialized = JSON.stringify(profile);
  if (serialized.length > 30000) {
    throw new Error('Your profile is too large to tailor safely (30,000-character limit). Shorten long descriptions in your profile and try again; no source details were sent.');
  }
  return serialized;
};
