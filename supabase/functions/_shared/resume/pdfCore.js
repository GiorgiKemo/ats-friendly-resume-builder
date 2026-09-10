import { jsPDF } from 'jspdf';
import { buildResumeTextLines } from './exportText.js';
import { assertCommittedResume } from './committedResume.js';

const PDF_MARGIN_PT = 48;
const PDF_PAGE_HEIGHT_PT = 792;
const PDF_PAGE_WIDTH_PT = 612;

const BASE_SECTION_LABELS = {
  SUMMARY: 'Professional Summary',
  EXPERIENCE: 'Work Experience',
  EDUCATION: 'Education',
  SKILLS: 'Skills',
  CERTIFICATIONS: 'Certifications',
  PROJECTS: 'Projects',
};

const TEXT_PDF_STYLES = {
  basic: {
    nameAlign: 'center',
    nameUppercase: false,
    headingUppercase: false,
    headingColor: [20, 20, 20],
    bodyColor: [45, 45, 45],
    dividerColor: [190, 190, 190],
    dividerWidth: 0.6,
    sectionLabels: BASE_SECTION_LABELS,
  },
  'ats-friendly': {
    nameAlign: 'center',
    nameUppercase: false,
    headingUppercase: false,
    headingColor: [20, 20, 20],
    bodyColor: [45, 45, 45],
    dividerColor: [170, 170, 170],
    dividerWidth: 0.55,
    sectionLabels: {
      ...BASE_SECTION_LABELS,
      EXPERIENCE: 'Professional Experience',
      SKILLS: 'Core Competencies',
      CERTIFICATIONS: 'Certifications & Licenses',
      PROJECTS: 'Additional Projects',
    },
  },
  minimalist: {
    nameAlign: 'left',
    nameUppercase: false,
    headingUppercase: true,
    headingColor: [20, 20, 20],
    bodyColor: [55, 55, 55],
    dividerColor: [0, 0, 0],
    dividerWidth: 0,
    sectionLabels: {
      ...BASE_SECTION_LABELS,
      SUMMARY: 'Summary',
      EXPERIENCE: 'Experience',
    },
  },
  traditional: {
    nameAlign: 'center',
    nameUppercase: true,
    headingUppercase: true,
    headingColor: [20, 20, 20],
    bodyColor: [45, 45, 45],
    dividerColor: [30, 30, 30],
    dividerWidth: 1.2,
    sectionLabels: BASE_SECTION_LABELS,
  },
  modern: {
    nameAlign: 'left',
    nameUppercase: false,
    headingUppercase: false,
    headingColor: [37, 99, 235],
    bodyColor: [45, 45, 45],
    dividerColor: [147, 197, 253],
    dividerWidth: 0.9,
    headerBackground: [239, 246, 255],
    sectionLabels: BASE_SECTION_LABELS,
  },
};

export const getTextPdfStyle = (template = 'basic') => (
  TEXT_PDF_STYLES[template] || TEXT_PDF_STYLES.basic
);

// The caller supplies font bytes so browser and Edge adapters use the same
// renderer without a runtime network fetch or caller-controlled file path.
export const buildTextPdfCore = async (resume, fontData) => {
  assertCommittedResume(resume);
  if (!fontData) throw new Error('PDF font data is required for this renderer.');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const maxWidth = PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT * 2;
  const lines = buildResumeTextLines(resume);
  const personal = { ...(resume.personal_info || {}), ...(resume.personalInfo || {}) };
  const style = getTextPdfStyle(resume.selectedTemplate);
  const firstBlankIndex = lines.findIndex((line) => line === '');
  const hasHeader = firstBlankIndex > 0;
  pdf.addFileToVFS('DejaVuSans.ttf', fontData);
  pdf.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  pdf.setFont('DejaVuSans', 'normal');
  const font = pdf.getFont().metadata;
  const unsupported = [...new Set(lines.join('').replace(/\s/g, ''))]
    .filter((character) => !font.characterToGlyph(character.codePointAt(0)));
  if (unsupported.length) {
    throw new Error(`PDF cannot render these characters: ${unsupported.slice(0, 8).join(' ')}. Download DOCX to preserve your full resume.`);
  }

  if (style.headerBackground && hasHeader) {
    pdf.setFillColor(...style.headerBackground);
    pdf.rect(0, 0, PDF_PAGE_WIDTH_PT, 104, 'F');
  }

  let y = 56;
  lines.forEach((line, index) => {
    const isDivider = line === '---';
    const isName = index === 0 && Boolean(personal.fullName || personal.full_name);
    const isSectionHeader = !isName && lines[index + 1] === '---';
    const isHeaderLine = hasHeader && index < firstBlankIndex;
    if (isSectionHeader && y + 58 > PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT) {
      pdf.addPage();
      y = 56;
    }
    if (isDivider) {
      if (style.dividerWidth > 0) {
        pdf.setDrawColor(...style.dividerColor);
        pdf.setLineWidth(style.dividerWidth);
        pdf.line(PDF_MARGIN_PT, y, PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT, y);
        y += 14;
      } else {
        y += 6;
      }
      return;
    }
    if (line.trim() === '') {
      y += 8;
      return;
    }
    const fontSize = isName ? 18 : isSectionHeader ? 12 : isHeaderLine ? 10 : 10;
    const lineHeight = isName ? 22 : isSectionHeader ? 16 : 14;
    const rawSectionLabel = isSectionHeader ? style.sectionLabels[line] || line : line;
    const displayLine = isName && style.nameUppercase
      ? rawSectionLabel.toUpperCase()
      : isSectionHeader && style.headingUppercase
        ? rawSectionLabel.toUpperCase()
        : rawSectionLabel;
    const textX = style.nameAlign === 'center' && (isName || isHeaderLine)
      ? PDF_PAGE_WIDTH_PT / 2
      : PDF_MARGIN_PT;
    const textAlign = style.nameAlign === 'center' && (isName || isHeaderLine) ? 'center' : 'left';
    pdf.setFont('DejaVuSans', 'normal');
    const color = isName || isSectionHeader ? style.headingColor : style.bodyColor;
    pdf.setTextColor(...color);
    pdf.setFontSize(fontSize);
    const renderedLines = pdf.splitTextToSize(displayLine, maxWidth);
    renderedLines.forEach((renderedLine) => {
      if (y > PDF_PAGE_HEIGHT_PT - PDF_MARGIN_PT) {
        pdf.addPage();
        y = 56;
      }
      pdf.text(renderedLine, textX, y, { align: textAlign });
      y += lineHeight;
    });
    if (isSectionHeader && style.dividerWidth > 0 && style.headerBackground === undefined) {
      pdf.setDrawColor(...style.dividerColor);
      pdf.setLineWidth(style.dividerWidth);
      pdf.line(PDF_MARGIN_PT, y + 2, PDF_PAGE_WIDTH_PT - PDF_MARGIN_PT, y + 2);
    }
  });

  return { pdf, blob: pdf.output('blob') };
};
