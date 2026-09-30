// Resume design system shared by every renderer: the on-screen preview, the
// text-native PDF (browser and Edge), and the DOCX export. Keeping the model
// and tokens in one runtime-neutral module means what a candidate previews is
// what an employer receives.
//
// Every template is ATS-friendly by construction: one reading column, real
// text (no images, tables or icons carrying content), standard section
// headings, contact details in the document body, and dates as plain text.
//
// Template ids are stable storage keys ("basic", "modern", ...) because they
// are persisted on saved resumes and used by the Edge attachment renderer; the
// visible names and designs are defined here.
//
// Letter spacing ("tracking", in points) must stay at or below 12% of the
// font size: wider spacing makes PDF text extraction split words into single
// letters ("S U M M A R Y"), which parsers cannot match to a section heading.
export const MAX_TRACKING_RATIO = 0.12;

import { normalizeList, normalizeTextContent } from './exportText.js';

export const RESUME_TEMPLATE_IDS = ['ats-friendly', 'modern', 'basic', 'traditional', 'minimalist'];
// Matches the app-wide fallback for resumes saved without a template.
export const DEFAULT_RESUME_TEMPLATE = 'basic';

const BASE_LABELS = {
  summary: 'Professional Summary',
  experience: 'Work Experience',
  education: 'Education',
  skills: 'Skills',
  certifications: 'Certifications',
  projects: 'Projects',
};

const STANDARD_ORDER = ['summary', 'experience', 'education', 'skills', 'certifications', 'projects', 'additional'];

// Colors are hex strings; the PDF adapter converts them to RGB.
export const RESUME_TEMPLATES = {
  'ats-friendly': {
    id: 'ats-friendly',
    name: 'Clarity',
    tagline: 'Crisp and direct. Skills up front, clean rules, maximum readability.',
    accent: '#1d4ed8',
    text: '#0f172a',
    muted: '#475569',
    rule: '#cbd5e1',
    header: { align: 'left', nameSize: 24, nameCase: 'none', nameTracking: 0, titleColor: 'accent', contactSeparator: '  •  ', band: null, topBar: null, rule: null },
    heading: { size: 10.5, case: 'upper', tracking: 1.1, color: 'text', rule: 'full', align: 'left' },
    entry: { subtitleColor: 'accent' },
    skills: { separator: '  •  ' },
    order: ['summary', 'skills', 'experience', 'education', 'certifications', 'projects', 'additional'],
    labels: {
      ...BASE_LABELS,
      experience: 'Professional Experience',
      skills: 'Core Competencies',
      certifications: 'Certifications & Licenses',
      projects: 'Additional Projects',
    },
    docxFont: 'Calibri',
  },
  modern: {
    id: 'modern',
    name: 'Horizon',
    tagline: 'Contemporary with a teal accent bar and confident headings.',
    accent: '#0f766e',
    text: '#0f172a',
    muted: '#475569',
    rule: '#99f6e4',
    header: { align: 'left', nameSize: 26, nameCase: 'none', nameTracking: -0.2, titleColor: 'accent', contactSeparator: '   |   ', band: null, topBar: 7, rule: null },
    heading: { size: 12, case: 'none', tracking: 0, color: 'accent', rule: 'short', align: 'left' },
    entry: { subtitleColor: 'accent' },
    skills: { separator: '  •  ' },
    order: STANDARD_ORDER,
    labels: BASE_LABELS,
    docxFont: 'Arial',
  },
  basic: {
    id: 'basic',
    name: 'Executive',
    tagline: 'Polished leadership look with a tinted header and navy accents.',
    accent: '#1e3a5f',
    text: '#111827',
    muted: '#4b5563',
    rule: '#d1d9e4',
    header: { align: 'left', nameSize: 25, nameCase: 'none', nameTracking: 0, titleColor: 'muted', contactSeparator: '   ·   ', band: '#eef2f7', topBar: null, rule: null },
    heading: { size: 10.5, case: 'upper', tracking: 1.2, color: 'accent', rule: 'bar', align: 'left' },
    entry: { subtitleColor: 'accent' },
    skills: { separator: '  ·  ' },
    order: STANDARD_ORDER,
    labels: BASE_LABELS,
    docxFont: 'Calibri',
  },
  traditional: {
    id: 'traditional',
    name: 'Heritage',
    tagline: 'Timeless and formal. Centered header, classic rules, all business.',
    accent: '#1f2937',
    text: '#111827',
    muted: '#4b5563',
    rule: '#1f2937',
    header: { align: 'center', nameSize: 22, nameCase: 'upper', nameTracking: 2.6, titleColor: 'muted', contactSeparator: '   |   ', band: null, topBar: null, rule: 'double' },
    heading: { size: 10.5, case: 'upper', tracking: 1.2, color: 'text', rule: 'full', align: 'center' },
    entry: { subtitleColor: 'muted' },
    skills: { separator: '  |  ' },
    order: STANDARD_ORDER,
    labels: BASE_LABELS,
    docxFont: 'Georgia',
  },
  minimalist: {
    id: 'minimalist',
    name: 'Studio',
    tagline: 'Airy and understated. Quiet labels, generous whitespace.',
    accent: '#334155',
    text: '#0f172a',
    muted: '#64748b',
    rule: '#e2e8f0',
    header: { align: 'left', nameSize: 28, nameCase: 'none', nameTracking: -0.4, nameWeight: 'normal', titleColor: 'muted', contactSeparator: '     ', band: null, topBar: null, rule: null },
    heading: { size: 9, case: 'upper', tracking: 1.05, color: 'muted', rule: 'none', align: 'left' },
    entry: { subtitleColor: 'muted' },
    skills: { separator: '   ·   ' },
    order: STANDARD_ORDER,
    labels: { ...BASE_LABELS, summary: 'Summary', experience: 'Experience' },
    docxFont: 'Arial',
  },
};

