# Legacy mutable PDF consumer audit

Date: 2026-09-04. Local, read-only source tracing; references are line numbers at this audit snapshot. No Storage reads/writes, provider requests, employer submissions, deployments, or external email sends were performed. This is a verified code-path risk, not a verified deployed exploit.

## Finding

The private `resumes` bucket still uses the mutable key `${userId}/${resumeId}.pdf` in legacy paths. Owner checks do not bind that object to a resume revision. A clean but stale tab can export its older snapshot and asynchronously overwrite the same PDF key after another tab saves newer data. The next Gmail send can prefer that stale object over the database resume. Dirty/conflicted editor exports clearing the ID prevent that particular draft upload; they do not prevent clean cross-device staleness.

## Verified writers and consumers

| Path | Source reference | Current behavior |
| --- | --- | --- |
| Ordinary PDF download | `src/services/pdfService.js:168–205` | Captures owner/resume ID, checks owner, then uploads with `upsert: true`. Download triggers the upload without awaiting it; no revision check. |
| Export entry points | `src/pages/ResumePreview.jsx:66–68`; `src/pages/ResumeBuilder.jsx:398–400`; `src/components/resume/ResumePreviewPane.jsx:52–56`; `src/pages/SimpleResumeFlow.jsx:470–472` | Call the shared download service. A nonempty saved ID enables its upload. PreviewPane strips the ID for dirty/conflicted state. Quick flow only uploads if its supplied snapshot has an ID. |
| Explicit upload helper | `src/services/pdfService.js:213–219` | Exported `uploadResumePdfToStorage` uses the same mutable key; no active source caller was found. Do not describe it as an observed UI action. |
| Legacy profile document preparation | `src/services/browserAgentService.js:464–489, 500, 559, 662–669` | Renders a resume/profile-derived PDF, upserts the same key, then creates a six-hour signed URL. `includeResumeDocument` defaults to `true`. Neither key nor metadata binds the revision. |
| Auto-Apply app sync | `src/pages/AutoApply.jsx:729–739` | Calls `buildBrowserAgentProfile` without disabling document preparation, so it still triggers the legacy upload. |
| Pending-login extension sync | `browser-agent/content-app-bridge.js:261–262`; `src/services/browserAgentAppBridge.js:115–122` | Sends an empty payload, so `profileOnly !== true` enables legacy preparation. This differs from normal background sync, which explicitly passes `profileOnly: true` at `browser-agent/background.js:2121–2124`. |
| Legacy document metadata persistence | `browser-agent/background.js:301–313, 2523–2538` | `SYNC_PROFILE` stores the supplied profile in extension local storage, including legacy signed-URL/path metadata. This is distinct from the selected PDF bytes held in session storage. |
| Gmail attachment reader | `supabase/functions/auto-apply-run/index.ts:1320–1370` | Downloads the mutable key first. A present object becomes `attachmentBase64` for Gmail. Database PDF rendering is only a fallback when no Storage PDF was obtained. No revision/digest check binds the downloaded object to the chosen resume. |
| Brevo branch | `supabase/functions/auto-apply-run/index.ts:1390–1399` | Does not pass this PDF to `sendApplicationEmail`; do not claim the same attachment behavior for Brevo. |

No current UI PDF download was found that reads this Storage object: ordinary downloads render the supplied local snapshot. Its direct active binary reader is the email API above.

## Reachability and protected paths

- Current Auto-Apply UI calls specify `discoverOnly: true` (`src/pages/AutoApply.jsx:551, 853`), so those UI actions do not send email.
- The authenticated service/API still accepts an explicit send run: `src/services/autoApplyService.js:383–399` maps `discoverOnly: false`, and the Edge handler derives `discoverOnly` at `supabase/functions/auto-apply-run/index.ts:1089`. The send branch requires active preferences and its other authentication/budget/provider conditions; it is not dead code or an anonymous endpoint. Deployment/configuration was not inspected remotely.
- Current exact saved-resume selection renders from a verified saved revision, validates it again after rendering, and never reads this legacy key (`src/services/browserAgentResumeArtifact.js:99–124`).
- Current employer dispatch strips legacy `documents` before ordinary/main-world filling (`browser-agent/background.js:210–213, 1544–1553`; `browser-agent/content-job-board.js:8536–8542`). The selected, validated session artifact is the attachment source. Older signed-URL upload helpers remain in source, but these current dispatch paths do not feed them document URLs. No new bypass was demonstrated.

## Minimal containment, then snapshot follow-up

1. Make ordinary PDF download local-only; remove its implicit cloud upsert. Keep export behavior and explicit user save semantics separate.
2. Make profile synchronization document-free by default and fix both remaining call sites above. Stop persisting unused legacy signed-document metadata; any existing local-cache cleanup should be narrowly scoped. Do not delete remote PDFs as an incidental cleanup.
3. Stop the Gmail branch preferring the mutable Storage file. Render its attachment from the same owned saved snapshot used for that run, with local behavior tests proving old Storage bytes cannot take precedence. Missing/invalid attachment policy must be explicit, not silently described as successful attachment.
4. Treat atomicity as separate work: `loadResumeSnapshot` currently reads parent metadata and content in two queries and does not return a revision (`supabase/functions/auto-apply-run/index.ts:971–1005`); the cover-letter source is loaded earlier at line 1146 and fallback attachment data is loaded again at line 1347. Simply removing Storage precedence does **not** make these reads atomic or revision-bound. A single owner-scoped versioned snapshot should feed both the run's text and PDF, with an explicit policy for subsequent edits/deletion before sending.
5. If persistent PDF caching is still needed, use immutable owner/resume/revision/renderer-or-content-hash keys plus verified artifact metadata. A preliminary revision read followed by another upsert of `${userId}/${resumeId}.pdf` still permits a late stale writer and is not a sufficient fix.

Acceptance tests for the bounded containment should cover a stale clean export, zero implicit Storage calls during download/profile-only sync (including pending-login sync), a poisoned legacy object being ignored by email preparation, owner changes/deletion during preparation, and preservation of the existing revision-bound extension artifact path. Tests must use local stubs/fixtures; no actual email send is needed.

## Follow-up closure (local source)

The table above is the original consumer trace and is intentionally preserved as
historical evidence. The current source satisfies the bounded containment:
ordinary downloads are local-only, profile synchronization strips legacy
documents, and auto-apply no longer reads the mutable bucket or runs the old
ASCII/truncating fallback. Its `resumeAttachment.ts` reader uses the request
bearer with `get_resume_versioned`; one frozen package supplies text and Gmail
bytes, and owner/id/revision are checked again before dispatch. Existing remote
objects are not deleted. The managed Supabase/Docker package and real provider
journeys remain release gates rather than claims of production verification.
