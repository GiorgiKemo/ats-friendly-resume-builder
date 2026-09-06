# Job metadata: source headers, ranges and uncertainty

Audit date: 2026-09-04. This is a deterministic extraction repair, not a claim of
general language understanding or verified job-posting truth.

## Confirmed defects and changes

The original parser promoted body references into role metadata. A Product
Designer posting that mentioned engineering, customer support and reporting to a
director received a long prose title, a different role category and executive
seniority. It also selected the largest experience number anywhere in a posting,
including preferred qualifications and the upper endpoint of a range.

The repair:

- Prioritizes actual labeled/leading role headers. Incidental phrases such as
  “describe your previous role:” cannot override the target role.
- Classifies role/seniority from the role itself, not collaborators or reporting
  lines in the body. Unknown experience remains unknown rather than defaulting to
  mid-level. Account Executive and Executive Assistant are not executive-level
  merely because their names contain that word; years alone do not imply it.
- Separates employers from headers while preserving C++, .NET and department
  qualifiers such as “Senior Software Engineer - Backend.”
- Stops treating tools mentioned after “with” as employers, and ordinary
  comma-separated prose as locations. The weaker downstream company fallback in
  resume titles was removed too, so it cannot reintroduce the same error.
- Distinguishes required from preferred sections, including indented/bulleted
  headings. A required 3–5-year range stays 3–5 years instead of 5+ or a larger
  preferred number. “No experience required” remains zero.
- Preserves numeric qualifiers such as “At least,” “Up to” and “More than.” Upper
  or exclusive bounds are not exposed as an inclusive minimum. Different scoped
  requirements are left uncollapsed instead of inventing one minimum.
- Uses one experience formatter in both user interfaces and provider prompts;
  callers no longer append an unsupported plus sign or mandatory-year claim.
- Returns independent nested defaults so one caller cannot mutate a later empty
  parse result.

## Browser journey

1. **Paste a role with incidental team/reporting terms — corrected.** The same
   synthetic Product Designer paragraph was inspected before and after at the
   same desktop viewport/theme. Title now reads Product Designer, employer Cedar
   Studio, and unspecified seniority is shown as Not specified. The candidate's
   separate career-level selection is not overwritten.
2. **Paste required and preferred experience — corrected.** A Software Engineer
   posting with required 3–5 years and preferred 8+ years displays 3–5 years. No
   generation, payment or resume save is needed to inspect this preview.
3. **Use the narrow layout — tested.** At 390 × 844 the metadata and controls
   wrap within the document; measured document width was 375 CSS pixels including
   the browser's scrollbar space. This is a reflow check, not a WCAG certification.

![Original incorrect job metadata](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/55-job-metadata-before.png)

![Corrected metadata for the same posting](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/56-job-metadata-after.png)

![Required range retained on mobile](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/57-job-experience-mobile.png)

The before/after screenshots were inspected together. A development-server module
replacement briefly left the tab blank during implementation; a clean reload
restored the same synthetic session and saved source form. That transient blank
screen was rejected as acceptance evidence.

## Regression evidence and limits

An independent initial corpus reproduced 23 failures out of 25 before edits.
Follow-up adversarial probes expanded this to **48 parser/formatter tests**, all
passing without weakening the original cases. Six actual resume-title tests and
eight bundled generation-source/prompt tests verify that corrected values reach
downstream labels and requests. The combined focused run with both UI lifecycle
suites passed **96 tests**. See the main ledger for final repository-wide counts.

The parser remains heuristic. Unknown occupations, unusual layouts, multiple
scoped requirements, multilingual prose and ambiguous employer/location text may
remain unspecified. It does not certify the source, extract every job constraint,
or prove the AI will obey the prompt. These changes do not resolve the separate
11 unsafe-proposal cases in the factual-tailoring diagnostic. Raw job text remains
available for the user's review; candidate career evidence is not rewritten from
these detected job requirements.
