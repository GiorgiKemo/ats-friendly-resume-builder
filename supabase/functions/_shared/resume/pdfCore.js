import { jsPDF } from 'jspdf';
import { assertCommittedResume } from './committedResume.js';
import { MAX_TRACKING_RATIO, buildResumeModel, collectResumeModelText, getResumeTemplate, resolveTemplateColor } from './templates.js';

const PAGE_WIDTH_PT = 612;
const PAGE_HEIGHT_PT = 792;
const MARGIN_X_PT = 50;
const MARGIN_TOP_PT = 46;
const MARGIN_BOTTOM_PT = 48;
const BODY_SIZE = 9.8;
const BODY_LEADING = 13.4;

const hexToRgb = (hex) => {
  const value = `${hex}`.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};

// Compatibility view of a template's PDF styling (used by callers and tests
// that only need the headline tokens rather than the full design system).
export const getTextPdfStyle = (templateId = 'basic') => {
  const template = getResumeTemplate(templateId);
  return {
    name: template.name,
    nameAlign: template.header.align,
    nameUppercase: template.header.nameCase === 'upper',
    headingUppercase: template.heading.case === 'upper',
    headingColor: hexToRgb(resolveTemplateColor(template, template.heading.color)),
    accentColor: hexToRgb(template.accent),
    bodyColor: hexToRgb(template.text),
    sectionLabels: Object.fromEntries(Object.entries(template.labels).map(([key, label]) => [key.toUpperCase(), label])),
  };
};

// Font data is either the DejaVu Sans base64 string, or
// { fallback: DejaVu Sans, regular: Inter Regular, bold: Inter Bold }.
const normalizeFontData = (fontData) => (typeof fontData === 'string' ? { fallback: fontData } : (fontData || {}));

const missingGlyphs = (fontBase64, characters) => {
  const probe = new jsPDF({ unit: 'pt', format: 'letter' });
  probe.addFileToVFS('probe.ttf', fontBase64);
  probe.addFont('probe.ttf', 'Probe', 'normal');
  probe.setFont('Probe', 'normal');
  const metadata = probe.getFont().metadata;
  return characters.filter((character) => !metadata.characterToGlyph(character.codePointAt(0)));
};

