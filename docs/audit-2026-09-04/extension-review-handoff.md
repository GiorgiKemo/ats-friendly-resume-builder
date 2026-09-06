# Extension resume review handoff contract

Status: original design and acceptance contract. The subsequent local
[implementation and evidence](extension-selection-implementation.md) now cover
the saved-version chooser and session-only attachment path. Installed-extension
and real-provider acceptance remain open. The baseline findings and staged plan
below describe why this work was necessary; they are not current feature status.

## Confirmed gaps at the start of this pass

1. The extension's AI Resume action calls `PREPARE_ACTIVE_TAB_RESUME`
   (`browser-agent/popup.js:497`, `sidepanel.js:502`). Background preparation then
   calls `APP_PREPARE_RESUME_REQUEST`; `browserAgentAppBridge.js:138` intentionally
   rejects it before paid generation, save or upload. The popup/sidepanel still
   promise generation on the current page. Those promises are no longer accurate.
2. Normal Autofill also calls preparation whenever `shouldPrepareResumeForJob`
   finds no matching `documents.preparedForUrl` (`background.js`, functions
   `prepareActiveTabAutofillContext`, `performActiveTabAutofillParallel`, and
   `shouldPrepareResumeForJob`). Normal saved-resume sync does not set that field.
   Therefore "review, save, select the saved resume, then autofill" still reaches
   the preparation rejection. In the parallel path, some non-document fields can
   already have been filled before the preparation error is shown.
3. The popup/sidepanel has no saved-resume picker. `SYNC_PROFILE_FROM_APP` accepts
   a resume ID, but its UI does not offer a choice. AutoApply has a picker, but
   its sync operation also queues jobs (`src/pages/AutoApply.jsx`, `syncBrowserAgent`).
   That is not an appropriate selection-only handoff.
4. Both in-app generators can import `GET_RECENT_JOB_POSTING`. That operation
   refreshes the global last-job tab, or returns the global cached snapshot.
   Another scanned job can replace it; it is not a frozen, owner-bound handoff.
   `OPEN_RESUMEATS_IMPORT` only opens Quick Resume, without transferring identity.
5. Profile documents contain resume ID/title but no revision
   (`src/services/browserAgentService.js`, `buildBrowserAgentProfile`). PDFs are
   uploaded to mutable `${ownerId}/${resumeId}.pdf` in `ensureResumePdfSignedUrl`.
   An exact reviewed-version promise cannot be based on that identifier alone.
6. Queue `handleJobPageReady` uses the global cached profile without job-specific
   preparation. A new target-bound selection must not become an implicit document
   choice for every queued job. Completion must not queue, start, advance, or
   submit any application.

The existing strengths to reuse are authenticated app identity round trips,
versioned resume loads/saves, shared pending-review sink rejection, app review
sessions, extension `profileSessionVersion`, serialized state writes, and the
existing manual employer-submission safeguards. None should be bypassed.

## Smallest usable workflow

### Background implementation evidence (4 September 2026)

The session-only background boundary is implemented in `background.js` and
`resume-handoff.js`. **29** new tests in `tests/browserResumeHandoff.test.js`,
**12** account-session tests and **9** job-identity tests pass (**50 combined**),
with scoped lint clean. These execute the actual background/store with synthetic
browser APIs; they are not packaged-browser or real-employer certification.

One session record binds a random handoff ID and separate random nonce to owner,
original job tab/exact URL, allowlisted app tab/origin, frozen bounded job snapshot
and expected saved revision. A synchronous begin-intent guard prevents a slower
earlier Begin from replacing a newer same-account choice. Conditional serialized
writes prevent stale completion/cancellation from restoring or clearing another
record. Same-version concurrent/repeated completion uses one acknowledged artifact.

Active Autofill no longer calls generation or fills partially while preparation
is pending. Missing/expired/mismatched selection fails `resume_selection_required`
before any fill. Background `APP_SYNC_PROFILE_REQUEST` explicitly sets
`profileOnly:true`, including with an initially empty profile cache; no default
PDF rendering/Storage upload is hidden in that path. Queued jobs share the guard,
pause `needs_resume_selection`, and resume only on explicit Start in the original
selected tab. Account-bound delayed queue callbacks cannot overwrite a new owner.

