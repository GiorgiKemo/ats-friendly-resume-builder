# Headline export verification

The actual application PDF and DOCX builders preserve the repaired headline behavior in three synthetic fixtures. All six outputs passed text checks and visual inspection of every rendered page. No production source was changed for this verification.

| Fixture | Expected visible headline | PDF | DOCX |
| --- | --- | --- | --- |
| Source Intern targeting CEO | Target role: CEO | Pass, one page | Pass, one page |
| User-edited headline | Operations specialist pursuing leadership | Pass, one page | Pass, one page |
| Blank headline with misleading root title/jobTitle metadata | No headline | Pass, one page | Pass, one page |

Each output retains the Intern role, Cedar Studio employer, supplied dates, education, skills, and project. The blank fixture contains neither CEO nor the misleading root metadata in visible document content. Inspection found no clipping, overlap, missing glyphs, or unintended blank pages in these six pages.

## Method and local evidence

The ignored directory `playwright-audit/headline-exports/` contains the fixtures, PDF/DOCX files, all page PNGs, extraction results, and reproducible scripts:

- `create-fixtures.mjs` invokes the actual `buildTextPdf` with the bundled application font and `createResumeDocxDocument` with the application's installed package versions. It does not substitute a separate layout builder.
- `verify-fixtures.py` checks PDF text, `word/document.xml`, and text extracted from the independently rendered DOCX PDFs. Machine-readable results are in `verification-results.json`.
- App PDFs were rasterized with bundled Poppler. DOCX files were rendered with the canonical Documents skill `render_docx.py` and installed LibreOffice, then every page PNG was inspected at original resolution.
- PDF and Documents creation markers each ran successfully once immediately before authoring, with three expected outputs per format.

## Limits

This verifies local generation, content, and rendering for the three fixtures, not browser download delivery or Microsoft Word's native layout engine. No AI provider, database, Storage upload, or external service was called. Current formats differ: the PDF renderer uses US Letter, while this DOCX template renders as A4 with a different section order. No page-size or design change was made in this bounded headline check.
