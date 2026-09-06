# ResumeATS takeover audit

Audit date: 2026-09-04. Status: local remediation pass verified; release and
best-in-class acceptance gates remain open.

## Verdict

The project has a useful product foundation, but the original implementation was
not ready to be described as best-in-class. The most serious problems were not
visual: it could invent candidate facts, lose edits, mix account state, silently
damage exports, misreport integration success, and mishandle concurrent usage.
The audit prioritizes correcting those failures before expanding the feature set.

Changes in this workspace are local. Nothing has been committed, pushed, deployed,
purchased, or sent to employers. Browser checks use synthetic loopback-only data,
not production accounts. Real provider and deployed-schema verification remain
separate release gates.

## Scope and evidence

| Area | Evidence obtained | Limits |
| --- | --- | --- |
| Architecture and dependencies | Vite/React routes, shared components, service boundaries, build, lint, dependency audit, CI and test scripts | No production traffic or field-performance measurements |
| Candidate data and editing | Actual context and SDK/HTTP tests; per-tab recovery; browser stale-save/copy; PostgreSQL revision compare-and-save | Managed multi-device tests, automatic text merge and full version history remain unverified or unimplemented |
| AI and ATS | Source-preservation tests, actual generation-pipeline adversarial corpus, explicit per-field review, high-risk confirmation gate, both in-app review/save journeys | Seven synthetic high-risk proposals require confirmation; no paid-model or employer-ATS validation; review is not fact verification |
| PDF and DOCX | Actual builders, document rendering, text extraction, Unicode and long-resume fixtures; version-bound auto-apply attachment package | Browser download filesystem delivery, universal script/template support and managed Edge static-file packaging remain unverified |
| Backend and billing | Actual handler tests; all 37 application migrations replayed from empty PostgreSQL 17 with Supabase-managed schema scaffold; 17 SQL concurrency/ownership/storage groups, 7 resume-versioning, 6 profile proof groups, 1 atomic public-engagement claim group and 1 durable Gmail budget group | Managed Supabase PostgreSQL 15/Auth/Storage HTTP, existing-deployment upgrade and live Stripe/Gmail journeys remain unverified |
| UX and accessibility | In-app browser, desktop and 390px mobile, both themes, native controls, focus and validation checks, rendered React tests | No screen-reader certification, full WCAG audit, or physical iOS/Android testing |
| Browser extension | Chrome/Firefox package builds; actual entry-navigation, submit safety, bridge handshake and delayed-storage/account-race tests | No actual job submissions or real-browser extension permission audit |

## High-impact repairs

- Preserve source dates, names, contact links, technical skills and career evidence.
  Remove random timeline changes and invented years of experience.
- Reject rewrites containing unsupported literal numeric claims, retaining source
  wording instead. This does not validate semantic truth, arbitrary quantity
  forms, or whether an existing number has been assigned the correct meaning.
- Bind repeated-role rewrites to unambiguous source records, exclude structured
  metadata from achievement-number evidence, preserve blank source descriptions,
  and accept equivalent percent notation. The unchanged adversarial benchmark
  initially improved from 15/30 to 19/30 passes. A further literal-quantity pass
  covers explicit English number words/units, Japanese duration compounds, signs,
  bounds, ranges, fractions and currency/scale identity. The same corpus now has
  **23/30 passes** before the review risk gate, with all seven faithful controls
  preserved. The current default resolver is **30/30** on the same corpus: seven
  high-risk proposals are flagged and cannot materialize without an accuracy
  confirmation. Long-input scanner regressions are isolated in terminable workers;
  returned source and proposal text remain exact.
  See the [factual-tailoring evidence](factual-tailoring-benchmark.md).
- Separate source-only resumes from AI wording proposals. Require an explicit
  choice for every changed prose field before saving or exporting; bind choices
  to a unique review and reject unresolved envelopes at shared sinks. Both active
  flows preserve exact choices in account-scoped memory across page navigation.
  The seven synthetic high-risk proposals remain visible for user verification,
  but are not silently approved output. See [review-boundary evaluation](factual-tailoring-review-boundary.md)
  and [browser journey](ai-review-journey.md).