Before release, `APP_VALIDATE_SAVED_RESUME_REQUEST` returns only
`{ownerId,resumeId,revision}` after a fresh exact-version read. The employer-only
attachment wrapper is `{handoffId,targetUrl,artifact}` on the original top frame;
other frames receive `profileOnly:true` without bytes, and every dispatch forces
`autoSubmit:false`. After content hydration, `AUTHORIZE_RESUME_ATTACHMENT` checks
the actual sender/tab/frame, current owner/session/revision, handoff, artifact ID
and target URL again immediately before `input.files`; its acknowledgment has
only `{ok:true,handoffId,artifactId,targetUrl}`. It never returns PDF bytes.

`GET_RESUME_HANDOFF` returns frozen job/identity/timestamps and optional selected
resume metadata only. Completion returns `{status:'ready',handoffId,resume}`;
cancellation removes a live bound record and returns `{status:'cancelled',handoffId}`.
Missing/replaced/expired IDs are rejected rather than falsely acknowledged as
known successful deletion. GET_STATE exposes only selected title/ID/revision/job
metadata. Artifact response size, canonical base64, decoded length, MIME, safe
filename, `%PDF-` signature and SHA-256 are checked before retaining/releasing bytes.

Selection is available for 30 minutes. An expiry alarm (new `alarms` permission,
unchanged host permissions) and worker-wake cleanup remove expired bytes. Every
use is independently clock-gated; alarms may be delayed while a device sleeps,
so this is not a promise of physical deletion at an exact wall-clock instant.
Logout/account changes, cancellation, replacement, original/app tab closure and
job/app-origin navigation clear the record. No persistent-storage, signed-URL or
remote-upload fallback is used. Existing legacy artifacts were not inspected or
purged. Browser-session restart requires a new choice; worker restart can reuse
the record only after current account/target/revision and binary-integrity checks.

Tests cover these race, identity, corruption, expiry, quota, wrong-sender,
metadata-only, no-provider/no-default-upload and queued-isolation paths. Native
Chrome/Firefox session APIs, suspension/quota behavior, actual file inputs and
per-provider navigation still require separately approved browser acceptance.
Embedded/main-world-only uploads are intentionally manual; a changed apply URL
requires a new explicit selection. Historical stages below remain design context.

Keep selection and factual review in the app. Do not add a second resume editor
or a second provider pipeline inside the extension.

1. The user clicks **Choose resume / Tailor in ResumeATS** for the active job.
   Background verifies the connected account, captures that exact tab, creates
   an opaque handoff ID and opens `/#/ai-generator?extensionRequest=<id>`.
   It does not generate, fill fields, upload, save, or mutate the job queue.
2. The app retrieves the frozen handoff snapshot and displays the target title,
   company and URL. Two first-class choices are required:
   - **Use a saved resume**: list the current user's saved resumes with title and
     revision/date; load the selected exact version, show a preview, and offer
     **Use this saved version for this job**. This path requires zero AI calls,
     zero resume creates/updates, and no default-preference or queue changes.
   - **Tailor a new resume**: explicitly import the frozen job into the existing
     generator, generate only on the user's normal Generate action, decide every
     prose change, and save through the existing versioned workflow. Only a
     confirmed save enables **Use this saved version for this job**.
3. That explicit button completes the handoff using only its ID, saved resume ID
   and expected revision. The extension asks the authenticated app to load and
   prepare that exact version, validates the response and target, caches a
   job-bound document selection, then focuses the original job tab if still valid.
   It displays the selected title/version and **Autofill** as a separate action.
4. A later explicit Autofill uses that selection without invoking generation.
   Missing, expired or mismatched selection returns `resume_selection_required`
   before partial autofill. It offers the handoff again, not a paid fallback.
   Employer-form review and manual final submission remain separate actions.

An already saved resume is not assumed to be fact-checked: the preview and
explicit selection mean "selected/reviewed by you for this job," not verified
truth. Historical saved AI output is not retroactively certified.

## Minimal state and message contracts

These are the design contracts. The implementation report and source define the
final message names; completion/status replies to the app contain metadata only.

