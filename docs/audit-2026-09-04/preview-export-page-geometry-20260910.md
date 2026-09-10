# Preview/export page geometry follow-up — 2026-09-10

## Finding

The standalone resume preview previously declared an A4 canvas (`21cm` and
`1 / 1.414`) while the text-native PDF renderer emits US Letter (`612 x 792pt`).
That made the on-screen page shape disagree with the file the user downloads.

## Local remediation

- Added the shared `RESUME_PAGE_WIDTH` and `RESUME_PAGE_ASPECT_RATIO` tokens in
  `src/utils/resumePageGeometry.js`.
- Updated the standalone preview, desktop builder preview, and mobile builder
  preview to use US Letter (`8.5in` and `8.5 / 11`).
- Added a route-lifecycle regression proving the standalone preview exposes the
  Letter geometry.

## Current-run evidence

- Synthetic local account: `Alex Morgan` / `Product Designer`.
- CUA browser opened `/preview/22222222-2222-4222-8222-222222222222` and
  rendered the saved resume without an error or loading state.
- The same synthetic resume was exported from the builder as
  `Alex_Morgan_ATS_Friendly_Resume (4).pdf` (59,737 bytes); Poppler rendered
  the first page and the output was visually inspected at:
  `playwright-audit/resume-exports/current-template-audit/ats-friendly-pdf.png`.
- The builder preview exposed `Resume Preview`, the PDF format control, Export,
  Fullscreen, and the saved candidate content in the same local run.

## Limits

This verifies page geometry and the local synthetic journey. It does not prove
pixel-perfect typography or section spacing across all five templates, DOCX
Word-renderer versions, physical devices, screen readers, or a managed Edge
runtime. The provider deployment gate remains separately blocked by Vercel's
free-plan daily deployment quota.
