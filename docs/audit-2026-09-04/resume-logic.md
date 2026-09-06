# Resume correctness and export audit

Status: local implementation and regression verification completed. No production
accounts, AI providers, or storage were used by these checks.

## Corrected findings

| Priority | Finding | Correction and evidence |
| --- | --- | --- |
| Critical | Generated resumes randomly changed education dates when study overlapped employment. Additional post-processing invented years of experience from career-level selection and replaced future source dates. | Removed fabricated post-processing and contradictory prompts. Calendar parsing validates dates without rollover or timezone shifts. Source timelines and enrollment flags are preserved. |
| High | Authenticity processing accepted AI-only skills when the source list was empty, preferred invented contact URLs, and assigned unmatched role achievements by array position. | Source-only identity, links and skills; exact identity-based section matching; source project technologies; no generated provenance flags accepted as proof. |
| High | Normalization collapsed C, C# and C++ and discarded non-Latin skills. Sentence splitting broke Node.js and decimal achievements. | Unicode-aware deduplication, technical keyword boundaries, and sentence splitting that preserves decimal points and technical names. |
| High | PDF export deleted every non-ASCII character and silently cut descriptions after five bullets. | Complete text export with embedded, licensed DejaVuSans font and Unicode character map. Unsupported glyphs produce explicit DOCX guidance, never silent deletion. Project technologies and dates are retained. |
| High | Saved-resume loading dropped legacy job titles, active-study flags and project technologies. | Load and update boundaries accept title aliases and retain source record metadata. |
| High | Save completion reloaded older server data over newer typing, cleared newer drafts, and allowed older requests to finish after newer writes. | Serialized saves; same-resume/edit-version completion guard; no save-triggered reload; failed saves retain drafts; first-create completion preserves edits made during the request. |
| High | Switching accounts could retain the previous candidate or allow stale responses to restore their data. | User-id transition resets, stale-load guards and queued-save account guards. Controlled-promise tests exercise logout and direct account switching. |
| Medium | Export readiness marked missing or malformed contact information ready and counted duplicate skills. Builder progress demanded both employment and education. | Valid-email gating, unique skills, and one career-evidence source: work, education, or projects. |
| Medium | DOCX repeated hyphens inside native bullets and inserted identity placeholders. | Shared text normalization, one native bullet per achievement, empty missing identity fields, and section headings kept with following content. |
| Medium | Storage upload errors could be reported as success; optional upload delayed download success. | Storage-only operation reports false on failure. Download dispatch returns without waiting for optional cloud upload; the upload catches its own failures. |
| High | PDF rendering could finish after an account switch and choose the new account as its cloud upload owner. Quick Resume export callbacks could start downloads after unmount. | Storage captures the initiating owner and resume ID before rendering, rejects mismatched authentication, and skips optional upload if ownership is unknown. Quick Resume locks duplicate exports and checks account/request identity after imports and before notifications. |
| Medium | ATS analysis ignored the actual personal summary and flagged the application's own conventional headings. | Analyze personalInfo.summary and consistently recognize conventional template headings in both checks and suggestions. |
| High | Profile Save could overwrite stored data during initial loading, revert newer typing, or retain another account's data. | Ready-state gating and error/retry UI; account-bound request guards; no save-time snapshot replacement; duplicate-click lock and unsaved status. |
| High | Profile source sections were inaccessible, and editing an entry after deleting an earlier entry could overwrite the wrong record. | Existing work, skills, and project navigation restored; entry-index adjustment and blank-entry validation; legacy skills remain visible. |
| High | AI generation accepted empty placeholder sections, could save stale account results, and lost output when optional progress or quota refresh failed. | Meaningful-source validation, account/run/unmount guards, account-scoped input drafts, and best-effort optional state refresh. |
| High | Source JSON was silently truncated at 5,000 characters, potentially cutting records and excluding later facts. | Complete compact structured source up to an explicit 30,000-character limit; oversized input is rejected before provider invocation. Unrelated autofill answers are excluded. |
| High | Account switching during the asynchronous save-time authentication lookup could bind an earlier snapshot to a new account. | Explicit expected-user checks in profile/resume save services and captured-user arguments from ResumeContext. |
| High | Quick Resume dropped saved career sections before generation and recorded generated drafts as submitted applications. | Full source profile retained; missing-source preflight and profile link; account/run guards; tracker creates Saved records, reports partial failure and retries without duplicate resume creation. |
| High | The extension's separate PDF renderer still stripped Unicode, truncated bullets and omitted certifications. | Extension PDF uses the same lazy Unicode document builder; complete selected-resume sections and certification issue dates are preserved. |
| High | Password recovery used the mutable current session after an SDK lock wait; a completed update could then sign out a different account. | A dedicated helper validates a captured JWT against the expected user and binds the Auth request to that token. No automatic global sign-out follows. The page guards account/unmount completion and shows explicit bootstrap retry and success states. |

