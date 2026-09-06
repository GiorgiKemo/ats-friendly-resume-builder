import { buildTextPdfCore } from '../../supabase/functions/_shared/resume/pdfCore.js';
import { assertCommittedResume } from '../../supabase/functions/_shared/resume/committedResume.js';

let pdfFontPromise;

const loadPdfFont = () => {
  if (!pdfFontPromise) {
    pdfFontPromise = fetch(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url))
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load the PDF font. Please retry or download DOCX.');
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        }
        return btoa(binary);
      })
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
  return buildTextPdfCore(resume, fontData || await loadPdfFont());
};
