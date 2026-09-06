import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { normalizeList } from '../utils/resumeExportText.js';
import { buildTextPdf } from './resumePdfDocument.js';
import { assertCommittedResume } from '../utils/resumeTailoringReview.js';

const RENDER_WIDTH_PX = 1024;
const SCALE = 2;
const PDF_TARGET_SIZE_BYTES = 6 * 1024 * 1024;
const JPEG_QUALITY_STEPS = [0.86, 0.74, 0.62, 0.5];
// Keep the defensive canvas fallback on the same US Letter page geometry as
// the text-native renderer. Structured resumes use `buildTextPdf`; this path
// only handles legacy/partial payloads, but a different page size would still
// create an avoidable preview/export mismatch.
const PDF_PAGE_WIDTH_MM = 215.9;
const PDF_PAGE_HEIGHT_MM = 279.4;

const buildCleanFilename = (filename = 'resume') => (filename || 'resume')
  .replace(/[^\p{L}\p{N}._-]+/gu, '_')
  .replace(/^_+|_+$/g, '') || 'resume';

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const hasStructuredResumeContent = (resume = {}) => {
  const personal = { ...(resume.personal_info || {}), ...(resume.personalInfo || {}) };
  const links = personal.professionalLinks || {};
  const personalFields = [
    personal.fullName,
    personal.full_name,
    personal.jobTitle,
    personal.summary,
    personal.professionalSummary,
    personal.email,
    personal.phone,
    personal.location,
    personal.linkedin,
    personal.github,
    personal.portfolio,
    personal.website,
    personal.other,
    links.linkedin,
    links.github,
    links.portfolio,
    links.other,
    resume.description,
  ];

  return Boolean(
    personalFields.some(hasText)
    || normalizeList(resume.workExperience || resume.work_experience).length
    || normalizeList(resume.education).length
    || normalizeList(resume.skills).length
    || normalizeList(resume.certifications).length
    || normalizeList(resume.projects).length
    || normalizeList(resume.additionalSections || resume.additional_sections).length
  );
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
    format: 'letter',
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

export const downloadResumePdf = async (element, resume, filename = 'resume') => {
  assertCommittedResume(resume);
  try {
    const { pdf } = await createPdfArtifact(element, resume);
    const cleanName = buildCleanFilename(filename);

    pdf.save(`${cleanName}.pdf`);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
