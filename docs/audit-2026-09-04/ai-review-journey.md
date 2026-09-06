# AI wording review: browser and lifecycle evidence

Audit date: 2026-09-04. Local synthetic data only. No paid AI request, employer
submission, production write or deployment was made.

## Outcome

Both active generation flows now separate source content from proposed wording.
Generation alone cannot save, preview or export an AI proposal as a finished
resume. Each changed prose field needs an explicit original, suggested or edited
choice. High-consequence proposals also show the detected claim-risk signal and
require an explicit accuracy confirmation before completion. Choosing a
suggestion is **not** factual verification.

The service constructs the source baseline separately from guarded proposals;
model publication flags, ownership fields and forged approval metadata do not
enter the baseline. Each review has a unique identity, and decisions for another
review are rejected even when field IDs match. Shared persistence, export and
browser-profile boundaries reject unresolved review envelopes before mapping.

The historical post-guard semantic benchmark remains preserved as evidence: 11
unsupported proposals survived before the new gate. In the current review-boundary
check, none of the 23 unsupported probes enters source-only output or the default
resolver path, and all seven faithful controls remain usable after an explicit
choice. A user can still confirm a flagged proposal after checking it. See the
[independent evaluation](factual-tailoring-review-boundary.md); these measurements
must not be described as a model hallucination rate or a truth guarantee.

## In-app browser checks

Used the local Vite preview and loopback-only fixture with `QA_PREMIUM=1` and
`QA_AI_REVIEW=1`. The opt-in fixture stubs AI responses; it does not fall through
to a real provider. Its in-memory seed was reset before this journey.

| Check | Observed result |
| --- | --- |
| Enhanced generation | Two changed fields appeared with nothing selected; Save reviewed resume was disabled. |
| No automatic save | Navigating to the dashboard still showed the one seed resume. |
| Explicit choices | Kept the original summary and entered custom work wording. |
| Route recovery | Dashboard roundtrip retained the exact custom text and both selected choices. |
| Mobile review | At 390 × 844, both themes wrapped original/proposed text and controls; no horizontal document overflow. |
| Enhanced save | Explicit save added one resume. Reopened editor and preview showed the original summary and exact custom work text. |
| Quick generation | Two unselected changes appeared; preview was disabled, with no export/save actions exposed. |
| Mixed choices | Accepted the summary suggestion, then kept originals for remaining changes; this preserved the already-chosen summary. |
| Reviewed preview | Only then did template, DOCX/PDF and Save & Track actions appear. |
| Quick route recovery | Minimalist template, chosen summary and original work text survived a dashboard roundtrip; dashboard still contained only two saved resumes. |
| Explicit tracking | Save & Track created a third resume and a Cedar Studio record marked Saved. The action disabled as Saved to tracker and explicitly said no application was submitted. |

Contact email/phone were omitted from browser-tool text snapshots while screenshots
showed the real synthetic values. This was not an application data-loss bug.
Actual component regressions also verify loaded contacts and unrelated edits.

## Lifecycle and failure coverage

Controlled component/service tests exercise delayed generation, route departure,
account replacement, pending save remounts, partial tracking failures and exact
export payloads. Account/run-bound memory preserves in-progress work across SPA
navigation and rejects late results after sign-out. Save receipts reach the
currently mounted screen before completed review records are cleared; retries
reuse an accepted resume instead of creating a second one after tracking fails.

Already-generated work remains accessible while the subscription refreshes or
after Premium expires. Separate handler/UI guards still block a new generation;
expiry regressions confirm that retrieving existing output does not issue another
AI request.

This memory is not durable storage. Reload, tab closure and sign-out discard
unfinished reviews; the UI discloses this and installs a before-unload warning.
Native warning acceptance/cancellation was not certified in this in-app browser.
There is no permanent database record of individual wording choices, no automatic
merge with later profile edits, and no retroactive certification of older resumes.

Formatting no longer silently turns duties into accomplishments, removes caveats,
or truncates long source prose. Exact edited text, including intentional blank
descriptions, stays consistent across legacy aliases. Actual PDF/DOCX tests also
preserve negative values such as `-20%` instead of deleting their sign.

The review resolver now classifies a bounded set of high-consequence wording
signals (seniority/management, claim scale, tools, affiliations, credentials,
proficiency, negation and number context). Seven adversarial proposals are
flagged in the synthetic corpus. The component test confirms that a flagged
suggestion cannot complete until its accuracy checkbox is checked; a direct
resolver call without that confirmation falls back to the captured original.

## Extension boundary and remaining acceptance

The extension cannot collect this per-field review yet. Its prepare action now
stops **before** paid generation and directs the user to import the job, review
and save in-app, then select that saved resume. Existing source-only saved-resume
sync remains available. This is a disclosed limitation, not a completed integrated
extension-review experience.

Follow-up inspection found that the guidance above does not complete attachment:
the popup has no saved-resume picker, and ordinary Autofill can still re-enter
blocked preparation. The [extension handoff contract](extension-review-handoff.md)
records this confirmed gap and its full acceptance requirements. The in-app
review/save journey was tested; the proposed extension workaround was not.

Browser download delivery, real installed-extension permissions, actual model
quality, employer ATS parsing, managed staging, screen-reader/physical-device
accessibility and representative usability remain separate acceptance gates.
No guarantee of hiring outcomes or universal ATS compatibility is established.

## Captured evidence

- `48-ai-tailoring-before.png`: original generator opening and overstated claims.
- `49-ai-review-dark-desktop.png`: explicit source-linked review boundary.
- `50-ai-review-dark-mobile.png` and `51-ai-review-light-mobile.png`: same review
  position at the same narrow viewport, inspected together across themes.
- `52-quick-source-before-review.png` and `53-quick-contact-input-check.png`:
  synthetic Quick source step and visual contact-value confirmation.
- `54-ai-tailoring-after.png`: revised empty generator opening, compared with
  the original at the same desktop viewport and theme. The actual job input is
  now visible where the old oversized assurance panel occupied the screen.

Screenshots are supplementary evidence, not substitutes for the interaction and
controlled failure checks above. Full verification counts live in the
[audit ledger](README.md#verification-ledger-and-release-gates).
