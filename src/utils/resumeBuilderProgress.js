import { hasResumeSectionDraft } from './resumeDraftStorage';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const countMatchingItems = (items, matcher) => {
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item && matcher(item)).length;
};

const countSkills = (skills) => {
  if (!Array.isArray(skills)) return 0;

  return skills.filter((skill) => {
    if (typeof skill === 'string') return hasText(skill);
    if (skill && typeof skill === 'object') return hasText(skill.name);
    return false;
  }).length;
};

const buildSection = (config, status) => ({
  ...config,
  ...status,
  inProgress: Boolean(status.inProgress),
  complete: Boolean(status.complete),
  hasDraft: Boolean(status.hasDraft),
});

export const buildResumeBuilderSections = (resume = {}, { atsScore = null, isPremium = false } = {}) => {
  const personalInfo = resume.personalInfo || {};
  const fullNameReady = hasText(personalInfo.fullName);
  const emailReady = hasText(personalInfo.email);
  const targetTitleReady = hasText(personalInfo.jobTitle);
  const personalInfoCount = [fullNameReady, emailReady, targetTitleReady].filter(Boolean).length;

  const workExperienceCount = countMatchingItems(
    resume.workExperience,
    (item) => hasText(item.jobTitle) && hasText(item.company)
  );
  const educationCount = countMatchingItems(
    resume.education,
    (item) => hasText(item.institution) && hasText(item.degree)
  );
  const skillCount = countSkills(resume.skills);
  const certificationsCount = countMatchingItems(
    resume.certifications,
    (item) => hasText(item.name) || hasText(item.issuer)
  );
  const projectsCount = countMatchingItems(
    resume.projects,
    (item) => hasText(item.title) || hasText(item.description)
  );
  const additionalSectionsCount = countMatchingItems(
    resume.additionalSections,
    (item) => hasText(item.title) || hasText(item.content)
  );

  const workExperienceDraft = hasResumeSectionDraft(resume.id, 'workExperience');
  const educationDraft = hasResumeSectionDraft(resume.id, 'education');
  const certificationsDraft = hasResumeSectionDraft(resume.id, 'certifications');
  const projectsDraft = hasResumeSectionDraft(resume.id, 'projects');
  const additionalSectionsDraft = hasResumeSectionDraft(resume.id, 'additionalSections');

  return [
    buildSection(
      {
        id: 'personalInfo',
        label: 'Contact Information',
        icon: 'user',
        category: 'core',
        required: true,
        countsTowardProgress: true,
      },
      {
        complete: personalInfoCount === 3,
        inProgress: personalInfoCount > 0 && personalInfoCount < 3,
        detail:
          personalInfoCount === 3
            ? 'Name, email, and target title are ready.'
            : `${personalInfoCount}/3 essentials added`,
      }
    ),
    buildSection(
      {
        id: 'workExperience',
        label: 'Work History',
        icon: 'briefcase',
        category: 'core',
        required: true,
        countsTowardProgress: true,
      },
      {
        complete: workExperienceCount > 0,
        inProgress: workExperienceDraft,
        hasDraft: workExperienceDraft,
        detail:
          workExperienceCount > 0
            ? `${workExperienceCount} role${workExperienceCount === 1 ? '' : 's'} saved`
            : workExperienceDraft
              ? 'Draft waiting to be added'
              : 'Add at least one recent role',
      }
    ),
    buildSection(
      {
        id: 'education',
        label: 'Education',
        icon: 'academic-cap',
        category: 'core',
        required: true,
        countsTowardProgress: true,
      },
      {
        complete: educationCount > 0,
        inProgress: educationDraft,
        hasDraft: educationDraft,
        detail:
          educationCount > 0
            ? `${educationCount} education entr${educationCount === 1 ? 'y' : 'ies'} added`
            : educationDraft
              ? 'Draft waiting to be added'
              : 'Add your degree or training history',
      }
    ),
    buildSection(
      {
        id: 'skills',
        label: 'Skills & Expertise',
        icon: 'chip',
        category: 'core',
        required: true,
        countsTowardProgress: true,
      },
      {
        complete: skillCount >= 3,
        inProgress: skillCount > 0 && skillCount < 3,
        detail:
          skillCount >= 3
            ? `${skillCount} targeted skills added`
            : skillCount > 0
              ? `${skillCount}/3 suggested skills added`
              : 'Add at least three role-matching skills',
      }
    ),
    buildSection(
      {
        id: 'certifications',
        label: 'Certifications',
        icon: 'badge-check',
        category: 'optional',
        countsTowardProgress: false,
        optional: true,
      },
      {
        complete: certificationsCount > 0,
        inProgress: certificationsDraft,
        hasDraft: certificationsDraft,
        detail:
          certificationsCount > 0
            ? `${certificationsCount} certification${certificationsCount === 1 ? '' : 's'} listed`
            : certificationsDraft
              ? 'Draft waiting to be added'
              : 'Optional proof of expertise',
      }
    ),
    buildSection(
      {
        id: 'projects',
        label: 'Projects',
        icon: 'code',
        category: 'optional',
        countsTowardProgress: false,
        optional: true,
      },
      {
        complete: projectsCount > 0,
        inProgress: projectsDraft,
        hasDraft: projectsDraft,
        detail:
          projectsCount > 0
            ? `${projectsCount} project${projectsCount === 1 ? '' : 's'} included`
            : projectsDraft
              ? 'Draft waiting to be added'
              : 'Useful for portfolio-heavy roles',
      }
    ),
    buildSection(
      {
        id: 'additionalSections',
        label: 'Additional Info',
        icon: 'document-plus',
        category: 'optional',
        countsTowardProgress: false,
        optional: true,
      },
      {
        complete: additionalSectionsCount > 0,
        inProgress: additionalSectionsDraft,
        hasDraft: additionalSectionsDraft,
        detail:
          additionalSectionsCount > 0
            ? `${additionalSectionsCount} extra section${additionalSectionsCount === 1 ? '' : 's'} added`
            : additionalSectionsDraft
              ? 'Draft waiting to be added'
              : 'Optional extras like volunteering or publications',
      }
    ),
    buildSection(
      {
        id: 'template',
        label: 'Choose Template',
        icon: 'template',
        category: 'setup',
        countsTowardProgress: false,
      },
      {
        complete: hasText(resume.selectedTemplate),
        detail: hasText(resume.selectedTemplate)
          ? `${resume.selectedTemplate.replace(/-/g, ' ')} template selected`
          : 'Pick a layout before exporting',
      }
    ),
    buildSection(
      {
        id: 'aiGenerator',
        label: 'AI Content Generator',
        icon: 'sparkles',
        category: 'tool',
        countsTowardProgress: false,
      },
      {
        detail: isPremium
          ? 'Use AI to tailor sections to a job posting'
          : 'Premium tool for faster tailoring',
      }
    ),
    buildSection(
      {
        id: 'atsCheck',
        label: 'ATS Check & Score',
        icon: 'clipboard-check',
        category: 'tool',
        countsTowardProgress: false,
      },
      {
        complete: typeof atsScore === 'number',
        detail:
          typeof atsScore === 'number'
            ? `Latest ATS score: ${atsScore}/100`
            : 'Run a check before exporting',
      }
    ),
  ];
};