export const getResumeTemplate = (id) => RESUME_TEMPLATES[id] || RESUME_TEMPLATES[DEFAULT_RESUME_TEMPLATE];

export const resolveTemplateColor = (template, key) => (
  key === 'accent' || key === 'text' || key === 'muted' ? template[key] : key
);

// ───────────── Content model ─────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2022-03" → "Mar 2022"; "2022-03-15" → "Mar 2022"; anything else is kept verbatim.
export const formatResumeModelDate = (value) => {
  const text = `${value ?? ''}`.trim();
  const match = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(text);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${match[1]}`;
  }
  return text;
};

const dateRange = (start, end, current) => {
  const from = formatResumeModelDate(start);
  const to = current ? 'Present' : formatResumeModelDate(end);
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
};

// A bullet marker is "- " / "* " / "•" (including a known mojibake bullet).
// "-20%" or "-0.5" are signed values, not bullets, and keep their sign.
const BULLET_PREFIX = /^(?:[-*]\s+|(?:•|â€¢)\s*)/;

const toLines = (value) => normalizeTextContent(value)
  .split(/\n+/)
  .map((line) => line.trim())
  .filter(Boolean);

const toBullets = (value) => toLines(value)
  .map((line) => line.replace(BULLET_PREFIX, '').trim())
  .filter(Boolean);

const cleanUrl = (value) => `${value ?? ''}`.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

const joinText = (value) => (Array.isArray(value) ? value.filter(Boolean).join(', ') : normalizeTextContent(value));

export const buildResumeModel = (resume = {}) => {
  const template = getResumeTemplate(resume.selectedTemplate || resume.selected_template);
  const personal = { ...(resume.personal_info || {}), ...(resume.personalInfo || {}) };
  const links = personal.professionalLinks || {};

  const header = {
    name: `${personal.fullName || personal.full_name || ''}`.trim(),
    title: `${personal.jobTitle || ''}`.trim(),
    contacts: [
      personal.email,
      personal.phone,
      personal.location,
      cleanUrl(personal.linkedin || links.linkedin),
      cleanUrl(personal.github || links.github),
      cleanUrl(personal.portfolio || personal.website || links.portfolio),
      cleanUrl(personal.other || personal.otherLink || links.other),
    ].map((item) => `${item ?? ''}`.trim()).filter(Boolean),
  };

  const sections = {};
  const summary = personal.summary || personal.professionalSummary || resume.description || '';
  const summaryLines = toLines(summary);
  if (summaryLines.length) sections.summary = { kind: 'paragraphs', paragraphs: summaryLines };

  const skills = normalizeList(resume.skills)
    .map((item) => (typeof item === 'string' ? item : item?.name || item?.skill || item?.title || ''))
    .map((item) => `${item}`.trim())
    .filter(Boolean);
  if (skills.length) sections.skills = { kind: 'inline', items: skills };

  const experience = normalizeList(resume.workExperience || resume.work_experience).map((item) => ({
    title: `${item.jobTitle || item.title || item.position || item.role || ''}`.trim(),
    subtitle: `${item.company || item.employer || ''}`.trim(),
    meta: `${item.location || ''}`.trim(),
    dates: dateRange(item.startDate, item.endDate, item.current),
    bullets: toBullets(item.description || item.summary || item.responsibilities),
  })).filter((entry) => entry.title || entry.subtitle || entry.bullets.length);
  if (experience.length) sections.experience = { kind: 'entries', entries: experience };

  const education = normalizeList(resume.education).map((item) => ({
    title: [item.degree, item.fieldOfStudy || item.field].map((part) => `${part ?? ''}`.trim()).filter(Boolean).join(', '),
    subtitle: `${item.institution || item.school || ''}`.trim(),
    meta: `${item.location || ''}`.trim(),
    dates: dateRange(item.startDate, item.endDate, item.current),
    bullets: toBullets(item.description || item.details),
  })).filter((entry) => entry.title || entry.subtitle || entry.bullets.length);
  if (education.length) sections.education = { kind: 'entries', entries: education };

  const certifications = normalizeList(resume.certifications).map((item) => ({
    title: `${item.name || ''}`.trim(),
    subtitle: `${item.issuer || ''}`.trim(),
    meta: '',
    dates: formatResumeModelDate(item.date),
    bullets: toBullets(item.description),
  })).filter((entry) => entry.title || entry.subtitle || entry.bullets.length);
  if (certifications.length) sections.certifications = { kind: 'entries', entries: certifications };

  const projects = normalizeList(resume.projects).map((item) => ({
    title: `${item.title || item.name || ''}`.trim(),
    subtitle: joinText(item.technologies).replace(/\n+/g, ', ').trim(),
    meta: cleanUrl(item.url),
    dates: dateRange(item.startDate, item.endDate, item.current),
    bullets: toBullets(item.description || item.details || item.summary),
  })).filter((entry) => entry.title || entry.subtitle || entry.bullets.length);
  if (projects.length) sections.projects = { kind: 'entries', entries: projects };

  const additional = normalizeList(resume.additionalSections || resume.additional_sections)
    .map((section) => {
      const lines = toLines(section.content || section.description);
      const bulleted = lines.some((line) => BULLET_PREFIX.test(line));
      return {
        key: 'additional',
        label: `${section.title || section.name || 'Additional Information'}`.trim(),
        kind: bulleted ? 'bullets' : 'paragraphs',
        bullets: bulleted ? toBullets(section.content || section.description) : [],
        paragraphs: bulleted ? [] : lines,
      };
    })
    .filter((section) => section.bullets.length || section.paragraphs.length);

  const ordered = [];
  template.order.forEach((key) => {
    if (key === 'additional') ordered.push(...additional);
    else if (sections[key]) ordered.push({ key, label: template.labels[key], ...sections[key] });
  });

  return { template, header, sections: ordered };
};

// Every string the renderers will draw, for glyph-coverage checks.
export const collectResumeModelText = (model) => {
  const parts = [model.header.name, model.header.title, ...model.header.contacts];
  model.sections.forEach((section) => {
    parts.push(section.label, ...(section.paragraphs || []), ...(section.items || []), ...(section.bullets || []));
    (section.entries || []).forEach((entry) => parts.push(entry.title, entry.subtitle, entry.meta, entry.dates, ...entry.bullets));
  });
  return parts.filter(Boolean);
};
