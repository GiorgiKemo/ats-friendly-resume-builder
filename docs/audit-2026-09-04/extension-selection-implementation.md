# Job-bound saved-resume selection

Status: implemented locally; final combined verification is recorded in the main
ledger. This is not a deployed feature or a claim of compatibility with every
employer form.

## What changed

The earlier guidance to review in the app and then select a saved resume was not
usable: the extension lacked the picker, Autofill re-entered blocked generation,
and its floating widget could fill fields before document preparation failed.
The [handoff contract](extension-review-handoff.md) records that finding and the
selected architecture. This pass implements the missing app/extension workflow.

- **Choose resume** captures a job and opens the existing AI Generator route with
  an opaque handoff ID. The captured target does not change when another job is
  scanned. Opening the chooser does not generate, save, queue, start or submit.
- **Saved version** is a first-class, non-Premium path. The user chooses a listed
  revision, previews its PDF content, and explicitly confirms that version for
  that job. Preview and artifact generation use the same normalized saved source;
  neither fills blank or omitted content from the current profile.
- **New tailoring** explicitly imports the captured job into the existing form.
  Replacing existing job details requires confirmation. Unfinished generation and
  review are not discarded. Normal Generate, per-field review and Save remain
  separate actions; a newly saved receipt enables preview, not automatic selection.
- **Autofill remains separate.** Confirmation returns to the original job tab.
  Selecting is not attaching, and a format/checklist score is not factual verification.
  The user is told that Autofill shares the resume with the employer site, which
  may upload it before final submission. Manual final-submission safeguards remain.

## Identity, bytes and lifecycle

One handoff and one PDF are kept in extension session storage, bound to the
authenticated owner, original app and job tabs, exact URL identity, a random
session nonce, and an expected saved revision. No PDF bytes are placed in normal
profile/status payloads or persistent extension local storage. The selected path
does not use the legacy mutable cloud PDF URL. Cold-cache profile synchronization
requests field data only, without generating or uploading a separate default PDF.

The app validates owner and revision before rendering and again afterward.
Autofill revalidates the current saved revision. Immediately before assigning a
File to the employer input, content code requests fresh metadata-only authorization
for the same job/tab/version/artifact; a cancelled or changed selection is denied.
The extension validates bounded metadata, MIME type, PDF signature, strict base64,
decoded size and SHA-256 identity. The raw PDF cap is 1 MiB; its separate response
budget is 1.5 MiB. Ordinary inbound bridge requests keep their 256 KiB limit.
An unsupported browser, oversized file or failed session write requires a clear
retry/manual-attachment path, not a different resume or a silent remote upload.

The selection is usable for 30 minutes. An expiry alarm or worker wake removes
expired bytes; alarms may be delayed while the device sleeps, so this is not a
promise of physical erasure at exactly 30 minutes. Browser restart or extension
reload/disable clears session storage. The new alarms permission is for bounded
expiry cleanup, not wider website access. Worker wake revalidates the account;
missing/expired selections require an explicit new choice.

Attachment is limited to an unambiguously labeled, validated top-document resume
input. A sole file input or the word "resume" elsewhere in a form is not enough:
headshot and cover-letter controls must not receive the PDF. Embedded and
main-world-only upload controls require manual attachment rather than distributing
PDF bytes to unrelated frames. Ordinary field filling retains its existing
supported-frame behavior and sensitive-answer guards. A selected PDF for job A
does not authorize attachment to job B. Queued jobs without the matching selection
pause; selection completion never starts or resumes the queue.

## Browser evidence

The in-app browser cannot load this project as an installed Chrome/Firefox
extension. These two kinds of evidence are deliberately distinguished:

1. **Actual app integration, synthetic backend:** the AI Generator route renders
   the chooser, retains the pre-existing job draft, and shows a persistent
   connection error with Retry when no extension is installed. No generation or
   provider action was triggered. [Capture 66](66-extension-unavailable-app.png).
2. **Actual chooser component, synthetic bridge/library:** an isolated loopback
   fixture mounts the real component, shared controls and stylesheet, with fake
   extension replies and synthetic resumes. Desktop and 390px mobile selection,
   exact content preview, visible sharing consent and keyboard Enter confirmation
   were inspected. The resulting status says selected, not attached. The 390px
   viewport had a 375px document width, with no horizontal overflow. No employer,
   extension, database or provider was contacted by this fixture.

Accepted captures:
[desktop chooser](61-extension-chooser-desktop.png),
[saved-content preview](62-extension-saved-preview-desktop.png),
[mobile chooser](63-extension-chooser-mobile.png),
[final mobile consent and keyboard focus](67-extension-final-consent-mobile.png), and
[selected-not-attached state with cancellation](68-extension-selected-cancel-mobile.png).
Explicit cancellation after selection was also exercised in the synthetic fixture.
The fixture uses the existing card/control design; it is not a replacement product
or an installed-extension end-to-end test.

## Tests and remaining acceptance

Actual-component tests cover no implicit selection, exact revision IDs, owner and
handoff mismatch, expiry at action time, same-account token refresh, logout,
unmount, stale callbacks, duplicate clicks, failed/mismatched acknowledgements,
retry, explicit form replacement, unresolved review preservation and free-tier
saved selection. An independent test connects the actual preview loader and
artifact builder and compares the preview text with the renderer input, including
legacy aliases, blank contact fields, omitted sections and additional sections.

Service, bridge, background and content-script tests are isolated from external
providers. The combined run passes **724/724 Node tests** with zero skips, global
lint, TypeScript, production build/prerender (1,203 modules), repository checks,
and Chrome/Firefox extension package builds. The main
[verification ledger](README.md#verification-ledger-and-release-gates) separates
this from historical migration and provider evidence.

Before release, an installed Chrome and Firefox extension must still demonstrate
the complete choose → preview → select → return → explicit Autofill journey,
worker suspension/restart, supported-browser storage/alarms behavior, navigation
and iframe/manual fallbacks, account switching and queued-job pause/resume against
disposable local or owner-approved sandbox forms. No live application should be
used to infer success, and no employer submission has been performed here.

At the handoff-only checkpoint, 11 semantic AI-proposal failures remained. The
subsequent [candidate-evidence pass](candidate-evidence-pass.md) reduces that
unchanged diagnostic to seven failures and records the newer combined gate.
Review is still an explicit user decision, not a claim that proposed wording is true.
