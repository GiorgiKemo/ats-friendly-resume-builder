import bidiFactory from 'bidi-js';
import { PDF_FONT_KEYS, allowsTracking, familiesForText, hasRtl, isCjkChar, isMark, pickCjkFamily, preferredFamily } from './scripts.js';

let bidiInstance;
const getBidi = () => { bidiInstance ||= bidiFactory(); return bidiInstance; };
const graphemes = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const splitGraphemes = (text) => (graphemes ? [...graphemes.segment(text)].map((part) => part.segment) : [...text]);

// CJK line-break rules: never start a line with closing punctuation, never end
// one with an opening bracket.
const CJK_CLOSE = new Set([...'、。，．・：；！？）」』】〕〉》〙〗’”%）］｝，．：；！？ー']);
const CJK_OPEN = new Set([...'（「『【〔〈《〘〖‘“（［｛']);

const toBytes = (data) => {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return null;
};

/**
 * Loads the fonts a resume needs and exposes shaping-aware measuring,
 * wrapping and bidi-ordered line layout. `hb` is the harfbuzzjs module and
 * `loadFont(key)` returns font bytes (Uint8Array, ArrayBuffer or base64) or null.
 */
export const createTextEngine = async ({ hb, loadFont, text, language = '' }) => {
  if (!hb) throw new Error('The PDF text engine needs HarfBuzz.');
  const cjkFamily = pickCjkFamily(text, language);
  const families = familiesForText(text, language);
  const faces = new Map();

  const register = async (family, weight, key) => {
    const bytes = toBytes(await loadFont(key));
    if (!bytes) return;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const hbFace = new hb.Face(new hb.Blob(buffer));
    const hbFont = new hb.Font(hbFace);
    const coverage = new Map();
    faces.set(`${family}:${weight}`, {
      key, family, weight, bytes, hbFace, hbFont, upem: hbFace.upem,
      covers: (codePoint) => {
        if (!coverage.has(codePoint)) {
          const glyph = hbFont.nominalGlyph(codePoint);
          coverage.set(codePoint, Boolean(glyph));
        }
        return coverage.get(codePoint);
      },
    });
  };

  const loadFamilies = (list) => Promise.all(list.flatMap((family) => {
    const keys = PDF_FONT_KEYS[family];
    return [register(family, 'regular', keys.regular), keys.bold ? register(family, 'bold', keys.bold) : null];
  }));
  await loadFamilies(families);
  if (!faces.size) throw new Error('No PDF fonts could be loaded.');

  // Han characters outside the first-choice CJK font (for example Japanese or
  // Traditional forms in a Chinese resume) fall back to the other CJK fonts.
  const covered = (codePoint) => [...faces.values()].some((face) => face.covers(codePoint));
  const missingCjk = [...new Set(text)].some((char) => isCjkChar(char) && !covered(char.codePointAt(0)));
  if (missingCjk) {
    const extra = ['sc', 'jp', 'kr'].filter((family) => !families.includes(family));
    families.push(...extra);
    await loadFamilies(extra);
  }

  // Bold face when the family has one; otherwise the regular face drawn with
  // a faux bold stroke.
  const faceFor = (family, bold) => {
    if (bold && faces.has(`${family}:bold`)) return { face: faces.get(`${family}:bold`), fauxBold: false };
    const regular = faces.get(`${family}:regular`);
    return regular ? { face: regular, fauxBold: bold } : null;
  };

  const chainFor = (char) => {
    const preferred = preferredFamily(char, cjkFamily);
    return [...new Set([preferred, 'latin', 'fallback', ...families])];
  };

  /** Splits text into runs that share one font (logical order). */
  const segment = (value, bold) => {
    const runs = [];
    let current = null;
    for (const char of value) {
      const codePoint = char.codePointAt(0);
      let choice = null;
      const keepCurrent = current && (isMark(char) || !/\p{L}/u.test(char)) && current.face.covers(codePoint);
      if (keepCurrent) {
        choice = { face: current.face, fauxBold: current.fauxBold };
      } else {
        for (const family of chainFor(char)) {
          const candidate = faceFor(family, bold);
          if (candidate && candidate.face.covers(codePoint)) { choice = candidate; break; }
        }
      }
      if (!choice) {
        const error = new Error(`PDF cannot render this character: ${char}. Download DOCX to preserve your full resume.`);
        error.code = 'PDF_UNSUPPORTED_CHARACTER';
        error.character = char;
        throw error;
      }
      if (current && current.face === choice.face && current.fauxBold === choice.fauxBold) {
        current.text += char;
      } else {
        current = { face: choice.face, fauxBold: choice.fauxBold, text: char };
        runs.push(current);
      }
    }
    return runs;
  };

  const shapeCache = new Map();
  const buffer = new hb.Buffer();
  /** Shapes one run; glyphs come back in visual order, in font units. */
  const shape = (face, value, rtl) => {
    const cacheKey = `${face.key}|${rtl ? 1 : 0}|${value}`;
    if (shapeCache.has(cacheKey)) return shapeCache.get(cacheKey);
    buffer.reset();
    buffer.addText(value);
    buffer.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
    if (language) buffer.setLanguage(language);
    buffer.guessSegmentProperties();
    hb.shape(face.hbFont, buffer);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    const glyphs = infos.map((info, index) => ({
      gid: info.codepoint,
      cluster: info.cluster,
      ax: positions[index].xAdvance,
      dx: positions[index].xOffset,
      dy: positions[index].yOffset,
    }));
    const result = { glyphs, advance: glyphs.reduce((sum, glyph) => sum + glyph.ax, 0) };
    shapeCache.set(cacheKey, result);
    return result;
  };

  const glyphTotal = (runs) => runs.reduce((sum, run) => sum + run.glyphs.length, 0);

  /** Visual runs for one line: font runs split by bidi level and reordered (UAX #9, rule L2). */
  const layoutLine = (value, { bold = false, direction = 'ltr' } = {}) => {
    const logical = segment(value, bold);
    let pieces;
    if (!hasRtl(value) && direction === 'ltr') {
      pieces = logical.map((run) => ({ ...run, level: 0 }));
    } else {
      const { levels } = getBidi().getEmbeddingLevels(value, direction);
      pieces = [];
      let offset = 0;
      for (const run of logical) {
        let piece = null;
        for (const char of run.text) {
          const level = levels[offset];
          offset += char.length;
          if (piece && piece.level === level) piece.text += char;
          else {
            piece = { face: run.face, fauxBold: run.fauxBold, text: char, level };
            pieces.push(piece);
          }
        }
      }
      const maxLevel = Math.max(...pieces.map((piece) => piece.level));
      const minOdd = Math.min(...pieces.map((piece) => piece.level).filter((level) => level % 2 === 1), maxLevel + 1);
      for (let level = maxLevel; level >= minOdd; level -= 1) {
        for (let start = 0; start < pieces.length; start += 1) {
          if (pieces[start].level < level) continue;
          let end = start;
          while (end + 1 < pieces.length && pieces[end + 1].level >= level) end += 1;
          pieces.splice(start, end - start + 1, ...pieces.slice(start, end + 1).reverse());
          start = end;
        }
      }
    }
    return pieces.map((piece) => {
      const rtl = piece.level % 2 === 1;
      const shaped = shape(piece.face, piece.text, rtl);
      return { face: piece.face, fauxBold: piece.fauxBold, text: piece.text, rtl, glyphs: shaped.glyphs, advance: shaped.advance };
    });
  };

  /** Width in points, including letter spacing where the script allows it. */
  const measure = (value, size, { bold = false, tracking = 0, direction = 'ltr' } = {}) => {
    if (!value) return 0;
    const runs = layoutLine(value, { bold, direction });
    const width = runs.reduce((sum, run) => sum + (run.advance * size) / run.face.upem, 0);
    const spacing = tracking && allowsTracking(value) ? tracking * Math.max(0, glyphTotal(runs) - 1) : 0;
    return width + spacing;
  };

  const tokenize = (value) => {
    const tokens = [];
    let current = '';
    const push = () => { if (current) tokens.push(current); current = ''; };
    for (const grapheme of splitGraphemes(value)) {
      if (/^\s+$/u.test(grapheme)) {
        current += grapheme;
        push();
      } else if (isCjkChar(grapheme)) {
        if (CJK_CLOSE.has(grapheme)) {
          if (current) { current += grapheme; push(); } else if (tokens.length) tokens[tokens.length - 1] += grapheme;
          else tokens.push(grapheme);
        } else if (CJK_OPEN.has(grapheme)) {
          push();
          current = grapheme;
        } else if (current && CJK_OPEN.has(current.slice(-1))) {
          current += grapheme;
          push();
        } else {
          push();
          current = grapheme;
          push();
        }
      } else {
        if (current && isCjkChar(current.slice(-1)) && !CJK_OPEN.has(current.slice(-1))) push();
        current += grapheme;
      }
    }
    push();
    // Closing CJK punctuation glued to the next token belongs to the previous one.
    return tokens;
  };

  /** Greedy line breaking on shaped widths. Long words break between graphemes. */
  const wrap = (value, size, width, { bold = false, direction = 'ltr' } = {}) => {
    if (!value) return [];
    const lines = [];
    let line = '';
    const fits = (candidate) => measure(candidate.trimEnd(), size, { bold, direction }) <= width;
    const startLine = (token) => {
      if (fits(token)) return token;
      // A single token wider than the line: break it between graphemes.
      let piece = '';
      for (const grapheme of splitGraphemes(token)) {
        if (piece && !fits(piece + grapheme)) { lines.push(piece.trimEnd()); piece = ''; }
        piece += grapheme;
      }
      return piece;
    };
    for (const token of tokenize(value)) {
      if (!line) line = startLine(token);
      else if (fits(line + token)) line += token;
      else {
        lines.push(line.trimEnd());
        line = startLine(token);
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    return lines;
  };

  return { layoutLine, measure, wrap, faces, allowsTracking };
};