## Verification

- Runtime suites: resumeAuthenticity, resumeDataIntegrity, generatedResumeQuality,
  resumeExport, resumeContextLifecycle, resumePdfDelivery, atsRulesEngine.
- Lifecycle tests execute the real context with persistent hook state, local
  storage, controlled promises and isolated services. They cover slow saves,
  ordered saves, retry after failure, logout/account changes, out-of-order loads,
  first-create typing, and load-time field preservation.
- PDF and DOCX fixtures generated through the actual application document builders
  using scripts/verify-resume-exports.mjs. Both rendered and visually inspected.
  PDF extraction with pypdf confirmed accented and Georgian names, the seventh
  achievement, project technologies, project dates, and Georgian language text.
- TypeScript no-emit check and ESLint passed for the changed production files and
  regression suites at handoff.
- Profile and AI runtime suites: userProfileLifecycle, userProfileService,
  profileSectionIntegrity, enhancedAIGeneratorLifecycle, resumeSaveAccount,
  resumeGenerationSource. Source tests bundle the actual service with an isolated
  proxy and check the full request, oversized-source rejection and cancellation.
  All auth/provider/storage effects use mocks, not production requests.
- Additional runtime suites: simpleResumeFlow, browserAgentPdf,
  browserAgentEntryNavigation, and browserAgentSession. Independent extension
  review found pre-submit navigation bypasses and a logout/storage-write race;
  the corrected implementations pass real-function regression tests.
- The extension PDF fixture was rendered and visually inspected, with pypdf
  confirming the accented/Georgian name, seventh achievement, certification date,
  project dates and technologies. It uses the same document builder as downloads.
- Browser file-system delivery has not been confirmed: the in-app download-event
  wait timed out. A fresh Vite run resolved the initial dynamic-import failure;
  later attempts had no PDF error and only the expected local upload-fixture 403.
  The unit delivery test proves dispatch and nonblocking storage behavior, not
  browser download permission or file-system delivery.
- PDF delivery regressions also exercise account switches during rendering and
  authentication, immutable upload targets, unknown-owner skips, and storage
  failure. Quick Resume tests cover cancelled PDF/DOCX imports, duplicate clicks,
  obsolete completion, and export-state reset on account changes.
- ResumePreviewPane lifecycle tests cover both formats, account/resume changes,
  unmount, duplicate clicks, and immediate scroll restoration. An older export
  completion cannot overwrite a new pane's scroll lock or export status.
- Password recovery was checked against installed auth-js 2.105.1. Isolated
  real-SDK experiments reproduced both a password update selecting account B
  after starting under A and an A update followed by a B sign-out. Ten
  passwordRecovery regressions cover the token-bound replacement, verified-owner
  rejection, request cancellation, API/transport failures, bootstrap retry,
  duplicate-submit prevention and obsolete page results. All authentication
  requests were mocked; no real password or session was changed.

## Remaining limitations

- The bundled PDF font does not cover every writing system, notably CJK. Those
  resumes receive an explicit error directing them to Unicode-preserving DOCX.
  A full multilingual font/shaping strategy remains product work.
- Text PDF export uses one text-native layout, not pixel-identical output for all
  selected visual templates. Template parity, page-size controls and broader
  multi-page typography validation remain follow-up work.
- Generated prose still requires candidate review: deterministic identity checks
  cannot prove every rewritten metric or qualitative achievement. No paid-model
  evaluation or fabricated-claim benchmark was run.
- The generation source limit is character-based, not model-token-aware. Long
  profiles must be shortened explicitly; target-job text still has a marked
  length cutoff. A richer source-selection workflow remains product work.
- Profile list-entry forms require Add/Update before the page-level Save action;
  unfinished entry-form text is not part of the profile until that action. Profile
  drafts do not yet survive route changes or browser closure.
- AI progress persistence still uses a shared cross-tab storage record. User/run
  identity checks prevent stale progress being applied, but the storage layer is
  not a resumable background-job system. Legacy unscoped AI input drafts are not
  loaded into any account because their owner cannot be established.
- ATS scores are heuristic guidance, not measured acceptance probabilities or
  certification by employer systems. Several formatting checks depend on inferred
  metadata rather than parsing the final document; career-path flexibility and
  keyword weighting need a dedicated benchmark.
- Server-side expected-revision writes and per-tab draft recovery are now implemented
  and verified with PostgreSQL, actual-context/SDK HTTP tests, and an in-app two-tab
  stale-save/copy journey. See [conflict recovery](conflict-recovery.md). Managed
  Supabase multi-device HTTP and native browser confirmation checks remain release
  gates; automatic text merging and complete historical version storage are not implemented.
