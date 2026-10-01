import { Document, Paragraph, TextRun, Tab, BorderStyle, AlignmentType, Packer, ShadingType, TabStopType } from 'docx';
import FileSaver from 'file-saver';
import { MAX_TRACKING_RATIO, buildResumeModel, resolveTemplateColor } from '../../supabase/functions/_shared/resume/templates.js';
import { applyResumeCase } from '../../supabase/functions/_shared/resume/locale.js';
import { assertCommittedResume } from '../utils/resumeTailoringReview.js';

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
const { saveAs } = FileSaver;

const DEBUG_DOCX = import.meta.env?.DEV && import.meta.env?.VITE_DEBUG_DOCX === 'true';
const debugLog = (...args) => {
  if (DEBUG_DOCX) console.log(...args);
};

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}

const toDocxColor = (hex) => `${hex}`.replace('#', '').toUpperCase();
const halfPoints = (points) => Math.round(points * 2);
const TWIPS_PER_POINT = 20;

// Word picks a font per script slot. These ship with Windows and Office, so
// the document displays the same on the employer's machine.
const LANGUAGE_TAGS = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', it: 'it-IT', nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', uk: 'uk-UA', ka: 'ka-GE', tr: 'tr-TR', ar: 'ar-SA', hi: 'hi-IN', bn: 'bn-IN', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', id: 'id-ID', vi: 'vi-VN' };
const EAST_ASIAN_FONTS = { zh: 'Microsoft YaHei', ja: 'Yu Gothic', ko: 'Malgun Gothic' };
const COMPLEX_SCRIPT_FONTS = { ar: 'Arial', hi: 'Nirmala UI', bn: 'Nirmala UI' };
// Letter spacing breaks joined or dense scripts; capitals only exist in some.
const NO_TRACKING_LANGUAGES = new Set(['ar', 'hi', 'bn', 'zh', 'ja', 'ko']);
const UNCASED_LANGUAGES = new Set(['ka', 'ar', 'hi', 'bn', 'zh', 'ja', 'ko']);

/**
 * Generate a DOCX document from a resume object, using the same content model
 * and design tokens as the preview and the PDF export. Layout stays Word-native
 * and parser-friendly: no tables or text boxes; dates align with a right tab.
 */
