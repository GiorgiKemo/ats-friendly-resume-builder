/* eslint-disable no-irregular-whitespace -- CJK punctuation ranges include the ideographic space (U+3000). */
// Script detection and font selection for the resume PDF engine.
// Runtime-neutral: used by the browser adapter and the Edge function alike.

// Font keys the engine can request from a font provider. Bold keys are
// optional; scripts without a bold face get a faux bold (fill + stroke).
export const PDF_FONT_KEYS = {
  latin: { regular: 'inter-regular', bold: 'inter-bold' },
  georgian: { regular: 'georgian-regular', bold: 'georgian-bold' },
  arabic: { regular: 'arabic-regular', bold: 'arabic-bold' },
  devanagari: { regular: 'devanagari-regular', bold: 'devanagari-bold' },
  bengali: { regular: 'bengali-regular', bold: 'bengali-bold' },
  sc: { regular: 'sc-regular', bold: null },
  jp: { regular: 'jp-regular', bold: null },
  kr: { regular: 'kr-regular', bold: null },
  fallback: { regular: 'dejavu', bold: null },
};

const SCRIPT_TESTS = [
  ['georgian', /\p{Script=Georgian}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['bengali', /\p{Script=Bengali}/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['kana', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['han', /\p{Script=Han}/u],
];

const MARK = /\p{M}|‌|‍|[︀-️]/u;
const RTL_STRONG = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
// Scripts whose letters join or reorder: letter spacing would break them.
const NO_TRACKING = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

export const isMark = (char) => MARK.test(char);
export const isRtlChar = (char) => RTL_STRONG.test(char);
export const hasRtl = (text) => RTL_STRONG.test(text);
export const allowsTracking = (text) => !NO_TRACKING.test(text);
export const isCjkChar = (char) => CJK.test(char);

export const scriptOf = (char) => {
  for (const [script, test] of SCRIPT_TESTS) if (test.test(char)) return script;
  return 'other';
};

/**
 * Chooses which CJK font renders Han characters. Kana means Japanese and
 * Hangul means Korean; otherwise the resume language decides, defaulting to
 * Simplified Chinese.
 */
export const pickCjkFamily = (text, language = '') => {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) || language.startsWith('ja')) return 'jp';
  if (/\p{Script=Hangul}/u.test(text) || language.startsWith('ko')) return 'kr';
  return 'sc';
};

/** Font families needed to render `text`, in fallback order per character. */
export const familiesForText = (text, language = '') => {
  const families = new Set(['latin', 'fallback']);
  const cjk = pickCjkFamily(text, language);
  for (const char of text) {
    const script = scriptOf(char);
    if (script === 'georgian' || script === 'arabic' || script === 'devanagari' || script === 'bengali') families.add(script);
    if (script === 'han' || script === 'kana' || script === 'hangul' || /[　-〿＀-￯]/u.test(char)) {
      families.add(script === 'hangul' ? 'kr' : script === 'kana' ? 'jp' : cjk);
    }
  }
  return [...families];
};

/** Preferred family for one character, before coverage checks. */
export const preferredFamily = (char, cjkFamily) => {
  const script = scriptOf(char);
  if (script === 'georgian' || script === 'arabic' || script === 'devanagari' || script === 'bengali') return script;
  if (script === 'hangul') return 'kr';
  if (script === 'kana') return 'jp';
  if (script === 'han' || /[　-〿＀-￯]/u.test(char)) return cjkFamily;
  return 'latin';
};
