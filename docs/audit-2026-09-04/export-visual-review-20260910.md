# Resume export browser and visual review

Date: 2026-09-10

## Scope

This pass exercised the authenticated local QA fixture through a real browser
download flow for both supported resume formats. It also rendered the PDF
output for each of the five selectable templates with Poppler for visual
inspection.

## Evidence

- `npm run test:website:full` passed all 16 fixture steps with no page errors,
  console warnings/errors, blocked requests, or fixture failures.
- `npm run test:website:ai` passed the premium AI runtime path: the builder's
  lazy-loaded generator rendered, the synthetic provider proxy returned a
  review proposal, and the review screen accepted the keep-originals action
  with no page errors, console warnings/errors, or blocked requests.
- The `saved-resume-load-and-export` step downloaded both
  `Alex_Morgan_ATS_Friendly_Resume.docx` and
  `Alex_Morgan_ATS_Friendly_Resume.pdf` and checked their magic bytes (`PK` and
  `%PDF-`).
- The downloaded PDF is a one-page US Letter document produced by jsPDF. Its
  rendered page was inspected at 120 DPI; headings, dividers, contact wrapping,
  bullets, dates, and project content remained visible without clipping or
  overlap.
- The text-native PDF renderer was generated and inspected for `basic`,
  `ats-friendly`, `minimalist`, `traditional`, and `modern`. Each preserved its
  intended section order and style treatment; the ATS-friendly variant kept
  competencies before experience, and the modern variant kept its blue header
  band and section rules.
- The PDF text layer was independently extracted with `pypdf`; bullet lines
  remained separate and all visible sections were present.

## Remaining limitation

The browser download journey is now covered locally, but production export
delivery still requires the latest frontend deployment. The PDF renderer is
intentionally text-native and therefore is not an exact pixel copy of every
on-screen template; DOCX remains the editable fallback when an employer needs
that format or a PDF glyph is unsupported.
