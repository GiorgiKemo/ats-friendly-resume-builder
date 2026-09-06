import { jsPDF } from 'jspdf';
import { buildResumeTextLines } from './exportText.js';
import { assertCommittedResume } from './committedResume.js';

const PDF_MARGIN_PT = 48;
const PDF_PAGE_HEIGHT_PT = 792;
const PDF_PAGE_WIDTH_PT = 612;

// The caller supplies font bytes so browser and Edge adapters use the same
// renderer without a runtime network fetch or caller-controlled file path.
export const buildTextPdfCore = async (resume, fontData) => {
  assertCommittedResume(resume);
  if (!fontData) throw new Error('PDF font data is required for this renderer.');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const maxWidth = PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT * 2;
  const lines = buildResumeTextLines(resume);
  const personal = { ...(resume.personal_info || {}), ...(resume.personalInfo || {}) };
  pdf.addFileToVFS('DejaVuSans.ttf', fontData);
  pdf.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  pdf.setFont('DejaVuSans', 'normal');
  const font = pdf.getFont().metadata;
  const unsupported = [...new Set(lines.join('').replace(/\s/g, ''))]
    .filter((character) => !font.characterToGlyph(character.codePointAt(0)));
  if (unsupported.length) {
    throw new Error(`PDF cannot render these characters: ${unsupported.slice(0, 8).join(' ')}. Download DOCX to preserve your full resume.`);
  }

  let y = 56;
  lines.forEach((line, index) => {
    const isDivider = line === '---';
    const isName = index === 0 && Boolean(personal.fullName || personal.full_name);
    const isSectionHeader = !isName && lines[index + 1] === '---';
    if (isSectionHeader && y + 58 > PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT) {
      pdf.addPage();
      y = 56;
    }
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
    pdf.setFont('DejaVuSans', 'normal');
    pdf.setTextColor(isName || isSectionHeader ? 20 : 45);
    pdf.setFontSize(fontSize);
    const renderedLines = pdf.splitTextToSize(line, maxWidth);
    renderedLines.forEach((renderedLine) => {
      if (y > PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT) {
        pdf.addPage();
        y = 56;
      }
      pdf.text(renderedLine, PDF_MARGIN_PT, y);
      y += lineHeight;
    });
  });

  return { pdf, blob: pdf.output('blob') };
};