export const getResumeBuilderProgress = (sections = []) => {
  const coreSections = sections.filter((section) => section.category === 'core');
  const optionalSections = sections.filter((section) => section.category === 'optional');
  const completedCore = coreSections.filter((section) => section.complete).length;
  const startedCore = coreSections.filter((section) => section.complete || section.inProgress).length;
  const completedOptional = optionalSections.filter((section) => section.complete).length;
  const progress = coreSections.length > 0 ? (completedCore / coreSections.length) * 100 : 0;

  return {
    coreSections,
    optionalSections,
    completedCore,
    startedCore,
    completedOptional,
    progress,
  };
};

export const getNextRecommendedBuilderAction = (sections = [], { showPreview = false } = {}) => {
  const nextCoreSection = sections.find((section) => section.category === 'core' && !section.complete);

  if (nextCoreSection) {
    return {
      type: 'section',
      target: nextCoreSection.id,
      label: nextCoreSection.inProgress ? 'Continue section' : 'Start section',
      title: nextCoreSection.label,
      detail: nextCoreSection.detail,
    };
  }

  const templateSection = sections.find((section) => section.id === 'template' && !section.complete);
  if (templateSection) {
    return {
      type: 'section',
      target: templateSection.id,
      label: 'Choose template',
      title: templateSection.label,
      detail: templateSection.detail,
    };
  }

  if (!showPreview) {
    return {
      type: 'preview',
      label: 'Open preview',
      title: 'Preview your resume',
      detail: 'Check spacing, hierarchy, and wording before exporting.',
    };
  }

  const atsSection = sections.find((section) => section.id === 'atsCheck');
  return {
    type: 'section',
    target: atsSection?.id || 'atsCheck',
    label: 'Run ATS check',
    title: atsSection?.label || 'ATS Check & Score',
    detail: atsSection?.detail || 'Run a final scan before sending this out.',
  };
};
