const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const countSkills = (skills = []) => {
  if (!Array.isArray(skills)) return 0;

  return skills.filter((skill) => {
    if (typeof skill === 'string') return hasText(skill);
    if (skill && typeof skill === 'object') return hasText(skill.name);
    return false;
  }).length;
};

const countCompletedEntries = (entries = [], matcher) => {
  if (!Array.isArray(entries)) return 0;
  return entries.filter((entry) => entry && matcher(entry)).length;
};

export const getResumeExportReadiness = (resume = {}) => {
  const workExperienceCount = countCompletedEntries(
    resume.workExperience,
    (item) => hasText(item.jobTitle) && hasText(item.company)
  );
  const skillCount = countSkills(resume.skills);
  const selectedTemplate = resume.selectedTemplate || 'basic';

  const checks = [
    {
      id: 'contact',
      label: 'Contact details',
      complete: hasText(resume.personalInfo?.fullName) && hasText(resume.personalInfo?.email),
      detail: hasText(resume.personalInfo?.fullName) && hasText(resume.personalInfo?.email)
        ? 'Name and email are included.'
        : 'Add your full name and email before sending this out.',
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
      label: 'Work history',
      complete: workExperienceCount > 0,
      detail: workExperienceCount > 0
        ? `${workExperienceCount} role${workExperienceCount === 1 ? '' : 's'} included.`
        : 'Add at least one role before exporting.',
    },
    {
      id: 'skills',
      label: 'Skills coverage',
      complete: skillCount >= 3,
      detail: skillCount >= 3
        ? `${skillCount} matching skills included.`
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
    readyToExport: completedCount >= 4,
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
