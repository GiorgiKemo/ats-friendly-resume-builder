export const normalizeList = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);

export const normalizeTextContent = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return `${value}`;

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTextContent(entry)).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    const prioritizedValues = [
      value.text,
      value.content,
      value.value,
      value.description,
      value.summary,
      value.responsibilities,
      value.achievements,
      value.duties,
      value.details,
      value.notes,
    ];

    const normalized = prioritizedValues
      .map((entry) => normalizeTextContent(entry))
      .filter(Boolean)
      .join('\n');

    if (normalized) return normalized;

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
};

const stripBulletPrefix = (value = '') => `${value}`.replace(/^(?:[-*]\s+|(?:\u2022|\u00e2\u20ac\u00a2)\s*)/, '').trim();

const appendMultilineBullets = (lines, rawText = '') => {
  rawText
    .split(/\n+/)
    .map((entry) => stripBulletPrefix(entry))
    .filter(Boolean)
    .forEach((entry) => {
      lines.push(`- ${entry}`);
    });
};

export const buildResumeTextLines = (resume = {}) => {
  const personal = { ...(resume.personal_info || {}), ...(resume.personalInfo || {}) };
  const professionalLinks = personal.professionalLinks || {};
  const workExperience = normalizeList(resume.workExperience || resume.work_experience);
  const education = normalizeList(resume.education);
  const skills = normalizeList(resume.skills);
  const certifications = normalizeList(resume.certifications);
  const projects = normalizeList(resume.projects);
  const additionalSections = normalizeList(resume.additionalSections || resume.additional_sections);

  const name = personal.fullName || personal.full_name || '';
  const summary = personal.summary || personal.professionalSummary || resume.description || '';
  const contactBits = [
    personal.email,
    personal.phone,
    personal.location,
    personal.linkedin || professionalLinks.linkedin,
    personal.github || professionalLinks.github,
    personal.portfolio || personal.website || professionalLinks.portfolio,
    personal.other || personal.otherLink || professionalLinks.other,
  ].filter(Boolean);

  const lines = [];

  if (name) {
    lines.push(name);
  }

  if (personal.jobTitle) {
    lines.push(personal.jobTitle);
  }

  if (contactBits.length > 0) {
    lines.push(contactBits.join(' | '));
  }

  if (name || personal.jobTitle || contactBits.length > 0) {
    lines.push('');
  }

  if (summary) {
    lines.push('SUMMARY');
    lines.push('---');
    normalizeTextContent(summary)
      .split(/\n+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => lines.push(entry));
    lines.push('');
  }

  if (workExperience.length > 0) {
    lines.push('EXPERIENCE');
    lines.push('---');
    workExperience.forEach((item) => {
      const header = [
        item.jobTitle || item.title || item.position || '',
        item.company || item.employer || '',
      ].filter(Boolean).join(' at ');
      const dates = [
        item.startDate || '',
        item.current ? 'Present' : (item.endDate || ''),
      ].filter(Boolean).join(' - ');

      if (header) {
        lines.push(dates ? `${header} (${dates})` : header);
      }
      if (item.location) {
        lines.push(item.location);
      }
      appendMultilineBullets(lines, normalizeTextContent(item.description || item.summary || item.responsibilities));
      lines.push('');
    });
  }

  if (education.length > 0) {
    lines.push('EDUCATION');
    lines.push('---');
    education.forEach((item) => {
      const header = [
        item.degree || '',
        item.fieldOfStudy || item.field || '',
      ].filter(Boolean).join(', ');
      const institution = [item.institution || item.school || '', item.location || ''].filter(Boolean).join(' - ');
      const dates = [
        item.startDate || '',
        item.current ? 'Present' : (item.endDate || ''),
      ].filter(Boolean).join(' - ');

      if (header) lines.push(header);
      if (institution) lines.push(institution);
      if (dates) lines.push(dates);
      appendMultilineBullets(lines, normalizeTextContent(item.description || item.details));
      lines.push('');
    });
  }

  if (skills.length > 0) {
    const flatSkills = skills
      .map((item) => (typeof item === 'string' ? item : item.name || item.skill || item.title || ''))
      .filter(Boolean);

    if (flatSkills.length > 0) {
      lines.push('SKILLS');
      lines.push('---');
      lines.push(flatSkills.join(', '));
      lines.push('');
    }
  }

  if (certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    lines.push('---');
    certifications.forEach((item) => {
      const header = [
        item.name || '',
        item.issuer ? `(${item.issuer})` : '',
      ].filter(Boolean).join(' ');

      if (header) lines.push(header);
      if (item.date) lines.push(item.date);
      appendMultilineBullets(lines, normalizeTextContent(item.description));
      lines.push('');
    });
  }

  if (projects.length > 0) {
    lines.push('PROJECTS');
    lines.push('---');
    projects.forEach((item) => {
      const header = [
        item.title || item.name || '',
        item.url ? `- ${item.url}` : '',
      ].filter(Boolean).join(' ');

      if (header) lines.push(header);
      if (item.technologies) lines.push(normalizeTextContent(item.technologies));
      const dates = [item.startDate, item.current ? 'Present' : item.endDate].filter(Boolean).join(' - ');
      if (dates) lines.push(dates);
      appendMultilineBullets(lines, normalizeTextContent(item.description || item.details || item.summary));
      lines.push('');
    });
  }

  if (additionalSections.length > 0) {
    additionalSections.forEach((section) => {
      const title = section.title || section.name || 'Additional Information';
      lines.push(title.toUpperCase());
      lines.push('---');
      appendMultilineBullets(lines, normalizeTextContent(section.content || section.description));
      lines.push('');
    });
  }

  return lines.filter((line, index, array) => (
    line !== undefined
    && line !== null
    && !(line === '' && array[index - 1] === '' && array[index + 1] === '')
  ));
};
