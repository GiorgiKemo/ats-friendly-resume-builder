import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from './supabase';

const RENDER_WIDTH_PX = 1024;
const SCALE = 2;
const PDF_TARGET_SIZE_BYTES = 6 * 1024 * 1024;
const JPEG_QUALITY_STEPS = [0.86, 0.74, 0.62, 0.5];
const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;

const buildCleanFilename = (filename = 'resume') => filename
  .replace(/[^a-zA-Z0-9]/g, '_')
  .replace(/_+/g, '_');

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

const buildPdfFromCanvas = (canvas, jpegQuality) => {
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

const createPdfArtifact = (canvas) => {
  let selectedArtifact = null;

  for (const quality of JPEG_QUALITY_STEPS) {
    const pdf = buildPdfFromCanvas(canvas, quality);
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

/**
 * Capture the rendered React template via html2canvas, compress it, and embed
 * it into a jsPDF document. This keeps visual parity with the on-screen preview
 * while dramatically reducing file size for job-site uploads.
 *
 * @param {HTMLElement} element
 * @param {object} resume
 * @param {string} filename
 */
export const downloadResumePdf = async (element, resume, filename = 'resume') => {
  try {
    if (!element) {
      throw new Error('No resume element provided for PDF export');
    }

    const canvas = await renderResumeCanvas(element);
    const { pdf, blob } = createPdfArtifact(canvas);
    const cleanName = buildCleanFilename(filename);

    pdf.save(`${cleanName}.pdf`);

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

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Upload a resume PDF to Supabase Storage without downloading it.
 * Call this from the auto-apply preferences to ensure the selected resume
 * has a PDF ready for attachment.
 */
export const uploadResumePdfToStorage = async (element, resume) => {
  try {
    if (!element || !resume?.id) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const canvas = await renderResumeCanvas(element);
    const { blob } = createPdfArtifact(canvas);
    const storagePath = `${user.id}/${resume.id}.pdf`;

    const { error } = await supabase.storage
      .from('resumes')
      .upload(storagePath, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error uploading resume PDF:', error);
    return false;
  }
};