// The caller supplies font bytes so browser and Edge adapters use the same
// renderer without a runtime network fetch or caller-controlled file path.
// Inter (true regular and bold weights) is used whenever it covers every
// character; otherwise the whole document uses DejaVu Sans, which covers far
// more scripts (for example Georgian), with a hairline stroke for emphasis.
export const buildTextPdfCore = async (resume, fontData) => {
  assertCommittedResume(resume);
  const fonts = normalizeFontData(fontData);
  if (!fonts.fallback) throw new Error('PDF font data is required for this renderer.');

  const model = buildResumeModel(resume);
  const { template, header } = model;
  const characters = [...new Set(collectResumeModelText(model).join('').replace(/\s/g, ''))];
  const useInter = Boolean(fonts.regular && fonts.bold) && missingGlyphs(fonts.regular, characters).length === 0;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const family = useInter ? 'Inter' : 'DejaVuSans';
  if (useInter) {
    pdf.addFileToVFS('Inter-Regular.ttf', fonts.regular);
    pdf.addFont('Inter-Regular.ttf', 'Inter', 'normal');
    pdf.addFileToVFS('Inter-Bold.ttf', fonts.bold);
    pdf.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  } else {
    pdf.addFileToVFS('DejaVuSans.ttf', fonts.fallback);
    pdf.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
  }
  pdf.setFont(family, 'normal');

  if (!useInter) {
    const font = pdf.getFont().metadata;
    const unsupported = characters.filter((character) => !font.characterToGlyph(character.codePointAt(0)));
    if (unsupported.length) {
      throw new Error(`PDF cannot render these characters: ${unsupported.slice(0, 8).join(' ')}. Download DOCX to preserve your full resume.`);
    }
  }
  const setWeight = (bold) => pdf.setFont(family, useInter && bold ? 'bold' : 'normal');

  const color = (key) => hexToRgb(resolveTemplateColor(template, key));
  const contentWidth = PAGE_WIDTH_PT - MARGIN_X_PT * 2;
  const rightEdge = PAGE_WIDTH_PT - MARGIN_X_PT;
  let y = MARGIN_TOP_PT;

  const newPage = () => {
    pdf.addPage();
    y = MARGIN_TOP_PT;
  };
  const ensureSpace = (height) => {
    if (y + height > PAGE_HEIGHT_PT - MARGIN_BOTTOM_PT) newPage();
  };

  // Width including character spacing, which jsPDF's getTextWidth ignores.
  const safeTracking = (size, tracking) => Math.min(tracking, size * MAX_TRACKING_RATIO);
  const measure = (text, size, requestedTracking = 0, bold = false) => {
    const tracking = safeTracking(size, requestedTracking);
    setWeight(bold);
    pdf.setFontSize(size);
    const width = pdf.getTextWidth(text) + Math.max(0, text.length - 1) * tracking;
    setWeight(false);
    return width;
  };

  // Inter has a real bold face. The DejaVu fallback has one weight, so its
  // emphasis uses a hairline stroke of the same color; either way the text
  // remains ordinary selectable text.
  const draw = (text, x, baseline, { size = BODY_SIZE, rgb = color('text'), bold = false, tracking: requestedTracking = 0, align = 'left' } = {}) => {
    if (!text) return;
    const tracking = safeTracking(size, requestedTracking);
    const width = measure(text, size, tracking, bold);
    const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    setWeight(bold);
    pdf.setFontSize(size);
    pdf.setTextColor(...rgb);
    pdf.setCharSpace(tracking);
    if (bold && !useInter) {
      pdf.setDrawColor(...rgb);
      pdf.setLineWidth(Math.max(0.2, size * 0.036));
      pdf.text(text, left, baseline, { renderingMode: 'fillThenStroke' });
    } else {
      pdf.text(text, left, baseline);
    }
    pdf.setCharSpace(0);
    setWeight(false);
  };

  const wrap = (text, size, width, bold = false) => {
    setWeight(bold);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width);
    setWeight(false);
    return lines;
  };

  const rule = (x1, x2, atY, rgb, width) => {
    pdf.setDrawColor(...rgb);
    pdf.setLineWidth(width);
    pdf.line(x1, atY, x2, atY);
  };

  // ───────────── Header ─────────────
  const headerStyle = template.header;
  const centered = headerStyle.align === 'center';
  const anchorX = centered ? PAGE_WIDTH_PT / 2 : MARGIN_X_PT;
  const nameText = headerStyle.nameCase === 'upper' ? header.name.toUpperCase() : header.name;
  const nameLines = nameText ? wrap(nameText, headerStyle.nameSize, contentWidth, headerStyle.nameWeight !== 'normal') : [];
  const titleLines = header.title ? wrap(header.title, 11.5, contentWidth) : [];
  const contactLines = header.contacts.length ? wrap(header.contacts.join(headerStyle.contactSeparator), 9.2, contentWidth) : [];
  const nameLeading = headerStyle.nameSize * 1.18;
  const hasHeader = nameLines.length || titleLines.length || contactLines.length;

  if (headerStyle.topBar) {
    pdf.setFillColor(...hexToRgb(template.accent));
    pdf.rect(0, 0, PAGE_WIDTH_PT, headerStyle.topBar, 'F');
    y += headerStyle.topBar;
  }

  if (hasHeader) {
    const headerTop = headerStyle.band ? 0 : y;
    if (headerStyle.band) {
      const bandHeight = MARGIN_TOP_PT + 8 + nameLines.length * nameLeading + titleLines.length * 15 + contactLines.length * 12.5 + 22;
      pdf.setFillColor(...hexToRgb(headerStyle.band));
      pdf.rect(0, 0, PAGE_WIDTH_PT, bandHeight, 'F');
      pdf.setFillColor(...hexToRgb(template.accent));
      pdf.rect(0, bandHeight - 2.5, PAGE_WIDTH_PT, 2.5, 'F');
      y = MARGIN_TOP_PT + 8;
    }
    y = Math.max(y, headerTop) + headerStyle.nameSize * 0.82;
    nameLines.forEach((line) => {
      draw(line, anchorX, y, { size: headerStyle.nameSize, rgb: color('text'), bold: headerStyle.nameWeight !== 'normal', tracking: headerStyle.nameTracking, align: headerStyle.align });
      y += nameLeading;
    });
    y -= nameLeading - 16;
    titleLines.forEach((line) => {
      draw(line, anchorX, y, { size: 11.5, rgb: color(headerStyle.titleColor), align: headerStyle.align });
      y += 15;
    });
    y += titleLines.length ? 1 : 0;
    contactLines.forEach((line) => {
      draw(line, anchorX, y, { size: 9.2, rgb: color('muted'), align: headerStyle.align });
      y += 12.5;
    });
    if (headerStyle.band) {
      y = MARGIN_TOP_PT + 8 + nameLines.length * nameLeading + titleLines.length * 15 + contactLines.length * 12.5 + 22 + 20;
    } else if (headerStyle.rule === 'double') {
      y += 2;
      rule(MARGIN_X_PT, rightEdge, y, color('text'), 1.1);
      rule(MARGIN_X_PT, rightEdge, y + 2.6, color('text'), 0.4);
      y += 20;
    } else {
      y += 10;
    }
  }

  // ───────────── Sections ─────────────
  const headingStyle = template.heading;
  const drawHeading = (label) => {
    const text = headingStyle.case === 'upper' ? label.toUpperCase() : label;
    ensureSpace(headingStyle.size + 46);
    const headingRgb = color(headingStyle.color);
    const baseline = y + headingStyle.size;
    if (headingStyle.rule === 'bar') {
      pdf.setFillColor(...hexToRgb(template.accent));
      pdf.rect(MARGIN_X_PT, baseline - headingStyle.size * 0.78, 3, headingStyle.size * 0.95, 'F');
      draw(text, MARGIN_X_PT + 9, baseline, { size: headingStyle.size, rgb: headingRgb, bold: true, tracking: headingStyle.tracking });
      rule(MARGIN_X_PT + 9 + measure(text, headingStyle.size, headingStyle.tracking, true) + 8, rightEdge, baseline - headingStyle.size * 0.32, hexToRgb(template.rule), 0.6);
      y = baseline + 9;
    } else if (headingStyle.align === 'center') {
      draw(text, PAGE_WIDTH_PT / 2, baseline, { size: headingStyle.size, rgb: headingRgb, bold: true, tracking: headingStyle.tracking, align: 'center' });
      rule(MARGIN_X_PT, rightEdge, baseline + 5, hexToRgb(template.rule), 0.5);
      y = baseline + 15;
    } else {
      draw(text, MARGIN_X_PT, baseline, { size: headingStyle.size, rgb: headingRgb, bold: headingStyle.rule !== 'none', tracking: headingStyle.tracking });
      if (headingStyle.rule === 'full') {
        rule(MARGIN_X_PT, rightEdge, baseline + 5, hexToRgb(template.rule), 0.7);
        y = baseline + 15;
      } else if (headingStyle.rule === 'short') {
        rule(MARGIN_X_PT, MARGIN_X_PT + 30, baseline + 5.5, hexToRgb(template.accent), 2);
        y = baseline + 16;
      } else {
        y = baseline + 9;
      }
    }
  };

  const drawParagraph = (text, { indent = 0, size = BODY_SIZE, rgb = color('text') } = {}) => {
    wrap(text, size, contentWidth - indent).forEach((line) => {
      ensureSpace(BODY_LEADING);
      draw(line, MARGIN_X_PT + indent, y + size * 0.8, { size, rgb });
      y += BODY_LEADING;
    });
  };

  const drawBullets = (bullets) => {
    bullets.forEach((bullet) => {
      const lines = wrap(bullet, BODY_SIZE, contentWidth - 13);
      lines.forEach((line, index) => {
        ensureSpace(BODY_LEADING);
        if (index === 0) draw('•', MARGIN_X_PT + 2, y + BODY_SIZE * 0.8, { size: BODY_SIZE, rgb: hexToRgb(template.accent) });
        draw(line, MARGIN_X_PT + 13, y + BODY_SIZE * 0.8, { size: BODY_SIZE, rgb: color('text') });
        y += BODY_LEADING;
      });
    });
  };

  const drawEntry = (entry) => {
    ensureSpace(46);
    const datesWidth = entry.dates ? measure(entry.dates, 9, 0) + 14 : 0;
    const titleLines = entry.title ? wrap(entry.title, 10.6, contentWidth - datesWidth, true) : [];
    const firstBaseline = y + 10.6 * 0.82;
    if (entry.dates) draw(entry.dates, rightEdge, firstBaseline, { size: 9, rgb: color('muted'), align: 'right' });
    titleLines.forEach((line) => {
      draw(line, MARGIN_X_PT, y + 10.6 * 0.82, { size: 10.6, rgb: color('text'), bold: true });
      y += 14;
    });
    if (!titleLines.length && entry.dates) y += 14;
    const subtitleParts = [entry.subtitle, entry.meta].filter(Boolean);
    if (subtitleParts.length) {
      const subtitleRgb = color(template.entry.subtitleColor);
      const joined = subtitleParts.join('  ·  ');
      if (measure(joined, 9.8) <= contentWidth) {
        const baseline = y + 9.8 * 0.8;
        let x = MARGIN_X_PT;
        if (entry.subtitle) {
          draw(entry.subtitle, x, baseline, { size: 9.8, rgb: subtitleRgb });
          x += measure(entry.subtitle, 9.8);
        }
        if (entry.meta) draw(`${entry.subtitle ? '  ·  ' : ''}${entry.meta}`, x, baseline, { size: 9.8, rgb: color('muted') });
        y += 13.5;
      } else {
        drawParagraph(joined, { size: 9.8, rgb: subtitleRgb });
      }
    }
    if (entry.bullets.length) {
      y += 2;
      drawBullets(entry.bullets);
    }
    y += 7;
  };

  model.sections.forEach((section) => {
    drawHeading(section.label);
    if (section.kind === 'paragraphs') {
      section.paragraphs.forEach((paragraph) => { drawParagraph(paragraph); y += 2; });
    } else if (section.kind === 'inline') {
      drawParagraph(section.items.join(template.skills.separator));
    } else if (section.kind === 'bullets') {
      drawBullets(section.bullets);
    } else if (section.kind === 'entries') {
      section.entries.forEach(drawEntry);
      y -= 7;
    }
    y += 13;
  });

  return { pdf, blob: pdf.output('blob') };
};
