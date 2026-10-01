import { buildTextPdfCore } from '../../supabase/functions/_shared/resume/pdfCore.js';
import { assertCommittedResume } from '../utils/committedResume.js';

// Every font the PDF engine can request. Vite emits each as a static asset;
// only the ones a resume's scripts need are downloaded, once per session.
const FONT_URLS = {
  dejavu: new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url),
  'inter-regular': new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url),
  'inter-bold': new URL('../assets/fonts/Inter-Bold.ttf', import.meta.url),
  'georgian-regular': new URL('../assets/fonts/NotoSansGeorgian-Regular.ttf', import.meta.url),
  'georgian-bold': new URL('../assets/fonts/NotoSansGeorgian-Bold.ttf', import.meta.url),
  'arabic-regular': new URL('../assets/fonts/NotoSansArabic-Regular.ttf', import.meta.url),
  'arabic-bold': new URL('../assets/fonts/NotoSansArabic-Bold.ttf', import.meta.url),
  'devanagari-regular': new URL('../assets/fonts/NotoSansDevanagari-Regular.ttf', import.meta.url),
  'devanagari-bold': new URL('../assets/fonts/NotoSansDevanagari-Bold.ttf', import.meta.url),
  'bengali-regular': new URL('../assets/fonts/NotoSansBengali-Regular.ttf', import.meta.url),
  'bengali-bold': new URL('../assets/fonts/NotoSansBengali-Bold.ttf', import.meta.url),
  'sc-regular': new URL('../assets/fonts/NotoSansSC-Regular.ttf', import.meta.url),
  'jp-regular': new URL('../assets/fonts/NotoSansJP-Regular.ttf', import.meta.url),
  'kr-regular': new URL('../assets/fonts/NotoSansKR-Regular.ttf', import.meta.url),
};
const SUBSET_WASM_URL = new URL('../../node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm', import.meta.url);

// Browsers fetch assets; Node (tests, scripts) reads file: URLs from disk.
const readAsset = async (url) => {
  if (url.protocol === 'file:') {
    const fsModule = 'node:fs/promises';
    const { readFile } = await import(/* @vite-ignore */ fsModule);
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load a PDF resource. Please retry or download DOCX.');
  return new Uint8Array(await response.arrayBuffer());
};

const cache = new Map();
const cached = (key, load) => {
  if (!cache.has(key)) {
    cache.set(key, load().catch((error) => {
      cache.delete(key);
      throw error;
    }));
  }
  return cache.get(key);
};

const fetchFont = (key) => {
  const url = FONT_URLS[key];
  if (!url) return Promise.resolve(null);
  // Inter is optional (other fonts cover the same text); the rest are required.
  return cached(`font:${key}`, () => readAsset(url)).catch((error) => {
    if (key.startsWith('inter-')) return null;
    throw error;
  });
};

const loadHarfBuzz = () => cached('hb', () => import('harfbuzzjs'));
const loadSubsetWasm = () => cached('subset-wasm', () => readAsset(SUBSET_WASM_URL));

// Browser adapter: the runtime-neutral core receives a font loader, the
// HarfBuzz shaper and the HarfBuzz subsetter, and stays independent from
// browser fetch/storage behavior. Callers may pass their own `fontSource`
// (a loader function or a { key: bytes } object).
export const buildTextPdf = async (resume, fontSource) => {
  // Reject review packets before a font fetch or any renderer work.
  assertCommittedResume(resume);
  const [hb, subsetWasm] = await Promise.all([loadHarfBuzz(), loadSubsetWasm()]);
  return buildTextPdfCore(resume, fontSource || fetchFont, { hb, subsetWasm });
};