- Remove meaning-changing deterministic prose rewrites and silent truncation.
  Preserve caveats and exact chosen text, including empty edits across aliases;
  retain negative values such as `-20%` in actual PDF/DOCX and preview output.
- Correct job metadata: body references no longer override role headers, preferred
  experience no longer becomes mandatory, and ranges/qualifiers survive UI and
  prompt formatting. Remove a downstream fallback that mislabeled tools as employers.
  See [job metadata evidence](job-metadata.md).
- Keep the candidate's career preference separate from target-job seniority in
  both generators. Use a neutral default, preserve existing choices and remove
  year thresholds from responsibility labels. The prompt cannot treat a wording
  preference as tenure or authority evidence. Extension fit advice no longer
  converts the number of work records into years. See the
  [candidate evidence pass](candidate-evidence-pass.md).
- Stop the hidden-generation worker's unbounded ping/pong feedback loop. Only
  timer heartbeats initiate exchanges; cleanup stops workers and revokes their
  Blob URLs. Runtime message-count tests verify this, not a real-device CPU claim.
- Label a different explicit target as a target, never as an already-held title.
  Preserve manual and blank resume headlines, display the same field in all five
  templates, and keep contact readiness independent of this optional field.
  Share one conservative vacancy-experience parser between the app and extension;
  ambiguous scopes and company history do not become candidate requirements.
  See the [headline and requirements pass](headline-requirements-pass.md).
- Put fullscreen preview controls in a native modal top layer so the app header
  cannot intercept Exit. Restore focus and scrolling on close, and show export
  status inside the modal. Messages distinguish a download request from confirmed
  filesystem delivery; the latter remains unverified.
- Make auto-apply attachments trustworthy: use one authenticated, immutable
  saved-resume revision for cover-letter context and Gmail PDF bytes; embed the
  shared Unicode font, reject invalid/oversized output and pending review packets,
  fail before discovery when outreach has no saved resume, and revalidate the
  revision before provider dispatch. Existing legacy Storage objects are not
  deleted; packaged-runtime and provider journeys still require approved staging.
- Enforce production mode before Vite resolves local environment files; reject
  development-mode release builds. A follow-up build audit found that the former
  successful build still contained development React. Actual rendered-module and
  compiled-branch regressions now cover that gap without changing the user's `.env`.
- Remove the catch-all vendor chunk that pulled PDF/Word transitive dependencies
  into initial loading. At the fullscreen-preview checkpoint, initial JavaScript
  is 676,463 raw bytes versus 1,103,963 originally, and 202,400 versus 333,690 gzip
  bytes (39.34% less gzip). Separate snapshots preserve the cost of each follow-up;
  removing the legacy PDF writers saved 952 gzip bytes across all JavaScript while
  leaving the initial graph effectively unchanged. Default lazy-import
  preloading remains intact for explicit exports. This is not a Core Web Vitals
  or real-device speed measurement. See [production loading](production-loading.md).
- Reject same-prefix job URL collisions and unrelated cached facts after a failed
  fresh capture. `/jobs/1` is not `/jobs/10`; changed apply routes require a fresh
  capture.
- Add an explicit job-bound saved-resume chooser, exact revision/content preview,
  and session-only PDF handoff. Saved selection is free and does not generate or
  change a resume. Autofill separately confirms sharing; missing or mismatched
  selections block filling, while queue completion never starts a run. Preserve
  unfinished AI review and require confirmation before replacing form job details.
  See [extension selection evidence and remaining browser gates](extension-selection-implementation.md).
- Serialize resume saves, protect newer edits, retain recoverable drafts on failure,
  and reject stale responses after account or resume changes.
- Enforce expected revisions in an atomic database save. Sixteen concurrent writes
  from one revision produce one winner and fifteen conflicts, with stale payloads
  leaving metadata and content unchanged. Prevent legacy RPC and direct-write bypasses.
- Isolate each tab's recovery draft, fork duplicated-tab pointers before writing,
  and use revisions rather than device clocks to decide whether recovery can save.
  Conflicts pause saving and offer an explicit separate copy or confirmed reload.
