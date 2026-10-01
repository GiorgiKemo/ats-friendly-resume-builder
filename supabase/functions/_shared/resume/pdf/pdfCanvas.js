import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { allowsTracking } from './scripts.js';

const num = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
const rgbOp = (rgb, op) => `${rgb.map((channel) => num(channel / 255)).join(' ')} ${op}`;
const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0');
const utf16Hex = (text) => {
  let out = '';
  for (let index = 0; index < text.length; index += 1) out += hex4(text.charCodeAt(index));
  return out;
};

// Deterministic six-letter subset tag (PDF 32000-1, 9.6.4).
const subsetTag = (seed) => {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  let tag = '';
  for (let index = 0; index < 6; index += 1) { tag += String.fromCharCode(65 + (hash % 26)); hash = Math.floor(hash / 26) + 7919 * (index + 1); }
  return tag;
};

// Descriptor metrics straight from the font's head, hhea and OS/2 tables.
const fontMetrics = (face) => {
  const table = (tag) => {
    const bytes = face.hbFace.referenceTable(tag);
    return bytes && bytes.length ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null;
  };
  const head = table('head');
  const hhea = table('hhea');
  const os2 = table('OS/2');
  const ascent = hhea ? hhea.getInt16(4) : face.upem * 0.8;
  const descent = hhea ? hhea.getInt16(6) : -face.upem * 0.2;
  const capHeight = os2 && os2.byteLength >= 90 && os2.getUint16(0) >= 2 ? os2.getInt16(88) : 0;
  const bbox = head ? [head.getInt16(36), head.getInt16(38), head.getInt16(40), head.getInt16(42)] : [0, descent, face.upem, ascent];
  const postscriptName = `${face.hbFace.getName(6, 'en') || ''}`.replace(/[^A-Za-z0-9-]/g, '') || face.key;
  return { ascent, descent, capHeight: capHeight || Math.round(ascent * 0.7), bbox, postscriptName };
};

const toUnicodeCMap = (entries) => {
  const blocks = [];
  for (let index = 0; index < entries.length; index += 100) {
    const chunk = entries.slice(index, index + 100);
    blocks.push(`${chunk.length} beginbfchar\n${chunk.map(([cid, text]) => `<${hex4(cid)}> <${utf16Hex(text)}>`).join('\n')}\nendbfchar`);
  }
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    ...blocks,
    'endcmap',
    'CMapName currentdict /CMapResource defineresource pop',
    'end',
    'end',
  ].join('\n');
};

/**
 * Minimal PDF surface for the resume layout: pages, filled rectangles, lines
 * and shaped text. Coordinates are points from the top-left.
 *
 * Text is drawn glyph by glyph from HarfBuzz output; fonts are subset with
 * HarfBuzz's subsetter (`subset(fontBytes, glyphIds)`, keeping glyph ids). For
 * reliable copy/paste and parsing in every script, each shaping cluster (a
 * syllable, a letter with its dots, a ligature) extracts as exactly the text
 * it was typed as: the first glyph written for a cluster maps to the whole
 * cluster and the rest map to nothing. One glyph can appear in different
 * clusters, so every (glyph, text) pair gets its own CID and a CIDToGIDMap
 * points the CIDs at the shared outlines. Each run is also wrapped in an
 * ActualText span for readers that use it.
 */
