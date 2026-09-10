# Template export comparison — 2026-09-10

Fresh PDF renders were generated from the shared production text renderer for
all five shipped template IDs using one synthetic multilingual resume. Each
render was one Letter page and was rasterized with Poppler for visual review.

## Observed output

- `basic`: centered identity block, conventional title case headings, and light
  section rules.
- `ats-friendly`: the same single-column structure with the intentional
  `Professional Experience` and `Core Competencies` labels.
- `minimalist`: left-aligned identity block, uppercase headings, and no section
  rules.
- `traditional`: centered uppercase identity block, uppercase headings, and
  strong double rules.
- `modern`: left-aligned blue identity/headings, pale blue header band, and
  blue section rules.

The five output files and first-page PNGs are local audit artifacts under the
ignored `playwright-audit/resume-exports/template-comparison/` directory.
Extracted text retained the synthetic Georgian skill and all tested contact,
role, education, certification, and project facts.

## Finding and limit

The renderer now has explicit, inspectable style mappings for every template;
there was no missing template ID or blank output in this run. The output is
deliberately text-native rather than a pixel clone of the CSS preview, so exact
preview/export parity, page-size controls, and broader writing-system coverage
remain separate product gates.

## Label-fidelity follow-up

The subsequent export-fidelity pass corrected the remaining section-name drift:

- `ats-friendly` now emits `Certifications & Licenses` and `Additional Projects`,
  matching its on-screen template.
- `minimalist` now emits `Summary` and `Experience` before the existing uppercase
  styling, matching its on-screen template instead of inheriting the generic
  `Professional Summary` and `Work Experience` labels.

Fresh first-page renders for all five templates were generated and inspected
under the ignored `playwright-audit/resume-exports/template-label-audit/`
directory. The focused export suite passed 8/8, including the new mappings.

The same pass found one remaining ATS-friendly ordering drift: the preview puts
Core Competencies before Professional Experience, while the shared text/PDF
renderer emitted skills after education. The renderer now moves the ATS-friendly
skills block before experience (the other four templates retain their existing
order), with a regression assertion in the export suite.
