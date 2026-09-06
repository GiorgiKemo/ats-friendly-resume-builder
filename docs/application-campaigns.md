# Application campaigns — implementation and validation

The initial campaign release replaces repeated per-job resume selection with one
explicit approval for a saved revision and a bounded browser session. Existing
standalone Autofill remains available without automatic submission.

## Implemented

- Campaign controls: prepare/submit mode, explicit consent, daily attempt limit,
  pause/resume, revision-bound session PDF reuse, discovery when no links exist.
- Queue: identity-preserving deduplication, retained completed/review history,
  individual exceptions, original-tab reopening, explicit retries, serialized
  queue advancement and submission authorization.
- Answers: reusable exact-question answers with optional hostname scope in the
  career profile, and employer-scoped batch answers from the attention list.
  Profile saves retain optimistic concurrency and account guards.
- Forms: existing shared field engine plus verified step advancement, required
  field validation, placeholder-aware selects, option-free question extraction,
  suppression of repeated identical file attachment, and confirmation checks.
- Recovery: persistent pre-submit checkpoint, no automatic repeat of an uncertain
  submission, alarm-driven detection of interrupted jobs, expiry and account reset.

## Validation evidence

Latest local verification (September 7, 2026): 1,078 automated tests passed;
ESLint, TypeScript, Supabase function checks, website production build, and
extension package build passed. The website passed 27 route smoke checks and
13 interactive scenarios, including mobile overflow, resume export, profile
persistence, campaign consent, saved answers and interrupted search history.
The isolated website scenarios and combined campaign test reported no browser
console warnings, console errors or uncaught page errors.

The packaged Chromium regression passed popup, side panel, widget, native and
custom controls, embedded forms and resume handoff checks. The standalone
campaign scenario verified one PDF preparation and one confirmed submission
while retaining an unanswered application. The combined real React website and
packaged extension scenario confirmed both fixture applications, including PDF
uploads, a native dropdown, a multi-step form, and saving then retrying a missing
answer through the website.
These results do not establish compatibility with every employer website.

Automated runtime tests exercise the actual extension code with isolated services:
account changes, concurrent submit requests, parallel queue wakeups, interruption,
limits, deduplication, PDF reuse, sensitive/invalid fields, explicit pauses, and
profile conflicts. The existing regression suite remains required.

`tests/playwright/campaign-qa.mjs` loads the production Chromium extension package
in a disposable browser. Employer pages and upload/receipt endpoints are served
locally. A test-only secure-origin flag enables browser crypto on that loopback
HTTP fixture; shipped extension settings are unchanged. The scenario verifies
one blocked application does not stop the next, actual PDF bytes reach the upload
endpoint, a saved answer selects a native dropdown, and a multi-step application
is submitted exactly once with an employer confirmation.

`tests/playwright/fixture-website-qa.mjs --campaign-only` exercises the real React
profile persistence and campaign controls, desktop/mobile layout, and an isolated
extension bridge. This is separate from the packaged runtime test, and does not
prove a production Supabase deployment or an employer integration.

`node tests/playwright/campaign-qa.mjs --real-app` builds and serves the real
website against a disposable backend, loads the packaged extension, and drives
campaign controls through the UI. Only the backend and employer endpoints are
fixtures; the website-to-extension bridge and PDF rendering are real. AI responses
are fixtures and do not establish live AI availability or answer accuracy.

## Issues corrected during QA

- The website's PING handshake was absent from the extension bridge allowlist,
  preventing campaign start even when the status card showed a connected agent.
- Opening the extension popup or side panel as a tab incorrectly failed sender
  validation. Exact own-extension URLs are now accepted only in the top frame.
- The dashboard entrance animation caused transient horizontal mobile overflow.
- A mobile campaign option was clipped, and installation guidance named the
  source folder instead of the generated extension package.
- Search requests could wait indefinitely and provider failures looked like
  empty results. Search and AI requests now have deadlines, discovery stops
  adding work after its processing budget, and provider fallback remains usable.
- Failure to persist a completed run previously returned success. Run updates
  are checked, and expired running records display an interrupted state.

## Live evidence and outstanding verification

The September 7, 2026 release was pushed to `main` and verified on the production
aliases. Supabase `auto-apply-run` was deployed, and the existing atomic quota
migration `20260904125121` was applied after a rollback rehearsal. The required
service-only RPC permissions were verified against production.

A separate synthetic QA account exercised real production authentication, resume
creation and persistence, all five template controls, PDF and DOCX downloads,
ATS scoring, career profile answers, application creation/editing/filtering,
AI generation and wording review, Quick Resume generation/export/tracking,
mobile navigation and theme switching. No real user's resume was overwritten.
Discovery completed with ten provider results and five queued real job links;
no employer application was sent by that run.

Live QA found and repaired a Google Analytics CSP violation and missing AI CORS
request headers. Both AI proxies were deployed and actual generation subsequently
completed. Further fixes normalize Gmail's table-valued connection RPC, refresh
discovery history after rejected requests, preserve technical job-title suffixes,
and prefer employer metadata over prose guesses. Regression coverage: 1,083 tests
passed, plus lint, production build, extension build and Edge Function checks.
The production route smoke covered 27 public/protected paths without console
errors after the CSP fix. This is broad coverage, not proof of every possible
button state, third-party integration or employer form.

The packaged extension detected actual roles on Bitpanda's Greenhouse page,
Vezert and Datamundi's BambooHR page. Greenhouse and BambooHR emitted the same
console warnings and page errors in baseline browsers without the extension.
Vezert was clean in both browsers. This checks page detection, not form completion.

The packaged extension connected to production in the dedicated QA browser.
Profile sync, the real Greenhouse job handoff, exact saved-version preview and
selection reached the extension successfully. Synthetic resumes were not sent to
real employers. Upload, dropdown and final-submission behavior has fixture proof,
not a real employer receipt. The user's everyday Chrome still needs the updated
unpacked `dist-extension` reloaded; a website deployment cannot update it.

Real payment checkout, Gmail OAuth/reply scanning and a real employer submission
remain unverified. Local evidence is under the Git-ignored `output/playwright/`
directory, including route logs, live evidence, downloaded documents and mobile
screenshots. The access token and QA credentials are kept only in ignored local
environment files, never in this document or Git.

## Remaining compatibility work

This is a bounded first release, not a universal application robot. The next
iterations need real-browser fixtures and targeted adapters for repeated work and
education sections, dynamic location controls, embedded upload widgets, SPA and
cross-document ATS navigation, then a constrained visual fallback. Each adapter
needs a verified completion rate and intervention count, rather than a claim of
support based only on detecting its provider hostname.

Assessments, new account verification, CAPTCHA, consent and sensitive questions
continue to use explicit user handoff. Background cloud browsers and an extension
store distribution/update pipeline are separate product work. No real employer
applications are submitted by these tests.
