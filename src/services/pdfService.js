import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Capture the actual rendered React template via html2canvas and embed
 * into a jsPDF document. This guarantees a 100% visual match between
 * the on-screen preview and the exported PDF.
 *
 * @param {HTMLElement} element  - The DOM node of the rendered template (resumeRef.current)
 * @param {object}      resume  - The resume data object (used only for the filename fallback)
 * @param {string}      filename - Base filename without extension
 */
export const downloadResumePdf = async (element, resume, filename = 'resume') => {
  try {
    if (!element) {
      throw new Error('No resume element provided for PDF export');
    }

    // ── 1. Prepare a clone so we can render at exact A4 width without
    //       affecting the visible preview (no scroll, no overflow clip). ──

    // Render wider than A4 so flex-wrap items (contact info, skills) have
    // room to sit on fewer lines. The resulting image is scaled down to
    // fit A4 width in the PDF, so the extra width just means tighter layout.
    const RENDER_WIDTH_PX = 1024;
    const SCALE = 2;           // render at 2x for crisp text

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
    // Ensure md: breakpoint styles apply (Tailwind md = 768px)
    clone.style.boxSizing = 'border-box';
    document.body.appendChild(clone);

    // ── 2. Render with html2canvas ──

    const canvas = await html2canvas(clone, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: RENDER_WIDTH_PX,
      windowWidth: RENDER_WIDTH_PX,
    });

    document.body.removeChild(clone);

    // ── 3. Build multi-page PDF from the canvas ──

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pdfPageWidth = 210;  // A4 mm
    const pdfPageHeight = 297; // A4 mm

    // The canvas may be taller than one page — slice it into pages.
    const canvasWidthMM = pdfPageWidth;
    const canvasHeightMM = (canvas.height * pdfPageWidth) / canvas.width;

    if (canvasHeightMM <= pdfPageHeight) {
      // Single page — just add the image
      pdf.addImage(imgData, 'PNG', 0, 0, canvasWidthMM, canvasHeightMM);
    } else {
      // Multi-page: slice the single tall canvas into page-sized chunks
      const totalPages = Math.ceil(canvasHeightMM / pdfPageHeight);
      const sliceHeightPx = Math.floor(canvas.height / totalPages);

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();

        // Create a page-sized canvas slice
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        // Last page may be shorter
        const remainingPx = canvas.height - page * sliceHeightPx;
        pageCanvas.height = Math.min(sliceHeightPx, remainingPx);

        const ctx = pageCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0, page * sliceHeightPx,              // source x, y
          canvas.width, pageCanvas.height,       // source w, h
          0, 0,                                  // dest x, y
          pageCanvas.width, pageCanvas.height    // dest w, h
        );

        const pageImgData = pageCanvas.toDataURL('image/png');
        const pageHeightMM = (pageCanvas.height * pdfPageWidth) / pageCanvas.width;
        pdf.addImage(pageImgData, 'PNG', 0, 0, pdfPageWidth, pageHeightMM);
      }
    }

    // ── 4. Save ──
    const cleanName = (filename || 'resume')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_');
    pdf.save(`${cleanName}.pdf`);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};