- Preserve typing during reload and copy requests, restore the editing branch after
  failed loads, and cancel obsolete autosave timers on every edit. A timer also
  rechecks the saved preference before starting, so turning autosave off takes effect.
- Keep dirty or conflicted preview PDF downloads local-only so they do not replace
  the saved resume's optional cloud PDF. Keep the editor visible during save failures.
- Make every ordinary PDF download local-only, including a clean saved resume.
  Remove the unused cloud-upload API and make profile sync document-free even for
  obsolete callers. Strip old document metadata at extension cache read/write/
  disclosure boundaries without touching the revision-bound selected-resume
  artifact. Existing unversioned cache objects are not trusted or deleted. The
  auto-apply email path now uses the authenticated version-bound renderer and
  fails closed on missing/stale snapshots. See [containment evidence](legacy-pdf-containment.md).
- Protect profile, AI generation, new-resume and preview routes against stale
  callbacks. Quick Resume now includes the saved career evidence, blocks empty
  source generation, and records a prepared job as Saved rather than Applied.
- Apply version-checked saves to profiles too. Keep unfinished profile entries
  and newer typing in account-scoped memory across in-app navigation; block Save
  until Add/Update or Discard resolves pending entries. Own save acknowledgments
  update reopened editors without rebasing them onto an unrelated server revision.
  Conflicts keep local details visible and require explicit replacement.
- Remount account-owned providers and screens when the account identity changes,
  immediately remove prior-account notifications, and retain drafts on same-account
  token refresh. In-app cross-tab sign-out returns the other private screen to sign-in.
- Bind password changes to the initiating, verified session token. Isolated tests
  with the installed Auth SDK reproduced wrong-account mutation and subsequent
  wrong-account sign-out races; the replacement avoids both shared-session operations.
- Bind PDF storage and all four export entry points to the initiating account;
  stale imports, notifications and follow-up work do not leak into a later session.
- Keep complete achievements and supported Unicode in PDF/DOCX. Unsupported PDF
  glyphs produce explicit guidance instead of silent character deletion.
- Make administrator membership authoritative in the database, harden external URL
  fetching and email construction, and stop reporting fake integration success.
- Introduce atomic monthly AI allowances and durable auto-apply run/daily budgets.
- Expose the complete Auto-Apply matching contract in Settings (skills, experience
  level, salary bounds, industries, excluded companies and matching speed), and
  enforce salary overlap plus speed thresholds in the server discovery path.
- Restore missing core schema/RPC definitions from repository history, enforce
  core-data ownership and private resume storage, and verify fresh migration replay.
- Require manual review for ambiguous Apply controls, sensitive unanswered fields,
  low-confidence autofill and inaccessible frames. Bind extension profile/queue
  writes to an authenticated account even during logout and delayed storage writes.
- Correct application edits, timestamp transitions, resume linking, pagination,
  metric denominators, misleading activity labels and chart rendering.
- Replace duplicated authentication forms, nested interactive links, random field
  IDs and misleading tooltip labels with consistent native semantics.
- Compact the editor and mobile profile setup, expose application insights in
  navigation, restore focus after menu dismissal and respect reduced-motion settings.
- Remove unsupported testimonial content and literal ATS-outcome guarantees; explain
  that checklist scores are guidance and AI must be grounded in real experience.
- Upgrade vulnerable dependencies and make browser QA default to isolated fixtures;
  remove purchase automation from the legacy live test workflow.
- Repair the production billing-management entry point without pretending that
  opening a portal cancels a plan. Preserve support drafts and persistent errors;
  fix guide anchor navigation and FAQ expansion identity during filtering.
- Default anonymous CSP report persistence to off. Opt-in requires operator-owned
  ingress limits and retention; accepted reports are bounded and stripped of URL
  credentials, query strings, fragments, policy bodies and script samples.
- Remove recovery tokens and URL credentials from error telemetry at both client
  and server boundaries, including URLs embedded in nested context and stack text.
  This is URL-token protection, not arbitrary secret scrubbing or PII anonymization.