export const createResumeDocxDocument = (resume) => {
  assertCommittedResume(resume);
  try {
    const completeResume = resume || {};
    debugLog('Resume data for DOCX export:', JSON.stringify(completeResume, null, 2));

    const { template, header, sections, language, direction } = buildResumeModel(completeResume);
    const rtl = direction === 'rtl';
    const languageTag = LANGUAGE_TAGS[language] || 'en-US';
    const font = {
      ascii: template.docxFont,
      hAnsi: template.docxFont,
      eastAsia: EAST_ASIAN_FONTS[language] || template.docxFont,
      cs: COMPLEX_SCRIPT_FONTS[language] || template.docxFont,
    };
    const allowTracking = !NO_TRACKING_LANGUAGES.has(language);
    const allowCaps = !UNCASED_LANGUAGES.has(language);
    const START = rtl ? AlignmentType.START : AlignmentType.LEFT;
    const color = (key) => toDocxColor(resolveTemplateColor(template, key));
    const accent = toDocxColor(template.accent);
    const ruleColor = toDocxColor(template.rule);
    const centered = template.header.align === 'center';
    const band = template.header.band ? { type: ShadingType.CLEAR, color: 'auto', fill: toDocxColor(template.header.band) } : undefined;
    const tracking = (size, value) => (allowTracking ? Math.round(Math.min(value || 0, size * MAX_TRACKING_RATIO) * TWIPS_PER_POINT) : undefined);
    // Right edge of the US Letter text area: 12240 page width minus 2 x 1008 margins (twips).
    // Right-to-left paragraphs measure tabs from the right, so dates sit at the end edge.
    const rightTab = [{ type: rtl ? TabStopType.END : TabStopType.RIGHT, position: 12240 - 1008 * 2 }];
    const children = [];

    const scriptProps = {
      font,
      rightToLeft: rtl || undefined,
      language: { value: languageTag, eastAsia: languageTag, bidirectional: languageTag },
    };
    const run = (text, { size = 10, bold = false, fill = color('text'), characterSpacing, allCaps } = {}) => new TextRun({
      text, ...scriptProps, size: halfPoints(size), sizeComplexScript: halfPoints(size), bold, boldComplexScript: bold, color: fill, characterSpacing, allCaps: allCaps && allowCaps,
    });

    // ======= HEADER =======
    const headerParagraph = (runs, spacingAfter, extra = {}) => new Paragraph({
      children: runs,
      alignment: centered ? AlignmentType.CENTER : START,
      bidirectional: rtl || undefined,
      spacing: { after: spacingAfter },
      shading: band,
      ...extra,
    });

    if (header.name) {
      const nameText = template.header.nameCase === 'upper' ? applyResumeCase(header.name, 'upper', language) : header.name;
      children.push(headerParagraph([
        run(nameText, {
          size: template.header.nameSize,
          bold: template.header.nameWeight !== 'normal',
          characterSpacing: tracking(template.header.nameSize, template.header.nameTracking),
        }),
      ], 40, template.header.topBar ? {
        border: { top: { style: BorderStyle.SINGLE, size: 36, color: accent, space: 12 } },
      } : {}));
    }

    if (header.title) {
      children.push(headerParagraph([run(header.title, { size: 11.5, fill: color(template.header.titleColor) })], 40));
    }

    if (header.contacts.length > 0) {
      children.push(headerParagraph([
        run(header.contacts.join(template.header.contactSeparator), { size: 9.2, fill: color('muted') }),
      ], 0, template.header.rule === 'double' ? {
        border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: color('text'), space: 8 } },
      } : {}));
    }

    // The band's accent rule is its own paragraph: giving the last shaded
    // paragraph a different border would split Word's shading into two blocks.
    if (band && header.contacts.length + Number(Boolean(header.name)) + Number(Boolean(header.title)) > 0) {
      children.push(new Paragraph({
        children: [],
        spacing: { after: 0 },
        border: { top: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 0 } },
      }));
    }

    // ======= SECTIONS =======
    const heading = template.heading;
    const createSectionHeading = (label) => {
      // Word's all-caps formatting keeps the stored heading text in its normal case.
      const border = heading.rule === 'full'
        ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: ruleColor, space: 3 } }
        : heading.rule === 'bar'
          ? { [rtl ? 'right' : 'left']: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 6 } }
          : heading.rule === 'short'
            ? { bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 3 } }
            : undefined;
      const headingParagraph = new Paragraph({
        children: [run(label, {
          allCaps: heading.case === 'upper',
          size: heading.size + (heading.case === 'upper' ? 0.5 : 1),
          bold: heading.rule !== 'none',
          fill: color(heading.color),
          characterSpacing: tracking(heading.size, heading.tracking),
        })],
        alignment: heading.align === 'center' ? AlignmentType.CENTER : START,
        bidirectional: rtl || undefined,
        spacing: { before: heading.rule === 'bar' ? 0 : 300, after: 120 },
        keepNext: true,
        border,
      });
      // A left border spans the paragraph's space-before too, so bar headings
      // take their top spacing from an empty spacer paragraph instead.
      if (heading.rule !== 'bar') return [headingParagraph];
      return [new Paragraph({ children: [], bidirectional: rtl || undefined, spacing: { before: 0, after: 0, line: 300 }, keepNext: true }), headingParagraph];
    };

    const bodyParagraph = (text, { bullet = false, spacingAfter = 40 } = {}) => new Paragraph({
      children: [run(text, { size: 10 })],
      bullet: bullet ? { level: 0 } : undefined,
      alignment: START,
      bidirectional: rtl || undefined,
      spacing: { after: spacingAfter },
    });

    const appendEntry = (entry) => {
      const headRuns = [];
      if (entry.title) headRuns.push(run(entry.title, { size: 10.5, bold: true }));
      if (entry.dates) headRuns.push(new TextRun({ children: [new Tab(), entry.dates], ...scriptProps, size: halfPoints(9), sizeComplexScript: halfPoints(9), color: color('muted') }));
      if (headRuns.length) {
        children.push(new Paragraph({ children: headRuns, tabStops: rightTab, alignment: START, bidirectional: rtl || undefined, spacing: { before: 140, after: 0 }, keepNext: true }));
      }
      if (entry.subtitle || entry.meta) {
        const subtitleRuns = [];
        if (entry.subtitle) subtitleRuns.push(run(entry.subtitle, { size: 10, fill: color(template.entry.subtitleColor) }));
        if (entry.meta) subtitleRuns.push(run(`${entry.subtitle ? '  ·  ' : ''}${entry.meta}`, { size: 10, fill: color('muted') }));
        children.push(new Paragraph({ children: subtitleRuns, alignment: START, bidirectional: rtl || undefined, spacing: { after: 60 }, keepNext: entry.bullets.length > 0 }));
      }
      entry.bullets.forEach((bullet) => children.push(bodyParagraph(bullet, { bullet: true })));
    };

    sections.forEach((section) => {
      children.push(...createSectionHeading(section.label));
      if (section.kind === 'paragraphs') {
        section.paragraphs.forEach((paragraph) => children.push(bodyParagraph(paragraph, { spacingAfter: 80 })));
      } else if (section.kind === 'inline') {
        children.push(bodyParagraph(section.items.join(template.skills.separator), { spacingAfter: 80 }));
      } else if (section.kind === 'bullets') {
        section.bullets.forEach((bullet) => children.push(bodyParagraph(bullet, { bullet: true })));
      } else if (section.kind === 'entries') {
        section.entries.forEach(appendEntry);
      }
    });

    // ======= CREATE DOCUMENT =======
    return new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            basedOn: 'Normal',
            next: 'Normal',
            quickFormat: true,
            run: { size: 20, sizeComplexScript: 20, font, color: color('text'), language: { value: languageTag, eastAsia: languageTag, bidirectional: languageTag } },
            paragraph: { spacing: { line: 264 } },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              // US Letter, matching the PDF export.
              size: { width: 12240, height: 15840 },
              margin: { top: 936, right: 1008, bottom: 936, left: 1008 },
            },
          },
          children,
        },
      ],
    });
  } catch (error) {
    throw new Error(`Failed to create resume document: ${error.message}`);
  }
};

export const downloadResumeDocx = async (resume, filename = 'resume') => {
  try {
    const doc = createResumeDocxDocument(resume);
    const cleanName = (filename || 'resume')
      .replace(/[^\p{L}\p{N}._-]+/gu, '_')
      .replace(/^_+|_+$/g, '') || 'resume';

    if (isBrowser) {
      try {
        debugLog('Using browser-compatible Packer.toBlob method');
        const blob = await Packer.toBlob(doc);
        saveAs(blob, `${cleanName}.docx`);
      } catch (browserError) {
        console.error('Error with Packer.toBlob:', browserError);
        try {
          debugLog('Trying alternative browser export method');
          const arrayBuffer = await Packer.toBase64String(doc);
          const blob = base64ToBlob(arrayBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          saveAs(blob, `${cleanName}.docx`);
        } catch (fallbackError) {
          console.error('Error with fallback method:', fallbackError);
          throw new Error(`Browser export failed: ${fallbackError.message}`);
        }
      }
    } else {
      await Packer.toBuffer(doc);
    }

    return true;
  } catch (error) {
    console.error('Error generating or downloading DOCX:', error);
    throw new Error(`Failed to export resume as DOCX: ${error.message}`);
  }
};
