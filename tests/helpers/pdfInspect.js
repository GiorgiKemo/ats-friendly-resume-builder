import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRef } from 'pdf-lib';

// Drawn lines in paint order, as the renderer recorded them (logical text).
export const drawnText = (result) => result.drawLog.map((entry) => entry.text);

const lookup = (doc, value) => (value instanceof PDFRef ? doc.context.lookup(value) : value);

/**
 * Fonts embedded in a rendered PDF: base font name plus whether the text can be
 * extracted (ToUnicode map) and whether glyph ids are mapped (CIDToGIDMap).
 */
export const embeddedFonts = async (bytes) => {
  const doc = await PDFDocument.load(bytes);
  const fonts = new Map();
  for (const page of doc.getPages()) {
    const resources = lookup(doc, page.node.get(PDFName.of('Resources')));
    const fontDict = resources instanceof PDFDict ? lookup(doc, resources.get(PDFName.of('Font'))) : null;
    if (!(fontDict instanceof PDFDict)) continue;
    for (const [, ref] of fontDict.entries()) {
      const font = lookup(doc, ref);
      const baseFont = font.get(PDFName.of('BaseFont'))?.decodeText?.() ?? `${font.get(PDFName.of('BaseFont'))}`.replace(/^\//, '');
      const descendants = lookup(doc, font.get(PDFName.of('DescendantFonts')));
      const cidFont = descendants instanceof PDFArray ? lookup(doc, descendants.get(0)) : null;
      fonts.set(baseFont, {
        baseFont,
        name: baseFont.split('+').pop(),
        hasToUnicode: Boolean(font.get(PDFName.of('ToUnicode'))),
        hasCidToGidMap: Boolean(cidFont?.get(PDFName.of('CIDToGIDMap'))),
      });
    }
  }
  return [...fonts.values()];
};

export const pageCount = async (bytes) => (await PDFDocument.load(bytes)).getPageCount();