The final combined verification below passes for the local remediation changes.
Unit/component success does not stand in for provider, deployment or real-browser
extension tests, and does not establish that every possible defect has been removed.

## Browser journey

1. **Landing and plan selection — improved; billing unverified.** The homepage now
   explains the actual workflow. Monthly/yearly toggles update price and period;
   annual savings arithmetic is correct. The premium signup button opens signup
   without initiating payment. Plan intent is not visibly carried through onboarding.
2. **Signup and sign-in — locally healthy.** Each page now contains one form, with
   unique labels and autocomplete hints. Empty sign-in focuses the required email
   field. Synthetic sign-in and logout work. Email confirmation/recovery delivery
   has not been exercised with a real provider. Reset requests use a non-enumerating
   confirmation and persistent errors; password setup catches bootstrap failures,
   prevents duplicate submissions and suppresses obsolete account/page callbacks.
3. **Dashboard and resume editor — improved.** A saved synthetic resume opens,
   a changed target title saves and survives reload. The large duplicate status
   panels have been reduced. Native mobile section selection and bottom disclosure
   work; Escape restores focus. An earlier synthetic fixture save had lost its role
   before the alias repairs. Current fresh-seed tests preserve it; restoring the
   known seed title through the UI now saves/reopens correctly and marks Work
   History ready. Missing historical facts are not guessed or reconstructed.
   Two actual in-app tabs were then edited from the same saved revision: the first
   saved, the second displayed a conflict and kept its text. Saving the second as a
   copy opened a new ID; the original remained unchanged. The copy's switcher label
   was corrected after this check. Recovery controls fit the 390px light/dark layout
   with 48px and 50px action heights and no horizontal document overflow.
   The native reload-confirmation click stalled in-app browser control, so browser
   confirmation acceptance/cancellation is not certified; isolated callback and
   HTTP tests cover the reload paths. See [conflict recovery](conflict-recovery.md).
   The editor still warrants task-based usability tests.
4. **Profile foundation — improved; focused lifecycle checks pass.** Contact
   fields appear much sooner on mobile, with a compact section selector and truthful
   AI instructions. Work, skills and projects are editable; legacy job titles and
   descriptions are retained. Delayed loads/saves and account switches are covered.
   Entry-form changes require Add/Update before Save profile, with an actionable
   unfinished-entry panel. Drafts now survive section changes and in-app route
   navigation, but not full reload, tab closure or sign-out; this is disclosed.
   Two synthetic tabs verified stale-save rejection, retained local text, cancelled
   replacement and confirmed loading of the newer saved profile. Mobile recovery
   controls fit both themes without horizontal overflow. See [profile safety](profile-safety.md).
   Quick Resume uses this career evidence; its mobile opening removes duplicate instructions so inputs appear
   substantially earlier. Both generation paths were subsequently exercised with
   an opt-in synthetic AI response: no auto-save, explicit source-linked choices,
   route recovery, exact reviewed output, template retention and Saved-not-Applied
   tracking passed. See [AI review journey](ai-review-journey.md). No paid AI call
   was made.
5. **ATS checklist and exports — partial.** The local checker executes and explains
   its limits. PDF/DOCX builders pass document-level checks. The in-app browser did
   not provide a confirmed download event, so browser delivery is not marked passed.
   The headline/blank-field contract passes all five previews and six rendered
   PDF/DOCX fixtures. Fullscreen Exit no longer sits behind the app header; Escape
   restores focus, and both formats show an honest in-modal request status. PDF's
   text and defensive fallback geometry now use US Letter; styling, section-order
   and page-break parity with selected previews/DOCX remains an open gate. See the
   [focused browser and document evidence](headline-requirements-pass.md).
6. **Application tracker — locally healthy on tested path.** Editing a synthetic
   application updates notes and status, retains its resume link, closes the dialog,
   and returns focus to its trigger. Search sizing and mobile overflow were repaired.
7. **Application insights — improved.** The same two-record fixture shows two
   submitted applications, one screening and one interview. Response rate changes
   consistently with the status update. Zero counts no longer draw blue bars, weekly
   bars are visible, and current status is not presented as historical conversion.
