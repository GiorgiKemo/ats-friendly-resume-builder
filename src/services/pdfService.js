import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from './supabase';

const RENDER_WIDTH_PX = 1024;
const SCALE = 2;
const PDF_TARGET_SIZE_BYTES = 6 * 1024 * 1024;
const JPEG_QUALITY_STEPS = [0.86, 0.74, 0.62, 0.5];
const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;
const PDF_MARGIN_PT = 48;
const PDF_PAGE_HEIGHT_PT = 792;
const PDF_PAGE_WIDTH_PT = 612;

const buildCleanFilename = (filename = 'resume') => filename
  .replace(/[^a-zA-Z0-9]/g, '_')
  .replace(/_+/g, '_');

const normalizeList = (items) => (Array.isArray(items) ? items.filter(Boolean) : []);

const normalizeTextContent = (value) => {
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

const stripBulletPrefix = (value = '') => `${value}`.replace(/^(?:[-*]|\u2022|\u00e2\u20ac\u00a2)\s*/, '').trim();

const appendMultilineBullets = (lines, rawText = '', maxItems = 5) => {
  rawText
    .split(/\n+/)
    .map((entry) => stripBulletPrefix(entry))
    .filter(Boolean)
    .slice(0, maxItems)
    .forEach((entry) => {
      lines.push(`- ${entry}`);
    });
};

const buildResumeTextLines = (resume = {}) => {
  const personal = resume.personalInfo || resume.personal_info || {};
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
    personal.other || professionalLinks.other,
  ].filter(Boolean);

  const lines = [];

  if (name) {
    lines.push(name.toUpperCase());
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
      appendMultilineBullets(lines, normalizeTextContent(item.description || item.details || item.summary));
      lines.push('');
    });
  }

  if (additionalSections.length > 0) {
    additionalSections.forEach((section) => {
      const title = section.title || section.name || 'Additional Information';
      lines.push(title.toUpperCase());
      lines.push('---');
      appendMultilineBullets(lines, normalizeTextContent(section.content || section.description), 12);
      lines.push('');
    });
  }

  return lines.filter((line, index, array) => (
    line !== undefined
    && line !== null
    && !(line === '' && array[index - 1] === '' && array[index + 1] === '')
  ));
};

const hasStructuredResumeContent = (resume = {}) => {
  const personal = resume.personalInfo || resume.personal_info || {};
  return Boolean(
    personal.fullName
    || personal.full_name
    || personal.jobTitle
    || normalizeList(resume.workExperience || resume.work_experience).length
    || normalizeList(resume.education).length
    || normalizeList(resume.skills).length
    || normalizeList(resume.projects).length
    || normalizeList(resume.additionalSections || resume.additional_sections).length
  );
};

const buildTextPdf = (resume) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const maxWidth = PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT * 2;
  const lines = buildResumeTextLines(resume);
  let y = 56;

  lines.forEach((line, index) => {
    const isDivider = line === '---';
    const isName = index === 0;
    const isSectionHeader = !isName && line === line.toUpperCase() && line.length > 2 && line !== '---' && !line.includes('|');

    if (isDivider) {
      pdf.setDrawColor(190);
      pdf.line(PDF_MARGIN_PT, y, PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT, y);
      y += 14;
      return;
    }

    if (line.trim() === '') {
      y += 8;
      return;
    }

    const fontSize = isName ? 18 : isSectionHeader ? 12 : 10;
    const lineHeight = isName ? 22 : isSectionHeader ? 16 : 14;
    pdf.setFont('helvetica', isName || isSectionHeader ? 'bold' : 'normal');
    pdf.setFontSize(fontSize);

    const renderedLines = pdf.splitTextToSize(
      line.replace(/[^\x20-\x7E]/g, ''),
      maxWidth
    );

    renderedLines.forEach((renderedLine) => {
      if (y > PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT) {
        pdf.addPage();
        y = 56;
      }

      pdf.text(renderedLine, PDF_MARGIN_PT, y);
      y += lineHeight;
    });
  });

  return {
    pdf,
    blob: pdf.output('blob'),
  };
};

const createCloneForExport = (element) => {
  const clone = element.cloneNode(true);
  clone.style.width = `${RENDER_WIDTH_PX}px`;
  clone.style.minWidth = `${RENDER_WIDTH_PX}px`;
  clone.style.minHeight = 'auto';
  clone.style.maxHeight = 'none';
  clone.style.maxWidth = 'none';
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.background = 'white';
  clone.style.boxSizing = 'border-box';
  document.body.appendChild(clone);
  return clone;
};

