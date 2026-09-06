const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const hasValidEmail = (value) => hasText(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const countSkills = (skills = []) => {
  if (!Array.isArray(skills)) return 0;

  return new Set(skills.map((skill) => typeof skill === 'string' ? skill : skill?.name)
    .filter(hasText)
    .map((skill) => skill.trim().toLowerCase())).size;
};

const countCompletedEntries = (entries = [], matcher) => {
  if (!Array.isArray(entries)) return 0;
  return entries.filter((entry) => entry && matcher(entry)).length;
};

export const getResumeExportReadiness = (resume = {}) => {
  const workExperienceCount = countCompletedEntries(
    resume.workExperience,
    (item) => hasText(item.jobTitle || item.title || item.position) && hasText(item.company)
  );
  const educationCount = countCompletedEntries(resume.education, (item) => hasText(item.institution) && hasText(item.degree));
  const projectCount = countCompletedEntries(resume.projects, (item) => hasText(item.title || item.name) && hasText(item.description));
  const hasCareerEvidence = workExperienceCount > 0 || educationCount > 0 || projectCount > 0;
  const contactComplete = hasText(resume.personalInfo?.fullName) && hasValidEmail(resume.personalInfo?.email);
  const skillCount = countSkills(resume.skills);
  const selectedTemplate = resume.selectedTemplate || 'basic';

  const checks = [
    {
      id: 'contact',
      label: 'Contact details',
      complete: contactComplete,
      detail: contactComplete
        ? 'Name and email are included.'
        : 'Add your full name and a valid email before sending this out.',
    },
    {
      id: 'target-role',
      label: 'Target role',
      complete: hasText(resume.personalInfo?.jobTitle) || hasText(resume.title),
      detail: hasText(resume.personalInfo?.jobTitle) || hasText(resume.title)
        ? 'The resume is positioned for a clear role.'
        : 'Add a target job title so recruiters know what this version is for.',
    },
    {
      id: 'experience',
      label: 'Experience or qualifications',
      complete: hasCareerEvidence,
      detail: workExperienceCount > 0
        ? `${workExperienceCount} role${workExperienceCount === 1 ? '' : 's'} included.`
        : hasCareerEvidence
          ? 'Education or project experience is included.'
          : 'Add work, education, or a project to support your qualifications.',
    },
    {
      id: 'skills',
      label: 'Skills coverage',
      complete: skillCount >= 3,
      detail: skillCount >= 3
        ? `${skillCount} skills included. Review their relevance to the role.`
        : 'Aim for at least three role-relevant skills.',
    },
    {
      id: 'template',
      label: 'Template selected',
      complete: hasText(selectedTemplate),
      detail: hasText(selectedTemplate)
        ? `${selectedTemplate.replace(/-/g, ' ')} layout is active.`
        : 'Choose a template before downloading.',
    },
  ];

  const completedCount = checks.filter((check) => check.complete).length;

  return {
    checks,
    completedCount,
    totalCount: checks.length,
    readyToExport: contactComplete && hasCareerEvidence && completedCount >= 4,
  };
};

export const exportFormatOptions = [
  {
    id: 'docx',
    label: 'DOCX',
    badge: 'Best for ATS',
    description: 'Editable Word format with the safest text-native parsing for employer systems.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    badge: 'Best for layout',
    description: 'Best when you want a fixed visual presentation and the employer accepts PDF.',
  },
];