8. **Auto-apply and extension — local safety improved; release gate remains.**
   Sensitive defaults, pre-review Apply clicks, stale identity/cache writes and
   content-bridge reinjection were repaired and behavior-tested. Extension PDFs use
   the shared Unicode renderer. Auto-apply mutations capture the initiating owner,
   stale wizard/provider callbacks stop, queue completion reconciliation works, and
   scan/discovery failures no longer report success. Cancellation cannot recall work
   already accepted by a server/provider. No real application or email was sent.
   Actual installed-extension and provider sandbox verification is still required.
   Follow-up inspection found that earlier saved-resume guidance was unusable:
   there was no picker, and Autofill re-entered blocked preparation. The local
   implementation now opens a frozen-job chooser in the app, previews/selects an
   exact saved version, and transports a bounded PDF through session-only storage.
   It does not silently generate or upload a default PDF. A separate Autofill action
   shares the selected version; unresolved review remains blocked. Actual-component
   browser checks and isolated bridge/handler tests do not establish installed
   Chrome/Firefox compatibility. See the [implementation evidence](extension-selection-implementation.md)
   and [acceptance contract](extension-review-handoff.md).
9. **Guide, FAQ and support — tested paths improved.** A guide tab previously
   changed the HashRouter route into a 404. Links now keep the guide route and
   navigate to a real section. Unsupported ATS adoption statistics and interview
   guarantees were removed. FAQ search no longer transfers expansion to a different
   question, and collapsed answers are actually hidden. A blocked synthetic support
   request retains all typed fields and exposes a persistent retry/support message.
10. **Subscription management — repaired; real portal unverified.** Production
    previously refused cancellation and offered no portal launch. The page now
    requests Stripe billing management, handles stale accounts and errors, and
    allows existing customers to manage billing even after premium expires.
    Local synthetic monthly-plan and failed-portal states were verified on mobile,
    including keyboard access to support and no horizontal overflow. No billing
    setting was changed.
11. **Public trust and operating policies — owner decisions required.** About-page
    biographies and credentials were inspected but not verified. Privacy promises,
    AI processing disclosures, account erasure, retention and support commitments
   need approved facts and an operational workflow. No legal-compliance claim is
    made by this audit and no unsupported business policy was invented. Historical
    telemetry was not inspected or purged; review it for prior recovery-token
    exposure and use an approved incident/retention process if exposure is confirmed.

### Accepted visual evidence

All evidence below was captured during this audit. Earlier desktop captures are
visibly softer than later desktop and mobile captures; they are not used to certify
pixel-level typography or contrast. Earlier `*-before` full-page captures may contain
offscreen animation or fixed-header artifacts and are not final acceptance evidence.

#### 1. Landing

![Landing page](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/15-home-after.png)

#### 2. Mobile signup

![Single responsive signup form](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/17-signup-mobile-after.png)

![Synthetic password reset confirmation with a compact footer](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/30-recovery-mobile-after.png)

#### 3. Mobile editor

![Compact mobile editor](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/32-editor-mobile-compact.png)

![Desktop editor with verified saved work history](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/34-editor-desktop-verified.png)

The final mobile pass places the resume switch on one line and the save action
beside its button. The first input is visible above the bottom navigation in the
tested 390px viewport; the Save + DOCX state retains a 48px button without overflow.

![Explicit recovered-draft choices](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/37-recovered-draft-controls.png)

![Mobile recovery without horizontal overflow](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/39-recovery-mobile.png)

![Recovery in dark mode](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/40-recovery-mobile-dark.png)

#### 4. Mobile profile

![Compact profile setup](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/12-profile-mobile-after.png)

![Explicit mobile profile conflict confirmation](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/46-profile-confirmation-mobile-light.png)

![Quick Resume source step with less duplicate instruction space](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/28-quick-mobile-after.png)

#### 6. Application tracker

![Application tracker](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/09-applications-after.png)

#### AI review workflow

![Generator with a compact, explicit review explanation](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/54-ai-tailoring-after.png)