| Boundary | Required request/response |
| --- | --- |
| Extension UI begins handoff | Existing prepare action may return `{status: 'review_required', handoffId, appTabId, job: {title, company, url}}`; do not report "AI resume ready." |
| App retrieves handoff | Extend the import request with `{handoffId}`. Return `{handoffId, ownerId, jobKey, jobSnapshot, createdAt, expiresAt}` only after authenticated owner validation. Never substitute the global recent job when the ID is missing/expired. |
| App completes explicit selection | New privileged completion request `{handoffId, resumeId, expectedRevision}`. No arbitrary profile payload, proposed prose, signed URL, owner override or `reviewed: true` flag is accepted. |
| Background requests exact saved artifact | Extend `APP_SYNC_PROFILE_REQUEST` or add a dedicated privileged artifact request with `{resumeId, expectedRevision, expectedUserId}` for this path. App validates the loaded owner and revision before local rendering; an absent or mismatched version fails closed, with no latest/default fallback and no Storage upload. |
| Successful completion | `{status: 'ready', handoffId, jobKey, resume: {id, revision, title}, document: {artifactId, mimeType, filename, byteLength, sha256, base64, rendererVersion}}`, bound to the authenticated owner and original handoff/session. Bytes are stored only in extension session storage; ordinary status/profile responses carry metadata, not base64. Completion itself never autofills. |

Pending background state needs only the opaque ID, owner ID, session generation,
original tab ID, exact job key, bounded job snapshot, creation/expiry, and phase.
Keep one active handoff and one selected artifact per connected account initially.
Use extension session storage, not existing persistent local state, for both.
Document the handoff/selection expiry and remove superseded, cancelled or expired
records and all records on account invalidation. Completion replaces pending state
with the acknowledged selection; it does not discard bytes needed for later Autofill.
Do not put job descriptions, contact data, access tokens or signed URLs in routes,
analytics or log messages. The route carries only the opaque handoff ID.

The app's existing tailoring session may retain the handoff ID alongside its
owner/run; keep it separate from provider source data. Opening a handoff must not
replace an unfinished review or source form silently: offer to continue existing
work or explicitly discard/switch. No new database table is required for this
bounded workflow.

## Selected architecture: session-only PDF artifacts

Use locally generated PDF bytes transported as base64 JSON, kept in a dedicated
extension `storage.session` record. This is now the local implementation direction.
No new remote version-specific PDF objects, signed URLs or remote
artifact-retention policy are needed for this path. Remote immutable artifacts
remain an alternative architecture, not the planned implementation.

### Exact saved snapshot and isolated transport

- Render only the authenticated, exact loaded saved revision. Do not merge current
  profile contact fields or missing sections into it. The existing
  `createResumePdfBlob` does those fallbacks, so it cannot be reused unchanged for
  an exact-version promise. Use the shared text-native renderer on the saved
  snapshot, with its existing unsupported-character failure behavior.
- Bypass `ensureResumePdfSignedUrl` for this handoff. Bind the app-generated bytes
  to owner, session nonce, handoff, original target/tab, resume ID/revision and a
  SHA-256 digest. Check identity again after rendering and before acknowledgement.
  The hash detects byte/version mismatches; it is not sender authentication or
  factual verification. A duplicate completion returns the same accepted artifact,
  not a newly rendered or latest-version replacement.
- Do not add base64 to `profile.documents`: `saveState` currently persists profiles
  in `storage.local`, generic profile messages expose documents, and main-world
  payloads plus `getProfileWithoutResumeUpload` spread unknown document fields.
  Keep an opaque artifact ID and display metadata in ordinary profile/status
  responses. Release actual bytes only through the separately authorized,
  owner/job/tab-bound attachment operation. Never log or add bytes to page routes.
- Preserve the current **256 KiB inbound app-request limit**. It checks extension
  request payloads, not app responses. Completion requests remain small IDs;
  introduce a separate bounded artifact-response validator in the app bridge and
  extension transport rather than globally raising the existing request limit.
  Cap raw PDFs at **1,048,576 bytes (1 MiB)**, base64 at **1,398,104 characters**,
  and the complete UTF-8 JSON artifact response at **1.5 MiB**. Keep metadata
  bounded and reject invalid encoding, mismatched decoded length, non-PDF signature,
  wrong MIME type or digest before acknowledging readiness. Use a safe filename.
- Keep only one artifact initially and avoid chunking. Existing local exported
  fixtures are 57,698-62,300 bytes; these examples are not a worst-case guarantee.
  If size, rendering, transport or session-storage limits are exceeded, preserve a
  clear retry/manual-attachment option. Never silently substitute another resume,
  switch to remote Storage, generate again or report the file attached.

