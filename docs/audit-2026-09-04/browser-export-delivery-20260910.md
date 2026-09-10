# Browser export delivery evidence — 2026-09-10

This evidence is limited to the local, synthetic QA fixture. It does not use a
real candidate account, real backend, payment provider, or production data.

## Flow

1. Started the fixture backend on loopback and the Vite app with the fixture
   Supabase endpoint.
2. Opened the saved synthetic resume in the builder at desktop width.
3. Opened `Show Preview`; the accessibility tree exposed the normal desktop
   preview's `desktopExportFormat` selector, `Export`, and `View fullscreen`.
4. Exported PDF. The app announced `PDF download requested. Check your
   downloads.` and the browser wrote
   `Alex_Morgan_ATS_Friendly_Resume (3).pdf` to the local Downloads folder.
5. Switched the same selector to DOCX and exported again. The app announced
   `DOCX download requested. Check your downloads.` and the browser wrote
   `Alex_Morgan_ATS_Friendly_Resume (2).docx` to the local Downloads folder.

## Artifact checks

- PDF: 59,737 bytes, one page, `%PDF-` signature, and extracted text retained
  the synthetic name, role, and email.
- DOCX: 9,312 bytes, valid ZIP package, and `word/document.xml` retained the
  synthetic name, role, and email.
- The CUA download-event helper timed out even though the filesystem and app
  feedback proved delivery; treat the event API limitation separately from the
  browser's observed file output.

## Limits

- This proves the local synthetic browser journey for one saved resume and the
  desktop quick-preview path only.
- It does not prove every template, device width, browser family, writing
  system, or production account path. Those remain separate release gates.
