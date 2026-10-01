import { assertCommittedResume } from './committedResume.js';
import { buildResumeModel, collectResumeModelText, getResumeTemplate, resolveTemplateColor, MAX_TRACKING_RATIO } from './templates.js';
import { applyResumeCase, resolveResumeDirection } from './locale.js';
import { createTextEngine } from './pdf/textEngine.js';
import { createPdfCanvas } from './pdf/pdfCanvas.js';
import { createHbSubsetter } from './pdf/hbSubset.js';

// One subsetter instance per wasm source, so repeated exports reuse it.
const subsetters = new WeakMap();
const getSubsetter = async (source) => {
  if (!source) throw new Error('The PDF renderer needs the HarfBuzz subsetter (harfbuzz-subset.wasm).');
  if (typeof source === 'function') return source;
  const cacheable = typeof source === 'object';
  if (cacheable && subsetters.has(source)) return subsetters.get(source);
  const subset = await createHbSubsetter(source);
  if (cacheable) subsetters.set(source, subset);
  return subset;
};

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

// Font sources: a loader `(key) => bytes | base64 | null`, or the legacy
// object { fallback: DejaVu, regular: Inter Regular, bold: Inter Bold, ...key },
// or a bare DejaVu base64 string.
const LEGACY_KEYS = { dejavu: 'fallback', 'inter-regular': 'regular', 'inter-bold': 'bold' };
const toFontLoader = (fontSource) => {
  if (typeof fontSource === 'function') return fontSource;
  const data = typeof fontSource === 'string' ? { fallback: fontSource } : (fontSource || {});
  return async (key) => data[key] ?? data[LEGACY_KEYS[key]] ?? null;
};

/**
 * Text-native resume PDF for every script. `hb` is the harfbuzzjs module and
 * `subsetWasm` the harfbuzz-subset.wasm bytes/module (the browser and Edge
 * adapters load both); fonts come from `fontSource`. Returns
 * the PDF bytes and a Blob, plus a draw log used by tests.
 */
export const buildTextPdfCore = async (resume, fontSource, { hb, subsetWasm } = {}) => {
  assertCommittedResume(resume);
  const model = buildResumeModel(resume);
  const { template, header, language } = model;
  const allText = collectResumeModelText(model).join('\n');
  const direction = resolveResumeDirection(language, allText);
  const rtl = direction === 'rtl';
  const engine = await createTextEngine({ hb, loadFont: toFontLoader(fontSource), text: allText, language });
  const subset = await getSubsetter(subsetWasm);
  const canvas = await createPdfCanvas({ width: PAGE_WIDTH_PT, height: PAGE_HEIGHT_PT, title: header.name ? `${header.name} — Resume` : 'Resume', language, subset });

  const color = (key) => hexToRgb(resolveTemplateColor(template, key));
  const contentWidth = PAGE_WIDTH_PT - MARGIN_X_PT * 2;
  const rightEdge = PAGE_WIDTH_PT - MARGIN_X_PT;
  let y = MARGIN_TOP_PT;

  // Right-to-left resumes mirror the whole layout: x is measured from the right.
  const mx = (x) => (rtl ? PAGE_WIDTH_PT - x : x);
  const flip = (align) => (!rtl || align === 'center' ? align : align === 'left' ? 'right' : 'left');
  const upper = (text) => applyResumeCase(text, 'upper', language);

  const newPage = () => {
    canvas.addPage();
    y = MARGIN_TOP_PT;
  };
  const ensureSpace = (height) => {
    if (y + height > PAGE_HEIGHT_PT - MARGIN_BOTTOM_PT) newPage();
  };

  const safeTracking = (size, tracking) => Math.min(tracking || 0, size * MAX_TRACKING_RATIO);
  const measure = (text, size, tracking = 0, bold = false) => engine.measure(text, size, { bold, tracking: safeTracking(size, tracking), direction });

  const draw = (text, x, baseline, { size = BODY_SIZE, rgb = color('text'), bold = false, tracking = 0, align = 'left' } = {}) => {
    if (!text) return;
    const spacing = safeTracking(size, tracking);
    const runs = engine.layoutLine(text, { bold, direction });
    const width = measure(text, size, spacing, bold);
    const anchor = mx(x);
    const finalAlign = flip(align);
    const left = finalAlign === 'center' ? anchor - width / 2 : finalAlign === 'right' ? anchor - width : anchor;
    canvas.drawRuns(runs, left, baseline, { size, rgb, tracking: spacing, text });
  };

  const wrap = (text, size, width, bold = false) => engine.wrap(text, size, width, { bold, direction });
  const rule = (x1, x2, atY, rgb, width) => canvas.line(mx(x1), atY, mx(x2), atY, rgb, width);
  const box = (x, top, w, h, rgb) => canvas.fillRect(rtl ? PAGE_WIDTH_PT - x - w : x, top, w, h, rgb);

  // ───────────── Header ─────────────
  const headerStyle = template.header;
  const anchorX = headerStyle.align === 'center' ? PAGE_WIDTH_PT / 2 : MARGIN_X_PT;
  const nameText = headerStyle.nameCase === 'upper' ? upper(header.name) : header.name;
  const nameLines = nameText ? wrap(nameText, headerStyle.nameSize, contentWidth, headerStyle.nameWeight !== 'normal') : [];
  const titleLines = header.title ? wrap(header.title, 11.5, contentWidth) : [];
  const contactLines = header.contacts.length ? wrap(header.contacts.join(headerStyle.contactSeparator), 9.2, contentWidth) : [];
  const nameLeading = headerStyle.nameSize * 1.18;
  const hasHeader = nameLines.length || titleLines.length || contactLines.length;

  if (headerStyle.topBar) {
    box(0, 0, PAGE_WIDTH_PT, headerStyle.topBar, hexToRgb(template.accent));
    y += headerStyle.topBar;
  }

  if (hasHeader) {
    const headerTop = headerStyle.band ? 0 : y;
    const bandHeight = MARGIN_TOP_PT + 8 + nameLines.length * nameLeading + titleLines.length * 15 + contactLines.length * 12.5 + 22;
    if (headerStyle.band) {
      box(0, 0, PAGE_WIDTH_PT, bandHeight, hexToRgb(headerStyle.band));
      box(0, bandHeight - 2.5, PAGE_WIDTH_PT, 2.5, hexToRgb(template.accent));
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
      y = bandHeight + 20;
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
    const text = headingStyle.case === 'upper' ? upper(label) : label;
    ensureSpace(headingStyle.size + 46);
    const headingRgb = color(headingStyle.color);
    const baseline = y + headingStyle.size;
    if (headingStyle.rule === 'bar') {
      box(MARGIN_X_PT, baseline - headingStyle.size * 0.78, 3, headingStyle.size * 0.95, hexToRgb(template.accent));
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

  const bytes = await canvas.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const pageCount = canvas.pageCount;
  return {
    bytes,
    blob,
    pageCount,
    direction,
    drawLog: canvas.drawLog,
    pdf: {
      getNumberOfPages: () => pageCount,
      // Browser download helper kept for existing callers.
      save: (filename = 'resume.pdf') => {
        if (typeof document === 'undefined') return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    },
  };
};