Chrome's current default extension messaging uses JSON and permits messages up to
64 MiB; this is a platform ceiling, not an application budget. Base64 is roughly
4/3 of raw file size and is copied across the bridge. Chrome 148 adds optional
structured-clone messaging for Blob/File, but the current manifest does not opt
in; base64 avoids requiring that newer serialization mode.
[Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging),
[Chrome structured-clone rollout](https://developer.chrome.com/blog/structured-clone-messaging).

### Session lifecycle and browser compatibility

Use `storage.session` with its default trusted-context-only access; never enable
content-script storage access. Chrome currently provides a 10 MiB session quota
(1 MiB through Chrome 111), measured by estimated allocated memory rather than
just base64 character count. Handle rejected writes and feature-detect optional
quota helpers. No `unlimitedStorage` permission or persistent fallback is needed.
Session data clears on browser restart or extension reload/update/disable.
[Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).

Service-worker globals are not the artifact store: worker shutdown discards them.
Restore valid records from session storage on worker wake, then re-authenticate
the connected owner and validate target, expiry and session nonce before releasing
bytes. Do not rely only on the process-local `profileSessionVersion`, which resets
when the worker is recreated. Missing records mean explicit reselection, not
restoration from persisted queue/profile metadata.
[Chrome worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

The packaged Firefox minimum is 121; session storage is supported from Firefox
115. Its session `getBytesInUse` and `QUOTA_BYTES` arrive in 131, while
`setAccessLevel` is unsupported, so those methods must not be required. Chrome's
manifest currently declares no minimum: unsupported session storage or insufficient
quota must fail clearly, never fall back to `storage.local`/IndexedDB. Browser
compatibility and quota failure need runtime tests.
[MDN storage compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/storage.json).

Content-bridge reinjection/token rotation may retain an otherwise valid session
record but must invalidate old transport callbacks. Browser/extension restart
expires the selection; the UI must ask the user to choose again. Serialize writes
and recheck owner/session after awaits so logout or a new handoff cannot be undone
by a late artifact response. Cancellation/account invalidation removes bytes.

### Attachment consent and remaining privacy scope

Only explicit Autofill may reconstruct the PDF `File` for the validated employer
target. Assigning `input.files` and dispatching events can make a site upload the
file immediately, before final submission. Tell the user that Autofill shares the
selected resume with that employer site; choosing a resume in ResumeATS alone does
not. Keep sensitive-answer and manual final-submission safeguards unchanged.

Session-only describes the extension's artifact storage, not a promise that the
employer never receives a copy or that browser/OS memory leaves no traces. Existing
ordinary synced profiles still use `storage.local`; this design does not claim to
remove that separate persistence. Releasing bytes into main-world/iframe paths
must be limited to the explicitly validated attachment target, not generic profile
broadcasts or every queued job.

## Required trust and concurrency rules

- **Sender authorization:** begin requests come from extension-owned popup or
  sidepanel controls. Retrieval/completion from page transport are privileged,
  restricted to the installed app's allowlisted top-frame origin. Update the
  background sender allowlist, content bridge forwarding allowlist and app lazy
  bridge allowlist together. Correlation tokens are not account authorization.
- **Owner/session binding:** capture authenticated owner and extension session
  generation before work. Recheck after each awaited app call, artifact build,
  tab lookup and before serialized storage writes. Logout/account change removes
  pending handoff and selection. Old responses must neither resurrect the old
  profile nor clear/overwrite a newly connected account's state.
- **Target binding:** use exact parsed HTTP(S) origin/path/search/hash identity,
  not URL prefixes. Verify the original tab still identifies the chosen job before
  returning or attaching. A closed or navigated tab needs explicit reselection;
  do not focus or attach to the most recently active unrelated tab. Job-to-apply
  redirects must be freshly captured and explicitly bound, or supported by a
  separately tested provider job-ID mapping; string-prefix inference is forbidden.
- **Version binding:** validate positive integer expected revision and exact
  loaded resume ID/owner. A concurrent saved-resume update requires a fresh preview
  and explicit choice. Do not silently read latest or retry with a newer revision.
- **Artifact binding:** the selected session-only design uses immutable verified
  byte identity, not the existing mutable ID-only PDF key. Attached bytes must be
  built from the exact loaded snapshot without profile fallbacks. Missing/expired
  session artifacts require explicit reselection, not latest/default fallback.
  A future remote-artifact alternative would require version-specific private keys,
  exact-version URL refresh, validated Storage policies and an owner-approved
  retention/deletion plan; none is planned for this next pass.
- **Idempotency:** duplicate completion for the same handoff/version returns the
  same acknowledged selection or a clear pending result. A different version/ID
  cannot reuse the completed handoff. Expiry/restart never auto-accepts a draft.
- **Queue isolation:** selection completion does not set `isRunning`, clear/enqueue
  jobs or advance queue state. Shared document dispatch must enforce job selection,
  including `handleJobPageReady`, not just popup Autofill. Queued jobs lacking an
  explicit matching selection pause as `needs_resume_selection`; they never reuse
  a tailored document merely because it is the global cached profile.
- **Submission isolation:** preserve all sensitive-answer and manual-submit gates.
  No completion/return/selection handler calls the employer submission path.

## Staged implementation and ownership

1. **Current bounded repair:** job URL comparison and mismatched snapshot fallback
   only. Nine tests in `tests/browserAgentJobIdentity.test.js` execute the real
   matcher, prepared-document decision, snapshot callback and both autofill callers.
   Six of the initial seven tests failed before the repair, including wrong cached
   facts for `/jobs/1` versus `/jobs/10`; nine now pass. Thirty-eight existing
   session, entry-navigation and submission tests also pass (47 combined).
   Changed `/apply` routes remain navigable/capturable, but intentionally require
   fresh context instead of assuming a prefix proves the same job. No provider
   compatibility is certified by these isolated tests.
2. **Next pass, contract and selection:** extension owner implements pending-state,
   sender authorization and guarded completion; app owner implements the handoff
   banner/import and clean saved-resume picker. Backend/service owner adds exact
   version loading and local artifact rendering; test owner covers real bridge round trips. Coordinate
   message names and response shapes before touching all three allowlists.
3. **Next pass, active Autofill:** remove generation from both active-tab autofill
   paths, consume selected artifact, expose truthful ready/missing/expired state,
   and implement explicit return-to-original-tab. Keep queue mutations out of this
   work. Root performs browser acceptance using synthetic local fixtures.
4. **Separate queue acceptance:** add per-job selection/pause semantics at the
   shared dispatch boundary and test same-account concurrent run/cancel behavior.
   Do not call the handoff seamless or complete until both active and queued paths
   cannot attach an unrelated job's selected document.

## Acceptance tests required before claiming completion

1. Existing saved-resume path: choose non-default resume, preview exact revision,
   select and return, then attach that version. Assert **zero provider calls, zero
   resume writes, zero preference writes, zero Storage uploads, and zero
   queue/start/submit mutations**.
2. New tailoring: capture job A, scan job B elsewhere, import handoff A, generate
   once, leave suggestions undecided, attempt all save/export/completion sinks
   (blocked), decide every change, save once, select confirmed revision and return.
   The unchanged semantic corpus remains separate from this review-gating test.
3. Wrong/expired/missing handoff ID, malformed payload, job-page sender, subframe,
   wrong app origin, forged extension sender and owner mismatch all fail before
   candidate data or artifact disclosure. No fallback to recent/default/latest.
4. Account change/logout at every await boundary leaves the new account's state
   untouched; late app and storage responses cannot restore stale profile, handoff,
   selection or queue data. Same-account new handoff supersedes old callbacks.
5. Concurrent resume save after preview, wrong acknowledgement revision, deletion,
   expired session artifact, failed render/transport/storage and duplicate completion preserve a clear
   retryable selection state without generation, stale attachment or duplicate writes.
6. Original tab closed, navigated, same-prefix different job, changed query job ID,
   changed SPA fragment and apply redirect all require correct target handling.
   A legitimate newly captured apply page remains usable without auto-submission.
7. UI never reports "AI ready," "verified" or "attached" before the corresponding
   acknowledgement; keyboard/mobile picker and review retry retain choices. Existing
   unfinished source/review work is not overwritten when another handoff opens.
8. Active Autofill with no selection performs no partial fill/paid fallback; selected
   Autofill still runs actual sensitive-answer and manual-submit safeguards. Main-world,
   iframe, queue and content-button dispatch cannot bypass document binding.
9. Queue completion/selection never auto-resumes a paused run. A selection for A is
   not attached to B. Explicit user Start remains separate from review and submission.
10. Browser restart/extension reinjection, bridge token rotation and app route remount
    retain only valid session-bound handoff state or show explicit expiry. Browser
    restart/extension reload expires the selection; worker wake requires owner
    revalidation. Verify cancellation/logout removes session bytes and no artifact
    bytes reach persistent storage, profile/status payloads, logs or unrelated frames.
11. Oversized response/base64/PDF, invalid encoding, wrong MIME/signature/digest,
    unsupported session storage and quota failures stop before readiness/attachment.
    Matching metadata must not authorize changed bytes. Cover both Chrome and
    Firefox optional-API behavior and preserve the manual-attachment fallback.

This document is a local implementation plan and verification contract, not a
claim of live ATS compatibility, deployed security or legal/privacy compliance.