![Source and suggestion choices in mobile dark mode](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/50-ai-review-dark-mobile.png)

![The same mobile review in light mode](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/51-ai-review-light-mobile.png)

The empty generator openings were compared at the same desktop viewport in dark
mode. Removing the oversized guarantee panel brings the job-description input
into the opening viewport. The mobile review images were inspected together:
text wraps, selected choices remain distinct and controls stay within the page.
Interaction and failure evidence is recorded in the [review journey](ai-review-journey.md).

#### 7. Application insights

![Corrected analytics charts](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/10-analytics-after.png)

Steps 5 and 8 have the explicitly named integration/download verification limits
above; they are not represented as fully completed journeys.

#### 9. FAQ and support recovery

![Guide navigation and evidence-based guidance](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/27-learn-after.png)

![FAQ with genuinely collapsed answers](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/19-faq-after.png)

![Support request retains its draft on failure](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/23-contact-error-after.png)

#### 10. Billing recovery

![Persistent billing error with keyboard-accessible support](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/22-billing-error-mobile.png)

#### 11. Public information pending owner verification

![About page inspected; claims are not certified](C:/Users/Administrator/Desktop/OG%20Websites/ats-friendly-resume-builder/docs/audit-2026-09-04/24-about-review.png)

The guide now distinguishes parsing from hiring outcomes using
[Greenhouse's official parsing guidance](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse).
Greenhouse describes incomplete extraction and manual correction, not a universal
automatic-rejection rule. This is provider guidance, not a certification of this app.

## What “best in the niche” must mean

Competitor feature descriptions establish a useful baseline, not proof of quality:
[Teal](https://www.tealhq.com/tools/resume-builder) advertises resume variants,
job matching and PDF/DOC exports;
[Rezi](https://www.rezi.ai/ai-resume-builder) advertises keyword guidance, scoring,
customization and PDF/DOCX export;
[Kickresume](https://www.kickresume.com/en/resume-translation/) offers resume
translation. These are vendor claims reviewed on the audit date, not hands-on
comparative tests or endorsements of their outcome guarantees.

For ResumeATS, a defensible differentiator is trustworthy tailoring with predictable
exports and application tracking. Proposed acceptance criteria:

- **No silent data loss:** automated save, recovery, account-switch and migration
  tests; explicit multi-device conflict behavior before claiming cross-device safety.
- **No invented candidate facts:** a labeled benchmark across senior, junior,
  career-change and multilingual profiles; zero unsupported identity, dates, skills
  or metrics in the required evaluation set. Human review remains necessary.
- **Predictable export:** all supported templates, long content and writing systems
  have render, text-extraction and browser-download fixtures. Unsupported combinations
  are clearly disclosed before export. Preview/export differences are resolved or named.
- **Efficient editing:** representative users can create or import, tailor, review,
  export and track a resume without assistance; measure task completion and errors.
- **Accessible interaction:** keyboard-only and screen-reader passes, visible focus,
  zoom/reflow, contrast and reduced-motion checks on actual target browsers.
- **Reliable integrations:** disposable multi-user RLS/storage tests and Stripe,
  OAuth/email, quota, retry and extension consent tests before production release.
- **Honest measurement:** actual current-state metrics, denominators and date windows;
  no fabricated conversion rates, testimonials or hiring predictions.
- **Measured performance:** production-build route tests, export-size budgets and
  real-device loading/interaction checks; field metrics after a separately approved release.

## Verification ledger and release gates

Final combined results were rerun after resume/profile versioning, recovery UI,
profile validation, bounded factual-tailoring corrections and explicit AI review.
Independent review
reproduced additional editing races; they now have regressions, including actual
context/service/SDK HTTP coverage and profile StrictMode lifecycle checks.

- Initial baseline: 15 tests and 17 dependency advisories.
- **1042/1042 Node tests pass**, including controlled lifecycle races, actual service
  and handler execution, isolated HTTP fixtures, document builders and rendered forms.
- The subsequent extension-selection pass adds exact saved-artifact, session-only
  storage, sender/target/revision, late-attachment authorization, wrong-upload-field,
  profile-only sync and chooser lifecycle tests. See [implementation evidence](extension-selection-implementation.md).
- The candidate-evidence follow-up adds literal-quantity, independent held-out and
  bounded scanner tests; career preference/import tests; worker lifecycle tests;
  and candidate duration/fit tests. The original semantic corpus remains unchanged.
- The headline/requirements/fullscreen follow-up adds target/source/manual-field
  tests, all-five-template coverage, independent vacancy context probes, packaged
  shared-parser execution, native-dialog lifecycle and modal export-feedback tests.
  The 843-, 927- and 950-test checkpoints remain historical evidence.
- The subsequent legacy-writer containment adds clean/stale local-download,
  no-Supabase-load, document-free profile construction, bridge disclosure and
  serialized extension-cache cleanup tests. The 960-test fullscreen checkpoint
  remains historical evidence.
- The version-bound email-renderer follow-up adds caller-bearer snapshot ownership,
  immutable package/hash checks, revision revalidation, typed missing-resume
  failures, discovery-only preservation and source assertions proving the legacy
  Storage/one-page fallback is gone. The function-local font rendered a real
  three-page Unicode PDF; Docker/Supabase packaged-runtime verification remains
  open because Docker is unavailable on this host.
- The factual-risk follow-up adds a bounded high-risk claim classifier, explicit
  accuracy confirmation in the shared review UI, direct-resolver fail-closed
  behavior, and the immutable 30-case post-gate summary.
- The final privacy/reliability follow-up bounds free-text AI options, makes
  malformed resume-list responses fail closed while suppressing duplicate view
  rows, removes user-generated AI response bodies from diagnostics, keeps checkout
  verification errors generic to clients, and removes stale third-party IP
  allowlists from the CSP. DOCX exports also avoid blank-date/project-title
  placeholders, and the privacy notice no longer makes an unsupported blanket
  model-training promise.
- The public engagement endpoint now caps request bodies while streaming, returning
  bounded 413/400 responses before privileged database writes for oversized or
  malformed input.
- Public engagement and client-error admission now use a transaction-level
  advisory-lock claim/reservation RPC. Eight concurrent PostgreSQL claims produce
  one allowed reservation and seven denials; direct service-role writes to the
  attempts table are revoked.
- Auto-Apply now rejects incomplete saved preferences instead of inventing a
  default job-title query, and the client treats a legacy HTTP-200 error body as
  a failed run rather than a success receipt.
- Provider-facing Auto-Apply lists, Gmail job/message work, and decoded reply
  bodies are bounded. Gmail database/provider failures now return a non-success
  response instead of being reported as an empty successful scan. Checkout and
  Stripe-webhook diagnostics no longer log request, identity, payment or provider
  payloads; production webhook failures are generic.
- Gmail scans now claim a durable per-user lease and reserve daily message/AI
  work in Postgres. Eight concurrent claims produce one lease and seven denials;
  500-message and 100-AI-call overflow attempts are denied, and direct control-
  table writes are not granted to the service role. Retention/deletion and
  least-privilege OAuth policy remain owner-approved release gates.
- Stripe entitlement updates no longer invent a 30-day premium period when
  `current_period_end` is missing; checkout, renewal, invoice and update paths
  fail closed, with runtime and static regressions covering the boundary.
- Auto-Apply settings and resume selection fail closed on malformed persisted
  arrays, scalar fields and match scores instead of crashing or rendering unsafe
  values.
- Global ESLint, TypeScript, production build/prerender, repository hygiene and
  diff checks pass. The prior dependency audit reports **zero vulnerabilities**
  across all categories; dependencies were not changed in this follow-up.
- Chrome and Firefox extension packages build locally. The production output was
  rebuilt after the recovery/export changes; it is not the earlier stale build.
- The final build is now verified as production-mode code, not merely a successful
  command: actual React production modules, compiled development-branch exclusion,
  initial import closure and complete lazy export dependency graphs are tested.
  The normal build/prerender covers 1,212 modules. Earlier green builds did not
  establish this mode guarantee; the 548-test snapshot is historical evidence.
- Current backend verification: all **18 Edge Function entrypoints** type-check;
  the version-bound attachment helper and handler boundaries are covered by the
  new Node tests, and the function-local Deno renderer check passes. Prior
  **3/3 native Deno tests** remain green; managed packaged-runtime verification
  still requires Docker.
- Prior local PostgreSQL tests pass **17 concurrency/permission/storage groups** and
  replay **all 37 migrations** with five integration assertion groups plus
  **7 resume-versioning, 6 profile proof, 1 atomic public-engagement claim and 1 durable Gmail budget group**. Details and
  platform limits are in the backend audit; this does not certify deployed RLS.
- The historical strict factual-tailoring benchmark was **23/30 passing** before
  the review risk gate. The current default resolver is **30/30** on the same
  corpus: all 23 unsupported probes fall back to source wording unless a flagged
  proposal receives explicit accuracy confirmation, and all 7 supported controls
  remain available. This is a synthetic adversarial diagnostic, not an observed
  model hallucination rate.
- Separate source-only review materialization excludes **all 23 unsupported
  probes**, while **all 7 faithful controls** remain available after explicit
  acceptance. The seven high-risk proposals remain user-overridable after the
  accuracy checkbox; the gate is a fail-closed acknowledgement, not a semantic
  truth guarantee. See [the immutable post-risk-gate snapshot](factual-tailoring-post-risk-gate.json).
- A non-failing empty Stripe chunk notice remains in the build output. Production
  loading/interaction performance has not been measured on representative devices.
- Direct Playwright CLI/MCP use awaits user permission under the Product Design
  workflow. In-app browser verification continues; the new full fixture suite has
  not been executed or promoted to a CI gate.
- Real email, paid AI, Stripe test-mode journeys, managed Supabase HTTP/policy and
  upgrade verification, and extension browser testing require an explicitly
  designated staging/test setup. The local 37-migration replay is complete.
- Roll out the resume/profile versioned migrations and frontend together. Old cached clients'
  existing-record saves deliberately fail closed; stage the managed HTTP and
  existing-database upgrade path before production deployment.
- Network egress controls are still required to address DNS rebinding beyond URL
  and DNS preflight validation.
- The [legacy PDF audit](legacy-pdf-consumers.md) is now closed for the local
  source path: ordinary downloads/profile sync are local or document-free, and
  auto-apply uses the authenticated version-bound package. Existing legacy
  Storage objects are intentionally not deleted; the managed packaged-runtime
  gate and approved staging/provider checks remain before release.

## Next verification decisions

1. Approve the isolated Playwright browser suite to validate the authored workflow,
   actual browser download events and screenshots before adding it as a CI gate.
   The Product Design browser workflow requires permission for direct Playwright use.
2. Designate a disposable staging Supabase project and Stripe/Gmail test setup, with
   approved test identities and provider actions. Do not aim integration tests at
   production or contact real employers.
3. Confirm the public team biographies and approve provider privacy, retention,
   account-erasure and support policies. Review historical error telemetry through
   an authorized process; this audit did not access or delete those logs.
4. Extend the bounded claim-risk corpus and complete product-quality acceptance:
   actual model evaluation,
   preview/export parity, managed multi-device conflict checks, real-device accessibility,
   performance and representative usability testing. These remain work, not promises
   implicitly fulfilled by the green local checks.

Related evidence: [resume correctness](resume-logic.md),
[profile safety](profile-safety.md), [factual-tailoring benchmark](factual-tailoring-benchmark.md),
[AI review journey](ai-review-journey.md), [review-boundary evidence](factual-tailoring-review-boundary.md),
[job metadata](job-metadata.md), [extension handoff](extension-review-handoff.md),
[headline and fullscreen follow-up](headline-requirements-pass.md),
[legacy PDF consumers](legacy-pdf-consumers.md),
[legacy PDF containment](legacy-pdf-containment.md),
[production loading](production-loading.md),
[backend and rollout](../BACKEND_SECURITY_AUDIT.md), and
[QA setup and safety](../../tests/README.md).