export const createPdfCanvas = async ({ width, height, title = '', language = '', subset }) => {
  if (typeof subset !== 'function') throw new Error('The PDF writer needs a font subsetter.');
  const doc = await PDFDocument.create();
  doc.setTitle(title || 'Resume');
  doc.setCreator('ResumeATS');
  doc.setProducer('ResumeATS');
  if (language) doc.setLanguage(language);

  const pages = [];
  const fonts = new Map();
  const drawLog = [];
  let current = null;

  const addPage = () => {
    current = { page: doc.addPage([width, height]), ops: [], fontNames: new Set() };
    pages.push(current);
  };
  addPage();

  const fontFor = (face) => {
    if (!fonts.has(face.key)) {
      fonts.set(face.key, {
        face,
        name: `F${fonts.size + 1}`,
        ref: doc.context.nextRef(),
        glyphs: new Set(),
        cids: new Map(),
        // cid -> { gid, width (1000/em), text }
        entries: [null],
      });
    }
    return fonts.get(face.key);
  };

  const cidFor = (font, gid, text) => {
    font.glyphs.add(gid);
    const cacheKey = `${gid}|${text}`;
    if (!font.cids.has(cacheKey)) {
      font.cids.set(cacheKey, font.entries.length);
      font.entries.push({
        gid,
        width: Math.round((font.face.hbFont.glyphHAdvance(gid) * 1000) / font.face.upem),
        text,
      });
    }
    return font.cids.get(cacheKey);
  };

  const pdfY = (y) => height - y;

  const fillRect = (x, y, w, h, rgb) => {
    current.ops.push(`${rgbOp(rgb, 'rg')} ${num(x)} ${num(pdfY(y + h))} ${num(w)} ${num(h)} re f`);
  };

  const line = (x1, y1, x2, y2, rgb, lineWidth) => {
    current.ops.push(`${rgbOp(rgb, 'RG')} ${num(lineWidth)} w ${num(x1)} ${num(pdfY(y1))} m ${num(x2)} ${num(pdfY(y2))} l S`);
  };

  /**
   * Draws runs (visual order, from the text engine) with the left edge at x
   * and the baseline at y.
   */
  const drawRuns = (runs, x, y, { size, rgb, tracking = 0, text = '' }) => {
    const trackingAllowed = tracking && allowsTracking(text);
    let pen = x;
    const totalGlyphs = runs.reduce((sum, run) => sum + run.glyphs.length, 0);
    let glyphIndex = 0;
    for (const run of runs) {
      const font = fontFor(run.face);
      current.fontNames.add(font);
      const scale = size / run.face.upem;

      const clusterStarts = [...new Set(run.glyphs.map((glyph) => glyph.cluster))].sort((a, b) => a - b);
      const clusterText = (cluster) => {
        const position = clusterStarts.indexOf(cluster);
        const end = position + 1 < clusterStarts.length ? clusterStarts[position + 1] : run.text.length;
        return run.text.slice(cluster, end);
      };

      // Positions come from the visual layout. Left-to-right runs are written
      // in visual order (clusters already ascend); right-to-left runs are
      // written in reading order so stream-order extractors get logical text.
      const placed = run.glyphs.map((glyph) => {
        const position = { glyph, x: pen + glyph.dx * scale, y: pdfY(y) + glyph.dy * scale };
        pen += glyph.ax * scale;
        glyphIndex += 1;
        if (trackingAllowed && glyphIndex < totalGlyphs) pen += tracking;
        return position;
      });
      if (run.rtl) placed.reverse();

      const ops = [`/Span << /ActualText <FEFF${utf16Hex(run.text)}> >> BDC`, 'BT', `/${font.name} ${num(size)} Tf`, rgbOp(rgb, 'rg')];
      if (run.fauxBold) ops.push(`2 Tr ${num(Math.max(0.2, size * 0.032))} w ${rgbOp(rgb, 'RG')}`);
      const mapped = new Set();
      for (const { glyph, x: gx, y: gy } of placed) {
        const first = !mapped.has(glyph.cluster);
        mapped.add(glyph.cluster);
        const cid = cidFor(font, glyph.gid, first ? clusterText(glyph.cluster) : '');
        ops.push(`1 0 0 1 ${num(gx)} ${num(gy)} Tm <${hex4(cid)}> Tj`);
      }
      if (run.fauxBold) ops.push('0 Tr');
      ops.push('ET', 'EMC');
      current.ops.push(ops.join('\n'));
    }
    drawLog.push({ page: pages.length, text, x, y, size });
    return pen - x;
  };

  const save = async () => {
    for (const font of fonts.values()) {
      const metrics = fontMetrics(font.face);
      const scale = 1000 / font.face.upem;
      const baseFont = `${subsetTag(`${font.face.key}:${font.entries.length}`)}+${metrics.postscriptName}`;
      const fontBytes = subset(font.face.bytes, [...font.glyphs]);
      const fontFile = doc.context.flateStream(fontBytes, { Length1: fontBytes.length });
      const descriptor = doc.context.obj({
        Type: 'FontDescriptor',
        FontName: baseFont,
        Flags: 4,
        FontBBox: metrics.bbox.map((value) => Math.round(value * scale)),
        ItalicAngle: 0,
        Ascent: Math.round(metrics.ascent * scale),
        Descent: Math.round(metrics.descent * scale),
        CapHeight: Math.round(metrics.capHeight * scale),
        StemV: 80,
        FontFile2: doc.context.register(fontFile),
      });

      // CID -> glyph map: two bytes (big-endian glyph id) per CID.
      const cidToGid = new Uint8Array(font.entries.length * 2);
      font.entries.forEach((entry, cid) => {
        if (!entry) return;
        cidToGid[cid * 2] = entry.gid >> 8;
        cidToGid[cid * 2 + 1] = entry.gid & 0xff;
      });
      const widths = font.entries.flatMap((entry, cid) => (entry ? [cid, [entry.width]] : []));
      const cidFont = doc.context.obj({
        Type: 'Font',
        Subtype: 'CIDFontType2',
        BaseFont: baseFont,
        CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
        FontDescriptor: doc.context.register(descriptor),
        W: widths,
        DW: 0,
        CIDToGIDMap: doc.context.register(doc.context.flateStream(cidToGid)),
      });
      const unicode = font.entries.flatMap((entry, cid) => (entry ? [[cid, entry.text]] : []));
      const toUnicode = doc.context.flateStream(toUnicodeCMap(unicode));
      const type0 = doc.context.obj({
        Type: 'Font',
        Subtype: 'Type0',
        BaseFont: baseFont,
        Encoding: 'Identity-H',
        DescendantFonts: [doc.context.register(cidFont)],
        ToUnicode: doc.context.register(toUnicode),
      });
      doc.context.assign(font.ref, type0);
    }
    for (const { page, ops, fontNames } of pages) {
      const stream = doc.context.flateStream(ops.join('\n'));
      page.node.set(PDFName.of('Contents'), doc.context.register(stream));
      for (const font of fontNames) page.node.setFontDictionary(PDFName.of(font.name), font.ref);
    }
    return doc.save({ useObjectStreams: true });
  };

  return {
    addPage,
    fillRect,
    line,
    drawRuns,
    save,
    get pageCount() { return pages.length; },
    drawLog,
  };
};