const renderResumeCanvas = async (element) => {
  const clone = createCloneForExport(element);

  try {
    return await html2canvas(clone, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: RENDER_WIDTH_PX,
      windowWidth: RENDER_WIDTH_PX,
    });
  } finally {
    if (clone.parentNode) {
      clone.parentNode.removeChild(clone);
    }
  }
};

const sliceCanvasPage = (canvas, startY, height) => {
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = canvas.width;
  pageCanvas.height = height;

  const ctx = pageCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to create canvas context for PDF export');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  ctx.drawImage(
    canvas,
    0,
    startY,
    canvas.width,
    pageCanvas.height,
    0,
    0,
    pageCanvas.width,
    pageCanvas.height,
  );

  return pageCanvas;
};

const buildCanvasPdf = (canvas, jpegQuality) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const canvasHeightMM = (canvas.height * PDF_PAGE_WIDTH_MM) / canvas.width;

  if (canvasHeightMM <= PDF_PAGE_HEIGHT_MM) {
    const imageData = canvas.toDataURL('image/jpeg', jpegQuality);
    pdf.addImage(imageData, 'JPEG', 0, 0, PDF_PAGE_WIDTH_MM, canvasHeightMM, undefined, 'MEDIUM');
    return pdf;
  }

  const totalPages = Math.ceil(canvasHeightMM / PDF_PAGE_HEIGHT_MM);
  const sliceHeightPx = Math.floor(canvas.height / totalPages);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      pdf.addPage();
    }

    const remainingPx = canvas.height - page * sliceHeightPx;
    const pageCanvas = sliceCanvasPage(canvas, page * sliceHeightPx, Math.min(sliceHeightPx, remainingPx));
    const pageHeightMM = (pageCanvas.height * PDF_PAGE_WIDTH_MM) / pageCanvas.width;
    const pageImageData = pageCanvas.toDataURL('image/jpeg', jpegQuality);

    pdf.addImage(pageImageData, 'JPEG', 0, 0, PDF_PAGE_WIDTH_MM, pageHeightMM, undefined, 'MEDIUM');
  }

  return pdf;
};

const createCanvasPdfArtifact = (canvas) => {
  let selectedArtifact = null;

  for (const quality of JPEG_QUALITY_STEPS) {
    const pdf = buildCanvasPdf(canvas, quality);
    const blob = pdf.output('blob');

    selectedArtifact = { pdf, blob, quality };

    if (blob.size <= PDF_TARGET_SIZE_BYTES) {
      return selectedArtifact;
    }
  }

  if (selectedArtifact?.blob?.size > PDF_TARGET_SIZE_BYTES) {
    console.warn('Exported resume PDF is still above the preferred 6MB target after compression.', {
      sizeBytes: selectedArtifact.blob.size,
    });
  }

  return selectedArtifact;
};

const createPdfArtifact = async (element, resume) => {
  if (hasStructuredResumeContent(resume)) {
    return buildTextPdf(resume);
  }

  if (!element) {
    throw new Error('No resume element provided for PDF export');
  }

  const canvas = await renderResumeCanvas(element);
  return createCanvasPdfArtifact(canvas);
};

const uploadPdfBlobToStorage = async (resume, blob) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && resume?.id) {
      const storagePath = `${user.id}/${resume.id}.pdf`;
      await supabase.storage
        .from('resumes')
        .upload(storagePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });
    }
  } catch (uploadErr) {
    console.warn('Resume PDF upload to storage failed (non-fatal):', uploadErr);
  }
};

export const downloadResumePdf = async (element, resume, filename = 'resume') => {
  try {
    const { pdf, blob } = await createPdfArtifact(element, resume);
    const cleanName = buildCleanFilename(filename);

    pdf.save(`${cleanName}.pdf`);
    await uploadPdfBlobToStorage(resume, blob);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const uploadResumePdfToStorage = async (element, resume) => {
  try {
    if (!resume?.id) return false;
    const { blob } = await createPdfArtifact(element, resume);
    await uploadPdfBlobToStorage(resume, blob);
    return true;
  } catch (error) {
    console.error('Error uploading resume PDF:', error);
    return false;
  }
};
