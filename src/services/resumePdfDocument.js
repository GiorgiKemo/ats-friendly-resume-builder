import { buildTextPdfCore } from '../../supabase/functions/_shared/resume/pdfCore.js';
import { assertCommittedResume } from '../utils/committedResume.js';

let pdfFontPromise;

const FONT_FILES = {
  fallback: new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url),
  regular: new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url),
  bold: new URL('../assets/fonts/Inter-Bold.ttf', import.meta.url),
};

const fetchFontBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load the PDF font. Please retry or download DOCX.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
};

// DejaVu Sans is required (it covers the widest set of scripts). Inter is the
// preferred face; if it cannot be loaded the renderer falls back to DejaVu.
const loadPdfFonts = () => {
  if (!pdfFontPromise) {
    pdfFontPromise = Promise.all([
      fetchFontBase64(FONT_FILES.fallback),
      fetchFontBase64(FONT_FILES.regular).catch(() => null),
      fetchFontBase64(FONT_FILES.bold).catch(() => null),
    ])
      .then(([fallback, regular, bold]) => ({ fallback, regular, bold }))
      .catch((error) => {
        pdfFontPromise = undefined;
        throw error;
      });
  }
  return pdfFontPromise;
};

// Browser adapter: the runtime-neutral core receives explicit font bytes and
// remains independent from browser fetch/storage behavior.
export const buildTextPdf = async (resume, fontData) => {
  // Reject review packets before a font fetch or any renderer work.
  assertCommittedResume(resume);
  return buildTextPdfCore(resume, fontData || await loadPdfFonts());
};
